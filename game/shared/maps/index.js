// The maps, and what the server and the browser both need to know about one: its size, which tiles are solid, which are
// planks you can stand on, where you appear, where you cultivate and where the ways out are. Everything here is in world px.
// Add a map: write its file like tanthu.js and list it.
import { TANTHU } from "./tanthu.js";

export const MAPS = { tanthu: TANTHU };
export const START_MAP = "tanthu";

const cache = new Map();
/**
 * A map in world px: { def, id, name, sub, T (tile size), cols, rows, w, h, pvp, mobs, spawn, spring, portals, solid(cx, cy),
 * plank(cx, cy), cell(cx, cy), inSpring(x, y), portalAt(x, y) }. Floors are the top edge of a tile row: row × T.
 */
export function mapInfo(id) {
  if (cache.has(id)) return cache.get(id);
  const def = MAPS[id], T = def.cell ?? def.tile * def.scale, grid = def.grid, rows = grid.length, cols = grid[0].length;
  const cell = (cx, cy) => (cx < 0 || cx >= cols ? "#" : cy < 0 ? "." : cy >= rows ? "#" : grid[cy][cx]);
  const s = def.spring;
  const portals = def.portals.map((p) => ({ ...p, x: p.x * T, y: p.row * T, r: p.r * T }));
  const info = {
    def, id, name: def.name, sub: def.sub, T, cols, rows, w: cols * T, h: rows * T, pvp: def.pvp,
    mobs: def.mobs.map((m) => ({ ...m, x: m.x * T, y: m.row * T })),
    spawn: { x: def.spawn.x * T, y: def.spawn.row * T },
    spring: { x0: s.x0 * T, x1: s.x1 * T, y: s.row * T },
    portals,
    cell,
    solid: (cx, cy) => {
      const c = cell(cx, cy);
      return c === "#" || c === "s";
    },
    plank: (cx, cy) => {
      const c = cell(cx, cy);
      return c === "=" || c === "b";
    },
    inSpring: (x, y) => x >= s.x0 * T && x <= s.x1 * T && Math.abs(y - s.row * T) < 2,
    // the column over the arrow, from its step up to three tiles high: walking or jumping through it counts
    portalAt: (x, y) => portals.find((p) => Math.abs(x - p.x) < p.r && y <= p.y + 2 && y >= p.y - 3 * T) ?? null,
  };
  cache.set(id, info);
  return info;
}
