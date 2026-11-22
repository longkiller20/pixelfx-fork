// Truyền Tống Trận: the ways between the maps of the road are teleport arrays now, not gates that take whoever walks in.
// Standing by one, a button (or T) opens a list of where it can send them: every map with monsters, and the starter town
// to rest in. Nothing happens by walking past it, so nobody is moved by mistake. The ways out of the Gia Viên and the
// fishing lake, and the sealed gate deep in Huyết Diễm Ma Uyên, stay as they were.
// Shared by the server (which checks the player really stands by an array) and the browser (the button, the list).
import { MAPS, START_MAP } from "./maps/index.js";

/** A gate is an array when it leads to a map of the road (not "@back", not a sealed gate). */
export const isTele = (g) => !!g?.to && !!MAPS[g.to];
const hunting = (id) => MAPS[id].mobs.some((m) => m.type !== "dummy");
/** Where an array sends: the starter town, then the maps with monsters (and the added towns), in the road's order. */
export const TELE_MAPS = [START_MAP, ...Object.keys(MAPS).filter((id) => id !== START_MAP && !MAPS[id].peaceful && !MAPS[id].pvp && !MAPS[id].instanced && (hunting(id) || MAPS[id].town))];
/** How near counts as "by the array": this many tiles either side, and up to this many above its step. */
export const TELE_NEAR = { x: 3, up: 3 };
/** The array a player at (x, y) stands by on map (mapInfo), or null. */
export const teleAt = (map, x, y) => map.portals.find((g) => isTele(g) && Math.abs(x - g.x) < TELE_NEAR.x * map.T && y <= g.y + 2 && y >= g.y - TELE_NEAR.up * map.T) ?? null;
/** The maps' own words for the list: name, and the line under it. */
export const teleInfo = (id) => ({ id, name: MAPS[id].name, sub: MAPS[id].sub ?? "", safe: !hunting(id) });
