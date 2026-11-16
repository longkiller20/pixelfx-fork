// Henshin: the fighter's belt forms at his waist, he throws an arm up and slams the buckle, mirror images of his armour close
// in on him from both sides, a white flash, and the armour is wiped onto him from the belt out. A ring of fire opens behind him
// and his dragon pours out of it head first, coils, roars, and breathes a torrent of fire into the straw target, then burns
// away tail first. The character, the armour and the dragon are the user's own sprites (./_henshin-art.js), rigged in
// ./_sprite-rig.js: arms turn about the shoulders, hair waves, the dragon bends along its spine.
import { Particles, Lights, Blazes, P, PF, Rng, clamp, lerp, seg, smooth, bump, ease, TAU, WHITE, hex, mix, fit, READY } from "../../core/index.js";
import { decode, Rig, Serpent } from "./_sprite-rig.js";
import { FIGHTER, ARMOR, BELT, DRAGON } from "./_henshin-art.js";

// the beats
const BELT0 = 0.4, BELT1 = 0.8, RAISE = 0.95, UP = 1.2, SLAM = 1.6, FLASH = 2.15, REVEAL = 2.55, SNAP = 2.95;
const SIGIL = 3.15, EMERGE0 = 3.4, EMERGE1 = 4.15, ROAR = 4.25, BREATH0 = 4.5, BREATH1 = 5.45, HIT1 = 4.68, HIT2 = 5.08;
const VANISH0 = 6.2, VANISH1 = 6.9, D = 7.4;
const TX = 150, BELTY = -31, DX = -63, DY = -132, MOUTH = [98, 45];

export const meta = {
  name: "Henshin dragon",
  desc: "He slams his belt and transforms in a flash of mirror images; his dragon pours out of a ring of fire behind him, coils, roars and breathes fire on the target.",
  tags: ["move", "transform", "henshin", "dragon", "fire", "summon", "armor", "one-shot"],
  size: [300, 162],
  origin: [100, 152],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  holds: true,
  options: {
    palette: ["#2a0606", "#6a0d0d", "#b51c1c", "#ee3a24", "#ff8a3a", "#ffd27a", "#ffffff"],
    seed: 5,
  },
};

const SF = decode(FIGHTER), SA = decode(ARMOR), SB = decode(BELT), SD = decode(DRAGON);
const fighter = new Rig(SF, [
  { name: "armF", poly: [[41, 21], [47, 22], [49, 30], [55, 31], [55, 43], [45, 43], [42, 34], [40, 28]], pivot: [42, 24] },
  { name: "armB", poly: [[24, 24], [30, 24], [30, 31], [28, 35], [28, 46], [15, 46], [15, 33], [21, 29]], pivot: [28, 26] },
]);
const armor = new Rig(SA, [
  { name: "armF", poly: [[28, 20], [41, 20], [41, 37], [31, 37], [28, 31]], pivot: [29, 24] },
  { name: "armB", poly: [[0, 19], [13, 19], [13, 29], [11, 47], [0, 47]], pivot: [12, 23] },
]);
// the dragon's spine, head to tail, in its own pixels (it faces right)
const SPINE = [[12, 38], [25, 33], [38, 26], [50, 22], [62, 22], [75, 26], [86, 33], [95, 42], [100, 55], [98, 66], [90, 74], [78, 78], [65, 77], [52, 73], [38, 70], [25, 72], [17, 80], [18, 92], [28, 99], [42, 103], [56, 104], [70, 106], [78, 108]].map(([x, y]) => [115 - x, y + 1]);
const dragon = new Serpent(SD, SPINE, 0.13);
const EYES = [[20, 15], [29, 14]].map(([x, y]) => [x - SA.ox, y - SA.oy]);

const keyed = (t, keys) => {
  // [t, value, how] keys: smooth between, "snap" jumps fast (in 0.06 s), "out" arrives fast and settles
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
  target: { x: TX },
  poses: [[0, READY], [D, READY]],
  hits: [
    { t: SLAM, target: false, stop: 0.08, shake: 0.2, amp: 2 },
    { t: FLASH, target: false, shake: 0.25, amp: 2 },
    { t: ROAR, target: false, stop: 0.1, shake: 0.5, amp: 3 },
    { t: HIT1, stop: 0.1, shake: 0.3, amp: 3, push: 3, straw: 22, skin: "char", y: -32 },
    { t: HIT2, push: 2, straw: 12, flash: 0.04, y: -26 },
  ],
  dust: [{ t: SLAM, x: 0, n: 8 }, { t: FLASH, x: 0, n: 10 }],
};

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[3]] });
  const lights = new Lights(), blazes = new Blazes(ps);
  let t = 0;
  const done = {};
  const once = (k, at) => !done[k] && t >= at && (done[k] = true);
  const left = (a, b) => Math.max(0.05, Math.min(R.range(a, b), D - 0.12 - t));

  // poses
  const fighterPose = () => ({
    armF: keyed(t, [[RAISE, 0], [UP, -1.95, "out"], [SLAM - 0.06, -2.05], [SLAM, 0.85, "snap"], [FLASH, 0.8]]) + (t > UP && t < SLAM ? Math.sin(t * 60) * 0.03 : 0),
    armB: keyed(t, [[RAISE, 0], [UP, 0.35], [SLAM - 0.06, 0.4], [SLAM, -0.2, "snap"]]),
    dy: t > SLAM && t < FLASH ? 1 : Math.floor(t * 2.5) & 1 && t < BELT0 ? 1 : 0,
  });
  const armorPose = () => ({
    armF: keyed(t, [[SNAP, 0], [SNAP + 0.12, -0.45, "out"], [SNAP + 0.5, 0], [BREATH0 - 0.2, 0], [BREATH0, -0.35, "out"], [BREATH1 + 0.3, -0.35], [BREATH1 + 0.7, 0]]),
    armB: keyed(t, [[SNAP, 0], [SNAP + 0.12, 0.15], [SNAP + 0.5, 0]]),
    dy: (Math.floor(t * 2) & 1) && (t < BREATH0 || t > BREATH1 + 0.7) ? 1 : 0,
  });
  // the dragon: where it is and how it bends
  const emerge = () => ease.outCubic(seg(t, EMERGE0, EMERGE1));
  const amp = () => 2.5 + 1.5 * bump(t, ROAR - 0.1, BREATH1);
  const bend = (s) => amp() * (0.3 + 0.7 * s) * Math.sin(TAU * (1.5 * s - 0.85 * t));
  const shift = (s) => {
    const e = emerge(), roar = bump(t, ROAR - 0.05, ROAR + 0.35);
    let x = (1 - e) * -26 * (1 - s), y = (1 - e) * -20 * (1 - s) + Math.sin(t * 2.2) * 1.5;
    if (s < 0.2) {
      x += roar * (Math.floor(t * 40) & 1 ? 1 : -1) * 1.2;
      y += -roar * 3 + (t > BREATH0 && t < BREATH1 ? 1 : 0);
    }
    return [x, y];
  };
  const mouth = () => {
    const [sx, sy] = shift(0);
    return [DX + MOUTH[0] + sx, DY + MOUTH[1] + sy + bend(dragon.head)];
  };
  const breathing = () => t >= BREATH0 && t < BREATH1;

  return {
    update(dt) {
      t += dt;
      if (once("belt", BELT0)) lights.add(0, BELTY + 2, 24, C[4], 0.6, 0.4);
      // gathering power into the raised fist
      if (t > UP && t < SLAM) {
        const [hx, hy] = fighter.where("armF", 51, 37, 0, 0, fighterPose());
        if (R.chance(0.7)) {
          const a = R.range(0, TAU), d = R.range(14, 24);
          ps.spawn(P.STREAK, hx + Math.cos(a) * d, hy + Math.sin(a) * d, -Math.cos(a) * 30, -Math.sin(a) * 30, 0.22, C[R.pick([4, 5, 6])]);
        }
      }
      if (once("slam", SLAM)) {
        lights.add(0, BELTY + 2, 50, C[4], 1, 0.45);
        lights.add(0, BELTY + 2, 12, WHITE, 1, 0.12);
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(60, 170);
          ps.spawn(P.SPARK, 0, BELTY + 2, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.2, 0.45));
        }
      }
      if (once("flash", FLASH)) {
        lights.add(0, -32, 70, C[5], 1, 0.5);
        for (let i = 0; i < 20; i++) ps.spawn(P.SPARK, R.range(-12, 12), R.range(-60, -4), R.range(-150, 150), R.range(-160, 20), R.range(0.25, 0.55));
      }
      // the armour wipes on: sparks off the two edges
      if (t > FLASH && t < REVEAL) {
        const r = ease.outCubic(seg(t, FLASH, REVEAL)) * 40;
        for (const y of [BELTY - r, BELTY + r]) if (y > -66 && y < 0 && R.chance(0.8)) ps.spawn(P.SPARK, R.range(-14, 14), y, R.range(-80, 80), R.range(-40, 10), R.range(0.12, 0.3));
      }
      if (once("eyes", SNAP + 0.1)) for (const [x, y] of EYES) lights.add(x, y, 10, C[3], 1, 0.35);
      // the ring of fire breathes flame while it's open
      if (t > SIGIL && t < EMERGE1 + 0.4) {
        const k = smooth(SIGIL, SIGIL + 0.3, t) * (1 - smooth(EMERGE1, EMERGE1 + 0.4, t)), a = R.range(0, TAU);
        if (R.chance(0.9 * k)) ps.spawn(P.FIRE, DX + 58 + Math.cos(a) * 50, DY + 60 + Math.sin(a) * 50, R.range(-8, 8), -R.range(10, 30), R.range(0.25, 0.5), 0, R.range(1.4, 2.6), 0, PF.BACK);
      }
      if (once("open", EMERGE0)) lights.add(DX + 58, DY + 60, 80, C[3], 0.8, 0.6);
      // flame peels off the dragon where it comes through
      if (t > EMERGE0 && t < EMERGE1 + 0.1 && R.chance(0.8)) {
        const [mx, my] = mouth();
        ps.spawn(P.FIRE, mx - 20 + R.range(-20, 20), my + R.range(-10, 30), R.range(-20, 20), -R.range(10, 40), R.range(0.25, 0.45), 0, R.range(1.5, 3), 0, PF.BACK);
      }
      if (once("roar", ROAR)) {
        const [mx, my] = mouth();
        lights.add(mx, my, 60, C[4], 0.9, 0.5);
        for (let i = 0; i < 10; i++) ps.spawn(P.EMBER, mx + R.range(-6, 6), my + R.range(-4, 4), R.range(20, 80), R.range(-60, 10), R.range(0.4, 0.8), C[5], 1);
      }
      // the breath: a torrent of flame from the jaws to the target
      if (breathing()) {
        const [mx, my] = mouth(), k = smooth(BREATH0, BREATH0 + 0.08, t) * (1 - smooth(BREATH1 - 0.2, BREATH1, t)), aim = Math.atan2(-30 - my, TX - 4 - mx);
        for (let i = 0; i < 3; i++) {
          if (!R.chance(k)) continue;
          const a = aim + R.range(-0.08, 0.08), sp = R.range(500, 580);
          ps.spawn(P.FIRE, mx + 2, my + 1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.42, 0.58), 0, R.range(1.8, 3.6), 0, R.chance(0.2) ? PF.SMOKES : 0);
        }
        if (R.chance(0.5 * k)) {
          const a = aim + R.range(-0.2, 0.2), sp = R.range(200, 340);
          ps.spawn(P.SPARK, mx + 2, my + 1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.2, 0.4));
        }
      }
      if (once("hit1", HIT1)) {
        lights.add(TX, -30, 60, C[4], 1, 0.5);
        for (const [x, y] of [[-6, -14], [4, -26], [-2, -40], [8, -10], [0, -2]]) blazes.add(TX + x, y, left(1.6, 2.3), 1);
      }
      if (t > HIT1 && t < BREATH1 && R.chance(0.5)) ps.spawn(P.FIRE, TX + R.range(-14, 14), R.range(-48, -6), R.range(10, 60), -R.range(20, 60), R.range(0.3, 0.5), 0, R.range(1.6, 3));
      // burning away, tail first
      if (t > VANISH0 && t < VANISH1) {
        const g = seg(t, VANISH0, VANISH1), [sx, sy] = shift(1 - g);
        for (let i = 0; i < 3; i++) {
          const pt = SPINE[Math.max(0, Math.min(SPINE.length - 1, Math.floor((1 - g) * (SPINE.length - 1) + R.range(-0.5, 0.5))))];
          ps.spawn(R.chance(0.6) ? P.FIRE : P.EMBER, DX + pt[0] + sx + R.range(-8, 8), DY + pt[1] + sy + R.range(-8, 8), R.range(-10, 10), -R.range(20, 50), left(0.3, 0.6), C[5], R.range(1, 2.4), 0, PF.BACK);
        }
      }
      if (t > BREATH1 && t < VANISH0 && R.chance(0.15)) {
        const [mx, my] = mouth();
        ps.spawn(P.SMOKE, mx + 2, my, R.range(5, 15), -R.range(8, 18), left(0.8, 1.3), 0, R.range(1.5, 2.4));
      }
      blazes.update(dt);
      ps.update(dt);
      lights.update(dt);
    },

    drawBack(p) {
      sigil(p);
      drawDragon(p);
      ps.draw(p, "back");
    },

    draw(p) {
      drawHero(p);
      ps.draw(p, "front");
      if (breathing()) {
        // the hot core of the breath, and light along it
        const [mx, my] = mouth(), k = smooth(BREATH0, BREATH0 + 0.08, t) * (1 - smooth(BREATH1 - 0.2, BREATH1, t));
        const reach = Math.min(1, (t - BREATH0) / 0.32), ex = lerp(mx, TX - 4, reach), ey = lerp(my, -30, reach);
        p.glowLine(mx, my, ex, ey, 6, C[4], 0.35 * k);
        p.line(mx + 1, my + 1, ex, ey, (u) => (u < 0.5 ? WHITE : C[5]), (u) => k * (1 - u * 0.6));
        p.glow(mx, my, 10, C[5], 0.8 * k);
      }
      lights.draw(p);
    },
  };

  function drawHero(p) {
    const r = ease.outCubic(seg(t, FLASH, REVEAL)) * 40, white = t >= FLASH && t < FLASH + 0.07;
    if (t < REVEAL) {
      const pose = fighterPose(), wind = 1 + 2.5 * bump(t, SLAM - 0.1, FLASH + 0.2);
      fighter.draw(p, 0, 0, pose, {
        // hair streams: the further from the head, the more it moves
        warp: (x, y) => {
          const w = clamp((28 - x) / 12) * clamp((36 - y) / 10) + 0.25 * clamp((12 - y) / 6);
          return [w * wind * Math.sin(t * 5 - y * 0.32) * 1.2, 0];
        },
        color: (c, sx, sy, lx, ly) => (t >= FLASH && Math.abs(ly - BELTY) < r ? 0 : white ? WHITE : c),
      });
      // the belt forms from the buckle out
      if (t >= BELT0) {
        const u = ease.outCubic(seg(t, BELT0, BELT1)), half = SB.w / 2;
        for (let y = 0; y < SB.h; y++)
          for (let x = 0; x < SB.w; x++) {
            const c = SB.px[y * SB.w + x], d = Math.abs(x + 0.5 - half) / half;
            if (!c || d > u) continue;
            const lx = x - SB.ox, ly = BELTY - 1 + y + pose.dy;
            if (t >= FLASH && Math.abs(ly - BELTY) < r) continue;
            p.px(lx, ly, white ? WHITE : d > u - 0.15 && u < 1 ? C[5] : c);
          }
        p.glow(0, BELTY + 1, 8, C[4], 0.5 * bump(t, BELT0, BELT1 + 0.2) + 0.9 * bump(t, SLAM, SLAM + 0.4));
      }
      // mirror images of the armour close in from both sides
      if (t > SLAM && t < FLASH + 0.05) {
        const u = ease.inCubic(seg(t, SLAM + 0.02, FLASH));
        for (const [side, k] of [[-1, 1], [1, 1], [-1, 0.6], [1, 0.6]]) ghost(p, side * (1 - u) * (k === 1 ? 36 : 62), 0, 0.6 * k * (0.4 + 0.6 * u), k === 1 ? C[6] : C[4]);
      }
    }
    if (t >= FLASH) {
      const fresh = 1 - seg(t, REVEAL - 0.15, REVEAL + 0.1);
      armor.draw(p, 0, 0, armorPose(), {
        color: (c, sx, sy, lx, ly) => {
          const d = Math.abs(ly - BELTY);
          if (d >= r) return 0;
          if (d > r - 1.5 && r < 40) return WHITE;
          if (d > r - 3.5 && r < 40) return C[5];
          return fresh > 0 ? mix(c, WHITE, fresh * 0.4) : c;
        },
      });
      if (r < 40) for (const y of [BELTY - r, BELTY + r]) if (y > -66 && y < 0) p.glowLine(-16, y, 16, y, 3, C[5], 0.6);
      if (t > SNAP) for (const [x, y] of EYES) p.glow(x, y + armorPose().dy, 3, C[3], 0.4 + 0.3 * bump(t, SNAP, SNAP + 0.5));
    }
  }

  // a translucent copy of the armour, edges bright, offset dx
  function ghost(p, dx, dy, a, tint) {
    for (let y = 0; y < SA.h; y++)
      for (let x = 0; x < SA.w; x++) {
        if (!SA.px[y * SA.w + x]) continue;
        const edge = !SA.px[y * SA.w + x - 1] || !SA.px[y * SA.w + x + 1] || !SA.px[(y - 1) * SA.w + x] || !SA.px[(y + 1) * SA.w + x];
        const lx = x - SA.ox + dx, ly = y - SA.oy + dy;
        if (edge) {
          p.blend(lx, ly, tint, Math.min(1, a * 1.8));
          p.light(lx, ly, tint, a * 0.5);
        } else {
          p.blend(lx, ly, mix(SA.px[y * SA.w + x], tint, 0.85), a * 0.3);
          if ((x + y) % 3 === 0) p.light(lx, ly, tint, a * 0.15);
        }
      }
  }

  function sigil(p) {
    const k = smooth(SIGIL, SIGIL + 0.35, t) * (1 - smooth(EMERGE1, EMERGE1 + 0.5, t));
    if (k <= 0) return;
    const cx = DX + 58, cy = DY + 60, R0 = 50 * (0.6 + 0.4 * ease.outBack(seg(t, SIGIL, SIGIL + 0.4), 1.4)), spin = t * 1.4;
    const n = Math.ceil(R0 * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (i / n > k * 1.2) continue;
      for (const [r, c] of [[R0, C[5]], [R0 - 3, C[3]]]) p.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
    }
    // ticks round the rim, turning
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + spin;
      p.line(cx + Math.cos(a) * (R0 - 6), cy + Math.sin(a) * (R0 - 6), cx + Math.cos(a) * (R0 - 9), cy + Math.sin(a) * (R0 - 9), C[4], k);
    }
    p.glowRing(cx, cy, R0, 6, C[3], 0.45 * k);
    p.glow(cx, cy, R0 * 0.8, C[1], 0.12 * k);
  }

  function drawDragon(p) {
    if (t < EMERGE0 || t >= VANISH1) return;
    const rev = emerge() * 1.06, gone = seg(t, VANISH0, VANISH1), roarLit = bump(t, ROAR - 0.05, ROAR + 0.4);
    dragon.draw(p, DX, DY, {
      bend,
      shift,
      color: (c, s) => {
        if (s > rev || s > 1 - gone) return 0;
        // the edge coming through the ring, or burning away, is white-hot
        const e = Math.min(rev - s, 1 - gone - s);
        if (e < 0.01 && (rev < 1.06 || gone > 0)) return WHITE;
        if (e < 0.03 && (rev < 1.06 || gone > 0)) return C[5];
        return roarLit > 0 && s < 0.2 ? mix(c, C[5], roarLit * 0.35) : c;
      },
    });
    if (t > EMERGE1) {
      const [mx, my] = mouth();
      p.glow(mx - 8, my - 6, 16, C[3], 0.25 + 0.4 * roarLit);
    }
  }
}


