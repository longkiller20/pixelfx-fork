import { hex, mix, TAU } from "../../core/index.js";
import { Grid, shift } from "../critters/_lib.js";

export const meta = {
  name: "Chính Tà stele",
  desc: "The stele between two camps: an old stone on a plinth, a disc carved in its face, half a gold sun, half a crimson moon; the light beats from one half to the other, motes rise.",
  tags: ["chinhta", "stele", "monument", "stone", "prop", "loop"],
  size: [56, 96],
  origin: [28, 92],
  duration: 3,
  loop: true,
  fps: 12,
  bg: "dark",
  options: {},
};

const H = (a) => a.map(hex);
const STONE = H(["#16121a", "#2a2430", "#3e3646", "#544a5c", "#6e6276", "#8a7e92"]);
const GOLD = H(["#6a3a04", "#c8861a", "#f6c440", "#fff0a0"]);
const RED = H(["#3a0610", "#8a0e1c", "#e02a3a", "#ff8a8a"]);
const K = hex("#0a0608");
const G = new Grid(-28, -92, 56, 96);

export function draw(p, t, o) {
  const u = shift(t, meta.duration, o.seed ?? 1) / meta.duration;
  // which half is lit: the gold (0) to the red (1) and back
  const sw = 0.5 - 0.5 * Math.cos(u * TAU);
  G.clear();
  // the plinth: two steps
  G.shade(-22, -8, 22, 0, (x, y) => (y < -4 ? (Math.abs(x) <= 17 ? (y === -8 ? STONE[4] : STONE[3]) : 0) : y === -4 ? STONE[3] : STONE[2]));
  // the stone: a slab with a rounded crown, lit from the top left
  G.shade(-13, -84, 13, -9, (x, y) => {
    const crown = y < -74 ? Math.hypot(x / 13, (y + 74) / 10) : 0;
    if (crown > 1) return 0;
    const nx = x / 13;
    return nx < -0.6 ? STONE[4] : nx > 0.6 ? STONE[2] : y < -78 ? STONE[4] : STONE[3];
  });
  G.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, STONE[0], 0.4)));
  G.draw(p, 1, 0, 0);
  // the carved disc: sun on the left half, moon on the right, a sunken rim
  const cx = 0, cy = -52, R = 9;
  for (let y = -R - 1; y <= R + 1; y++)
    for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 1) continue;
      if (d > R) {
        p.dot(cx + x, cy + y, STONE[1]);
        continue;
      }
      const left = x < 0 || (x === 0 && y < 0);
      const C = left ? GOLD : RED, on = left ? 1 - sw : sw;
      const l = Math.hypot(x + (left ? 3 : -3), y + 3);
      const base = l < 3 ? C[3] : l < 6 ? C[2] : C[1];
      p.dot(cx + x, cy + y, mix(mix(STONE[2], C[0], 0.6), base, 0.35 + 0.65 * on));
    }
  // the line between them, carved, and a crack running down the stone from it
  for (let y = -R; y <= R; y++) p.dot(cx + Math.round(Math.sin(y / 3) * 1.2), cy + y, K);
  p.polyline([[1, -43], [0, -40], [2, -36], [1, -33], [3, -29], [2, -26]], K);
  // carved words: small strokes above and below (not letters, the look of them)
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) p.dot(-4 + k * 3, -72 + i * 3, STONE[1]), p.dot(-4 + k * 3, -24 + i * 3, STONE[1]);
  p.glow(cx - 4, cy, 16, GOLD[2], 0.18 * (1 - sw));
  p.glow(cx + 4, cy, 16, RED[2], 0.18 * sw);
  // motes rising off the stone: gold on the left, red on the right
  for (let i = 0; i < 8; i++) {
    const k = (u * (1 + (i % 2)) + i / 8) % 1, left = i < 4;
    const x = (left ? -9 : 9) + Math.sin(k * TAU + i) * 3, y = -20 - k * 70;
    p.dot(Math.round(x), Math.round(y), left ? GOLD[3] : RED[3], 1 - k);
  }
}
