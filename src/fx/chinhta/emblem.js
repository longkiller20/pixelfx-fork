import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";

export const meta = {
  name: "Chính Tà emblem",
  desc: "The two sides' emblems: side c a golden sun, rays turning, an azure sword before it; side t a blood-red crescent in violet demon fire, a slit eye opening in its hollow.",
  tags: ["chinhta", "faction", "emblem", "icon", "ui", "sun", "moon", "sword", "loop"],
  size: [32, 32],
  origin: [16, 16],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { side: "c" },
};

const H = (a) => a.map(hex);
const GOLD = H(["#4a2a04", "#9a5a0a", "#d8901a", "#f6c440", "#ffe890", "#fffbe0"]);
const SKY = H(["#0a1a4a", "#1a3a8a", "#2a6ad0", "#6aaaf8", "#c8e8ff", "#ffffff"]);
const BLOOD = H(["#1a0204", "#4a0610", "#8a0e1c", "#c41a2a", "#ee4a4a", "#ff9a8a"]);
const AMBER = H(["#5a2a00", "#c87a0a", "#ffd23a", "#fff6a0"]);
const VIOLET = H(["#12041e", "#2e0a4a", "#5a1a8a", "#9a3ad0", "#d08aff"]);
const K = hex("#0a0408");

const G = new Grid(-16, -16, 32, 32);

function sun(p, t) {
  const u = (t / meta.duration) % 1;
  G.clear();
  // the rays: 12 around, every other one long, turning a step every loop
  const turn = u * (TAU / 6);
  for (let i = 0; i < 12; i++) {
    const a = turn + (i * TAU) / 12, L = i % 2 ? 13.5 : 11.5;
    for (let r = 9; r <= L; r += 0.5) {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      G.set(x, y, r > L - 1.2 ? GOLD[2] : GOLD[3]);
      if (i % 2) G.set(x + Math.cos(a + 1.57) * 0.8, y + Math.sin(a + 1.57) * 0.8, GOLD[2]);
    }
  }
  // the disc, lit from the top left
  G.shade(-9, -9, 9, 9, (x, y) => {
    const d = Math.hypot(x, y);
    if (d > 8.6) return 0;
    const l = Math.hypot(x + 3, y + 3.5);
    return l < 3 ? GOLD[5] : l < 6.5 ? GOLD[4] : d > 7.4 ? GOLD[2] : GOLD[3];
  });
  G.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, GOLD[0], 0.6)));
  p.glow(0, 0, 15, GOLD[3], 0.16 + 0.06 * Math.sin(u * TAU));
  G.draw(p, 1, 0, 0);
  // the sword upright before it: blade, guard, grip, pommel
  const glint = Math.floor(u * 40) - 20;
  for (let y = -14; y <= 6; y++) {
    const w = y < -12 ? 0 : 1;
    for (let x = -w; x <= w; x++) {
      const c = y === glint || y === glint + 1 ? SKY[5] : x < 0 ? SKY[4] : x > 0 ? SKY[2] : SKY[3];
      p.dot(x, y, c);
    }
    p.dot(-w - 1, y, K);
    p.dot(w + 1, y, K);
  }
  p.dot(0, -15, K);
  for (let x = -5; x <= 5; x++) p.dot(x, 7, Math.abs(x) > 3 ? GOLD[2] : GOLD[4]), p.dot(x, 8, GOLD[1]);
  p.dot(-6, 7, K), p.dot(6, 7, K), p.dot(-6, 8, K), p.dot(6, 8, K);
  for (let y = 9; y <= 12; y++) p.dot(0, y, y % 2 ? SKY[1] : SKY[2]), p.dot(-1, y, K), p.dot(1, y, K);
  p.dot(0, 13, GOLD[4]), p.dot(-1, 13, GOLD[2]), p.dot(1, 13, GOLD[2]), p.dot(0, 14, K);
}

function moon(p, t) {
  const u = (t / meta.duration) % 1;
  G.clear();
  // the demon fire: violet tongues rising from the moon's back, each tapering and leaning up, flickering in turn
  for (const pass of [0, 1])
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.62 + (i / 8) * Math.PI * 1.1, f = 0.5 + 0.5 * Math.sin(u * TAU * 2 + i * 2.1);
      const len = 4 + 3.5 * f + (i % 2) * 1.5, bx = Math.cos(a) * 8.5, by = Math.sin(a) * 8.5;
      const dx = Math.cos(a), dy = Math.sin(a) - 0.9, dl = Math.hypot(dx, dy);
      for (let s2 = 0; s2 <= len; s2 += 0.5) {
        const k = s2 / len, r = (pass ? 1.1 : 2) * (1 - k * 0.85), sway = Math.sin(u * TAU * 2 + i + k * 3) * k * 1.2;
        G.ellipse(bx + (dx / dl) * s2 + sway, by + (dy / dl) * s2, r, r, pass ? (k > 0.6 ? VIOLET[3] : VIOLET[4]) : k > 0.7 ? VIOLET[1] : VIOLET[2]);
      }
    }
  // the crescent: a disc with a disc taken from its right
  G.shade(-11, -11, 11, 11, (x, y) => {
    const d = Math.hypot(x, y), cut = Math.hypot(x - 5.2, y - 1.6);
    if (d > 10 || cut < 7.6) return 0;
    const l = Math.hypot(x + 4, y + 4);
    return l < 2.5 ? BLOOD[5] : l < 6 ? BLOOD[4] : d > 8.4 ? BLOOD[1] : d > 7 ? BLOOD[2] : BLOOD[3];
  });
  G.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, BLOOD[0], 0.6)));
  p.glow(0, 0, 15, BLOOD[3], 0.16 + 0.06 * Math.sin(u * TAU));
  G.draw(p, 1, 0, 0);
  // the demon eye in the hollow: an amber almond with a black slit, opening and shutting (shut at the loop's start)
  const open = Math.max(0, Math.min(1, Math.sin(u * Math.PI) * 1.8));
  const ex = 5, ey = 1, hh = open * 3;
  for (let x = -4; x <= 4; x++) {
    const h = Math.round(hh * (1 - (x * x) / 22));
    for (let y = -h; y <= h; y++) p.dot(ex + x, ey + y, Math.abs(x) <= 0 && h > 0 ? K : y < 0 ? AMBER[3] : AMBER[2]);
    p.dot(ex + x, ey - h - 1, K);
    p.dot(ex + x, ey + h + 1, K);
  }
  if (hh >= 2) p.dot(ex - 2, ey - 1, hex("#ffffff"));
  p.dot(ex - 5, ey, K), p.dot(ex + 5, ey, K);
  p.glow(ex, ey, 6, AMBER[2], 0.14 * open);
}

export function draw(p, t, o) {
  if ((o.side ?? meta.options.side) === "t") moon(p, t);
  else sun(p, t);
}
