import { fit, mix, hex, TAU } from "../../core/index.js";
import { Grid, sway, glint, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Ginseng",
  desc: "Nhân Sâm: slender stalks each holding a hand of five toothed leaflets. stage 0 a sprout, 1 young, 2 grown, 3 ripe: a cluster of glossy red berries on a centre stem.",
  tags: ["farm", "plant", "herb", "ginseng", "crop", "loop"],
  size: [48, 48],
  origin: [24, 44],
  duration: 3.2,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: RAMP.leaf, berry: ["#4a0a14", "#a8182a", "#e8384a", "#ff9a90"], stage: 3, seed: 1 },
};

const D = meta.duration, G = new Grid(-24, -44, 48, 46);
// stalks: lean of the stalk, height at full size, phase of its sway
const STALKS = [[-0.55, 22, 0], [0.5, 24, 1.3], [-0.1, 28, 2.4]];
const SIZE = [0.3, 0.55, 0.85, 1];

function hand(g, C, x, y, s, a0) {
  // five leaflets fanned from the tip of a stalk, each a pointed oval with a lit upper half and a vein
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i - 2) * 0.55, L = (i === 2 ? 7 : i === 1 || i === 3 ? 6 : 4.5) * s;
    for (let r = 0; r <= L; r += 0.5) {
      const w = Math.sin((r / L) * Math.PI) * 1.8 * s, cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      for (let q = -w; q <= w; q += 0.5) {
        const px = cx - Math.sin(a) * q, py = cy + Math.cos(a) * q;
        g.set(px, py, q < -w * 0.3 ? C[4] : q > w * 0.5 ? C[2] : C[3]);
      }
      if (r > 1 && r < L - 1) g.set(cx, cy, C[2]);
    }
  }
}

export function draw(p, t, o) {
  const C = H(fit(o.palette, 6)), B = H(fit(o.berry, 4)), st = Math.max(0, Math.min(3, Math.round(o.stage))), k = SIZE[st];
  const g = G;
  g.clear();
  const n = st === 0 ? 1 : st === 1 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const [lean, h0, ph] = STALKS[st === 0 ? 2 : i], h = h0 * k;
    let x = 0, y = 0;
    for (let s = 0; s <= h; s += 0.5) {
      const u = s / h;
      x = lean * 10 * u * u + sway(t, D, u, 1.4, ph);
      y = -s;
      g.set(x, y, u > 0.6 ? C[3] : C[2]);
    }
    hand(g, C, x, y, st === 0 ? 0.5 : 0.75 + 0.25 * k, -Math.PI / 2 + lean * 1.2);
  }
  // the ripe berry cluster on its own short stem in the middle
  const berries = [];
  if (st === 3) {
    const bx = sway(t, D, 0.7, 1, 0.5), by = -17;
    g.line(0, 0, bx, by + 2, C[2]);
    for (const [dx, dy] of [[0, 0], [-2, 1], [2, 1], [-1, 2.6], [1, 2.6], [0, -1.6], [-2.4, -1], [2.4, -1]]) {
      const x = bx + dx, y = by + dy;
      g.ellipse(x, y, 1.3, 1.3, (nx, ny) => (nx < -0.2 && ny < -0.2 ? B[3] : ny > 0.4 ? B[1] : B[2]));
      berries.push([x, y]);
    }
  }
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.6)));
  g.draw(p, 1, 0, 0);
  if (st === 3) {
    for (const [x, y] of berries.slice(0, 5)) p.px(x - 0.5, y - 0.5, B[3]);
    p.glow(berries[0][0], berries[0][1], 9, B[2], 0.18);
    glint(p, t, D, berries[5][0] + 1, berries[5][1] - 2, 1.4, hex("#ffffff"));
  }
}
