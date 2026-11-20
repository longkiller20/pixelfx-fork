// Đa vũ trụ tu tiên: every number the game is balanced on. The server and the browser both import this file.
//
// The numbers themselves live in the database (tables realms, items, monsters, skills, settings), so an admin can add a
// realm, a pill or retune a skill without touching code: the server reads them at start and every few seconds, then
// pushes them to every browser. DEFAULTS below is only the first content a fresh database is filled with. applyConfig()
// takes a config (from the database, or DEFAULTS) and rebuilds every export in place, so code that imported REALMS,
// ITEMS, MONSTERS, CLASSES, PVP... keeps seeing the current numbers.
//
// How balance works:
//  - Everyone has the same stats and arts; the sword cut at close range out-damages the flying sword over time,
//    because it has to get close.
//  - Levels make you stronger in the open world (up to about 2x at the top), but on PvP maps the bonus is squeezed to
//    at most +10%, so a newcomer can still beat a veteran there. Healing pills can't be used on PvP maps.
//  - Rewards for killing the same player again are cut off for a while, so friends can't farm each other.
import { CONG_PHAP_BY_KEY } from "./cong-phap.js";

export const TICK_HZ = 20;
// Maps (size, walls, spawn, the spirit vein, the ways out) live in shared/maps/.
export const PLAYER_R = 14; // body radius on the ground plane

export const NAME_RE = /^[\p{L}\p{N}_ ]{3,16}$/u;
export const USER_RE = /^[a-zA-Z0-9_]{3,16}$/;

// A character's look: a gender, a hair style and a robe. Which styles exist, what they cost and which are free at
// creation lives in the cosmetics table; idx is the number of the part's folder, public/toc-nam/<idx>-<name>/ and so on.
export const GENDERS = ["m", "f"];
export const COSMETIC_KINDS = ["hair", "robe"];
const idxOk = (v) => Number.isInteger(v) && v >= 0 && v < 1000;
export const validLook = (g, hair, robe) => GENDERS.includes(g) && idxOk(hair) && idxOk(robe);

// Buffs an admin can give one player, per stat, in percent (+20 = 20% more), with the range each allows.
export const BUFF_STATS = {
  hp: { name: "Sinh lực", min: -50, max: 500 },
  atk: { name: "Công", min: -50, max: 500 },
  def: { name: "Thủ", min: -50, max: 500 },
  spd: { name: "Tốc độ", min: -50, max: 100 },
  exp: { name: "Tu vi nhận được", min: -100, max: 1000 },
  stones: { name: "Linh thạch nhận được", min: -100, max: 1000 },
  med: { name: "Tốc độ tu luyện", min: -100, max: 1000 },
};

/** Damage taken after defense. */
export const mitigate = (def) => 100 / (100 + def);

// ---------------------------------------------------------------- the first content of a fresh database
// Skill types the server knows: melee (an arc in front: range, arc), bolt (a projectile: range, speed, r), zone (an area
// some way ahead that hits after a beat and slows: dist, r, delay, slow, slowDur). cd in seconds, mult x attack, px.
export const SKILL_PARAMS = { melee: ["range", "arc"], bolt: ["range", "speed", "r"], zone: ["dist", "r", "delay", "slow", "slowDur"] };
// Công pháp (arts): each designed in code (shared/cong-phap.js); up to ART_SLOTS of them on the bar at once.
export const ART_SLOTS = 5;
export const ITEM_KINDS = ["pill", "book", "material"];
// Monsters: any type an admin adds, drawn with a pixelfx effect (`fx`, the critters), or as a straw dummy. The maps place
// them by type, so the types a map uses must exist. style: melee (rushes in and strikes at `reach`), ranged (keeps its
// distance and shoots `shotFx` within `range`), none (stands, like the dummies). fly: hovers and goes where it likes;
// otherwise it walks the ground with gravity and hops walls. Each kill: dropRate is the chance of a drop, and then exactly
// one item drops, picked by weight from that monster's drop list (and the "*" list if commonDrops).
export const MONSTER_TYPES = ["dummy"]; // used by the maps
export const MONSTER_STYLES = ["melee", "ranged", "none"];

// a monster's look and way of fighting: its pixelfx effect, style, flying, drop chance; and for shooters their range,
// shot speed and shot effect
const M = (fx, style, fly, dropRate, range = 0, shotSpeed = 0, shotFx = "") => ({ fx, style, fly, dropRate, range, shotSpeed, shotFx, commonDrops: fx === "critters/ghost" });
export const DEFAULTS = {
  realms: ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Luyện Hư", "Hợp Thể", "Đại Thừa", "Độ Kiếp"].map((name) => ({ name, stages: 5 })),
  // the basic attack on the big button; the arts are designed in shared/cong-phap.js
  skills: [{ slot: 0, name: "Kiếm Khí Trảm", type: "melee", cd: 0.6, mult: 0.85, params: { range: 54, arc: 1.4 } }],
  items: [
    { key: "hoixuan", name: "Hồi Xuân Đan", desc: "Hồi 40% sinh lực. Không dùng được trong đấu trường", price: 12, heal: 0.4, expBase: 0, expPerLevel: 0, cd: 15, onSale: true, sort: 1 },
    { key: "tukhi", name: "Tụ Khí Đan", desc: "Tăng tu vi ngay lập tức", price: 40, heal: 0, expBase: 150, expPerLevel: 30, cd: 1, onSale: true, sort: 2 },
  ],
  monsters: [
    { ...M("", "none", 0, 0), type: "dummy", name: "Bù Nhìn Rơm", hp: 500, atk: 0, def: 10, spd: 0, respawn: 5, expBase: 2, expPerLevel: 0, stones: 0, aggro: 0, reach: 0, cd: 0, mult: 0 },
    { type: "ghost", name: "Âm Hồn", hp: 420, atk: 30, def: 12, spd: 62, respawn: 8, expBase: 30, expPerLevel: 4, stones: 2, aggro: 150, reach: 40, cd: 1.2, mult: 1, ...M("critters/ghost", "melee", 1, 0.3) },
    // the rest of pixelfx's critters; on no map yet (they come with the next maps). An admin can drop one by a player to try
    { type: "bat", name: "Huyết Bức", hp: 300, atk: 24, def: 6, spd: 110, respawn: 8, expBase: 22, expPerLevel: 3, stones: 1, aggro: 170, reach: 40, cd: 0.9, mult: 1, ...M("critters/bat", "melee", 1, 0.3) },
    { type: "bird", name: "Linh Điểu", hp: 260, atk: 20, def: 5, spd: 130, respawn: 8, expBase: 20, expPerLevel: 3, stones: 1, aggro: 150, reach: 40, cd: 0.8, mult: 1, ...M("critters/bird", "melee", 1, 0.3) },
    { type: "butterfly", name: "Huyễn Điệp", hp: 220, atk: 18, def: 4, spd: 80, respawn: 9, expBase: 22, expPerLevel: 3, stones: 1, aggro: 190, reach: 0, cd: 1.8, mult: 1, ...M("critters/butterfly", "ranged", 1, 0.3, 160, 180, "arcane/arcane-orb") },
    { type: "eyeball", name: "Ma Nhãn", hp: 480, atk: 34, def: 14, spd: 50, respawn: 12, expBase: 40, expPerLevel: 5, stones: 2, aggro: 240, reach: 0, cd: 1.6, mult: 1, ...M("critters/eyeball", "ranged", 1, 0.35, 220, 360, "projectiles/laser-bolt") },
    { type: "fish_school", name: "Ngư Yêu Quần", hp: 360, atk: 22, def: 8, spd: 100, respawn: 9, expBase: 26, expPerLevel: 3, stones: 1, aggro: 160, reach: 44, cd: 1, mult: 1, ...M("critters/fish-school", "melee", 1, 0.3) },
    { type: "flying_skull", name: "Phi Đầu Lâu", hp: 520, atk: 38, def: 16, spd: 70, respawn: 12, expBase: 45, expPerLevel: 5, stones: 3, aggro: 230, reach: 0, cd: 2, mult: 1.2, ...M("critters/flying-skull", "ranged", 1, 0.35, 200, 260, "fire/fireball") },
    { type: "frog", name: "Độc Thiềm", hp: 380, atk: 28, def: 10, spd: 90, respawn: 10, expBase: 28, expPerLevel: 4, stones: 1, aggro: 160, reach: 36, cd: 1.1, mult: 1, ...M("critters/frog", "melee", 0, 0.3) },
    { type: "jellyfish", name: "Thủy Mẫu Tinh", hp: 340, atk: 26, def: 8, spd: 50, respawn: 10, expBase: 32, expPerLevel: 4, stones: 2, aggro: 200, reach: 0, cd: 1.8, mult: 1, ...M("critters/jellyfish", "ranged", 1, 0.3, 170, 200, "water/water-orb") },
    { type: "slime", name: "Nhuyễn Yêu", hp: 500, atk: 22, def: 18, spd: 60, respawn: 10, expBase: 24, expPerLevel: 3, stones: 1, aggro: 140, reach: 34, cd: 1.3, mult: 1, ...M("critters/slime", "melee", 0, 0.3) },
    { type: "snake", name: "Thanh Xà", hp: 400, atk: 32, def: 10, spd: 95, respawn: 10, expBase: 30, expPerLevel: 4, stones: 2, aggro: 170, reach: 42, cd: 1, mult: 1, ...M("critters/snake", "melee", 0, 0.3) },
    { type: "wisp", name: "Quỷ Hỏa", hp: 300, atk: 30, def: 6, spd: 90, respawn: 10, expBase: 34, expPerLevel: 4, stones: 2, aggro: 210, reach: 0, cd: 1.7, mult: 1, ...M("critters/wisp", "ranged", 1, 0.3, 190, 240, "fire/spirit-flame") },
  ],
  // [value, what it means] — the meaning is stored beside the value for whoever edits it
  settings: {
    "class.hp": [1000, "Sinh lực gốc của nhân vật (cấp 1)"],
    "class.atk": [60, "Công gốc"],
    "class.def": [28, "Thủ gốc"],
    "class.spd": [96, "Tốc độ gốc (px/giây trước hệ số chạy)"],
    "exp.base": [60, "Tu vi để lên 1 tầng = exp.base × cấp ^ exp.power"],
    "exp.power": [1.7, "Số mũ của đường tu vi (lớn hơn = các tầng cao khó hơn nhiều)"],
    "level.world_bonus": [0.025, "Mỗi cấp mạnh thêm bao nhiêu ngoài thế giới (0.025 = 2,5%)"],
    "arena.max_bonus": [0.1, "Ở đấu trường, cấp cao nhất chỉ mạnh hơn cấp 1 tối đa bấy nhiêu (0.1 = 10%)"],
    "start.stones": [20, "Linh thạch khi tạo nhân vật"],
    "start.hoixuan": [2, "Số Hồi Xuân Đan tặng khi tạo nhân vật"],
    "daily.stones": [30, "Linh thạch của quà mỗi ngày"],
    "shop.buy_max": [10, "Mỗi lần mua tối đa bao nhiêu viên"],
    "meditate.base": [3, "Tu vi mỗi giây khi ngồi thiền ở Thái Cực Đài"],
    "meditate.levels_per_bonus": [3, "Cứ bấy nhiêu cấp thì tu luyện thêm 1 tu vi/giây"],
    "meditate.daily_cap": [8000, "Tu vi tối đa nhận từ ngồi thiền mỗi ngày"],
    "meditate.calm_after_hit": [3, "Giây phải yên sau khi bị đánh mới ngồi thiền được"],
    "pvp.exp_base": [40, "Tu vi khi hạ người chơi: pvp.exp_base + pvp.exp_per_level × cấp"],
    "pvp.exp_per_level": [3, "Phần tu vi PvP tăng theo cấp"],
    "pvp.stones": [5, "Linh thạch khi hạ người chơi"],
    "pvp.rank_win": [15, "Điểm đấu trường được khi thắng"],
    "pvp.rank_lose": [10, "Điểm đấu trường mất khi thua"],
    "pvp.repeat_cooldown": [120, "Giây trước khi hạ lại cùng một người mới có thưởng"],
    "pvp.spawn_protect": [2, "Giây miễn sát thương sau khi hồi sinh"],
    "pvp.respawn": [3, "Giây chờ hồi sinh ở đấu trường"],
    "respawn.world": [4, "Giây chờ hồi sinh ngoài thế giới"],
    "fly.realm": [2, "Cảnh giới mở khoá Ngự Kiếm Phi Hành, đếm từ 1 (1 = Luyện Khí, 2 = Trúc Cơ, 3 = Kim Đan…): tới tầng 1 của cảnh giới này là bay được"],
    "fly.speed": [1.35, "Tốc độ bay = tốc độ đi × hệ số này"],
    "fly.arena": [0, "1: được ngự kiếm trong đấu trường; 0: không"],
    // Gia Viên (shared/gia-vien.js, server/gia-vien.js)
    "home.unlock_cost": [50000, "Linh thạch để mở khoá Gia Viên (mỗi người một lần)"],
    "home.max_animals": [12, "Số vật nuôi tối đa trong Nông Trại"],
    // trò chuyện, Đạo Hữu, Truyền Âm (server/dao-huu.js)
    "chat.world_cooldown": [4, "Giây chờ giữa hai lần nói ở kênh Thế Giới (kênh Khu Vực, Tông Môn: 1 giây)"],
    "social.friends_max": [100, "Mỗi người có tối đa bấy nhiêu Đạo Hữu"],
    "social.requests_max": [20, "Mỗi người gửi tối đa bấy nhiêu lời mời kết giao đang chờ"],
    "social.blocks_max": [200, "Mỗi người chặn tối đa bấy nhiêu người"],
    "pm.keep_days": [30, "Truyền Âm được lưu bấy nhiêu ngày rồi tự xoá"],
    // Tông Môn (shared/tong-mon.js, server/tong-mon.js)
    "sect.create_level": [6, "Cấp tối thiểu để khai lập tông môn (6 = Trúc Cơ tầng 1 với cảnh giới mặc định)"],
    "sect.create_cost": [1000, "Linh thạch để khai lập tông môn"],
    "sect.max_level": [10, "Cấp tông môn cao nhất"],
    "sect.exp_base": [2000, "Kinh nghiệm tông môn để lên cấp L+1 = sect.exp_base × L^1,5"],
    "sect.members_base": [10, "Số thành viên tối đa ở cấp 1"],
    "sect.members_per_level": [3, "Mỗi cấp tông môn nhận thêm bấy nhiêu thành viên"],
    "sect.vices": [2, "Số Phó Tông Chủ tối đa"],
    "sect.elders": [4, "Số Trưởng Lão tối đa"],
    "sect.bonus_per_level": [1, "Mỗi cấp tông môn trên 1: thành viên mạnh thêm bấy nhiêu % sinh lực, công, thủ (ngoài thế giới, không tính ở đấu trường)"],
    "sect.donate_min": [10, "Mỗi lần quyên góp ít nhất bấy nhiêu linh thạch"],
    "sect.donate_daily": [20000, "Mỗi người quyên tối đa bấy nhiêu linh thạch mỗi ngày"],
    "sect.contrib_per_stone": [1, "Điểm cống hiến nhận được cho mỗi linh thạch quyên góp"],
    "sect.checkin_contrib": [20, "Điểm cống hiến khi điểm danh mỗi ngày"],
    "sect.checkin_exp": [50, "Kinh nghiệm tông môn mỗi lần một người điểm danh"],
    "sect.inner_contrib": [300, "Ngoại Môn Đệ Tử có tổng cống hiến từ bấy nhiêu thì tự lên Nội Môn"],
    "sect.rejoin_hours": [12, "Rời hoặc bị trục xuất thì sau bấy nhiêu giờ mới gia nhập tông môn khác được"],
    "sect.apply_max": [3, "Mỗi người gửi tối đa bấy nhiêu đơn cùng lúc"],
    "sect.apply_days": [3, "Đơn xin gia nhập hết hạn sau bấy nhiêu ngày"],
    "sect.array_level": [3, "Tông môn từ cấp này mới khai mở được Hộ Sơn Đại Trận"],
    "sect.array_cost": [3000, "Linh thạch trong ngân khố để khai mở Hộ Sơn Đại Trận"],
    "sect.array_minutes": [60, "Hộ Sơn Đại Trận kéo dài bấy nhiêu phút"],
    "sect.array_atk": [10, "Hộ Sơn Đại Trận: thành viên tăng bấy nhiêu % công (ngoài thế giới)"],
  },
};

// ---------------------------------------------------------------- the live numbers, rebuilt by applyConfig
export const REALMS = []; // [{ name, stages }]
export let MAX_LEVEL = 1;
export const CLASS = "tu";
export const CLASSES = { tu: { name: "Tu Sĩ", hp: 0, atk: 0, def: 0, spd: 0, skills: [] } };
export const ITEMS = {}; // key -> { name, kind, desc, price, heal, cd, onSale, sort, exp(L) }
export const ARTS = {}; // key -> shared/cong-phap.js's art, plus the admin's switches: enabled, learnable (and source)
export const ART_LIST = []; // the enabled arts in display order
export const STARTER_ARTS = []; // known by everyone; what a fresh bar holds
export const DROPS = {}; // monster type or "*" -> [{ item, chance, min, max }]
export const MONSTERS = {}; // type -> { name, hp, atk, def, spd, respawn, stones, aggro, reach, cd, mult, exp(L) }
export const PVP = {};
export const MEDITATE = {};
export const START = {};
// Tông Môn's numbers (settings sect.*), by name
export const SECT = {};
// Gia Viên's numbers (settings home.*)
export const HOME = {};
// chat, Đạo Hữu and Truyền Âm's numbers (settings chat.*, social.*, pm.*)
export const SOCIAL = {};
// ngự kiếm phi hành: unlocked at level FLY.level (the first stage of realm FLY.realm), flying at FLY.speed × walking
export const FLY = { realm: 2, level: 6, speed: 1.35, arena: false };
export let RESPAWN_WORLD = 4, DAILY_STONES = 30, BUY_MAX = 10;
let SET = {}, TOTAL = [0, 0], LEVELS = [[0, 1]];

const num = (v, what, min = 0, max = 1e9) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${what}: ${v} không hợp lệ (cần từ ${min} đến ${max})`);
  return n;
};
const str = (v, what, max = 40) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > max) throw new Error(`${what}: cần chữ, dài 1-${max} ký tự`);
  return s;
};

/**
 * Check a whole config and turn it into the game's numbers. Throws (and changes nothing) if any of it is wrong, so a bad
 * edit in the database can never take the live game down. c: { realms, skills, items, monsters, settings } as in DEFAULTS
 * (settings values may be plain numbers).
 */
export function checkConfig(c) {
  const S = {};
  for (const [k, d] of Object.entries(DEFAULTS.settings)) {
    const v = c.settings?.[k];
    S[k] = num(Array.isArray(v) ? v[0] : v ?? d[0], `settings ${k}`, k === "exp.power" ? 0.5 : 0, k === "exp.power" ? 4 : 1e9);
  }
  num(S["fly.realm"], "fly.realm (cảnh giới mở khoá phi hành)", 1, 100);
  num(S["fly.speed"], "fly.speed (hệ số tốc độ bay)", 0.2, 5);
  num(S["sect.max_level"], "sect.max_level (cấp tông môn cao nhất)", 1, 100);
  num(S["sect.members_base"], "sect.members_base (thành viên ở cấp 1)", 1, 500);
  num(S["sect.members_per_level"], "sect.members_per_level", 0, 100);
  num(S["sect.bonus_per_level"], "sect.bonus_per_level (% mỗi cấp tông môn)", 0, 50);
  num(S["sect.array_atk"], "sect.array_atk (% công của đại trận)", 0, 200);
  num(S["sect.array_minutes"], "sect.array_minutes", 1, 1440);
  num(S["sect.exp_base"], "sect.exp_base", 1, 1e8);
  if (!Array.isArray(c.realms) || !c.realms.length) throw new Error("Cần ít nhất một cảnh giới");
  const realms = c.realms.map((r, i) => ({ name: str(r.name, `cảnh giới ${i + 1}`, 32), stages: num(r.stages, `số tầng của ${r.name}`, 1, 20) | 0 }));
  if (realms.reduce((a, r) => a + r.stages, 0) > 500) throw new Error("Tổng số tầng tối đa 500");
  const skills = [0].map((slot) => {
    const s = c.skills?.find((x) => Number(x.slot) === slot);
    if (!s) throw new Error(`Thiếu chiêu ô ${slot}`);
    if (!SKILL_PARAMS[s.type]) throw new Error(`Chiêu ${slot}: loại "${s.type}" không có (melee, bolt, zone)`);
    const params = typeof s.params === "string" ? JSON.parse(s.params) : s.params ?? {};
    const out = { key: `s${slot + 1}`, name: str(s.name, `tên chiêu ${slot}`), type: s.type, cd: num(s.cd, `hồi chiêu ${slot}`, 0.1, 600), mult: num(s.mult, `hệ số chiêu ${slot}`, 0, 50) };
    for (const p of SKILL_PARAMS[s.type]) out[p] = num(params[p], `chiêu ${slot} ${p}`, 0, 5000);
    return out;
  });
  const items = {};
  for (const it of c.items ?? []) {
    const key = str(it.key, "mã vật phẩm", 32);
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`Mã vật phẩm "${key}": chỉ chữ thường không dấu, số, _`);
    items[key] = {
      name: str(it.name, `tên ${key}`), desc: String(it.desc ?? "").slice(0, 200), price: num(it.price, `giá ${key}`) | 0,
      heal: num(it.heal ?? 0, `hồi máu ${key}`, 0, 1), expBase: num(it.expBase ?? 0, `tu vi ${key}`) | 0, expPerLevel: num(it.expPerLevel ?? 0, `tu vi/cấp ${key}`) | 0,
      cd: num(it.cd ?? 1, `hồi ${key}`, 0.2, 3600), onSale: it.onSale !== false && it.onSale !== 0, sort: Number(it.sort) || 0,
      kind: it.kind ?? "pill",
    };
    if (!ITEM_KINDS.includes(items[key].kind)) throw new Error(`Vật phẩm ${key}: loại "${it.kind}" không có (${ITEM_KINDS.join(", ")})`);
  }
  const monsters = {};
  for (const m of c.monsters ?? []) {
    if (!/^[a-z0-9_]{2,16}$/.test(String(m.type))) throw new Error(`Mã yêu thú "${m.type}": 2-16 chữ thường không dấu, số, _`);
    const style = m.style ?? "melee";
    if (!MONSTER_STYLES.includes(style)) throw new Error(`Yêu thú ${m.type}: kiểu đánh "${style}" không có (${MONSTER_STYLES.join(", ")})`);
    for (const k of ["fx", "shotFx"]) if (m[k] && !/^[a-z]+\/[a-z0-9-]+$/.test(m[k])) throw new Error(`Yêu thú ${m.type}: hiệu ứng "${m[k]}" sai dạng (vd critters/bat)`);
    if (style === "ranged" && !(Number(m.range) > 0 && Number(m.shotSpeed) > 0)) throw new Error(`Yêu thú ${m.type} đánh xa: cần tầm bắn và tốc độ đạn lớn hơn 0`);
    monsters[m.type] = {
      fx: String(m.fx ?? ""), style, fly: !!m.fly && m.fly !== "0", range: num(m.range ?? 0, `${m.type} tầm bắn`, 0, 2000), shotSpeed: num(m.shotSpeed ?? 0, `${m.type} tốc độ đạn`, 0, 3000),
      shotFx: String(m.shotFx ?? ""), dropRate: num(m.dropRate ?? 0, `${m.type} tỉ lệ rơi đồ`, 0, 1),
      name: str(m.name, `tên ${m.type}`), hp: num(m.hp, `${m.type} hp`, 1), atk: num(m.atk, `${m.type} atk`), def: num(m.def, `${m.type} def`),
      spd: num(m.spd, `${m.type} spd`, 0, 1000), respawn: num(m.respawn, `${m.type} respawn`, 0.5, 3600), expBase: num(m.expBase, `${m.type} exp`) | 0,
      expPerLevel: num(m.expPerLevel, `${m.type} exp/cấp`) | 0, stones: num(m.stones, `${m.type} linh thạch`) | 0, aggro: num(m.aggro ?? 0, `${m.type} aggro`, 0, 2000),
      reach: num(m.reach ?? 0, `${m.type} reach`, 0, 500), cd: num(m.cd ?? 0, `${m.type} cd`, 0, 60), mult: num(m.mult ?? 0, `${m.type} mult`, 0, 50),
    };
  }
  for (const t of MONSTER_TYPES) if (!monsters[t]) throw new Error(`Thiếu yêu thú ${t}`);
  for (const m of c.monsters ?? []) if (monsters[m.type]) monsters[m.type].commonDrops = m.commonDrops !== false && m.commonDrops !== 0;
  // the arts are the ones designed in code; the database only switches each: on or off, learnable with its bí kíp (or
  // only given: events, activities). An art without a row is on and learnable. Arts are never sold.
  const arts = {}, sw = Object.fromEntries((c.arts ?? []).map((a) => [a.key, a]));
  // what learning each spends: the admin's list (cong_phap_reqs), or the art's own first list before the database is read
  const need = {};
  for (const r of c.reqs ?? []) {
    if (!CONG_PHAP_BY_KEY[r.art]) throw new Error(`Vật phẩm lĩnh ngộ: công pháp "${r.art}" không có`);
    if (CONG_PHAP_BY_KEY[r.art].starter) throw new Error(`${CONG_PHAP_BY_KEY[r.art].name} ai cũng biết sẵn, không cần vật phẩm`);
    if (!items[r.item]) throw new Error(`Vật phẩm lĩnh ngộ của ${CONG_PHAP_BY_KEY[r.art].name}: vật phẩm "${r.item}" không có`);
    (need[r.art] ??= []).push({ item: r.item, qty: num(r.qty, `số lượng ${r.item} cho ${r.art}`, 1, 9999) | 0 });
  }
  for (const def of Object.values(CONG_PHAP_BY_KEY)) {
    const a = sw[def.key] ?? {}, on = (v, d) => (v === undefined || v === null ? d : v === true || v === 1 || v === "1");
    // an item it needs that isn't there (only before the database is read): it can't be learned until it is
    const reqs = c.reqs ? need[def.key] ?? [] : def.reqs;
    const learnable = !def.starter && on(a.learnable, true) && reqs.every((r) => items[r.item]);
    arts[def.key] = { ...def, reqs, enabled: on(a.enabled, true), learnable, source: def.starter ? "starter" : learnable ? "learn" : "event" };
  }
  const drops = {};
  for (const d of c.drops ?? []) {
    if (d.monster !== "*" && !monsters[d.monster]) throw new Error(`Rơi đồ: yêu thú "${d.monster}" không có (hoặc * cho mọi yêu thú)`);
    if (!items[d.item]) throw new Error(`Rơi đồ: vật phẩm "${d.item}" không có`);
    const min = num(d.min, `số lượng tối thiểu ${d.item}`, 1, 999) | 0, max = num(d.max, `số lượng tối đa ${d.item}`, 1, 999) | 0;
    if (max < min) throw new Error(`Rơi đồ ${d.item}: tối đa nhỏ hơn tối thiểu`);
    // chance is a weight now: one item is picked per drop, each with chance / (the list's total)
    (drops[d.monster] ??= []).push({ item: d.item, chance: num(d.chance, `trọng số rơi ${d.item}`, 0, 1e6), min, max });
  }
  return { realms, skills, items, monsters, settings: S, arts, drops };
}

/** Make c the live numbers (checks it first; on error nothing changes and the error is thrown). Returns the checked c. */
export function applyConfig(c) {
  const k = checkConfig(c), S = k.settings;
  SET = S;
  REALMS.splice(0, REALMS.length, ...k.realms);
  LEVELS = [[0, 1]];
  k.realms.forEach((r, i) => {
    for (let s = 1; s <= r.stages; s++) LEVELS.push([i, s]);
  });
  MAX_LEVEL = LEVELS.length - 1;
  TOTAL = [0, 0];
  for (let L = 1; L <= MAX_LEVEL; L++) TOTAL[L + 1] = TOTAL[L] + expStep(L);
  Object.assign(CLASSES.tu, { hp: S["class.hp"], atk: S["class.atk"], def: S["class.def"], spd: S["class.spd"], skills: k.skills });
  for (const key of Object.keys(ITEMS)) if (!k.items[key]) delete ITEMS[key];
  for (const [key, it] of Object.entries(k.items))
    ITEMS[key] = Object.assign(ITEMS[key] ?? {}, it, { exp: it.expBase || it.expPerLevel ? (L) => it.expBase + it.expPerLevel * L : undefined });
  for (const [t, m] of Object.entries(k.monsters)) MONSTERS[t] = Object.assign(MONSTERS[t] ?? {}, m, { exp: (L) => m.expBase + m.expPerLevel * L });
  for (const key of Object.keys(ARTS)) if (!k.arts[key]) delete ARTS[key];
  Object.assign(ARTS, k.arts);
  ART_LIST.splice(0, ART_LIST.length, ...Object.values(k.arts).filter((a) => a.enabled).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)));
  STARTER_ARTS.splice(0, STARTER_ARTS.length, ...ART_LIST.filter((a) => a.starter).map((a) => a.key));
  for (const key of Object.keys(DROPS)) delete DROPS[key];
  Object.assign(DROPS, k.drops);
  Object.assign(PVP, {
    exp: (L) => S["pvp.exp_base"] + S["pvp.exp_per_level"] * L, stones: S["pvp.stones"], rankWin: S["pvp.rank_win"], rankLose: S["pvp.rank_lose"],
    repeatCooldown: S["pvp.repeat_cooldown"], spawnProtect: S["pvp.spawn_protect"], respawn: S["pvp.respawn"],
  });
  Object.assign(MEDITATE, {
    perSec: (L) => S["meditate.base"] + Math.floor(L / Math.max(1, S["meditate.levels_per_bonus"])),
    dailyCap: S["meditate.daily_cap"] | 0, calmAfterHit: S["meditate.calm_after_hit"],
  });
  Object.assign(START, { stones: S["start.stones"] | 0, hoixuan: S["start.hoixuan"] | 0 });
  RESPAWN_WORLD = S["respawn.world"];
  {
    // a realm past the last one means flight is locked for everyone for now
    const r = Math.max(1, Math.round(S["fly.realm"] ?? 2));
    const level = r > REALMS.length ? Infinity : 1 + REALMS.slice(0, r - 1).reduce((a, x) => a + x.stages, 0);
    Object.assign(FLY, { realm: r, level, speed: S["fly.speed"] ?? 1.35, arena: (S["fly.arena"] ?? 0) >= 1 });
  }
  {
    const g = (k) => S[`sect.${k}`];
    Object.assign(SECT, {
      createLevel: g("create_level") | 0, createCost: g("create_cost") | 0, maxLevel: Math.max(1, g("max_level") | 0), expBase: Math.max(1, g("exp_base")),
      membersBase: Math.max(1, g("members_base") | 0), membersPerLevel: g("members_per_level") | 0, vices: g("vices") | 0, elders: g("elders") | 0,
      bonusPerLevel: g("bonus_per_level"), donateMin: Math.max(1, g("donate_min") | 0), donateDaily: g("donate_daily") | 0, contribPerStone: g("contrib_per_stone"),
      checkinContrib: g("checkin_contrib") | 0, checkinExp: g("checkin_exp") | 0, innerContrib: g("inner_contrib") | 0, rejoinHours: g("rejoin_hours"),
      applyMax: Math.max(1, g("apply_max") | 0), applyDays: Math.max(1, g("apply_days")), arrayLevel: Math.max(1, g("array_level") | 0), arrayCost: g("array_cost") | 0,
      arrayMinutes: Math.max(1, g("array_minutes")), arrayAtk: g("array_atk"),
    });
  }
  Object.assign(HOME, {
    unlockCost: S["home.unlock_cost"] | 0, maxAnimals: Math.max(1, S["home.max_animals"] | 0),
    // each ready-made house's name and price as the admin set them (the houses table), by its id; price 0: not sold
    houses: Object.fromEntries((c.houses ?? []).map((h) => [h.key, { name: String(h.name ?? "").slice(0, 40), price: Math.max(0, Number(h.price) | 0), sort: Number(h.sort) | 0 }])),
  });
  Object.assign(SOCIAL, {
    worldCooldown: Math.max(1, S["chat.world_cooldown"]), friendsMax: Math.max(1, S["social.friends_max"] | 0), requestsMax: Math.max(1, S["social.requests_max"] | 0),
    blocksMax: Math.max(1, S["social.blocks_max"] | 0), keepDays: Math.max(1, S["pm.keep_days"]),
  });
  DAILY_STONES = S["daily.stones"] | 0;
  BUY_MAX = Math.max(1, S["shop.buy_max"] | 0);
  return k;
}

/** Exp to go from level L to L + 1. */
export const expStep = (L) => Math.round(SET["exp.base"] * Math.pow(L, SET["exp.power"]));
/** Total exp needed to reach level L. */
export const expForLevel = (L) => TOTAL[Math.max(1, Math.min(MAX_LEVEL, L))];
export function levelFromExp(exp) {
  let L = 1;
  while (L < MAX_LEVEL && exp >= TOTAL[L + 1]) L++;
  return L;
}
/** Whether a character of level L may ride a flying sword. */
export const canFly = (L) => L >= FLY.level;
/** The realm flight opens at, by name ("Trúc Cơ"), for messages. */
export const flyRealmName = () => REALMS[FLY.realm - 1]?.name ?? "(chưa mở)";
export function realmName(L) {
  const [i, s] = LEVELS[Math.max(1, Math.min(MAX_LEVEL, L))];
  return `${REALMS[i].name} tầng ${s}`;
}
/** Stat multiplier by level: open world, and squeezed for the arena. */
export const worldMult = (L) => 1 + SET["level.world_bonus"] * (L - 1);
export const arenaMult = (L) => 1 + (SET["arena.max_bonus"] * (L - 1)) / Math.max(1, MAX_LEVEL - 1);

applyConfig(DEFAULTS);
