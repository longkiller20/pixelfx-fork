import { hex, mix, TAU, Rng } from "../../core/index.js";
import { shift } from "../critters/_lib.js";

export const meta = {
  name: "Camp barrier",
  desc: "A camp's kết giới: a tall curtain of light rising from a rune plate, bright seams and glyph sparks flowing up it. Side c gold and azure, side t crimson and violet.",
  tags: ["chinhta", "barrier", "wall", "shield", "light", "camp", "loop"],
  size: [32, 208],
  origin: [16, 204],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { side: "c" },
};

const H = (a) => a.map(hex);
const LOOK = {
  c: { a: H(["#2a4a9a", "#4a8ae8", "#a8d8ff", "#ffffff"]), b: H(["#8a5a0a", "#f0c040", "#fff0a0"]) },
  t: { a: H(["#4a0a3a", "#9a1a4a", "#ff5a7a", "#ffd0e0"]), b: H(["#3a0a5a", "#9a3ad0", "#e8a8ff"]) },
};
const K = hex("#0a0408"), STONE = H(["#1a1418", "#2e262a", "#463c40", "#5e5458"]);

export function draw(p, t, o) {
  const L = LOOK[o.side === "t" ? "t" : "c"], D = meta.duration, u = shift(t, D, o.seed ?? 1) / D, HT = 192;
  // the curtain: a soft column, brighter at its core, thinning to nothing at the top
  for (let y = -HT; y <= -4; y++) {
    const k = 1 - (-y - 4) / HT, wob = Math.sin(u * TAU * 2 + y * 0.12) * 1.2;
    for (let x = -7; x <= 7; x++) {
      const d = Math.abs(x - wob) / 7;
      if (d > 1) continue;
      p.blend(x, y, d < 0.25 ? L.a[2] : d < 0.6 ? L.a[1] : L.a[0], (0.62 - d * 0.42) * (0.3 + 0.7 * k));
    }
    // the two seams, flowing up in bright dashes
    for (const sx of [-6, 6]) {
      const dash = (((-y + u * (sx > 0 ? 48 : 64)) % 16) + 16) % 16;
      if (dash < 6) p.dot(sx + Math.round(wob * 0.5), y, dash < 2 ? L.a[3] : L.a[2], 0.55 + 0.45 * k);
    }
  }
  // glyph sparks drifting up the middle: each a small cross, on its own track, looping
  const R = new Rng(7);
  for (let i = 0; i < 12; i++) {
    const x0 = R.range(-4, 4), sp = 1 + (i % 2), ph = R.next();
    const y = -4 - (((u * sp + ph) % 1) * HT), a = 1 - (-y) / HT;
    const x = Math.round(x0 + Math.sin(u * TAU + i) * 1.5), yy = Math.round(y);
    const c = i % 3 ? L.b[2] : L.a[3];
    p.dot(x, yy, c, a);
    if (i % 2) p.dot(x - 1, yy, L.b[1], a * 0.8), p.dot(x + 1, yy, L.b[1], a * 0.8), p.dot(x, yy - 1, L.b[1], a * 0.8), p.dot(x, yy + 1, L.b[1], a * 0.8);
  }
  p.glow(0, -40, 22, L.a[1], 0.12 + 0.05 * Math.sin(u * TAU));
  // the rune plate it rises from: a stone slab, its runes glowing in turn
  for (let x = -12; x <= 12; x++) {
    p.dot(x, -3, Math.abs(x) === 12 ? K : STONE[3]);
    p.dot(x, -2, Math.abs(x) === 12 ? K : STONE[2]);
    p.dot(x, -1, Math.abs(x) === 12 ? K : STONE[1]);
    p.dot(x, 0, K);
  }
  for (let x = -13; x <= 13; x++) p.dot(x, -4, K);
  for (let i = 0; i < 5; i++) {
    const x = -9 + i * 4.5, on = 0.5 + 0.5 * Math.sin(u * TAU - i * 1.2);
    p.dot(x, -2, mix(STONE[2], L.b[2], on));
    p.dot(x + 1, -2, mix(STONE[2], L.b[1], on));
  }
}
