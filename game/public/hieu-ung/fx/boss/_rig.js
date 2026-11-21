// The rig of a world boss (src/fx/boss/*.js). Like the players' (src/fx/nhanvat/_rig.js), a boss is one picture whose
// pixels are each marked with the part of the body they belong to, moved by a pose computed from what it is doing:
//   m  the weapon and the arm holding it: turned about the shoulder (raised back, brought down in a slam)
//   H  the head, horns and crown: thrown back in a roar, shaken
//   h  the long hair flying back, c the cape and fur at the back: sway and stream, more toward their ends
//   L R the legs: step, brace
//   u  the rest (chest, arms, belt, banner): breathes, leans into the blow
// Nothing is a canned frame. The pictures face right, feet in the middle of the bottom row at (0, 0).
import { hex } from "../../core/index.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const outQuart = (u) => 1 - Math.pow(1 - clamp01(u), 4);

/** Read a boss's data ({ w, h, fx, al, pal, px, lab, pivot: [x, y] the weapon's shoulder, legs: the row the legs start }). */
export function makeBoss(d) {
  const pal = d.pal.map(hex), AL = d.al;
  const parts = { m: [], H: [], h: [], c: [], L: [], R: [], u: [] };
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      const ch = d.px[y][x];
      if (ch === ".") continue;
      parts[d.lab[y][x]].push([x - d.fx, y - d.h, pal[AL.indexOf(ch)]]);
    }
  // the weapon as a lookup, for turning it without holes (each pixel of the turned weapon asks where it came from)
  const px = d.pivot[0] - d.fx, py = d.pivot[1] - d.h, m = new Map();
  let r = 0;
  for (const [x, y, c] of parts.m) {
    m.set(`${x},${y}`, c);
    r = Math.max(r, Math.hypot(x - px, y - py));
  }
  // the weapon's pixels that touch the rest of the body: laid under it where it rests, so a weapon rocking on the
  // shoulder never opens a crack between itself and what it lies against
  const solid = new Set();
  for (const k of ["H", "h", "c", "L", "R", "u"]) for (const [x, y] of parts[k]) solid.add(`${x},${y}`);
  const seam = parts.m.filter(([x, y]) => {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (solid.has(`${x + i},${y + j}`)) return true;
    return false;
  });
  // each leg pixel: does something else (not this leg) lie just behind it, to the left (1) or to the right (2)? A leg
  // stepping away from there is stretched back over that edge
  for (const k of ["L", "R"]) {
    const own = new Set(parts[k].map(([x, y]) => `${x},${y}`));
    const other = (x, y) => solid.has(`${x},${y}`) && !own.has(`${x},${y}`);
    for (const q of parts[k]) {
      const [x, y] = q;
      q.push((other(x - 1, y) || other(x - 2, y) || other(x - 3, y) ? 1 : 0) | (other(x + 1, y) || other(x + 2, y) || other(x + 3, y) ? 2 : 0));
    }
  }
  const xs = parts.u.map((q) => q[0]);
  const neck = Math.max(...parts.H.map((q) => q[1]));
  // where the hair and the cape join the body (their right edge, which stays put) and their free ends (the left)
  const reachOf = (q) => { const a = q.map((v) => v[0]); return [Math.min(...a), Math.max(...a)]; };
  return { ...parts, neck, seam, hairX: reachOf(parts.h), capeX: reachOf(parts.c), weapon: m, pivot: [px, py], reach: Math.ceil(r) + 1, legs: d.legs - d.h, top: -d.h, width: d.w, x0: Math.min(...xs), x1: Math.max(...xs) };
}

/** The slam's timeline (s): the weapon raised back, brought down at HIT, held, lifted back. */
export const SLAM = { windup: 0.55, hit: 0.66, hold: 0.95, end: 1.45 };
/** The roar (its counter-blow on everyone): head thrown back, the body shaking, at HIT the blast. */
export const ROAR = { hit: 0.9, end: 1.8 };

/**
 * The pose from the boss's state. st: { t, moving, slam: { age } | null, roar: { age } | null, dead: { age } | null }.
 * Returns how far each part moves (px) and the weapon's turn (radians, + is down in front).
 */
export function poseOf(st) {
  const t = st.t ?? 0;
  const P = { bob: 0, lean: 0, crouch: 0, turn: 0, headX: 0, headY: 0, shakeX: 0, sway: Math.sin(t * 1.6), trail: 0, LX: 0, LY: 0, RX: 0, RY: 0, sink: 0, t };
  // breathing: the chest heaves, the weapon rocks a little on the shoulder
  P.bob = Math.sin(t * 2.1) > 0.3 ? 1 : 0;
  P.turn = Math.sin(t * 1.05) * 0.03;
  if (st.moving) {
    // a heavy stride: one leg then the other, the body dropping on each footfall
    const ph = t * 5.2, s = Math.sin(ph);
    P.LX = Math.round(3 * s);
    P.RX = -P.LX;
    P.LY = s > 0.4 ? -2 : 0;
    P.RY = s < -0.4 ? -2 : 0;
    P.bob = Math.abs(s) > 0.8 ? 2 : 0;
    P.trail = -2;
    P.lean = 1;
  }
  const sl = st.slam;
  if (sl && sl.age < SLAM.end) {
    const a = sl.age;
    if (a < SLAM.windup) {
      // raised back over the head, leaning back onto the rear leg
      const k = ease(a / SLAM.windup);
      P.turn = -0.55 * k;
      P.lean = -3 * k;
      P.headY = -1 * k;
    } else if (a < SLAM.hit) {
      // down in front, all of him behind it
      const k = outQuart((a - SLAM.windup) / (SLAM.hit - SLAM.windup));
      P.turn = -0.55 + 2.65 * k;
      P.lean = -3 + 8 * k;
      P.crouch = Math.round(4 * k);
      P.LX = Math.round(3 * k);
    } else if (a < SLAM.hold) {
      // the weapon in the ground, a shudder
      P.turn = 2.1;
      P.lean = 5;
      P.crouch = 4;
      P.LX = 3;
      P.shakeX = Math.round(Math.sin(a * 90) * 1.2);
    } else {
      // heaved back up onto the shoulder
      const k = 1 - ease((a - SLAM.hold) / (SLAM.end - SLAM.hold));
      P.turn = 2.1 * k;
      P.lean = 5 * k;
      P.crouch = Math.round(4 * k);
      P.LX = Math.round(3 * k);
    }
  }
  const ro = st.roar;
  if (ro && ro.age < ROAR.end) {
    const a = ro.age, up = a < ROAR.hit ? ease(a / ROAR.hit) : 1 - ease((a - ROAR.hit) / (ROAR.end - ROAR.hit));
    // head thrown back, the weapon held high, then everything shakes as it lets go
    P.headY = -3 * up;
    P.headX = -2 * up;
    P.turn = -0.35 * up;
    P.lean = -2 * up;
    if (a > ROAR.hit - 0.15 && a < ROAR.hit + 0.6) P.shakeX = Math.round(Math.sin(a * 80) * 2);
    P.trail = -3 * up;
  }
  if (st.dead) {
    // brought down: the knees give, he sinks and leans forward onto the weapon
    const k = ease(Math.min(1, st.dead.age / 1.2));
    P.sink = Math.round(10 * k);
    P.lean = 6 * k;
    P.turn = 1.2 * k;
    P.headY = 2 * k;
  }
  return P;
}

/** Draw a boss in a pose at the painter's origin (its feet). tint: over every color (a hit's flash, dying). */
export function drawBoss(p, F, P, tint = (c) => c) {
  const put = (x, y, c) => p.px(x + P.shakeX, y, tint(c));
  const leanAt = (y) => Math.round(P.lean * clamp01((F.legs - y) / (F.legs - F.top)));
  const up = P.bob + P.crouch + P.sink;
  // the hair and cape behind: swaying, streaming back, more toward their free ends. Each pixel moves by its own amount,
  // so neighbours can part by a pixel: first every pixel is laid at both whole places around where it goes (that
  // closes the seams), then at its own place on top (that keeps the detail)
  const hairAt = (x, y) => {
    const k = clamp01((F.hairX[1] - x) / 60);
    return [x + leanAt(y) + k * (P.sway * 1.6 + P.trail), y + up + k * Math.sin(P.t * 3 + x * 0.2)];
  };
  const capeAt = (x, y) => {
    const k = clamp01((y - (F.legs - 60)) / 90) * clamp01((F.capeX[1] - x) / 75);
    return [x + leanAt(y) + k * (P.sway * 2.2 + P.trail * 1.5), y + up * (1 - k)];
  };
  for (const [part, at] of [[F.h, hairAt], [F.c, capeAt]]) {
    for (const [x, y, c] of part) {
      const [mx, my] = at(x, y), fx = Math.floor(mx), fy = Math.floor(my);
      put(fx, fy, c), put(fx + 1, fy, c), put(fx, fy + 1, c);
    }
    for (const [x, y, c] of part) {
      const [mx, my] = at(x, y);
      put(Math.round(mx), Math.round(my), c);
    }
  }
  // the legs: braced, stepping; the far one first. Where a stepping leg leaves something it lay against (the body at
  // the hip, the cape, the other leg), it is stretched back over the gap
  const legY = Math.round(P.sink * 0.5);
  for (const [part, dx, dy] of [[F.R, P.RX, P.RY], [F.L, P.LX, P.LY]]) {
    const back = dx > 0 ? 1 : dx < 0 ? 2 : 0;
    if (back)
      for (const [x, y, c, edge] of part)
        if (y <= F.legs + 14 || edge & back) for (let s = Math.min(0, dx); s <= Math.max(0, dx); s++) put(x + s, y + Math.min(0, dy) + legY, c);
    for (const [x, y, c] of part) put(x + dx, y + dy + legY, c);
  }
  // under the body: where the weapon rests (see makeBoss)
  // (near the shoulder always; out along the weapon only while it barely moves, or a ghost of it would show)
  const still = Math.abs(P.turn) < 0.12;
  for (const [x, y, c] of F.seam) if (still || Math.hypot(x - F.pivot[0], y - F.pivot[1]) < 30) put(x + leanAt(y), y + up, c);
  // the body, then the head
  for (const [x, y, c] of F.u) put(x + leanAt(y), y + up, c);
  // (the neck: the head's lowest rows also stay where they were, so a head thrown back leaves no gap)
  const hy = Math.round(P.headY), hx = Math.round(P.headX);
  if (hy || hx) for (const [x, y, c] of F.H) if (y > F.neck - 6) put(x + leanAt(y), y + up, c);
  for (const [x, y, c] of F.H) put(x + leanAt(y) + hx, y + up + hy, c);
  // the weapon arm, turned about the shoulder: every pixel of the turned arm looks up where it came from
  const [px, py] = F.pivot, ca = Math.cos(P.turn), sa = Math.sin(P.turn), R = F.reach;
  const ox = px + leanAt(py), oy = py + up;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const sx = Math.round(px + dx * ca + dy * sa), sy = Math.round(py - dx * sa + dy * ca);
      const c = F.weapon.get(`${sx},${sy}`);
      if (c !== undefined) put(ox + dx, oy + dy, c);
    }
}

/** Poses to preview a boss with (pixelfx's render tool, the admin): t in seconds. */
export const ANIMS = {
  idle: (t) => ({ t }),
  walk: (t) => ({ t, moving: true }),
  slam: (t) => ({ t, slam: { age: t % 2 } }),
  roar: (t) => ({ t, roar: { age: t % 2.4 } }),
  dead: (t) => ({ t, dead: { age: Math.min(t, 1.5) } }),
};
