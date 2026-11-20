import { fit, mix, seg, hex } from "../../core/index.js";
import { Grid, shift, curve, shadow, lit, gait, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Cow",
  desc: "A spotted dairy cow with short horns. Idle she grazes, chews, looks up and swishes her tail; walking (walk: 1) her four legs amble.",
  tags: ["farm", "animal", "cow", "cattle", "loop"],
  size: [96, 64],
  origin: [48, 58],
  duration: 3.6,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.cow, muzzle: ["#6a2a34", "#c86878", "#f4a0a8", "#ffd0d4"], seed: 1 },
};

const D = meta.duration, G = new Grid(-28, -34, 56, 36), HORN = ["#4a3a20", "#c8b080", "#f4ead0"].map(hex);
// the spots on her side, in body space
const SPOTS = [[-8, -21, 5, 3.6], [3, -19, 4, 3.2], [-14, -15, 3, 2.6], [8, -24, 2.6, 2]];

function idle(t) {
  // graze (head down to the grass), chew, lift the head and look, graze again
  const hd = curve(t, [[0, 1], [1.2, 1], [1.5, 0], [2.4, 0], [2.7, 1], [3.6, 1]]);
  const chew = hd > 0.5 ? Math.sin(t * 14) * 0.5 : 0;
  const tail = t > 1.6 && t < 2.3 ? Math.sin(seg(t, 1.6, 2.3) * Math.PI * 3) : Math.sin((t / D) * Math.PI * 2) * 0.2;
  return { hd, chew, tail, bob: 0, legs: [0, 0, 0, 0], blink: t > 2.0 && t < 2.08 };
}
function walking(t) {
  const g = gait(t / D, 3);
  return { hd: 0.15 + g.near * 0.05, chew: 0, tail: g.far * 0.4, bob: g.bob * 0.6, legs: [g.near, g.far, g.far, g.near], blink: false };
}

function cow(C, M, Z) {
  const g = G;
  g.clear();
  const by = -Z.bob;
  // legs: far pair darker, then the body, then the near pair; a dark hoof at the bottom
  const leg = (x, sw, near) => {
    const fx = x + sw * 2.5, lift = sw > 0.3 ? 1.5 : 0;
    g.shade(fx - 1.6, -12 + by, fx + 1.6, -1.5 - lift, (px) => (near ? (px < fx ? C[3] : C[2]) : C[2]));
    g.shade(fx - 1.6, -1.5 - lift, fx + 1.6, -0.5 - lift, () => C[0]);
  };
  leg(-14, Z.legs[1], 0); leg(10, Z.legs[3], 0);
  // the tail from the rump, a dark tuft at the end
  const tw = Z.tail * 3;
  g.line(-19, -22 + by, -21 + tw * 0.3, -14 + by, C[2]);
  g.line(-21 + tw * 0.3, -14 + by, -21 + tw, -7 + by, C[2]);
  g.ellipse(-21 + tw, -6 + by, 1.2, 1.8, C[1]);
  // body, the udder under it, the spots
  // (a white coat: its shadow side stays a soft grey, never black)
  g.ellipse(-2, -18 + by, 18, 8.5, (nx, ny) => {
    const c = lit(C, nx, ny, 3);
    return c === C[0] || c === C[1] ? C[2] : c;
  });
  g.ellipse(-6, -10 + by, 3.2, 2, (nx, ny) => (ny < 0 ? M[2] : M[1]));
  for (const [x, y, rx, ry] of SPOTS) g.ellipse(x, y + by, rx, ry, (nx, ny) => (nx < -0.3 && ny < -0.3 ? C[1] : C[0]));
  leg(-10, Z.legs[0], 1); leg(13, Z.legs[2], 1);
  // neck and head: down to the grass when grazing
  const hx = 19 + Z.hd * 3, hy = -21 + Z.hd * 14 + by;
  g.tube([[13, -21 + by], [hx - 2, hy]], 4, (u, v) => (v > 0.75 ? C[2] : C[3]));
  g.poly([[hx - 4, hy - 4], [hx + 3, hy - 4.5], [hx + 6, hy + 2], [hx + 4, hy + 5], [hx - 3, hy + 3]], (x, y) => (y < hy - 2 ? C[4] : x > hx + 2 ? C[3] : C[3]));
  // a spot over the eye, the pink muzzle chewing, the nostril
  g.ellipse(hx - 1.5, hy - 2.5, 2, 1.6, C[0]);
  const mj = Z.chew;
  g.ellipse(hx + 5, hy + 3.5 + mj * 0.5, 2.6, 2.2, (nx, ny) => (ny < -0.3 ? M[3] : nx > 0.4 ? M[1] : M[2]));
  g.set(hx + 6, hy + 2.8, M[0]);
  // horns and the ear
  g.line(hx - 2, hy - 4.5, hx - 3.5, hy - 7.5, HORN[1]); g.set(hx - 3.5, hy - 8, HORN[2]);
  g.poly([[hx - 4, hy - 3], [hx - 9, hy - 3.5 + Z.hd], [hx - 5, hy - 1]], (x, y) => (y < hy - 3 ? C[3] : C[2]));
  // the eye
  if (Z.blink) g.line(hx + 0.5, hy - 1, hx + 2, hy - 1, C[0]);
  else (g.set(hx + 1, hy - 1.5, C[0]), g.set(hx + 1, hy - 0.5, C[0]), g.set(hx + 1.8, hy - 1.5, C[4]));
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
  return g;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = H(fit(o.palette, 5)), M = H(fit(o.muzzle, 4));
  const Z = o.walk ? walking(t) : idle(t);
  cow(C, M, Z).draw(p, 1, 0, 0);
  // grass where she grazes: a few blades by her muzzle
  if (!o.walk && Z.hd > 0.4) {
    const GR = ["#2f7a32", "#52a83e", "#8ed05a"].map(hex);
    for (const [x, h, k] of [[22, 4, 0], [24, 5, 1], [26, 3, 2], [28, 4, 1], [25.5, 3, 0]]) p.line(x, -0.5, x + Math.sin(t * 3 + x) * 0.6, -0.5 - h, GR[k]);
  }
}

export function drawBack(p, time, o) {
  shadow(p, 0, 0, 20, 2, H(fit(o.palette, 5))[0], 0.45);
}
