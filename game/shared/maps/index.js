// The maps, and what the server and the browser both need to know about one: its size, which tiles are solid, which are
// planks you can stand on, where you appear, where you cultivate and where the ways out are. Everything here is in world px.
// Add a map: write its file like tanthu.js and list it.
import { TANTHU } from "./tanthu.js";
import { BICHLAC } from "./bichlac.js";
import { LINHTHUY } from "./linhthuy.js";
import { UMINH } from "./uminh.js";
import { MAVUC } from "./mavuc.js";
import { GIAVIEN } from "./giavien.js";
import { CAUCA } from "./cauca.js";
import { CHIENTRUONG } from "./chientruong.js";
import { XAQUAT } from "./xaquat.js";

// the road east: the starter town, the forest, the lake, the old tombs, the abyss; and off the road, reached from the menu:
// the Gia Viên (one each) and the fishing lake; the Chính Tà battlefield, opened for a battle; and the Phó Bản, a copy
// of its own for each party that goes in
export const MAPS = { tanthu: TANTHU, bichlac: BICHLAC, linhthuy: LINHTHUY, uminh: UMINH, mavuc: MAVUC, giavien: GIAVIEN, cauca: CAUCA, chientruong: CHIENTRUONG, xaquat: XAQUAT };
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
  // where one cultivates (a map without a spirit vein has none)
  const s = def.spring ?? { x0: -9, x1: -9, row: -9 };
  const portals = def.portals.map((p) => ({ ...p, x: p.x * T, y: p.row * T, r: p.r * T }));
  const info = {
    def, id, name: def.name, sub: def.sub, music: def.music ?? "", T, cols, rows, w: cols * T, h: rows * T, pvp: def.pvp,
    // a flier waits `up` cells above the floor it is placed on
    mobs: def.mobs.map((m) => ({ ...m, x: m.x * T, y: (m.row - (m.up ?? 0)) * T })),
    spawn: { x: def.spawn.x * T, y: def.spawn.row * T },
    spring: def.spring ? { x0: s.x0 * T, x1: s.x1 * T, y: s.row * T } : null,
    portals,
    cell,
    solid: (cx, cy) => {
      const c = cell(cx, cy);
      return c === "#" || c === "s" || c === "r";
    },
    plank: (cx, cy) => {
      const c = cell(cx, cy);
      return c === "=" || c === "b" || c === "k";
    },
    inSpring: (x, y) => x >= s.x0 * T && x <= s.x1 * T && Math.abs(y - s.row * T) < 2,
    // the column over the arrow, from its step up to five tiles high (higher than any jump): walking or hopping over it counts
    portalAt: (x, y) => portals.find((p) => Math.abs(x - p.x) < p.r && y <= p.y + 2 && y >= p.y - 5 * T) ?? null,
  };
  cache.set(id, info);
  return info;
}
