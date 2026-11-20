import { fit, mix, seg, wrap } from "../../core/index.js";
import { Grid, shift, curve, shadow, lit, gait, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Pig",
  desc: "A round pink pig with floppy ears and a curly tail. Idle it sniffs, roots in the dirt and wiggles its tail; walking (walk: 1) its short legs trot.",
  tags: ["farm", "animal", "pig", "loop"],
  size: [72, 48],
  origin: [36, 42],
  duration: 3,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.pig, walk: 0, seed: 1 },
};

const D = meta.duration, G = new Grid(-20, -22, 40, 24);

function idle(t) {
  // head down to root at the dirt twice, a sniff (snout twitch) between
  const hd = curve(t, [[0, 0], [0.7, 0], [0.9, 1], [1.2, 1], [1.35, 0.6], [1.5, 1], [1.8, 1], [2.0, 0], [3, 0]]);
  const sniff = t > 2.2 && t < 2.6 ? Math.sin(seg(t, 2.2, 2.6) * Math.PI * 6) * 0.6 : 0;
  const ear = t > 0.2 && t < 0.45 ? Math.sin(seg(t, 0.2, 0.45) * Math.PI * 2) : 0;
  const tail = Math.sin((t / D) * Math.PI * 2 * 6) * (t > 2.4 ? 1 : 0.3);
  return { hd, sniff, ear, tail, bob: 0, legs: [0, 0, 0, 0], blink: t > 2.75 && t < 2.83 };
}
function walking(t) {
  const g = gait(t / D, 4);
  return { hd: 0.1, sniff: 0, ear: g.near * 0.4, tail: g.far, bob: g.bob, legs: [g.near, g.far, g.far, g.near], blink: false };
}

function pig(C, Z) {
  const g = G;
  g.clear();
  const by = -Z.bob * 0.8;
  // far legs (darker), then the body, then the near legs
  const leg = (x, sw, k) => {
    const fx = x + sw * 1.8, lift = sw > 0.3 ? 1 : 0;
    g.shade(fx - 1.5, -5 + by, fx + 1.5, -0.5 - lift, (px, py) => (k ? (px < fx ? C[2] : C[1]) : C[1]));
    g.set(fx - 1, -lift - 0.5, C[0]); g.set(fx + 0.5, -lift - 0.5, C[0]);
  };
  leg(-9.5, Z.legs[1], 0); leg(5.5, Z.legs[3], 0);
  // the curly tail at the back, wiggling
  const tw = Z.tail * 0.8;
  for (const [x0, y0, x1, y1] of [[-12, -11, -14, -13], [-14, -13, -16, -12], [-16, -12, -15.5, -10], [-15.5, -10, -14, -10.5]])
    g.line(x0, y0 + by + tw * 0.5, x1, y1 + by + tw, C[1]);
  // body: a barrel, lit on top
  g.ellipse(-1, -10 + by, 12, 7, (nx, ny) => lit(C, nx, ny, 2));
  // a few bristles of light along the back
  for (const x of [-6, -2, 2]) g.set(x, -16.5 + by, C[4]);
  leg(-7, Z.legs[0], 1); leg(7.5, Z.legs[2], 1);
  // head: lowered towards the ground when rooting
  const hx = 11 + Z.hd * 1.5, hy = -11 + Z.hd * 5 + by;
  g.ellipse(hx, hy, 5.2, 4.6, (nx, ny) => (nx < -0.72 ? C[1] : lit(C, nx, ny, 2)));
  // snout: a flat disc in front with a darker rim, two nostrils, twitching when it sniffs
  const sx = hx + 5 + Z.sniff * 0.6, sy = hy + 1 + Z.hd * 0.5;
  g.ellipse(sx, sy, 2.2, 2.6, (nx, ny) => (nx * nx + ny * ny > 0.55 ? C[1] : ny < -0.1 ? C[4] : C[3]));
  g.set(sx + 0.2, sy - 0.7, C[0]); g.set(sx + 0.2, sy + 0.9, C[0]);
  // eye: a dark bead with a glint, or shut
  if (Z.blink) g.line(hx + 1, hy - 0.8, hx + 2.6, hy - 0.8, C[0]);
  else (g.set(hx + 1.8, hy - 1.2, C[0]), g.set(hx + 1.8, hy - 0.2, C[0]), g.set(hx + 2.6, hy - 1.2, C[0]));
  // the ear: a big triangle flopping forward over the brow, darker underside, flicking up now and then
  const ef = Z.ear;
  const E = [[hx - 3, hy - 3], [hx - 0.5, hy - 6.5 - ef * 1.5], [hx + 3.8 + ef, hy - 3.2 - ef * 2.2]];
  g.poly(E, (x, y) => (y > hy - 3.6 - ef ? C[1] : y < hy - 5 ? C[4] : C[3]));
  g.line(E[0][0], E[0][1], E[2][0], E[2][1], C[1]);
  g.line(hx + 3, hy + 2.6, hx + 4.4, hy + 2.9, C[1]);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
  return g;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = H(fit(o.palette, 5));
  const Z = o.walk ? walking(t) : idle(t);
  pig(C, Z).draw(p, 1, 0, 0);
  // rooting throws up a little dirt
  if (!o.walk)
    for (const t0 of [0.95, 1.55]) {
      const a = wrap(t - t0, D);
      if (a < 0.35)
        for (const k of [0, 1, 2]) p.dot(18 + k * 1.5 + a * 14, -1 - a * 14 + a * a * 60 + k, hex2(k), 1 - a * 2.8);
    }
}
const DIRT = [0x2a1a10, 0x4a3018, 0x6a4828].map((c) => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255));
const hex2 = (k) => DIRT[k % 3];

export function drawBack(p, time, o) {
  shadow(p, 0, 0, 14, 1.6, H(fit(o.palette, 5))[0], 0.45);
}
