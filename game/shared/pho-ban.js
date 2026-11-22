// Tổ Đội and Phó Bản: a party of one to four going together into a dungeon of their own (a copy of its map made for
// them alone). Shared by the server (server/to-doi.js, server/pho-ban.js), the browser and the admin.
//
// A party (Tổ Đội): made by its first invitation (or alone, to go in alone); the leader invites by name, the invited one
// accepts or declines within PARTY.inviteSeconds; at most PB.party people; the leader may hand the lead to another or
// put someone out; whoever leaves last ends it; a member who drops their connection keeps their place PARTY.awaySeconds.
//
// A dungeon (Phó Bản): the leader asks; everyone in the party is asked if they are ready (PARTY.readySeconds); when all
// are, each one's entry for the day is counted (at most PB.daily a day each) and they are all taken in together. Inside:
//  - stages, one after another, each closed off by a seal (phong ấn) until the one before is cleared;
//  - the monsters are the road's, stronger by party size; an elite (Thống Lĩnh) guards the second stage's end;
//  - the last stage is the boss's: it strikes and roars as the world boss does, calls help at half its life and rages
//    at a quarter;
//  - lives (lượt hồi sinh) are shared by the party: each fall spends one, rising at the stage's checkpoint; a fall with
//    none left ends the run;
//  - a time limit; when it runs out the run fails.
// Cleared: each one who is still in the run (or dropped and kept their place) gets the rewards, scaled by the rank the
// time earned (S, A, B), and the first clear of the day pays more. Failed or abandoned: nothing (the entry is spent).

/** The live numbers (settings pb.*, set by balance.js applyConfig). */
export const PB = {
  party: 4, daily: 3, minutes: 15, lives: 3, livesPerMember: 1, respawn: 5, level: 6,
  hpPerMember: 60, atkPerMember: 10, monsterHp: 2, monsterAtk: 1.3,
  bossHp: 60000, bossAtk: 90, bossDef: 60, roarEvery: 20, roarPct: 15, thornsPct: 4,
  stones: 800, exp: 6000, firstBonus: 50, rankS: 40, rankA: 70, mulS: 150, mulA: 120,
  hoixuan: 2, tukhi: 1,
};
/** Party rules (fixed). */
export const PARTY = { inviteSeconds: 60, readySeconds: 20, awaySeconds: 300 };

/**
 * The dungeons. Each one has a map of its own (shared/maps/<map>.js, `stages` there say where each one is) and its
 * stages here: what lives in each, in order. type: a monster of shared/balance.js; n: how many; elite: a Thống Lĩnh
 * (more life, harder hits). The last stage's boss is a world boss's figure (shared/boss.js) with the run's numbers.
 */
export const DUNGEONS = {
  xaquat: {
    key: "xaquat",
    name: "Cửu U Xà Quật",
    map: "xaquat",
    desc: "Hang rắn dưới đáy Cửu U, nơi Cửu U Xà Vương ngủ say. Ba tầng hang: Xà Huyệt đầy rắn độc và cóc, Độc Chướng Đầm nơi dơi máu, quỷ hỏa và ma nhãn bay lượn cùng Thanh Xà Thống Lĩnh canh giữ, rồi tới Cửu U Xà Đàn của Xà Vương.",
    stages: [
      {
        name: "Xà Huyệt", goal: "Diệt sạch yêu thú trong Xà Huyệt",
        mobs: [{ type: "snake", n: 4 }, { type: "frog", n: 3 }, { type: "slime", n: 3 }],
      },
      {
        name: "Độc Chướng Đầm", goal: "Diệt yêu thú và Thanh Xà Thống Lĩnh",
        mobs: [{ type: "bat", n: 3 }, { type: "wisp", n: 2 }, { type: "eyeball", n: 2 }, { type: "snake", n: 1, elite: true }],
      },
      {
        name: "Cửu U Xà Đàn", goal: "Hạ Cửu U Xà Vương",
        boss: "xavuong",
        // at half its life it calls these to its side; at a quarter it rages (strikes twice as often)
        help: [{ type: "snake", n: 2 }, { type: "wisp", n: 2 }],
      },
    ],
  },
};
export const DUNGEON_KEYS = Object.keys(DUNGEONS);

/** An elite: this much more life and attack than its kind, and a name of its own. */
export const ELITE = { hp: 6, atk: 1.6, title: "Thống Lĩnh" };

/** How much stronger the monsters are for a party of n: { hp, atk } multipliers (on top of PB.monsterHp/Atk). */
export const scaleFor = (n) => ({ hp: 1 + (PB.hpPerMember / 100) * Math.max(0, n - 1), atk: 1 + (PB.atkPerMember / 100) * Math.max(0, n - 1) });
/** Lives a party of n starts with. */
export const livesFor = (n) => PB.lives + PB.livesPerMember * Math.max(0, n - 1);
/** The rank for clearing in `secs` of a limit of `limit` seconds: S, A or B. */
export const rankOf = (secs, limit) => (secs <= (limit * PB.rankS) / 100 ? "S" : secs <= (limit * PB.rankA) / 100 ? "A" : "B");
/** A rank's reward multiplier (%). */
export const rankMul = (r) => (r === "S" ? PB.mulS : r === "A" ? PB.mulA : 100);
/**
 * One member's reward for a clear: stones, exp (×rank, + firstBonus% if it is their first clear today) and items.
 */
export function rewardFor(rank, first) {
  const k = (rankMul(rank) / 100) * (first ? 1 + PB.firstBonus / 100 : 1);
  const items = {};
  if (PB.hoixuan > 0) items.hoixuan = PB.hoixuan + (rank === "S" ? 1 : 0);
  if (PB.tukhi > 0) items.tukhi = PB.tukhi + (rank === "S" ? 1 : 0);
  return { stones: Math.round(PB.stones * k), exp: Math.round(PB.exp * k), items };
}
/** Today's date (Vietnam time) as YYYY-MM-DD: the day entries are counted for. */
export function dayOf(ms = Date.now()) {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}
/** The world key of run id. */
export const runKey = (id) => `pb:${id}`;
export const STATE_NAMES = { running: "Đang đánh", cleared: "Thông quan", failed: "Thất bại", abandoned: "Bỏ dở", cancelled: "Hủy" };
