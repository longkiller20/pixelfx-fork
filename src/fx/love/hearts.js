import { hex, TAU } from "../../core/index.js";

export const meta = {
  name: "Hearts rising",
  desc: "A rose given: a pop of pink light, little pixel hearts rising and swaying as they fade, red petals drifting down.",
  tags: ["love", "heart", "gift", "rose", "one-shot", "ui"],
  size: [96, 96],
  origin: [48, 80],
  duration: 1.8,
  loop: false,
  fps: 24,
  bg: "dark",
  options: { seed: 1 },
};

const HEART = [".XX.XX.", "XHHXHHX", "XHPPPPX", "XPPPPPX", ".XPPPX.", "..XPX..", "...X..."];
const SMALL = [".X.X.", "XHXPX", "XPPPX", ".XPX.", "..X.."];
const PAL = [
  { X: "#5a0a20", H: "#ffd0e0", P: "#ff5a88" },
  { X: "#4a0a14", H: "#ffc8c8", P: "#e8303e" },
  { X: "#5a1a3a", H: "#ffe8f8", P: "#ff8ac8" },
];
const rnd = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function sprite(p, rows, pal, x, y, a) {
  const h = rows.length, w = rows[0].length;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch !== ".") p.dot(Math.round(x - w / 2 + c), Math.round(y - h / 2 + r), hex(pal[ch]), a);
    }
}

export function draw(p, t, o) {
  const D = meta.duration, u = Math.min(1, t / D), s = (o.seed ?? 1) | 0;
  // the pop where it was given
  if (u < 0.3) {
    const k = 1 - u / 0.3;
    p.glow(0, -10, 10 + (1 - k) * 18, hex("#ff7aa8"), 0.45 * k);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, r = 4 + (1 - k) * 22;
      p.dot(Math.cos(a) * r, -10 + Math.sin(a) * r * 0.8, hex("#ffd0e0"), k);
    }
  }
  // the hearts: each starts a little later, rises with a sway, fades out at the top
  for (let i = 0; i < 9; i++) {
    const t0 = rnd(i, s) * 0.35, v = (u - t0) / (0.65);
    if (v <= 0 || v >= 1) continue;
    const x = (rnd(i, s + 1) - 0.5) * 40 + Math.sin(v * TAU * 1.2 + i) * 4;
    const y = -8 - v * (46 + rnd(i, s + 2) * 20);
    const a = v < 0.15 ? v / 0.15 : v > 0.7 ? (1 - v) / 0.3 : 1;
    const big = i % 3 === 0;
    sprite(p, big ? HEART : SMALL, PAL[i % 3], x, y, a);
    if (big) p.glow(x, y, 6, hex("#ff6a98"), 0.2 * a);
  }
  // petals drifting down and turning
  for (let i = 0; i < 6; i++) {
    const t0 = 0.1 + rnd(i, s + 5) * 0.3, v = (u - t0) / 0.6;
    if (v <= 0 || v >= 1) continue;
    const x = (rnd(i, s + 6) - 0.5) * 50 + Math.sin(v * TAU + i) * 6, y = -60 + v * 50;
    const a = v > 0.7 ? (1 - v) / 0.3 : 1, turn = Math.sin(v * TAU * 2 + i) > 0;
    p.dot(x, y, hex("#e8303e"), a);
    p.dot(x + (turn ? 1 : 0), y + (turn ? 0 : 1), hex("#a8142a"), a);
  }
}
