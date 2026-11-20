import { hex, mix, TAU, rng } from "../../core/index.js";
import { SIZE, TUBES, BANDS } from "./_gamer.js";

export const meta = {
  name: "Gamer house (live)",
  desc: "The Gamer house's moving lights, over its picture: neon breathing and flickering, the GAMER sign, screens, arcade, chimney smoke, a blinking cat. part 0/1: its left or right half.",
  tags: ["home", "house", "neon", "gamer", "light", "loop"],
  // the picture is wider than an effect may be: two overlapping halves (option part), each drawing what lies on its side
  // (0, 0) is the picture's top left; room above it for the chimney's smoke
  size: [480, SIZE[1] + 20],
  origin: [0, 20],
  duration: 6,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { part: 0, seed: 1 },
};

const D = meta.duration;
const C = { 1: hex("#3ae8ff"), 2: hex("#ff4ad8"), 3: hex("#ffb040") };
const CY = hex("#3ae8ff"), MG = hex("#ff4ad8"), PU = hex("#b45cff"), WH = hex("#ffffff"), RD = hex("#ff3050"), GR = hex("#7aff9a");
const SMOKE = hex("#8a80a0"), FUR = hex("#ece6f6"), LID = hex("#3a2c4a");
const RAINBOW = ["#ff4a6a", "#ffb040", "#ffe85a", "#5aff8a", "#3ae8ff", "#6a7aff", "#ff4ad8"].map(hex);

// a point of the source picture (1774 x 887, as the user drew it) in this picture's pixels
const S = 0.45;
const Y = (sy) => {
  for (const [a, b, o0, o1] of BANDS) if (sy >= a && sy <= b) return o0 + ((sy - a) * (o1 - o0)) / (b - a);
  return BANDS[BANDS.length - 1][3];
};
const X = (sx) => sx * S;
const P = (sx, sy) => [X(sx), Y(sy)];

/** 0..1, smooth, once per loop at its own phase (`n` times a loop). */
const wave = (t, n = 1, ph = 0) => 0.5 + 0.5 * Math.sin((t / D) * TAU * n + ph);
/** Whether a blink is on: on for `len` s every `every` s, starting at `at`. */
const blink = (t, every, len, at = 0) => ((((t - at) % every) + every) % every) < len;
const hue = (u) => {
  const n = RAINBOW.length, x = ((u % 1) + 1) % 1 * n, i = Math.floor(x);
  return mix(RAINBOW[i % n], RAINBOW[(i + 1) % n], x - i);
};

// the tubes that flicker now and then, and when (a broken-ish neon is half the charm)
const FLICK = new Set([4, 13, 27, 38]);

/** Where each half starts in the picture, and where they meet. */
export const PARTS = [0, SIZE[0] - 480], SEAM = Math.round(SIZE[0] / 2);

export function drawBack(p0, t, o) {
  const g = rng(o.seed ?? 1, 7), R = () => g.next();
  // a painter for this half: picture x in, only what starts on this side of the seam, moved into this half's canvas
  const part = o.part ? 1 : 0, off = PARTS[part], mine = (x) => (x < SEAM) === !part;
  const p = {
    glow: (x, y, ...r) => mine(x) && p0.glow(x - off, y, ...r),
    glowLine: (x0, y0, x1, y1, ...r) => mine(x0) && p0.glowLine(x0 - off, y0, x1 - off, y1, ...r),
    dot: (x, y, ...r) => mine(x) && p0.dot(x - off, y, ...r),
    line: (x0, y0, x1, y1, ...r) => mine(x0) && p0.line(x0 - off, y0, x1 - off, y1, ...r),
    disc: (x, y, ...r) => mine(x) && p0.disc(x - off, y, ...r),
  };
  // ---- neon tubes: each breathes at its own pace; a few stutter
  TUBES.forEach(([x0, y0, x1, y1, k], i) => {
    let a = 0.55 + 0.45 * wave(t, 1 + (i % 3), i * 1.7);
    if (FLICK.has(i)) {
      const at = (i * 1.3) % D, u = ((t - at) % D + D) % D;
      if (u < 0.45) a *= Math.sin(u * 60) > 0.2 ? 1.25 : 0.05;
    }
    p.glowLine(x0, y0, x1, y1, 9, C[k], 0.5 * a);
    p.glowLine(x0, y0, x1, y1, 2.5, mix(C[k], WH, 0.6), 0.75 * a);
  });

  // ---- the GAMER sign: a breathing halo, a light running round the controller, a chase along the letters
  const sg = wave(t, 2);
  p.glow(...P(893, 80), 50, PU, 0.25 + 0.2 * sg);
  const ru = (t / D) * 2;
  for (let j = 0; j < 4; j++) {
    const a = (ru - j * 0.025) * TAU, [cx, cy] = P(892, 68);
    const x = cx + Math.cos(a) * X(70) * 0.98, y = cy + Math.sin(a) * 15;
    p.glow(x, y, 7 - j, j ? MG : WH, 1.2 - j * 0.25);
  }
  const letter = Math.floor((t / D) * 10) % 6;
  if (letter < 5) p.glow(...P(816 + letter * 37, 140), 13, mix(MG, WH, 0.3), 0.9);

  // ---- the dish's beacon
  if (blink(t, 1.5, 0.22)) p.glow(...P(566, 22), 9, RD, 0.9), p.dot(...P(566, 22), WH, 1);
  // ---- the chimney: puffs rising and drifting right, and its two little lights
  for (let j = 0; j < 6; j++) {
    const u = (((t / 3 + j / 6) % 1) + 1) % 1, [cx, cy] = P(380, 60);
    const x = cx + u * 14 + Math.sin(u * 5 + j) * 2, y = cy - u * 34, r = 2 + u * 5;
    p.disc(x, y, r, mix(SMOKE, hex("#c8c0d8"), u), 0.42 * (1 - u) * Math.min(1, u * 6));
  }
  for (const sx of [365, 392]) p.glow(...P(sx, 122), 6, CY, 0.25 + 0.25 * wave(t, 3, sx));

  // ---- top floor: hexagon lights rippling through their colours, the ring light, the PC, the monitors
  [[1095, 222], [1125, 210], [1153, 222], [1125, 246]].forEach(([sx, sy], j) => {
    const c = mix(CY, j % 2 ? PU : MG, wave(t, 2, j * 1.4));
    p.glow(...P(sx, sy), 14, c, 0.45 + 0.35 * wave(t, 2, j * 1.4 + 1));
  });
  p.glow(...P(920, 310), 12, CY, 0.25 + 0.3 * wave(t, 3));
  p.glow(...P(1217, 300), 16, hue(t / D * 2), 0.7);
  p.glow(...P(1217, 286), 6, hue(t / D * 2 + 0.3), 0.6);
  // the monitors (the chair hides their middle): a scan line going down, stars twinkling
  for (const [a, b] of [[960, 1016], [1086, 1160]]) {
    const y = Y(274) + ((t / D * 3) % 1) * (Y(326) - Y(274));
    p.glowLine(X(a), y, X(b), y, 2.5, WH, 0.3);
    for (let j = 0; j < 5; j++) {
      const sx = a + R() * (b - a), sy = 278 + R() * 44, ph = R() * TAU;
      const s = wave(t, 4, ph);
      if (s > 0.75) p.dot(...P(sx, sy), WH, (s - 0.75) * 4);
    }
  }
  // the LED strip over the bed: colours running along it
  const strip = [[300, 282], [298, 252], [304, 230], [322, 215], [352, 208], [410, 206]];
  for (let j = 0; j < 14; j++) {
    const u = j / 13, seg = Math.min(strip.length - 2, Math.floor(u * (strip.length - 1))), f = u * (strip.length - 1) - seg;
    const [ax, ay] = strip[seg], [bx, by] = strip[seg + 1];
    p.glow(...P(ax + (bx - ax) * f, ay + (by - ay) * f), 5, hue(u - t / D * 2), 0.85);
  }
  // the cat blinks
  if (blink(t, 3, 0.16, 1.1)) {
    for (const ex of [555, 579]) {
      const [x0, y0] = P(ex, 360), [x1, y1] = P(ex + 10, 372);
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) p.dot(x, y, FUR, 1);
      p.line(x0, (y0 + y1) / 2 + 1, x1, (y0 + y1) / 2 + 1, LID, 1);
    }
  }

  // ---- middle floor: the TV (stars, a pulsing sun, a sweep of light), the neon controller, the trophy's glint, YouTube
  for (let j = 0; j < 8; j++) {
    const sx = 1072 + R() * 165, sy = 458 + R() * 34, s = wave(t, 3, R() * TAU);
    if (s > 0.7) p.dot(...P(sx, sy), WH, (s - 0.7) * 3.3);
  }
  p.glow(...P(1158, 518), 10, hex("#ff7ab0"), 0.3 + 0.25 * wave(t, 2));
  {
    const u = ((t / D) * 1.5) % 1, x = 1060 + u * 220;
    if (x > 1070 && x < 1240) p.glowLine(...P(x, 456), ...P(x - 26, 546), 4, WH, 0.18);
  }
  p.glow(...P(1328, 476), 20, MG, 0.3 + 0.35 * wave(t, 2, 1));
  p.glow(...P(1025, 462), 9, CY, 0.2 + 0.3 * wave(t, 3, 2));
  p.glow(...P(390, 470), 9, RD, 0.15 + 0.2 * wave(t, 2, 0.5));
  {
    const u = ((t - 2) % D + D) % D;
    if (u < 0.6) {
      const s = Math.sin((u / 0.6) * Math.PI), [x, y] = P(304, 462), r = 1 + s * 3;
      for (let i = -r; i <= r; i++) (p.dot(x + i, y, WH, s), p.dot(x, y + i, WH, s));
      p.glow(x, y, 6, hex("#ffe08a"), 0.5 * s);
    }
  }

  // ---- ground floor: the arcade playing, its marquee chasing, the drink sign, the fridge's controller, the studio
  {
    const [ax0, ay0] = P(1382, 716), [ax1, ay1] = P(1434, 750), w = ax1 - ax0, h = ay1 - ay0;
    // a row of invaders marching, a ship under them shooting
    const march = Math.sin((t / D) * TAU * 3) * 3;
    for (let j = 0; j < 4; j++) p.dot(ax0 + 3 + j * (w - 6) / 3 + march, ay0 + 3 + ((t * 2) % 2 < 1 ? 0 : 1), GR, 1);
    const sx = ax0 + w / 2 + Math.sin((t / D) * TAU * 2) * (w / 2 - 3);
    p.dot(sx, ay1 - 2, CY, 1), p.dot(sx - 1, ay1 - 1, CY, 1), p.dot(sx + 1, ay1 - 1, CY, 1);
    const sh = (t * 3) % 1;
    p.dot(sx, ay1 - 3 - sh * (h - 6), WH, 1);
    p.glow(ax0 + w / 2, ay0 + h / 2, 14, hex("#5a7aff"), 0.25 + 0.15 * wave(t, 6));
    for (let j = 0; j < 5; j++) if ((Math.floor(t * 5) + j) % 3 === 0) p.glow(...P(1388 + j * 11, 692), 3, j % 2 ? MG : hex("#ffe85a"), 0.9);
  }
  {
    // the pink drink sign: mostly on, a stutter every few seconds
    const u = ((t - 3.6) % D + D) % D, on = u > 0.5 || Math.sin(u * 70) > 0;
    if (on) p.glow(...P(1495, 682), 16, MG, 0.65);
  }
  p.glow(...P(1008, 720), 13, CY, 0.3 + 0.4 * wave(t, 2, 2.5));
  p.glow(...P(478, 702), 24, hex("#fff6e0"), 0.18 + 0.12 * wave(t, 1));
  if (blink(t, 1, 0.5)) p.glow(...P(393, 726), 4, RD, 0.9), p.dot(...P(393, 726), RD, 1);
  // the microwave's clock and the bar's under-glow
  if (blink(t, 2, 1.2)) p.glow(...P(1086, 736), 4, GR, 0.6);
  p.glowLine(...P(1135, 788), ...P(1325, 788), 6, PU, 0.15 + 0.15 * wave(t, 2, 0.7));
}

export function draw() {}
