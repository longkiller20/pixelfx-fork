import { fit, mix, seg, wrap, hex } from "../../core/index.js";
import { Grid, shift, curve, shadow, lit, gait, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Duck",
  desc: "A white farm duck with an orange bill. Idle it preens, quacks and flaps once; walking (walk: 1) it waddles on flat orange feet.",
  tags: ["farm", "animal", "duck", "bird", "loop"],
  size: [64, 48],
  origin: [32, 42],
  duration: 2.8,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.duck, bill: ["#7a3a08", "#d8701a", "#f6a030", "#ffd070"], seed: 1 },
};

const D = meta.duration, G = new Grid(-16, -24, 32, 26);

function idle(t) {
  // preen (head turns back to the wing), quack, a wing flap
  const pre = curve(t, [[0, 0], [0.3, 0], [0.5, 1], [1.0, 1], [1.2, 0], [2.8, 0]]);
  const quack = (t > 1.5 && t < 1.62) || (t > 1.72 && t < 1.84);
  const flap = t > 2.1 && t < 2.45 ? Math.sin(seg(t, 2.1, 2.45) * Math.PI * 2) : 0;
  return { pre, quack, flap, rock: 0, bob: 0, near: 0, far: 0, blink: t > 2.6 && t < 2.68 };
}
function walking(t) {
  const g = gait(t / D, 4);
  return { pre: 0, quack: false, flap: 0, rock: g.near * 0.08, bob: g.bob * 0.6, near: g.near, far: g.far, blink: false };
}

function duck(C, B, Z) {
  const g = G;
  g.clear();
  const by = -Z.bob;
  // flat orange feet under short legs
  for (const [lx, sw, k] of [[-2, Z.far, 1], [1, Z.near, 2]]) {
    const fx = lx + sw * 2, fy = sw > 0.3 ? -0.8 : 0;
    g.line(lx, -3 + by, fx, fy - 1, B[k]);
    g.line(fx - 0.5, fy, fx + 2.5, fy, B[k]);
  }
  // body: a long boat shape with an upturned tail, rocking as it waddles
  const r = Z.rock;
  g.shade(-12, -14 + by, 8, -2 + by, (x, y) => {
    const u = x - 0, v = y - (-7 + by) - u * r;
    const inB = (u / 9) ** 2 + (v / 4.6) ** 2 <= 1 || (u < -6 && u > -11 && v < -1 && v > -5 + (u + 6) * 0.6);
    if (!inB) return 0;
    return lit(C, u / 9, v / 4.6, 3);
  });
  // the wing, lifting in a flap
  const wf = Z.flap;
  g.ellipse(-2, -8 + by - wf * 3, 5, 2.6 + Math.abs(wf) * 1.5, (nx, ny) => (ny > 0.5 ? C[2] : nx < -0.5 ? C[2] : C[3]));
  g.line(-6, -7 + by - wf * 3, -1, -6.5 + by - wf * 2, C[2]);
  // neck and head: up front, or dipped to preen its breast
  const hx = 5 - Z.pre * 2.5, hy = -14 + Z.pre * 5.5 + by;
  g.tube([[5, -9 + by], [hx, hy]], 2, (u, v) => (v > 0.7 ? C[2] : C[3]));
  g.ellipse(hx, hy, 3, 2.8, (nx, ny) => lit(C, nx, ny, 3));
  // bill: flat and orange, pointing ahead (or into the feathers), open when it quacks
  const dir = 1, bx = hx + 2.5 - Z.pre, open = Z.quack ? 1.2 : 0;
  g.poly([[bx, hy - 0.6], [bx + dir * 4, hy - 0.2], [bx + dir * 4, hy + 0.6], [bx, hy + 0.8]], (x, y) => (y < hy ? B[3] : B[2]));
  if (open) g.poly([[bx, hy + 1], [bx + dir * 3.5, hy + 1 + open], [bx, hy + 1.6]], B[1]);
  // eye
  const ex = hx + dir * 0.8;
  if (Z.blink) g.line(ex - 0.5, hy - 0.8, ex + 0.5, hy - 0.8, C[1]);
  else g.set(ex, hy - 0.8, C[0]);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
  return g;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = H(fit(o.palette, 5)), B = H(fit(o.bill, 4));
  const Z = o.walk ? walking(t) : idle(t);
  duck(C, B, Z).draw(p, 1, 0, 0);
  // a quack: two little sound marks by the bill
  if (Z.quack) for (const k of [0, 1]) p.line(11 + k * 2, -17 - k * 2, 12 + k * 2, -18 - k * 2, C[3]);
  // a feather drifting down after the flap
  const a = wrap(t - 2.3, D);
  if (!o.walk && a < 0.45) p.dot(-6 - a * 10, -12 + a * 20, C[4], 1 - a * 2);
}

export function drawBack(p, time, o) {
  shadow(p, 0, 0, 9, 1.4, H(fit(o.palette, 5))[0], 0.45);
}
