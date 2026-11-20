import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Fishing gear",
  desc: "Icons for a fishing game's rods and baits, 28 px, shaded and outlined: bamboo, bronze, jade and golden dragon rods; earthworms, shrimp, spirit-rice balls, peach blossom.",
  tags: ["fishing", "icon", "rod", "bait", "item", "ui"],
  size: [32, 32],
  origin: [16, 16],
  duration: 1.6,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { item: "truc", outline: "#140c18" },
};

/** The items, by name: four rods (truc, dong, ngoc, long), four baits (giun, tom, linh, tien). */
export const ITEMS = ["truc", "dong", "ngoc", "long", "giun", "tom", "linh", "tien"];

const H = (a) => a.map(hex);
const BAMBOO = H(["#3a3a10", "#6a7020", "#a0a83a", "#d0d070", "#f0f0b0"]);
const BRONZE = H(["#2a2410", "#5a4a20", "#9a7a34", "#c8a858", "#ecd898"]);
const JADE = H(["#0a2a1e", "#1a5a3e", "#2a9a62", "#6ad89a", "#c8ffe0"]);
const GOLD = H(["#5a3404", "#a86e10", "#e8b028", "#ffe070", "#fff8d0"]);
const RED = H(["#4a0a10", "#8a1a24", "#c83a3a", "#f07060", "#ffc0a0"]);
const PINK = H(["#5a1430", "#a8385e", "#e8789a", "#ffb0c8", "#ffe8f0"]);
const CLAY = H(["#2a160c", "#5a3018", "#8a5028", "#b8783a", "#e0a868"]);
const RICE = H(["#5a5a6a", "#a8a8b8", "#e0e0ea", "#f8f8ff", "#ffffff"]);
const SHRIMP = H(["#5a1a0a", "#a83a1a", "#e86a3a", "#ffa070", "#ffe0c8"]);
const STEEL = H(["#2a3040", "#525a70", "#8a92a8", "#bcc4d4", "#eef2f8"]);
const LINE = hex("#e8ecf4");

/** A rod from the butt (bottom left) to the tip (top right), shaded along its length. */
function rod(g, C, wrap, ring) {
  const x0 = -11, y0 = 11, x1 = 11, y1 = -12;
  g.tube([[x0, y0], [x1, y1]], (u) => 2 - u * 1.45, (u, v) => (v > 0.6 ? C[1] : u > 0.85 ? C[3] : C[2 + (v < 0.3 ? 1 : 0)]));
  // the grip, wrapped
  g.tube([[x0, y0], [x0 + 6, y0 - 6]], 2.4, (u, v) => (v > 0.7 ? wrap[0] : Math.floor(u * 8) % 2 ? wrap[1] : wrap[2]));
  // rings along it
  for (const u of ring) g.set(x0 + (x1 - x0) * u + 1, y0 + (y1 - y0) * u, C[4]);
  // the reel
  g.ellipse(x0 + 7, y0 - 3.5, 2.6, 2.6, (nx, ny) => lit(STEEL, nx, ny, 2));
  g.set(x0 + 7, y0 - 3.5, STEEL[0]);
}

const DRAW = {
  truc(g) {
    rod(g, BAMBOO, CLAY, [0.35, 0.6, 0.85]);
    // bamboo nodes
    for (const u of [0.3, 0.52, 0.72]) g.line(-11 + 22 * u - 1, 11 - 23 * u - 1, -11 + 22 * u + 1, 11 - 23 * u + 1, BAMBOO[1]);
  },
  dong(g) {
    rod(g, BRONZE, RED, [0.35, 0.55, 0.75, 0.9]);
    for (const u of [0.42, 0.62]) g.set(-11 + 22 * u, 11 - 23 * u - 1, BRONZE[0]);
  },
  ngoc(g) {
    rod(g, JADE, GOLD, [0.3, 0.5, 0.7, 0.88]);
  },
  long(g, t) {
    rod(g, GOLD, RED, [0.3, 0.5, 0.7, 0.88]);
    // a dragon's head at the tip and its body curling round the rod
    for (let i = 0; i < 14; i++) {
      const u = 0.25 + i * 0.045, x = -11 + 22 * u + Math.sin(i * 1.2) * 2.4, y = 11 - 23 * u + Math.cos(i * 1.2) * 2.4;
      g.set(x, y, i % 2 ? RED[2] : RED[3]);
    }
    g.ellipse(9, -9.5, 2.2, 1.6, (nx, ny) => lit(RED, nx, ny, 2));
    g.set(10, -10, GOLD[4]);
    g.line(8, -11, 6, -13, GOLD[3]);
  },
  // earthworms curled in a clay dish
  giun(g, t) {
    g.ellipse(0, 7, 11, 4.5, (nx, ny) => (ny < -0.2 ? CLAY[1] : lit(CLAY, nx, ny, 2)));
    g.ellipse(0, 5.4, 9, 2.2, CLAY[0]);
    for (const [cx, cy, ph] of [[-3, 1, 0], [3, 2, 2]]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = i * 0.45 + ph + Math.sin(t * TAU + ph) * 0.3;
        pts.push([cx + Math.cos(a) * (2 + i * 0.25), cy + Math.sin(a) * (1.4 + i * 0.12) - i * 0.15]);
      }
      g.tube(pts, 1.3, (u, v) => (v > 0.6 ? PINK[1] : Math.floor(u * 10) % 3 ? PINK[2] : PINK[3]));
    }
  },
  // two shrimp
  tom(g, t) {
    for (const [cx, cy, s] of [[-2, -2, 1], [3, 5, 0.85]]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = -0.4 + i * 0.28;
        pts.push([cx + Math.cos(a) * 6 * s - 3 * s, cy + Math.sin(a) * 5 * s]);
      }
      g.tube(pts, (u) => (2.6 - u * 1.6) * s, (u, v) => (v > 0.7 ? SHRIMP[1] : Math.floor(u * 7) % 2 ? SHRIMP[2] : SHRIMP[3]));
      g.set(cx + 3 * s, cy - 1, hex("#0c0810"));
      for (let i = 0; i < 6; i++) g.set(cx + 4 * s + i, cy - 2 - i * 0.6 + Math.sin(t * TAU + i) * 0.5, SHRIMP[3]);
    }
  },
  // spirit-rice balls on a little jade dish, shining
  linh(g) {
    g.ellipse(0, 8, 11, 3.5, (nx, ny) => lit(JADE, nx, ny, 2));
    for (const [x, y] of [[-5, 3], [0, 2], [5, 3], [-2.5, -2], [2.5, -2]]) g.ellipse(x, y, 3, 3, (nx, ny) => lit(RICE, nx, ny, 2));
  },
  // a peach blossom with honeyed stamens
  tien(g, t) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU - Math.PI / 2 + Math.sin(t * TAU) * 0.05;
      g.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 4.2, 4.2, (nx, ny) => lit(PINK, nx, ny, 2));
    }
    g.ellipse(0, 0, 3.2, 3.2, (nx, ny) => lit(GOLD, nx, ny, 2));
    for (let k = 0; k < 6; k++) g.set(Math.cos(k) * 2, Math.sin(k) * 2 - 1, GOLD[4]);
  },
};

const G = new Grid(-16, -16, 32, 32);
const GLOW = { ngoc: "#6ae8a0", long: "#ffd060", linh: "#9af0ff", tien: "#ff9ac0" };

export function draw(p, t, o) {
  const g = G, item = DRAW[o.item] ? o.item : "truc";
  g.clear();
  DRAW[item](g, t);
  const K = hex(o.outline ?? meta.options.outline);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.45)));
  if (GLOW[item]) p.glow(0, 0, 14, hex(GLOW[item]), 0.12 + 0.06 * Math.sin((t / meta.duration) * TAU));
  g.draw(p, 1, 0, 0);
  // the rods' line, hanging from the tip with a hook
  if (["truc", "dong", "ngoc", "long"].includes(item)) {
    for (let i = 0; i <= 12; i++) p.dot(12, -12 + i * 1.6, LINE, 0.55);
    p.dot(12, 8, STEEL[3]), p.dot(11, 9, STEEL[3]), p.dot(10, 8, STEEL[3]);
  }
  if (item === "linh" || item === "tien") {
    const u = (t / meta.duration) % 1;
    p.dot(-6 + u * 12, -10 + Math.sin(u * TAU) * 2, hex("#ffffff"), Math.sin(u * Math.PI));
  }
}
