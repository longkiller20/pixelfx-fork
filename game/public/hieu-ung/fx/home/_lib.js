// The home's kit: furniture and fittings for a side-view house built a cell at a time (32 px to a cell, standing on
// y = 0, x = 0 the middle of the first cell). Drawn with the critters' Grid and a 1 px outline picked per side.
import { hex, mix } from "../../core/index.js";
export { Grid } from "../critters/_lib.js";
export const H = (a) => a.map(hex);
export const RAMP = {
  wood: ["#24140a", "#4a2c14", "#7a4a22", "#a8703a", "#d29a5a"],
  dark: ["#140a06", "#2e1a0e", "#4a2a16", "#6a3e20", "#8a5630"],
  red: ["#3a0a10", "#7a1420", "#b8283a", "#e04a4a", "#ff9a7a"],
  paper: ["#6a5a40", "#b8a888", "#e8dcc0", "#fff6e0"],
  jade: ["#0e3a2a", "#1c6a4a", "#3aa070", "#7ad8a8", "#c8ffe0"],
  gold: ["#5a3a08", "#a8781a", "#e0b040", "#ffe08a"],
  bamboo: ["#1e3a10", "#3a6a1a", "#5a9a2a", "#8ac84a", "#c8f07a"],
  ink: ["#141018", "#3a3440", "#6a6470", "#b8b0a8"],
};
export const outline = (g, C) => g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? C[0] : mix(C[0], C[1], 0.5)));
/** A board: lit top edge, shaded bottom, a grain line now and then. */
export function board(g, W, x0, y0, w, h, grain = 7) {
  g.shade(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => (y < y0 + 1 ? W[4] : y > y0 + h - 1.5 ? W[1] : Math.floor(x * 0.37 + y * 1.3) % grain === 0 ? W[2] : W[3]));
}
/** A post: lit left edge, shaded right edge. */
export function post(g, W, x0, y0, w, h) {
  g.shade(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => (x < x0 + 1 ? W[4] : x > x0 + w - 1.5 ? W[1] : y < y0 + 1 ? W[4] : W[2]));
}
