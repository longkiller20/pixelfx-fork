import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Fish",
  desc: "A catch for a fishing game, side view facing right: 15 looks from a boot and pond weed to carp, sturgeon, a jade turtle, dragon and phoenix fish, a sunken chest. Swims or flops.",
  tags: ["fishing", "fish", "catch", "carp", "koi", "dragon", "turtle", "loop"],
  size: [80, 48],
  origin: [40, 24],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { look: "chep", flop: 0, still: 0, outline: "#140c18" },
};

/** The looks, in the order a fishing game ranks them (junk first). */
export const LOOKS = ["ung", "rong", "ro", "diec", "chep", "loc", "tre", "tam", "huyet", "bang", "quy", "kim", "long", "phuong", "ruong"];

const H = (a) => a.map(hex);
const R = {
  silver: H(["#2a3440", "#5a6a7a", "#9aa8b4", "#d2dae0", "#f4f8fa"]),
  bronze: H(["#3a2208", "#7a4a14", "#b8782a", "#e0a84a", "#f8d888"]),
  olive: H(["#1a2210", "#34401e", "#56643a", "#7e8c5a", "#b0b888"]),
  mud: H(["#16120e", "#2e2620", "#4a3e34", "#6a5c4e", "#948472"]),
  slate: H(["#10161c", "#26323c", "#3e5260", "#62788a", "#9ab0c0"]),
  blood: H(["#3a0610", "#7a1020", "#c0283a", "#f05a5a", "#ffb0a0"]),
  ice: H(["#1a3a5a", "#3a78a8", "#7ac0e8", "#c0ecff", "#ffffff"]),
  gold: H(["#5a3404", "#a86e10", "#e8b028", "#ffe070", "#fff8d0"]),
  azure: H(["#0a1a4a", "#1a3e8e", "#2e6ad0", "#5ea8f8", "#c0e8ff"]),
  flame: H(["#4a0a04", "#a0240a", "#e85a14", "#ffa030", "#fff0a0"]),
  jade: H(["#0a2a1e", "#1a5a3e", "#2a8e5e", "#5ac88a", "#b8f0d0"]),
  cream: H(["#6a6050", "#a89c84", "#d8ccb0", "#f2ead8", "#ffffff"]),
  leather: H(["#1e1008", "#3e2414", "#6a4224", "#946238", "#b88a5a"]),
  weed: H(["#0a2010", "#164020", "#28663a", "#46924e", "#86c070"]),
  wood: H(["#24140a", "#4a2c14", "#7a4a22", "#a8703a", "#d29a5a"]),
  red: H(["#4a0a10", "#8a1a24", "#c83a3a", "#f07060", "#ffc0a0"]),
};
const WHITE = hex("#ffffff"), INK = hex("#0c0810");

/**
 * The fish's look as numbers. a, b: half length and half height; body, belly: ramps; fin: ramp; tail: fork | round | fan |
 * shark | plume; dorsal: low | high | long | sail | spiny; whisk: barbels; pattern: scales | bars | mottle | spots |
 * scutes | crystal; glow: a colour it shines with.
 */
const SPEC = {
  ro: { a: 9, b: 5, body: R.olive, belly: R.cream, fin: R.olive, tail: "round", dorsal: "spiny", pattern: "bars" },
  diec: { a: 10, b: 7, body: R.silver, belly: R.cream, fin: R.silver, tail: "fork", dorsal: "high", pattern: "scales" },
  chep: { a: 15, b: 8, body: R.bronze, belly: R.gold, fin: R.bronze, tail: "fork", dorsal: "long", whisk: 4, pattern: "scales" },
  loc: { a: 18, b: 5.5, body: R.mud, belly: R.cream, fin: R.mud, tail: "round", dorsal: "long", pattern: "mottle", snout: 1 },
  tre: { a: 17, b: 6, body: R.slate, belly: R.cream, fin: R.slate, tail: "round", dorsal: "low", whisk: 9, pattern: "plain", flat: 1 },
  tam: { a: 24, b: 6, body: R.slate, belly: R.silver, fin: R.slate, tail: "shark", dorsal: "low", whisk: 3, pattern: "scutes", snout: 4 },
  huyet: { a: 14, b: 7.5, body: R.blood, belly: R.gold, fin: R.gold, tail: "fan", dorsal: "long", whisk: 4, pattern: "scales", glow: "#ff4a3a" },
  bang: { a: 11, b: 6, body: R.ice, belly: R.ice, fin: R.ice, tail: "fork", dorsal: "high", pattern: "crystal", glow: "#9ae8ff", clear: 0.82 },
  kim: { a: 15, b: 8, body: R.gold, belly: R.gold, fin: R.gold, tail: "fan", dorsal: "long", whisk: 5, pattern: "scales", glow: "#ffd860" },
  long: { a: 23, b: 7, body: R.azure, belly: R.ice, fin: R.azure, tail: "fan", dorsal: "sail", whisk: 11, pattern: "scales", glow: "#5ab0ff", big: 1 },
  phuong: { a: 16, b: 7.5, body: R.flame, belly: R.gold, fin: R.red, tail: "plume", dorsal: "sail", pattern: "scales", glow: "#ff8a30" },
};

const G = new Grid(-40, -24, 80, 48);

/** A fish: its body bent by bend(x), the tail flapping by flap (-1..1). */
function fish(g, S, t, bend, flap) {
  const { a, b } = S, top = (x) => -half(S, x) + bend(x), bot = (x) => half(S, x) + bend(x);
  // the tail and the fins behind the body
  tail(g, S, -a + 1, bend(-a + 1), flap);
  dorsal(g, S, bend, flap);
  // the body
  g.shade(-a, -b - 2, a + (S.snout ?? 0), b + 2, (x, y, o) => {
    const t0 = top(x), b0 = bot(x);
    if (y < t0 || y > b0) return 0;
    const u = x / a, v = ((y - (t0 + b0) / 2) / Math.max(1, (b0 - t0) / 2));
    if (S.clear) o.a = S.clear;
    if (v > 0.38 && S.belly) return lit(S.belly, u * 0.3, v * 0.6, 3);
    let base = 2;
    const sx = x + a, sy = y - t0;
    if (S.pattern === "scales" && (Math.floor(sx / 3) + Math.floor(sy / 2.4)) % 2 === 0 && Math.abs(v) < 0.75 && x < a * 0.55) base = 3;
    if (S.pattern === "bars" && Math.floor(sx / 3.2) % 2 === 0 && x < a * 0.5 && x > -a * 0.8) base = 1;
    if (S.pattern === "mottle" && Math.sin(sx * 0.9) + Math.cos(sy * 1.3 + sx * 0.4) > 0.9) base = 1;
    if (S.pattern === "crystal" && Math.abs(((sx + sy * 1.2) % 6) - 3) < 0.6) return S.body[4];
    return lit(S.body, u * 0.35, v, base);
  });
  // a line along its side, scutes on a sturgeon, spots of light on spirit fish
  if (S.pattern === "scutes") for (let x = -a + 5; x < a - 6; x += 4) (g.set(x, bend(x) - 1, S.belly[4]), g.set(x + 1, bend(x) - 1, S.belly[3]), g.set(x, bend(x) - 2, S.belly[3]));
  else if (S.pattern !== "crystal") for (let x = -a + 4; x < a * 0.5; x++) if (x % 2 === 0) g.set(x, bend(x) - b * 0.05, S.body[1]);
  // the gill, the eye, the mouth
  const gx = a * 0.45;
  for (let y = -b * 0.55; y <= b * 0.45; y++) g.set(gx - Math.abs(y) * 0.25, bend(gx) + y, S.body[1]);
  const ex = a * 0.68 + (S.snout ?? 0) * 0.3, ey = bend(ex) - b * 0.25, er = S.big ? 1.6 : b > 6 ? 1.4 : 1;
  g.ellipse(ex, ey, er + 0.6, er + 0.6, S.body[4]);
  g.ellipse(ex + 0.2, ey, er, er, INK);
  g.set(ex - 0.4, ey - 0.6, WHITE);
  g.line(a + (S.snout ?? 0) - 1, bend(a) + b * 0.25, a - 3, bend(a) + b * 0.3, S.body[0]);
  // a dragon fish's golden horns and its mane
  if (S.big) {
    g.line(ex - 1, ey - er - 1, ex - 6, ey - er - 5, R.gold[3]);
    g.line(ex - 2, ey - er, ex - 7, ey - er - 3, R.gold[2]);
    for (let i = 0; i < 5; i++) g.line(gx - 1 - i * 2, bend(gx) - S.b * 0.9, gx - 4 - i * 2, bend(gx) - S.b * 0.9 - 3 + (i % 2), R.ice[3]);
  }
  // a pectoral fin and an anal fin
  const pf = S.fin, px = a * 0.3, py = bend(px) + b * 0.35;
  g.poly([[px, py], [px - 6, py + 3 + flap], [px - 4, py + 0.5]], (x, y) => (y < py + 1 ? pf[3] : pf[2]), S.clear ?? 1);
  g.poly([[-a * 0.4, bot(-a * 0.4) - 1], [-a * 0.7, bot(-a * 0.6) + 3], [-a * 0.6, bot(-a * 0.6) - 1]], pf[1], S.clear ?? 1);
  // barbels
  if (S.whisk) {
    const mx = a + (S.snout ?? 0) - 2, my = bend(a) + b * 0.3;
    for (const k of [0, 1]) {
      const L = S.whisk * (k ? 0.7 : 1);
      for (let i = 0; i <= L; i++) g.set(mx + i * 0.7 - (k ? 1 : 0), my + 1 + i * 0.45 + Math.sin(t * TAU + i * 0.5 + k) * (i / L) * 1.5, S.body[k ? 2 : 3]);
    }
  }
}
function half(S, x) {
  const u = Math.max(-1, Math.min(1, x / S.a));
  // blunt at the head, thinning to the tail; a flat-headed catfish keeps its height forward
  const base = Math.pow(Math.max(0, 1 - u * u), S.flat ? 0.35 : 0.55) * (0.5 + 0.5 * Math.min(1, (u + 1.15) / 1.4));
  if (S.snout && x > S.a - 2) return Math.max(0, S.b * 0.25 * (1 - (x - S.a + 2) / (S.snout + 2)));
  return S.b * base;
}
function tail(g, S, x0, y0, flap) {
  const F = S.fin, a = S.clear ?? 1, h = S.b * 1.05, s = 1 + flap * 0.18;
  const col = (x, y) => (Math.floor((y - y0) * 0.9) % 2 === 0 ? F[2] : F[3]);
  if (S.tail === "fork") g.poly([[x0 + 2, y0 - 1.5], [x0 - 8 * s, y0 - h], [x0 - 5 * s, y0], [x0 - 8 * s, y0 + h], [x0 + 2, y0 + 1.5]], col, a);
  else if (S.tail === "round") g.poly([[x0 + 2, y0 - 1.5], [x0 - 5 * s, y0 - h * 0.8], [x0 - 8 * s, y0], [x0 - 5 * s, y0 + h * 0.8], [x0 + 2, y0 + 1.5]], col, a);
  else if (S.tail === "shark") g.poly([[x0 + 2, y0 - 1], [x0 - 10 * s, y0 - h * 1.25], [x0 - 4 * s, y0 + 0.5], [x0 - 6 * s, y0 + h * 0.6], [x0 + 2, y0 + 1.5]], col, a);
  else if (S.tail === "fan") {
    for (let k = -3; k <= 3; k++) {
      const ang = k * 0.32, L = 10 + (3 - Math.abs(k)) * 1.5;
      g.line(x0 + 1, y0, x0 - Math.cos(ang) * L * s, y0 + Math.sin(ang) * L * 1.1, F[k % 2 ? 2 : 3], a);
    }
    g.poly([[x0 + 2, y0 - 2], [x0 - 9 * s, y0 - h * 1.15], [x0 - 7 * s, y0], [x0 - 9 * s, y0 + h * 1.15], [x0 + 2, y0 + 2]], (x, y) => (Math.floor(Math.atan2(y - y0, x - x0) * 6) % 2 ? F[2] : F[3]), 0.85 * a);
  } else if (S.tail === "plume") {
    // the phoenix fish: long feathered streamers, gold at the root, flame at the tips
    for (let k = -2; k <= 2; k++) {
      const pts = [];
      for (let i = 0; i <= 18; i++) pts.push([x0 + 1 - i * 1.1 * s, y0 + k * (1.2 + i * 0.28) + Math.sin(i * 0.4 + flap * 2 + k) * 1.2]);
      g.tube(pts, (u) => 1.6 * (1 - u * 0.7), (u) => (u < 0.3 ? R.gold[3] : u < 0.7 ? R.flame[3] : R.flame[2]));
    }
  }
}
function dorsal(g, S, bend, flap) {
  const F = S.fin, a = S.clear ?? 1, top = (x) => -half(S, x) + bend(x) + 0.8;
  const fin = (x0, x1, h, col = F) => g.shade(x0, top(x0) - h - 1, x1, top((x0 + x1) / 2) + 1, (x, y) => {
    const u = (x - x0) / (x1 - x0), hh = h * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (S.dorsal === "spiny" ? 0.7 + 0.3 * Math.abs(Math.sin(x * 1.4)) : 1);
    if (y < top(x) - hh || y > top(x)) return 0;
    return Math.floor(x) % 2 ? col[2] : col[3];
  });
  const A = S.a;
  if (S.dorsal === "high") fin(-A * 0.2, A * 0.3, S.b * 0.7);
  else if (S.dorsal === "low") fin(-A * 0.45, A * 0.1, 3.5);
  else if (S.dorsal === "long") fin(-A * 0.7, A * 0.35, S.b * 0.7);
  else if (S.dorsal === "spiny") fin(-A * 0.5, A * 0.35, S.b * 0.8);
  else if (S.dorsal === "sail") fin(-A * 0.75, A * 0.4, S.b * 0.85 + flap * 0.5);
  void a;
}

// ---------------------------------------------------------------- the ones that aren't fish
function boot(g, t) {
  const L = R.leather;
  g.shade(-10, -12, 1, 8, (x, y) => (x < -9 ? L[1] : x > 0 ? L[1] : y < -11 ? L[3] : L[2]));
  g.shade(-10, 2, 12, 9, (x, y) => {
    if (x > 8 && y < 4 + (x - 8) * 0.6) return 0;
    return y > 7.5 ? L[0] : y < 3 ? L[3] : L[2];
  });
  g.shade(-11, -13, 2, -11, () => L[3]);
  // a hole in the toe and a water drip
  g.ellipse(6, 5, 1.6, 1.2, L[0]);
  for (const x of [-7, -4, -1]) g.set(x, -6, L[0]);
  const d = (t * 1.6) % 1;
  g.set(3, 10 + d * 6, hex("#8ac8f0"));
}
function weed(g, t) {
  const W = R.weed;
  for (let k = -3; k <= 3; k++) {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([k * 3 + Math.sin(i * 0.6 + t * TAU + k) * (i * 0.3), 10 - i * 2.2 + Math.abs(k) * 0.8]);
    g.tube(pts, (u) => 1.6 * (1 - u * 0.6), (u, v) => (v > 0.6 ? W[1] : u > 0.7 ? W[4] : W[k % 2 ? 2 : 3]));
  }
  g.ellipse(0, 10, 7, 2.5, R.mud[2]);
}
function turtle(g, t, flap) {
  const J = R.jade, S = R.cream, swing = flap * 2;
  // flippers, the head, the tail
  g.poly([[6, 4], [14, 9 + swing], [9, 9 + swing], [3, 6]], (x, y) => (y < 6 ? S[2] : S[1]));
  g.poly([[-6, 4], [-13, 8 - swing], [-9, 9 - swing], [-3, 6]], (x, y) => (y < 6 ? S[2] : S[1]));
  g.ellipse(16, 0, 4.2, 3.2, (nx, ny) => lit(S, nx, ny, 2));
  g.ellipse(17.5, -0.8, 0.9, 0.9, INK);
  g.poly([[-15, 1], [-20, 3], [-15, 4]], S[1]);
  // the shell: a dome of jade plates with gold rims
  g.shade(-16, -11, 15, 5, (x, y) => {
    const nx = x / 15.5, ny = (y + 2) / 9.5;
    if (y > 4 || nx * nx + ny * ny > 1) return 0;
    if (y > 2.5) return R.gold[2];
    const hx = Math.floor((x + 20) / 7), hy = Math.floor((y + 14 + (hx % 2) * 3) / 6);
    const ex = ((x + 20) % 7 < 0.9) || ((y + 14 + (hx % 2) * 3) % 6 < 0.9);
    return ex ? R.gold[ny < -0.4 ? 3 : 1] : lit(J, nx, ny, 2 + ((hx + hy) % 2 ? 0 : 0));
  });
}
function chest(g, t) {
  const W = R.wood, Gd = R.gold;
  g.shade(-13, -2, 12, 10, (x, y) => (y > 9 ? W[0] : x < -12 ? W[3] : x > 11 ? W[1] : Math.floor(y) % 4 === 0 ? W[1] : W[2]));
  // the lid ajar: light spills from inside
  g.poly([[-13, -2], [-12, -9], [11, -12], [12, -4]], (x, y) => (y < -9 ? W[4] : W[3]));
  for (const x of [-9, 7]) g.shade(x, -11, x + 1.6, 10, () => Gd[2]);
  g.shade(-13, 3, 12, 4.4, () => Gd[1]);
  g.shade(-2, 1, 1, 6, () => Gd[3]);
  g.set(-0.5, 4, INK);
  g.shade(-11, -4, 10, -2.5, (x) => (Math.sin(x * 1.3 + t * TAU) > 0 ? Gd[4] : Gd[3]));
  // weed on it from the bottom of the lake
  for (let i = 0; i < 6; i++) g.set(-13 + i * 0.6, 6 - i, R.weed[3]);
}

export function draw(p, t, o) {
  const g = G, look = o.look ?? "chep", D = meta.duration, ph = o.still ? 0 : (t / D) * TAU;
  g.clear();
  const flap = Math.sin(ph * 2);
  // flopping on the line: the body curls one way and the other; swimming: a gentle wave runs down it
  const S = SPEC[look];
  if (look === "ung") boot(g, t);
  else if (look === "rong") weed(g, t);
  else if (look === "quy") turtle(g, t, flap);
  else if (look === "ruong") chest(g, t);
  else {
    const spec = S ?? SPEC.chep;
    const bend = o.flop ? (x) => Math.sin(ph * 2) * 5 * Math.pow((x - spec.a * 0.3) / spec.a, 2) * Math.sign(spec.a * 0.3 - x || 1) : (x) => Math.sin(ph + x * 0.18) * 0.8 * Math.max(0, -x / spec.a);
    fish(g, spec, t, bend, flap);
  }
  const K = hex(o.outline ?? meta.options.outline);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.45)));
  g.draw(p, 1, 0, 0);
  // spirit fish shine, and glints run over them
  const glow = S?.glow ?? (look === "quy" ? "#6af0b0" : look === "ruong" ? "#ffd860" : null);
  if (glow) {
    const c = hex(glow), pulse = 0.5 + 0.5 * Math.sin(ph);
    p.glow(0, 0, (S?.a ?? 14) + 10, c, 0.14 + 0.08 * pulse);
    if (!o.still) {
      const gx = ((t / D) * 2 % 1) * (S?.a ?? 14) * 2.4 - (S?.a ?? 14) * 1.2;
      if (g.get(gx, -3)) (p.glow(gx, -2, 4, WHITE, 0.35), p.dot(gx, -3, WHITE, 0.8));
    }
  }
}
