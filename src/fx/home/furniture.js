import { fit, hex, mix } from "../../core/index.js";
import { Grid, H, RAMP, outline, board, post } from "./_lib.js";

export const meta = {
  name: "Furniture",
  desc: "Things for a house built a cell (32 px) at a time, one per piece: door, window, table, chair, bed, shelf, vase, scroll, paper wall, wood wall, bamboo, platform, glass, metal door.",
  tags: ["home", "furniture", "house", "door", "window", "table", "bed", "static"],
  size: [96, 80],
  origin: [32, 72],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "ground",
  options: { piece: "door", wood: RAMP.wood, seed: 1 },
};

const G = new Grid(-32, -72, 96, 74);
const R = H(RAMP.red), P = H(RAMP.paper), J = H(RAMP.jade), Au = H(RAMP.gold), B = H(RAMP.bamboo), K = H(RAMP.ink), Dk = H(RAMP.dark);

const PIECES = {
  // a door two cells tall: a frame, two leaves of lattice over paper, round brass pulls
  door(g, W) {
    post(g, W, -15, -64, 3, 64); post(g, W, 12, -64, 3, 64);
    board(g, W, -15, -64, 30, 3);
    g.shade(-12, -61, 11, -1, (x, y) => {
      const gx = (x + 12) % 6, gy = (y + 61) % 8;
      if (Math.abs(x) < 0.6) return W[1];
      if (y > -20) return gy < 1 ? W[1] : W[2];
      return gx < 1 || gy < 1 ? W[2] : y < -40 ? P[3] : P[2];
    });
    for (const x of [-3, 2]) (g.set(x, -30, Au[3]), g.set(x, -29, Au[1]));
    outline(g, W);
  },
  // a sliding steel door two cells tall (the far-future house): a heavy frame, two leaves meeting at a lit seam,
  // a panel light by the side
  metaldoor(g) {
    const S = ["#1c2230", "#3a4458", "#5e6a80", "#8a96aa", "#c4ccd8"].map(hex), L = ["#1a6a8a", "#3ac8f0", "#bff4ff"].map(hex);
    g.shade(-15, -64, 14, -1, (x, y) => {
      if (x < -12.5 || x > 11.5 || y < -61.5) return x < -13.5 || y < -63 ? S[4] : x > 12.5 ? S[1] : S[3];
      if (Math.abs(x + 0.5) < 1) return y > -50 && y < -14 ? L[1] : S[0];
      const sx = x < 0 ? x + 12 : x - 1, band = (y + 61) % 15;
      if (band < 1) return S[1];
      if (band > 13) return S[3];
      return sx < 1 ? S[3] : S[2];
    });
    g.shade(-11, -36, -8, -30, (x, y) => (y < -35 || y > -31 ? S[0] : L[0]));
    g.set(-10, -34, L[2]); g.set(-9, -33, L[1]);
    g.outline((x, y, nx, ny) => S[0]);
  },
  // a round lattice window in a square frame
  window(g, W) {
    board(g, W, -15, -29, 30, 3); board(g, W, -15, -3, 30, 3);
    post(g, W, -15, -29, 3, 29); post(g, W, 12, -29, 3, 29);
    g.shade(-12, -26, 11, -4, (x, y) => {
      const d = Math.hypot(x, y + 15);
      if (d > 11) return W[2];
      if (d > 10) return W[1];
      return (Math.abs(x) % 5 < 1 || Math.abs(y + 15) % 5 < 1) ? W[1] : y < -18 ? P[3] : P[2];
    });
    outline(g, W);
  },
  // a low tea table with a teapot and two cups
  table(g, W) {
    board(g, W, -15, -14, 30, 3);
    for (const x of [-13, 10]) post(g, W, x, -11, 3, 11);
    g.ellipse(-3, -18, 4, 3.4, (nx, ny) => (nx < -0.3 && ny < -0.2 ? J[4] : ny > 0.4 ? J[1] : J[2]));
    g.line(1, -19, 4, -21, J[1]); g.set(-3, -22, J[3]);
    for (const x of [6, 10]) g.shade(x - 1, -16, x + 1, -14, (px, py) => (py < -15.5 ? P[3] : P[1]));
    outline(g, W);
  },
  // a chair with a lattice back
  chair(g, W) {
    post(g, W, -10, -28, 3, 28);
    board(g, W, -10, -13, 20, 3);
    post(g, W, 7, -13, 3, 13);
    g.shade(-7, -26, -1, -14, (x, y) => (Math.floor(y) % 4 === 0 ? W[1] : W[3]));
    outline(g, W);
  },
  // a bed two cells wide: a carved headboard, a red quilt, a pillow
  bed(g, W) {
    post(g, W, -15, -28, 4, 28);
    post(g, W, 44, -16, 4, 16);
    board(g, W, -12, -10, 56, 4);
    g.shade(-11, -16, 43, -10, (x, y) => (y < -15 ? R[4] : Math.floor(x) % 9 === 0 ? R[1] : y > -12 ? R[2] : R[3]));
    g.ellipse(-4, -17, 6, 2.6, (nx, ny) => (ny < -0.2 ? P[3] : P[1]));
    g.shade(-14, -26, -12, -20, () => Au[2]);
    outline(g, W);
  },
  // a shelf two cells tall: books and a jade vase
  shelf(g, W) {
    post(g, W, -15, -62, 3, 62); post(g, W, 12, -62, 3, 62);
    for (const y of [-62, -42, -22, -3]) board(g, W, -15, y, 30, 3);
    const books = [R[2], J[2], Au[2], K[2], R[3], J[1]];
    for (const [y0, n] of [[-42, 6], [-22, 5]])
      for (let i = 0; i < n; i++) {
        const x = -11 + i * 4, h = 12 + ((i * 7) % 5);
        g.shade(x, y0 - h, x + 2, y0 - 1, (px, py) => (py < y0 - h + 1 ? mix(books[i], 0xffffffff, 0.3) : books[i]));
      }
    g.ellipse(4, -9, 4, 5, (nx, ny) => (nx < -0.3 && ny < -0.2 ? J[4] : ny > 0.5 ? J[1] : J[2]));
    outline(g, W);
  },
  // a tall blue-and-white vase with a branch of blossom
  vase(g) {
    g.shade(-6, -20, 5, -1, (x, y) => {
      const r = 3 + Math.sin(((y + 20) / 19) * Math.PI) * 3;
      if (Math.abs(x) > r) return 0;
      return Math.floor(y * 0.5) % 3 === 0 && Math.abs(x) < r - 1 ? hex("#2a4a9a") : x < -1 ? P[3] : P[2];
    });
    g.line(0, -20, -3, -30, Dk[3]); g.line(-2, -27, 3, -32, Dk[3]);
    for (const [x, y] of [[-3, -31], [3, -33], [-1, -28], [2, -29]]) g.ellipse(x, y, 1.2, 1.2, hex("#ffb0c8"));
    outline(g, K);
  },
  // a hanging scroll of an ink landscape (on the wall)
  scroll(g, W) {
    board(g, W, -10, -30, 20, 2);
    g.shade(-8, -28, 7, -6, (x, y) => {
      const m = -14 - Math.abs(Math.sin(x * 0.4)) * 6 - (x > 0 ? 3 : 0);
      return y > m && y < m + 2 ? K[1] : y > m ? K[3] : P[3];
    });
    board(g, W, -10, -6, 20, 2);
    g.set(5, -24, R[3]);
    outline(g, K);
  },
  // a background wall of paper panels in a wooden grid
  paperwall(g, W) {
    g.shade(-16, -32, 15, -1, (x, y) => ((x + 16) % 16 < 1.5 || (y + 32) % 11 < 1.2 ? W[2] : y < -25 ? P[3] : P[2]));
  },
  // a background wall of vertical planks
  woodwall(g) {
    g.shade(-16, -32, 15, -1, (x, y) => ((x + 16) % 8 < 1 ? Dk[0] : (x + 16) % 8 < 2 ? Dk[3] : Math.floor(y * 0.6 + x) % 9 === 0 ? Dk[1] : Dk[2]));
  },
  // a solid block of bundled bamboo
  bamboo(g) {
    g.shade(-16, -32, 15, -1, (x, y) => {
      const c = (x + 16) % 8;
      if (c < 1) return B[0];
      if ((y + 32 + (x > 0 ? 6 : 0)) % 16 < 1.5) return B[1];
      return c < 2.5 ? B[4] : c < 5 ? B[3] : B[2];
    });
  },
  // a pane of tempered glass in a thin steel frame, two streaks of light across it (modern and future houses)
  glass(g) {
    const S = ["#3a4a58", "#7a8ea0", "#c8d8e4"].map(hex), Q = ["#5aa8c8", "#8ccae0", "#bfe6f2", "#effaff"].map(hex);
    g.shade(-16, -32, 15, -1, (x, y) => {
      if (x < -14.5 || y < -30.5) return S[2];
      if (x > 13.5 || y > -2.5) return S[0];
      const d = x + y + 32 + 16, k = y + 32;
      if ((d > 22 && d < 27) || (d > 30 && d < 32)) return Q[3];
      return k < 10 ? Q[2] : k < 22 ? Q[1] : Q[0];
    });
  },
  // a wooden platform: stand on it, jump up through it
  platform(g, W) {
    board(g, W, -16, -32, 32, 4);
    for (const x of [-14, 10]) post(g, W, x, -28, 4, 5);
    outline(g, W);
  },
};

export function draw(p, t, o) {
  const W = H(fit(o.wood, 5)), g = G;
  g.clear();
  (PIECES[o.piece] ?? PIECES.door)(g, W);
  g.draw(p, 1, 0, 0);
}
