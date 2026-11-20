import { hex, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Fishing float",
  desc: "A red and white float on the water, drawn at the waterline: bobbing, nibbled (quick dips), pulled under by a bite (splash, rings), or thrashing with a fish on.",
  tags: ["fishing", "float", "bobber", "water", "ripple", "loop"],
  size: [48, 32],
  origin: [24, 16],
  duration: 1.2,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { state: 0, tier: 1, water: "#9ad8ff" },
};

const H = (a) => a.map(hex);
const RED = H(["#4a0a10", "#8a1a24", "#d83a3a", "#ff7a6a", "#ffd0c0"]);
const WH = H(["#5a6070", "#a8b0c0", "#e8ecf4", "#ffffff", "#ffffff"]);
const GOLD = H(["#5a3404", "#a86e10", "#e8b028", "#ffe070", "#fff8d0"]);
const JADE = H(["#0a2a1e", "#1a5a3e", "#2a9a62", "#6ad89a", "#c8ffe0"]);
const G = new Grid(-6, -14, 12, 20);

/** state: 0 floating, 1 a nibble, 2 under (a bite), 3 a fish on the line. tier: the rod's (better floats). */
export function draw(p, t, o) {
  const D = meta.duration, u = (t % D) / D, st = o.state | 0, W = hex(o.water ?? meta.options.water);
  // how deep it sits: bobbing, quick dips, pulled under, jerking about
  let dy = Math.sin(u * TAU) * 0.8, dx = 0;
  if (st === 1) dy = u < 0.35 ? Math.sin((u / 0.35) * Math.PI) * 4 : Math.sin(u * TAU) * 0.6;
  if (st === 2) dy = 9 + Math.sin(u * TAU * 3) * 1.5;
  if (st === 3) (dy = 5 + Math.sin(u * TAU * 4) * 3), (dx = Math.sin(u * TAU * 3) * 3);
  // the float: a top cap, a body, a little stick; a jade or gold one on better rods
  const C = o.tier >= 4 ? GOLD : o.tier >= 3 ? JADE : RED;
  const g = G.clear();
  g.line(0, -12, 0, -8, C[3]);
  g.ellipse(0, -5, 3.2, 3.6, (nx, ny) => (ny < 0 ? lit(C, nx, ny, 2) : lit(WH, nx, ny, 2)));
  g.line(0, -1.5, 0, 3, WH[1]);
  g.outline(hex("#140c18"));
  // the part under water is seen dimly
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!g.c[i]) continue;
      if (g.y0 + y + dy > 0) g.a[i] = 0.35;
    }
  if (st !== 2) g.draw(p, 1, dx, dy);
  // rings on the water: gentle, quick at a nibble, wide splashes at a bite or a fight
  const ring = (r, a) => {
    for (let k = -r; k <= r; k++) {
      const yy = Math.round(Math.sqrt(Math.max(0, 1 - (k / r) ** 2)) * r * 0.22);
      p.dot(dx + k, 1 + yy, W, a * (Math.abs(k) > r * 0.6 ? 1 : 0.5));
      p.dot(dx + k, 1 - yy, W, a * 0.6);
    }
  };
  const n = st === 0 ? 1 : st === 1 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const v = (u * (st === 0 ? 1 : 2) + i / n) % 1;
    ring(4 + v * (st >= 2 ? 18 : 10), (1 - v) * (st === 0 ? 0.5 : 0.8));
  }
  if (st >= 2) {
    // spray: droplets thrown up and falling back
    for (let k = 0; k < 8; k++) {
      const v = (u * 2 + k / 8) % 1, sx = Math.cos(k * 2.3) * (4 + v * 9) + dx, sy = -Math.sin(Math.PI * v) * (6 + (k % 3) * 3);
      p.dot(sx, sy, W, 1 - v);
    }
    p.glow(dx, 0, 10, W, 0.25);
  }
}
