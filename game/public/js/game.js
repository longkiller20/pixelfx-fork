// The game in the browser: it shows what the server says is happening, and sends what the player presses.
import { createFrame, clearFrame, createFx, composite, painterFor, hex, WHITE } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { CLASSES, CLASS, MONSTERS, ITEMS, BUFF_STATS, expForLevel, realmName, MAX_LEVEL, ARTS, ART_SLOTS, FLY, canFly, flyRealmName } from "/shared/balance.js";
import { artIcon, artScale, BLANK_ACTOR } from "./arts.js";
import { ART_FX } from "./cong-phap.js";
import { setMapMusic } from "./music.js";
import { mapInfo } from "/shared/maps/index.js";
import { drawDummy } from "./art.js";
import { drawAvatar, avatarTop, loadAvatars, drawWeapon } from "./avatar.js";
import { buildScene } from "./scenery.js";
import { stepBody, PHYS, zoneLanding } from "/shared/physics.js";
import { createHomeLayer } from "./gia-vien.js";

// each buff's status icon (Xianxia Pixel Pack)
const BUFF_ICON = { hp: "item_peach", atk: "status_burn", def: "status_golden_shield", spd: "status_swift", exp: "item_jade_slip", stones: "item_spirit_stone", med: "item_lingzhi" };
const GOLD = ["#2a1604", "#6a3a08", "#b8700e", "#f0a820", "#ffd84a", "#fff2a8", "#ffffff"];
const JADE = ["#04120c", "#0b2a1e", "#145a3a", "#22a06a", "#5cf0a0", "#c8ffe0", "#ffffff"];
const INTERP = 0.11; // seconds behind the newest snapshot that others are drawn at
const $ = (id) => document.getElementById(id);

export function startGame({ token, character, inventory, api, onFatal, touch, refreshConfig, onArts, openArts, onSect, onSectChat, social, onHomeState, onHomeTap }) {
  loadAvatars();
  const view = $("view"), labels = $("labels"), ctx = view.getContext("2d"), lctx = labels.getContext("2d");
  let VW = 640, VH = 360, frame, img, bgBuf, scale = 1;
  let map = null, scene = null, body = null;

  // ---------------------------------------------------------------- state from the server
  let myId = 0, me = null, inv = { ...inventory };
  // the five arts on the bar and the arts learned (the starters are known by everyone)
  let arts = { slots: character?.slots ?? Array(ART_SLOTS).fill(null), learned: character?.learned ?? [] };
  const boltFx = new Map(); // bolt id -> the effect riding it
  // teleporting through a gate: a star closes over the screen, holds while the new map loads, and opens on it
  const WARP_FX = "transitions/star-iris";
  let screenFx = null, warpWaiting = false;
  const vanish = new Map(); // player id -> when they vanish into the light at a gate
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
  // Gia Viên: its house, farm and garden drawn over the map (public/js/gia-vien.js); the house's walls and floors carry people
  const home = createHomeLayer({ drawFx: (...a) => drawFx(...a) });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case "welcome":
        myId = m.id;
        if (!map || map.id !== m.map) {
          // a new map (logging in, or through a gate): forget everything of the last one
          map = mapInfo(m.map);
          home.onWelcome(m.map);
          // each map has its own music
          setMapMusic(map.music);
          scene = null;
          infos.clear();
          snaps.length = 0;
          fxs.length = 0;
          texts.length = 0;
          ambient.length = 0;
          motes.length = 0;
          casts.clear();
          ghosts.clear();
          boltFx.clear();
          vanish.clear();
          body = null;
          camFX = camFY = null;
          $("loading").hidden = false;
          const want = map.id;
          buildScene(map).then((sc) => {
            if (map.id !== want) return;
            scene = sc;
            // the map's own living scenery: pixelfx effects that loop where the map puts them (fireflies, spirit fire...)
            for (const [kind, x, row, o = {}] of map.def.props)
              if (kind === "fx" && effects[o.id]) ambient.push({ id: o.id, fx: createFx(effects[o.id], { seed: (x * 97) | 0, flip: !!o.f, actor: BLANK_ACTOR, ...(o.o ?? {}) }), x: x * map.T, y: row * map.T - (o.h ?? 0), k: o.k ?? 1.4, every: o.every ?? 0, next: 0 });
            $("loading").hidden = true;
            zoneBanner(map.name, map.sub);
            // arrived through a gate: the star opens again on the new map
            if (warpWaiting) {
              screenFx = createFx(effects[WARP_FX], { seed: (Math.random() * 1e6) | 0 });
              screenFx.update(screenFx.meta.duration * 0.55);
              warpWaiting = false;
            }
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
      case "warp":
        screenFx = createFx(effects[WARP_FX], { seed: (Math.random() * 1e6) | 0 });
        warpWaiting = true;
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
        renderFly();
        break;
      case "chat":
        // three channels, each marked in the log; the chat panel (and the sect panel for its own) keep them too
        logLine(m.n, m.m, `ch-${m.ch ?? "w"}`, CH_TAG[m.ch ?? "w"]);
        if (m.ch === "s") onSectChat?.(m);
        social?.onChat(m);
        break;
      case "hist":
        social?.onHist(m);
        break;
      // Gia Viên: its house (the map people move on gains its walls and floors), the farm
      case "home":
        // (moved: the owner moved into another house while here: everyone is back at the gate, as the server says)
        if (m.moved) body = null;
        home.onHome(m, mapInfo(m.map ?? "giavien")).then((mm) => {
          if (map?.id === "giavien") map = mm;
        });
        break;
      case "homest":
        home.onState(m);
        onHomeState?.();
        break;
      case "pm":
        // Truyền Âm: in the log too, marked; the Đạo Hữu panel shows it in its conversation
        logLine(m.mine ? `→ ${m.name}` : m.name, m.text, "ch-pm", "Truyền Âm");
        social?.onPm(m);
        break;
      case "pmerr":
        toast(m.m);
        social?.onPmErr(m);
        break;
      case "friends":
        if (m.note) (toast(m.note), logLine(null, m.note, "ch-pm"));
        if (m.presence) logLine(null, `Đạo hữu ${m.presence.name} ${m.presence.on ? "vừa trực tuyến" : "đã rời đi"}.`, "ch-pm");
        social?.onFriends(m);
        break;
      case "unread":
        social?.onUnread(m.n);
        break;
      case "sect":
        // something in the sect changed (a member, a rank, the treasury...): an open sect panel reads it again
        onSect?.();
        break;
      case "feed":
        logLine(null, m.m, "sys");
        break;
      case "portal":
        zoneBanner("Đường phía trước chưa mở", m.m);
        break;
      case "toast":
        toast(m.m);
        if (m.ch === "s") logLine(null, m.m, "sect");
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
    for (const a of m.M) s.M.set(a[0], { id: a[0], type: a[1], x: a[2], y: a[3], face: a[4], hp: a[5] / 1000, f: a[6] });
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
  // the avatar's casting pose for the basic attack's type (an art names its own: pose)
  const POSE = { melee: "melee", bolt: "bolt", zone: "zone" };
  // what an art's look may do (see public/js/cong-phap.js)
  let shakeAmp = 0, shakeUntil = 0, shakeFor = 1;
  const artHelp = {
    fx: (id, x, y, o = {}) => addFx(id, x, y, { flip: !!o.flip }, o.follow ?? null, o.life ?? 0, o.k ?? 1),
    shake(amp, sec, x, y) {
      // only when it happens on or near your screen
      if (x < camX - 200 || x > camX + VW + 200 || y < camY - 200 || y > camY + VH + 300) return;
      const now = performance.now() / 1000;
      if (amp >= shakeAmp * Math.max(0, (shakeUntil - now) / shakeFor)) (shakeAmp = amp), (shakeUntil = now + sec), (shakeFor = sec);
    },
    later: (sec, fn) => setTimeout(fn, sec * 1000),
  };
  function onEvent(e, s) {
    const now = performance.now() / 1000;
    switch (e.e) {
      case "cast": {
        const p = s.P.get(e.id), info = infos.get(e.id);
        if (!p || !info) break;
        const sk = e.a ? ARTS[e.a] : CLASSES[CLASS].skills[0];
        if (!sk) break;
        casts.set(e.id, { s: e.s, type: e.a ? sk.pose ?? "zone" : POSE[sk.type] ?? "melee", at: now });
        // the basic attack's jade crescent; an art draws its own effect (the "art" event)
        if (!e.a) addFx("melee/sword-slash", p.x + e.ax * 10, p.y - 2, { flip: e.ax < 0, palette: JADE }, null, 0, 1.4);
        break;
      }
      case "art":
        // each art draws itself (public/js/cong-phap.js)
        ART_FX[e.a]?.(e, artHelp);
        break;
      case "drop":
        addFx("pickups/loot-beam", e.x, e.y, {}, null, 1.4);
        break;
      case "warp":
        // through a gate: here they break into light and are gone; on the far side a pillar of light sets them down
        if (e.out) {
          addFx("arcane/blink-out", e.x, e.y, { palette: GOLD }, null, 0, 1.65);
          vanish.set(e.id, now + 0.55);
        } else addFx("spawn/respawn-beam", e.x, e.y, { palette: GOLD }, null, 0, 1.5);
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
      case "burn": {
        const t = posOf(e.id, s);
        if (t) addFx("status/burning", t.x, t.y, {}, e.id, 0.6, 1.4);
        break;
      }
      case "boom":
        addFx("impacts/hit-spark", e.x, e.y - 30, { palette: JADE });
        break;
      case "fly": {
        // stepping onto the sword: a burst of qi at the feet; off it, a puff
        const t = posOf(e.id, s);
        if (t) addFx(e.on ? "arcane/mana-burst" : "spawn/poof", t.x, t.y, { palette: JADE }, null, 0, e.on ? 1.2 : 0.8);
        if (e.id === myId) renderFly();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- input
  const keys = new Set();
  let joy = { dx: 0, dy: 0 }, mouse = null, sentIn = { dx: 9 }, lastSent = 0, lastDir = { x: 1, y: 0 };
  const chatInput = $("chatInput");
  // the channel the chat box talks on (the pill left of it; Tab while typing switches): w Thế Giới, k Khu Vực, s Tông Môn
  const CHANNELS = ["w", "k", "s"], CH_NAME = { w: "Thế Giới", k: "Khu Vực", s: "Tông Môn" };
  let chatCh = "w";
  const setCh = (c) => {
    chatCh = c;
    $("chatCh").textContent = CH_NAME[c];
    $("chatCh").className = `ch-${c}`;
    chatInput.placeholder = `Nói ở kênh ${CH_NAME[c]}...`;
  };
  $("chatCh").addEventListener("click", () => (setCh(CHANNELS[(CHANNELS.indexOf(chatCh) + 1) % 3]), chatInput.focus()));
  chatInput.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    setCh(CHANNELS[(CHANNELS.indexOf(chatCh) + 1) % 3]);
  });
  addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) {
      if (e.key === "Enter") {
        // the channel picked on the pill, or a command: /w Thế Giới, /k Khu Vực, /t Tông Môn, /ta <đạo hiệu> <lời> Truyền Âm
        const v = chatInput.value.trim();
        const cmd = /^\/(w|tg|k|kv|t|tm|tong)\s+([\s\S]+)/i.exec(v), ta = /^\/(ta|pm)\s+(\S+(?:\s\S+)*?)\s*:\s*([\s\S]+)/i.exec(v);
        if (ta) send({ t: "pm", toName: ta[2], m: ta[3], c: "cmd" });
        else if (cmd) send({ t: "chat", ch: { w: "w", tg: "w", k: "k", kv: "k" }[cmd[1].toLowerCase()] ?? "s", m: cmd[2] });
        else if (v) send({ t: "chat", ch: chatCh, m: v });
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
    if (k === "f" && !e.repeat) toggleFly();
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
    // a click on an animal or a herb bed opens the farm or the garden
    const hit = mouse && home.hit(mouse.x + camX, mouse.y + camY);
    if (hit && e.button === 0) return void onHomeTap?.(hit);
    if (e.button === 0) cast(0);
    if (e.button === 2) cast(1);
  });
  // a finger on the world (not on a button): open what it tapped on the farm. The game may be
  // turned on its side (a phone held upright), so the touch is turned back into the view's own coordinates.
  const viewPos = (e) => {
    const r = view.getBoundingClientRect();
    if (document.body.classList.contains("rotated")) return { x: ((e.clientY - r.top) / r.height) * VW, y: (1 - (e.clientX - r.left) / r.width) * VH };
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  };
  view.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    const v = viewPos(e);
    const hit = home.hit(v.x + camX, v.y + camY);
    if (hit) onHomeTap?.(hit);
  });
  view.addEventListener("contextmenu", (e) => e.preventDefault());
  // a zone art that can be aimed: press its button and drag the way you want it to land, as far as you drag (the full
  // reach at AIM_DRAG px), and let go; a tap without dragging puts it on the nearest enemy (or the usual spot ahead)
  const AIM_DRAG = 90;
  for (const b of document.querySelectorAll("[data-skill]")) {
    const i = +b.dataset.skill;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!aimArt(i)) return cast(i);
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      const o = appXY(e);
      aiming = { i, id: e.pointerId, x0: o.x, y0: o.y, dragged: false, to: null };
    });
    b.addEventListener("pointermove", (e) => {
      if (!aiming || aiming.id !== e.pointerId) return;
      const o = appXY(e), dx = o.x - aiming.x0, dy = o.y - aiming.y0;
      if (Math.hypot(dx, dy) > 10) aiming.dragged = true;
      aiming.drag = { dx, dy };
    });
    b.addEventListener("pointerup", (e) => {
      if (!aiming || aiming.id !== e.pointerId) return;
      const a = aiming;
      aiming = null;
      cast(a.i, a.dragged ? aimSpot(a) : null);
    });
    b.addEventListener("pointercancel", () => (aiming = null));
  }
  for (const b of document.querySelectorAll("[data-item]")) b.addEventListener("pointerdown", (e) => (e.preventDefault(), use(b.dataset.item)));
  // ngự kiếm phi hành: on and off the flying sword (F); the button shows once the realm for it is reached
  const flyBtn = $("flyBtn");
  const flyingNow = () => !!(snaps[snaps.length - 1]?.P.get(myId)?.f & 256);
  function toggleFly() {
    if (!me) return;
    if (!canFly(me.lv)) return toast(`Tới cảnh giới ${flyRealmName()} mới ngự kiếm phi hành được.`);
    send({ t: "fly", on: !flyingNow() });
  }
  let flyShown = null;
  function renderFly() {
    const can = !!me && canFly(me.lv), on = flyingNow(), key = `${can}${on}`;
    if (key === flyShown) return;
    flyShown = key;
    flyBtn.hidden = !can;
    flyBtn.classList.toggle("on", on);
    flyBtn.title = on ? "Hạ kiếm (F)" : "Ngự kiếm phi hành (F)";
  }
  flyBtn.addEventListener("pointerdown", (e) => (e.preventDefault(), toggleFly()));

  // the joystick: a round analog stick wherever the thumb lands in the left part of the screen. Left and right walk; pushing it
  // up jumps (held up, it keeps jumping on landing), pulling it down drops through a plank or cloud
  const pad = $("joyzone"), knob = $("joyknob"), base = $("joybase");
  let joyId = null, joy0 = null;
  // pointer position in the app's own (possibly rotated) frame
  const appXY = (e) => (document.body.classList.contains("rotated") ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });
  pad.addEventListener("pointerdown", (e) => {
    joyId = e.pointerId;
    joy0 = appXY(e);
    try { pad.setPointerCapture(e.pointerId); } catch {}
    // the base goes under the thumb: pad.offsetLeft/Top are in the app's own frame, rotated or not
    base.style.cssText = `left: ${joy0.x - pad.offsetLeft}px; top: ${joy0.y - pad.offsetTop}px; bottom: auto; margin: -60px 0 0 -60px`;
    base.classList.add("on");
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyId) return;
    const q = appXY(e), R = 46;
    let dx = q.x - joy0.x, dy = q.y - joy0.y;
    const d = Math.hypot(dx, dy);
    if (d > R) (dx *= R / d), (dy *= R / d);
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy = d < 8 ? { dx: 0, dy: 0 } : { dx: dx / R, dy: dy / R };
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joy = { dx: 0, dy: 0 };
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
    // the stick counts as up past about 35 degrees above level, as down past about 45 below (a drop needs jump + down)
    const up = joy.dy < -0.55, pull = joy.dy > 0.7;
    const jump = up || pull || keys.has("w") || keys.has("arrowup") || keys.has(" ");
    const down = pull || keys.has("s") || keys.has("arrowdown");
    const now = performance.now() / 1000;
    if (jump && !jumpHeld) jumpUntil = now + PHYS.JUMP_BUFFER;
    jumpHeld = jump;
    if (Math.abs(dx) > 0.2) lastDir = { x: Math.sign(dx), y: 0 };
    // up and down, for a flying sword: the stick's full slant, or the keys
    let dy = Math.abs(joy.dy) > 0.25 ? Math.sign(joy.dy) * Math.min(1, Math.abs(joy.dy) * 1.3) : 0;
    if (keys.has("w") || keys.has("arrowup") || keys.has(" ")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    dy = Math.max(-1, Math.min(1, dy));
    return { dx: +dx.toFixed(2), dy: +dy.toFixed(2), jump, down };
  }
  function pumpInput(now) {
    const d = inputDir();
    if (d.dx !== sentIn.dx || d.dy !== sentIn.dy || d.jump !== sentIn.jump || d.down !== sentIn.down || now - lastSent > 0.5) {
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
  function cast(i, to = null) {
    // an empty slot opens the list of arts, to put one there
    if (i > 0 && !arts.slots[i - 1]) return openArts?.(i - 1);
    if (!me || me.respawn > 0) return;
    if (me.cd[i] > 0.05) return;
    const a = aimArt(i), self = drawn.get(myId);
    if (a && self) {
      // an aimed zone: where it was dragged, else the mouse on a computer, else the nearest enemy in reach, else ahead
      to ??= mouse && !touch ? clampAim({ x: mouse.x + camX, y: mouse.y + camY }, a.aim) : autoSpot(a);
      return send({ t: "cast", s: i, ax: to.x - self.x || lastDir.x, ay: 0, tx: Math.round(to.x), ty: Math.round(to.y) });
    }
    send({ t: "cast", s: i, ...aim() });
  }
  // ---- aimed zones
  let aiming = null; // { i, id, x0, y0, dragged, drag: { dx, dy } } while a finger drags an art's button
  /** The art in slot i when it is a zone that can be aimed, else null. */
  const aimArt = (i) => {
    const a = i > 0 && ARTS[arts.slots[i - 1]];
    return a && a.aim > 0 ? a : null;
  };
  /** A point pulled in to `reach` px of your chest. */
  function clampAim(to, reach) {
    const self = drawn.get(myId), cx = self.x, cy = self.y - 30;
    let dx = to.x - cx, dy = to.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > reach) (dx *= reach / d), (dy *= reach / d);
    return { x: cx + dx, y: cy + dy };
  }
  /** Where a drag puts the zone: the drag's way and share of AIM_DRAG, times the art's reach. */
  function aimSpot(a) {
    const art = aimArt(a.i), self = drawn.get(myId);
    if (!art || !self || !a.drag) return null;
    const k = art.aim / AIM_DRAG;
    return clampAim({ x: self.x + a.drag.dx * k, y: self.y - 30 + a.drag.dy * k }, art.aim);
  }
  /** Where the zone will burst: the same settling onto the ground as the server's, inside the map. */
  function landing(to) {
    const x = Math.max(20, Math.min(map.w - 20, to.x)), y = Math.max(40, Math.min(map.h - 2, to.y));
    return { x, y: zoneLanding(map, x, y) };
  }
  /** No drag: the nearest enemy within reach, else the art's usual spot ahead. */
  function autoSpot(a) {
    const self = drawn.get(myId), arena = !!map?.pvp;
    let best = null, bd = a.aim;
    for (const e of drawn.values()) {
      if (e.id === myId || e.dead || e.kind === "s" || (e.kind === "p" && !arena)) continue;
      const d = Math.hypot(e.x - self.x, e.y - 30 - (self.y - 30));
      if (d < bd) (bd = d), (best = e);
    }
    return best ? { x: best.x, y: best.y - 10 } : { x: self.x + (self.face < 0 ? -1 : 1) * (a.aimDist ?? 120), y: self.y - 10 };
  }
  // while dragging: the reach as a dotted ring round you, and the zone where it will land
  const AIM_C = hex("#7ff0ff"), AIM_IN = hex("#ffd84a");
  function drawAim(p, now) {
    const a = aiming && aimArt(aiming.i), self = drawn.get(myId);
    if (!a || !self) return;
    p.place(0, 0, false);
    p.fade = 1;
    p.lightK = 1;
    // a soft ring (2 px, translucent) a step at a time, with brighter beads turning slowly round it
    const ring = (x, y, r, c, al) => {
      const n = Math.max(32, Math.round(r * 6.3));
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t);
        p.blend(Math.round(x + cs * r), Math.round(y + sn * r), c, al);
        p.blend(Math.round(x + cs * (r - 1)), Math.round(y + sn * (r - 1)), c, al * 0.6);
      }
    };
    const cx = self.x - camX, cy = self.y - 30 - camY;
    ring(cx, cy, a.aim, AIM_C, 0.45);
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2 + now * 0.6;
      p.dot(Math.round(cx + Math.cos(t) * a.aim), Math.round(cy + Math.sin(t) * a.aim), AIM_C, 1);
    }
    if (!aiming.dragged) return;
    const at = aimSpot(aiming);
    if (!at) return;
    const to = landing(at);
    const tx = to.x - camX, ty = to.y - camY, r = a.aimR ?? 50, pulse = 0.5 + 0.5 * Math.sin(now * 8);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) p.blend(Math.round(tx + x), Math.round(ty + y), AIM_IN, 0.16 + 0.06 * pulse);
    ring(tx, ty, r, AIM_IN, 0.9);
    ring(tx, ty, Math.max(4, r * 0.15), AIM_IN, 0.9);
    // a dotted line from you to it
    const L = Math.hypot(tx - cx, ty - cy);
    for (let d = 14; d < L - r; d += 7) {
      const x = Math.round(cx + ((tx - cx) * d) / L), y = Math.round(cy + ((ty - cy) * d) / L);
      p.blend(x, y, AIM_IN, 0.85);
      p.blend(x + 1, y, AIM_IN, 0.85);
    }
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
    renderFly();
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
  function logLine(name, text, kind = "", tag = "") {
    const box = $("log"), d = document.createElement("div");
    d.className = `line ${kind}`;
    if (tag) d.append(Object.assign(document.createElement("i"), { className: "tag", textContent: tag }));
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
  const CH_TAG = { w: "Thế Giới", k: "Khu Vực", s: "Tông Môn" };
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
      // on the sword and hovering: settle onto the server's spot
      else if (last.f & 256 && !(last.f & 32) && !(self.f & 32) && (dx > 0.5 || dy > 0.5)) (body.x += (last.x - body.x) * 0.2), (body.y += (last.y - body.y) * 0.2);
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
    body.flying = !!(last.f & 256);
    const spd = (me?.spd ?? c.spd) * (last.f & 4 ? 0.5 : 1) * (last.f & 64 ? 0.45 : 1) * PHYS.RUN * (body.flying ? FLY.speed : 1);
    // planted by an art: still, as on the server
    const inp = last.f & 512 ? { dx: 0, dy: 0, jump: false, down: false } : inputDir(), wasGround = body.ground;
    stepBody(body, { ...inp, jump: inp.jump || (jumpUntil > now && !(last.f & 512)) }, spd, dt, map, now);
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
    // the map's own lights: lava, spirit fire, rune circles
    for (const g of scene.glows) {
      if (!on(g.x, g.y, g.r)) continue;
      const f = 0.8 + 0.2 * Math.sin(now * 3 * g.f + g.x);
      p.glow(g.x - camX, g.y - camY, g.r, hex(g.c), g.a * f);
    }
    // the taiji floating over its dais, turning; brighter while someone cultivates
    const s = map.spring ?? { x0: -9999, x1: -9999, y: -9999 }, sx = (s.x0 + s.x1) / 2;
    if (map.spring && on(sx, s.y, 300)) {
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

  // what drifts through the air, by the map's theme: cherry petals over the town, leaves in the forest, spores over the
  // lake, pale souls among the tombs, embers rising out of the abyss
  const motes = [];
  const MOTES = {
    petals: { n: 36, c: ["#ffd0e0", "#ffa8c8", "#f080a8"], vx: [12, 26], vy: [16, 30], sway: 14, size: 2 },
    leaves: { n: 30, c: ["#9ac85a", "#d8c050", "#d08a3a", "#6a9a3a"], vx: [8, 22], vy: [18, 34], sway: 22, size: 2 },
    spores: { n: 40, c: ["#e8fff4", "#bff0ff", "#fff8c0"], vx: [-6, 6], vy: [-14, -4], sway: 10, size: 1 },
    souls: { n: 26, c: ["#9ff8ff", "#c8b0ff", "#7fd8ff"], vx: [-5, 5], vy: [-16, -6], sway: 16, size: 1, glow: true },
    embers: { n: 50, c: ["#ffd24a", "#ff8a2a", "#ff5a1a", "#fff0a0"], vx: [-10, 10], vy: [-46, -18], sway: 12, size: 1, glow: true },
  };
  function drawPetals(p, now, dt) {
    const K = MOTES[scene.theme.motes] ?? MOTES.petals, up = K.vy[1] < 0;
    while (motes.length < K.n) {
      const r = (a) => a[0] + Math.random() * (a[1] - a[0]);
      motes.push({ x: camX + Math.random() * (VW + 200) - 100, y: up ? camY + VH + Math.random() * VH * 0.5 : camY - Math.random() * VH, vx: r(K.vx), vy: r(K.vy), ph: Math.random() * 6, c: hex(K.c[(Math.random() * K.c.length) | 0]) });
    }
    p.place(0, 0, false);
    for (let i = motes.length - 1; i >= 0; i--) {
      const q = motes[i];
      q.x += (q.vx + Math.sin(now * 2 + q.ph) * K.sway) * dt;
      q.y += q.vy * dt;
      const sx = q.x - camX, sy = q.y - camY;
      if (sy > VH + 10 || sy < -20 || sx > VW + 120 || sx < -140) {
        motes.splice(i, 1);
        continue;
      }
      p.px(sx, sy, q.c);
      if (K.size > 1 && Math.sin(now * 5 + q.ph) > 0) p.px(sx + 1, sy, q.c);
      if (K.glow) p.glow(sx, sy, 5, q.c, 0.25 + 0.15 * Math.sin(now * 4 + q.ph));
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
      // a heavy art landing near you shakes the view, fading out
      if (shakeUntil > now) {
        const k = shakeAmp * ((shakeUntil - now) / shakeFor);
        camX += Math.round((Math.random() * 2 - 1) * k);
        camY += Math.round((Math.random() * 2 - 1) * k);
      }
    }
    scene.paint(bgBuf, VW, VH, camX, camY, now);
    home.paintBg(bgBuf, VW, VH, camX, camY);
    clearFrame(frame);
    const p = painterFor(frame), on = (x, y, m = 140) => x > camX - m && x < camX + VW + m && y > camY - m && y < camY + VH + m * 1.5;
    const place = (fx, x, y) => {
      fx.options.x = Math.round(x - camX);
      fx.options.y = Math.round(y - camY);
    };
    for (const a of ambient) {
      a.fx.update(dt);
      // a one-shot (a pillar of flame, a geyser) starts over after a pause
      if (a.fx.done() && now > a.next) {
        a.fx = createFx(effects[a.id], { seed: (Math.random() * 1e6) | 0, actor: BLANK_ACTOR });
        a.next = now + a.fx.meta.duration + a.every;
      }
      if (on(a.x, a.y, 260)) drawFx(a.fx, "back", a.x, a.y, a.k);
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
    home.drawFront(p, now, dt, camX, camY, on);
    // everyone, back to front
    const list = [...drawn.values()].filter((e) => on(e.x, e.y)).sort((a, b) => a.y - b.y);
    for (const e of list) drawEntity(p, e, now);
    const live = new Set();
    for (const b of snaps[snaps.length - 1]?.B ?? []) {
      // a monster's shot ("@type") rides its own effect too
      const a = b[6]?.[0] === "@" ? { fx: MONSTERS[b[6].slice(1)]?.shotFx, at: "bolt", scale: 1.1 } : null;
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
    for (const a of ambient) if (on(a.x, a.y, 260)) drawFx(a.fx, "front", a.x, a.y, a.k);
    drawPortalArrows(p, now, on);
    drawAim(p, now);
    drawPetals(p, now, dt);
    if (screenFx) {
      // hold it shut while waiting for the new map; then let it open and finish
      const D = screenFx.meta.duration;
      if (!(warpWaiting && screenFx.t >= D * 0.5)) screenFx.update(dt);
      const k = VW / 320;
      drawFx(screenFx, "back", camX, camY, k);
      drawFx(screenFx, "front", camX, camY, k);
      if (screenFx.done()) screenFx = null;
    }
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
      if (vanish.has(e.id) && now > vanish.get(e.id)) return; // gone into the light at a gate
      // on a flying sword: the rider bobs gently over the air, a trail of qi streaming off the blade when it moves
      const flying = !!(e.f & 256), bob = flying ? Math.round(Math.sin(now * 2.6 + e.id) * 2) : 0;
      p.place(sx, sy + bob, e.face < 0);
      if (flying && e.f & 32)
        for (let i = 0; i < 26; i++) {
          const y = Math.round(Math.sin(now * 9 - i * 0.5) * 1.5);
          p.dot(-46 - i * 1.5, y, hex(JADE[i < 6 ? 5 : i < 14 ? 4 : 3]), 0.95 - i / 28);
          if (i % 3 === 0) p.dot(-46 - i * 1.5, y + 2, hex(JADE[3]), 0.6 - i / 40);
        }
      if (flying) p.glow(0, 2, 34, hex(JADE[3]), 0.16 + 0.05 * Math.sin(now * 4));
      // a shadow, and an aura while cultivating
      if (!(e.f & 128)) shadow(p, 13);
      if (e.f & 16) {
        p.glow(0, -30, 30, hex("#7ff0ff"), 0.25 + 0.1 * Math.sin(now * 3));
        if (Math.random() < 0.3) texts.push({ x: e.x + (Math.random() * 30 - 15), y: e.y - 20, s: "✦", color: "#9ff8ff", at: now, rise: 40 });
      }
      const c = casts.get(e.id), age = c ? now - c.at : 9;
      drawAvatar(p, info.look, { t: now + e.id, moving: !flying && !!(e.f & 32), air: !flying && !!(e.f & 128), fly: flying, meditating: !!(e.f & 16), cast: c && age < 0.6 ? { ...c, age } : null, busy: !!(e.f & 64), slow: !!(e.f & 4), flash });
    } else if (e.kind === "m") {
      if (e.dead) return;
      const md = MONSTERS[e.type];
      if (!md?.fx || !effects[md.fx]) {
        p.place(sx, sy, false);
        shadow(p, 12);
        const hit = now - (flashes.get(e.id) ?? -9);
        drawDummy(p, hit < 0.6 ? Math.round(Math.sin(hit * 30) * 3 * (1 - hit / 0.6)) : 0, flash);
      } else {
        // a critter: its own pixelfx effect, a size up to sit with the characters; it lunges a little when it strikes
        let g = ghosts.get(e.id);
        if (!g || g.mod !== md.fx) ghosts.set(e.id, (g = { mod: md.fx, fx: createFx(effects[md.fx], { seed: e.id }) }));
        g.fx.update(1 / 60);
        g.fx.options.flip = e.face < 0;
        const lunge = e.f & 128 ? e.face * 6 : 0;
        if (!md.fly) (p.place(sx, sy, false), shadow(p, 12));
        drawFx(g.fx, "back", e.x + lunge, e.y, MON_SCALE);
        drawFx(g.fx, "front", e.x + lunge, e.y, MON_SCALE);
        p.place(sx, sy, false);
        const cy = -monsterHeight(md) / 2;
        if (flash) p.glow(lunge, cy, 18, WHITE, 0.8);
        if (e.f & 4) p.glow(lunge, cy, 20, hex("#a060ff"), 0.4);
      }
    }
  }
  const ghosts = new Map(); // monster id -> its critter effect
  const MON_SCALE = 1.4;
  // how tall a monster stands above its anchor (fliers are anchored at their middle, walkers at their feet)
  const monsterHeight = (md) => {
    const m = effects[md.fx]?.meta;
    if (!m) return 58;
    return (md.fly ? m.size[1] / 2 : m.origin?.[1] ?? m.size[1]) * MON_SCALE * 0.6;
  };
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
      let top, name, color, hp = e.hp, sect = null;
      if (e.kind === "p") {
        const info = infos.get(e.id);
        if (!info) continue;
        top = (e.y - camY - avatarTop(info.look) - 4) * k;
        name = `${info.name} · ${realmName(info.lv)}`;
        color = e.id === myId ? "#fff6c8" : info.look?.g === "f" ? "#ffb8d8" : "#a8e0ff";
        sect = info.sect;
      } else {
        const md = MONSTERS[e.type];
        if (!md) continue;
        top = (e.y - camY - (md.fx ? monsterHeight(md) + 8 : 58)) * k;
        name = md.name;
        color = md.style === "none" ? "#d8c890" : "#ff9a9a";
      }
      const fs = Math.max(10, Math.round(5.2 * k));
      c.font = `600 ${fs}px system-ui, sans-serif`;
      c.lineWidth = Math.max(2, fs / 4);
      c.strokeStyle = "rgba(0,0,0,.85)";
      c.strokeText(name, x, top - fs * 0.5);
      c.fillStyle = color;
      c.fillText(name, x, top - fs * 0.5);
      // the sect over the name, in gold; its leader with a star
      if (sect) {
        const sf = Math.max(9, Math.round(fs * 0.85)), st = `${sect.r === 1 ? "★ " : ""}〔${sect.n}〕`;
        c.font = `700 ${sf}px system-ui, sans-serif`;
        c.lineWidth = Math.max(2, sf / 4);
        c.strokeText(st, x, top - fs * 1.55);
        c.fillStyle = sect.r === 1 ? "#ffd86a" : "#e8c070";
        c.fillText(st, x, top - fs * 1.55);
      }
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
    home.labels(c, k, camX, camY, labels.width, labels.height, now);
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
    // the Gia Viên layer (public/js/gia-vien.js): its house, its farm's state
    home,
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
    // the latest "me" (level, hp, atk, def, spd, stones, rank...), for the character panel
    me: () => me,
    // a line on the sect's channel (the sect panel's chat)
    sectSay: (text) => send({ t: "chat", ch: "s", m: String(text).slice(0, 120) }),
    // the chat panel and the Đạo Hữu panel: talk on a channel, ask for its last lines, send a Truyền Âm
    say: (ch, text) => send({ t: "chat", ch, m: String(text).slice(0, 120) }),
    hist: (ch) => send({ t: "hist", ch }),
    pm: (to, text, c) => send({ t: "pm", to, m: String(text).slice(0, 200), c }),
    mapName: () => map?.name ?? "",
    myName: () => infos.get(myId)?.name ?? character.name,
    // the panel changed the bar: show it now (the server confirms with an "arts" message too)
    setArts(v) {
      arts = { slots: v.slots, learned: v.learned };
      renderSlots();
    },
    refreshSlots: renderSlots,
  };
}
