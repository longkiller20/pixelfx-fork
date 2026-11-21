import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";

export const meta = {
  name: "Heart beating",
  desc: "A plump pixel heart that beats twice a second (a quick double pulse, then rest), lit from the top left, a glint sliding over it, a soft pink glow.",
  tags: ["love", "heart", "beat", "icon", "ui", "loop"],
  size: [24, 24],
  origin: [12, 12],
  duration: 1.2,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { palette: ["#3a0414", "#8a1030", "#d8284a", "#ff5a78", "#ffb0c0", "#ffffff"], outline: "#1a0610" },
};

const G = new Grid(-12, -12, 24, 24);

export function draw(p, t, o) {
  const C = (o.palette ?? meta.options.palette).map(hex), K = hex(o.outline ?? meta.options.outline);
  const u = (t / meta.duration) % 1;
  // lub-dub: two quick swells and a rest
  const pulse = (c, w) => Math.max(0, 1 - Math.abs(u - c) / w);
  const k = 1 + 0.16 * pulse(0.08, 0.08) + 0.1 * pulse(0.26, 0.07);
  G.clear();
  // two round lobes and a point: a clear notch between the lobes at any size
  const R = 7.4 * k, cy = -1.5;
  G.shade(-12, -12, 11, 11, (x, y) => {
    const lobe = Math.min(Math.hypot(x + R * 0.48, y - cy + R * 0.1), Math.hypot(x - R * 0.48, y - cy + R * 0.1)) < R * 0.56;
    const yy = y - cy, tri = yy >= -R * 0.12 && Math.abs(x) <= (R * 1.0) * (1 - (yy + R * 0.12) / (R * 1.12));
    if (!lobe && !tri) return 0;
    // lit from the top left in hard steps, darker at the bottom right
    const d = Math.hypot((x + R * 0.45) / R, (y - cy + R * 0.35) / R);
    return d < 0.28 ? C[4] : d < 0.7 ? C[3] : d < 1.15 ? C[2] : C[1];
  });
  // the glint sliding across the upper left lobe
  const gx = Math.round(-R * 0.55 + Math.sin(u * TAU) * 0.6), gy = Math.round(cy - R * 0.4);
  G.set(gx, gy, C[5]);
  G.set(gx + 1, gy, C[4]);
  G.set(gx, gy + 1, C[4]);
  G.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, C[0], 0.5)));
  p.glow(0, 0, 10 * k, C[3], 0.12 + 0.18 * pulse(0.08, 0.12));
  G.draw(p, 1, 0, 0);
}
