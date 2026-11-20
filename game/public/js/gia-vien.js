// Gia Viên in the browser: drawing a homestead (its ready-made house, the animals wandering their pen, the herbs growing
// in their beds) and its panels (unlock and enter, the house, the farm, the garden). The server decides everything
// (server/gia-vien.js): this only shows and asks. The houses' pieces come from the tile sheets (khoi.png) or are drawn
// with pixelfx (src/fx/home), the farm all pixelfx (src/fx/farm).
import { createFrame, clearFrame, createFx, painterFor } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { ITEMS, HOME } from "/shared/balance.js";
import { KHOI } from "/shared/gia-vien-khoi.js";
import { BLOCKS, ANIMALS, CROPS, LAYOUT, HOUSES, DEFAULT_HOUSE, HomeGrid, cropStage, houseCells, housePrice } from "/shared/gia-vien.js";
import { h, sure } from "./tong-mon.js";

const T = 32;
const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const dur = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}g ${Math.floor((s % 3600) / 60)}p` : s >= 60 ? `${Math.floor(s / 60)}p ${s % 60}s` : `${s}s`;
};

// ---------------------------------------------------------------- pictures: the atlas tiles and pixelfx pieces, ready to blit
const sprites = new Map(); // kind -> { w, h, px (Uint32, ABGR), ox, oy } with (ox, oy) the anchor: the bottom middle of its first cell
let atlas = null;
async function loadAtlas() {
  if (atlas) return atlas;
  const img = new Image();
  img.src = "/gia-vien/khoi.png";
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const cx = cv.getContext("2d");
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, img.width, img.height);
  atlas = { w: img.width, h: img.height, px: new Uint32Array(d.data.buffer) };
  return atlas;
}
/**
 * Ask before something that can't be undone (spending stones): a box over the panel with Huỷ and the action. Resolves
 * true for yes; Huỷ, a click beside the box or Esc is no.
 */
export function confirmBox({ title, text, ok = "Đồng ý", cancel = "Huỷ", pic = null }) {
  return new Promise((done) => {
    const host = document.getElementById("panel")?.parentElement ?? document.body;
    const end = (yes) => {
      removeEventListener("keydown", key, true);
      shade.remove();
      done(yes);
    };
    const key = (e) => {
      if (e.key === "Escape") (e.stopPropagation(), end(false));
      if (e.key === "Enter") (e.stopPropagation(), end(true));
    };
    const box = h("div.cbox", { role: "dialog", "aria-modal": "true" },
      h("h4", { text: title }),
      pic,
      h("p", { text }),
      h("div.cbtns", {},
        h("button.ghost", { type: "button", text: cancel, onclick: () => end(false) }),
        h("button.primary", { type: "button", text: ok, onclick: () => end(true) })));
    const shade = h("div.cshade", { onclick: (e) => e.target === shade && end(false) }, box);
    host.append(shade);
    addEventListener("keydown", key, true);
    box.querySelector(".primary").focus();
  });
}

/** A house's picture (pixels with their alpha, ABGR), loaded once. */
const pics = new Map();
function loadPic(src) {
  if (!pics.has(src))
    pics.set(src, (async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const c = cv.getContext("2d");
      c.drawImage(img, 0, 0);
      return { w: img.width, h: img.height, px: new Uint32Array(c.getImageData(0, 0, img.width, img.height).data.buffer) };
    })());
  return pics.get(src);
}
/** A picture into a Uint32 view, its top left at (x0, y0), blended by its alpha (its soft neon halo included). */
function blitPic(out, VW, VH, pic, x0, y0) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  const ya = Math.max(0, -y0), yb = Math.min(pic.h, VH - y0), xa = Math.max(0, -x0), xb = Math.min(pic.w, VW - x0);
  for (let y = ya; y < yb; y++) {
    const row = y * pic.w, o = (y0 + y) * VW + x0;
    for (let x = xa; x < xb; x++) {
      const c = pic.px[row + x], a = c >>> 24;
      if (!a) continue;
      out[o + x] = a > 247 ? c | 0xff000000 : mixPx(out[o + x], c, a / 255);
    }
  }
}
/** A still pixelfx piece drawn once (t = 0) into pixels, anchored where the effect's own origin is. */
function fxSprite(id, o) {
  const mod = effects[id];
  if (!mod) return null;
  const [w, hh] = mod.meta.size, [ox, oy] = mod.meta.origin;
  const fr = createFrame(w, hh);
  clearFrame(fr);
  const fx = createFx(mod, { ...o, x: ox, y: oy });
  fx.draw(fr);
  return { w, h: hh, px: fr.color.slice(), ox, oy };
}
function darken(s, k) {
  const px = new Uint32Array(s.px.length);
  for (let i = 0; i < px.length; i++) {
    const c = s.px[i];
    if (!(c >>> 24)) continue;
    px[i] = ((c >>> 24) << 24 | (((c >>> 16) & 255) * k) << 16 | (((c >>> 8) & 255) * k) << 8 | ((c & 255) * k)) >>> 0;
  }
  return { ...s, px };
}
/** The picture of a kind (made once): its picture cut from khoi.png, or a still pixelfx piece. */
function spriteOf(kind) {
  if (sprites.has(kind)) return sprites.get(kind);
  const b = BLOCKS[kind];
  let s = null;
  if (b.atlas !== undefined && atlas) {
    // its rect in the sheet, w x h cells, anchored at the bottom middle of its bottom-left cell
    const [ax, ay, w, hh] = KHOI[b.atlas], px = new Uint32Array(w * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) px[y * w + x] = atlas.px[(ay + y) * atlas.w + ax + x];
    s = { w, h: hh, px, ox: T / 2, oy: hh };
  } else if (b.fx && !b.live) s = fxSprite(b.fx, b.o ?? {});
  // walls behind are a shade darker, so what stands in front reads
  if (s && b.layer === "b") s = darken(s, 0.72);
  sprites.set(kind, s);
  return s;
}
/** Blit a sprite into a Uint32 view (VW x VH), its anchor at view pixel (ax, ay). */
function blit(out, VW, VH, s, ax, ay, alpha = false) {
  const x0 = Math.round(ax - s.ox), y0 = Math.round(ay - s.oy);
  for (let y = 0; y < s.h; y++) {
    const vy = y0 + y;
    if (vy < 0 || vy >= VH) continue;
    for (let x = 0; x < s.w; x++) {
      const vx = x0 + x;
      if (vx < 0 || vx >= VW) continue;
      const c = s.px[y * s.w + x];
      if (c >>> 24 < 128) continue;
      out[vy * VW + vx] = alpha ? mixPx(out[vy * VW + vx], c, 0.55) : c | 0xff000000;
    }
  }
}
const mixPx = (a, b, k) => {
  const r = (a & 255) * (1 - k) + (b & 255) * k, g = ((a >>> 8) & 255) * (1 - k) + ((b >>> 8) & 255) * k, bl = ((a >>> 16) & 255) * (1 - k) + ((b >>> 16) & 255) * k;
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0;
};
/** A picture of a whole house (its pieces over a strip of ground), `width` px wide, for the panels. */
export function houseCanvas(id, width = 320) {
  const cells = houseCells(id), cv = document.createElement("canvas"), H = HOUSES[id];
  cv.className = "gvhousepic";
  if (H?.pic) {
    // a house that is one picture: it, over a strip of ground
    cv.width = H.pic.w + 32;
    cv.height = H.pic.h + 8;
    cv.style.width = `${width}px`;
    cv.style.maxWidth = "100%";
    loadPic(H.pic.src).then((pic) => {
      const W = cv.width, Hh = cv.height, img = new ImageData(W, Hh), out = new Uint32Array(img.data.buffer), ground = Hh - (H.pic.h - (LAYOUT.floor * T - H.pic.y)) - 8;
      for (let y = 0; y < Hh; y++) {
        const u = y / Hh, sky = ((0xff << 24) | (Math.round(60 + 80 * u) << 16) | (Math.round(30 + 40 * u) << 8) | Math.round(26 + 30 * u)) >>> 0;
        for (let x = 0; x < W; x++) out[y * W + x] = y >= ground ? (y < ground + 4 ? 0xff3a9a4a : 0xff1e2e44) : sky;
      }
      blitPic(out, W, Hh, pic, 16, 0);
      cv.getContext("2d").putImageData(img, 0, 0);
    }, () => {});
    return cv;
  }
  if (!cells.length) return cv;
  // its extent in cells, a cell of ground under it and a little air round it
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = LAYOUT.floor;
  for (const [, cx, cy, k] of cells) {
    const b = BLOCKS[k];
    x0 = Math.min(x0, cx); x1 = Math.max(x1, cx + (b?.w ?? 1) - 1); y0 = Math.min(y0, cy - (b?.h ?? 1) + 1);
  }
  x0 -= 1; x1 += 1; y0 -= 1;
  const W = (x1 - x0 + 1) * T, Hh = (y1 - y0 + 1) * T;
  cv.width = W;
  cv.height = Hh;
  cv.style.width = `${width}px`;
  cv.style.maxWidth = "100%";
  const draw = () => {
    const img = new ImageData(W, Hh), out = new Uint32Array(img.data.buffer);
    // a dusk sky and a strip of earth with grass
    for (let y = 0; y < Hh; y++) {
      const u = y / Hh, sky = (0xff << 24) | (Math.round(60 + 80 * u) << 16) | (Math.round(40 + 60 * u) << 8) | Math.round(30 + 40 * u);
      for (let x = 0; x < W; x++) out[y * W + x] = y >= Hh - T ? (y < Hh - T + 4 ? 0xff3a9a4a : 0xff1e2e44) : sky >>> 0;
    }
    for (const layer of ["b", "f", "d"])
      for (const [l, cx, cy, k] of cells) {
        if (l !== layer) continue;
        const b = BLOCKS[k];
        const s = b.live ? fxSprite(b.fx, b.o ?? {}) : spriteOf(k);
        if (s) blit(out, W, Hh, s, (cx - x0) * T + 16, (cy - y0 + 1) * T + (b.hang ? 6 : 0));
      }
    const c = cv.getContext("2d");
    c.putImageData(img, 0, 0);
  };
  loadAtlas().then(draw, draw);
  return cv;
}

// ---------------------------------------------------------------- the layer the game draws
/**
 * The homestead as the game draws it. G: { drawFx(fx, layer, x, y, k) }. The game calls onWelcome when it arrives on
 * any map, onHome/onState for the server's messages, paintBg/drawFront/labels each frame, and hit() for a tap on the farm.
 */
export function createHomeLayer(G) {
  let grid = null, base = null, owner = 0, mine = false, st = null, skew = 0;
  const herds = new Map(); // animal id -> { kind, fx, x, dir, walk, until }
  const crops = new Map(); // plot -> { crop, fx }
  const live = new Map(); // "cx,cy" of a live furniture (lantern, furnace) -> fx
  let house = null, pic = null, houseFx = []; // the house drawn as a picture: its picture, its moving lights
  const fixtures = { soil: null, wet: null };
  const L = {
    get active() {
      return !!grid;
    },
    get mine() {
      return mine;
    },
    get state() {
      return st;
    },
    onChange: () => {},
  };
  const serverNow = () => Date.now() + skew;
  L.onWelcome = (mapId) => {
    if (mapId !== "giavien") (grid = null), (st = null), (house = pic = null), (houseFx = []), herds.clear(), crops.clear(), live.clear(), L.onChange();
  };
  /** The house standing here: the grid, and the map people move on (its walls and floors carry them). Returns the map to use. */
  L.onHome = async (m, map) => {
    base = map;
    owner = m.owner;
    mine = !!m.mine;
    grid = new HomeGrid(map).load(houseCells(m.house));
    // a house that is one picture: the picture, and the effects that light it up (each a half: drawn at x + its offset)
    house = HOUSES[m.house] ?? null;
    live.clear();
    pic = house?.pic ? await loadPic(house.pic.src).catch(() => null) : null;
    houseFx = (house?.live ?? []).flatMap((l) => (effects[l.fx] ? l.parts.map((off, part) => ({ fx: createFx(effects[l.fx], { part, seed: owner }), x: house.pic.x + off, y: house.pic.y })) : []));
    await loadAtlas().catch(() => {});
    fixtures.soil = fxSprite("farm/props", { piece: "soil" });
    fixtures.wet = fxSprite("farm/props", { piece: "soil", wet: 1 });
    L.onChange();
    return grid.wrap();
  };
  L.wrap = () => grid?.wrap();
  L.onState = (m) => {
    st = m;
    skew = m.now - Date.now();
    // the animals: keep the ones still here where they are, add the new, drop the gone
    const ids = new Set(m.animals.map((a) => a.id));
    for (const id of herds.keys()) if (!ids.has(id)) herds.delete(id);
    const x0 = (LAYOUT.farm.x0 + 1) * T, x1 = LAYOUT.farm.x1 * T;
    for (const a of m.animals) {
      const A = ANIMALS[a.kind];
      if (!A || herds.has(a.id)) continue;
      const r = (a.id * 9301 + 49297) % 233280 / 233280;
      herds.set(a.id, { kind: a.kind, fx: effects[A.fx] ? createFx(effects[A.fx], { seed: a.id, walk: 0 }) : null, x: x0 + r * (x1 - x0), dir: r > 0.5 ? 1 : -1, walk: false, until: 0 });
    }
    for (const [plot] of crops) if (!m.plots.some((p) => p.plot === plot)) crops.delete(plot);
    for (const p of m.plots) {
      const C = CROPS[p.crop];
      if (C && crops.get(p.plot)?.crop !== p.crop) crops.set(p.plot, { crop: p.crop, fx: effects[C.fx] ? createFx(effects[C.fx], { seed: p.plot + 1, stage: 0 }) : null });
    }
    L.onChange();
  };
  // ---- drawing
  /** Into the background (behind everyone): walls, blocks, still furniture, the soil beds. */
  L.paintBg = (out, VW, VH, camX, camY) => {
    if (!grid) return;
    if (pic) blitPic(out, VW, VH, pic, house.pic.x - camX, house.pic.y - camY);
    const c0 = Math.floor(camX / T) - 2, c1 = Math.ceil((camX + VW) / T) + 2, r0 = Math.floor(camY / T) - 3, r1 = Math.ceil((camY + VH) / T) + 2;
    for (const layer of ["b", "f", "d"])
      for (const [K, kind] of grid[layer]) {
        const [cx, cy] = K.split(",").map(Number);
        if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
        const b = BLOCKS[kind];
        if (b?.live || b?.hidden) continue;
        const s = spriteOf(kind);
        if (s) blit(out, VW, VH, s, cx * T + 16 - camX, (cy + 1) * T - camY);
      }
    LAYOUT.plots.forEach((col, i) => {
      const s = crops.has(i) ? fixtures.wet : fixtures.soil;
      if (s) blit(out, VW, VH, s, col * T + 16 - camX, LAYOUT.floor * T - camY);
    });
  };
  /** In the frame, with the people: live furniture, the herbs, the animals. */
  L.drawFront = (p, now, dt, camX, camY, on) => {
    if (!grid) return;
    // the house's lights, behind everyone
    for (const h of houseFx) {
      h.fx.update(dt);
      if (on(h.x + 240, h.y + 200, 420)) G.drawFx(h.fx, "back", h.x, h.y, 1);
    }
    for (const [K, kind] of grid.d) {
      const b = BLOCKS[kind];
      if (!b.live) continue;
      const [cx, cy] = K.split(",").map(Number), x = cx * T + 16, y = (cy + 1) * T + (b.hang ? 6 : 0);
      if (!on(x, y)) continue;
      let fx = live.get(K);
      if (!fx && effects[b.fx]) live.set(K, (fx = createFx(effects[b.fx], { seed: cx * 31 + cy })));
      if (!fx) continue;
      fx.update(dt);
      G.drawFx(fx, "back", x, y, 1);
      G.drawFx(fx, "front", x, y, 1);
    }
    const tNow = serverNow();
    for (const p0 of st?.plots ?? []) {
      const c = crops.get(p0.plot), x = LAYOUT.plots[p0.plot] * T + 16, y = LAYOUT.floor * T - 3;
      if (!c?.fx || !on(x, y)) continue;
      c.fx.options.stage = cropStage(p0.plantedAt, p0.readyAt, tNow);
      c.fx.update(dt);
      G.drawFx(c.fx, "back", x, y, 1.5);
      G.drawFx(c.fx, "front", x, y, 1.5);
    }
    // the animals wander their pen: stand a while, walk a while, turn at the fences
    const x0 = (LAYOUT.farm.x0 + 1) * T, x1 = LAYOUT.farm.x1 * T;
    for (const [id, a] of herds) {
      const A = ANIMALS[a.kind];
      if (now > a.until) {
        a.walk = !a.walk && Math.random() < 0.6;
        a.until = now + (a.walk ? 1 + Math.random() * 2.5 : 2 + Math.random() * 4);
        if (a.walk && Math.random() < 0.4) a.dir = -a.dir;
      }
      if (a.walk) {
        a.x += a.dir * (a.kind === "bo" ? 14 : a.kind === "lon" ? 18 : 22) * dt;
        if (a.x < x0 || a.x > x1) (a.dir = a.x < x0 ? 1 : -1), (a.x = Math.max(x0, Math.min(x1, a.x)));
      }
      const y = LAYOUT.floor * T;
      if (!a.fx || !on(a.x, y)) continue;
      a.fx.options.walk = a.walk ? 1 : 0;
      a.fx.options.flip = a.dir < 0;
      a.fx.update(dt);
      G.drawFx(a.fx, "back", a.x, y, A.scale ?? 1.3);
      G.drawFx(a.fx, "front", a.x, y, A.scale ?? 1.3);
    }
  };
  /** Words over things: the signs, an animal ready or hungry, a bed's herb and time left. */
  L.labels = (c, k, camX, camY, W, H, now) => {
    if (!base) return;
    const txt = (s, x, y, col, fs, w = 700) => {
      c.font = `${w} ${fs}px system-ui, sans-serif`;
      c.lineWidth = Math.max(2, fs / 4);
      c.strokeStyle = "rgba(0,0,0,.85)";
      c.strokeText(s, x, y);
      c.fillStyle = col;
      c.fillText(s, x, y);
    };
    const fs = Math.max(10, Math.round(5 * k));
    // the zone names, written on their signboards
    for (const [x, row, s] of base.def.signs ?? []) txt(s, (x * T - camX) * k, (row * T - 27 - camY) * k, "#ffe9c0", Math.max(10, Math.round(5.2 * k)), 800);
    if (!grid) return;
    const tNow = serverNow();
    for (const a0 of st?.animals ?? []) {
      const a = herds.get(a0.id);
      if (!a) continue;
      const top = (LAYOUT.floor * T - (a0.kind === "bo" ? 62 : a0.kind === "lon" ? 40 : 40) - camY) * k, x = (a.x - camX) * k;
      if (a0.readyAt && tNow >= a0.readyAt) txt(a0.kind === "bo" ? "🥛 Thu" : a0.kind === "lon" ? "🍖 Thu" : "🥚 Thu", x, top, "#ffe08a", fs);
      else if (!a0.readyAt) txt("Đói", x, top, "#c8bcd8", fs, 600);
    }
    for (const p0 of st?.plots ?? []) {
      const x = (LAYOUT.plots[p0.plot] * T + 16 - camX) * k, y = (LAYOUT.floor * T + 14 - camY) * k, left = p0.readyAt - tNow;
      txt(left <= 0 ? `${CROPS[p0.crop]?.name} · Chín` : `${CROPS[p0.crop]?.name} · ${dur(left)}`, x, y, left <= 0 ? "#a8ffb0" : "#e8e0ff", Math.max(9, Math.round(4.2 * k)), 600);
    }
  };

  /** A tap on the farm (not building): which animal or bed it was. */
  L.hit = (wx, wy) => {
    if (!grid) return null;
    for (const [id, a] of herds) if (Math.abs(a.x - wx) < 30 && wy > LAYOUT.floor * T - 64 && wy < LAYOUT.floor * T + 6) return { type: "animal", id };
    const i = LAYOUT.plots.findIndex((col) => wx >= col * T - 8 && wx < col * T + T + 8);
    if (i >= 0 && wy > LAYOUT.floor * T - 60 && wy < LAYOUT.floor * T + 8) return { type: "plot", plot: i };
    return null;
  };
  return L;
}

// ---------------------------------------------------------------- the panels and the bars
export function initHomeUI({ call, uuid, panel, flash, game }) {
  let view = null;
  const layer = () => game()?.home;
  const isOpen = (cls) => !document.getElementById("panel").hidden && document.querySelector(`#panel .${cls}`);
  async function act(path, body, okMsg, btn) {
    if (btn) btn.disabled = true;
    try {
      const out = await call(`/home${path}`, { method: "POST", body });
      if (out.view) view = out.view;
      if (okMsg) flash(typeof okMsg === "function" ? okMsg(out) : okMsg);
      redraw();
      return out;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
    }
  }
  const got = (o) => Object.entries(o.got ?? {}).map(([k, n]) => `${ITEMS[k]?.name ?? k} ×${n}`).join(", ");
  const st = () => layer()?.state ?? view;

  // ---- 🏡: unlock, enter, leave
  async function open() {
    try {
      view = await call("/home");
    } catch (e) {
      return flash(e.message);
    }
    homePanel(true);
  }
  function homePanel(first = false) {
    const wrap = h("div.gvp.home");
    const inside = !!layer()?.active;
    if (!view.unlocked) {
      wrap.append(
        h("div.gvhero", {}, h("h4", { text: "Gia Viên của riêng đạo hữu" }),
          h("p", { text: "Một mảnh đất riêng, chỉ mình đạo hữu bước vào. Chia ba khu:" }),
          h("ul", {},
            h("li", {}, h("b", { text: "Nhà Ở: " }), `tặng kèm ${HOUSES.co_trach.name}, ngôi nhà gỗ hai tầng mái ngói đỏ: lò luyện đan, bàn trà, kệ sách, phòng ngủ trên lầu. Vào ở được ngay.`),
            h("li", {}, h("b", { text: "Nông Trại: " }), "nuôi gà, vịt, lợn, bò. Cho ăn, đợi một lúc là có trứng, sữa, mỡ."),
            h("li", {}, h("b", { text: "Vườn Dược: " }), "8 luống gieo Linh Thảo, Kim Ngân Hoa, Nhân Sâm, Linh Chi. Chín thì thu hoạch."))),
        houseCanvas("co_trach", 300),
        h("p.dim", { text: "Sản phẩm thu được cất trong túi đồ, dùng cho luyện đan và chế tác sẽ ra mắt sau." }),
        h("button.primary.big", { type: "button", text: `Mở khoá Gia Viên (${fmt(HOME.unlockCost)} linh thạch)`, onclick: (e) => act("/unlock", {}, "Gia Viên đã mở khoá!", e.target) }));
    } else {
      const ready = (view.animals ?? []).filter((a) => a.ready).length, ripe = (view.plots ?? []).filter((p) => p.ripe).length;
      wrap.append(
        h("div.gvstats", {},
          stat("🐔", `${view.animals.length}/${HOME.maxAnimals}`, "vật nuôi"), stat("🥚", ready, "đang chờ thu"),
          stat("🌿", `${view.plots.length}/${LAYOUT.plots.length}`, "luống có cây"), stat("✨", ripe, "luống đã chín")),
        inside
          ? h("div.gvrow", {},
            h("button.ghost", { type: "button", text: "🏠 Nhà Ở", onclick: () => housePanel() }),
            h("button.ghost", { type: "button", text: "🐔 Nông Trại", onclick: () => farmPanel() }),
            h("button.ghost", { type: "button", text: "🌿 Vườn Dược", onclick: () => gardenPanel() }),
            h("button.primary", { type: "button", text: "Rời Gia Viên", onclick: (e) => act("/leave", {}, null, e.target).then(closePanel) }))
          : h("div.gvrow", {},
            h("button.ghost", { type: "button", text: "🏠 Nhà Ở", onclick: () => housePanel() }),
            h("button.primary.big", { type: "button", text: "Vào Gia Viên", onclick: (e) => act("/enter", {}, null, e.target).then(closePanel) })));
    }
    show("Gia Viên", wrap, first);
  }
  const stat = (ic, v, l) => h("div.gvstat", {}, h("span.ic", { text: ic }), h("b", { text: String(v) }), h("small", { text: l }));
  const closePanel = () => (document.getElementById("panel").hidden = true);
  function show(title, wrap, first) {
    // a fresh panel unless one of ours is already open (then just its contents change, keeping its place)
    if (first || document.getElementById("panel").hidden || !document.querySelector("#panel .gvp")) panel(title, wrap);
    else {
      document.getElementById("panelTitle").textContent = title;
      document.getElementById("panelBody").replaceChildren(wrap);
    }
  }
  function redraw() {
    if (isOpen("gvp.home")) homePanel();
    else if (isOpen("gvp.farm")) farmPanel();
    else if (isOpen("gvp.garden")) gardenPanel();
    else if (isOpen("gvp.house")) housePanel(housePage);
  }

  // ---- 🐔 the farm
  function farmPanel() {
    const s = st() ?? { animals: [] }, tNow = Date.now() + skewOf(s);
    const wrap = h("div.gvp.farm");
    const hungry = s.animals.filter((a) => !a.readyAt), ready = s.animals.filter((a) => a.readyAt && tNow >= a.readyAt);
    const feedAll = hungry.reduce((n, a) => n + (ANIMALS[a.kind]?.feed ?? 0), 0);
    wrap.append(h("div.gvrow", {},
      h("button.primary", { type: "button", text: `Thu tất cả (${ready.length})`, disabled: !ready.length, onclick: (e) => act("/animal/collect", { ids: "all" }, (o) => `Thu được: ${got(o)}`, e.target) }),
      h("button.ghost", { type: "button", text: `Cho ăn tất cả (${hungry.length}) · ${fmt(feedAll)} linh thạch`, disabled: !hungry.length, onclick: (e) => act("/animal/feed", { ids: "all" }, (o) => `Đã cho ${o.fed} con ăn.`, e.target) })));
    const list = h("div.gvlist");
    if (!s.animals.length) list.append(h("p.dim", { text: "Chưa có vật nuôi nào. Mua ở dưới." }));
    for (const a of s.animals) {
      const A = ANIMALS[a.kind], ok = a.readyAt && tNow >= a.readyAt;
      const status = !a.readyAt ? "Đói: cho ăn để bắt đầu" : ok ? `Có ${ITEMS[A.product]?.name ?? "sản phẩm"}!` : `Còn ${dur(a.readyAt - tNow)}`;
      list.append(h("div.gvitem", { className: ok ? "ready" : !a.readyAt ? "hungry" : "" },
        animalIcon(a.kind),
        h("div.gvmain", {}, h("b", { text: A.name }), h("small", { text: status }), a.readyAt && !ok ? bar(1 - (a.readyAt - tNow) / (A.cycle * 1000)) : null),
        h("div.gvacts", {},
          !a.readyAt ? h("button.ghost", { type: "button", text: `Cho ăn (${A.feed})`, onclick: (e) => act("/animal/feed", { ids: [a.id] }, `${A.name} đã ăn no.`, e.target) }) : null,
          ok ? h("button.primary", { type: "button", text: "Thu", onclick: (e) => act("/animal/collect", { ids: [a.id] }, (o) => `Thu được: ${got(o)}`, e.target) }) : null,
          sure("Thả", "Thả thật?", (b) => act("/animal/release", { id: a.id }, `Đã thả ${A.name}.`, b), "ghost small"))));
    }
    wrap.append(list, h("h4", { text: `Mua vật nuôi (${s.animals.length}/${HOME.maxAnimals})` }));
    const shop = h("div.gvshop");
    for (const [k, A] of Object.entries(ANIMALS))
      shop.append(h("div.gvbuy", {}, animalIcon(k),
        h("div.gvmain", {}, h("b", { text: `${A.name} · ${fmt(A.price)} linh thạch` }), h("small", { text: `Cho ăn ${A.feed}, sau ${dur(A.cycle * 1000)} có 1 ${ITEMS[A.product]?.name ?? A.product}` })),
        h("button.primary", { type: "button", text: "Mua", disabled: s.animals.length >= HOME.maxAnimals, onclick: (e) => act("/animal/buy", { kind: k, requestId: uuid() }, `Đã mua ${A.name}.`, e.target) })));
    wrap.append(shop);
    show("Nông Trại", wrap);
  }
  const skewOf = (s) => (s?.now && s._at ? s.now - s._at : 0);
  const bar = (u) => h("i.gvbar", {}, h("u", { style: `width:${Math.max(0, Math.min(100, u * 100))}%` }));
  const iconFx = new Map();
  function animalIcon(kind) {
    const A = ANIMALS[kind] ?? CROPS[kind];
    const cv = document.createElement("canvas");
    cv.width = cv.height = 44;
    cv.className = "gvic";
    const mod = effects[A?.fx];
    if (mod) {
      const key = kind + (CROPS[kind] ? ":3" : "");
      let s = iconFx.get(key);
      if (!s) iconFx.set(key, (s = fxSprite(A.fx, CROPS[kind] ? { stage: 3 } : {})));
      if (s) {
        const img = new ImageData(s.w, s.h);
        new Uint32Array(img.data.buffer).set(s.px);
        const tmp = document.createElement("canvas");
        tmp.width = s.w;
        tmp.height = s.h;
        tmp.getContext("2d").putImageData(img, 0, 0);
        const c = cv.getContext("2d"), k = Math.min(44 / s.w, 44 / s.h) * 1.5;
        c.imageSmoothingEnabled = false;
        c.drawImage(tmp, 22 - s.ox * k, 40 - s.oy * k, s.w * k, s.h * k);
      }
    }
    return cv;
  }

  // ---- 🌿 the garden
  function gardenPanel(focus = -1) {
    const s = st() ?? { plots: [] }, tNow = Date.now() + skewOf(s);
    const wrap = h("div.gvp.garden");
    const ripe = s.plots.filter((p) => tNow >= p.readyAt);
    wrap.append(h("div.gvrow", {}, h("button.primary", { type: "button", text: `Thu hoạch tất cả (${ripe.length})`, disabled: !ripe.length, onclick: (e) => act("/harvest", { plot: "all" }, (o) => `Thu hoạch: ${got(o)}`, e.target) })));
    const beds = h("div.gvbeds");
    LAYOUT.plots.forEach((_, i) => {
      const p = s.plots.find((x) => x.plot === i), C = p && CROPS[p.crop];
      const card = h("div.gvbed", { className: `${p ? (tNow >= p.readyAt ? "ripe" : "growing") : "empty"}${i === focus ? " focus" : ""}` }, h("small.no", { text: `Luống ${i + 1}` }));
      if (!p) {
        card.append(h("p.dim", { text: "Trống" }));
        const sel = h("div.seeds", {}, ...Object.entries(CROPS).map(([k, c]) => h("button.ghost", { type: "button", title: `${c.name}: ${fmt(c.seed)} linh thạch, ${dur(c.grow * 1000)}, được ${c.min}-${c.max}`, onclick: (e) => act("/plant", { plot: i, crop: k }, `Đã gieo ${c.name}.`, e.target) }, animalIcon(k), h("span", { text: c.name }), h("small", { text: `${fmt(c.seed)} · ${dur(c.grow * 1000)}` }))));
        card.append(sel);
      } else {
        const left = p.readyAt - tNow;
        card.append(animalIcon(p.crop), h("b", { text: C.name }), h("small", { text: left <= 0 ? "Đã chín" : `Còn ${dur(left)}` }), bar(1 - left / (p.readyAt - p.plantedAt)),
          h("div.gvacts", {},
            left <= 0 ? h("button.primary", { type: "button", text: "Thu hoạch", onclick: (e) => act("/harvest", { plot: i }, (o) => `Thu hoạch: ${got(o)}`, e.target) }) : null,
            sure("Nhổ bỏ", "Nhổ thật?", (b) => act("/clear", { plot: i }, "Đã nhổ bỏ.", b), "ghost small")));
      }
      beds.append(card);
    });
    wrap.append(beds, h("p.dim", { text: "Hạt giống mua khi gieo. Cây tự lớn kể cả khi đạo hữu không ở Gia Viên." }));
    show("Vườn Dược", wrap);
  }

  // ---- 🏠 the house: the one this home has, and the ready-made houses (more to be bought later)
  // one house a page: ‹ › (or the dots, or swiping) to look through them; it opens on the one lived in. Under the
  // picture only its name, its price and a small button; buying asks first.
  let housePage = -1;
  function housePanel(page = housePage) {
    const v = st() ?? view ?? {}, cur = v.house, owned = new Set(v.houses ?? []), ids = Object.keys(HOUSES);
    if (page < 0) page = Math.max(0, ids.indexOf(cur));
    housePage = page = (page + ids.length) % ids.length;
    const id = ids[page], H = HOUSES[id], price = housePrice(id, HOME.prices), has = id === cur, own = owned.has(id) || id === DEFAULT_HOUSE;
    const go = (d) => housePanel(page + d);
    const btn = has
      ? h("span.tag", { text: "Đang ở" })
      : own
        ? h("button.primary.small", { type: "button", text: "Dọn vào ở", onclick: (e) => act("/house/use", { house: id }, `Đã dọn vào ${H.name}.`, e.target) })
        : price
          ? h("button.primary.small", { type: "button", text: "Mua", onclick: async (e) => {
            const b = e.currentTarget;
            if (await confirmBox({ title: "Mua nhà", text: `Mua ${H.name} với giá ${fmt(price)} linh thạch? Mua xong sẽ dọn vào ở ngay.`, ok: `Mua · ${fmt(price)}`, pic: houseCanvas(id, 260) }))
              act("/house/buy", { house: id, requestId: uuid() }, `Đã mua ${H.name}!`, b);
          } })
          : null;
    const arrow = (d) => h("button.gvarrow", { type: "button", "aria-label": d < 0 ? "Nhà trước" : "Nhà sau", disabled: ids.length < 2, onclick: () => go(d) }, svgArrow(d));
    const pic = h("div.gvhpic", {}, houseCanvas(id, 520));
    // a swipe on the picture turns the page too
    let sx = null;
    pic.addEventListener("pointerdown", (e) => (sx = e.clientX));
    pic.addEventListener("pointerup", (e) => {
      if (sx !== null && Math.abs(e.clientX - sx) > 40) go(e.clientX < sx ? 1 : -1);
      sx = null;
    });
    const priceText = has || own ? (id === DEFAULT_HOUSE ? "Tặng kèm" : "Đã có") : price ? `${fmt(price)} linh thạch` : "Không bán";
    const wrap = h("div.gvp.house", {},
      h("div.gvpager", {}, arrow(-1), pic, arrow(1)),
      h("div.gvdots", {}, ...ids.map((k, n) => h("button", { type: "button", className: `${n === page ? "on" : ""}${k === cur ? " home" : ""}`, title: HOUSES[k].name, "aria-label": HOUSES[k].name, onclick: () => housePanel(n) }))),
      h("div.gvhbar", { className: has ? "on" : "" }, h("b", { text: H.name }), h("span.price", { text: priceText }), btn));
    show("Nhà Ở", wrap);
  }
  const svgArrow = (d) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.innerHTML = d < 0 ? '<path d="M15 4l-8 8 8 8"/>' : '<path d="M9 4l8 8-8 8"/>';
    return s;
  };

  // the game tells us when the farm changed (the server's message) or an animal / bed was tapped
  function onState() {
    const s = layer()?.state;
    if (s) s._at = Date.now();
    redraw();
  }
  function onTap(hit) {
    if (hit.type === "animal") farmPanel();
    else gardenPanel(hit.plot);
  }
  // countdowns tick in an open farm or garden panel
  setInterval(() => (isOpen("gvp.farm") ? farmPanel() : isOpen("gvp.garden") && !document.activeElement?.closest?.(".gvp") ? gardenPanel() : null), 1000);
  /** The shortcuts over the game while in one's own Gia Viên: the house, farm, garden, leave. */
  function hud() {
    const el = document.getElementById("homebar"), L = layer();
    if (!el) return;
    const show = !!(L?.active && L.mine);
    el.hidden = !show;
    if (!show || el.childElementCount) return;
    el.append(
      h("button", { type: "button", title: "Nhà Ở", onclick: () => housePanel() }, h("span", { text: "🏠" }), h("small", { text: "Nhà Ở" })),
      h("button", { type: "button", title: "Nông Trại", onclick: () => farmPanel() }, h("span", { text: "🐔" }), h("small", { text: "Nông Trại" })),
      h("button", { type: "button", title: "Vườn Dược", onclick: () => gardenPanel() }, h("span", { text: "🌿" }), h("small", { text: "Vườn" })),
      h("button", { type: "button", title: "Rời Gia Viên", onclick: (e) => act("/leave", {}, null, e.currentTarget) }, h("span", { text: "🚪" }), h("small", { text: "Rời" })));
  }
  return { open, housePanel, farmPanel, gardenPanel, onState, onTap, hud };
}
