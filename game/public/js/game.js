// The game in the browser: it shows what the server says is happening, and sends what the player presses.
import { createFrame, clearFrame, createFx, composite, painterFor, hex, WHITE } from "/pixelfx/core/index.js";
import { effects } from "/pixelfx/fx/index.js";
import { CLASSES, CLASS, MONSTERS, ITEMS, BUFF_STATS, expForLevel, realmName, MAX_LEVEL, ARTS, ART_SLOTS } from "/shared/balance.js";
import { artIcon, artScale, BLANK_ACTOR } from "./arts.js";
import { mapInfo } from "/shared/maps/index.js";
import { drawDummy } from "./art.js";
import { drawAvatar, avatarTop, loadAvatars, drawWeapon } from "./avatar.js";
import { buildScene } from "./scenery.js";
import { stepBody, PHYS } from "/shared/physics.js";

const MTYPES = ["dummy", "ghost"];
// each buff's status icon (Xianxia Pixel Pack)
const BUFF_ICON = { hp: "item_peach", atk: "status_burn", def: "status_golden_shield", spd: "status_swift", exp: "item_jade_slip", stones: "item_spirit_stone", med: "item_lingzhi" };
const GOLD = ["#2a1604", "#6a3a08", "#b8700e", "#f0a820", "#ffd84a", "#fff2a8", "#ffffff"];
const JADE = ["#04120c", "#0b2a1e", "#145a3a", "#22a06a", "#5cf0a0", "#c8ffe0", "#ffffff"];
const INTERP = 0.11; // seconds behind the newest snapshot that others are drawn at
const $ = (id) => document.getElementById(id);

export function startGame({ token, character, inventory, api, onFatal, touch, refreshConfig, onArts, openArts }) {
  loadAvatars();
  const view = $("view"), labels = $("labels"), ctx = view.getContext("2d"), lctx = labels.getContext("2d");
  let VW = 640, VH = 360, frame, img, bgBuf, scale = 1;
  let map = null, scene = null, body = null;

  // ---------------------------------------------------------------- state from the server
  let myId = 0, me = null, inv = { ...inventory };
  // the five arts on the bar and the arts learned (the starters are known by everyone)
  let arts = { slots: character?.slots ?? Array(ART_SLOTS).fill(null), learned: character?.learned ?? [] };
  const boltFx = new Map(); // bolt id -> the effect riding it
  const infos = new Map(); // player id -> { name, look, lv }
  const snaps = []; // { at, P: Map, M: Map, B: [] }
  const casts = new Map(); // entity id -> { s, type, at }
  const flashes = new Map(); // entity id -> time of last hit
  const fxs = []; // live effects: { fx, x, y, follow, until }
  const texts = []; // floating numbers: { x, y, s, color, at }
  const ambient = [];
  let alive = true;

  // ---------------------------------------------------------------- the socket
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: "auth", token }));
  ws.onclose = (e) => {
    if (alive) onFatal(e.code === 4002 ? "Tài khoản vừa vào game ở nơi khác." : "Mất kết nối tới máy chủ.", e.code === 4001);
    alive = false;
  };
  const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case "welcome":
        myId = m.id;
        if (!map || map.id !== m.map) {
          map = mapInfo(m.map);
          scene = null;
          $("loading").hidden = false;
          buildScene(map).then((sc) => {
            scene = sc;
            $("loading").hidden = true;
            zoneBanner(map.name, map.sub);
          }, () => onFatal("Không tải được bản đồ, hãy thử lại.", false));
        }
        inv = m.inv;
        for (const p of m.players) infos.set(p.id, p);
        renderInv();
        break;
      case "config":
        // an admin changed the numbers: fetch them, then redraw what shows them
        refreshConfig?.().then(() => (renderMe(), renderSlots()));
        break;
      case "pi":
        infos.set(m.id, m);
        break;
      case "gone":
        infos.delete(m.id);
        break;
      case "me":
        me = m;
        renderMe();
        break;
      case "inv":
        inv = m.inv;
        renderInv();
        break;
      case "arts":
        arts = { slots: m.slots, learned: m.learned };
        renderSlots();
        onArts?.(arts);
        break;
      case "drop": {
        const got = Object.entries(m.items).map(([k, n]) => `${ITEMS[k]?.name ?? k} ×${n}`).join(", ");
        toast(`Nhặt được: ${got}`);
        logLine(null, `Nhặt được ${got}.`, "sys");
        break;
      }
      case "s":
        onSnapshot(m);
        break;
      case "chat":
        logLine(m.n, m.m);
        break;
      case "feed":
        logLine(null, m.m, "sys");
        break;
      case "portal":
        zoneBanner("Đường phía trước chưa mở", m.m);
        break;
      case "toast":
        toast(m.m);
        break;
      case "fatal":
        alive = false;
        onFatal(m.m, true);
        break;
      case "pong":
        $("ping").textContent = `${Math.round(performance.now() - m.c)} ms`;
        break;
    }
  };
  setInterval(() => send({ t: "ping", c: performance.now() }), 3000);

  function onSnapshot(m) {
    const s = { at: performance.now() / 1000, k: m.k, P: new Map(), M: new Map(), B: m.B };
    for (const a of m.P) s.P.set(a[0], { id: a[0], x: a[1], y: a[2], face: a[3], hp: a[4] / 1000, f: a[5] });
    for (const a of m.M) s.M.set(a[0], { id: a[0], type: MTYPES[a[1]], x: a[2], y: a[3], face: a[4], hp: a[5] / 1000, f: a[6] });
    snaps.push(s);
    while (snaps.length > 30) snaps.shift();
    for (const e of m.E) onEvent(e, s);
  }

  const posOf = (id, s = snaps[snaps.length - 1]) => s?.P.get(id) ?? s?.M.get(id);
  // life: seconds before a looping effect is told to stop (it then fades); loops get 1.6 s unless told otherwise.
  // k: how much bigger to draw it (pixelfx draws for its 38 px stand-in; our characters are 63 px tall)
  function addFx(id, x, y, opts = {}, follow = null, life = 0, k = 1) {
    const mod = effects[id];
    if (!mod || fxs.length > 48) return;
    const fx = createFx(mod, { seed: (Math.random() * 1e6) | 0, actor: BLANK_ACTOR, ...opts });
    fxs.push({ fx, x, y, k, follow, dy: opts.dy ?? 0, until: life || mod.meta.loop ? performance.now() / 1000 + (life || 1.6) : 0 });
  }
  // an effect drawn k times bigger: into a scratch frame of its own, then each pixel blown up into the view, blended over
  // what is already there (so a translucent shield shows the character inside it), its glow added to the view's
  const scratch = new Map();
  function drawFx(fx, layer, x, y, k = 1) {
    const sx = Math.round(x - camX), sy = Math.round(y - camY);
    if (k === 1) {
      fx.options.x = sx;
      fx.options.y = sy;
      return fx.draw(frame, layer);
    }
    const [w, h] = fx.meta.size, [ox, oy] = fx.meta.origin ?? [w / 2, h / 2], pad = 16;
    // room on both sides of the anchor, so a flipped effect still fits
    const half = Math.ceil(Math.max(ox, w - ox)) + pad, W = half * 2, H = Math.ceil(h) + pad * 2, ay = Math.round(oy) + pad;
    let s = scratch.get(W * 4096 + H);
    if (!s) scratch.set(W * 4096 + H, (s = createFrame(W, H)));
    clearFrame(s);
    fx.options.x = half;
    fx.options.y = ay;
    fx.draw(s, layer);
    const x0 = Math.round(sx - half * k), y0 = Math.round(sy - ay * k), DW = Math.ceil(W * k), DH = Math.ceil(H * k);
    const C = s.color, L = s.light, FC = frame.color, FL = frame.light;
    for (let j = Math.max(0, -y0); j < DH && y0 + j < VH; j++) {
      const row = Math.min(H - 1, (j / k) | 0) * W, out = (y0 + j) * VW;
      for (let i = Math.max(0, -x0); i < DW && x0 + i < VW; i++) {
        const si = row + Math.min(W - 1, (i / k) | 0), c = C[si], l = L[si] & 0xffffff;
        if (!c && !l) continue;
        const ti = out + x0 + i;
        if (c >>> 24) {
          const a = c >>> 24, d = FC[ti];
          if (a === 255 || !(d >>> 24)) FC[ti] = c;
          else {
            const f = a / 255, g = 1 - f;
            FC[ti] = ((d >>> 24) << 24) | ((((c >>> 16) & 255) * f + ((d >>> 16) & 255) * g) << 16) | ((((c >>> 8) & 255) * f + ((d >>> 8) & 255) * g) << 8) | ((c & 255) * f + (d & 255) * g);
          }
        }
        if (l) {
          const e = FL[ti];
          FL[ti] = (Math.min(255, ((e >>> 16) & 255) + ((l >>> 16) & 255)) << 16) | (Math.min(255, ((e >>> 8) & 255) + ((l >>> 8) & 255)) << 8) | Math.min(255, (e & 255) + (l & 255));
        }
      }
    }
  }
  // the avatar's casting pose for an art's type
  const POSE = { melee: "melee", dash: "melee", bolt: "bolt", zone: "zone", nova: "zone", heal: "zone", buff: "zone" };
  function onEvent(e, s) {
    const now = performance.now() / 1000;
    switch (e.e) {
      case "cast": {
        const p = s.P.get(e.id), info = infos.get(e.id);
        if (!p || !info) break;
        const sk = e.a ? ARTS[e.a] : CLASSES[CLASS].skills[0];
        if (!sk) break;
        casts.set(e.id, { s: e.s, type: POSE[sk.type] ?? "zone", at: now });
        // the basic attack's jade crescent; an art draws its own effect (the "art" event)
        if (!e.a) addFx("melee/sword-slash", p.x + e.ax * 10, p.y - 2, { flip: e.ax < 0, palette: JADE }, null, 0, 1.4);
        break;
      }
      case "art": {
        const a = ARTS[e.a];
        if (!a?.fx || a.at === "bolt") break;
        // an aura that loops (a shield, a halo, rage) lasts as long as the buff it shows
        const flip = e.f < 0, k = artScale(a), life = a.life || (a.type === "buff" && effects[a.fx]?.meta.loop ? a.dur : 0);
        if (a.at === "front") addFx(a.fx, e.x + e.f * 6, e.y, { flip }, null, life, k);
        else if (a.at === "self") addFx(a.fx, e.x, e.y, { flip }, e.id, life, k);
        else addFx(a.fx, e.x, e.y, { flip }, null, life, k);
        break;
      }
      case "drop":
        addFx("pickups/loot-beam", e.x, e.y, {}, null, 1.4);
        break;
      case "hit": {
        flashes.set(e.id, now);
        const t = posOf(e.id, s);
        if (t) {
          texts.push({ x: t.x + (Math.random() * 12 - 6), y: t.y - 70, s: `-${e.d}`, color: e.id === myId ? "#ff6060" : "#ffffff", at: now });
          if (fxs.length < 30) addFx("impacts/hit-spark", t.x, t.y - 30, { flip: Math.random() < 0.5 });
        }
        break;
      }
      case "die": {
        const t = posOf(e.id, s);
        if (t) addFx("spawn/poof", t.x, t.y, {});
        break;
      }
      case "spawn": {
        const t = posOf(e.id, s);
        if (t && s.P.has(e.id)) addFx("arcane/blink-in", t.x, t.y, { palette: GOLD });
        break;
      }
      case "lvl": {
        const t = posOf(e.id, s);
        if (t) addFx("ui/level-up", t.x, t.y, { palette: GOLD }, e.id);
        if (e.id === myId) toast(`Đột phá! ${realmName(e.lv)}`);
        break;
      }
      case "loot":
        if (e.id === myId) texts.push({ x: e.x, y: e.y - 80, s: `+${e.exp} tu vi${e.stones ? ` +${e.stones} linh thạch` : ""}`, color: "#ffd84a", at: now });
        break;
      case "item": {
        const t = posOf(e.id, s);
        if (t) addFx("holy/heal", t.x, t.y, {}, e.id);
        break;
      }
      case "fx":
        if (e.k === "thunder") addFx("lightning/lightning-strike", e.x, e.y, {});
        break;
      case "boom":
        addFx("impacts/hit-spark", e.x, e.y - 30, { palette: JADE });
        break;
    }
  }

  // ---------------------------------------------------------------- input
  const keys = new Set();
  let joy = { dx: 0 }, mouse = null, sentIn = { dx: 9 }, lastSent = 0, lastDir = { x: 1, y: 0 }, jumpBtn = false, jumpDown = false;
  const chatInput = $("chatInput");
  addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) {
      if (e.key === "Enter") {
        if (chatInput.value.trim()) send({ t: "chat", m: chatInput.value });
        chatInput.value = "";
        chatInput.blur();
      } else if (e.key === "Escape") chatInput.blur();
      return;
    }
    if (e.key === "Enter") {
      chatInput.focus();
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === " ") e.preventDefault();
    // J: the basic attack; K L U I O (or 1-5): the five arts on the bar; Z X: the two pills
    const sk = { j: 0, k: 1, l: 2, u: 3, i: 4, o: 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 }[k];
    if (sk !== undefined && !e.repeat) cast(sk);
    if (k === "z" && !e.repeat) use("hoixuan");
    if (k === "x" && !e.repeat) use("tukhi");
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  view.addEventListener("mousemove", (e) => {
    const r = view.getBoundingClientRect();
    mouse = { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  });
  view.addEventListener("mousedown", (e) => {
    if (e.button === 0) cast(0);
    if (e.button === 2) cast(1);
  });
  view.addEventListener("contextmenu", (e) => e.preventDefault());
  for (const b of document.querySelectorAll("[data-skill]")) b.addEventListener("pointerdown", (e) => (e.preventDefault(), cast(+b.dataset.skill)));
  // the jump button: held while the thumb is on it; sliding the thumb down off it drops through a plank or cloud instead
  const jb = $("jumpBtn");
  let jb0 = 0;
  const appY = (e) => (document.body.classList.contains("rotated") ? innerWidth - e.clientX : e.clientY);
  jb.addEventListener("pointerdown", (e) => (e.preventDefault(), jb.setPointerCapture(e.pointerId), (jb0 = appY(e)), (jumpBtn = true)));
  jb.addEventListener("pointermove", (e) => jumpBtn && (jumpDown = appY(e) - jb0 > 24));
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) jb.addEventListener(ev, () => (jumpBtn = jumpDown = false));
  for (const b of document.querySelectorAll("[data-item]")) b.addEventListener("pointerdown", (e) => (e.preventDefault(), use(b.dataset.item)));

  // the joystick: left and right only (jumping has its own button), wherever the thumb lands in the left part of the screen
  const pad = $("joyzone"), knob = $("joyknob"), base = $("joybase");
  let joyId = null, joy0 = null;
  // pointer position in the app's own (possibly rotated) frame
  const appXY = (e) => (document.body.classList.contains("rotated") ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });
  pad.addEventListener("pointerdown", (e) => {
    joyId = e.pointerId;
    joy0 = appXY(e);
    pad.setPointerCapture(e.pointerId);
    // the base goes under the thumb: pad.offsetLeft/Top are in the app's own frame, rotated or not
    base.style.cssText = `left: ${joy0.x - pad.offsetLeft}px; top: ${joy0.y - pad.offsetTop}px; bottom: auto; margin: -30px 0 0 -74px`;
    base.classList.add("on");
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyId) return;
    const dx = appXY(e).x - joy0.x, R = 46, k = Math.max(-R, Math.min(R, dx));
    knob.style.transform = `translateX(${k}px)`;
    joy = { dx: Math.abs(dx) < 8 ? 0 : k / R };
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joy = { dx: 0 };
    knob.style.transform = "";
    base.classList.remove("on");
    // back to its resting place
    base.style.cssText = "";
  };
  pad.addEventListener("pointerup", joyEnd);
  pad.addEventListener("pointercancel", joyEnd);

  // side view: left and right along the ground, jump, and down (down + jump drops through a plank)
  let jumpHeld = false, jumpUntil = 0;
  function inputDir() {
    let dx = Math.abs(joy.dx) > 0.25 ? Math.sign(joy.dx) * Math.min(1, Math.abs(joy.dx) * 1.4) : 0;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;
    dx = Math.max(-1, Math.min(1, dx));
    const jump = jumpBtn || keys.has("w") || keys.has("arrowup") || keys.has(" ");
    const down = keys.has("s") || keys.has("arrowdown") || jumpDown;
    const now = performance.now() / 1000;
    if (jump && !jumpHeld) jumpUntil = now + PHYS.JUMP_BUFFER;
    jumpHeld = jump;
    if (Math.abs(dx) > 0.2) lastDir = { x: Math.sign(dx), y: 0 };
    return { dx: +dx.toFixed(2), jump, down };
  }
  function pumpInput(now) {
    const d = inputDir();
    if (d.dx !== sentIn.dx || d.jump !== sentIn.jump || d.down !== sentIn.down || now - lastSent > 0.5) {
      send({ t: "in", ...d });
      sentIn = d;
      lastSent = now;
    }
  }
  // where to aim: the mouse on a computer; on a phone, the nearest enemy in reach, else the way you last moved
  function aim() {
    const self = drawn.get(myId);
    if (!self) return { ax: 1, ay: 0 };
    if (mouse && !touch) {
      const dx = mouse.x + camX - self.x, dy = mouse.y + camY - (self.y - 30);
      return { ax: dx, ay: dy };
    }
    let best = null, bd = 260;
    const arena = !!map?.pvp;
    for (const e of drawn.values()) {
      if (e.id === myId || e.dead) continue;
      if (e.kind === "p" && !arena) continue;
      if (e.kind === "s") continue;
      const d = Math.hypot(e.x - self.x, e.y - self.y);
      if (d < bd) (bd = d), (best = e);
    }
    return best ? { ax: best.x - self.x, ay: best.y - self.y } : { ax: lastDir.x, ay: lastDir.y };
  }
  function cast(i) {
    // an empty slot opens the list of arts, to put one there
    if (i > 0 && !arts.slots[i - 1]) return openArts?.(i - 1);
    if (!me || me.respawn > 0) return;
    if (me.cd[i] > 0.05) return;
    send({ t: "cast", s: i, ...aim() });
  }
  function use(item) {
    if ((inv[item] ?? 0) <= 0) return toast(`Hết ${ITEMS[item].name}. Mua thêm ở Đan Các.`);
    send({ t: "use", item });
  }

  // ---------------------------------------------------------------- HUD
  // the "?" by the counters: what each icon means, for whoever is new
  const legend = $("legend"), legendBtn = $("legendBtn");
  legendBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    legend.hidden = !legend.hidden;
    legendBtn.setAttribute("aria-expanded", String(!legend.hidden));
  });
  for (const ev of ["pointerdown", "keydown"])
    addEventListener(ev, (e) => {
      if (!legend.hidden && !legend.contains(e.target) && e.target !== legendBtn) (legend.hidden = true), legendBtn.setAttribute("aria-expanded", "false");
    });

  const myInfo = () => infos.get(myId);
  function renderMe() {
    const info = myInfo();
    if (!me || !info) return;
    const cls = CLASSES[CLASS];
    $("hpFill").style.width = `${(100 * me.hp) / me.maxHp}%`;
    $("hpText").textContent = `${me.hp} / ${me.maxHp}`;
    const lo = expForLevel(me.lv), hi = me.lv >= MAX_LEVEL ? lo + 1 : expForLevel(me.lv + 1);
    $("expFill").style.width = `${me.lv >= MAX_LEVEL ? 100 : (100 * (me.exp - lo)) / (hi - lo)}%`;
    $("expText").textContent = me.lv >= MAX_LEVEL ? "Viên mãn" : `${me.exp - lo} / ${hi - lo}`;
    $("realm").textContent = realmName(me.lv);
    $("myName").textContent = info.name;
    $("stones").textContent = me.stones;
    $("rank").textContent = me.rank;
    $("kd").textContent = `${me.kills}/${me.deaths}`;
    // buffs from an admin (event prizes and the like): stat, percent, time left
    const left = (sec) => (sec === null ? "" : sec >= 3600 ? ` ${Math.floor(sec / 3600)}g${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}` : ` ${Math.ceil(sec / 60)}p`);
    const line = $("statLine");
    line.replaceChildren(`Công ${me.atk} · Thủ ${me.def}`);
    for (const b of me.buffs ?? []) {
      const s = document.createElement("span"), img = new Image();
      s.className = "buff";
      s.title = BUFF_STATS[b.stat]?.name ?? b.stat;
      img.src = `/xianxia/ui/ui_xianxia_${BUFF_ICON[b.stat] ?? "status_seal"}.png`;
      img.alt = "";
      s.append(img, `${b.pct > 0 ? "+" : ""}${b.pct}%${left(b.left)}`);
      line.append(s);
    }
    showCooldowns();
    $("respawn").hidden = !(me.respawn > 0);
    $("respawnT").textContent = Math.ceil(me.respawn);
    $("medLeft").textContent = me.medLeft;
  }
  // the basic attack and the five slots: what's on each, and how long until it's ready
  const slotSkill = (i) => (i === 0 ? CLASSES[CLASS].skills[0] : ARTS[arts.slots[i - 1]]);
  function showCooldowns() {
    for (let i = 0; i <= ART_SLOTS; i++) {
      const b = document.querySelector(`[data-skill="${i}"]`), sk = slotSkill(i), left = me?.cd?.[i] ?? 0;
      if (!b) continue;
      b.style.setProperty("--cd", sk && left > 0 ? Math.min(1, left / sk.cd) : 0);
      b.querySelector(".cdt").textContent = sk && left > 0.05 ? left.toFixed(left < 3 ? 1 : 0) : "";
    }
  }
  function renderSlots() {
    const b0 = document.querySelector('[data-skill="0"]');
    b0.querySelector(".nm").textContent = CLASSES[CLASS].skills[0]?.name ?? "";
    for (let i = 1; i <= ART_SLOTS; i++) {
      const b = document.querySelector(`[data-skill="${i}"]`), a = ARTS[arts.slots[i - 1]];
      b.classList.toggle("empty", !a);
      b.title = a ? a.name : "Ô trống: chạm để gán công pháp";
      b.querySelector(".nm").textContent = a ? a.name : "";
      if (!a) b.style.removeProperty("--icon");
      else {
        const key = a.key;
        artIcon(key, (url) => arts.slots[i - 1] === key && url && b.style.setProperty("--icon", `url(${url})`));
      }
    }
    showCooldowns();
  }
  renderSlots();
  function renderInv() {
    for (const b of document.querySelectorAll("[data-item]")) b.querySelector(".qty").textContent = inv[b.dataset.item] ?? 0;
  }
  function logLine(name, text, kind = "") {
    const box = $("log"), d = document.createElement("div");
    d.className = `line ${kind}`;
    if (name) {
      const n = document.createElement("b");
      n.textContent = `${name}: `;
      d.append(n);
    }
    d.append(document.createTextNode(text));
    box.append(d);
    while (box.children.length > 40) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }
  let toastTimer = 0;
  function toast(m) {
    const t = $("toast");
    t.textContent = m;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
  }
  function zoneBanner(title, sub) {
    const b = $("zone");
    b.innerHTML = "";
    const h = document.createElement("div");
    h.textContent = title;
    const s = document.createElement("small");
    s.textContent = sub;
    b.append(h, s);
    b.classList.remove("on");
    void b.offsetWidth;
    b.classList.add("on");
  }

  // ---------------------------------------------------------------- drawing
  function resize() {
    const box = $("game"), w = box.clientWidth, h = box.clientHeight;
    // about 560 px of the world top to bottom: the town reads at a glance, characters stay crisp
    VH = 480;
    VW = Math.max(720, Math.min(1300, Math.round((VH * w) / Math.max(1, h)) & ~1));
    view.width = VW;
    view.height = VH;
    frame = createFrame(VW, VH);
    img = ctx.createImageData(VW, VH);
    bgBuf = new Uint32Array(VW * VH);
    const dpr = Math.min(2, devicePixelRatio || 1);
    labels.width = Math.round(w * dpr);
    labels.height = Math.round(h * dpr);
    scale = (w * dpr) / VW;
  }
  addEventListener("resize", resize);
  resize();


  let camX = 0, camY = 0;
  const drawn = new Map(); // id -> what's on screen this frame
  let offSince = null, camFX = null, camFY = null, focusY = null;
  function interpolated(now) {
    drawn.clear();
    if (!snaps.length) return;
    const rt = now - INTERP;
    let a = snaps[0], b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--)
      if (snaps[i - 1].at <= rt) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    const u = b.at > a.at ? Math.max(0, Math.min(1, (rt - a.at) / (b.at - a.at))) : 1;
    const lerp = (kind, mapA, mapB) => {
      for (const [id, eb] of mapB) {
        const ea = mapA.get(id) ?? eb;
        drawn.set(id, { ...eb, kind, x: ea.x + (eb.x - ea.x) * u, y: ea.y + (eb.y - ea.y) * u, dead: eb.f & 1 });
      }
    };
    lerp("p", a.P, b.P);
    lerp("m", a.M, b.M);
    // you: moved here by the same physics as the server, straight from what you press, and pulled back to the server's
    // word when the two drift apart (a long way: snap; a little, while you stand still: ease)
    const last = snaps[snaps.length - 1].P.get(myId), self = drawn.get(myId);
    if (last && self) {
      if (!body || last.f & 1) body = { x: last.x, y: last.y, vx: 0, vy: 0, ground: false, dropUntil: 0 };
      // the server's word is always a little behind (the trip there and back, and its 20 ticks a second), so in mid-air the
      // two can be a jump apart without anything being wrong: only a big split snaps; on the ground, both standing, a small
      // one eases back, and a height that stays different for a while (a plank one side thinks it's on) settles to the server's
      const dx = Math.abs(body.x - last.x), dy = Math.abs(body.y - last.y), bothDown = body.ground && !(last.f & 128);
      if (dx > 120 || dy > 200) Object.assign(body, { x: last.x, y: last.y, vy: 0 });
      else if (bothDown && !(last.f & 32) && (dx > 0.5 || dy > 0.5)) {
        body.x += (last.x - body.x) * 0.2;
        if (dy > 0.5 && (offSince ??= now) < now - 0.35) Object.assign(body, { y: last.y, vy: 0 });
      }
      if (!(bothDown && dy > 0.5)) offSince = null;
      self.x = body.x;
      self.y = body.y;
      self.f = (self.f & ~128) | (body.ground ? 0 : 128);
    }
  }
  function predict(dt, now) {
    const last = snaps[snaps.length - 1]?.P.get(myId), info = myInfo();
    if (!body || !last || last.f & 1 || !info) return;
    const c = CLASSES[CLASS];
    const spd = c.spd * (last.f & 4 ? 0.5 : 1) * (last.f & 64 ? 0.45 : 1) * PHYS.RUN;
    const inp = inputDir(), wasGround = body.ground;
    stepBody(body, { ...inp, jump: inp.jump || jumpUntil > now }, spd, dt, map, now);
    if (wasGround && !body.ground) jumpUntil = 0;
  }


  // lanterns glowing, the spirit vein breathing, and the gold arrow over the way out
  const WARM = hex("#ffb84a"), WARM2 = hex("#ffe08a"), VEIN = hex("#7ff0ff"), GOLDC = GOLD.map(hex);
  const ARROW = ["..###..", "..#5#..", "..#5#..", "..#5#..", "#######", ".#555#.", "..#5#..", "...#..."];
  function drawScenery(p, now, dt, on) {
    p.place(0, 0, false);
    p.fade = 1;
    p.lightK = 1;
    for (const [x, y] of scene.lanterns) {
      if (!on(x, y)) continue;
      const f = 0.85 + 0.15 * Math.sin(now * 9 + x) * Math.sin(now * 5.3 + y);
      p.glow(x - camX, y - camY, 30, WARM, 0.3 * f);
      p.glow(x - camX, y - camY, 8, WARM2, 0.55 * f);
    }
    // the taiji floating over its dais, turning; brighter while someone cultivates
    const s = map.spring, sx = (s.x0 + s.x1) / 2;
    if (on(sx, s.y, 300)) {
      const busy = [...drawn.values()].some((e) => e.kind === "p" && e.f & 16), cx = Math.round(sx - camX), cy = Math.round(s.y - camY - 128 + Math.sin(now * 1.3) * 4);
      taiji(p, cx, cy, 15, now * (busy ? 1.6 : 0.5));
      p.glow(cx, cy, 34, VEIN, (busy ? 0.4 : 0.18) + 0.06 * Math.sin(now * 2));
      for (let i = 0; i < 6; i++) {
        const u = (now * 0.5 + i / 6) % 1;
        p.px(cx + Math.sin(i * 1.7 + now) * 30, s.y - camY - 8 - u * 70, VEIN);
      }
    }
    for (const g of map.portals) {
      if (!on(g.x, g.y)) continue;
      const ax = Math.round(g.x - camX);
      // a ring of light turning on the step under it
      for (let i = 0; i < 56; i++) {
        const a = (i / 56) * Math.PI * 2 + now * 1.5;
        p.px(ax + Math.cos(a) * 30, g.y - camY + Math.sin(a) * 9, GOLDC[i % 4 ? 4 : 6]);
      }
      p.glow(ax, g.y - camY, 44, GOLDC[3], 0.35);
    }
  }

  // a yin-yang disc of radius r turned by angle a: light and dark halves, each with its eye
  const YIN = hex("#1c2036"), YANG = hex("#f4f0e6"), RIM = hex("#e8b438");
  function taiji(p, cx, cy, r, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let y = -r - 1; y <= r + 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 1) continue;
        if (d > r - 0.5) {
          p.px(cx + x, cy + y, RIM);
          continue;
        }
        // rotate into the symbol's own frame
        const u = x * ca + y * sa, v = -x * sa + y * ca, h = r / 2;
        let light = u < 0;
        if (Math.hypot(u, v - h) < h) light = true;
        if (Math.hypot(u, v + h) < h) light = false;
        if (Math.hypot(u, v - h) < r / 7) light = false;
        if (Math.hypot(u, v + h) < r / 7) light = true;
        p.px(cx + x, cy + y, light ? YANG : YIN);
      }
  }

  // the arrow floats in front of everything
  function drawPortalArrows(p, now, on) {
    p.place(0, 0, false);
    p.fade = 1;
    p.lightK = 1;
    for (const g of map.portals) {
      if (!on(g.x, g.y)) continue;
      const bob = Math.round(Math.sin(now * 3.2) * 6), ax = Math.round(g.x - camX), ay = Math.round(g.y - camY - 100 + bob), Z = 5;
      // the arrow, pointing down: a gold rim, its core flickering white-hot, light pooling under it
      ARROW.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const c = ch === "5" ? GOLDC[Math.floor(now * 8 + y) % 2 ? 5 : 6] : GOLDC[3];
        p.rect(ax - 17 + x * Z, ay + y * Z, Z, Z, c);
      }));
      p.glow(ax, ay + 16, 30, GOLDC[4], 0.6 + 0.25 * Math.sin(now * 6));
      // motes rising up the beam between the arrow and the ring
      for (let i = 0; i < 8; i++) {
        const u = (now * 0.8 + i / 8) % 1;
        p.px(ax + Math.sin(i * 2.3 + now) * 14, g.y - camY - u * 60, GOLDC[u < 0.5 ? 6 : 4]);
      }
    }
  }

  // cherry petals drifting across the town
  const petals = [];
  const PINK = ["#ffd0e0", "#ffa8c8", "#f080a8"].map(hex);
  function drawPetals(p, now, dt) {
    while (petals.length < 36) petals.push({ x: camX + Math.random() * (VW + 200) - 100, y: camY - Math.random() * VH, vx: 12 + Math.random() * 14, vy: 16 + Math.random() * 14, ph: Math.random() * 6, c: PINK[(Math.random() * 3) | 0] });
    p.place(0, 0, false);
    for (let i = petals.length - 1; i >= 0; i--) {
      const q = petals[i];
      q.x += (q.vx + Math.sin(now * 2 + q.ph) * 14) * dt;
      q.y += q.vy * dt;
      const sx = q.x - camX, sy = q.y - camY;
      if (sy > VH + 10 || sx > VW + 120 || sx < -140) {
        petals.splice(i, 1);
        continue;
      }
      p.px(sx, sy, q.c);
      if (Math.sin(now * 5 + q.ph) > 0) p.px(sx + 1, sy, q.c);
    }
  }

  let lastT = performance.now() / 1000;
  function render() {
    if (!alive) return;
    const now = performance.now() / 1000, dt = Math.min(0.05, now - lastT);
    lastT = now;
    pumpInput(now);
    if (!scene) {
      requestAnimationFrame(render);
      return;
    }
    predict(dt, now);
    interpolated(now);
    const self = drawn.get(myId);
    if (self) {
      // across: straight on you. Up and down: the camera holds the level you jumped from, moves only when you land
      // somewhere else or leave the frame, and eases there instead of jumping, so a hop never shakes the whole world
      const grounded = !(self.f & 128);
      if (focusY === null || grounded) focusY = self.y;
      else if (self.y < focusY - 150) focusY = self.y + 150;
      else if (self.y > focusY + 40) focusY = self.y - 40;
      const tx = Math.max(0, Math.min(map.w - VW, self.x - VW / 2)), ty = Math.max(0, Math.min(map.h - VH, focusY - 40 - VH * 0.6));
      if (camFX === null || Math.abs(ty - camFY) > VH) (camFX = tx), (camFY = ty);
      camFX = tx;
      camFY += (ty - camFY) * (1 - Math.exp(-dt * 6));
      camX = Math.round(camFX);
      camY = Math.round(camFY);
    }
    scene.paint(bgBuf, VW, VH, camX, camY, now);
    clearFrame(frame);
    const p = painterFor(frame), on = (x, y, m = 140) => x > camX - m && x < camX + VW + m && y > camY - m && y < camY + VH + m * 1.5;
    const place = (fx, x, y) => {
      fx.options.x = Math.round(x - camX);
      fx.options.y = Math.round(y - camY);
    };
    for (const a of ambient) {
      a.fx.update(dt);
      if (on(a.x, a.y)) (place(a.fx, a.x, a.y), a.fx.draw(frame, "back"));
    }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      f.fx.update(dt);
      if (f.follow) {
        const e = drawn.get(f.follow);
        if (e) (f.x = e.x), (f.y = e.y);
      }
      if (f.until && now > f.until) (f.fx.stop(), (f.until = 0));
      if (f.fx.done()) fxs.splice(i, 1);
    }
    for (const f of fxs) if (on(f.x, f.y)) drawFx(f.fx, "back", f.x, f.y, f.k);
    drawScenery(p, now, dt, on);
    // everyone, back to front
    const list = [...drawn.values()].filter((e) => on(e.x, e.y)).sort((a, b) => a.y - b.y);
    for (const e of list) drawEntity(p, e, now);
    const live = new Set();
    for (const b of snaps[snaps.length - 1]?.B ?? []) {
      const a = b[6] && ARTS[b[6]];
      if (!a || !a.fx) drawBolt(p, b, now);
      else if (a.at === "bolt") {
        // the art's own effect rides the projectile, turned the way it flies
        live.add(b[0]);
        let f = boltFx.get(b[0]);
        if (!f && effects[a.fx]) boltFx.set(b[0], (f = createFx(effects[a.fx], { seed: b[0], flip: b[4] < 0, actor: BLANK_ACTOR })));
        if (!f) continue;
        f.update(dt);
        drawFx(f, "back", b[2], b[3] - 30, artScale(a));
        drawFx(f, "front", b[2], b[3] - 30, artScale(a));
      }
      // an art whose effect already shows the throw (at: front) flies unseen
    }
    for (const id of boltFx.keys()) if (!live.has(id)) boltFx.delete(id);
    for (const f of fxs) if (on(f.x, f.y)) drawFx(f.fx, "front", f.x, f.y, f.k);
    for (const a of ambient) if (on(a.x, a.y)) (place(a.fx, a.x, a.y), a.fx.draw(frame, "front"));
    drawPortalArrows(p, now, on);
    drawPetals(p, now, dt);
    composite(frame, img.data, bgBuf);
    ctx.putImageData(img, 0, 0);
    drawLabels(list, now);
    if (me) {
      // count cooldowns down between server updates
      me.cd = me.cd.map((c) => Math.max(0, c - dt));
      if (me.respawn > 0) me.respawn = Math.max(0, me.respawn - dt);
      showCooldowns();
    }
    requestAnimationFrame(render);
  }

  function drawEntity(p, e, now) {
    const sx = Math.round(e.x - camX), sy = Math.round(e.y - camY), flash = now - (flashes.get(e.id) ?? -9) < 0.08;
    if (e.kind === "p") {
      const info = infos.get(e.id);
      if (!info || e.dead) return;
      if (e.f & 8 && Math.floor(now * 10) & 1) return; // just respawned: blinking
      p.place(sx, sy, e.face < 0);
      // a shadow, and an aura while cultivating
      if (!(e.f & 128)) shadow(p, 13);
      if (e.f & 16) {
        p.glow(0, -30, 30, hex("#7ff0ff"), 0.25 + 0.1 * Math.sin(now * 3));
        if (Math.random() < 0.3) texts.push({ x: e.x + (Math.random() * 30 - 15), y: e.y - 20, s: "✦", color: "#9ff8ff", at: now, rise: 40 });
      }
      const c = casts.get(e.id), age = c ? now - c.at : 9;
      drawAvatar(p, info.look, { t: now + e.id, moving: !!(e.f & 32), air: !!(e.f & 128), meditating: !!(e.f & 16), cast: c && age < 0.6 ? { ...c, age } : null, busy: !!(e.f & 64), slow: !!(e.f & 4), flash });
    } else if (e.kind === "m") {
      if (e.dead) return;
      if (e.type === "dummy") {
        p.place(sx, sy, false);
        shadow(p, 12);
        const hit = now - (flashes.get(e.id) ?? -9);
        drawDummy(p, hit < 0.6 ? Math.round(Math.sin(hit * 30) * 3 * (1 - hit / 0.6)) : 0, flash);
      } else {
        let g = ghosts.get(e.id);
        if (!g) ghosts.set(e.id, (g = createFx(effects["critters/ghost"], { seed: e.id })));
        g.update(1 / 60);
        g.options.x = sx;
        g.options.y = sy - 6;
        g.options.flip = e.face < 0;
        p.place(sx, sy, false);
        shadow(p, 11);
        g.draw(frame, "back");
        g.draw(frame, "front");
        if (flash) p.glow(0, -26, 16, WHITE, 0.8);
        if (e.f & 4) p.glow(0, -26, 18, hex("#a060ff"), 0.4);
      }
    }
  }
  const ghosts = new Map();
  // a soft shadow under the feet: truly translucent, not dithered
  const BLACK = hex("#000000");
  function shadow(p, rx) {
    p.fade = 1;
    p.lightK = 1;
    for (let y = -1; y <= 1; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y * y) / 4));
      for (let x = -w; x <= w; x++) p.blend(x, y + 1, BLACK, 0.32);
    }
  }

  function drawBolt(p, b, now) {
    // a flying sword: the thrower's own weapon, point first, a fading trail of qi behind it
    const [, owner, x, y, vx, vy] = b, sx = x - camX, sy = y - camY - 30, a = Math.atan2(vy, vx), cx = Math.cos(a), cy = Math.sin(a);
    p.place(sx, sy, false);
    for (let i = 6; i < 26; i++) p.dot(-cx * i * 1.2, -cy * i * 1.2, hex(JADE[i < 12 ? 4 : 2]), 1 - i / 26);
    const w = infos.get(owner)?.look?.weapon;
    if (w !== undefined) drawWeapon(p, w, 0, 0, a);
    else for (let i = -6; i <= 6; i++) p.px(cx * i, cy * i, i > 3 ? WHITE : hex("#d8f0ff"));
    p.glow(0, 0, 12, hex(JADE[4]), 0.5);
  }

  function drawLabels(list, now) {
    const c = lctx, k = scale;
    c.clearRect(0, 0, labels.width, labels.height);
    c.textAlign = "center";
    c.textBaseline = "bottom";
    c.lineJoin = "round";
    for (const e of list) {
      if (e.dead) continue;
      const x = (e.x - camX) * k;
      let top, name, color, hp = e.hp;
      if (e.kind === "p") {
        const info = infos.get(e.id);
        if (!info) continue;
        top = (e.y - camY - avatarTop(info.look) - 4) * k;
        name = `${info.name} · ${realmName(info.lv)}`;
        color = e.id === myId ? "#fff6c8" : info.look?.g === "f" ? "#ffb8d8" : "#a8e0ff";
      } else {
        top = (e.y - camY - (e.type === "dummy" ? 58 : 66)) * k;
        name = MONSTERS[e.type].name;
        color = e.type === "ghost" ? "#ff9a9a" : "#d8c890";
      }
      const fs = Math.max(10, Math.round(5.2 * k));
      c.font = `600 ${fs}px system-ui, sans-serif`;
      c.lineWidth = Math.max(2, fs / 4);
      c.strokeStyle = "rgba(0,0,0,.85)";
      c.strokeText(name, x, top - fs * 0.5);
      c.fillStyle = color;
      c.fillText(name, x, top - fs * 0.5);
      const w = 22 * k, h = Math.max(3, 1.6 * k);
      c.fillStyle = "rgba(0,0,0,.7)";
      c.fillRect(x - w / 2 - 1, top - fs * 0.35, w + 2, h + 2);
      c.fillStyle = hp > 0.5 ? "#5ad06a" : hp > 0.25 ? "#e8c040" : "#e04848";
      c.fillRect(x - w / 2, top - fs * 0.35 + 1, w * Math.max(0, hp), h);
    }
    for (const g of map.portals) {
      const x = (g.x - camX) * k, y = (g.y - camY - 104) * k;
      if (x < -200 || y < -50 || x > labels.width + 200 || y > labels.height + 50) continue;
      const fs = Math.max(11, Math.round(5.6 * k));
      c.font = `800 ${fs}px system-ui, sans-serif`;
      c.lineWidth = Math.max(2, fs / 4);
      c.strokeStyle = "rgba(0,0,0,.85)";
      c.strokeText("Lối ra", x, y);
      c.fillStyle = "#ffe08a";
      c.fillText("Lối ra", x, y);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i], age = now - t.at;
      if (age > 1.1) {
        texts.splice(i, 1);
        continue;
      }
      const fs = Math.max(10, Math.round((t.rise ? 4 : 6) * k));
      c.font = `800 ${fs}px system-ui, sans-serif`;
      c.globalAlpha = Math.min(1, 2 * (1.1 - age));
      const x = (t.x - camX) * k, y = (t.y - camY - age * (t.rise ?? 24)) * k;
      c.lineWidth = Math.max(2, fs / 4);
      c.strokeStyle = "rgba(0,0,0,.85)";
      c.strokeText(t.s, x, y);
      c.fillStyle = t.color;
      c.fillText(t.s, x, y);
      c.globalAlpha = 1;
    }
  }

  requestAnimationFrame(render);
  return {
    close() {
      alive = false;
      ws.close();
    },
    setInventory(v) {
      inv = v;
      renderInv();
    },
    // any pill, including ones an admin added that have no button of their own on the HUD
    use,
    inventory: () => inv,
    arts: () => arts,
    // the panel changed the bar: show it now (the server confirms with an "arts" message too)
    setArts(v) {
      arts = { slots: v.slots, learned: v.learned };
      renderSlots();
    },
    refreshSlots: renderSlots,
  };
}
