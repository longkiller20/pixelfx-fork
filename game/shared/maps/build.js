// A small helper for laying out a map's grid in code instead of typing hundreds of characters by hand: start from air,
// lay ground from a floor row down, cut pools, set ledges and steps, then hand the rows over as strings.
// The characters are those of tanthu.js, plus: r red clay (solid), l lava (like water, hurts), k a ledge (stand on it from
// above, like a cloud, drawn from the map's own platform set).

/** An empty grid: cols x rows of air. */
export const canvas = (cols, rows) => Array.from({ length: rows }, () => Array(cols).fill("."));

/** Fill the cells x0..x1, y0..y1 (inclusive) with ch; anything outside the grid is ignored. */
export function box(g, x0, x1, y0, y1, ch) {
  for (let y = Math.max(0, y0); y <= Math.min(g.length - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(g[0].length - 1, x1); x++) g[y][x] = ch;
}

/** Ground from the floor row `top` down to the bottom, over x0..x1. */
export const ground = (g, x0, x1, top, ch = "#") => box(g, x0, x1, top, g.length - 1, ch);

/** The rows as strings, as maps keep them. */
export const rows = (g) => g.map((r) => r.join(""));
