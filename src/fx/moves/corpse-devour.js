// Khôi thi thôn phệ: a cultivator flicks a talisman into the floor, a ghost-fire formation draws itself round it, a corpse
// puppet heaves up out of it, hops stiff-armed to the straw target, unhinges its jaw and swallows it whole, then breaks
// into ghost-fire motes that stream back into its master's hand.
import { Particles, Lights, P, Rng, fit, clamp, lerp, seg, smooth, bump, ease, hash, TAU, WHITE, hex, mix, READY, TARGET_SPRITE, eatOrder } from "../../core/index.js";

// the beats, in the effect's own seconds
const LAND = 0.32, DRAW0 = 0.36, DRAW1 = 0.9, BREAK = 1.05, RISEN = 1.8, EYES = 1.92;
const HOP = [[2.08, 2.38], [2.5, 2.8]], JAW = 2.95, EAT = 3.02, EAT_DUR = 1.3, CHOMP = 4.45, GO = 5.15, GONE = 5.9, HOME = 6.35;
const X0 = 70, XS = [70, 92, 110], TX = 150, SY = 0.3, R0 = 25, R1 = 18;
const HAND = [15, -27];

export const meta = {
  name: "Corpse devour",
  desc: "A flicked talisman draws a ghost-fire formation; a corpse puppet heaves up, hops to the straw target, swallows it whole, then streams back into his hand.",
  tags: ["move", "summon", "undead", "corpse", "talisman", "xianxia", "devour", "ghost-fire", "shadow", "one-shot"],
  size: [236, 122],
  origin: [40, 102],
  duration: 7,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: {
    palette: ["#04120c", "#0b2a1e", "#145a3a", "#22a06a", "#5cf0a0", "#c8ffe0", "#ffffff"],
    talisman: ["#7a5a1c", "#c8a040", "#ecd27a", "#fff3b8"],
    ink: "#c42a2a",
    seed: 3,
  },
};

// ---- the corpse puppet: facing right, stiff arms out, a talisman hung over its face. Feet at column 11, row 42.
const BODY = [
  "........kkk",
  ".......khHhk",
  ".......khhhk",
  ".....kkkhhhkkk",
  "....khhHHhhhhhk",
  "...khHHhhhhhhhhk",
  "...khHhhhhkkkkkkk",
  "...khhhhhkSLLLLSk",
  "..khhhhhhkSLLLLLk",
  "..khhhhhhkSeLLLek",
  "..khhhhhhkSSSSLLk",
  "..khhhhhhksSSkkkk",
  "..khhhhhhkssSSSk",
  "..kh.khhhkksssk",
  "..k..kQRRkksskk",
  "...kQQRRRRRRRRRk",
  "..kQQQRRRRRRRRRRkkkkkkkkkkkk",
  "..kQQRRRRgRRRRRRQQQQQQQQQQRk",
  "..kQRRRRRgRRRRRRRRRRRRRRRRRkkk",
  "..kQRRRRRgRRRRRrrrrrrrrrrrrkSLk",
  "..kQRRRRRgRRRRRkkkkkkkkkkkkkSSk",
  "..kQRRRRRgRRRRrk...........knkn",
  "..kQRRRRRgRRRRrk",
  "..kQRRRRRgRRRRrk",
  "..kGGGGGGGGGGGGk",
  "..kGyyyyyyyyyyGk",
  "..kQRRRRRgRRRRrk",
  ".kQQRRRRRgRRRRrrk",
  ".kQRRRRRRgRRRRRrk",
  ".kQRRRRRRgRRRRRrk",
  ".kQRRRRRRgRRRRRrrk",
  "kQQRRRRRRgRRRRRRrk",
  "kQRRRRRRRgRRRRRRrk",
  "kQRRRRRRRgRRRRRRrrk",
  "kQRRRRRRRgRRRRRRRrk",
  "kGGGGGGGGgGGGGGGGGk",
  "kRkQRkkRRkRRkRRkrrk",
  ".k.kk..kk.kk.kk.kk",
  ".......kssk.kssk",
  ".......kssk.kssk",
  "......kkkkk.kkkkkk",
  "......kkkkkkkkkkkkk",
];
// the jaw unhinged: rows 11 to 14
const JAWROWS = { 11: "..khhhhhhksttttkk", 12: "..khhhhhhksmmmmmk", 13: "..kh.khhhksmmmmmk", 14: "..k..kQRRkkttttk" };
const PCOL = { k: "#0a0a12", h: "#12141c", H: "#2c3042", s: "#3e5a4a", S: "#6a8a72", L: "#a2b89a", e: "#c8ffd8", R: "#272540", Q: "#3d3a5e", r: "#17152a", g: "#8a6a2a", G: "#5a4418", y: "#c8a040", t: "#e0d8b8", m: "#1c0812", n: "#d8d4bc" };
const PC = Object.fromEntries(Object.entries(PCOL).map(([k, v]) => [k, hex(v)]));
const PW = 32, PH = 42, PAX = 11;
const puppetCells = (open) => {
  const out = [];
  for (let r = 0; r < PH; r++) {
    const row = (open && JAWROWS[r]) || BODY[r] || "";
    for (let c = 0; c < row.length; c++) if (row[c] !== ".") out.push({ c, r, k: row[c], col: PC[row[c]], th: (hash(c, r, 41) % 1000) / 1000 });
  }
  return out;
};
const CLOSED = puppetCells(false), OPEN = puppetCells(true);
const MOUTH = [3, -30];
// the puppet as data, for games that want to draw it themselves: rows top to bottom, feet at column ax of the last row
export const PUPPET = { body: BODY, jaw: JAWROWS, colors: PCOL, ax: PAX, h: PH };

// ---- the straw target's pixels, for flying them into the mouth
const DUMMY_PX = [];
for (let r = 0; r < TARGET_SPRITE.h; r++)
  for (let x = 0; x < TARGET_SPRITE.w; x++) {
    const c = TARGET_SPRITE.data[r * TARGET_SPRITE.w + x];
    if (c) DUMMY_PX.push({ x: TX + x - TARGET_SPRITE.ax, y: r - TARGET_SPRITE.h, c, th: eatOrder(x, r) });
  }

// a talisman: a slip of yellow paper with a red glyph, w wide, h tall, its top at (x, y); burn eats it from the bottom
function slip(p, x, y, w, h, T, ink, swing = 0, burn = 0, C) {
  const rows = Math.round(h);
  for (let j = 0; j < rows; j++) {
    const u = j / Math.max(1, rows - 1), dx = Math.round(swing * u * u);
    if (u > 1 - burn) continue;
    const edge = u > 1 - burn - 0.14;
    for (let i = 0; i < w; i++) {
      let c = i === 0 ? T[1] : i === w - 1 ? T[1] : T[2];
      if (j === 0) c = T[0];
      // the glyph: a red stroke down the middle with ticks
      if (i === (w >> 1) && j > 1 && j < rows - 2) c = ink;
      if ((j === 3 || j === 6) && i > 0 && i < w - 1) c = ink;
      if (edge) c = burn > 0 ? (j & 1 ? C[4] : C[5]) : c;
      p.px(x + i + dx, y + j, c);
    }
    if (edge && burn > 0) p.light(x + 1 + dx, y + j, C[4], 0.6);
  }
}

const SEAL = { ...READY, crouch: 2, turn: 1, fx: 5, fy: -36, bx: 8, by: -27, ffx: 6, fbx: -7 };
const FLICK = { ...READY, crouch: 4, lean: 3, fx: HAND[0], fy: HAND[1], bx: -3, by: -22, ffx: 9, fbx: -8 };
const HOLD = { ...READY, crouch: 3, turn: 1, fx: 7, fy: -31, bx: 9, by: -30, ffx: 7, fbx: -7 };
const POINT = { ...READY, crouch: 3, lean: 2, fx: 16, fy: -31, bx: 4, by: -24, ffx: 9, fbx: -8 };
const TAKE = { ...READY, crouch: 3, fx: 14, fy: -25, bx: 6, by: -22, ffx: 7, fbx: -7 };

export const act = {
  target: { x: TX },
  poses: [
    [-0.6, READY],
    [-0.28, SEAL, "out"],
    [-0.02, { ...SEAL, crouch: 3, fy: -37 }],
    [0, FLICK, "snap"],
    [0.55, { ...FLICK, crouch: 3, lean: 1 }],
    [0.8, HOLD],
    [1.05, { ...HOLD, crouch: 4 }],
    [2.7, HOLD],
    [2.9, POINT, "out"],
    [4.45, { ...POINT, crouch: 4, lean: 3 }],
    [5.2, { ...POINT, crouch: 3 }],
    [5.6, TAKE],
    [HOME, { ...TAKE, crouch: 4, fy: -24 }],
    [6.9, READY],
    [7.2, READY],
  ],
  hits: [
    { t: LAND, target: false, shake: 0.1, amp: 1 },
    { t: BREAK, target: false, stop: 0.06, shake: 0.3, amp: 2 },
    { t: HOP[0][1], target: false, shake: 0.08, amp: 1 },
    { t: HOP[1][1], target: false, shake: 0.08, amp: 1 },
    { t: EAT, push: -1.6, straw: 0, flash: 0.06, skin: "shadow", shiver: EAT_DUR, eat: EAT_DUR, eatEdge: "#7dffb0", y: -30 },
    { t: CHOMP, target: false, stop: 0.12, shake: 0.28, amp: 2 },
  ],
  dust: [
    { t: BREAK, x: X0, n: 10 },
    { t: HOP[0][1], x: XS[1], n: 7 },
    { t: HOP[1][1], x: XS[2], n: 7 },
  ],
};

export function create(o) {
  const C = fit(o.palette, 7), T = fit(o.talisman, 4), INK = hex(o.ink), R = new Rng(o.seed), floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[5], C[4], C[3], C[2]], haze: C[2] });
  const lights = new Lights();
  const frags = [], motes = [];
  let t = 0, eatenPrev = 0, goPrev = 0;
  const done = {};
  const once = (k, at) => !done[k] && t >= at && (done[k] = true);
  const left = (a, b) => Math.max(0.05, Math.min(R.range(a, b), meta.duration - 0.15 - t));

  // where the puppet is: risen 0..1, its feet (x, lift), squash on landing
  const rise = () => (t < BREAK ? 0 : Math.min(1, ease.outBack(seg(t, BREAK, RISEN), 1.2)));
  const pos = () => {
    let x = XS[0], lift = 0;
    for (let i = 0; i < HOP.length; i++) {
      const [a, b] = HOP[i];
      if (t >= b) x = XS[i + 1];
      else if (t > a) {
        const u = seg(t, a, b);
        x = lerp(XS[i], XS[i + 1], u);
        lift = Math.sin(Math.PI * u) * 13;
      }
    }
    return [Math.round(x), Math.round(lift)];
  };
  const heat = () => smooth(DRAW0, DRAW1, t) * (1 - smooth(RISEN + 0.4, RISEN + 1.4, t)) + 0.6 * bump(t, BREAK - 0.05, BREAK + 0.35);

  return {
    update(dt) {
      t += dt;
      const h = heat();
      if (once("land", LAND)) {
        lights.add(X0, -4, 30, C[4], 0.6, 0.3);
        for (let i = 0; i < 8; i++) ps.spawn(P.SPARK, X0, -2, R.range(-70, 70), -R.range(30, 110), R.range(0.15, 0.35));
      }
      // ghost fire licking up off the formation's lines
      if (t > DRAW0 && R.chance(0.55 * h)) {
        const a = R.range(0, TAU), r = R.chance(0.65) ? R0 : R1;
        ps.spawn(P.EMBER, X0 + Math.cos(a) * r, Math.sin(a) * r * SY, R.range(-6, 6), -R.range(18, 46), left(0.4, 1), C[R.pick([3, 4, 5])], R.range(1, 1.7));
      }
      if (t > DRAW0 && R.chance(0.08 * h)) {
        const a = R.range(0, TAU);
        ps.spawn(P.VAPOUR, X0 + Math.cos(a) * R1, Math.sin(a) * R1 * SY - 2, R.range(-4, 4), -R.range(6, 14), left(0.8, 1.4), C[2], R.range(2, 3));
      }
      if (once("break", BREAK)) {
        lights.add(X0, -14, 44, C[4], 0.9, 0.6);
        lights.add(X0, -6, 26, C[5], 1, 0.15);
        for (let i = 0; i < 18; i++) ps.spawn(P.SPARK, X0 + R.range(-6, 6), -2, R.range(-90, 90), -R.range(80, 220), R.range(0.2, 0.5));
        for (let i = 0; i < 8; i++) ps.spawn(P.GRIT, X0 + R.range(-8, 8), -1, R.range(-60, 60), -R.range(60, 160), R.range(0.5, 0.9), hex(R.pick(["#4a4263", "#6c6488", "#2b2639"])), 1);
        for (let i = 0; i < 6; i++) ps.spawn(P.SMOKE, X0 + R.range(-12, 12), -2, R.range(-14, 14), -R.range(10, 24), R.range(1.2, 1.9), 0, R.range(2, 3.2));
      }
      // the talisman under it burns away as it comes up
      if (t > BREAK && t < RISEN && R.chance(0.4)) ps.spawn(P.EMBER, X0 + R.range(-2, 2), -R.range(1, 6), R.range(-10, 10), -R.range(30, 60), R.range(0.4, 0.8), R.chance(0.5) ? T[2] : C[4], 1);
      if (once("eyes", EYES)) lights.add(X0 + 2, -33, 20, C[5], 0.8, 0.3);
      HOP.forEach(([, b], i) => {
        if (once("hop" + i, b)) for (let k = 0; k < 4; k++) ps.spawn(P.DUST, XS[i + 1] + R.range(-8, 8), -1, R.range(-20, 20), -R.range(4, 10), R.range(0.4, 0.7), hex("#8f8693"), R.range(1.5, 2.4));
      });
      const [px, lift] = pos(), mx = px + MOUTH[0], my = MOUTH[1] - lift;
      if (once("jaw", JAW)) lights.add(mx, my, 24, C[4], 0.7, 0.25);
      // the target comes apart from the side nearest the mouth, every pixel dragged in
      if (t >= EAT && t < EAT + EAT_DUR + 0.05) {
        const e = Math.min(1, (t - EAT) / EAT_DUR);
        for (const d of DUMMY_PX)
          if (d.th > eatenPrev && d.th <= e) frags.push({ x0: d.x, y0: d.y, c: d.c, age: 0, life: R.range(0.28, 0.5), curl: R.range(-14, 14) * (1 + (d.y + 26) / 30) });
        eatenPrev = e;
        // the draw: streaks and haze rushing into the mouth
        for (let k = 0; k < 3; k++) {
          const sx = TX + R.range(-14, 14), sy = -R.range(4, 48), a = Math.atan2(my - sy, mx - sx), sp = R.range(30, 60);
          ps.spawn(P.STREAK, sx, sy, Math.cos(a) * sp, Math.sin(a) * sp, Math.min(0.5, Math.hypot(mx - sx, my - sy) / (sp * 2.2)), C[R.pick([3, 4, 5])]);
        }
        if (R.chance(0.3)) ps.spawn(P.VAPOUR, mx + R.range(4, 18), my + R.range(-6, 6), -R.range(20, 40), R.range(-4, 4), R.range(0.3, 0.5), C[2], R.range(1.5, 2.5));
      }
      for (const f of frags) f.age += dt;
      for (let i = frags.length - 1; i >= 0; i--) if (frags[i].age >= frags[i].life) frags.splice(i, 1);
      if (once("chomp", CHOMP)) {
        lights.add(mx, my, 50, C[4], 0.9, 0.5);
        lights.add(mx, my, 14, WHITE, 0.9, 0.1);
        for (let i = 0; i < 14; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 120);
          ps.spawn(P.SPARK, mx, my, Math.cos(a) * sp, Math.sin(a) * sp - 30, R.range(0.2, 0.45));
        }
      }
      // it breaks up into ghost fire, top first, and the motes go home to his hand
      if (t >= GO && t < GONE + 0.05) {
        const g = Math.min(1, (t - GO) / (GONE - GO));
        for (const c of CLOSED) {
          const th = c.th * 0.35 + (c.r / PH) * 0.65;
          if (th > goPrev && th <= g && (c.c + c.r) % 2 === 0) {
            const x = px + c.c - PAX, y = c.r - PH;
            motes.push({ x0: x, y0: y, age: 0, delay: R.range(0, 0.15), life: R.range(0.55, 0.9), lift: R.range(10, 34), c: c.k === "e" ? C[6] : C[R.pick([3, 4, 5])] });
            if (R.chance(0.06)) ps.spawn(P.VAPOUR, x, y, R.range(-6, 6), -R.range(6, 16), R.range(0.5, 0.9), C[2], R.range(1.5, 2.5));
          }
        }
        goPrev = g;
      }
      for (const m of motes) m.age += dt;
      for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age >= motes[i].delay + motes[i].life) motes.splice(i, 1);
      if (once("home", HOME)) lights.add(HAND[0], HAND[1], 30, C[4], 0.8, 0.45);
      if (t > HOME - 0.3 && t < HOME + 0.3 && R.chance(0.5)) ps.spawn(P.EMBER, HAND[0] + R.range(-2, 2), HAND[1], R.range(-12, 12), -R.range(20, 40), left(0.3, 0.6), C[R.pick([4, 5])], 1);
      ps.update(dt);
      lights.update(dt);
    },

    drawBack(p) {
      ps.draw(p, "back");
      formation(p, "back");
    },

    draw(p) {
      formation(p, "front");
      // the talisman, flicked from his hand and spinning into the floor
      if (t < LAND) {
        const u = t / LAND, x = lerp(HAND[0] + 2, X0 - 1, u), y = lerp(HAND[1] - 3, -9, u) - Math.sin(Math.PI * u) * 10, w = Math.max(1, Math.round(3 * Math.abs(Math.cos(t * 30))));
        // a ghost-green streak behind it
        for (let k = 1; k <= 5; k++) {
          const v = Math.max(0, u - k * 0.04), tx = lerp(HAND[0] + 2, X0 - 1, v), ty = lerp(HAND[1] - 3, -9, v) - Math.sin(Math.PI * v) * 10 + 4;
          p.px(tx, ty, k < 3 ? C[5] : C[3]);
          p.light(tx, ty, C[4], 0.3);
        }
        slip(p, x - w / 2, y, w, 8, T, INK);
        p.light(x, y + 3, T[2], 0.5);
      } else if (t < RISEN) {
        // stuck upright, the glyph burning ghost-green, then eaten from the bottom by the breaking floor
        const burn = seg(t, BREAK - 0.05, RISEN);
        slip(p, X0 - 1, -9, 3, 9, T, t > DRAW0 ? mix(INK, C[4], smooth(DRAW0, BREAK, t)) : INK, 0, burn, C);
        p.glow(X0, -5, 10, C[4], 0.4 * smooth(DRAW0, BREAK, t) * (1 - burn));
      }
      puppet(p);
      // the eaten pieces, curling into the mouth
      const [px, lift] = pos(), mx = px + MOUTH[0], my = MOUTH[1] - lift;
      for (const f of frags) {
        const u = ease.inCubic(f.age / f.life), x = lerp(f.x0, mx, u), y = lerp(f.y0, my, u) + Math.sin(Math.PI * u) * f.curl;
        p.px(x, y, u > 0.6 ? C[5] : u > 0.3 ? mix(f.c, C[4], 0.5) : f.c);
        if (u > 0.3) p.light(x, y, C[4], 0.25);
      }
      ps.draw(p, "front");
      // motes flying home in an arc
      for (const m of motes) {
        const a = m.age - m.delay;
        if (a < 0) continue;
        const u = ease.inOutCubic(a / m.life), x = lerp(m.x0, HAND[0], u), y = lerp(m.y0, HAND[1], u) - Math.sin(Math.PI * u) * m.lift;
        p.px(x, y, u > 0.85 ? C[6] : m.c);
        p.light(x, y, C[4], 0.4);
      }
      if (t > HOME - 0.5) p.glow(HAND[0], HAND[1], 12, C[4], 0.6 * bump(t, HOME - 0.5, HOME + 0.6));
      lights.draw(p);
    },
  };

  // the formation: two rings on the floor and eight trigrams between them, drawn round from the front, far half behind
  function formation(p, layer) {
    if (t < DRAW0) return;
    const draw = ease.outCubic(seg(t, DRAW0, DRAW1)), fade = 1 - smooth(RISEN + 0.5, RISEN + 1.5, t), flare = bump(t, BREAK - 0.05, BREAK + 0.4);
    if (fade <= 0) return;
    const far = (a) => Math.sin(a) < 0;
    const within = (a) => {
      const d = Math.abs(((a - Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI);
      return d <= draw * Math.PI;
    };
    const col = (k) => (flare > 0.5 && k > 2 ? C[6] : C[Math.min(6, k + Math.round(flare * 2))]);
    for (const [r, k] of [[R0, 4], [R1, 3]]) {
      const n = Math.ceil(r * 7);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        if (far(a) !== (layer === "back") || !within(a)) continue;
        if (fade < 1 && hash(i, r, 7) % 1000 > fade * 1000) continue;
        const x = X0 + Math.cos(a) * r, y = Math.sin(a) * r * SY;
        p.px(x, y, col(k));
        p.light(x, y, C[4], 0.25 * fade + 0.4 * flare);
      }
    }
    // trigrams: three stacked dashes, some broken
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      if (far(a) !== (layer === "back") || !within(a)) continue;
      for (let l = 0; l < 3; l++) {
        const r = R1 + 2 + l * 1.6, broken = (i >> l) & 1;
        for (let s = -2; s <= 2; s++) {
          if (broken && s === 0) continue;
          const b = a + s * 0.05, x = X0 + Math.cos(b) * r, y = Math.sin(b) * r * SY;
          if (fade < 1 && hash(i, l, s + 9) % 1000 > fade * 1000) continue;
          p.px(x, y, col(3));
        }
      }
    }
    if (layer === "front") p.glow(X0, -2, 34, C[3], (0.25 * draw + 0.5 * flare) * fade);
  }

  function puppet(p) {
    const up = rise();
    if (up <= 0 || t >= GONE) return;
    const [px, lift] = pos(), open = t >= JAW && t < CHOMP, cells = open ? OPEN : CLOSED;
    const sink = Math.round((1 - up) * PH), go = t >= GO ? Math.min(1, (t - GO) / (GONE - GO)) : 0;
    const glut = bump(t, CHOMP, CHOMP + 0.6), lit = (1 - smooth(RISEN, RISEN + 1.2, t)) * 0.7;
    // its feet on landing: squash a pixel
    const squash = HOP.some(([, b]) => t >= b && t < b + 0.08) ? 1 : 0;
    for (const c of cells) {
      let y = c.r - PH + sink - lift;
      if (squash && c.r < 30) y += 1;
      if (y >= 0) continue;
      const th = c.th * 0.35 + (c.r / PH) * 0.65;
      if (go && th <= go) continue;
      let col = c.col;
      // underlit by the formation while it rises, a rim of ghost fire at the floor line
      if (lit > 0 && -y < 10) col = mix(col, C[3], lit * (1 - -y / 10));
      if (sink > 0 && -y <= 1) col = C[5];
      // swollen with what it ate
      if (glut > 0 && c.k !== "k") col = mix(col, C[4], glut * 0.55);
      if (go && th <= go + 0.06) col = C[5];
      p.px(px + c.c - PAX, y, col);
      if (c.k === "e" && t >= EYES) p.light(px + c.c - PAX, y, C[5], 1);
    }
    const hx = px + 2, hy = 6 - PH + sink - lift;
    if (!go) {
      // the talisman over its face, flapping as it hops
      const swing = (lift ? -2 : 0) + Math.round(Math.sin(t * 9) * (open ? 1.4 : 0.6));
      if (hy + 9 < 0) slip(p, hx - 1, hy, 3, 9, T, INK, swing);
    }
    if (t >= EYES && !go) p.glow(px + 2, 9 - PH + sink - lift, 7, C[4], 0.5 * (1 + 0.6 * bump(t, EYES, EYES + 0.3)));
    if (open) {
      const mx = px + MOUTH[0], my = MOUTH[1] - lift;
      p.glow(mx, my, 10, C[4], 0.6 + 0.3 * Math.sin(t * 30));
      p.light(mx, my, C[5], 0.8);
    }
    if (glut > 0) p.glow(px, -24 - lift, 22, C[4], 0.5 * glut);
  }
}
