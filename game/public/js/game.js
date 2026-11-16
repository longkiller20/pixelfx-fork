// The game in the browser: it shows what the server says is happening, and sends what the player presses.
import { createFrame, clearFrame, createFx, composite, painterFor, PAL, hex, WHITE } from "/pixelfx/core/index.js";
import { effects } from "/pixelfx/fx/index.js";
import { WORLD, ZONES, zoneAt, SPRING, CLASSES, MONSTERS, ITEMS, expForLevel, realmName, MAX_LEVEL } from "/shared/balance.js";
import { LOOKS, drawCharacter, drawDummy, drawPuppet, dragon, MOUTH, paintWorld, GROUND } from "./art.js";

const CLS = Object.keys(CLASSES), MTYPES = ["dummy", "ghost"];
const GOLD = ["#2a1604", "#6a3a08", "#b8700e", "#f0a820", "#ffd84a", "#fff2a8", "#ffffff"];
const JADE = ["#04120c", "#0b2a1e", "#145a3a", "#22a06a", "#5cf0a0", "#c8ffe0", "#ffffff"];
const INTERP = 0.11; // seconds behind the newest snapshot that others are drawn at
const $ = (id) => document.getElementById(id);

export function startGame({ token, character, inventory, api, onFatal, touch }) {
  const view = $("view"), labels = $("labels"), ctx = view.getContext("2d"), lctx = labels.getContext("2d");
  let VW = 640, VH = 360, frame, img, bgBuf, scale = 1;
  const worldBg = paintWorld();

  // ---------------------------------------------------------------- state from the server
  let myId = 0, me = null, inv = { ...inventory };
  const infos = new Map(); // player id -> { name, cls, lv }
  const snaps = []; // { at, P: Map, M: Map, S: Map, B: [] }
  const casts = new Map(); // entity id -> { s, type, at }
  const flashes = new Map(); // entity id -> time of last hit
  const fxs = []; // live effects: { fx, x, y, follow, until }
  const texts = []; // floating numbers: { x, y, s, color, at }
  const drains = [];
  const dragons = new Map(); // player id -> { at, ax, ay }
  const ambient = [];
  let lastZone = null, alive = true;

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
        inv = m.inv;
        for (const p of m.players) infos.set(p.id, p);
        renderInv();
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
      case "s":
        onSnapshot(m);
        break;
      case "chat":
        logLine(m.n, m.m);
        break;
      case "feed":
        logLine(null, m.m, "sys");
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
    const s = { at: performance.now() / 1000, k: m.k, P: new Map(), M: new Map(), S: new Map(), B: m.B };
    for (const a of m.P) s.P.set(a[0], { id: a[0], x: a[1], y: a[2], face: a[3], hp: a[4] / 1000, f: a[5] });
    for (const a of m.M) s.M.set(a[0], { id: a[0], type: MTYPES[a[1]], x: a[2], y: a[3], face: a[4], hp: a[5] / 1000, f: a[6] });
    for (const a of m.S) s.S.set(a[0], { id: a[0], owner: a[1], x: a[2], y: a[3], face: a[4], bite: a[5] });
    snaps.push(s);
    while (snaps.length > 30) snaps.shift();
    for (const e of m.E) onEvent(e, s);
  }

  const posOf = (id, s = snaps[snaps.length - 1]) => s?.P.get(id) ?? s?.M.get(id) ?? s?.S.get(id);
  function addFx(id, x, y, opts = {}, follow = null) {
    const mod = effects[id];
    if (!mod || fxs.length > 48) return;
    fxs.push({ fx: createFx(mod, { seed: (Math.random() * 1e6) | 0, ...opts }), x, y, follow, dy: opts.dy ?? 0 });
  }
  function onEvent(e, s) {
    const now = performance.now() / 1000;
    switch (e.e) {
      case "cast": {
        const p = s.P.get(e.id), info = infos.get(e.id);
        if (!p || !info) break;
        const sk = CLASSES[info.cls].skills[e.s];
        casts.set(e.id, { s: e.s, type: sk.type, at: now });
        const flip = e.ax < 0;
        if (sk.type === "melee") addFx("melee/claw-swipe", p.x + e.ax * 8, p.y, { flip, palette: PAL.fire }, null);
        if (sk.type === "breath") dragons.set(e.id, { at: now, ax: e.ax, ay: e.ay });
        if (sk.type === "transform") {
          if (info.cls === "time") addFx("arcane/magic-circle-cast", p.x, p.y, { palette: GOLD }, e.id);
          else addFx("arcane/mana-burst", p.x, p.y - 30, { palette: PAL.fire }, e.id);
        }
        if (sk.type === "summon") addFx("spawn/poof", p.x + p.face * 26, p.y, { palette: JADE });
        break;
      }
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
        if (e.k === "timestop") addFx("arcane/time-stop", e.x, e.y, { palette: GOLD });
        if (e.k === "devour") drains.push({ from: e.from, to: e.to, at: now });
        break;
      case "boom":
        addFx("impacts/hit-spark", e.x, e.y - 30, { palette: e.k === "time" ? GOLD : JADE });
        break;
      case "unsummon":
        addFx("spawn/poof", e.x, e.y, { palette: JADE });
        break;
    }
  }

  // ---------------------------------------------------------------- input
  const keys = new Set();
  let joy = { dx: 0, dy: 0 }, mouse = null, sentIn = { dx: 9, dy: 9 }, lastSent = 0, lastDir = { x: 1, y: 0 };
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
    const sk = { j: 0, "1": 0, k: 1, "2": 1, l: 2, "3": 2 }[k];
    if (sk !== undefined && !e.repeat) cast(sk);
    if (k === "4" && !e.repeat) use("hoixuan");
    if (k === "5" && !e.repeat) use("tukhi");
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
  for (const b of document.querySelectorAll("[data-item]")) b.addEventListener("pointerdown", (e) => (e.preventDefault(), use(b.dataset.item)));

  // the joystick: wherever the thumb lands in the left part of the screen
  const pad = $("joyzone"), knob = $("joyknob"), base = $("joybase");
  let joyId = null, joy0 = null;
  // pointer position in the app's own (possibly rotated) frame
  const appXY = (e) => (document.body.classList.contains("rotated") ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });
  pad.addEventListener("pointerdown", (e) => {
    joyId = e.pointerId;
    joy0 = appXY(e);
    pad.setPointerCapture(e.pointerId);
    // the base goes under the thumb: pad.offsetLeft/Top are in the app's own frame, rotated or not
    base.style.left = `${joy0.x - pad.offsetLeft}px`;
    base.style.top = `${joy0.y - pad.offsetTop}px`;
    base.classList.add("on");
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyId) return;
    const q = appXY(e), dx = q.x - joy0.x, dy = q.y - joy0.y, l = Math.hypot(dx, dy), R = 46;
    const k = l > R ? R / l : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    joy = l < 8 ? { dx: 0, dy: 0 } : { dx: (dx / l) * Math.min(1, l / R), dy: (dy / l) * Math.min(1, l / R) };
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joy = { dx: 0, dy: 0 };
    knob.style.transform = "";
    base.classList.remove("on");
  };
  pad.addEventListener("pointerup", joyEnd);
  pad.addEventListener("pointercancel", joyEnd);

  function inputDir() {
    let dx = joy.dx, dy = joy.dy;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;
    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    const l = Math.hypot(dx, dy);
    if (l > 1) (dx /= l), (dy /= l);
    if (l > 0.2) lastDir = { x: dx / Math.max(l, 1e-6), y: dy / Math.max(l, 1e-6) };
    return { dx: +dx.toFixed(2), dy: +dy.toFixed(2) };
  }
  function pumpInput(now) {
    const d = inputDir();
    if (d.dx !== sentIn.dx || d.dy !== sentIn.dy || now - lastSent > 0.5) {
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
    const arena = zoneAt(self.x).pvp;
    for (const e of drawn.values()) {
      if (e.id === myId || e.dead) continue;
      if (e.kind === "p" && !(arena && zoneAt(e.x).pvp)) continue;
      if (e.kind === "s") continue;
      const d = Math.hypot(e.x - self.x, e.y - self.y);
      if (d < bd) (bd = d), (best = e);
    }
    return best ? { ax: best.x - self.x, ay: best.y - self.y } : { ax: lastDir.x, ay: lastDir.y };
  }
  function cast(i) {
    if (!me || me.respawn > 0) return;
    if (me.cd[i] > 0.05) return;
    send({ t: "cast", s: i, ...aim() });
  }
  function use(item) {
    if ((inv[item] ?? 0) <= 0) return toast(`Hết ${ITEMS[item].name}. Mua thêm ở Đan Các.`);
    send({ t: "use", item });
  }

  // ---------------------------------------------------------------- HUD
  const myInfo = () => infos.get(myId);
  function renderMe() {
    const info = myInfo();
    if (!me || !info) return;
    const cls = CLASSES[info.cls];
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
    $("statLine").textContent = `Công ${me.atk} · Thủ ${me.def}${me.tf > 0 ? ` · Biến thân ${me.tf.toFixed(0)}s` : ""}`;
    cls.skills.forEach((sk, i) => {
      const b = document.querySelector(`[data-skill="${i}"]`);
      b.querySelector(".nm").textContent = sk.name;
      const left = me.cd[i];
      b.style.setProperty("--cd", left > 0 ? left / sk.cd : 0);
      b.querySelector(".cdt").textContent = left > 0.05 ? left.toFixed(left < 3 ? 1 : 0) : "";
    });
    $("respawn").hidden = !(me.respawn > 0);
    $("respawnT").textContent = Math.ceil(me.respawn);
    $("medLeft").textContent = me.medLeft;
  }
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
  function zoneBanner(z) {
    const b = $("zone");
    b.innerHTML = "";
    const h = document.createElement("div");
    h.textContent = z.name;
    const s = document.createElement("small");
    s.textContent = z.pvp ? "Khu tỷ thí: được phép giao đấu, chỉ số được cân bằng" : z.mobs ? "Bãi luyện võ: bù nhìn rơm và âm hồn" : "Vùng an toàn: đứng yên trong linh mạch để tu luyện";
    b.append(h, s);
    b.classList.remove("on");
    void b.offsetWidth;
    b.classList.add("on");
  }

  // ---------------------------------------------------------------- drawing
  function resize() {
    const box = $("game"), w = box.clientWidth, h = box.clientHeight;
    VH = 360;
    VW = Math.max(480, Math.min(860, Math.round((VH * w) / Math.max(1, h)) & ~1));
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

  // the scenery that moves on its own
  const amb = (id, x, y, o = {}) => ambient.push({ fx: createFx(effects[id], { seed: ambient.length + 1, ...o }), x, y });
  amb("arcane/rune-circle", SPRING.x, SPRING.y + 4, { palette: ["#06141a", "#0c3440", "#14707e", "#28b8c8", "#7ff0ff", "#e0ffff"] });
  for (const [x, y] of [[1270, 240], [1730, 240], [1270, 860], [1730, 860]]) amb("fire/brazier", x, y);
  amb("fire/campfire", 520, 700);
  for (const x of [ZONES[0].x1, ZONES[1].x1]) amb("fire/torch", x - 14, GROUND + 22);

  let camX = 0, camY = 0;
  const drawn = new Map(); // id -> what's on screen this frame
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
    lerp("s", a.S, b.S);
    // you: the newest position, nudged along by what you're pressing so moving feels immediate
    const last = snaps[snaps.length - 1].P.get(myId), self = drawn.get(myId);
    if (last && self) {
      const info = myInfo(), ahead = Math.min(0.1, now - snaps[snaps.length - 1].at), d = inputDir();
      const spd = info ? CLASSES[info.cls].spd * (last.f & 4 ? 0.5 : 1) * (last.f & 64 ? 0.45 : 1) : 90;
      self.x = last.x + (last.f & 1 ? 0 : d.dx * spd * ahead);
      self.y = last.y + (last.f & 1 ? 0 : d.dy * spd * ahead);
    }
  }

  let lastT = performance.now() / 1000;
  function render() {
    if (!alive) return;
    const now = performance.now() / 1000, dt = Math.min(0.05, now - lastT);
    lastT = now;
    pumpInput(now);
    interpolated(now);
    const self = drawn.get(myId);
    if (self) {
      camX = Math.round(Math.max(0, Math.min(WORLD.w - VW, self.x - VW / 2)));
      camY = Math.round(Math.max(0, Math.min(WORLD.h - VH, self.y - 40 - VH / 2)));
      const z = zoneAt(self.x);
      if (z !== lastZone) {
        lastZone = z;
        zoneBanner(z);
        $("game").dataset.zone = z.id;
      }
    }
    // the backdrop window
    for (let y = 0; y < VH; y++) bgBuf.set(worldBg.subarray((y + camY) * WORLD.w + camX, (y + camY) * WORLD.w + camX + VW), y * VW);
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
      if (f.fx.done()) fxs.splice(i, 1);
    }
    for (const f of fxs) if (on(f.x, f.y)) (place(f.fx, f.x, f.y), f.fx.draw(frame, "back"));
    // dragons behind their riders
    for (const [id, d] of dragons) {
      const e = drawn.get(id), age = now - d.at;
      if (!e || age > 1.6) {
        dragons.delete(id);
        continue;
      }
      drawDragon(p, e, d, age, now);
    }
    // everyone, back to front
    const list = [...drawn.values()].filter((e) => on(e.x, e.y)).sort((a, b) => a.y - b.y);
    for (const e of list) drawEntity(p, e, now);
    for (const b of snaps[snaps.length - 1]?.B ?? []) drawBolt(p, b, now);
    for (const f of fxs) if (on(f.x, f.y)) (place(f.fx, f.x, f.y), f.fx.draw(frame, "front"));
    for (const a of ambient) if (on(a.x, a.y)) (place(a.fx, a.x, a.y), a.fx.draw(frame, "front"));
    drawDrains(p, now);
    composite(frame, img.data, bgBuf);
    ctx.putImageData(img, 0, 0);
    drawLabels(list, now);
    if (me) {
      // count cooldowns down between server updates
      me.cd = me.cd.map((c) => Math.max(0, c - dt));
      if (me.respawn > 0) me.respawn = Math.max(0, me.respawn - dt);
      for (let i = 0; i < 3; i++) {
        const b = document.querySelector(`[data-skill="${i}"]`), sk = CLASSES[myInfo()?.cls]?.skills[i];
        if (!sk) continue;
        b.style.setProperty("--cd", me.cd[i] > 0 ? me.cd[i] / sk.cd : 0);
        b.querySelector(".cdt").textContent = me.cd[i] > 0.05 ? me.cd[i].toFixed(me.cd[i] < 3 ? 1 : 0) : "";
      }
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
      // a shadow, and an aura while cultivating or transformed
      shadow(p, 13);
      if (e.f & 16) {
        p.glow(0, -30, 30, hex("#7ff0ff"), 0.25 + 0.1 * Math.sin(now * 3));
        if (Math.random() < 0.3) texts.push({ x: e.x + (Math.random() * 30 - 15), y: e.y - 20, s: "✦", color: "#9ff8ff", at: now, rise: 40 });
      }
      if (e.f & 2) p.glow(0, -36, 34, hex(LOOKS[info.cls].color), 0.25);
      const c = casts.get(e.id), age = c ? now - c.at : 9;
      drawCharacter(p, { cls: info.cls, form: !!(e.f & 2), t: now + e.id, moving: !!(e.f & 32), cast: c && age < 0.6 ? { ...c, age } : null, busy: !!(e.f & 64), slow: !!(e.f & 4), flash });
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
    } else if (e.kind === "s") {
      p.place(sx, sy, e.face < 0);
      shadow(p, 10);
      const hop = Math.abs(Math.sin(now * 6 + e.id)) * 5;
      drawPuppet(p, !!e.bite, Math.round(hop), now);
      if (e.bite) p.glow(3, -30, 10, hex("#5cf0a0"), 0.6);
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
    const [, code, x, y, vx, vy] = b, sx = x - camX, sy = y - camY - 30, a = Math.atan2(vy, vx);
    p.place(sx, sy, false);
    if (CLS[code] === "time") {
      // a golden clock-hand needle
      for (let i = 0; i < 10; i++) p.px(-Math.cos(a) * i, -Math.sin(a) * i, i < 2 ? WHITE : hex(GOLD[i < 5 ? 5 : 4]));
      p.glow(0, 0, 9, hex(GOLD[4]), 0.7);
    } else {
      // a spinning talisman with a jade trail
      const w = Math.max(1, Math.round(3 * Math.abs(Math.cos(now * 25))));
      p.rect(-w / 2, -4, w, 8, hex("#ecd27a"));
      p.px(0, -1, hex("#c42a2a"));
      for (let i = 2; i < 9; i++) p.px(-Math.cos(a) * i * 1.5, -Math.sin(a) * i * 1.5, hex(JADE[i < 5 ? 5 : 3]));
      p.glow(0, 0, 8, hex(JADE[4]), 0.6);
    }
  }

  function drawDragon(p, e, d, age, now) {
    // the dragon rises behind its rider, breathes, and fades back
    const face = d.ax < 0 ? -1 : 1, k = Math.min(1, age / 0.2) * (1 - Math.max(0, (age - 1.3) / 0.3));
    const sx = Math.round(e.x - camX), sy = Math.round(e.y - camY);
    p.place(sx, sy, face < 0);
    const ox = -70, oy = -128 + Math.round((1 - k) * 30);
    dragon.draw(p, ox, oy, {
      bend: (s) => 2.5 * (0.3 + 0.7 * s) * Math.sin(Math.PI * 2 * (1.5 * s - 0.9 * now)),
      color: (c, s) => (s > k * 1.1 ? 0 : c),
    });
    if (age > 0.12 && age < 1.25) {
      const mx = ox + MOUTH[0], my = oy + MOUTH[1];
      p.glow(mx, my, 12, hex("#ffd27a"), 0.8);
      // the breath: a fan of flame toward where it was aimed (drawn in the dragon's own facing)
      const ang = Math.atan2(d.ay, Math.abs(d.ax)), FIRE = ["#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f"].map(hex);
      const tx = 0 + Math.cos(ang) * 150, ty = -28 + Math.sin(ang) * 150;
      for (let i = 0; i < 70; i++) {
        const u = ((i * 0.618 + now * 3.2) % 1), spread = (Math.sin(i * 12.9898) * 0.5) * u * 18;
        const x = mx + (tx - mx) * u - Math.sin(ang) * spread, y = my + (ty - my) * u + Math.cos(ang) * spread;
        const r = 1 + u * 3.5, c = FIRE[Math.min(5, Math.floor(u * 6))];
        p.circle(x, y, r, c);
        if (i % 4 === 0) p.light(x, y, c, 0.5);
      }
    }
  }

  function drawDrains(p, now) {
    for (let i = drains.length - 1; i >= 0; i--) {
      const d = drains[i], age = now - d.at;
      if (age > 0.6) {
        drains.splice(i, 1);
        continue;
      }
      const a = drawn.get(d.from), b = drawn.get(d.to);
      if (!a || !b) continue;
      p.place(0, 0, false);
      for (let j = 0; j < 26; j++) {
        const u = Math.min(1, (age * 2.2 + j / 26) % 1), curl = Math.sin(j * 1.7) * 14 * Math.sin(Math.PI * u);
        const x = a.x + (b.x - a.x) * u - camX, y = a.y - 34 + (b.y - a.y) * u - camY + curl;
        p.px(x, y, hex(JADE[u > 0.7 ? 6 : 4]));
        p.light(x, y, hex(JADE[4]), 0.4);
      }
    }
  }

  function drawLabels(list, now) {
    const c = lctx, k = scale;
    c.clearRect(0, 0, labels.width, labels.height);
    c.textAlign = "center";
    c.textBaseline = "bottom";
    c.lineJoin = "round";
    for (const e of list) {
      if (e.dead || e.kind === "s") continue;
      const x = (e.x - camX) * k;
      let top, name, color, hp = e.hp;
      if (e.kind === "p") {
        const info = infos.get(e.id);
        if (!info) continue;
        top = (e.y - camY - (e.f & 2 && info.cls === "time" ? 90 : LOOKS[info.cls].h + 4)) * k;
        name = `${info.name} · ${realmName(info.lv)}`;
        color = e.id === myId ? "#fff6c8" : LOOKS[info.cls].color;
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
  };
}
