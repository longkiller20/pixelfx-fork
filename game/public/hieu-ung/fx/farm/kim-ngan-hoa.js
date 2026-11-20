import { fit, mix, hex, TAU } from "../../core/index.js";
import { Grid, sway, glint, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Honeysuckle",
  desc: "Kim Ngân Hoa: a climbing herb with paired leaves and trumpet flowers. stage 0 a sprout, 1 leafy, 2 white buds, 3 ripe: open flowers turned gold, a warm glow.",
  tags: ["farm", "plant", "herb", "flower", "honeysuckle", "crop", "loop"],
  size: [40, 52],
  origin: [20, 48],
  duration: 3.4,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.leaf, white: ["#8a8070", "#d8d0c0", "#fffaf0"], gold: ["#8a5a0a", "#e0a020", "#ffd860", "#fff6c0"], stage: 3, seed: 1 },
};

const D = meta.duration, G = new Grid(-20, -48, 40, 50);
const SIZE = [0.28, 0.6, 0.9, 1];
// along the vine (0 root .. 1 tip): where a pair of leaves sits, and where a flower hangs
const LEAVES = [0.2, 0.38, 0.55, 0.7, 0.85];
const FLOWERS = [[0.48, -1], [0.64, 1], [0.8, -1], [0.95, 1]];

export function draw(p, t, o) {
  const C = H(fit(o.palette, 6)), Wh = H(fit(o.white, 3)), Au = H(fit(o.gold, 4)), st = Math.max(0, Math.min(3, Math.round(o.stage))), k = SIZE[st];
  const g = G;
  g.clear();
  const h = 40 * k;
  // the vine winds up a little stake
  if (st > 0) g.line(0.5, 0, 0.5, -h - 2, hex("#7a4a22"));
  const at = (u) => [Math.sin(u * TAU * 1.3) * 3 * Math.min(1, u * 3) + sway(t, D, u, 1.3), -u * h];
  for (let u = 0; u <= 1; u += 0.01) {
    const [x, y] = at(u);
    g.set(x, y, C[2]);
  }
  // paired leaves: little pointed ovals either side
  for (const u of LEAVES.slice(0, st === 0 ? 1 : st === 1 ? 3 : 5)) {
    const [x, y] = at(u);
    for (const s of [-1, 1]) g.ellipse(x + s * 3, y + 0.5, 2.6, 1.3, (nx, ny) => (ny < -0.2 ? C[4] : ny > 0.4 ? C[2] : C[3]));
  }
  // buds (white, closed) or flowers (trumpets opening gold)
  const blooms = [];
  if (st >= 2)
    for (const [u, s] of FLOWERS) {
      const [x, y] = at(u), fx = x + s * 3.5, fy = y - 1;
      if (st === 2) g.line(x, y, fx, fy - 2, Wh[1]), g.set(fx, fy - 3, Wh[2]);
      else {
        g.line(x, y, fx, fy, C[3]);
        g.poly([[fx, fy], [fx + s * 5, fy - 3], [fx + s * 5.5, fy + 1]], (px, py) => (py < fy - 1 ? Au[3] : Au[2]));
        g.set(fx + s * 5, fy - 3.5, Au[3]); g.set(fx + s * 6, fy + 1.5, Au[1]);
        blooms.push([fx + s * 5, fy - 1]);
      }
    }
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.6)));
  g.draw(p, 1, 0, 0);
  if (st === 3) {
    for (const [x, y] of blooms) p.glow(x, y, 4, Au[2], 0.3);
    p.glow(0, -h * 0.7, 14, Au[2], 0.1);
    glint(p, t, D, blooms[3][0], blooms[3][1] - 2, 1.7, Au[3]);
    glint(p, t, D, blooms[0][0], blooms[0][1] - 1, 0.4, Au[3], 0.3);
  }
}
