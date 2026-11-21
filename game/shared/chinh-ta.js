// Chính Tà Phân Tranh: Chính Phái against Tà Phái, at most CT.team (30) a side, on a flat battlefield of its own.
// Shared by the server, the browser and the admin.
//  - Phe (faction): picked when the character is made (Chính Phái or Tà Phái), changeable later for stones, not often.
//  - Lịch (the schedule): up to three times a day (settings chinhta.slot1..3, HHMM, in the game's hour CT.tz); for each,
//    one registers in the panel until CT.closeBefore minutes before it starts.
//  - Xếp trận (picking): at the start, of those registered who are online, still of the side they signed for and of at
//    least CT.level, each side's best (level, then tu vi, then điểm đấu trường, then who signed first) up to CT.team, the
//    bigger side cut to the smaller + CT.maxGap; fewer than CT.minSide on a side: no battle. The others wait as dự bị, and
//    step in (best first) for someone who leaves the field while there is time enough left.
//  - Trận (the battle): everyone picked is brought onto the field at their side's camp; CT.minutes of fighting, killed ones
//    rise again at their camp after CT.respawn seconds. Each enemy brought down is one hạ gục for that side; when time is
//    up the side with more wins (equal: hòa). In one's own camp (the kết giới) nobody hits or is hit, and enemies can't go in.
//  - Thưởng (rewards): điểm Chính Tà for everyone who stayed long enough, the losers too but fewer: CT.win / CT.lose /
//    CT.draw, + CT.killPts a hạ gục (at most CT.killCap), + CT.mvp for each side's best. Spent at the Tiệm Chính Tà.

/** The two sides. */
export const FACTIONS = {
  c: { key: "c", name: "Chính Phái", short: "Chính", color: "#ffd56a", dark: "#2a5aa8", glyph: "☀", motto: "Hộ đạo trừ ma, lấy chính khí làm gốc." },
  t: { key: "t", name: "Tà Phái", short: "Tà", color: "#ff5a6a", dark: "#5a1040", glyph: "☾", motto: "Tùy tâm sở dục, lấy sát phạt chứng đạo." },
};
export const FACTION_KEYS = ["c", "t"];
export const factionOk = (f) => f === "c" || f === "t";
export const other = (f) => (f === "c" ? "t" : "c");
/** The points: their name, as the game says it. */
export const POINTS = "Chính Tà";
/** The battlefield map (shared/maps/chientruong.js) and the world it runs as while a battle is on. */
export const WAR_MAP = "chientruong";
export const WAR_KEY = "ct";

// ---- the live numbers (settings chinhta.*), set by balance.js applyConfig
export const CT = {
  slots: [2000], tz: 7, team: 30, minSide: 3, maxGap: 5, level: 3, minutes: 15, closeBefore: 1, prep: 20, respawn: 5, protect: 3,
  win: 30, lose: 10, draw: 15, killPts: 1, killCap: 20, mvp: 10, minStay: 50, changeCost: 5000, changeDays: 7, refill: 40, away: 60,
};

/** "20:00" for 2000. */
export const hhmm = (v) => `${String(Math.floor(v / 100)).padStart(2, "0")}:${String(v % 100).padStart(2, "0")}`;
/** A slot setting is HHMM with 0 <= HH < 24, 0 <= MM < 60, or -1 (off). */
export const slotOk = (v) => v === -1 || (Number.isInteger(v) && v >= 0 && v % 100 < 60 && Math.floor(v / 100) < 24);

/**
 * When the next battle starts (ms since 1970), the first slot strictly after `now` (ms), by the game's clock (UTC + CT.tz
 * hours); null with no slot on. A slot is named by its start: the same number on the server, in the database, in the browser.
 */
export function nextStart(now = Date.now(), slots = CT.slots, tz = CT.tz) {
  if (!slots.length) return null;
  const off = tz * 3600_000, local = now + off, day = Math.floor(local / 86400_000) * 86400_000;
  let best = null;
  for (let d = 0; d <= 1; d++)
    for (const s of slots) {
      const at = day + d * 86400_000 + (Math.floor(s / 100) * 60 + (s % 100)) * 60_000 - off;
      if (at > now && (best === null || at < best)) best = at;
    }
  return best;
}
/** Registration for the battle starting at `start` is open until closeBefore minutes before it. */
export const regCloses = (start) => start - CT.closeBefore * 60_000;
/** The start as the game's clock says it: "20:00 21/11". */
export function startText(start, tz = CT.tz) {
  const d = new Date(start + tz * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** Who ranks higher for a place in the battle: level, tu vi, điểm đấu trường, then who signed first. */
export const better = (a, b) => b.level - a.level || b.exp - a.exp || b.rank - a.rank || a.at - b.at || a.uid - b.uid;
/**
 * Pick the teams from those eligible ([{ uid, faction, level, exp, rank, at }]): each side's best up to CT.team, the bigger
 * side cut to the smaller + maxGap. Returns { c: [...], t: [...], bench: { c: [...], t: [...] }, ok } (ok: both have minSide).
 */
export function pickTeams(list, o = CT) {
  const by = { c: [], t: [] };
  for (const x of list) if (by[x.faction]) by[x.faction].push(x);
  by.c.sort(better);
  by.t.sort(better);
  const nc = Math.min(o.team, by.c.length, by.t.length + o.maxGap), nt = Math.min(o.team, by.t.length, by.c.length + o.maxGap);
  return {
    c: by.c.slice(0, nc), t: by.t.slice(0, nt), bench: { c: by.c.slice(nc), t: by.t.slice(nt) },
    ok: nc >= o.minSide && nt >= o.minSide,
  };
}
/**
 * One fighter's điểm Chính Tà: nothing for staying less than minStay % of the battle or leaving it; else by the result
 * (w, l, d) + killPts a hạ gục (at most killCap) + mvp for the best of their side.
 */
export function pointsFor({ result, kills = 0, stayed = 1, mvp = false, left = false }, o = CT) {
  if (left || stayed * 100 < o.minStay) return 0;
  const base = result === "w" ? o.win : result === "l" ? o.lose : o.draw;
  return base + Math.min(o.killCap, kills * o.killPts) + (mvp ? o.mvp : 0);
}
