import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Fishing buttons",
  desc: "Round fishing-control buttons: a big gold and jade ring around rippling water coloured by the moment, small bronze ones, and their icons.",
  tags: ["fishing", "ui", "button", "icon", "ring", "water", "loop"],
  size: [48, 48],
  origin: [24, 24],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { piece: "big", icon: "cast", mood: "idle", tone: "gold", dot: "#4ade80", outline: "#140c18" },
};

/** The pieces: big (48 px: ring, water, icon) and small (28 px: ring and icon). */
export const PIECES = ["big", "small"];
/** The icons: cast, strike, reel (the big one's three moments), shop, khu, stop (the small ones). */
export const ICONS = ["cast", "strike", "reel", "shop", "khu", "stop"];
/** The big one's water: idle (teal under the moon), wait (deep night blue), bite (red and gold), reel (green). */
export const MOODS = ["idle", "wait", "bite", "reel"];

const H = (a) => a.map(hex);
const GOLD = H(["#4a2804", "#8a5a10", "#c8901e", "#f0c050", "#fff0a8"]);
const BRONZE = H(["#2a1608", "#5a3414", "#946028", "#c89048", "#f0d090"]);
const JADE = H(["#06221a", "#11483a", "#1f7a5a", "#48b888", "#a8f0c8"]);
const CORAL = H(["#3a0a10", "#7a1e22", "#b84030", "#e87a50", "#ffd0a0"]);
const STEEL = H(["#262c3a", "#4a5268", "#8a92a8", "#c0c8d8", "#f0f4fa"]);
const BAMBOO = H(["#3a3a10", "#6a7020", "#a0a83a", "#d0d070", "#f0f0b0"]);
const STRAW = H(["#3a2410", "#6a4820", "#a07838", "#d0a858", "#f0d898"]);
const LEAF = H(["#0a2414", "#1a4a28", "#2e7a3a", "#5aac58", "#a8e090"]);
const RED = H(["#3a0610", "#7a1420", "#c8303a", "#f06a5a", "#ffc8b0"]);
const WHITE = hex("#ffffff");
const WATER = {
  idle: H(["#04121c", "#0a2a3a", "#145060", "#2a8a8a", "#7ae0d0"]),
  wait: H(["#040818", "#0c1638", "#1c2e6a", "#3a5ab0", "#9ab8ff"]),
  bite: H(["#1a0408", "#4a0c10", "#8a2014", "#d05a20", "#ffd060"]),
  reel: H(["#04140a", "#0a3018", "#145a2a", "#2e9a48", "#a8ffb0"]),
};
const TONE = { gold: GOLD, jade: JADE, coral: CORAL };

const BIG = new Grid(-24, -24, 48, 48), ICON = new Grid(-16, -16, 32, 32);

/** The big ring: a gold rim, a band of carved jade with eight pearls, a lip of shadow, and the pool inside. */
function bigRing(g, t, W) {
  const u = t / meta.duration;
  g.shade(-24, -24, 23, 23, (x, y) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x), nx = x / (r || 1), ny = y / (r || 1);
    if (r > 23.2) return 0;
    if (r > 21.4) return lit(GOLD, nx, ny, 2);
    if (r > 20.6) return GOLD[1];
    if (r > 17.2) {
      // the jade band: a carved wave running round it, lit from the top left
      const wave = Math.sin(a * 8 + (r - 19) * 1.6) > 0.55;
      return wave ? lit(JADE, nx, ny, 3) : lit(JADE, nx, ny, 1);
    }
    if (r > 16.2) return GOLD[r > 16.7 ? 2 : 1];
    // the pool: darker toward the rim, lit a step at the top left; one ripple ring spreading out from the middle
    const d = r / 16.2, ring = Math.abs(d - (0.25 + (u % 1) * 0.7)) < 0.06;
    const light = -nx * 0.5 - ny * 0.7;
    const base = d > 0.85 ? 0 : d > 0.55 ? 1 : 2;
    const c = W[Math.min(3, base + (light > 0.45 && d > 0.4 ? 1 : 0))];
    return ring && d < 0.95 ? mix(c, W[4], 0.45 * (1 - u)) : c;
  });
  // the moon's glint on the water, top left: a short broken line that sways
  for (let i = 0; i < 3; i++) {
    const w = 1.5 - i * 0.5, y = -10 + i * 1.6, x = -9 + Math.sin(u * TAU + i) * 0.6;
    g.line(x - w, y, x + w, y, i ? W[3] : W[4]);
  }
  // pearls in the band
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8, x = Math.cos(a) * 19, y = Math.sin(a) * 19;
    g.set(x, y, k % 2 ? GOLD[4] : hex("#f8f0ff"));
  }
}

/** A small ring: a rim of the tone over a darker step, a plum well inside. */
function smallRing(g, C) {
  g.shade(-14, -14, 13, 13, (x, y) => {
    const r = Math.hypot(x, y), nx = x / (r || 1), ny = y / (r || 1);
    if (r > 13.6) return 0;
    if (r > 11.4) return lit(C, nx, ny, 2);
    if (r > 10.6) return C[0];
    const d = r / 10.6;
    return hex(d > 0.8 ? "#120a1e" : d > 0.45 ? "#1c1230" : "#261a40");
  });
  // a bright notch at the top, a spark of light on the rim
  g.set(0, -12.5, C[4]);
  g.set(-8, -9, C[4]);
}

// ---- the icons, drawn at s (1: 22 px for the big button; 0.66: about 15 px for a small one), centred
const ICON_DRAW = {
  // a bamboo rod over the shoulder, its line arcing out to a red and white float
  cast(g, t, s) {
    const x0 = -9 * s, y0 = 9 * s, x1 = 8 * s, y1 = -9 * s;
    g.tube([[x0, y0], [x1, y1]], (u) => (1.8 - u * 1.1) * Math.max(0.7, s), (u, v) => (v > 0.6 ? BAMBOO[1] : u > 0.8 ? BAMBOO[3] : BAMBOO[2]));
    g.tube([[x0, y0], [x0 + 5 * s, y0 - 5 * s]], 2 * Math.max(0.7, s), (u, v) => (v > 0.7 ? STRAW[0] : Math.floor(u * 6) % 2 ? RED[1] : RED[2]));
    const bob = Math.sin((t / meta.duration) * TAU * 2) * s;
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      g.set(x1 + u * 3 * s, y1 + u * u * 14 * s, hex("#e8ecf4"), 0.85);
    }
    const fx = x1 + 3 * s, fy = y1 + 15 * s + bob;
    g.ellipse(fx, fy - 1.2 * s, 1.6 * s + 0.4, 1.6 * s + 0.4, (nx, ny) => (ny < 0 ? lit(RED, nx, ny, 2) : WHITE));
  },
  // a steel hook with its barb, snapping up, and sparks round it
  strike(g, t, s) {
    const u = t / meta.duration, k = 1 + Math.max(0, Math.sin(u * TAU * 3)) * 0.12;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (0.05 + (i / 12) * 1.05);
      pts.push([Math.cos(a) * 5 * s * k, 3 * s + Math.sin(a) * 5 * s * k]);
    }
    g.tube([[5 * s * k, -9 * s], [5 * s * k, 3 * s], ...pts], 1.1 * Math.max(0.8, s), (uu, v) => (v > 0.6 ? STEEL[1] : uu < 0.4 ? STEEL[3] : STEEL[2]));
    g.ellipse(5 * s * k, -9.5 * s, 1.6 * s + 0.3, 1.6 * s + 0.3, (nx, ny) => lit(GOLD, nx, ny, 2));
    // the barb
    const [bx, by] = pts.at(-1);
    g.line(bx, by, bx + 2 * s, by - 2 * s, STEEL[3]);
    // the sparks
    for (const [x, y] of [[-8, -7], [-9, 0], [8, -3]]) {
      const on = Math.sin(u * TAU * 3 + x) > 0;
      g.set(x * s, y * s, on ? GOLD[4] : GOLD[3]);
      if (on && s > 0.8) g.set(x * s + 1, y * s, GOLD[3]), g.set(x * s - 1, y * s, GOLD[3]), g.set(x * s, y * s - 1, GOLD[3]), g.set(x * s, y * s + 1, GOLD[3]);
    }
  },
  // a reel, its spool turning and its handle going round
  reel(g, t, s) {
    const u = t / meta.duration, a0 = u * TAU * 2;
    g.ellipse(0, 0, 8 * s, 8 * s, (nx, ny) => lit(STEEL, nx, ny, 2));
    g.ellipse(0, 0, 5.5 * s, 5.5 * s, (nx, ny) => lit(BRONZE, nx, ny, 2));
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k / 3) * TAU;
      g.line(0, 0, Math.cos(a) * 5 * s, Math.sin(a) * 5 * s, BRONZE[1]);
    }
    g.ellipse(0, 0, 1.6 * s + 0.4, 1.6 * s + 0.4, STEEL[4]);
    const hx = Math.cos(a0) * 9 * s, hy = Math.sin(a0) * 9 * s;
    g.line(0, 0, hx, hy, STEEL[2]);
    g.ellipse(hx, hy, 1.8 * s + 0.3, 1.8 * s + 0.3, (nx, ny) => lit(RED, nx, ny, 2));
  },
  // a straw creel with a lid, a fish's tail out of the top
  shop(g, t, s) {
    const w = 8 * s, h0 = 7 * s;
    g.poly([[-w, -1 * s], [w, -1 * s], [w - 1.5 * s, h0], [-w + 1.5 * s, h0]], (x, y) => {
      const row = Math.floor((y + 1 * s) / Math.max(1, 1.6 * s)), col = Math.floor((x + w) / Math.max(1, 2 * s));
      return (row + col) % 2 ? STRAW[2] : STRAW[3];
    });
    g.line(-w, -1 * s, w, -1 * s, STRAW[1]);
    g.line(-w + 1.5 * s, h0, w - 1.5 * s, h0, STRAW[0]);
    // the strap
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([-w + 1 + (i / 10) * (2 * w - 2), -1 * s - Math.sin((i / 10) * Math.PI) * 8 * s]);
    g.tube(pts, 0.6, STRAW[1]);
    // the tail, flicking
    const f = Math.sin((t / meta.duration) * TAU * 2) * 1.2 * s;
    g.poly([[2 * s, -1 * s], [4 * s, -5 * s], [7 * s + f, -8 * s], [3 * s + f, -7 * s], [0, -1 * s]], (x, y) => (y < -5 * s ? hex("#9ad0f0") : hex("#5a90c0")));
  },
  // a lily pad on the water with a pearl the colour of how full the Khu is
  khu(g, t, s, o) {
    const C = hex(o.dot ?? meta.options.dot);
    g.ellipse(0, 1 * s, 8.5 * s, 7 * s, (nx, ny) => {
      const a = Math.atan2(ny, nx);
      if (a > -0.25 && a < 0.35) return 0;
      return lit(LEAF, nx, ny, 2);
    });
    // veins
    for (const a of [-2.4, -1.4, -0.4 + Math.PI, 1.6, 2.6]) g.line(0, 1 * s, Math.cos(a) * 6 * s, 1 * s + Math.sin(a) * 5 * s, LEAF[1]);
    const r = 3.2 * s + 0.4;
    g.ellipse(-1 * s, -1.5 * s, r, r, (nx, ny) => (nx * nx + ny * ny < 0.2 && nx < 0 && ny < 0 ? mix(C, WHITE, 0.7) : ny > 0.3 ? mix(C, hex("#000000"), 0.35) : C));
  },
  // the float with an arrow curling back: reel in
  stop(g, t, s) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI * 0.15 - (i / 14) * Math.PI * 1.25;
      pts.push([Math.cos(a) * 7 * s, Math.sin(a) * 7 * s]);
    }
    g.tube(pts, 0.9 * Math.max(0.8, s), (u) => (u > 0.5 ? CORAL[3] : CORAL[2]));
    const [ex, ey] = pts.at(-1);
    g.poly([[ex - 3 * s, ey - 1 * s], [ex + 3 * s, ey - 1.5 * s], [ex + 0.5 * s, ey + 3.5 * s]], CORAL[3]);
    const bob = Math.sin((t / meta.duration) * TAU) * 0.6 * s;
    g.ellipse(0, bob, 3 * s + 0.4, 3 * s + 0.4, (nx, ny) => (ny < 0 ? lit(RED, nx, ny, 2) : WHITE));
    g.line(0, -3.5 * s + bob, 0, -6 * s + bob, STEEL[3]);
  },
};

export function draw(p, t, o) {
  const K = hex(o.outline ?? meta.options.outline), big = o.piece !== "small";
  const mood = WATER[o.mood] ? o.mood : "idle", icon = ICON_DRAW[o.icon] ? o.icon : big ? "cast" : "shop";
  const u = t / meta.duration;
  if (big) {
    BIG.clear();
    bigRing(BIG, t, WATER[mood]);
    BIG.outline(K);
    BIG.draw(p, 1, 0, 0);
    p.glowRing(0, 0, 19, 3, WATER[mood][4], mood === "bite" ? 0.18 + 0.12 * Math.max(0, Math.sin(u * TAU * 3)) : 0.06);
  } else {
    BIG.clear();
    smallRing(BIG, TONE[o.tone] ?? GOLD);
    BIG.outline(K);
    BIG.draw(p, 1, 0, 0);
  }
  ICON.clear();
  ICON_DRAW[icon](ICON, t, big ? 1 : 0.74, o);
  ICON.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.45)));
  ICON.draw(p, 1, 0, big ? 1 : 0);
  if (icon === "khu") p.glow(-1, -1, 6, hex(o.dot ?? meta.options.dot), 0.2);
}
