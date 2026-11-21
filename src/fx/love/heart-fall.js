import { hex, TAU } from "../../core/index.js";

export const meta = {
  name: "Heart falling",
  desc: "One small pixel heart drifting down from the top, swaying side to side, turning edge-on and back as it falls, a glint, fading at the bottom.",
  tags: ["love", "heart", "falling", "celebration", "wedding", "one-shot"],
  size: [40, 240],
  origin: [20, 0],
  duration: 4.2,
  loop: false,
  fps: 24,
  bg: "dark",
  options: { color: 0, big: 0, seed: 1 },
};

// three looks: pink, red, rose; a big one (7 px) or a small one (5 px)
const PALS = [
  { X: "#5a0a2a", H: "#ffe0ee", P: "#ff6a9a", D: "#c8306a" },
  { X: "#4a0610", H: "#ffc8c8", P: "#ee3040", D: "#a81424" },
  { X: "#5a1a3a", H: "#fff0fa", P: "#ff9ad0", D: "#d0609a" },
];
const BIG = ["..XX.XX..", ".XHHXPPX.", "XHHPPPPDX", "XHPPPPPDX", ".XPPPPDX.", "..XPPDX..", "...XDX...", "....X...."];
const SMALL = [".XX.XX.", "XHPXPDX", "XPPPPDX", ".XPPDX.", "..XDX..", "...X..."];
const rnd = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function draw(p, t, o) {
  const s = (o.seed ?? 1) | 0, u = Math.min(1, t / meta.duration);
  const pal = PALS[((o.color ?? 0) | 0) % 3], rows = o.big ? BIG : SMALL;
  const H = rows.length, W = rows[0].length;
  // the fall: easing in from a standstill, swaying with a period of its own
  const y = 4 + u * 224 * (0.85 + rnd(s, 1) * 0.15);
  const x = Math.sin(u * TAU * (1.2 + rnd(s, 2)) + rnd(s, 3) * TAU) * (6 + rnd(s, 4) * 6);
  // turning: its width shrinks to an edge and back, so it seems to tumble
  const turn = Math.cos(u * TAU * (1 + rnd(s, 5) * 1.5) + rnd(s, 6) * TAU);
  const sx = Math.max(0.2, Math.abs(turn)), back = turn < 0;
  const a = u < 0.08 ? u / 0.08 : u > 0.8 ? (1 - u) / 0.2 : 1;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      // seen from behind it is a shade darker, no highlight
      const col = back ? (ch === "X" ? pal.X : pal.D) : pal[ch];
      const px = Math.round(x + (c - (W - 1) / 2) * sx), py = Math.round(y + r - H / 2);
      p.dot(px, py, hex(col), a);
    }
  // a glint now and then when it faces us
  if (!back && sx > 0.85 && Math.sin(u * TAU * 3 + s) > 0.9) p.dot(Math.round(x - W / 4), Math.round(y - H / 4), hex("#ffffff"), a);
  p.glow(x, y, o.big ? 6 : 4, hex(pal.P), 0.12 * a);
}
