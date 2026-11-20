import { fit, hex, mix, TAU, rng, wrap, P as PK } from "../../core/index.js";
import { Grid, H, RAMP, outline } from "./_lib.js";

export const meta = {
  name: "Alchemy furnace",
  desc: "A bronze three-legged cauldron furnace for refining pills: coals glow in its belly, flames lick round the lid and a thread of smoke curls from the top.",
  tags: ["home", "furnace", "alchemy", "cauldron", "fire", "smoke", "loop"],
  size: [56, 76],
  origin: [28, 68],
  duration: 3,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { palette: ["#1a1008", "#4a3014", "#7a5222", "#a87a34", "#d8a848", "#ffe08a"], seed: 1 },
};

const D = meta.duration, G = new Grid(-28, -64, 56, 66), FIRE = H(["#6a1408", "#c8380a", "#ff7a1a", "#ffc040", "#fff0a0"]), SM = H(["#3a3440", "#6a6470", "#9a94a0"]);

export function draw(p, t, o) {
  const C = H(fit(o.palette, 6)), g = G;
  g.clear();
  // three legs
  for (const [x, dx] of [[-11, -2], [9, 2], [-1, 0]]) g.line(x, -8, x + dx, 0, x === -1 ? C[2] : C[3]), g.line(x + 1, -8, x + 1 + dx, 0, C[1]);
  // the round belly with a band of cloud pattern and a glowing fire door
  g.ellipse(0, -18, 14, 11, (nx, ny) => {
    if (Math.abs(ny + 0.1) < 0.12) return C[4];
    const k = -nx * 0.55 - ny * 0.85;
    return k > 0.5 ? C[5] : k > 0.1 ? C[4] : k > -0.4 ? C[3] : C[2];
  });
  const fl = 0.75 + 0.25 * Math.sin((t / D) * TAU * 19) * Math.sin((t / D) * TAU * 5);
  g.ellipse(0, -14, 4, 3, (nx, ny) => (ny < -0.2 ? FIRE[4] : FIRE[3]));
  // the neck and the lid with its knob
  g.shade(-8, -32, 7, -28, (x) => (x < -6 ? C[4] : x > 5 ? C[2] : C[3]));
  g.ellipse(0, -34, 10, 3, (nx, ny) => (ny < -0.2 ? C[5] : C[3]));
  g.ellipse(0, -38, 2, 2, C[4]);
  // two handles like ears
  for (const s of [-1, 1]) g.line(s * 14, -26, s * 17, -30, C[3]), g.line(s * 17, -30, s * 15, -32, C[3]);
  outline(g, C);
  g.draw(p, 1, 0, 0);
  // flames licking round the lid, cycling
  for (let i = 0; i < 7; i++) {
    const r = rng(o.seed, i, 5), a = wrap(t / D * 3 + r.next(), 1), x = r.range(-8, 8), h = 3 + 5 * Math.sin(a * Math.PI);
    for (let k = 0; k < h; k++) p.dot(x + Math.sin(a * TAU + k * 0.5) * 0.8, -36 - k, FIRE[Math.min(4, 4 - Math.floor((k / h) * 4))], 1 - k / (h + 1));
  }
  p.glow(0, -14, 7, FIRE[3], 0.6 * fl);
  p.glow(0, -20, 26, FIRE[2], 0.16 * fl);
  // a thread of smoke curling up from the knob
  for (let i = 0; i < 6; i++) {
    const a = wrap(t / D + i / 6, 1), y = -40 - a * 22, x = Math.sin(a * TAU * 1.5 + 1) * (2 + a * 4);
    p.disc(x, y, 1.5 + a * 3, SM[a < 0.4 ? 2 : 1], 0.35 * (1 - a));
  }
}
