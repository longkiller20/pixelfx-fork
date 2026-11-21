import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Rose",
  desc: "A single red rose as a gift icon: layered petals curling round a dark heart, a thorned stem with two leaves, swaying, a dewdrop that glints.",
  tags: ["love", "rose", "flower", "gift", "icon", "item", "loop"],
  size: [32, 32],
  origin: [16, 16],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { petals: ["#3a0610", "#7a1020", "#c01e34", "#ee4a5a", "#ffa8a8"], outline: "#140810" },
};

const H = (a) => a.map(hex);
const LEAF = H(["#0a2412", "#1a4a22", "#2e7a32", "#5aae4a", "#a8e080"]);
const STEM = H(["#0e2a12", "#1e5a24", "#3a8a34"]);
const G = new Grid(-16, -16, 32, 32);

export function draw(p, t, o) {
  const P = H(o.petals ?? meta.options.petals), u = t / meta.duration, sway = Math.sin(u * TAU) * 0.8;
  const g = G;
  g.clear();
  // the stem, bending a little with the sway, two thorns, two leaves
  const top = [sway, -3], bot = [-2, 14];
  g.tube([bot, [-1 + sway * 0.4, 6], top], 1, (q, v) => (v > 0.5 ? STEM[0] : q < 0.5 ? STEM[1] : STEM[2]));
  g.set(-2.5 + sway * 0.2, 9, STEM[0]), g.set(0.5 + sway * 0.4, 4, STEM[0]);
  g.ellipse(-5 + sway * 0.3, 8, 4, 2, (nx, ny) => (Math.abs(ny + nx * 0.4) < 0.15 ? LEAF[1] : lit(LEAF, nx, ny, 2)));
  g.ellipse(3.5 + sway * 0.5, 3.5, 3.6, 1.8, (nx, ny) => (Math.abs(ny - nx * 0.4) < 0.15 ? LEAF[1] : lit(LEAF, nx, ny, 2)));
  // the sepals under the bloom
  g.poly([[-4 + sway, -3], [sway, -1], [4 + sway, -3], [sway, -5]], LEAF[2]);
  // the bloom: an outer cup, two curled petals in front, a spiral of darker petals at the heart
  const cx = sway, cy = -8;
  g.ellipse(cx, cy, 7, 6, (nx, ny) => lit(P, nx, ny, 2));
  g.ellipse(cx - 3.5, cy + 2, 3.6, 3.4, (nx, ny) => lit(P, nx, ny, 2));
  g.ellipse(cx + 3.5, cy + 2, 3.6, 3.4, (nx, ny) => lit(P, nx, ny, 1));
  g.ellipse(cx, cy + 3, 3.4, 2.4, (nx, ny) => lit(P, nx, ny, 3));
  // the dark folds between the outer petals and the cup
  g.line(cx - 1, cy + 1, cx - 1, cy + 4, P[0]);
  g.line(cx + 1, cy + 1, cx + 1, cy + 4, P[1]);
  g.ellipse(cx, cy - 1.5, 4, 3, (nx, ny) => (ny < -0.2 ? P[3] : P[2]));
  // the spiral at the heart
  for (let i = 0; i < 9; i++) {
    const a = i * 0.9 + 0.6, r = 0.6 + i * 0.33;
    g.set(cx + Math.cos(a) * r, cy - 1.5 + Math.sin(a) * r * 0.75, i % 3 ? P[0] : P[1]);
  }
  // the rims of the outer petals catch the light
  for (const [x, y] of [[-5, -12], [-3, -13], [3, -13], [5, -12], [-6, -9]]) g.set(cx + x, y, P[4]);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? hex(o.outline ?? meta.options.outline) : mix(hex(o.outline ?? meta.options.outline), hex("#3a1a2a"), 0.4)));
  g.draw(p, 1, 0, 0);
  // a dewdrop on a petal: glints once a cycle
  const glint = Math.max(0, Math.sin((u - 0.15) * TAU * 1));
  p.px(cx + 4, cy - 3, hex("#ffe8f0"));
  if (glint > 0.85) {
    const k = (glint - 0.85) / 0.15;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.dot(cx + 4 + dx, cy - 3 + dy, hex("#ffffff"), k);
  }
  p.glow(cx, cy, 10, P[3], 0.08 + 0.04 * Math.sin(u * TAU));
}
