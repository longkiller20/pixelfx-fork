import { fit, hex, mix, TAU, rng, wrap } from "../../core/index.js";
import { Grid, H, RAMP, outline } from "./_lib.js";

export const meta = {
  name: "Paper lantern",
  desc: "A red paper lantern hung from a bracket, swaying a little, its candle flickering: warm light pools round it and a gold tassel swings under it.",
  tags: ["home", "lantern", "light", "fire", "loop"],
  size: [48, 56],
  origin: [24, 52],
  duration: 3,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { palette: RAMP.red, seed: 1 },
};

const D = meta.duration, G = new Grid(-24, -52, 48, 54), W = H(RAMP.wood), Au = H(RAMP.gold), FL = H(["#ffb040", "#ffe08a", "#ffffff"]);

export function draw(p, t, o) {
  const C = H(fit(o.palette, 5)), sw = Math.sin((t / D) * TAU + 0.6) * 1.4, fl = 0.8 + 0.2 * Math.sin((t / D) * TAU * 9) * Math.sin((t / D) * TAU * 4);
  const g = G;
  g.clear();
  // the bracket on the wall and the cord
  g.shade(-12, -46, -10, -40, () => W[2]);
  g.line(-12, -46, 2, -46, W[3]);
  g.line(0, -45, sw * 0.4, -38, K0);
  // the lantern: a round paper body with ribs, dark caps top and bottom
  const cx = sw, cy = -28;
  g.ellipse(cx, cy, 8, 9, (nx, ny) => {
    if (Math.abs(ny) > 0.82) return W[1];
    const rib = Math.abs(Math.sin(Math.asin(Math.max(-1, Math.min(1, nx))) * 3)) < 0.18;
    return rib ? C[1] : nx < -0.35 ? C[4] : nx > 0.5 ? C[2] : C[3];
  });
  g.shade(cx - 4, cy - 11, cx + 3, cy - 8, () => Au[1]);
  g.shade(cx - 4, cy + 8, cx + 3, cy + 10, () => Au[1]);
  // the tassel, lagging the swing
  g.line(cx, cy + 11, cx - sw * 0.6, cy + 19, Au[2]);
  g.line(cx + 1, cy + 12, cx + 1 - sw * 0.6, cy + 19, Au[1]);
  outline(g, C);
  g.draw(p, 1, 0, 0);
  // the light: a warm glow through the paper, flickering, and a pool on the wall
  p.glow(cx, cy, 6, FL[1], 0.55 * fl);
  p.glow(cx, cy, 22, FL[0], 0.22 * fl);
  p.px(cx, cy + 1, FL[2]);
}
const K0 = hex("#141018");
