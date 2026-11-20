import { fit, mix, hex, rng, TAU, wrap } from "../../core/index.js";
import { Grid, sway, glint, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Spirit grass",
  desc: "Linh Thảo, a tuft of slender jade blades swaying in the breeze. stage 0 a sprout, 1 young, 2 grown, 3 ripe: its tips glow cyan and motes of qi drift up.",
  tags: ["farm", "plant", "herb", "grass", "crop", "loop"],
  size: [40, 48],
  origin: [20, 44],
  duration: 3,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.leaf, glow: ["#1a6a7a", "#3ac8d8", "#a8fff4", "#ffffff"], stage: 3, seed: 1 },
};

const D = meta.duration, G = new Grid(-20, -44, 40, 46);
// each blade: where it leaves the soil, how tall at full size, how much it leans, which ring of shade
const BLADES = [[-1, 26, -0.35, 2], [1, 30, 0.15, 3], [-3, 20, -0.7, 2], [3, 22, 0.6, 3], [0, 34, -0.05, 4], [-5, 14, -1, 1], [5, 16, 0.95, 2], [2, 25, 0.4, 3]];
const SIZE = [0.22, 0.5, 0.85, 1];

export function draw(p, t, o) {
  const C = H(fit(o.palette, 6)), L = H(fit(o.glow, 4)), st = Math.max(0, Math.min(3, Math.round(o.stage))), k = SIZE[st];
  const g = G;
  g.clear();
  const n = st === 0 ? 3 : st === 1 ? 5 : BLADES.length;
  const tips = [];
  for (let i = 0; i < n; i++) {
    const [x0, h0, lean, sh] = BLADES[i], h = h0 * k, ph = i * 1.7;
    // a blade: two px wide at the root, one at the tip, curving with its lean and the breeze
    let px = x0, py = 0;
    for (let s = 0; s <= h; s += 0.5) {
      const u = s / h, x = x0 + lean * 8 * u * u + sway(t, D, u, 1.6, ph), y = -s;
      const c = st === 3 && u > 0.82 ? L[1] : u > 0.7 ? C[Math.min(5, sh + 1)] : C[sh];
      g.set(x, y, c);
      if (u < 0.55) g.set(x + 1, y, C[Math.max(1, sh - 1)]);
      px = x; py = y;
    }
    tips.push([px, py]);
  }
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.6)));
  g.draw(p, 1, 0, 0);
  if (st === 3) {
    // glowing tips, a cool light round the tuft, motes of qi rising and fading
    for (const [x, y] of tips) (p.px(x, y, L[3]), p.glow(x, y, 3, L[1], 0.35));
    p.glow(0, -16, 18, L[1], 0.12);
    for (let i = 0; i < 6; i++) {
      const r = rng(o.seed, i, 7), a = wrap(t / D + r.next(), 1), x = r.range(-8, 8) + Math.sin(a * TAU * 2 + i) * 2, y = -8 - a * 30;
      p.dot(x, y, a < 0.7 ? L[2] : L[1], 1 - a);
      p.glow(x, y, 2, L[1], 0.25 * (1 - a));
    }
    glint(p, t, D, tips[4][0], tips[4][1] - 1, 1.1, L[3]);
  }
}
