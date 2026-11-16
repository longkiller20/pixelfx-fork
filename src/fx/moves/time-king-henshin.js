// The time king: a boy touches his belt and a clock circle burns into the floor, a great clock face rises behind him with
// gears turning, a ring of cards orbits him, violet time-streams spiral up and pillars of light climb. He raises his arm like a
// clock hand; the hands race back round the dial and strike twelve; the cards slam into him, and his armour is swept onto him
// clockwise from the crown, like a hand going round the dial. The clock shatters into gold and the king is left standing, his
// cape stirring. The boy and the king are the user's own sprites (./_timeking-art.js), rigged in ./_sprite-rig.js.
import { Particles, Lights, P, Rng, clamp, lerp, seg, smooth, bump, ease, hash, TAU, WHITE, hex, mix, fit, READY } from "../../core/index.js";
import { decode, Rig } from "./_sprite-rig.js";
import { BOY, KING } from "./_timeking-art.js";

// the beats
const FLOOR0 = 0.2, FLOOR1 = 0.8, TOUCH = 0.5, DIAL0 = 0.8, DIAL1 = 1.35, CARDS = 1.1, SWIRL = 1.35, RAISE = 1.6;
const STRIKE = 2.45, SLAM = 2.7, WHITEOUT = 2.62, SWEEP0 = 2.66, SWEEP1 = 3.2, EYES = 3.3, SHATTER0 = 3.6, SHATTER1 = 4.35, D = 5.4;
const CX = 0, CY = -86, RC = 50, FRX = 64, FSY = 0.26, RING_Y = -40, RRX = 48, RRY = 10, NCARD = 12, BODY = [0, -42];

export const meta = {
  name: "Time king henshin",
  desc: "A clock circle burns into the floor, a great dial and gears rise behind him, cards orbit; the hands strike twelve and his armour sweeps on clockwise.",
  tags: ["move", "transform", "henshin", "time", "clock", "gears", "cards", "gold", "one-shot"],
  size: [228, 208],
  origin: [114, 184],
  duration: D,
  loop: false,
  holds: true,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#2a1604", "#6a3a08", "#b8700e", "#f0a820", "#ffd84a", "#fff2a8", "#ffffff"],
    time: ["#1a0630", "#4a1080", "#8a2cd0", "#c860ff", "#f0b8ff"],
    gem: "#ff2a78",
    seed: 4,
  },
};

const SB = decode(BOY), SK = decode(KING);
const boy = new Rig(SB, [
  { name: "armF", poly: [[25, 24], [33, 24], [33, 48], [26, 48], [26, 34]], pivot: [27, 26] },
  { name: "armB", poly: [[2, 24], [10, 24], [12, 34], [12, 47], [2, 47]], pivot: [10, 25] },
]);
const king = new Rig(SK, []);
const BELT = [22 - SB.ox, 36 - SB.oy], KEYES = [[38, 15], [47, 16]].map(([x, y]) => [x - SK.ox, y - SK.oy]), KGEM = [46 - SK.ox, 46 - SK.oy];
const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

const keyed = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, a] = keys[i - 1], [t1, b, how] = keys[i];
    if (t >= t1) continue;
    const u = seg(t, how === "snap" ? t1 - 0.06 : t0, t1);
    return lerp(a, b, how === "out" ? ease.outBack(u, 1.6) : ease.inOutCubic(u));
  }
  return keys[keys.length - 1][1];
};

export const act = {
  body: false,
  poses: [[0, READY], [D, READY]],
  hits: [
    { t: TOUCH, target: false, shake: 0.08, amp: 1 },
    { t: STRIKE, target: false, stop: 0.12, shake: 0.35, amp: 3 },
    { t: SLAM, target: false, stop: 0.06, shake: 0.2, amp: 2 },
  ],
  dust: [{ t: STRIKE, x: 0, n: 10 }],
};

export function create(o) {
  const C = fit(o.palette, 7), V = fit(o.time, 5), GEM = hex(o.gem), R = new Rng(o.seed), floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[3]] });
  const lights = new Lights();
  let t = 0;
  const done = {};
  const once = (k, at) => !done[k] && t >= at && (done[k] = true);
  const left = (a, b) => Math.max(0.05, Math.min(R.range(a, b), D - 0.12 - t));

  // how present each piece of the spell is, 0..1
  const floorK = () => smooth(FLOOR0, FLOOR0 + 0.2, t) * (1 - smooth(SHATTER0 + 0.2, SHATTER1 + 0.4, t));
  const dialK = () => smooth(DIAL0, DIAL0 + 0.2, t) * (1 - smooth(SHATTER0, SHATTER1, t));
  const power = () => smooth(RAISE, STRIKE, t) * (1 - smooth(STRIKE + 0.3, SHATTER1, t));
  // the hands: wound back fast, slowing, striking twelve
  const handA = () => {
    if (t < RAISE) return (TAU * 10) / 12 + (TAU / 12) * seg(t, DIAL0, RAISE) * 0.5; // ten past, ticking
    const u = seg(t, RAISE, STRIKE);
    return lerp((TAU * 10.5) / 12, -TAU * 3, ease.outCubic(u)); // three turns back, ending on twelve
  };
  const spin = () => t * 0.8 + 4 * ease.inCubic(seg(t, CARDS, STRIKE)) * 1.6;
  const cardR = () => 1 - ease.inCubic(seg(t, STRIKE, SLAM));

  return {
    update(dt) {
      t += dt;
      if (once("touch", TOUCH)) {
        lights.add(BELT[0], BELT[1], 26, GEM, 0.8, 0.4);
        for (let i = 0; i < 8; i++) ps.spawn(P.SPARK, BELT[0], BELT[1], R.range(-70, 70), R.range(-90, 10), R.range(0.15, 0.3));
      }
      // motes rising off the floor circle
      if (R.chance(0.7 * floorK())) {
        const a = R.range(0, TAU), r = R.pick([FRX, FRX * 0.72]);
        ps.spawn(R.chance(0.3) ? P.STAR : P.MOTE, Math.cos(a) * r, Math.sin(a) * r * FSY, 0, -R.range(20, 60), left(0.4, 0.9), C[R.pick([4, 5])], 1);
      }
      if (t > CARDS && t < SLAM && R.chance(0.4)) ps.spawn(P.FLAKE, R.range(-60, 60), R.range(-130, -10), 0, -R.range(5, 20), left(0.5, 1), C[R.pick([4, 5, 6])], 1);
      if (once("strike", STRIKE)) {
        lights.add(CX, CY, 90, C[4], 1, 0.6);
        lights.add(BODY[0], BODY[1], 40, WHITE, 1, 0.2);
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, TAU), sp = R.range(90, 220);
          ps.spawn(P.SPARK, CX + Math.cos(a) * 6, CY + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.25, 0.55));
        }
      }
      if (once("slam", SLAM)) {
        lights.add(BODY[0], BODY[1], 60, C[5], 1, 0.4);
        for (let i = 0; i < 18; i++) ps.spawn(P.SPARK, R.range(-8, 8), R.range(-70, -10), R.range(-160, 160), R.range(-140, 30), R.range(0.25, 0.5));
      }
      // the sweep throws sparks off its hand
      if (t > SWEEP0 && t < SWEEP1) {
        const a = sweepA(), d = R.range(10, 44);
        ps.spawn(P.SPARK, BODY[0] + Math.sin(a) * d, BODY[1] - Math.cos(a) * d, Math.cos(a) * R.range(40, 120), Math.sin(a) * R.range(40, 120), R.range(0.12, 0.3));
      }
      if (once("eyes", EYES)) {
        for (const [x, y] of KEYES) lights.add(x, y, 14, GEM, 1, 0.4);
        lights.add(KGEM[0], KGEM[1], 20, GEM, 0.8, 0.4);
      }
      // the dial breaks into gold
      if (t > SHATTER0 && t < SHATTER1) {
        for (let i = 0; i < 4; i++) {
          const a = R.range(0, TAU), r = R.range(4, RC);
          ps.spawn(R.chance(0.5) ? P.MOTE : P.FLAKE, CX + Math.cos(a) * r, CY + Math.sin(a) * r, Math.cos(a) * R.range(10, 40), Math.sin(a) * R.range(10, 40) - 10, left(0.4, 0.9), C[R.pick([4, 5, 6])], 1);
        }
      }
      // a quiet aura once he stands
      if (t > EYES && R.chance(0.25)) ps.spawn(P.EMBER, R.range(-26, 26), -R.range(0, 20), R.range(-6, 6), -R.range(14, 30), left(0.5, 1), C[R.pick([4, 5])], 1);
      ps.update(dt);
      lights.update(dt);
    },

    drawBack(p) {
      pillars(p, "back");
      floorCircle(p, "back");
      dial(p);
      swirls(p, "back");
      cards(p, "back");
      ps.draw(p, "back");
    },

    draw(p) {
      hero(p);
      floorCircle(p, "front");
      swirls(p, "front");
      cards(p, "front");
      pillars(p, "front");
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  function sweepA() {
    return TAU * ease.inOutCubic(seg(t, SWEEP0, SWEEP1));
  }

  // ---- the hero: the boy, then the king swept onto him clockwise from twelve
  function hero(p) {
    const sweeping = t >= SWEEP0, a = sweepA(), white = t >= WHITEOUT && t < WHITEOUT + 0.07;
    // is this point already swept? angle clockwise from straight up about the body's middle
    const swept = (lx, ly) => {
      if (!sweeping) return false;
      if (t >= SWEEP1) return true;
      let g = Math.atan2(lx - BODY[0], -(ly - BODY[1]));
      if (g < 0) g += TAU;
      return g < a;
    };
    if (t < SWEEP1) {
      const pose = {
        armF: keyed(t, [[TOUCH - 0.2, 0], [TOUCH, 0.55, "out"], [RAISE - 0.15, 0.5], [RAISE + 0.1, -2.75, "out"], [STRIKE, -2.8], [SLAM, -2.6]]),
        armB: keyed(t, [[TOUCH - 0.2, 0], [TOUCH, -0.15], [RAISE, -0.1], [RAISE + 0.1, 0.35, "out"]]),
        dy: t < TOUCH && Math.floor(t * 2.5) & 1 ? 1 : 0,
      };
      const wind = 0.6 + 2 * power();
      boy.draw(p, 0, 0, pose, {
        fill: true,
        // the coat tails and hair stir, more as the power builds
        warp: (x, y) => [(y > 44 ? (y - 44) / 25 : y < 14 ? 0.5 : 0) * wind * Math.sin(t * 6 - y * 0.25), 0],
        color: (c, sx, sy, lx, ly) => (swept(lx, ly) ? 0 : white ? WHITE : c),
      });
      // the belt's gem
      p.glow(BELT[0], BELT[1], 6, GEM, 0.3 + 0.6 * bump(t, TOUCH - 0.05, TOUCH + 0.4) + 0.4 * power());
      if (t > RAISE && t < SLAM) {
        // the raised hand burns like the tip of a clock hand
        const [hx, hy] = boy.where("armF", 30, 45, 0, 0, pose);
        p.glow(hx, hy, 8, C[5], 0.5 + 0.4 * power());
        p.px(hx, hy, WHITE);
      }
    }
    if (sweeping) {
      const fresh = 1 - seg(t, SWEEP1 - 0.1, SWEEP1 + 0.25), calm = 1 - smooth(SWEEP1, D - 0.6, t) * 0.7;
      king.draw(p, 0, Math.floor(t * 1.6) & 1 && t > SWEEP1 + 0.3 ? 1 : 0, {}, {
        // the cape stirs at its two wings
        warp: (x, y) => {
          const w = y > 48 ? ((y - 48) / 37) * (x < 24 ? 1 : x > 56 ? -1 : 0.3) : 0;
          return [w * calm * 2.2 * Math.sin(t * 5 - y * 0.2), 0];
        },
        color: (c, sx, sy, lx, ly) => {
          if (!swept(lx, ly)) return 0;
          return fresh > 0 ? mix(c, C[6], fresh * 0.25) : c;
        },
      });
      // the sweeping hand: a beam from the body's middle out past the edge
      if (t < SWEEP1) {
        const ex = BODY[0] + Math.sin(a) * 50, ey = BODY[1] - Math.cos(a) * 50;
        p.line(BODY[0], BODY[1], ex, ey, (u) => (u < 0.7 ? WHITE : C[5]), (u) => 1 - u * 0.5);
        p.glowLine(BODY[0], BODY[1], ex, ey, 4, C[4], 0.6);
      }
      if (t > EYES - 0.1) {
        const k = 0.35 + 0.6 * bump(t, EYES, EYES + 0.5);
        for (const [x, y] of KEYES) p.glow(x, y, 4, GEM, k);
        p.glow(KGEM[0], KGEM[1], 4, GEM, k);
        p.glow(0, -60, 34, C[3], 0.12 + 0.2 * bump(t, SWEEP1, SWEEP1 + 0.8));
      }
    }
    if (white) p.glow(BODY[0], BODY[1], 40, C[5], 0.8);
  }

  // ---- the floor: a clock circle on the floor plane, far half behind
  function floorCircle(p, layer) {
    const k = floorK();
    if (k <= 0) return;
    const draw = ease.outCubic(seg(t, FLOOR0, FLOOR1)), far = layer === "back", flare = bump(t, STRIKE, STRIKE + 0.5);
    const on = (a) => {
      // drawn clockwise from the front
      const d = (a - Math.PI / 2 + TAU * 2) % TAU;
      return d <= draw * TAU;
    };
    for (const [r, c] of [[FRX, C[5]], [FRX - 3, C[3]], [FRX * 0.72, C[4]], [FRX * 0.36, C[4]]]) {
      const n = Math.ceil(r * 6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        if (Math.sin(a) < 0 !== far || !on(a)) continue;
        if (k < 1 && hash(i, r | 0, 3) % 1000 > k * 1000) continue;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * FSY;
        p.px(x, y, flare > 0.4 ? C[6] : c);
        p.light(x, y, C[4], 0.2 * k + 0.4 * flare);
      }
    }
    // hour marks between the rings, the twelve a double one
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * TAU + Math.PI / 2;
      if (Math.sin(a) < 0 !== far || !on(a)) continue;
      for (let s = h === 0 ? -1 : 0; s <= (h === 0 ? 1 : 0); s++) {
        const b = a + s * 0.03;
        p.line(Math.cos(b) * (FRX - 5), Math.sin(b) * (FRX - 5) * FSY, Math.cos(b) * (FRX * 0.76), Math.sin(b) * FRX * 0.76 * FSY, C[4], k);
      }
    }
    if (!far) p.glow(0, -2, FRX, C[3], 0.18 * k + 0.4 * flare);
  }

  // ---- pillars of light climbing from the floor circle
  function pillars(p, layer) {
    const k = smooth(DIAL0, DIAL1, t) * (1 - smooth(SLAM, SHATTER0 + 0.3, t)), boost = 1 + power() * 1.5;
    if (k <= 0) return;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.2, r = (hash(i, 5) % 100) / 100 > 0.5 ? FRX * 0.72 : FRX - 2;
      if (Math.sin(a) < 0 !== (layer === "back")) continue;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * FSY, h = (30 + (hash(i, 9) % 60)) * k * boost * (0.75 + 0.25 * Math.sin(t * 7 + i));
      p.line(x, y, x, y - h, (u) => (u < 0.2 ? C[6] : C[5]), (u) => (1 - u) * k);
      p.glowLine(x, y, x, y - h * 0.8, 2, C[4], 0.25 * k);
    }
    if (layer === "front" && power() > 0) {
      // the central column through him, at the strike
      const s = bump(t, STRIKE - 0.05, SLAM + 0.2);
      p.glowLine(0, 0, 0, -150, 10, C[4], 0.5 * s);
      p.line(0, 0, 0, -150, WHITE, (u) => s * (1 - u * 0.7));
    }
  }

  // ---- the dial behind him
  function dial(p) {
    const k = dialK();
    if (k <= 0) return;
    const g = ease.outCubic(seg(t, DIAL0, DIAL1)), flare = bump(t, STRIKE, STRIKE + 0.4), sh = t > SHATTER0 ? seg(t, SHATTER0, SHATTER1) : 0;
    const gone = (x, y) => sh > 0 && (hash(Math.round(x), Math.round(y), 11) % 1000) / 1000 < sh;
    const dot = (x, y, c) => !gone(x, y) && p.px(x, y, c);
    const glow = 0.3 * k + 0.5 * flare;
    // gears, turning against each other, one either side
    gear(p, CX - 62, CY - 26, 15, 12, t * 1.2, C[3], k * g, gone);
    gear(p, CX + 64, CY + 6, 12, 10, -t * 1.5, C[3], k * g, gone);
    gear(p, CX + 44, CY + 44, 8, 8, t * 2.2, C[2], k * g, gone);
    // rings, drawn round clockwise from twelve
    for (const [r, c] of [[RC, C[5]], [RC - 2, C[3]], [RC * 0.42, C[4]]]) {
      const n = Math.ceil(r * 7);
      for (let i = 0; i < n; i++) {
        if (i / n > g) continue;
        const a = (i / n) * TAU - Math.PI / 2, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
        dot(x, y, flare > 0.4 ? C[6] : c);
        if (i % 3 === 0) p.light(x, y, C[4], glow);
      }
    }
    // minute ticks and the numerals, each lighting as the ring reaches it
    for (let m = 0; m < 60; m++) {
      if (m / 60 > g) continue;
      const a = (m / 60) * TAU - Math.PI / 2, big = m % 5 === 0, r0 = RC - 4, r1 = RC - (big ? 7 : 5);
      if (!gone(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0)) p.line(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0, CX + Math.cos(a) * r1, CY + Math.sin(a) * r1, big ? C[5] : C[3]);
    }
    for (let h = 0; h < 12; h++) {
      if (h / 12 > g) continue;
      const a = (h / 12) * TAU - Math.PI / 2, x = CX + Math.cos(a) * (RC - 14), y = CY + Math.sin(a) * (RC - 14);
      if (gone(x, y)) continue;
      const pop = bump(t, DIAL0 + (h / 12) * (DIAL1 - DIAL0), DIAL0 + (h / 12) * (DIAL1 - DIAL0) + 0.25);
      p.text(ROMAN[h], x, y - 2, pop > 0.3 || flare > 0.3 ? C[6] : C[4], { align: "center", shadow: C[1] });
      p.light(x, y, C[4], 0.3 * k + pop * 0.6);
    }
    // the sunburst, the hands and the hourglass at the hub
    if (g > 0.5) {
      const a = handA(), ma = a * 12;
      for (let i = 0; i < 8; i++) {
        const b = (i / 8) * TAU + Math.PI / 8, L = i % 2 ? 10 : 15;
        if (!gone(CX + Math.cos(b) * 8, CY + Math.sin(b) * 8)) p.tri(CX + Math.cos(b - 0.25) * 6, CY + Math.sin(b - 0.25) * 6, CX + Math.cos(b + 0.25) * 6, CY + Math.sin(b + 0.25) * 6, CX + Math.cos(b) * L, CY + Math.sin(b) * L, C[3]);
      }
      if (!sh) {
        hand(p, a, RC * 0.5, 2, C[5]);
        hand(p, ma, RC - 9, 1, C[6]);
      }
      p.circle(CX, CY, 5, C[1]);
      p.ring?.(CX, CY, 5, 1, C[5]);
      // the hourglass
      for (const [x, y] of [[-2, -3], [-1, -2], [0, -1], [1, 0], [2, 1], [2, -3], [1, -2], [-1, 0], [-2, 1], [-2, -3], [-1, -3], [0, -3], [1, -3], [2, -3], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]) dot(CX + x, CY + y + 1, GEM);
      p.glow(CX, CY, 7, GEM, 0.4 * k + 0.6 * flare);
    }
    p.glowRing(CX, CY, RC, 5, C[3], 0.35 * k * (1 - sh));
    p.glow(CX, CY, RC, C[1], 0.12 * k * (1 - sh));
  }

  function hand(p, a, L, w, c) {
    const ex = CX + Math.sin(a) * L, ey = CY - Math.cos(a) * L;
    p.line(CX, CY, ex, ey, c);
    if (w > 1) p.line(CX + Math.cos(a), CY + Math.sin(a), ex, ey, c);
    p.light(ex, ey, C[5], 0.6);
  }

  function gear(p, x, y, r, teeth, a, c, k, gone) {
    if (k <= 0) return;
    const n = Math.ceil(r * 7);
    for (let i = 0; i < n; i++) {
      const b = (i / n) * TAU, px = x + Math.cos(b) * r, py = y + Math.sin(b) * r;
      if (!gone(px, py)) p.dot(px, py, c, k);
      const tooth = ((b - a) / TAU) * teeth;
      if (tooth - Math.floor(tooth) < 0.42)
        for (const d of [1, 2]) if (!gone(px, py)) p.dot(x + Math.cos(b) * (r + d), y + Math.sin(b) * (r + d), c, k);
    }
    for (let s = 0; s < 4; s++) {
      const b = a + (s / 4) * TAU;
      p.line(x, y, x + Math.cos(b) * (r - 1), y + Math.sin(b) * (r - 1), c, k * 0.8);
    }
    p.circle(x, y, 2.5, C[2], k);
    p.glow(x, y, r + 4, C[3], 0.12 * k);
  }

  // ---- the ring of cards: faces out, the back half behind him; they slam into him at the strike
  function cards(p, layer) {
    if (t < CARDS || t >= SLAM) return;
    const s = spin(), cr = cardR();
    for (let i = 0; i < NCARD; i++) {
      const born = CARDS + (i / NCARD) * 0.3;
      if (t < born) continue;
      const a = s + (i / NCARD) * TAU, depth = Math.sin(a);
      if (depth < 0 !== (layer === "back")) continue;
      const x = Math.cos(a) * RRX * cr, y = RING_Y + depth * RRY * cr - (1 - cr) * 2, w = Math.max(1, Math.round(11 * Math.abs(depth) * (0.4 + 0.6 * cr) + 1));
      card(p, x, y, w, Math.round(15 * (0.5 + 0.5 * cr)), depth > 0, smooth(born, born + 0.15, t) * (depth > 0 ? 1 : 0.6));
    }
  }

  function card(p, x, y, w, h, front, k) {
    const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        let c = edge ? C[front ? 5 : 3] : front ? C[1] : C[0];
        // the face: an hourglass in a frame
        if (front && !edge && w >= 5) {
          const u = (i + 0.5) / w - 0.5, v = (j + 0.5) / h - 0.5;
          if ((Math.abs(Math.abs(u) - Math.abs(v) * 0.75) < 0.09 && Math.abs(v) < 0.33) || (Math.abs(Math.abs(v) - 0.33) < 0.05 && Math.abs(u) < 0.3)) c = C[4];
        }
        p.dot(x0 + i, y0 + j, c, k);
      }
    p.light(x, y, C[4], 0.25 * k);
  }

  // ---- violet time-streams spiralling up round him
  function swirls(p, layer) {
    const k = smooth(SWIRL, SWIRL + 0.3, t) * (1 - smooth(SLAM, SHATTER0, t));
    if (k <= 0) return;
    const sp = 2.6 + 3 * power();
    for (let j = 0; j < 4; j++) {
      const head = ((t * 0.55 + j / 4) % 1) * 1.4;
      for (let s = 0; s < 70; s++) {
        const u = head - s * 0.006;
        if (u < 0 || u > 1) continue;
        const a = u * TAU * 1.6 + j * 2.1 - t * sp * 0.2, rx = 44 + 16 * Math.sin(u * 3 + j), depth = Math.sin(a);
        if (depth < 0 !== (layer === "back")) continue;
        const x = Math.cos(a) * rx, y = lerp(-6, -150, u) + depth * 8, f = 1 - s / 70;
        // a ribbon: a hot leading edge, two pixels thick at the head, thinning to a dim tail
        p.dot(x, y, f > 0.85 ? WHITE : f > 0.6 ? V[4] : f > 0.3 ? V[3] : V[2], k);
        if (s < 45) p.dot(x, y + 1, f > 0.7 ? V[3] : V[2], k);
        if (s < 18) p.dot(x, y - 1, V[2], k);
        p.light(x, y, V[3], 0.45 * f * k);
      }
    }
  }
}
