import { fit, mix, hex, TAU } from "../../core/index.js";
import { Grid, RAMP, H } from "./_lib.js";

export const meta = {
  name: "Farm props",
  desc: "The farm's fixtures, one per piece: soil (a tilled bed, wet: 1 darker), fence, trough (full: 1 with feed), coop, haystack, sign. 32 px to a cell, standing on y = 0.",
  tags: ["farm", "prop", "soil", "fence", "trough", "coop", "haystack", "sign", "static"],
  size: [80, 72],
  origin: [40, 64],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "ground",
  options: { piece: "coop", wet: 0, full: 1, wood: RAMP.wood, soil: RAMP.soil, seed: 1 },
};

const G = new Grid(-40, -64, 80, 66);
const STRAW = ["#5a4010", "#a8801e", "#dcb83e", "#f6e07a"].map(hex), ROOF = ["#3a1010", "#7a2020", "#b03a2a", "#d8644a"].map(hex);
const FEED = ["#6a4a10", "#b8902a", "#e8c860"].map(hex), WATERC = ["#1a3a6a", "#3a7ac0"].map(hex);
const out = (g, C) => g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
// a plank: a horizontal board with lit top edge and grain
function plank(g, W, x0, y0, w, h) {
  g.shade(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => (y < y0 + 1 ? W[4] : y > y0 + h - 1.5 ? W[1] : (Math.floor(x * 0.37 + y * 1.3) % 7 === 0 ? W[2] : W[3])));
}
function post(g, W, x0, y0, w, h) {
  g.shade(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => (y < y0 + 1 ? W[4] : x < x0 + 1 ? W[4] : x > x0 + w - 1.5 ? W[1] : W[2]));
}

const PIECES = {
  // a tilled bed, 32 wide: furrows of earth heaped above the floor line, wet beds darker and glossy
  soil(g, W, S, o) {
    const s = o.wet ? [S[0], S[0], S[1], S[2], S[3]] : S;
    g.shade(-16, -5, 15, -0.5, (x, y) => {
      const ridge = -3.5 - Math.abs(Math.sin((x + 16) * 0.45)) * 1.6;
      if (y < ridge) return 0;
      if (y < ridge + 1) return s[4];
      return Math.floor(x + 16) % 5 === 0 ? s[1] : y > -2 ? s[2] : s[3];
    });
    if (o.wet) for (const x of [-11, -2, 7]) g.set(x, -3, WATERC[1]);
    out(g, s);
  },
  // a fence section, 32 wide: two posts and two rails
  fence(g, W) {
    plank(g, W, -16, -20, 32, 3);
    plank(g, W, -16, -10, 32, 3);
    for (const x of [-15, 11]) {
      post(g, W, x, -26, 4, 26);
      g.set(x + 1, -27, W[3]); g.set(x + 2, -27, W[3]);
    }
    out(g, W);
  },
  // a feed trough on legs, 32 wide, empty or heaped with grain
  trough(g, W, S, o) {
    for (const x of [-13, 10]) post(g, W, x, -6, 3, 6);
    g.poly([[-15, -14], [14, -14], [12, -6], [-13, -6]], (x, y) => (y < -13 ? W[4] : x < -11 ? W[3] : y > -8 ? W[1] : W[2]));
    if (o.full) g.shade(-13, -16, 12, -14, (x, y) => (y < -15 + Math.sin(x * 0.8) * 0.6 ? 0 : (Math.floor(x * 3 + y) % 4 ? FEED[1] : FEED[2])));
    else g.shade(-12, -14, 11, -13, () => W[0]);
    out(g, W);
  },
  // a chicken coop, 64 wide: a little wooden house on stilts, a red tiled roof, a ramp and a dark door
  coop(g, W) {
    for (const x of [-26, 22]) post(g, W, x, -10, 4, 10);
    g.shade(-28, -40, 27, -10, (x, y) => (Math.floor(y) % 5 === 0 ? W[1] : x < -26 ? W[4] : x > 25 ? W[1] : W[3]));
    // the roof: a wide gable of red tiles
    g.poly([[-34, -38], [0, -58], [33, -38]], (x, y) => (Math.floor(y) % 3 === 0 ? ROOF[1] : x < -10 && y < -45 ? ROOF[3] : ROOF[2]));
    g.line(-34, -38, 33, -38, ROOF[0]);
    // door and a little window with straw showing
    g.shade(-6, -30, 5, -10, (x, y) => (y < -29 ? W[1] : W[0]));
    g.shade(12, -32, 19, -25, (x, y) => (y > -28 ? STRAW[2] : W[0]));
    g.shade(-22, -32, -15, -25, (x, y) => (y > -28 ? STRAW[1] : W[0]));
    // the ramp up to the door
    for (let i = 0; i < 12; i++) g.set(-6 - i * 1.2, -10 + i * 0.85, W[3]), g.set(-6 - i * 1.2, -9 + i * 0.85, W[1]);
    out(g, W);
  },
  // a haystack: a dome of straw with loose ends
  haystack(g) {
    g.shade(-14, -18, 14, -0.5, (x, y) => {
      const d = (x / 14) ** 2 + ((y + 1) / 17) ** 2;
      if (d > 1) return 0;
      const k = -x / 14 - (y + 9) / 9;
      return Math.floor(x * 0.7 - y * 1.6) % 5 === 0 ? STRAW[0] : k > 0.6 ? STRAW[3] : k > -0.2 ? STRAW[2] : STRAW[1];
    });
    for (const [x, y, dx, dy] of [[-10, -12, -3, -2], [6, -16, 2, -3], [12, -5, 3, -1], [0, -18, 0, -3]]) g.line(x, y, x + dx, y + dy, STRAW[2]);
    out(g, STRAW);
  },
  // a wooden signboard on a post (the game writes on it)
  sign(g, W) {
    post(g, W, -2, -22, 4, 22);
    g.shade(-20, -40, 19, -22, (x, y) => (y < -39 ? W[4] : y > -23 ? W[1] : x < -19 ? W[4] : x > 18 ? W[1] : (Math.floor(y) % 4 === 0 ? W[2] : W[3])));
    out(g, W);
  },
};

export function draw(p, t, o) {
  const W = H(fit(o.wood, 5)), S = H(fit(o.soil, 5)), g = G;
  g.clear();
  (PIECES[o.piece] ?? PIECES.fence)(g, W, S, o);
  g.draw(p, 1, 0, 0);
}
