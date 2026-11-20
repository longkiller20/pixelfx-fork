import { fit, mix, lerp, seg, ease, wrap } from "../../core/index.js";
import { Grid, shift, curve, shadow, lit, gait, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Hen",
  desc: "A plump white hen with a red comb. Idle she looks about, pecks the ground twice, shakes her tail and blinks; walking (walk: 1) her legs step and her head nods with each stride.",
  tags: ["farm", "animal", "chicken", "hen", "bird", "loop"],
  size: [64, 48],
  origin: [32, 42],
  duration: 2.4,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.hen, comb: RAMP.comb, beak: RAMP.beak, walk: 0, seed: 1 },
};

const D = meta.duration, G = new Grid(-16, -24, 32, 26);

// idle: the head's place over time (x, y of the head's centre), pecking twice, a look back, the tail shake
function idle(t) {
  const hx = curve(t, [[0, 5], [0.5, 5], [0.62, 8], [0.72, 6], [0.84, 8], [0.95, 5], [1.6, 5], [1.75, 4], [2.1, 4], [2.3, 5]]);
  const hy = curve(t, [[0, -13], [0.5, -13], [0.62, -4.5], [0.72, -9], [0.84, -4.5], [0.95, -13], [2.4, -13]]);
  const tail = t > 1.25 && t < 1.55 ? Math.sin(seg(t, 1.25, 1.55) * Math.PI * 4) * 1.2 : 0;
  return { hx, hy, tail, bob: 0, near: 0, far: 0, blink: t > 1.95 && t < 2.03, peck: hy > -7 };
}
function walking(t) {
  const g = gait(t / D, 3);
  return { hx: 5 + g.near * 0.8, hy: -13 + g.bob * 0.8, tail: g.far * 0.4, bob: g.bob, near: g.near, far: g.far, blink: t > 1.1 && t < 1.17, peck: false };
}

function hen(C, R, B, Z) {
  const g = G;
  g.clear();
  const by = -Z.bob; // the body rises a little between steps
  // legs: thigh hidden in the feathers, a thin yellow shank, three toes
  for (const [lx, sw, k] of [[-2.5, Z.far, 0.7], [0.5, Z.near, 1]]) {
    const fx = lx + sw * 2.4, fy = sw > 0.2 ? -0.8 : 0, col = k < 1 ? B[1] : B[2];
    g.line(lx, -4 + by, fx, fy - 1, col);
    g.line(fx - 1, fy, fx + 2, fy, col);
    g.set(fx + 2, fy - 0.2, B[1]);
  }
  // tail: a fan of feathers up at the back
  const tt = Z.tail;
  g.poly([[-5, -5.5 + by], [-10.5, -11 + by + tt * 0.5], [-12, -16.5 + by + tt], [-10, -18 + by + tt], [-8, -15 + by + tt * 0.6], [-6.5, -16 + by + tt * 0.5], [-5.5, -13 + by], [-2, -10 + by]],
    (x, y) => (y < -15.5 + by ? C[4] : x < -10 ? C[2] : y > -9 + by ? C[2] : C[3]));
  // a couple of feather lines in the fan
  g.line(-9, -14 + by + tt * 0.7, -6.5, -10 + by, C[2]);
  // body: a rounded egg, lit on top, its belly in shade
  g.ellipse(-1, -7.5 + by, 7, 5, (nx, ny) => lit(C, nx, ny, 3));
  // the wing folded on the side, a few darker feather lines
  g.ellipse(-2, -8 + by, 4.6, 3, (nx, ny) => (ny > 0.55 ? C[2] : nx < -0.5 ? C[2] : C[3]));
  for (const [x, y] of [[-4, -7], [-2, -6.5], [0, -7]]) g.set(x, y + by, C[2]);
  // neck to the head, the head itself
  const hx = Z.hx, hy = Z.hy + by;
  g.tube([[3, -10 + by], [(3 + hx) / 2, (hy - 10 + by) / 2], [hx, hy]], 2.2, (u, v) => (v > 0.7 ? C[2] : C[3]));
  g.ellipse(hx, hy, 2.8, 2.6, (nx, ny) => lit(C, nx, ny, 3));
  // comb on top (three bumps), wattle under the beak
  const tilt = Z.peck ? 1.2 : 0;
  for (const [x, y] of [[-1.5, -3], [0, -3.6], [1.4, -3]]) g.ellipse(hx + x + tilt, hy + y, 1.1, 1.1, (nx, ny) => (ny < -0.3 ? R[3] : R[2]));
  g.ellipse(hx + 2.4, hy + 2.6, 0.9, 1.3, (nx, ny) => (nx < 0 ? R[2] : R[1]));
  // beak
  g.poly([[hx + 2.2, hy - 0.8], [hx + 5.2 - tilt * 0.5, hy + 0.3 + tilt], [hx + 2.2, hy + 1]], (x, y) => (y < hy + 0.2 ? B[3] : B[2]));
  // eye
  if (Z.blink) g.line(hx + 0.3, hy - 0.5, hx + 1.3, hy - 0.5, C[1]);
  else (g.set(hx + 1, hy - 1, C[0]), g.set(hx + 1, hy - 0.2, C[0]));
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
  return g;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = H(fit(o.palette, 5)), R = H(fit(o.comb, 4)), B = H(fit(o.beak, 4));
  const Z = o.walk ? walking(t) : idle(t);
  hen(C, R, B, Z).draw(p, 1, 0, 0);
  // a peck kicks up a grain or two of dust
  if (!o.walk)
    for (const t0 of [0.62, 0.84]) {
      const a = wrap(t - t0, D);
      if (a < 0.25) for (const k of [-1, 1]) p.dot(8.5 + k * (1 + a * 10), -0.5 - a * 6 + a * a * 30, C[2], 1 - a * 4);
    }
}

export function drawBack(p, time, o) {
  shadow(p, 0, 0, 8, 1.4, H(fit(o.palette, 5))[0], 0.45);
}
