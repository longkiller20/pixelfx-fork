// Gia Viên in the browser: drawing a homestead (what is built, the animals wandering their pen, the herbs growing in
// their beds) and its panels (unlock and enter, the build bar, the farm, the garden). The server decides everything
// (server/gia-vien.js, World.build): this only shows, previews with the same rules (shared/gia-vien.js HomeGrid) and asks.
// Every picture is pixelfx (src/fx/farm, src/fx/home) except the building blocks cut from the tile sheets (khoi.png).
import { createFrame, clearFrame, createFx, painterFor, hex } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { ITEMS, HOME } from "/shared/balance.js";
import { KHOI } from "/shared/gia-vien-khoi.js";
import { BLOCKS, BLOCK_GROUPS, ANIMALS, CROPS, LAYOUT, HomeGrid, cropStage, cellsOf } from "/shared/gia-vien.js";
import { fits } from "/shared/physics.js";
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
/** A small canvas of a kind's picture, for the build bar and the panels. */
export function iconCanvas(kind, size = 40) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  cv.className = "gvic";
  const draw = () => {
    const s = spriteOf(kind);
    if (!s) return;
    // fit its drawn pixels into the square, crisp
    let x0 = s.w, y0 = s.h, x1 = 0, y1 = 0;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.px[y * s.w + x] >>> 24 > 128) (x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y));
    if (x1 < x0) return;
    const w = x1 - x0 + 1, hh = y1 - y0 + 1, img = new ImageData(w, hh), v = new Uint32Array(img.data.buffer);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) v[y * w + x] = s.px[(y0 + y) * s.w + x0 + x];
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = hh;
    tmp.getContext("2d").putImageData(img, 0, 0);
    const k = Math.max(1, Math.floor(Math.min(size / w, size / hh))) || size / Math.max(w, hh);
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, (size - w * k) / 2, (size - hh * k) / 2, w * k, hh * k);
  };
  loadAtlas().then(draw, draw);
  return cv;
}

// ---------------------------------------------------------------- the layer the game draws
/**
 * The homestead as the game draws it. G: { send(obj), drawFx(fx, layer, x, y, k), toast(m) }. The game calls onWelcome
 * when it arrives on any map, onHome/onState/onBlk/onBlkErr for the server's messages, and paintBg/drawFront/labels each
 * frame, pointer() for the mouse or a finger while building, and hit() for a tap on the farm.
 */
export function createHomeLayer(G) {
  let grid = null, base = null, owner = 0, mine = false, st = null, skew = 0;
  const herds = new Map(); // animal id -> { kind, fx, x, dir, walk, until }
  const crops = new Map(); // plot -> { crop, fx }
  const live = new Map(); // "cx,cy" of a live furniture (lantern, furnace) -> fx
  const fixtures = { soil: null, wet: null };
  const L = {
    build: { on: false, kind: "go", erase: false, hover: null, down: false, lastAt: 0, lastCell: "" },
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
    if (mapId !== "giavien") (grid = null), (st = null), (L.build.on = false), herds.clear(), crops.clear(), live.clear(), L.onChange();
  };
  /** Everything built here: the grid, and the map people move on (blocks collide). Returns the map to use. */
  L.onHome = async (m, map) => {
    base = map;
    owner = m.owner;
    mine = !!m.mine;
    grid = new HomeGrid(map).load(m.blocks);
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
  L.onBlk = (m) => {
    if (!grid) return;
    if (m.k) grid.set(m.l, m.x, m.y, m.k);
    else grid.del(m.l, m.x, m.y);
    live.delete(`${m.x},${m.y}`);
    G.mapChanged?.(grid.wrap());
    L.onChange();
  };
  L.onBlkErr = (m) => G.toast(m.m);

  // ---- drawing
  /** Into the background (behind everyone): walls, blocks, still furniture, the soil beds. */
  L.paintBg = (out, VW, VH, camX, camY) => {
    if (!grid) return;
    const c0 = Math.floor(camX / T) - 2, c1 = Math.ceil((camX + VW) / T) + 2, r0 = Math.floor(camY / T) - 3, r1 = Math.ceil((camY + VH) / T) + 2;
    for (const layer of ["b", "f", "d"])
      for (const [K, kind] of grid[layer]) {
        const [cx, cy] = K.split(",").map(Number);
        if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
        const b = BLOCKS[kind];
        if (b?.live) continue;
        const s = spriteOf(kind);
        if (s) blit(out, VW, VH, s, cx * T + 16 - camX, (cy + 1) * T - camY);
      }
    LAYOUT.plots.forEach((col, i) => {
      const s = crops.has(i) ? fixtures.wet : fixtures.soil;
      if (s) blit(out, VW, VH, s, col * T + 16 - camX, LAYOUT.floor * T - camY);
    });
  };
  /** In the frame, with the people: live furniture, the herbs, the animals, and the build preview. */
  L.drawFront = (p, now, dt, camX, camY, on) => {
    if (!grid) return;
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
    // the preview while building: the piece where it would go, framed green (it can) or red (it can't)
    const B = L.build;
    if (B.on && B.hover && mine) {
      const [cx, cy] = B.hover, ok = !preview(cx, cy);
      const kind = B.erase ? null : B.kind, cells = kind ? (BLOCKS[kind].layer === "d" ? cellsOf(kind, cx, cy) : [[cx, cy]]) : [[cx, cy]];
      p.place(0, 0, false);
      p.fade = 1;
      p.lightK = 1;
      if (kind) {
        const s = spriteOf(kind);
        if (s) {
          const ax = cx * T + 16 - camX, ay = (cy + 1) * T - camY;
          for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
            const c = s.px[y * s.w + x];
            if (c >>> 24 > 128) p.blend(ax - s.ox + x, ay - s.oy + y, c, 0.55);
          }
        }
      }
      const col = hex(B.erase ? (ok ? "#ff7a5a" : "#7a6a6a") : ok ? "#7ff0a0" : "#ff5a5a");
      for (const [x, y] of cells) {
        const X = x * T - camX, Y = y * T - camY;
        for (let i = 0; i < T; i++) {
          p.blend(X + i, Y, col, 0.9); p.blend(X + i, Y + T - 1, col, 0.9);
          p.blend(X, Y + i, col, 0.9); p.blend(X + T - 1, Y + i, col, 0.9);
        }
      }
      if (B.erase && ok) for (let i = 4; i < T - 4; i++) (p.blend(cx * T - camX + i, cy * T - camY + i, col, 0.9), p.blend(cx * T - camX + T - 1 - i, cy * T - camY + i, col, 0.9));
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

  // ---- building by hand
  const bodies = () => G.bodies?.() ?? [];
  function target(cx, cy) {
    // what taking at a cell takes: furniture first, then the block, then the wall
    if (grid.dCover(cx, cy)) return "d";
    if (grid.f.has(HomeGrid.key(cx, cy))) return "f";
    if (grid.b.has(HomeGrid.key(cx, cy))) return "b";
    return null;
  }
  /** Why the current tool can't act at a cell (null: it can). */
  function preview(cx, cy) {
    const B = L.build;
    if (B.erase) {
      const l = target(cx, cy);
      if (!l) return "Ô này không có gì.";
      const at = l === "d" ? grid.dCover(cx, cy) : [cx, cy];
      return grid.canTake(l, at[0], at[1]);
    }
    if (!(st?.stock?.[B.kind] > 0)) return "Hết vật liệu.";
    return grid.canPut(B.kind, cx, cy, bodies(), fits);
  }
  L.preview = preview;
  /** The mouse or a finger over the world while building (wx, wy world px): show the preview; press to act. */
  L.pointer = (wx, wy, kind) => {
    const B = L.build;
    if (!B.on || !grid || !mine) return false;
    const cx = Math.floor(wx / T), cy = Math.floor(wy / T);
    B.hover = [cx, cy];
    if (kind === "down") B.down = true;
    if (kind === "up") B.down = false;
    if ((kind === "down" || (kind === "move" && B.down)) && `${cx},${cy}` !== B.lastCell && performance.now() - B.lastAt > 90) {
      B.lastCell = `${cx},${cy}`;
      B.lastAt = performance.now();
      const why = preview(cx, cy);
      if (why) {
        if (kind === "down") G.toast(why);
        return true;
      }
      const c = Math.random().toString(36).slice(2, 8);
      if (B.erase) {
        const l = target(cx, cy);
        G.send({ t: "build", op: "del", l, x: cx, y: cy, c });
      } else {
        G.send({ t: "build", op: "put", l: BLOCKS[B.kind].layer, x: cx, y: cy, k: B.kind, c });
        // counted down at once so a quick drag doesn't spend stock it hasn't got; the server's word follows
        st.stock[B.kind] = (st.stock[B.kind] ?? 1) - 1;
        L.onChange();
      }
    }
    if (kind === "up") B.lastCell = "";
    return true;
  };
  /** A tap on the farm (not building): which animal or bed it was. */
  L.hit = (wx, wy) => {
    if (!grid || L.build.on) return null;
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
            h("li", {}, h("b", { text: "Nhà Ở: " }), "tự tay xây nhà từng ô như game đi ngang: khối, mái ngói, vách, cửa, cửa sổ, bàn, giường, đèn lồng, lò luyện đan... Vật liệu mua bằng linh thạch."),
            h("li", {}, h("b", { text: "Nông Trại: " }), "nuôi gà, vịt, lợn, bò. Cho ăn, đợi một lúc là có trứng, sữa, mỡ."),
            h("li", {}, h("b", { text: "Vườn Dược: " }), "8 luống gieo Linh Thảo, Kim Ngân Hoa, Nhân Sâm, Linh Chi. Chín thì thu hoạch."))),
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
            h("button.ghost", { type: "button", text: "🔨 Xây dựng", onclick: () => (closePanel(), startBuild()) }),
            h("button.ghost", { type: "button", text: "🐔 Nông Trại", onclick: () => farmPanel() }),
            h("button.ghost", { type: "button", text: "🌿 Vườn Dược", onclick: () => gardenPanel() }),
            h("button.primary", { type: "button", text: "Rời Gia Viên", onclick: (e) => act("/leave", {}, null, e.target).then(closePanel) }))
          : h("button.primary.big", { type: "button", text: "Vào Gia Viên", onclick: (e) => act("/enter", {}, null, e.target).then(closePanel) }));
    }
    show("Gia Viên", wrap, first);
  }
  const stat = (ic, v, l) => h("div.gvstat", {}, h("span.ic", { text: ic }), h("b", { text: String(v) }), h("small", { text: l }));
  const closePanel = () => (document.getElementById("panel").hidden = true);
  function show(title, wrap, first) {
    if (first || !document.querySelector("#panel .gvp")) panel(title, wrap);
    else {
      document.getElementById("panelTitle").textContent = title;
      document.getElementById("panelBody").replaceChildren(wrap);
    }
  }
  function redraw() {
    if (isOpen("gvp.home")) homePanel();
    else if (isOpen("gvp.farm")) farmPanel();
    else if (isOpen("gvp.garden")) gardenPanel();
    else if (isOpen("gvp.shop")) shopPanel(shopKind);
    drawBar();
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

  // ---- 🔨 building: a bar of materials at the bottom, the tool, buying more
  let group = "khoi", shopKind = null;
  const barEl = () => document.getElementById("buildbar");
  function startBuild() {
    const L = layer();
    if (!L?.active || !L.mine) return flash("Chỉ xây được trong Gia Viên của mình.");
    L.build.on = true;
    document.body.classList.add("building");
    drawBar();
  }
  function stopBuild() {
    const L = layer();
    if (L) (L.build.on = false), (L.build.hover = null);
    document.body.classList.remove("building");
    drawBar();
  }
  function drawBar() {
    const el = barEl(), L = layer();
    if (!el) return;
    el.hidden = !L?.build.on;
    if (el.hidden) return;
    const stock = L.state?.stock ?? {};
    el.replaceChildren(
      h("div.bbtop", {},
        h("div.bbtabs", {}, ...Object.entries(BLOCK_GROUPS).map(([g, n]) => h("button", { type: "button", text: n, className: g === group ? "on" : "", onclick: () => ((group = g), drawBar()) }))),
        h("div.bbtools", {},
          h("button", { type: "button", text: "✋ Đặt", className: L.build.erase ? "" : "on", onclick: () => ((L.build.erase = false), drawBar()) }),
          h("button", { type: "button", text: "⛏ Phá", className: L.build.erase ? "on" : "", onclick: () => ((L.build.erase = true), drawBar()) }),
          h("button.done", { type: "button", text: "Xong", onclick: stopBuild }))),
      h("div.bbitems", {}, ...Object.entries(BLOCKS).filter(([, b]) => b.group === group).map(([k, b]) => {
        const n = stock[k] ?? 0;
        return h("button.bbit", {
          type: "button", title: `${b.name} · ${fmt(b.price)} linh thạch`, className: `${L.build.kind === k && !L.build.erase ? "on" : ""}${n ? "" : " empty"}`,
          onclick: () => {
            L.build.kind = k;
            L.build.erase = false;
            if (!n) shopPanel(k);
            drawBar();
          },
        }, iconCanvas(k, 34), h("span.nm", { text: b.name }), h("span.qty", { text: n ? `×${fmt(n)}` : "Mua" }));
      })),
      h("div.bbhint", { text: matchMedia("(pointer: fine)").matches ? "Chuột trái: đặt (giữ và kéo để đặt liền). Chuột phải: phá. Nhấn vào món hết hàng để mua." : "Chạm vào ô để đặt hoặc phá. Nhấn vào món hết hàng để mua." }),
    );
  }
  function shopPanel(kind) {
    shopKind = kind;
    const b = BLOCKS[kind];
    if (!b) return;
    const n = layer()?.state?.stock?.[kind] ?? 0;
    const qty = h("input", { type: "number", min: 1, max: HOME.buyMax, value: b.layer === "d" ? 1 : 20, inputMode: "numeric" });
    const total = h("b");
    const sync = () => (total.textContent = `${fmt(b.price * Math.max(0, Math.floor(Number(qty.value) || 0)))} linh thạch`);
    qty.addEventListener("input", sync);
    qty.addEventListener("keydown", (e) => e.stopPropagation());
    sync();
    const wrap = h("div.gvp.shop", {},
      h("div.gvbuyhead", {}, iconCanvas(kind, 64), h("div", {}, h("h4", { text: b.name }), h("small", { text: `${fmt(b.price)} linh thạch mỗi cái · đang có ${fmt(n)}` }),
        h("small", { text: b.layer === "f" ? (b.solid ? "Khối đặc: chắn đường, đứng lên được." : "Sàn: đứng lên được, nhảy xuyên từ dưới lên.") : b.layer === "b" ? "Vách phía sau: trang trí, không chắn đường." : b.wall ? "Treo lên vách." : b.hang ? "Treo dưới khối." : "Đặt trên sàn." }))),
      h("div.gvrow", {}, ...[1, 10, 50, 100].map((v) => h("button.ghost", { type: "button", text: `×${v}`, onclick: () => ((qty.value = v), sync()) })), qty),
      h("div.gvrow", {}, h("span", { text: "Tổng: " }), total,
        h("button.primary", { type: "button", text: "Mua", onclick: (e) => act("/buy", { kind, qty: Math.floor(Number(qty.value)), requestId: uuid() }, `Đã mua ${qty.value} ${b.name}.`, e.target) })));
    show("Mua vật liệu", wrap, !document.querySelector("#panel .gvp"));
  }

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
  /** The shortcuts over the game while in one's own Gia Viên: build, farm, garden, leave. */
  function hud() {
    const el = document.getElementById("homebar"), L = layer();
    if (!el) return;
    const show = !!(L?.active && L.mine);
    el.hidden = !show;
    if (!show) {
      if (document.body.classList.contains("building")) stopBuild();
      return;
    }
    if (el.childElementCount) return drawBar();
    el.append(
      h("button", { type: "button", title: "Xây dựng", onclick: () => (L.build.on ? stopBuild() : startBuild()) }, h("span", { text: "🔨" }), h("small", { text: "Xây" })),
      h("button", { type: "button", title: "Nông Trại", onclick: () => farmPanel() }, h("span", { text: "🐔" }), h("small", { text: "Nông Trại" })),
      h("button", { type: "button", title: "Vườn Dược", onclick: () => gardenPanel() }, h("span", { text: "🌿" }), h("small", { text: "Vườn" })),
      h("button", { type: "button", title: "Rời Gia Viên", onclick: (e) => act("/leave", {}, null, e.currentTarget) }, h("span", { text: "🚪" }), h("small", { text: "Rời" })));
    drawBar();
  }
  return { open, startBuild, stopBuild, farmPanel, gardenPanel, onState, onTap, drawBar, hud };
}
