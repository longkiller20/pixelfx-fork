// Câu Cá in the browser: the line, rod and float drawn over the lake (everyone's, from the server's snapshots), the
// fishing bar (cast, strike, hold to reel), the reeling game's picture, and the Ngư Cụ panel (rods, bait, selling fish,
// the Ngư Lục). The server decides everything (server/world.js runs the cast, server/cau-ca.js the money and things);
// this only shows and asks. Every picture is pixelfx (src/fx/fishing).
import { createFrame, clearFrame, createFx, hex } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { ITEMS } from "/shared/balance.js";
import { FISH_MAP, RODS, BAITS, FISH, RARITY, odds, fishName, fishPrice, kgText, reelZone, KHU_COUNT, KHU_CAP, khuLevel, KHU_COLORS } from "/shared/cau-ca.js";
import { h } from "./tong-mon.js";
import { mapInfo } from "/shared/maps/index.js";
import { confirmBox } from "./gia-vien.js";

const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const name = (k) => fishName(k, ITEMS);
const price = (k) => fishPrice(k, ITEMS);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- pictures: a pixelfx effect drawn once into a canvas
const LOOK = Object.fromEntries([...Object.entries(RODS), ...Object.entries(BAITS), ...Object.entries(FISH)].map(([k, v]) => [k, v.look]));
function fxCanvas(id, opts, w, h0, t = 0) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h0;
  const mod = effects[id];
  if (!mod) return cv;
  const fr = createFrame(w, h0);
  clearFrame(fr);
  const fx = createFx(mod, { x: w >> 1, y: h0 >> 1, ...opts });
  if (t) fx.update(t);
  fx.draw(fr);
  const img = new ImageData(w, h0);
  new Uint32Array(img.data.buffer).set(fr.color);
  cv.getContext("2d").putImageData(img, 0, 0);
  return cv;
}
/** A rod, bait or fish's picture (a canvas): gear 32 px, fish 80 x 48; dark: never caught, a shadow of it. */
export function fishPic(key, dark = false) {
  const cv = RODS[key] || BAITS[key] ? fxCanvas("fishing/gear", { item: LOOK[key] }, 32, 32) : fxCanvas("fishing/fish", { look: LOOK[key] ?? "chep", still: 1 }, 80, 48);
  cv.className = `ccpic ${RODS[key] || BAITS[key] ? "gear" : "fish"}`;
  if (dark) {
    const c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3]) (d.data[i] = 30), (d.data[i + 1] = 26), (d.data[i + 2] = 44);
    c.putImageData(d, 0, 0);
  }
  return cv;
}
/** A pixelfx picture that moves: paint(opts) redraws it at the clock's time (the buttons at the lake: fishing/button). */
function fxLive(id, w, h0, cls) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h0;
  cv.className = cls;
  const fr = createFrame(w, h0), img = new ImageData(w, h0), c2 = cv.getContext("2d");
  cv.paint = (opts) => {
    const mod = effects[id];
    if (!mod) return;
    clearFrame(fr);
    const fx = createFx(mod, { x: w >> 1, y: h0 >> 1, ...opts });
    fx.update((performance.now() / 1000) % (mod.meta.duration ?? 1));
    fx.draw(fr);
    new Uint32Array(img.data.buffer).set(fr.color);
    c2.putImageData(img, 0, 0);
  };
  return cv;
}
const urls = new Map();
/** The same, as an image URL (for the bag's cells): trimmed to what is drawn, so it fills its cell. */
export function fishIconUrl(key) {
  if (urls.has(key)) return urls.get(key);
  const cv = fishPic(key), c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 40) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  const s = Math.max(x1 - x0, y1 - y0) + 3, out = document.createElement("canvas");
  out.width = out.height = Math.max(8, s);
  out.getContext("2d").drawImage(cv, x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3, Math.round((s - (x1 - x0 + 3)) / 2), Math.round((s - (y1 - y0 + 3)) / 2), x1 - x0 + 3, y1 - y0 + 3);
  const url = out.toDataURL();
  urls.set(key, url);
  return url;
}
const rarityOf = (k) => RARITY[FISH[k]?.rarity ?? 1];

// ---------------------------------------------------------------- the layer over the lake (inside the game's loop)
/**
 * G: { drawFx(fx, layer, x, y, k), addFx(id, x, y, opts, follow, life, k), send(o), mapId(), myId(), toast(s), log(s) }.
 * Returns the layer: draw() each frame, onMsg() for the server's "fish" and "fr", onEvent() for a landing, key().
 */
export function createFishLayer(G) {
  // occ: how many are fishing at the pier's places; khu: which Khu this is (1..30), kocc: how many people in each Khu
  const L = { st: null, occ: [], khu: 0, kocc: [], onChange: () => {}, onLand: () => {}, onShop: () => {}, onFull: () => {} };
  const floats = new Map(); // player id -> their float's effect
  let nibbleUntil = 0, holding = false;
  const ROD_C = { 1: ["#a0a83a", "#d0d070"], 2: ["#9a7a34", "#c8a858"], 3: ["#2a9a62", "#6ad89a"], 4: ["#e8b028", "#ffe070"] };
  const LINE = hex("#e8ecf4");

  /** Rods, lines and floats: everyone fishing on the map (e.fb from the snapshot: [x, y, state, tier]). */
  L.draw = (p, list, now, dt, camX, camY) => {
    const seen = new Set();
    for (const e of list) {
      const fb = e.fb;
      if (!fb || e.kind !== "p" || e.dead) continue;
      seen.add(e.id);
      const [bx, by, s0, tier] = fb, mine = e.id === G.myId();
      const face = bx >= e.x ? 1 : -1, C = (ROD_C[tier] ?? ROD_C[1]).map(hex);
      // the rod: from the hands up and out over the water, bowed hard with a fish on
      const hx = e.x + face * 8, hy = e.y - 30, bend = s0 === 3 ? 1 : s0 === 2 ? 0.6 : 0.15, sway = Math.sin(now * 2.2 + e.id) * 1.2;
      const tx = e.x + face * (38 - bend * 6), ty = e.y - 70 + bend * 22 + sway;
      p.place(0, 0, false);
      p.fade = 1;
      let px = hx, py = hy;
      for (let i = 1; i <= 16; i++) {
        const u = i / 16, x = hx + (tx - hx) * u, y = hy + (ty - hy) * u + Math.sin(u * Math.PI) * -4 * (1 - bend) + u * u * bend * 10;
        // two pixels thick at the butt, one at the tip; lit along the top
        p.line(Math.round(px - camX), Math.round(py - camY), Math.round(x - camX), Math.round(y - camY), u < 0.3 ? C[0] : C[1]);
        if (u < 0.7) p.line(Math.round(px - camX), Math.round(py - camY) + 1, Math.round(x - camX), Math.round(y - camY) + 1, C[0]);
        px = x;
        py = y;
      }
      // the line: sagging when slack, drawn tight with a fish on
      const fx = bx + (s0 === 3 ? Math.sin(now * 9) * 3 : 0), fy = by + (s0 >= 2 ? 6 : 0), sag = s0 >= 2 ? 2 : 14;
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, x = px + (fx - px) * u, y = py + (fy - py) * u + Math.sin(u * Math.PI) * sag;
        p.dot(Math.round(x - camX), Math.round(y - camY), LINE, 0.85);
      }
      // the float, at the waterline
      let f = floats.get(e.id);
      if (!f || f.tier !== tier) floats.set(e.id, (f = { tier, fx: createFx(effects["fishing/bobber"], { seed: e.id, tier }) }));
      f.fx.update(dt);
      // 1 floating (or, for one's own float, a nibble the server told of), 2 under, 3 a fish on
      f.fx.options.state = s0 === 1 ? (mine && performance.now() / 1000 < nibbleUntil ? 1 : 0) : s0;
      G.drawFx(f.fx, "back", bx, by, 1.3);
      G.drawFx(f.fx, "front", bx, by, 1.3);
      if (f.state !== s0 && s0 === 2) G.addFx("water/splash", bx, by, {}, null, 0, 0.8);
      f.state = s0;
    }
    for (const id of floats.keys()) if (!seen.has(id)) floats.delete(id);
  };

  /** The server about this player's own cast. */
  L.onMsg = (m) => {
    if (m.t === "fzones") return void ((L.occ = m.occ ?? []), L.onChange());
    if (m.t === "fkhu") {
      if (m.n && m.n !== L.khu) G.toast(`Đã vào Khu ${m.n} (${m.occ?.[m.n - 1] ?? 1}/${KHU_CAP} người)`);
      if (m.n) L.khu = m.n;
      L.kocc = m.occ ?? L.kocc;
      return void L.onChange();
    }
    if (m.t === "fr") {
      if (L.st?.s === "reel") Object.assign(L.st.srv, { f: m.f, z: m.z, p: m.p, on: m.on });
      return;
    }
    if (m.s === "cast") {
      L.st = { s: "wait", rod: m.rod, bait: m.bait, left: m.left };
      G.toast(`Khu ${m.khu} · chỗ số ${m.n} · ${name(m.bait)}: còn ${fmt(m.left)}`);
    } else if (m.s === "nib") {
      nibbleUntil = performance.now() / 1000 + 0.45;
      L.nib = performance.now();
    } else if (m.s === "bite") {
      if (L.st) (L.st.s = "bite"), (L.st.until = performance.now() + m.window * 1000);
      navigator.vibrate?.(90);
    } else if (m.s === "reel") {
      if (!L.st) L.st = {};
      Object.assign(L.st, { s: "reel", rarity: m.rarity, bar: m.bar, fight: m.fight, srv: { f: 0.3, z: 0.2, p: 0.3, on: 0 }, z: 0.2, zv: 0, f: 0.3, p: 0.3 });
      holding = false;
    } else if (m.s === "end") {
      const was = L.st;
      L.st = null;
      holding = false;
      const R = RARITY[m.rarity ?? 1];
      const say = {
        stop: "Đã thu cần.",
        move: "Cử động mạnh, cá sợ bỏ đi. Đã thu cần.",
        early: "Giật sớm quá, cá chưa cắn câu! (không mất mồi)",
        miss: "Chậm tay rồi, cá đã ăn mất mồi.",
        lost: `Con cá ${R ? `[${R.name}] ` : ""}đã giãy thoát!`,
        nobait: "Hết mồi câu rồi. Hãy mua thêm ở quầy Ngư Cụ.",
        no: m.m,
        full: m.m,
      }[m.why];
      if (say) G.toast(say);
      if (m.why === "lost" || m.why === "miss") G.log(say);
      if (m.why === "land") L.onLand(m, was);
      if (m.why === "full") (G.log(m.m), L.onFull(m));
    }
    L.onChange();
  };
  /** Someone landed a fish: it flies out of the water towards them. */
  L.onEvent = (e, s) => {
    const pl = s.P.get(e.id), R = rarityOf(e.fish);
    G.addFx("fishing/catch", e.x, e.y, { look: FISH[e.fish]?.look ?? "chep", dir: pl && pl.x < e.x ? -1 : 1, color: R.color, seed: e.id }, null, 0, 1.4);
  };

  // ---- the controls: one action (the bar's big button, or E): cast, strike, hold to reel
  L.action = (down) => {
    if (G.mapId() !== FISH_MAP) return;
    const s = L.st?.s;
    if (s === "reel") {
      if (holding !== down) G.send({ t: "fish", a: "hold", on: (holding = down) });
      return;
    }
    if (!down) return;
    if (!s) G.send({ t: "fish", a: "cast" });
    else G.send({ t: "fish", a: "hook" });
  };
  L.stop = () => L.st && G.send({ t: "fish", a: "stop" });
  L.holding = () => holding;

  /** Each frame: the reeling game's own zone, moved by what is held now (the server's arrives a moment later). */
  L.update = (dt) => {
    const r = L.st?.s === "reel" ? L.st : null;
    if (!r) return;
    const rod = { ...RODS[r.rod ?? "cc_can_truc"], bar: r.bar };
    reelZone(r, holding, rod, dt);
    // stay near the server's word: it is the one that counts
    r.z += (r.srv.z - r.z) * Math.min(1, dt * 3);
    r.f += (r.srv.f - r.f) * Math.min(1, dt * 14);
    r.p += (r.srv.p - r.p) * Math.min(1, dt * 10);
  };
  return L;
}

// ---------------------------------------------------------------- the bar over the game, the reeling picture, the panels
export function initFishUI({ call, uuid, panel, flash, game }) {
  const bar = $("fishbar"), reel = $("reel"), rc = reel.querySelector("canvas"), rx = rc.getContext("2d");
  let view = null, records = {}, tab = "rod", busy = false;
  const layer = () => game()?.fish;
  const onLake = () => game()?.mapId?.() === FISH_MAP;

  // ---- the fishing bar: the big button (what it does depends on the cast), reel in, the stall
  // At the lake these stand where the fight buttons are elsewhere (those are hidden there: css body.peace): the big round
  // one in the corner under the right thumb, where the attack is, and the three small ones around it, where the arts are.
  // their faces are pixelfx (fishing/button): a gold and jade ring round rippling water for the big one, its water and icon
  // following the moment (cast, a bite, reeling); small bronze, jade and coral rings with their icons for the others
  const face = { act: fxLive("fishing/button", 48, 48, "fface"), shop: fxLive("fishing/button", 28, 28, "fface"), khu: fxLive("fishing/button", 28, 28, "fface"), stop: fxLive("fishing/button", 28, 28, "fface") };
  const act = h("button.fact", { type: "button", title: "Thả câu / giật / giữ để kéo (E hoặc J)" }, face.act, h("b"), h("small"), h("kbd", { text: "E" }));
  const stopB = h("button.fsmall.stop", { type: "button", title: "Thu cần (R)", "aria-label": "Thu cần", onclick: () => layer()?.stop() }, face.stop, h("small", { text: "Thu cần" }), h("kbd", { text: "R" }));
  const khuB = h("button.fsmall.khu", { type: "button", title: "Chọn khu (K): 30 khu, mỗi khu tối đa 20 người", onclick: () => khuBox() }, face.khu, h("small", { text: "Khu câu" }), h("kbd", { text: "K" }));
  const shopB = h("button.fsmall.shop", { type: "button", title: "Ngư Cụ (Q): cần, mồi, bán cá, Ngư Lục", onclick: () => open() }, face.shop, h("small", { text: "Ngư Cụ" }), h("kbd", { text: "Q" }));
  bar.append(khuB, shopB, stopB, act);
  /** The faces, at the clock's time: the big one's water and icon by the moment, the Khu's pearl by how full it is. */
  function faces() {
    const L = layer(), s = L?.st?.s, kn = L?.khu, kc = kn ? L.kocc[kn - 1] ?? 0 : 0;
    face.act.paint({ piece: "big", icon: s === "bite" ? "strike" : s === "reel" ? "reel" : "cast", mood: s === "wait" || s === "bite" || s === "reel" ? s : "idle" });
    face.shop.paint({ piece: "small", icon: "shop", tone: "gold" });
    face.khu.paint({ piece: "small", icon: "khu", tone: "jade", dot: kn ? KHU_COLORS[khuLevel(kc)] : "#888888" });
    face.stop.paint({ piece: "small", icon: "stop", tone: "coral" });
  }
  let faceT = 0;
  const press = (down) => (e) => {
    e.preventDefault();
    layer()?.action(down);
    paint();
  };
  act.addEventListener("pointerdown", press(true));
  act.addEventListener("pointerup", press(false));
  act.addEventListener("pointercancel", press(false));
  act.addEventListener("pointerleave", (e) => layer()?.holding() && press(false)(e));
  act.addEventListener("contextmenu", (e) => e.preventDefault());
  // the keys: E or J (the attack key elsewhere) work the line, R reels in, Q opens Ngư Cụ, K (an art key elsewhere) the box of Khu
  const typing = () => /input|textarea|select/i.test(document.activeElement?.tagName ?? "");
  const LINE = new Set(["e", "j"]);
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.repeat || !onLake() || typing() || !$("panel").hidden) return;
    if (LINE.has(k)) return void (layer()?.action(true), paint());
    if (k === "r") return void layer()?.stop();
    if (k === "q") return void open();
    if (k === "k") return void khuBox();
  });
  addEventListener("keyup", (e) => LINE.has(e.key.toLowerCase()) && onLake() && (layer()?.action(false), paint()));

  /** The box of Khu: all 30, a cell each with a dot (green roomy, yellow filling, red full) and how many are in it. */
  let khuOpen = null;
  async function khuBox(note = null) {
    khuOpen?.();
    const L = layer();
    // fresh numbers (the lake pushes them too, while one is there)
    try {
      const v = await call("/fishing");
      view = v;
      if (L) (L.kocc = v.occ ?? L.kocc), v.khu && (L.khu = v.khu);
    } catch {}
    const occ = L?.kocc?.length ? L.kocc : view?.occ ?? [], cur = onLake() ? L?.khu ?? 0 : 0;
    const total = occ.reduce((a, b) => a + b, 0);
    const cells = Array.from({ length: KHU_COUNT }, (_, i) => {
      const n = i + 1, c = occ[i] ?? 0, full = c >= KHU_CAP, lv = khuLevel(c);
      return h(`button.ckcell${n === cur ? ".on" : ""}${full ? ".full" : ""}`, {
        type: "button", disabled: n === cur || full || !!L?.st, title: full ? `Khu ${n} đã đủ ${KHU_CAP} người` : n === cur ? "Đang ở khu này" : `Sang Khu ${n}`,
        onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try {
            await call("/fishing/enter", { method: "POST", body: { khu: n } });
            khuOpen?.();
            $("panel").hidden = true;
          } catch (err) {
            flash(err.message);
            b.disabled = false;
          }
        } },
        h("b", { text: String(n) }), h("i.ckdot", { style: `background:${KHU_COLORS[lv]};box-shadow:0 0 6px ${KHU_COLORS[lv]}` }), h("small", { text: `${c}/${KHU_CAP}` }));
    });
    return new Promise((done) => {
      const host = $("panel")?.parentElement ?? document.body;
      const end = () => (removeEventListener("keydown", key, true), shade.remove(), (khuOpen = null), done());
      const key = (e) => e.key === "Escape" && (e.stopPropagation(), end());
      const shade = h("div.cshade", { onclick: (e) => e.target === shade && end() },
        h("div.cbox.ccbox.ckbox", { role: "dialog", "aria-modal": "true" },
          h("h4", { text: cur ? `Chọn khu · đang ở Khu ${cur}` : "Chọn khu câu" }),
          note ? h("p.cknote", { text: note }) : null,
          h("p.cklegend", {}, ...[["Thoáng", 0], ["Đông", 1], ["Sắp đầy / đầy", 2]].map(([t, lv]) => h("span", {}, h("i.ckdot", { style: `background:${KHU_COLORS[lv]}` }), t)),
            h("span.dim", { text: `· ${total} người ở hồ · tối đa ${KHU_CAP}/khu` })),
          h("div.ckgrid", {}, ...cells),
          L?.st ? h("p.dim", { text: "Đang câu: thu cần rồi mới đổi khu được." }) : null,
          h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Đóng", onclick: () => end() }))));
      addEventListener("keydown", key, true);
      host.append(shade);
      khuOpen = end;
    });
  }
  function paint() {
    const L = layer(), here = onLake();
    // the Khu button: which Khu, how many in it, its dot
    const kn = L?.khu, kc = kn ? L.kocc[kn - 1] ?? 0 : 0;
    khuB.querySelector("small").textContent = kn ? `Khu ${kn} · ${kc}/${KHU_CAP}` : "Khu câu";
    bar.hidden = !here;
    if (!here) return void (reel.hidden = true);
    const s = L?.st?.s;
    const [b, sm] = !s ? ["Thả câu", "ngồi vào chỗ trống"] : s === "wait" ? ["Chờ cá", "cá cắn thì giật"] : s === "bite" ? ["GIẬT!", "nhanh lên"] : s === "reel" ? ["Giữ kéo", "giữ nút"] : ["...", ""];
    act.querySelector("b").textContent = b;
    act.querySelector("small").textContent = sm;
    act.className = `fact ${s ?? "idle"}${L?.holding() ? " hold" : ""}`;
    faces();
    stopB.hidden = !s || s === "reel";
    reel.hidden = s !== "reel";
  }
  /** Each frame: the reeling game, when a fish is on (and a nibble's shake). */
  let lastMap = null;
  function frame(dt) {
    const L = layer();
    if (!L) return;
    // a Khu full: say so in the box of Khu, with the others' room
    if (!L.onFull.set) (L.onFull = (m) => khuBox(m.m)), (L.onFull.set = 1);
    // the Khu's numbers changed: the button says so
    if (!L.onChange.set) (L.onChange = () => paint()), (L.onChange.set = 1);
    // a new map: the bar shows (the lake) or hides
    if (game()?.mapId() !== lastMap) (lastMap = game()?.mapId()), paint();
    L.update(dt);
    // the buttons' faces move at ten frames a second, only while they're shown
    if (!bar.hidden && (faceT += dt) > 0.1) (faceT = 0), faces();
    if (L.nib && performance.now() - L.nib < 300) act.classList.add("nib");
    else act.classList.remove("nib");
    const r = L.st?.s === "reel" ? L.st : null;
    if (!r) return;
    const W = rc.width, H = rc.height, top = 8, bot = H - 8, Hh = bot - top, y = (v) => bot - v * Hh;
    rx.clearRect(0, 0, W, H);
    // the frame and the water inside it
    rx.fillStyle = "#24140a";
    rx.fillRect(0, 0, 44, H);
    const g = rx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, "#5ab0e0");
    g.addColorStop(1, "#163a6a");
    rx.fillStyle = g;
    rx.fillRect(6, top, 32, Hh);
    // the catch zone
    const zc = r.z, zh = r.bar * Hh;
    rx.fillStyle = r.srv.on ? "rgba(120,255,140,.55)" : "rgba(120,255,140,.3)";
    rx.fillRect(7, y(zc) - zh / 2, 30, zh);
    rx.strokeStyle = "#b8ffc0";
    rx.lineWidth = 2;
    rx.strokeRect(7, y(zc) - zh / 2, 30, zh);
    // the fish (its rarity's colour; what it is, it shows only when landed)
    const R = RARITY[r.rarity ?? 1];
    r.icon ??= fishPic(Object.keys(FISH).find((k) => FISH[k].rarity === r.rarity && !FISH[k].stones) ?? "cc_ca_diec", true);
    rx.save();
    rx.shadowColor = R.color;
    rx.shadowBlur = 10;
    rx.imageSmoothingEnabled = false;
    rx.drawImage(r.icon, 20, 12, 40, 24, 4, y(r.f) - 9, 36, 22);
    rx.restore();
    rx.fillStyle = R.color;
    rx.fillRect(4, y(r.f) - 1, 4, 3);
    // the progress beside it
    rx.fillStyle = "#0b0814";
    rx.fillRect(48, top, 12, Hh);
    const pv = Math.max(0, Math.min(1, r.p));
    rx.fillStyle = pv > 0.66 ? "#6ae07a" : pv > 0.33 ? "#f0c040" : "#f05a4a";
    rx.fillRect(50, bot - pv * (Hh - 4) - 2, 8, pv * (Hh - 4));
    reel.querySelector(".rn").textContent = `Cá ${R.name}`;
    reel.querySelector(".rn").style.color = R.color;
  }
  function onLand(m) {
    const f = FISH[m.fish], R = rarityOf(m.fish);
    const card = h("div.fcatch", {},
      h("img.fcimg", { src: fishIconUrl(m.fish), alt: "" }),
      h("div", {}, h("b", { text: name(m.fish), style: `color:${R.color}` }), h("small", { text: `[${R.name}] · ${kgText(m.g)}` }),
        m.stones ? h("small.gold", { text: `Mở rương: +${fmt(m.stones)} linh thạch` }) : h("small", { text: `Bán được ${fmt(price(m.fish))} linh thạch` }),
        m.record ? h("em", { text: "Kỷ lục mới của Vọng Nguyệt Hồ!" }) : m.best ? h("em", { text: "Con nặng nhất của đạo hữu!" }) : null));
    const host = $("fishcatch");
    host.replaceChildren(card);
    host.hidden = false;
    clearTimeout(onLand.t);
    onLand.t = setTimeout(() => (host.hidden = true), 3600);
    void f;
    if (isOpen()) open(false);
  }

  // ---- the Ngư Cụ panel: four tabs
  const isOpen = () => !$("panel").hidden && !!$("panelBody").querySelector(".ccp");
  async function open(fresh = true) {
    try {
      const v = await call("/fishing");
      view = v;
      records = v.records ?? records;
    } catch (e) {
      return flash(e.message);
    }
    draw(fresh);
  }
  async function post(path, body, ok, btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const out = await call(`/fishing${path}`, { method: "POST", body });
      view = { ...view, ...out.view };
      if (ok) flash(typeof ok === "function" ? ok(out) : ok);
      draw(false);
      return out;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
    } finally {
      busy = false;
    }
  }
  const stones = () => game()?.me()?.stones ?? 0;
  function draw(first) {
    if (!view) return;
    const v = view, wrap = h("div.ccp");
    const where = !v.here ? h("p.cchint", {}, "Đạo hữu đang ở ngoài. ", h("button.primary", { type: "button", text: "Tới Vọng Nguyệt Hồ", onclick: (e) => go(e.currentTarget) }))
      : !v.atShop ? h("p.cchint", { text: "Mua bán phải đứng ở quầy Ngư Cụ (bờ tây, chỗ ông lão đội nón lá)." }) : null;
    const tabs = h("div.cctabs", {}, ...[["rod", "Cần Câu"], ["bait", "Mồi Câu"], ["sell", "Bán Cá"], ["log", "Ngư Lục"]].map(([k, l]) =>
      h(`button${tab === k ? ".on" : ""}`, { type: "button", text: l, onclick: () => ((tab = k), draw(false)) })));
    const head = h("div.cchead", {},
      h("span", {}, "Đang dùng: ", h("b", { text: v.rod ? name(v.rod) : "chưa có cần" }), " · ", h("b", { text: v.bait ? `${name(v.bait)} ×${fmt(v.baits[v.bait] ?? 0)}` : "chưa có mồi" })),
      v.khu ? h("span.ckh", {}, h("i.ckdot", { style: `background:${KHU_COLORS[khuLevel(v.occ?.[v.khu - 1] ?? 0)]}` }), `Khu ${v.khu} · ${v.occ?.[v.khu - 1] ?? 0}/${KHU_CAP}`) : null,
      h("span.st", {}, h("img", { className: "ico", src: "/xianxia/ui/ui_xianxia_item_spirit_stone.png", alt: "" }), h("b", { text: fmt(stones()) })));
    wrap.append(...[head, where, tabs].filter(Boolean), ({ rod: rodTab, bait: baitTab, sell: sellTab, log: logTab }[tab] ?? rodTab)(v));
    if (first || !isOpen()) panel("Ngư Cụ · Câu Cá", wrap);
    else $("panelBody").replaceChildren(wrap);
  }
  const canTrade = () => view?.atShop;
  // each catch's chance with the rod and bait in hand (or the bare rates), as numbers 0..1 and as words
  const oddsNow = () => Object.fromEntries(odds(view?.rod ?? null, view?.bait ?? null));
  const pct = (p) => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`);
  const stat = (label, val) => h("span.ccst", {}, h("small", { text: label }), h("b", { text: val }));
  const notHere = "Hãy tới quầy Ngư Cụ";

  // ---- the little boxes over the panel: a thing's details, how many to buy or sell
  function overBox(kids, onKey) {
    return new Promise((done) => {
      const host = $("panel")?.parentElement ?? document.body;
      const end = (v) => (removeEventListener("keydown", key, true), shade.remove(), done(v));
      const key = (e) => e.key === "Escape" ? (e.stopPropagation(), end(null)) : onKey?.(e, end);
      const box = h("div.cbox.ccbox", { role: "dialog", "aria-modal": "true" }, ...kids(end));
      const shade = h("div.cshade", { onclick: (e) => e.target === shade && end(null) }, box);
      addEventListener("keydown", key, true);
      host.append(shade);
    });
  }
  /** A rod's, bait's or fish's details: picture, words, numbers. */
  function details(k) {
    const r = RODS[k], b = BAITS[k], f = FISH[k], R = f ? rarityOf(k) : null;
    const stats = r ? [stat("Vùng kéo", `${Math.round(r.bar * 100)}%`), stat("Lực kéo", `×${r.power}`), stat("May mắn", `+${Math.round(r.luck * 100)}%`), stat("Thêm giờ giật", `${r.hook}s`), stat("Tầm quăng", `${r.reach} ô`)]
      : b ? [stat("Cá cắn nhanh", `×${b.speed}`), stat("May mắn", `+${Math.round(b.luck * 100)}%`), stat("Cá Tiên", b.tier >= 3 ? "có thể" : "không")]
      : [stat("Bậc", R.name), stat("Nặng", `${f.kg[0]}-${f.kg[1]} cân`), stat("Tỉ lệ cắn câu", pct(oddsNow()[k] ?? 0))];
    const p = price(k);
    return overBox((end) => [
      h("h4", { text: name(k), style: R ? `color:${R.color}` : "" }),
      h("div.ccbpic", {}, h("img", { src: fishIconUrl(k), alt: "" })),
      h("p", { text: ITEMS[k]?.desc || (r ?? b ?? f).desc }),
      h("div.ccstats", {}, ...stats, stat(f ? "Ngư Cụ mua" : "Giá", p > 0 ? `${fmt(p)}` : f ? "không mua" : "không bán")),
      h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Đóng", onclick: () => end(null) }))]);
  }
  /** How many: a number between 1 and max, −/+, quick picks; the total under it. Resolves the number or null. */
  function qtyBox({ title, k, each, max, verb, have = null }) {
    let n = 1;
    const input = h("input.ccqin", { type: "number", min: 1, max, value: 1, inputMode: "numeric" });
    const total = h("p.cctot");
    const set = (v) => {
      n = Math.max(1, Math.min(max, Math.floor(Number(v) || 1)));
      input.value = n;
      total.replaceChildren(`${verb} ${fmt(n)} × ${fmt(each)} = `, h("b", { text: `${fmt(n * each)} linh thạch` }),
        have !== null ? h("small", { text: ` (đang có ${fmt(have)}${verb === "Mua" ? `, còn ${fmt(have - n * each)}` : ""})` }) : null);
      ok.disabled = verb === "Mua" && have !== null && n * each > have;
    };
    const ok = h("button.primary", { type: "button", text: verb });
    return overBox((end) => {
      ok.onclick = () => end(n);
      input.addEventListener("input", () => set(input.value));
      const quick = [1, 10, 50, max].filter((v, i, a) => v <= max && a.indexOf(v) === i);
      set(1);
      return [h("h4", { text: title }),
        h("div.ccqrow", {}, h("img.ccqpic", { src: fishIconUrl(k), alt: "" }),
          h("button.ghost.ccqb", { type: "button", text: "−", onclick: () => set(n - 1) }), input, h("button.ghost.ccqb", { type: "button", text: "+", onclick: () => set(n + 1) })),
        h("div.ccquick", {}, ...quick.map((v) => h("button.ghost", { type: "button", text: v === max && v > 50 ? `Tối đa ${fmt(v)}` : `${fmt(v)}`, onclick: () => set(v) }))),
        total,
        h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Huỷ", onclick: () => end(null) }), ok)];
    }, (e, end) => e.key === "Enter" && !ok.disabled && (e.stopPropagation(), end(n)));
  }

  // ---- one line a thing: picture, name, a short line, small buttons
  const line = (k, sub, on, ...btns) => h(`div.ccline${on ? ".on" : ""}`, {},
    h("img.cclpic", { src: fishIconUrl(k), alt: "" }),
    h("div.cclmain", {}, h("b", { text: name(k), style: FISH[k] ? `color:${rarityOf(k).color}` : "" }), h("small", { text: sub })),
    h("div.cclbtn", {}, h("button.ghost", { type: "button", text: "Chi tiết", onclick: () => details(k) }), ...btns.filter(Boolean)));
  const useBtn = (using, body, msg) => h(`button${using ? ".ghost.using" : ".ghost"}`, { type: "button", text: using ? "Đang dùng" : "Dùng", disabled: using, onclick: (e) => post("/choose", body, msg, e.currentTarget) });
  function rodTab(v) {
    return h("div.cclines", {}, ...Object.keys(RODS).map((k) => {
      const own = v.rods.includes(k), p = price(k);
      return line(k, own ? "Đã có" : p > 0 ? `${fmt(p)} linh thạch` : "Không bán", v.rod === k,
        own ? useBtn(v.rod === k, { rod: k }, `Đã cầm ${name(k)}.`)
          : h("button.primary", { type: "button", text: "Mua", disabled: !(p > 0) || !canTrade(), title: canTrade() ? "" : notHere,
            onclick: async (e) => {
              const b = e.currentTarget;
              if (await confirmBox({ title: "Mua cần câu", text: `Mua ${name(k)} với giá ${fmt(p)} linh thạch? (đang có ${fmt(stones())})`, ok: `Mua · ${fmt(p)}`, pic: h("img.ccqpic", { src: fishIconUrl(k), alt: "" }) }))
                post("/buy", { item: k, qty: 1, requestId: uuid() }, `Đã mua ${name(k)}.`, b);
            } }));
    }));
  }
  function baitTab(v) {
    const list = h("div.cclines", {}, ...Object.keys(BAITS).map((k) => {
      const n = v.baits[k] ?? 0, p = price(k);
      return line(k, `${p > 0 ? `${fmt(p)}/viên` : "Không bán"} · có ${fmt(n)}`, v.bait === k,
        h("button.primary", { type: "button", text: "Mua", disabled: !(p > 0) || !canTrade(), title: canTrade() ? "" : notHere,
          onclick: async (e) => {
            const b = e.currentTarget, q = await qtyBox({ title: `Mua ${name(k)}`, k, each: p, max: 99, verb: "Mua", have: stones() });
            if (q) post("/buy", { item: k, qty: q, requestId: uuid() }, `Đã mua ${q} ${name(k)}.`, b);
          } }),
        useBtn(v.bait === k, { bait: k }, `Đã móc ${name(k)}.`));
    }));
    // what the rod and bait in hand bring up: each catch's chance, rarest last
    const tip = h("details.ccodds", {}, h("summary", { text: "Tỉ lệ cá cắn câu với cần và mồi đang dùng" }));
    const od = oddsNow();
    tip.append(h("div.ccoddl", {}, ...Object.keys(FISH).sort((a, b) => FISH[a].rarity - FISH[b].rarity).map((k) =>
      h("span", { style: `color:${rarityOf(k).color}` }, `${v.log[k] ? name(k) : "???"} `, h("b", { text: pct(od[k] ?? 0) })))),
      h("p.dim", { text: "Cần, mồi tốt hơn làm tạp vật ít đi và cá quý dễ cắn hơn; cá Tiên chỉ cắn mồi Linh Mễ Hoàn trở lên." }));
    return h("div", {}, list, tip);
  }
  function sellTab(v) {
    const keys = Object.keys(v.fish).filter((k) => price(k) > 0).sort((a, b) => FISH[b].rarity - FISH[a].rarity || price(b) - price(a));
    const total = keys.reduce((s, k) => s + v.fish[k] * price(k), 0);
    if (!keys.length) return h("p.cchint", { text: "Trong túi chưa có cá nào. Ra bến thả câu đi!" });
    return h("div", {},
      h("div.ccsellall", {}, h("span", { text: `${fmt(keys.reduce((s, k) => s + v.fish[k], 0))} con · ${fmt(total)} linh thạch` }),
        h("button.primary", { type: "button", text: "Bán tất cả", disabled: !canTrade(), title: canTrade() ? "" : notHere,
          onclick: async (e) => {
            const b = e.currentTarget;
            if (await confirmBox({ title: "Bán tất cả cá", text: `Bán hết cá trong túi được ${fmt(total)} linh thạch?`, ok: `Bán · ${fmt(total)}` }))
              post("/sell", { item: "all", qty: "all", requestId: uuid() }, (o) => `Đã bán ${fmt(o.n)} con, được ${fmt(o.got)} linh thạch.`, b);
          } })),
      h("div.cclines", {}, ...keys.map((k) => {
        const R = rarityOf(k), n = v.fish[k];
        return line(k, `[${R.name}] ${fmt(price(k))}/con · có ${fmt(n)}`, false,
          h("button.primary", { type: "button", text: "Bán", disabled: !canTrade(), title: canTrade() ? "" : notHere,
            onclick: async (e) => {
              const b = e.currentTarget, q = await qtyBox({ title: `Bán ${name(k)}`, k, each: price(k), max: n, verb: "Bán" });
              if (q) post("/sell", { item: k, qty: q, requestId: uuid() }, (o) => `Đã bán ${fmt(o.n)} ${name(k)}, +${fmt(o.got)} linh thạch.`, b);
            } }));
      })));
  }
  function logTab(v) {
    const all = Object.keys(FISH), got = all.filter((k) => v.log[k]).length;
    return h("div", {},
      h("div.cctally", {}, stat("Đã câu", `${got}/${all.length} loại`), stat("Lần cá cắn", fmt(v.casts)), stat("Cá lên bờ", fmt(v.catches)), stat("Đã bán được", `${fmt(v.sold)} linh thạch`)),
      h("div.cclog", {}, ...all.map((k) => {
        const f = FISH[k], R = rarityOf(k), l = v.log[k], rec = records[k];
        return h(`div.ccfish${l ? "" : ".unk"}`, { title: l ? f.desc : "Chưa câu được" }, h("div.ccpicw", {}, fishPic(k, !l)),
          h("b", { text: l ? name(k) : "???", style: `color:${R.color}` }),
          h("small", { text: `[${R.name}] · tỉ lệ ${pct(oddsNow()[k] ?? 0)}` }),
          l ? h("small", { text: `Đã câu ${fmt(l.n)} · nặng nhất ${kgText(l.best)}` }) : h("small.dim", { text: `${kgText(f.kg[0] * 1000)} - ${kgText(f.kg[1] * 1000)}` }),
          rec ? h("small.gold", { text: `Kỷ lục: ${kgText(rec.g)} · ${rec.by}` }) : null);
      })));
  }
  async function go(btn) {
    if (btn) btn.disabled = true;
    try {
      await call("/fishing/enter", { method: "POST", body: {} });
      $("panel").hidden = true;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
    }
  }
  /** The menu's Câu Cá: off the lake, go there; on it, the Ngư Cụ panel. */
  function menu() {
    if (onLake()) return open();
    go();
  }
  // walking up to the stall or away from it: the panel's buttons follow
  setInterval(() => {
    if (!isOpen() || busy) return;
    call("/fishing").then((v) => {
      const moved = v.atShop !== view?.atShop || v.here !== view?.here;
      view = v;
      records = v.records ?? records;
      if (moved && isOpen()) draw(false);
    }).catch(() => {});
  }, 3000);
  return { open, menu, paint, frame, onLand };
}
