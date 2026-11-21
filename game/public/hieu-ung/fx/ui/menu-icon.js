import { hex, mix } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Menu icon",
  desc: "Small 20 px menu icons, shaded and outlined: character, home, sect, friends, chat, gift, alchemy, robes, scroll, trophy, help, fullscreen, gear, more, fishing, love, war.",
  tags: ["ui", "icon", "menu", "button"],
  size: [24, 24],
  origin: [12, 12],
  duration: 1,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { icon: "char", outline: "#1a1424" },
};

/** The icons, by name: what each draws (on a 20 x 20 grid, -10..9 each way). */
export const ICONS = ["char", "home", "sect", "friend", "chat", "gift", "shop", "ward", "arts", "rank", "help", "fs", "settings", "more", "fish", "love", "chinhta"];

const H = (a) => a.map(hex);
const SKIN = H(["#8a4a3a", "#d8996e", "#f6cfa8", "#ffe6cc", "#fff4e8"]);
const HAIR = H(["#120c1a", "#2a2036", "#463a58", "#62567a", "#7a6e94"]);
const BLUE = H(["#14285e", "#2a4caa", "#3f74e0", "#6fa0ff", "#b8d4ff"]);
const PINK = H(["#5a1430", "#a8385e", "#e05a8a", "#ff8ab0", "#ffd0e0"]);
const RED = H(["#5a0a14", "#a81c30", "#e8384a", "#ff6a6a", "#ffb0a0"]);
const JADE = H(["#0a3a24", "#1f7a4e", "#2fb070", "#6ae0a0", "#c0ffe0"]);
const GOLD = H(["#6a3a08", "#c88a20", "#f0c040", "#ffe27a", "#fff6c8"]);
const WOOD = H(["#3a1e0c", "#6a3a1a", "#a8682e", "#d29a5a", "#f0c890"]);
const PAPER = H(["#7a6248", "#c8b088", "#ece0c0", "#fbf4e2", "#ffffff"]);
const STEEL = H(["#2a3040", "#525a70", "#8a92a8", "#bcc4d4", "#eef2f8"]);
const PURP = H(["#2a1450", "#5a32a0", "#8a5ae0", "#b48aff", "#e0d0ff"]);
const ORNG = H(["#5a2a08", "#b8661a", "#f0a030", "#ffd070", "#fff0c0"]);
const SKY = H(["#1a3a6a", "#3a7ae0", "#7ac8f8", "#c8ecff", "#ffffff"]);
const INK = hex("#2a1a20"), WHITE = hex("#ffffff");

/** Shaded by a box's own normals: (x, y) in the box x0..x1, y0..y1 lit from the top left. */
const boxLit = (C, x0, y0, x1, y1, base = 2) => (x, y) => lit(C, ((x - x0) / Math.max(1, x1 - x0)) * 2 - 1, ((y - y0) / Math.max(1, y1 - y0)) * 2 - 1, base);
const ell = (C, base = 2) => (nx, ny) => lit(C, nx, ny, base);

const DRAW = {
  // a cultivator's bust: hair in a bun, a blue robe with a white collar and a gold clasp
  char(g) {
    g.poly([[-8, 9], [-7, 3], [-4, 1], [4, 1], [7, 3], [8, 9]], boxLit(BLUE, -8, 1, 8, 9));
    g.poly([[-2.5, 1], [0, 5], [2.5, 1]], PAPER[3]);
    g.set(0, 5, GOLD[3]), g.set(-1, 5, GOLD[2]);
    g.ellipse(0, -3.5, 4.2, 4.6, ell(SKIN));
    g.ellipse(0, -7, 4.6, 2.5, ell(HAIR));
    g.shade(-4.6, -7, -3.4, -3, () => HAIR[1]);
    g.shade(3.4, -7, 4.6, -3, () => HAIR[1]);
    g.ellipse(0, -9.4, 2, 1.4, ell(HAIR, 3));
    g.set(-1.6, -2.6, INK), g.set(1.6, -2.6, INK);
    g.set(-2.6, -1.6, PINK[3]), g.set(2.6, -1.6, PINK[3]);
  },
  // a little house: a red roof with turned-up eaves, wooden walls, a door, two windows
  home(g) {
    g.shade(-6.5, -1, 5.5, 8, boxLit(WOOD, -6, -1, 6, 8, 3));
    g.shade(-1.5, 3, 0.5, 8, (x, y) => (y < 3.6 ? WOOD[1] : x < -0.6 ? WOOD[1] : WOOD[0]));
    g.set(0, 5.5, GOLD[3]);
    for (const wx of [-5, 2.5]) g.shade(wx, 1, wx + 2, 3, (x, y) => (y < 1.6 ? SKY[3] : SKY[2]));
    g.poly([[-10, -0.5], [-8, -2.5], [-4, -7.5], [3, -7.5], [7, -2.5], [9.5, -0.5], [6, -1], [-7, -1]], (x, y) => (y < -6 ? RED[3] : y < -3 ? RED[2] : RED[1]));
    g.line(-4, -7.5, 3, -7.5, RED[4]);
    g.shade(-2, -9.5, 0.5, -7.5, () => WOOD[1]);
  },
  // a three-tier pagoda with jade roofs and a gold spire
  sect(g) {
    const tier = (y, w) => {
      g.poly([[-w - 2, y + 1], [-w, y - 1], [w - 1, y - 1], [w + 1, y + 1]], (x, yy) => (yy < y - 0.4 ? JADE[3] : JADE[1]));
      g.line(-w - 2, y + 1, -w - 2, y, JADE[2]), g.line(w + 1, y + 1, w + 1, y, JADE[2]);
    };
    g.shade(-6, 4, 5, 8, boxLit(PAPER, -6, 4, 5, 8, 2));
    g.shade(-1, 5, 0, 8, () => RED[1]);
    g.shade(-4.5, -1, 3.5, 3, boxLit(PAPER, -4, -1, 3, 3, 2));
    g.shade(-3, -5, 2, -2, boxLit(PAPER, -3, -5, 2, -2, 2));
    for (const x of [-3, 2]) g.set(x, 1, RED[2]);
    tier(4, 8);
    tier(-1, 6);
    tier(-5, 4);
    g.line(-0.5, -9.5, -0.5, -6, GOLD[2]);
    g.set(-0.5, -9.5, GOLD[4]);
  },
  // two friends side by side
  friend(g) {
    const one = (cx, C, hair, cy = 0) => {
      g.poly([[cx - 5, 9], [cx - 4.5, 4 + cy], [cx - 2, 2.5 + cy], [cx + 2, 2.5 + cy], [cx + 4.5, 4 + cy], [cx + 5, 9]], boxLit(C, cx - 5, 2.5 + cy, cx + 5, 9));
      g.ellipse(cx, -2 + cy, 3.3, 3.6, ell(SKIN));
      g.ellipse(cx, -4.2 + cy, 3.6, 2.2, ell(hair));
      g.set(cx - 1.2, -1.6 + cy, INK), g.set(cx + 1.2, -1.6 + cy, INK);
    };
    one(4, PINK, H(["#2a120a", "#5a2a1a", "#8a4a2a", "#a8683a", "#c88a5a"]), 1);
    one(-4, BLUE, HAIR);
  },
  // a speech bubble with three dots
  chat(g) {
    g.ellipse(0, -1.5, 9, 6.6, (nx, ny) => (ny > 0.55 ? PAPER[1] : nx < -0.5 && ny < -0.3 ? PAPER[4] : PAPER[3]));
    g.poly([[-5, 3], [-6.5, 8.5], [-1, 4]], PAPER[2]);
    for (const x of [-4.5, -0.5, 3.5]) g.shade(x, -2.5, x + 1.2, -0.8, () => BLUE[2]);
  },
  // a red gift box with a gold ribbon and bow
  gift(g) {
    g.shade(-7, -1, 6, 8, boxLit(RED, -7, -1, 6, 8, 2));
    g.shade(-8, -4, 7, -1, boxLit(RED, -8, -4, 7, -1, 3));
    g.shade(-1.5, -4, 0.5, 8, (x) => (x < -0.4 ? GOLD[3] : GOLD[1]));
    g.ellipse(-3, -6, 2.6, 1.8, ell(GOLD));
    g.ellipse(2, -6, 2.6, 1.8, ell(GOLD));
    g.shade(-1.5, -7, 0.5, -4.5, () => GOLD[2]);
  },
  // the alchemist's gourd, a pill beside it
  shop(g) {
    g.ellipse(-1, 3.5, 6.2, 5.6, ell(ORNG));
    g.ellipse(-1, -3.8, 3.6, 3.4, ell(ORNG));
    g.shade(-3.2, -1.2, 1.2, -0.2, () => RED[1]);
    g.shade(-2, -9.5, 0, -7, () => WOOD[2]);
    g.set(-1.5, -9.5, WOOD[3]);
    g.ellipse(6.2, 6.6, 2.2, 2.2, ell(PINK, 3));
  },
  // a hanfu robe, wide sleeves, crossed collar, gold sash
  ward(g) {
    // the sleeves hang wide from the shoulders, the skirt falls to the hem
    g.poly([[-3, -8.5], [3, -8.5], [5.5, -6.5], [9.5, -3], [9.5, 3.5], [6, 3.5], [5, 0], [6, 9], [-6, 9], [-5, 0], [-6, 3.5], [-9.5, 3.5], [-9.5, -3], [-5.5, -6.5]], (x, y) => lit(PURP, x / 9.5, y / 9, 2));
    g.line(-5.6, 0, -5, 3, PURP[1]), g.line(5.6, 0, 5, 3, PURP[1]);
    g.line(-2.5, -8.5, 1.2, -2, PAPER[3]), g.line(2.5, -8.5, -1.2, -2, PAPER[2]);
    g.shade(-5, -1, 4.5, 0.6, (x) => (x < 0 ? GOLD[3] : GOLD[2]));
    g.line(0.5, 0.6, 1.5, 4, GOLD[2]);
  },
  // a scroll of teachings: paper between red-capped rods
  arts(g) {
    g.shade(-6, -6.5, 5, 6.5, (x, y) => (x > 4 ? PAPER[1] : PAPER[3]));
    for (const y of [-4, -1.5, 1, 3.5]) g.line(-4, y, y === 1 ? 0 : 3, y, HAIR[2]);
    for (const y of [-8, 7]) {
      g.shade(-7.5, y, 6.5, y + 1.6, (x, yy) => (yy < y + 0.8 ? WOOD[3] : WOOD[1]));
      g.shade(-9, y - 0.4, -7.5, y + 2, () => RED[2]);
      g.shade(6.5, y - 0.4, 8, y + 2, () => RED[1]);
    }
  },
  // a gold trophy
  rank(g) {
    g.ellipse(0, -2, 6.5, 6.8, (nx, ny) => (ny < -0.7 ? 0 : lit(GOLD, nx, ny, 2)));
    g.shade(-6.5, -7.5, 5.5, -6, (x) => (x < -2 ? GOLD[4] : GOLD[3]));
    for (const s of [-1, 1]) {
      const cx = s * 7.4 - 0.5;
      g.shade(cx - 1, -6, cx + 1, -1, (x, y) => (Math.abs(x - cx) < 0.4 && y > -5.5 && y < -1.5 ? 0 : GOLD[s < 0 ? 3 : 1]));
    }
    g.shade(-1.5, 4, 0.5, 6, () => GOLD[1]);
    g.shade(-4.5, 6, 3.5, 8.5, boxLit(H(["#2a1608", "#5a3418", "#8a5a2a", "#b88048", "#d8a868"]), -4, 6, 3, 8.5, 2));
    g.set(-3, -4, GOLD[4]), g.set(-3, -3, GOLD[4]);
  },
  // a blue badge with a question mark
  help(g) {
    g.ellipse(0, 0, 8.5, 8.5, ell(BLUE));
    g.sprite([".www.", "w...w", "....w", "...w.", "..w..", ".....", "..w.."], { w: "#ffffff" }, -2.5, -4.5, { sx: 1, sy: 1 });
    g.sprite([".www.", "ww.ww", "...ww", "..ww.", "..ww.", ".....", "..ww."], { w: "#ffffff" }, -2.5, -4.5);
  },
  // four corners: fill the screen
  fs(g) {
    const C = JADE[1];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx < 0 ? -8 : 7, y = sy < 0 ? -8 : 7;
      g.shade(Math.min(x, x - sx * 4), y, Math.max(x, x - sx * 4), y + 1 * (sy < 0 ? 1 : -1) + (sy < 0 ? 0 : 1) - 0, () => C);
      g.shade(x, Math.min(y, y - sy * 4), x + (sx < 0 ? 1 : -1) + (sx < 0 ? 0 : 1), Math.max(y, y - sy * 4), () => C);
    }
  },
  // a gear
  settings(g) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, cx = Math.cos(a) * 7, cy = Math.sin(a) * 7;
      g.ellipse(cx - 0.5, cy - 0.5, 1.9, 1.9, ell(STEEL));
    }
    g.ellipse(-0.5, -0.5, 6.6, 6.6, ell(STEEL));
    g.ellipse(-0.5, -0.5, 2.6, 2.6, (nx, ny) => (ny < 0 ? STEEL[0] : STEEL[1]));
  },
  // a fish leaping past a red and white float: Câu Cá
  fish(g) {
    g.ellipse(-1.5, 1, 6.6, 3.8, (nx, ny) => (ny > 0.35 ? PAPER[3] : lit(SKY, nx * 0.4, ny, 2)));
    g.poly([[-7, 1], [-10.5, -3.5], [-9, 1], [-10.5, 5.5]], (x, y) => (y < 1 ? SKY[2] : SKY[1]));
    g.poly([[-3, -2.5], [0, -5.5], [2, -2.5]], SKY[1]);
    g.set(2.5, 0, INK), g.set(2, -0.6, WHITE);
    g.ellipse(6.5, -6, 2.2, 2.4, (nx, ny) => (ny < 0 ? RED[2] : PAPER[3]));
    g.line(6.5, -9.5, 6.5, -8.5, RED[3]);
    g.line(4, 7.5, 9, 7.5, SKY[3]);
  },
  // two hearts, a big red one and a small pink one overlapping, and a gold ring: Đạo Lữ
  love(g) {
    const heart = (cx, cy, r, C) => {
      g.ellipse(cx - r * 0.5, cy - r * 0.25, r * 0.6, r * 0.6, ell(C));
      g.ellipse(cx + r * 0.5, cy - r * 0.25, r * 0.6, r * 0.6, ell(C));
      g.poly([[cx - r * 1.05, cy], [cx + r * 1.05, cy], [cx, cy + r * 1.05]], (x, y) => (x < cx ? C[2] : C[1]));
    };
    heart(4, -3.5, 5, PINK);
    heart(-2.5, 1, 7.5, RED);
    g.set(-6, -3, RED[4]), g.set(-5, -4, RED[4]), g.set(1.5, -6, PINK[4]);
    g.shade(0, 4, 9, 10, (x, y) => {
      const d = Math.hypot((x - 5) / 4, (y - 7.5) / 2.6);
      return d < 1 && d > 0.55 ? (y < 7.5 ? GOLD[3] : GOLD[2]) : 0;
    });
  },
  // Chính Tà: two swords crossed, a gold one (Chính) and a crimson one (Tà), over a disc half sun, half blood moon
  chinhta(g) {
    g.shade(-6, -6, 6, 6, (x, y) => {
      const d = Math.hypot(x, y);
      return d > 5.6 ? 0 : x < 0 ? (d < 3 ? GOLD[4] : GOLD[2]) : d < 3 ? RED[3] : RED[1];
    });
    const sword = (dir, C) => {
      // blade from the bottom corner to the top one, a guard across, a grip and pommel
      for (let s2 = -9; s2 <= 5; s2 += 0.5) {
        const x = s2 * dir * -1 * 0.8, y = s2 * 0.8;
        g.set(x, y, C[s2 < -6 ? 4 : 3]);
        g.set(x + dir * 0.7, y + 0.7, C[1]);
      }
      const gx = 5 * dir * -1 * 0.8, gy = 5 * 0.8;
      g.line(gx - 2.2, gy + 2.2 * dir * -1 * -1, gx + 2.2, gy - 2.2 * dir * -1 * -1, GOLD[3]);
      g.line(gx + dir * -1 * 1.2, gy + 1.2, gx + dir * -1 * 3.2, gy + 3.2, WOOD[1]);
      g.set(gx + dir * -1 * 3.8, gy + 3.8, GOLD[3]);
    };
    sword(1, STEEL);
    sword(-1, RED);
  },
  // four gold tiles: more of the menu
  more(g) {
    for (const [x, y] of [[-7, -7], [1, -7], [-7, 1], [1, 1]]) g.shade(x, y, x + 5, y + 5, boxLit(GOLD, x, y, x + 5, y + 5, 2));
  },
};

const G = new Grid(-11, -11, 22, 22);

export function draw(p, t, o) {
  const g = G;
  g.clear();
  (DRAW[o.icon] ?? DRAW.char)(g);
  const K = hex(o.outline ?? meta.options.outline);
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.4)));
  g.draw(p, 1, 0, 0);
}
