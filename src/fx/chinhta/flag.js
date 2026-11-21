import { hex, mix, TAU } from "../../core/index.js";
import { Grid, shift } from "../critters/_lib.js";

export const meta = {
  name: "War banner",
  desc: "A tall war banner on its pole, the cloth hanging from a crossbar, rippling, a swallowtail end. Side c: azure and gold with a sun; side t: crimson and violet with a crescent.",
  tags: ["chinhta", "banner", "flag", "war", "camp", "prop", "loop"],
  size: [48, 104],
  origin: [12, 100],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { side: "c" },
};

const H = (a) => a.map(hex);
const LOOK = {
  c: { cloth: H(["#0a1e4a", "#16357a", "#2456b0", "#3a7ae0", "#6aa6ff"]), trim: H(["#6a3a04", "#c8861a", "#f6c440", "#ffe88a"]), mark: H(["#c8861a", "#f6c440", "#fff0a0"]), tip: H(["#6a3a04", "#c8861a", "#f6c440", "#fff6c0"]) },
  t: { cloth: H(["#1a0206", "#3e0610", "#6a0c1c", "#9a1828", "#c8303a"]), trim: H(["#1a0626", "#3a0e5a", "#6a2a9a", "#a85ad8"]), mark: H(["#5a1a8a", "#a85ad8", "#e8b0ff"]), tip: H(["#2a2a2a", "#6a6a6a", "#b0b0b0", "#e8e8e8"]) },
};
const WOOD = H(["#1e1008", "#3a2010", "#5a3418", "#7a4a22"]);
const K = hex("#0a0406");
const G = new Grid(-12, -100, 48, 104);

export function draw(p, t, o) {
  const L = LOOK[o.side === "t" ? "t" : "c"], D = meta.duration, u0 = shift(t, D, o.seed ?? 1) / D;
  G.clear();
  // the pole and its crossbar
  for (let y = -88; y <= 0; y++) for (let x = -1; x <= 1; x++) G.set(x, y, x < 0 ? WOOD[3] : x > 0 ? WOOD[1] : WOOD[2]);
  for (let x = -2; x <= 2; x++) G.set(x, 0, WOOD[1]), G.set(x, -1, WOOD[2]);
  for (let x = -3; x <= 26; x++) G.set(x, -84, x < 0 ? WOOD[2] : WOOD[3]), G.set(x, -83, WOOD[1]);
  G.set(27, -84, L.trim[2]), G.set(27, -83, L.trim[1]), G.set(-4, -84, L.trim[2]), G.set(-4, -83, L.trim[1]);
  // the tip: a gold spearhead (Chính), a bone-white horn (Tà)
  if (o.side === "t") {
    for (let i = 0; i < 9; i++) G.set(-1 + Math.round(Math.sin(i / 3) * 1.5), -89 - i, L.tip[i < 3 ? 1 : i < 7 ? 2 : 3]), G.set(Math.round(Math.sin(i / 3) * 1.5), -89 - i, i < 7 ? L.tip[2] : 0);
  } else {
    for (let i = 0; i < 10; i++) {
      const w = i < 2 ? 1 : Math.max(0, Math.round((10 - i) / 3));
      for (let x = -w; x <= w; x++) G.set(x, -89 - i, x < 0 ? L.tip[3] : x > 0 ? L.tip[1] : L.tip[2]);
    }
    for (let x = -3; x <= 3; x++) G.set(x, -89, L.tip[1]);
  }
  // the cloth: 24 wide, 52 long under the crossbar, rippling more toward its end; a swallowtail cut
  const W = 24, LEN = 52, top = -82;
  for (let v = 0; v <= 1; v += 0.25 / LEN)
    for (let uu = 0; uu <= 1; uu += 0.25 / W) {
      const end = 1 - 0.16 * (1 - Math.abs(2 * uu - 1));
      if (v > end) continue;
      const ph = u0 * TAU - v * 5 - uu * 1.2, dx = Math.sin(ph) * 3.2 * v + Math.sin(u0 * TAU * 2 + v * 9) * 0.6 * v;
      const slope = Math.cos(ph);
      const x = 1 + uu * (W - 1) + dx, y = top + v * LEN;
      // the trim along the edges, the mark in the middle, the cloth lit by how the fold faces
      const edge = uu < 0.09 || uu > 0.91 || v < 0.05 || v > end - 0.05;
      const mx = (uu - 0.5) * W, my = (v - 0.4) * LEN;
      let c = L.cloth[Math.max(0, Math.min(4, 2 + (slope > 0.55 ? 1 : slope < -0.55 ? -1 : 0) + (v < 0.12 ? 0 : 0)))];
      if (edge) c = L.trim[slope > 0.3 ? 3 : slope < -0.4 ? 1 : 2];
      else {
        const d = Math.hypot(mx, my);
        if (o.side === "t") {
          const cut = Math.hypot(mx - 2.6, my - 0.8);
          if (d < 6 && cut >= 4.6) c = L.mark[d < 4 && mx < -1 ? 2 : 1];
          else if (d >= 6 && d < 7) c = L.mark[0];
        } else {
          const ang = Math.atan2(my, mx), ray = d < 8 && d > 5.2 && Math.cos(ang * 8) > 0.55;
          if (d < 4.6) c = L.mark[d < 2.6 && mx < 0 && my < 0 ? 2 : 1];
          else if (ray) c = L.mark[0];
        }
      }
      G.set(x, y, c);
    }
  G.outline(() => K);
  p.glow(12, top + LEN * 0.4, 18, L.cloth[3], 0.08);
  G.draw(p, 1, 0, 0);
}
