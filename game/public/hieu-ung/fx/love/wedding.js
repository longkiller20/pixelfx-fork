import { hex, TAU } from "../../core/index.js";

export const meta = {
  name: "Wedding",
  desc: "Two become dao lu: two lights spiral up and meet as a heart of gold, a ring of red light opens, rose petals rain, gold sparks fall.",
  tags: ["love", "wedding", "heart", "celebration", "one-shot", "ui"],
  size: [180, 200],
  origin: [90, 180],
  duration: 3.2,
  loop: false,
  fps: 24,
  bg: "dark",
  options: { seed: 1 },
};

const rnd = (i, k) => {
  const x = Math.sin(i * 91.7 + k * 271.3) * 43758.5453;
  return x - Math.floor(x);
};
const RED = hex("#e8303e"), DRED = hex("#8a1024"), PINK = hex("#ff8ab0"), GOLD = hex("#ffd060"), WHITE = hex("#fff8e8");
/** A heart outline of radius r at (x, y): the classic curve, dotted. */
function heart(p, x, y, r, c, a, n = 40) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    p.dot(x + (hx / 16) * r, y + (hy / 16) * r, c, a);
  }
}

export function draw(p, t, o) {
  const D = meta.duration, u = Math.min(1, t / D), s = (o.seed ?? 1) | 0, cy = -92;
  // 1. two lights spiral up from the ground and meet (0 .. 0.35)
  if (u < 0.4) {
    const v = Math.min(1, u / 0.35), fade = u > 0.35 ? 1 - (u - 0.35) / 0.05 : 1;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const w = Math.max(0, v - k * 0.03), r = 26 * (1 - w), a = w * TAU * 1.5 * side;
        const x = Math.cos(a) * r * side, y = w * cy + Math.sin(a) * r * 0.3;
        p.dot(x, y, k ? (side < 0 ? PINK : GOLD) : WHITE, fade * (1 - k / 6));
        if (!k) p.glow(x, y, 6, side < 0 ? PINK : GOLD, 0.35 * fade);
      }
    }
  }
  // 2. where they met: a flash and a golden heart that swells, then fades (0.33 .. 1)
  if (u > 0.33) {
    const v = (u - 0.33) / 0.64, pop = Math.min(1, v / 0.12), a = v < 0.75 ? 1 : Math.max(0, (1 - v) / 0.25);
    if (v < 0.15) p.glow(0, cy, 40 * pop, WHITE, 0.6 * (1 - v / 0.15));
    const r = 8 + pop * 14 + Math.sin(v * TAU * 3) * 0.8;
    // a solid heart, lit from the top left, a gold rim round it
    const R = Math.round(r);
    for (let y = Math.floor(-R * 1.45) - 2; y <= R + 2; y++)
      for (let x = -R - 2; x <= R + 2; x++) {
        const nx = x / R, ny = -(y + R * 0.1) / R, f = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny ** 3;
        if (f > 0) continue;
        const edge = (((nx * 1.08) ** 2 + (ny * 1.08) ** 2 - 1) ** 3 - (nx * 1.08) ** 2 * (ny * 1.08) ** 3) > 0;
        const lightK = Math.hypot(nx + 0.45, ny - 0.75);
        const c = edge ? GOLD : lightK < 0.35 ? PINK : lightK < 1.25 ? RED : DRED;
        p.dot(x, cy + y, c, a);
      }
    p.dot(-R * 0.45, cy - R * 0.45, WHITE, a), p.dot(-R * 0.45 + 1, cy - R * 0.45, WHITE, a * 0.6);
    heart(p, 0, cy + 1, r + 3, GOLD, a * 0.6, 70);
    p.glow(0, cy, r + 10, RED, 0.25 * a);
    // a ring of red light opening round it
    if (v < 0.6) {
      const k = v / 0.6, R = 10 + k * 64;
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * TAU;
        p.dot(Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.85, i % 4 ? RED : GOLD, 1 - k);
      }
    }
  }
  // 3. rose petals raining, turning as they fall (0.35 .. 1)
  for (let i = 0; i < 26; i++) {
    const t0 = 0.35 + rnd(i, s) * 0.2, v = (u - t0) / 0.44;
    if (v <= 0 || v >= 1) continue;
    const x = (rnd(i, s + 1) - 0.5) * 130 + Math.sin(v * TAU * 1.3 + i) * 7, y = -170 + v * 168 * (0.7 + rnd(i, s + 2) * 0.3);
    const a = v > 0.8 ? (1 - v) / 0.2 : 1, turn = Math.sin(v * TAU * 2 + i);
    p.dot(x, y, i % 3 ? RED : PINK, a);
    if (turn > -0.3) p.dot(x + 1, y, i % 3 ? DRED : RED, a);
    if (turn > 0.4) p.dot(x, y + 1, DRED, a);
  }
  // 4. gold sparks falling from the heart
  for (let i = 0; i < 18; i++) {
    const t0 = 0.4 + rnd(i, s + 7) * 0.15, v = (u - t0) / 0.42;
    if (v <= 0 || v >= 1) continue;
    const ang = rnd(i, s + 8) * TAU, sp = 30 + rnd(i, s + 9) * 40;
    const x = Math.cos(ang) * sp * v, y = cy + Math.sin(ang) * sp * v * 0.6 + 40 * v * v;
    p.dot(x, y, v < 0.5 ? WHITE : GOLD, 1 - v);
  }
}
