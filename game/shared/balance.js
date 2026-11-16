// Đa vũ trụ tu tiên: every number the game is balanced on, in one file the server and the browser both import.
// The server is the only one that acts on these; the browser uses them to draw cooldowns, bars and tooltips.
//
// How balance works:
//  - Every class has the same stat budget (hp, atk, def, speed traded against each other) and its skills are tuned to
//    about the same damage per second; melee hits harder than ranged because it has to get close.
//  - Levels make you stronger in the open world (up to about 2x at the top), but on PvP maps the bonus is squeezed to
//    at most +10%, so a newcomer can still beat a veteran there. Healing pills can't be used on PvP maps.
//  - Rewards for killing the same player again are cut off for a while, so friends can't farm each other.

export const TICK_HZ = 20;
// Maps (size, walls, spawn, the spirit vein, the ways out) live in shared/maps/.
export const PLAYER_R = 14; // body radius on the ground plane

export const REALMS = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Luyện Hư", "Hợp Thể", "Đại Thừa", "Độ Kiếp"];
export const MAX_LEVEL = REALMS.length * 5;
/** Exp to go from level L to L + 1. */
export const expStep = (L) => Math.round(60 * Math.pow(L, 1.7));
const TOTAL = [0, 0];
for (let L = 1; L <= MAX_LEVEL; L++) TOTAL[L + 1] = TOTAL[L] + expStep(L);
/** Total exp needed to reach level L. */
export const expForLevel = (L) => TOTAL[Math.max(1, Math.min(MAX_LEVEL, L))];
export function levelFromExp(exp) {
  let L = 1;
  while (L < MAX_LEVEL && exp >= TOTAL[L + 1]) L++;
  return L;
}
export const realmName = (L) => `${REALMS[Math.floor((L - 1) / 5)]} tầng ${((L - 1) % 5) + 1}`;
/** Stat multiplier by level: open world, and squeezed for the arena. */
export const worldMult = (L) => 1 + 0.025 * (L - 1);
export const arenaMult = (L) => 1 + (0.1 * (L - 1)) / (MAX_LEVEL - 1);
/** Damage taken after defense. */
export const mitigate = (def) => 100 / (100 + def);

// Skill types the server knows: melee (an arc in front), breath (a cone that ticks), bolt (a projectile), zone (an area
// some way ahead that hits after a beat and slows), summon (a puppet that fights for you), devour (hit the nearest enemy and
// heal), transform (a timed form with stat multipliers). cd in seconds, mult x attack, ranges in px.
export const CLASSES = {
  long: {
    name: "Long Kỵ Sĩ",
    lore: "Võ giả khế ước cùng Hỏa Long, biến thân khoác long giáp. Cận chiến, trâu bò.",
    hp: 1100, atk: 60, def: 32, spd: 92,
    skills: [
      { key: "s1", name: "Long Trảo", type: "melee", cd: 0.6, mult: 0.8, range: 50, arc: 1.4 },
      { key: "s2", name: "Hỏa Long Phún", type: "breath", cd: 7, mult: 0.36, ticks: 6, every: 0.18, range: 140, arc: 0.6 },
      { key: "s3", name: "Long Giáp Biến Thân", type: "transform", cd: 28, dur: 9, atk: 1.2, def: 1.35, spd: 1.0 },
    ],
  },
  time: {
    name: "Thời Không Chúa Tể",
    lore: "Thiếu niên nắm giữ thời gian, biến thân thành Thời Vương. Đánh xa, khống chế.",
    hp: 900, atk: 64, def: 22, spd: 100,
    skills: [
      { key: "s1", name: "Thời Châm", type: "bolt", cd: 0.7, mult: 1.0, range: 220, speed: 320, r: 10 },
      { key: "s2", name: "Thời Đình", type: "zone", cd: 9, mult: 1.2, dist: 110, r: 60, delay: 0.35, slow: 0.5, slowDur: 2.5 },
      { key: "s3", name: "Thời Vương Biến Thân", type: "transform", cd: 28, dur: 9, atk: 1.3, def: 1.2, spd: 1.15 },
    ],
  },
  corpse: {
    name: "Khôi Thi Sư",
    lore: "Đạo sĩ luyện thi, sai khiến khôi thi thôn phệ địch. Triệu hồi, hút máu.",
    hp: 950, atk: 58, def: 26, spd: 96,
    skills: [
      { key: "s1", name: "Âm Phù", type: "bolt", cd: 0.75, mult: 0.95, range: 200, speed: 280, r: 10 },
      { key: "s2", name: "Triệu Khôi Thi", type: "summon", cd: 15, dur: 10, hp: 0.35, mult: 0.5, every: 1.0, spd: 110, reach: 30 },
      { key: "s3", name: "Thôn Phệ", type: "devour", cd: 12, mult: 1.6, range: 110, heal: 0.5 },
    ],
  },
};

export const MONSTERS = {
  dummy: { name: "Bù Nhìn Rơm", hp: 500, atk: 0, def: 10, spd: 0, respawn: 5, exp: (L) => 10 + 2 * L, stones: 1 },
  ghost: { name: "Âm Hồn", hp: 420, atk: 30, def: 12, spd: 62, respawn: 8, exp: (L) => 30 + 4 * L, stones: 2, aggro: 150, reach: 34, cd: 1.2, mult: 1.0 },
};

export const PVP = { exp: (L) => 40 + 3 * L, stones: 5, rankWin: 15, rankLose: 10, repeatCooldown: 120, spawnProtect: 2, respawn: 3 };
export const RESPAWN_WORLD = 4;
export const MEDITATE = { perSec: (L) => 3 + Math.floor(L / 3), dailyCap: 8000, calmAfterHit: 3 };
export const DAILY_STONES = 30;

export const ITEMS = {
  tukhi: { name: "Tụ Khí Đan", price: 40, desc: "Tăng tu vi ngay lập tức", exp: (L) => 150 + 30 * L },
  hoixuan: { name: "Hồi Xuân Đan", price: 12, desc: "Hồi 40% sinh lực. Không dùng được trong đấu trường", heal: 0.4, cd: 15 },
};
export const BUY_MAX = 10;

export const NAME_RE = /^[\p{L}\p{N}_ ]{3,16}$/u;
export const USER_RE = /^[a-zA-Z0-9_]{3,16}$/;
