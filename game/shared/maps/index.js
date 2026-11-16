// The maps, and what the server and the browser both need to know about one: how big it is in the world, where you can
// stand, where you appear, where you cultivate and where the ways out are. Add a map: write its file like tanthu.js and list it.
import { TANTHU } from "./tanthu.js";

export const MAPS = { tanthu: TANTHU };
export const START_MAP = "tanthu";

const cache = new Map();
/** A map in world px: { def, id, name, w, h, pvp, mobs, spawn, spring, portals, canStand(x, y), inSpring(x, y), portalAt(x, y) }. */
export function mapInfo(id) {
  if (cache.has(id)) return cache.get(id);
  const def = MAPS[id], k = def.scale, cw = def.cell * k, gw = def.walk[0].length, gh = def.walk.length;
  const open = new Uint8Array(gw * gh);
  def.walk.forEach((row, y) => {
    for (let x = 0; x < gw; x++) open[y * gw + x] = row[x] === "." ? 1 : 0;
  });
  const walkable = (x, y) => {
    const cx = Math.floor(x / cw), cy = Math.floor(y / cw);
    return cx >= 0 && cy >= 0 && cx < gw && cy < gh && open[cy * gw + cx] === 1;
  };
  const s = def.spring, sp = { x: s.x * k, y: s.y * k, rx: s.rx * k, ry: s.ry * k };
  const portals = def.portals.map((p) => ({ ...p, x: p.x * k, y: p.y * k, r: p.r * k }));
  const info = {
    def, id, name: def.name, sub: def.sub, w: def.imageW * k, h: def.imageH * k, pvp: def.pvp, mobs: def.mobs.map((m) => ({ ...m, x: m.x * k, y: m.y * k })),
    spawn: { x: def.spawn.x * k, y: def.spawn.y * k }, spring: sp, portals,
    lanterns: def.lanterns.map(([x, y]) => [x * k, y * k]),
    /** Feet at (x, y) fit: the point and a little either side are all on open ground. */
    canStand: (x, y) => walkable(x, y) && walkable(x - 7, y) && walkable(x + 7, y) && walkable(x, y - 4),
    inSpring: (x, y) => ((x - sp.x) / sp.rx) ** 2 + ((y - sp.y) / sp.ry) ** 2 < 1,
    portalAt: (x, y) => portals.find((p) => Math.hypot(x - p.x, y - p.y) < p.r) ?? null,
  };
  cache.set(id, info);
  return info;
}
