import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Wedding ring",
  desc: "Three wedding rings, a glint sweeping round the band, the stone sparkling: silver and jade, twin gold bands and a ruby, rose gold and a star diamond.",
  tags: ["love", "ring", "wedding", "jewel", "icon", "item", "loop"],
  size: [32, 32],
  origin: [16, 16],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { ring: "dongtam", outline: "#140c18" },
};

/** The rings: dongtam (Đồng Tâm: silver, a jade stone), uyenuong (Uyên Ương: two gold bands, a ruby), thienduyen (Thiên Duyên: rose gold, a star diamond). */
export const RINGS = ["dongtam", "uyenuong", "thienduyen"];

const H = (a) => a.map(hex);
const SILVER = H(["#2a3040", "#5a6478", "#9aa4b8", "#d0d8e6", "#ffffff"]);
const GOLD = H(["#5a3404", "#a86e10", "#e8b028", "#ffe070", "#fff8d0"]);
const ROSEG = H(["#4a1a1a", "#8a3e3a", "#d07a6a", "#f4b4a0", "#fff0e8"]);
const JADE = H(["#06301e", "#147a4a", "#2ec07a", "#7af0b4", "#e0fff0"]);
const RUBY = H(["#3a0410", "#8a0c24", "#e0203c", "#ff6a7a", "#ffd0d8"]);
const DIAM = H(["#3a4a8a", "#6a8ae0", "#a8d0ff", "#e8f6ff", "#ffffff"]);
const G = new Grid(-16, -16, 32, 32);

/** A band seen at a tilt: an ellipse ring, lit from the top left; the glint is the angle (radians) where it shines. */
function band(g, cx, cy, rx, ry, w, C, glint) {
  g.shade(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = Math.hypot(nx, ny);
    const inner = Math.hypot((x - cx) / (rx - w), (y - cy) / (ry - w * 0.7));
    if (d > 1 || inner < 1) return 0;
    const a = Math.atan2(ny, nx);
    let da = Math.abs(((a - glint + Math.PI * 3) % TAU) - Math.PI);
    if (da < 0.22) return C[4];
    if (da < 0.45) return C[3];
    // the band's far side (top) a step darker: it's seen from inside
    const far = ny < -0.2 && inner < 1.25;
    return far ? C[1] : lit(C, nx, ny, 2);
  });
}

const DRAW = {
  // Đồng Tâm Giới: a silver band, a round jade cabochon set in four prongs
  dongtam(g, u) {
    band(g, 0, 4, 11, 7, 2.6, SILVER, u * TAU - Math.PI / 2);
    g.ellipse(0, -5, 4.2, 3.2, SILVER[2]);
    g.ellipse(0, -6, 3.4, 3, (nx, ny) => lit(JADE, nx, ny, 2));
    g.set(-1, -7.5, JADE[4]);
    for (const [x, y] of [[-3, -8], [3, -8], [-3, -4], [3, -4]]) g.set(x, y, SILVER[3]);
  },
  // Uyên Ương Giới: two gold bands crossing, a heart-cut ruby where they meet
  uyenuong(g, u) {
    band(g, -3, 4, 9, 6, 2.2, GOLD, u * TAU);
    band(g, 3.5, 5, 9, 6, 2.2, GOLD, u * TAU + Math.PI);
    const cx = 0, cy = -4;
    g.ellipse(cx - 1.8, cy - 1, 2.4, 2.4, (nx, ny) => lit(RUBY, nx, ny, 2));
    g.ellipse(cx + 1.8, cy - 1, 2.4, 2.4, (nx, ny) => lit(RUBY, nx, ny, 2));
    g.poly([[cx - 4, cy], [cx + 4, cy], [cx, cy + 4.5]], (x, y) => (x < cx ? RUBY[2] : RUBY[1]));
    g.set(cx - 2, cy - 2, RUBY[4]);
    for (const x of [-4.5, 4.5]) g.set(cx + x, cy + 1, GOLD[3]);
  },
  // Thiên Duyên Giới: rose gold, a tall star diamond in a crown setting, small stones on the shoulders
  thienduyen(g, u) {
    band(g, 0, 5, 11, 6.5, 2.6, ROSEG, u * TAU - Math.PI / 2);
    // small stones along the front of the band
    for (const x of [-5, 0, 5]) g.ellipse(x, 11, 1.2, 1, (nx, ny) => lit(DIAM, nx, ny, 3));
    // the crown: four thin prongs rising from the band to hold the stone
    g.poly([[-3, -1], [3, -1], [2, 1], [-2, 1]], ROSEG[2]);
    for (const x of [-3, -1, 1, 3]) g.line(x, -1, x * 1.3, -5, x < 0 ? ROSEG[3] : ROSEG[2]);
    // the diamond: a large kite of facets above it
    const cy = -9;
    g.poly([[-5, cy], [0, cy - 5], [5, cy], [0, cy + 5]], (x, y) => {
      const f = (x < 0 ? 0 : 1) + (y < cy ? 0 : 2);
      return [DIAM[3], DIAM[2], DIAM[2], DIAM[1]][f];
    });
    g.line(-5, cy, 5, cy, DIAM[4]);
    g.set(-1, cy - 2, DIAM[4]);
  },
};

export function draw(p, t, o) {
  const ring = DRAW[o.ring] ? o.ring : "dongtam", u = t / meta.duration;
  const K = hex(o.outline ?? meta.options.outline);
  const bob = Math.round(Math.sin(u * TAU) * 0.6);
  G.clear();
  DRAW[ring](G, u);
  G.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.45)));
  const glow = { dongtam: JADE[3], uyenuong: RUBY[3], thienduyen: DIAM[3] }[ring];
  p.glow(0, -5, ring === "thienduyen" ? 14 : 10, glow, (ring === "thienduyen" ? 0.18 : 0.1) + 0.05 * Math.sin(u * TAU * 2));
  G.draw(p, 1, 0, bob);
  // the stone's sparkle: a four-pointed star that flares and fades, twice a cycle for the diamond
  const sy = { dongtam: -7, uyenuong: -6, thienduyen: -10 }[ring] + bob, sx = { dongtam: -1, uyenuong: -2, thienduyen: -1 }[ring];
  const n = ring === "thienduyen" ? 2 : 1, s = Math.max(0, Math.sin(u * TAU * n)), k = s > 0.6 ? (s - 0.6) / 0.4 : 0;
  if (k > 0) {
    const L = ring === "thienduyen" ? 4 : 3;
    for (let i = 1; i <= L; i++) {
      const a = k * (1 - i / (L + 1));
      p.dot(sx + i, sy, hex("#ffffff"), a), p.dot(sx - i, sy, hex("#ffffff"), a), p.dot(sx, sy + i, hex("#ffffff"), a), p.dot(sx, sy - i, hex("#ffffff"), a);
    }
    p.px(sx, sy, hex("#ffffff"));
  }
  // Thiên Duyên: little star motes circling it
  if (ring === "thienduyen")
    for (let i = 0; i < 3; i++) {
      const a = u * TAU + (i / 3) * TAU, x = Math.cos(a) * 12, y = 2 + Math.sin(a) * 5;
      p.dot(x, y + bob, i % 2 ? DIAM[3] : GOLD[3], Math.sin(a) > -0.2 ? 1 : 0.4);
    }
}
