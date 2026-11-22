// Monsters placed on a map from the database (table map_spawns), on top of the ones its code places (shared/maps/*.js
// `mobs`): what an admin, or an AI through the MCP (deploy/mcp), adds without touching a map's code. Every Khu of the map
// gets them, and a change is applied at once (World.syncSpawns): a new row's monsters appear, a removed row's go.
//
// A row: map_id (a map of the road), type (a monster in the monsters table), x (cells from the map's left edge), floor_row
// (the row of the floor it stands on; NULL: the first floor found at x, from the top), up (a flier waits this many cells
// over its floor), n (how many, spread 1.5 cells apart around x), note.
import { q } from "./db.js";
import { MAPS, mapInfo } from "../shared/maps/index.js";
import { MONSTERS } from "../shared/balance.js";

export const SPAWN_SCHEMA = `CREATE TABLE IF NOT EXISTS map_spawns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  x DOUBLE NOT NULL,
  floor_row INT NULL,
  up TINYINT UNSIGNED NOT NULL DEFAULT 0,
  n TINYINT UNSIGNED NOT NULL DEFAULT 1,
  note VARCHAR(80) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export const SPAWN_MAX_N = 12;
let rows = [];
/** The rows as last loaded. */
export const spawnRows = () => rows;

/** Create the table if it isn't there, and read it. */
export async function loadSpawns() {
  await q(SPAWN_SCHEMA);
  rows = (await q("SELECT id, map_id, type, x, floor_row, up, n, note FROM map_spawns ORDER BY id")).map((r) => ({
    id: Number(r.id), map: r.map_id, type: r.type, x: Number(r.x), row: r.floor_row === null ? null : Number(r.floor_row), up: Number(r.up), n: Number(r.n), note: r.note,
  }));
  return rows;
}

/** The maps monsters may be placed on: the maps of the road that already have monsters (not the town, the lake, a Gia Viên…). */
export const spawnMaps = () => Object.keys(MAPS).filter((id) => !MAPS[id].instanced && !MAPS[id].peaceful && (MAPS[id].mobs ?? []).some((m) => m.type !== "dummy"));

/**
 * The floor at column cx of map info: the first solid or plank cell (from the top) with two empty cells over it (so a
 * cave's roof is not taken for a floor). null if there is none.
 */
export function floorRow(info, cx) {
  const open = (cy) => !info.solid(cx, cy) && !info.plank(cx, cy);
  for (let cy = 2; cy < info.rows; cy++) if ((info.solid(cx, cy) || info.plank(cx, cy)) && open(cy - 1) && open(cy - 2)) return cy;
  return null;
}

/** Where each of a row's monsters stands, in world px: [{ x, y }] (empty if the map or a floor is missing). */
export function placements(r) {
  if (!MAPS[r.map]) return [];
  const info = mapInfo(r.map), out = [];
  for (let i = 0; i < r.n; i++) {
    const cx = Math.max(1, Math.min(info.cols - 2, r.x + (i - (r.n - 1) / 2) * 1.5));
    const row = r.row ?? floorRow(info, Math.floor(cx));
    if (row === null) continue;
    out.push({ x: cx * info.T, y: (row - r.up) * info.T });
  }
  return out;
}

/** A row from an admin's input, checked: throws a message in Vietnamese if something is wrong. */
export function checkSpawn(input, cur = {}) {
  const v = { ...cur, ...input };
  const r = {
    map: String(v.map ?? v.map_id ?? ""), type: String(v.type ?? ""), x: Number(v.x), row: v.row === undefined || v.row === null || v.row === "" ? null : Number(v.row),
    up: v.up === undefined || v.up === "" ? 0 : Number(v.up), n: v.n === undefined || v.n === "" ? 1 : Number(v.n), note: String(v.note ?? "").slice(0, 80),
  };
  if (!spawnMaps().includes(r.map)) throw new Error(`Bản đồ "${r.map}" không đặt yêu thú được. Chọn một trong: ${spawnMaps().join(", ")}.`);
  if (!MONSTERS[r.type]) throw new Error(`Chưa có yêu thú "${r.type}" (thêm nó ở bảng monsters trước).`);
  const info = mapInfo(r.map);
  if (!Number.isFinite(r.x) || r.x < 2 || r.x > info.cols - 3) throw new Error(`x phải từ 2 đến ${info.cols - 3} (ô; bản đồ rộng ${info.cols} ô).`);
  if (r.row !== null && (!Number.isInteger(r.row) || r.row < 1 || r.row >= info.rows)) throw new Error(`floor_row phải là số nguyên từ 1 đến ${info.rows - 1}, hoặc để trống (tự tìm mặt đất).`);
  if (!Number.isInteger(r.up) || r.up < 0 || r.up > 10) throw new Error("up: 0 đến 10 ô.");
  if (!Number.isInteger(r.n) || r.n < 1 || r.n > SPAWN_MAX_N) throw new Error(`n: 1 đến ${SPAWN_MAX_N} con.`);
  if (!placements(r).length) throw new Error(`Không tìm thấy mặt đất ở x = ${r.x}: nhập floor_row.`);
  return r;
}
