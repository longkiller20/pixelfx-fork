import { hex, mix, TAU, rng } from "../../core/index.js";
import { SIZE, LAMPS, BANDS } from "./_tien-phu.js";

export const meta = {
  name: "Tiên Phủ (live)",
  desc: "A celestial palace's moving parts over its picture: waterfalls, ripples, falling petals, a meditating aura, a portal, drifting clouds, glowing swords, lamps. part 0/1: its halves.",
  tags: ["home", "house", "palace", "water", "light", "loop"],
  // the picture is wider than an effect may be: two overlapping halves (option part), each drawing what lies on its side;
  // (0, 0) is the picture's top left, with room above it
  size: [480, SIZE[1] + 20],
  origin: [0, 20],
  duration: 8,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { part: 0, seed: 1 },
};

const D = meta.duration;
const WARM = hex("#ffd27a"), GOLD = hex("#ffe9a8"), WH = hex("#ffffff"), AQUA = hex("#9ae8ff"), BLUE = hex("#5ab8ff"), DEEP = hex("#3a7ad8");
const PURP = hex("#b47aff"), LILAC = hex("#e0c8ff"), PINK = hex("#ffb0d8"), PINK2 = hex("#ff8ac8"), CYAN = hex("#7af0ff");

// a point of the source picture (1774 x 887, as the user drew it) in this picture's pixels
const S = 0.45;
const Y = (sy) => {
  for (const [a, b, o0, o1] of BANDS) if (sy >= a && sy <= b) return o0 + ((sy - a) * (o1 - o0)) / (b - a);
  return BANDS[BANDS.length - 1][3];
};
const X = (sx) => sx * S;
const P = (sx, sy) => [X(sx), Y(sy)];

const wave = (t, n = 1, ph = 0) => 0.5 + 0.5 * Math.sin((t / D) * TAU * n + ph);
const frac = (v) => ((v % 1) + 1) % 1;

/** Where each half starts in the picture, and where they meet. */
export const PARTS = [0, SIZE[0] - 480], SEAM = Math.round(SIZE[0] / 2);

// lanterns the finder missed (the hanging ones on the far sides, the standing lamps by the falls), in the source's px
const MORE = [[105, 285, 6], [1440, 300, 6], [1335, 448, 5], [1530, 452, 5], [1283, 405, 6], [100, 640, 5], [1590, 95, 5]];
// the falls: [x0, x1, y0, y1] in the source's px, how fast (px a second) and how strong
const FALLS = [
  [1578, 1614, 186, 292, 70, 0.55], // from the floating isle
  [1586, 1614, 330, 525, 80, 0.5], // the thin fall by the lantern post
  [1552, 1622, 560, 768, 95, 0.6], // the great fall into the pond
  [1556, 1588, 800, 862, 70, 0.45], // spilling off the terrace's edge
];

export function drawBack(p0, t, o) {
  const part = o.part ? 1 : 0, off = PARTS[part], mine = (x) => (x < SEAM) === !part;
  const p = {
    glow: (x, y, ...r) => mine(x) && p0.glow(x - off, y, ...r),
    glowLine: (x0, y0, x1, y1, ...r) => mine(x0) && p0.glowLine(x0 - off, y0, x1 - off, y1, ...r),
    glowRing: (x, y, ...r) => mine(x) && p0.glowRing(x - off, y, ...r),
    dot: (x, y, ...r) => mine(x) && p0.dot(x - off, y, ...r),
    line: (x0, y0, x1, y1, ...r) => mine(x0) && p0.line(x0 - off, y0, x1 - off, y1, ...r),
    disc: (x, y, ...r) => mine(x) && p0.disc(x - off, y, ...r),
  };
  const R = rng(o.seed ?? 1, 11), r = () => R.next();

  // ---- lamps: a warm glow each, breathing, with a candle's flicker
  LAMPS.forEach(([x, y, s], i) => {
    const f = 0.75 + 0.15 * Math.sin(t * 7 + i * 2.1) * Math.sin(t * 3.3 + i) + 0.1 * wave(t, 1, i);
    p.glow(x, y, s * 2.4, WARM, 0.32 * f);
    p.glow(x, y, s * 0.9, GOLD, 0.35 * f);
  });
  for (const [sx, sy, s] of MORE) {
    const f = 0.8 + 0.2 * Math.sin(t * 6 + sx);
    p.glow(...P(sx, sy), s * 2.4, WARM, 0.3 * f);
    p.glow(...P(sx, sy), s, GOLD, 0.4 * f);
  }

  // ---- the falls: streaks running down, foam where they land, a little mist
  FALLS.forEach(([a, b, y0, y1, v, k], fi) => {
    const x0 = X(a), x1 = X(b), top = Y(y0), bot = Y(y1), H = bot - top, n = Math.max(3, Math.round((x1 - x0) / 2));
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / n, ph = (i * 0.37 + fi * 0.21) % 1, sp = (v * S) * (0.8 + ((i * 7) % 5) * 0.08);
      for (let j = 0; j < 3; j++) {
        const y = top + frac((t * sp) / H + ph + j / 3) * H, len = 3 + ((i + j) % 3) * 2;
        p.line(x, y, x, Math.min(bot, y + len), j === 0 ? WH : AQUA, k * (0.6 + 0.4 * ((i + j) % 2)));
      }
    }
    p.glowLine((x0 + x1) / 2, top, (x0 + x1) / 2, bot, (x1 - x0) * 0.7, BLUE, 0.12);
    // foam at the foot
    for (let j = 0; j < 6; j++) {
      const u = frac(t * 1.3 + j / 6), x = x0 + ((j * 0.61) % 1) * (x1 - x0), y = bot - u * 4;
      p.disc(x, y, 1 + u * 2, WH, 0.5 * (1 - u));
    }
    p.glow((x0 + x1) / 2, bot, (x1 - x0) * 0.8, WH, 0.18 + 0.06 * wave(t, 4, fi));
  });

  // ---- the pond: rings spreading where the water falls and among the lotuses
  [[1510, 783, 0], [1600, 778, 2.7], [1700, 780, 5.1], [1650, 790, 1.3]].forEach(([sx, sy, at]) => {
    const u = frac((t - at) / 2.7), [cx, cy] = P(sx, sy), rx = 2 + u * 10;
    for (let a = 0; a < TAU; a += 0.25) p.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * rx * 0.3, AQUA, 0.55 * (1 - u));
  });

  // ---- cherry petals drifting down from the tree, leftwards on the wind
  for (let i = 0; i < 16; i++) {
    const ph = (i * 0.618) % 1, life = 5 + (i % 4), u = frac(t / life + ph);
    const sx = 1260 + ((i * 97) % 270), sy = 190 + ((i * 53) % 120);
    const [x0, y0] = P(sx, sy), x = x0 - u * 46 + Math.sin(u * 9 + i) * 4, y = y0 + u * 100;
    const a = Math.min(1, u * 8, (1 - u) * 5);
    p.dot(x, y, i % 3 ? PINK : PINK2, a), p.dot(x + 1, y, PINK, a * 0.6);
  }

  // ---- the meditating cultivator: rings of power spreading, motes rising, a glow breathing
  {
    const [cx, cy] = P(1150, 478);
    p.glow(cx, cy, 34, PURP, 0.22 + 0.14 * wave(t, 2));
    for (let j = 0; j < 3; j++) {
      const u = frac(t / 2.4 + j / 3);
      p.glowRing(cx, cy, 6 + u * 30, 2.5, j % 2 ? LILAC : PURP, 0.5 * (1 - u));
    }
    for (let j = 0; j < 8; j++) {
      const u = frac(t / 3 + j / 8), x = cx - 18 + ((j * 37) % 36) + Math.sin(u * 6 + j) * 2;
      p.dot(x, cy + 14 - u * 40, j % 2 ? LILAC : WH, Math.min(1, u * 5, (1 - u) * 3));
    }
  }

  // ---- the portal door: two rings of runes turning against each other, light breathing, motes drifting up
  {
    const [cx, cy] = P(815, 690), rot = (t / D) * TAU;
    p.glow(cx, cy, 30, CYAN, 0.2 + 0.15 * wave(t, 3));
    for (let k = 0; k < 16; k++) {
      const a = rot + (k / 16) * TAU;
      p.dot(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, k % 4 ? AQUA : WH, 0.9);
    }
    for (let k = 0; k < 10; k++) {
      const a = -rot * 1.5 + (k / 10) * TAU;
      p.dot(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, CYAN, 0.8);
    }
    for (let j = 0; j < 6; j++) {
      const u = frac(t / 2.5 + j / 6);
      p.dot(cx - 10 + ((j * 7) % 20), cy + 22 - u * 46, WH, Math.min(1, u * 5, (1 - u) * 3) * 0.8);
    }
    // the steps before it, lit from the door
    p.glow(...P(815, 805), 26, hex("#d8ecff"), 0.15 + 0.08 * wave(t, 2, 1));
  }

  // ---- the moon window: clouds drifting across the painted mountains
  {
    const [cx, cy] = P(815, 292), Rr = 36;
    for (let j = 0; j < 4; j++) {
      const u = frac(t / D + j / 4), x = cx - Rr - 14 + u * (2 * Rr + 28), y = cy - 6 + j * 7 - 10;
      for (const [dx, dy, rr] of [[0, 0, 4], [5, -1, 3.5], [-5, 1, 3], [9, 1, 2.5]]) {
        const px = x + dx, py = y + dy;
        if (Math.hypot(px - cx, py - cy) < Rr - 3) p.disc(px, py, rr, WH, 0.22);
      }
    }
  }

  // ---- the sword rack: light running up each glowing blade
  [372, 392, 411, 432, 452].forEach((sx, i) => {
    const u = frac(t / 1.6 + i * 0.23), [x, y0] = P(sx, 735), [, y1] = P(sx, 655), y = y0 + (y1 - y0) * u;
    p.glow(x, y, 4, i % 2 ? PURP : CYAN, 0.8 * Math.sin(u * Math.PI));
    p.dot(x, y, WH, Math.sin(u * Math.PI));
  });
  [[684, 0], [712, 1.1]].forEach(([sy, at]) => {
    const u = frac((t - at) / 2), [x0, y] = P(210, sy), [x1] = P(300, sy), x = x0 + (x1 - x0) * u;
    p.glow(x, y, 4, LILAC, 0.7 * Math.sin(u * Math.PI));
  });

  // ---- glints: the spirit crystals, the starry bed painting
  [[222, 515, 0.4], [1428, 698, 2.9], [228, 357, 5.3]].forEach(([sx, sy, at]) => {
    const u = frac((t - at) / 4) * 4;
    if (u > 0.7) return;
    const s = Math.sin((u / 0.7) * Math.PI), [x, y] = P(sx, sy), rr = 1 + s * 3;
    for (let i = -rr; i <= rr; i++) (p.dot(x + i, y, WH, s), p.dot(x, y + i, WH, s));
    p.glow(x, y, 7, CYAN, 0.5 * s);
  });
  for (let j = 0; j < 7; j++) {
    const s = wave(t, 3, j * 1.9);
    if (s > 0.7) p.dot(...P(470 + r() * 90, 278 + r() * 40), WH, (s - 0.7) * 3.3);
  }

  // ---- spirit motes drifting up round the palace, and round the floating isle
  for (let j = 0; j < 18; j++) {
    const u = frac(t / (5 + (j % 3)) + j * 0.137), sx = 60 + ((j * 211) % 1500), sy = 860 - ((j * 131) % 300);
    const [x, y] = P(sx, sy), a = Math.min(1, u * 4, (1 - u) * 3);
    p.glow(x + Math.sin(u * 7 + j) * 3, y - u * 70, 2.5, j % 3 ? GOLD : CYAN, 0.6 * a);
  }
  for (let j = 0; j < 5; j++) {
    const u = frac(t / 4 + j / 5), [x, y] = P(1500 + j * 45, 200);
    p.dot(x + Math.sin(u * 6 + j) * 2, y - u * 24, LILAC, Math.min(1, u * 4, (1 - u) * 3));
  }
}

export function draw() {}
