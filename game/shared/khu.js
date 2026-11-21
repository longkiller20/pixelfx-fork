// Khu: every map of the road (Tân Thủ Thôn and the hunting maps: those not instanced) is copied into ZONE_COUNT Khu, as
// the fishing lake is (shared/cau-ca.js), each a world of its own (its own players, monsters and Khu Vực chat) for at most
// ZONE_CAP people. Khu 1 is the map itself (its world key is the map's id) and always there; Khu 2..30 ("<map>:<n>")
// are made when someone goes in and dropped a while after the last one leaves. Arriving on a map (through a Truyền Tống
// Trận, a gate, logging in) puts one in the Khu they ask for if it has room, else the first with room; the Khu box
// (the Khu button, or K) moves them to another Khu of the same map, at the same spot.
import { MAPS } from "./maps/index.js";

export const ZONE_COUNT = 30, ZONE_CAP = 20;
/** Whether a map is split into Khu: a map of the road (the Gia Viên, the lake and the battlefield have their own ways). */
export const isField = (map) => !!MAPS[map] && !MAPS[map].instanced;
/** A Khu's world key, and back: { map, n } (null for a key that isn't one). */
export const zoneKey = (map, n) => (n === 1 ? map : `${map}:${n}`);
export function zoneOf(key) {
  const m = /^([a-z]+)(?::(\d{1,2}))?$/.exec(String(key ?? ""));
  if (!m || !isField(m[1])) return null;
  const n = m[2] === undefined ? 1 : Number(m[2]);
  return n >= 1 && n <= ZONE_COUNT ? { map: m[1], n } : null;
}
/** How busy a Khu looks: 0 roomy (green), 1 filling (yellow), 2 nearly or quite full (red); as the lake's. */
export const zoneLevel = (n) => (n >= 16 ? 2 : n >= 9 ? 1 : 0);
export const ZONE_COLORS = ["#4ade80", "#facc15", "#f87171"];
