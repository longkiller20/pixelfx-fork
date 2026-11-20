import { fit, mix, hex, rng, TAU, wrap } from "../../core/index.js";
import { Grid, glint, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Lingzhi",
  desc: "Linh Chi: glossy red-brown fan-shaped mushrooms growing off a mossy stump. stage 0 a nub, 1 young caps, 2 grown, 3 ripe: violet light pulses from the caps.",
  tags: ["farm", "plant", "mushroom", "lingzhi", "reishi", "crop", "loop"],
  size: [48, 48],
  origin: [24, 44],
  duration: 3,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: ["#1e0a08", "#4a1a10", "#7a2e18", "#a8482a", "#d07a3a", "#f4c070"], wood: RAMP.wood, aura: ["#3a1a6a", "#8a4ae0", "#d8a8ff", "#ffffff"], stage: 3, seed: 1 },
};

const D = meta.duration, G = new Grid(-24, -40, 48, 42);
// caps: x, y (where it grows from the stump), size at full, tilt
const CAPS = [[-5, -10, 8.5, -0.15], [6, -7, 7, 0.2], [0, -15, 6.5, 0], [8, -13, 4.6, 0.3]];
const SIZE = [0.25, 0.55, 0.85, 1];

export function draw(p, t, o) {
  const C = H(fit(o.palette, 6)), W = H(fit(o.wood, 5)), A = H(fit(o.aura, 4)), st = Math.max(0, Math.min(3, Math.round(o.stage))), k = SIZE[st];
  const g = G;
  g.clear();
  // the stump: a short log end with bark ridges and a cap of moss
  g.shade(-6, -9, 6, -0.5, (x, y) => {
    if (Math.abs(x) > 6) return 0;
    return x < -3.5 ? W[3] : Math.round(x) % 3 === 0 ? W[1] : x > 3 ? W[1] : W[2];
  });
  g.ellipse(0, -9, 6, 1.8, (nx, ny) => (nx * nx + ny * ny < 0.35 ? W[4] : W[3]));
  for (const x of [-5, -2, 3]) g.set(x, -10.2, hex("#52a83e"));
  // the caps: half discs with a pale growing rim, rings of darker gloss
  const n = st === 0 ? 1 : st === 1 ? 2 : CAPS.length;
  const tops = [];
  for (let i = 0; i < n; i++) {
    const [cx, cy, r0, tilt] = CAPS[i], r = r0 * k;
    g.shade(cx - r - 1, cy - r, cx + r + 1, cy + 1.5, (x, y) => {
      const dx = (x - cx) / r, dy = (y - cy) / (r * 0.62) + dx * tilt;
      const d = dx * dx + dy * dy;
      if (dy > 0.25 || d > 1) return 0;
      if (d > 0.72) return C[5];
      if (dy > 0.05) return C[1];
      return Math.abs(Math.sqrt(d) - 0.45) < 0.08 ? C[2] : dx < -0.1 && dy < -0.3 ? C[4] : C[3];
    });
    tops.push([cx, cy - r * 0.62]);
  }
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
  g.draw(p, 1, 0, 0);
  if (st === 3) {
    const pulse = 0.5 + 0.5 * Math.sin((t / D) * TAU);
    p.glow(0, -16, 16, A[1], 0.12 + 0.12 * pulse);
    for (let i = 0; i < 5; i++) {
      const r = rng(o.seed, i, 3), a = wrap(t / D + r.next(), 1), x = r.range(-9, 9), y = -12 - a * 22;
      p.dot(x + Math.sin(a * TAU + i) * 1.5, y, a < 0.6 ? A[2] : A[1], 1 - a);
    }
    glint(p, t, D, tops[0][0] - 1, tops[0][1], 0.9, A[3]);
  }
}
