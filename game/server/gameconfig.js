// The game's numbers in the database: realms, items (pills), monsters, skills and settings. The tables are created and
// filled with shared/balance.js DEFAULTS the first time; after that the database is the source and an admin edits it
// (tools/admin.mjs, or plain SQL). The server reads it at start and checks it again every few seconds: a valid change is
// applied live and pushed to every browser; a broken one is refused with a log line and the game keeps the last good set.
import { q, pool } from "./db.js";
import { DEFAULTS, applyConfig } from "../shared/balance.js";
import { ARTS_SEED, ART_ITEMS_SEED, ART_REQS_SEED, DROPS_SEED, ELEMENTS, ZONE_AIM } from "../shared/arts-seed.js";

// the element each critter's drops follow
const MONSTER_ELEMENT = { ghost: "am", bat: "am", bird: "phong", butterfly: "moc", eyeball: "huyen", fish_school: "thuy", flying_skull: "hoa", frog: "moc", jellyfish: "loi", slime: "thu", snake: "moc", wisp: "quang" };

export const CONFIG_SCHEMA = [
  // one row per realm, in sort order; each realm has `stages` levels ("tầng")
  `CREATE TABLE IF NOT EXISTS realms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sort INT NOT NULL DEFAULT 0,
    name VARCHAR(32) NOT NULL,
    stages TINYINT UNSIGNED NOT NULL DEFAULT 5
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // pills and other things sold at the Đan Các; heal is a fraction of max hp, exp = exp_base + exp_per_level × level
  `CREATE TABLE IF NOT EXISTS items (
    item_key VARCHAR(32) NOT NULL PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    description VARCHAR(200) NOT NULL DEFAULT '',
    price INT UNSIGNED NOT NULL DEFAULT 0,
    heal DOUBLE NOT NULL DEFAULT 0,
    exp_base INT UNSIGNED NOT NULL DEFAULT 0,
    exp_per_level INT UNSIGNED NOT NULL DEFAULT 0,
    cooldown DOUBLE NOT NULL DEFAULT 1,
    on_sale TINYINT(1) NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS monsters (
    type VARCHAR(16) NOT NULL PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    hp DOUBLE NOT NULL, atk DOUBLE NOT NULL, def DOUBLE NOT NULL, spd DOUBLE NOT NULL,
    respawn DOUBLE NOT NULL,
    exp_base INT UNSIGNED NOT NULL DEFAULT 0, exp_per_level INT UNSIGNED NOT NULL DEFAULT 0,
    stones INT UNSIGNED NOT NULL DEFAULT 0,
    aggro DOUBLE NOT NULL DEFAULT 0, reach DOUBLE NOT NULL DEFAULT 0, cooldown DOUBLE NOT NULL DEFAULT 0, mult DOUBLE NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // the three arts on the J/K/L buttons; params holds the type's own numbers as JSON (see SKILL_PARAMS)
  `CREATE TABLE IF NOT EXISTS skills (
    slot TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    type VARCHAR(16) NOT NULL,
    cd DOUBLE NOT NULL,
    mult DOUBLE NOT NULL,
    params VARCHAR(500) NOT NULL DEFAULT '{}'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // công pháp: every art a player can learn (see shared/arts-seed.js for the types and what `fx_at` means)
  `CREATE TABLE IF NOT EXISTS arts (
    art_key VARCHAR(32) NOT NULL PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL DEFAULT '',
    element VARCHAR(8) NOT NULL DEFAULT 'kim',
    tier TINYINT UNSIGNED NOT NULL DEFAULT 1,
    type VARCHAR(8) NOT NULL,
    cd DOUBLE NOT NULL,
    mult DOUBLE NOT NULL DEFAULT 0,
    params VARCHAR(500) NOT NULL DEFAULT '{}',
    fx VARCHAR(48) NOT NULL DEFAULT '',
    fx_at VARCHAR(8) NOT NULL DEFAULT 'front',
    fx_life DOUBLE NOT NULL DEFAULT 0,
    fx_scale DOUBLE NOT NULL DEFAULT 0,
    starter TINYINT(1) NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // what learning an art spends: every row is one item and how many
  `CREATE TABLE IF NOT EXISTS art_reqs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    art_key VARCHAR(32) NOT NULL,
    item_key VARCHAR(32) NOT NULL,
    qty INT UNSIGNED NOT NULL DEFAULT 1,
    UNIQUE KEY uq_req (art_key, item_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // what a monster may drop when killed: monster '*' means every monster with common drops on
  `CREATE TABLE IF NOT EXISTS monster_drops (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    monster VARCHAR(16) NOT NULL,
    item_key VARCHAR(32) NOT NULL,
    chance DOUBLE NOT NULL,
    min_qty INT UNSIGNED NOT NULL DEFAULT 1,
    max_qty INT UNSIGNED NOT NULL DEFAULT 1,
    UNIQUE KEY uq_drop (monster, item_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // how much bigger the art's effect is drawn (0: worked out from the effect, see public/js/arts.js artScale)
  "ALTER TABLE arts ADD COLUMN IF NOT EXISTS fx_scale DOUBLE NOT NULL DEFAULT 0 AFTER fx_life",
  // where an art comes from: 'learn' (spend its items) or 'event' (only given: activities, events, the auction house...),
  // with a line for the players saying where
  "ALTER TABLE arts ADD COLUMN IF NOT EXISTS source VARCHAR(8) NOT NULL DEFAULT 'learn' AFTER starter",
  "ALTER TABLE arts ADD COLUMN IF NOT EXISTS source_note VARCHAR(100) NOT NULL DEFAULT '' AFTER source",
  // a zone art the player may drag to any spot within aim_range px of themselves (an admin switches it per art)
  "ALTER TABLE arts ADD COLUMN IF NOT EXISTS aimable TINYINT(1) NOT NULL DEFAULT 0 AFTER fx_scale",
  "ALTER TABLE arts ADD COLUMN IF NOT EXISTS aim_range INT UNSIGNED NOT NULL DEFAULT 280 AFTER aimable",
  // pills (used from the bar), books and materials (spent on arts)
  "ALTER TABLE items ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'pill' AFTER name",
  // straw dummies drop nothing; everything else takes the '*' drops
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS common_drops TINYINT(1) NOT NULL DEFAULT 1",
  // how a monster looks and fights (see MONSTER_STYLES in shared/balance.js), and the chance a kill drops anything at all
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS fx VARCHAR(48) NOT NULL DEFAULT ''",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS style VARCHAR(8) NOT NULL DEFAULT 'melee'",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS fly TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS shot_range DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS shot_speed DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS shot_fx VARCHAR(48) NOT NULL DEFAULT ''",
  "ALTER TABLE monsters ADD COLUMN IF NOT EXISTS drop_rate DOUBLE NOT NULL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(48) NOT NULL PRIMARY KEY,
    v DOUBLE NOT NULL,
    note VARCHAR(200) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Create the tables and fill what's missing from DEFAULTS. Never overwrites what's there. */
export async function seedConfig() {
  for (const s of CONFIG_SCHEMA) await q(s);
  // realms have no natural key: only a database without any gets the defaults
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM realms");
  if (!Number(n)) await pool.batch("INSERT INTO realms (sort, name, stages) VALUES (?, ?, ?)", DEFAULTS.realms.map((r, i) => [(i + 1) * 10, r.name, r.stages]));
  // the rest by key: a setting added in a later version appears; a row an admin changed is left alone
  await pool.batch(
    "INSERT IGNORE INTO items (item_key, name, description, price, heal, exp_base, exp_per_level, cooldown, on_sale, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    DEFAULTS.items.map((i) => [i.key, i.name, i.desc, i.price, i.heal, i.expBase, i.expPerLevel, i.cd, i.onSale ? 1 : 0, i.sort]),
  );
  // the monsters a database doesn't have yet get their own drop list too (after the items exist, in seedArts)
  const had = new Set((await q("SELECT type FROM monsters")).map((r) => r.type));
  await pool.batch(
    `INSERT IGNORE INTO monsters (type, name, hp, atk, def, spd, respawn, exp_base, exp_per_level, stones, aggro, reach, cooldown, mult,
       fx, style, fly, shot_range, shot_speed, shot_fx, drop_rate, common_drops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    DEFAULTS.monsters.map((m) => [m.type, m.name, m.hp, m.atk, m.def, m.spd, m.respawn, m.expBase, m.expPerLevel, m.stones, m.aggro, m.reach, m.cd, m.mult,
      m.fx, m.style, m.fly ? 1 : 0, m.range, m.shotSpeed, m.shotFx, m.dropRate, m.commonDrops ? 1 : 0]),
  );
  // the two from before the columns: the ghost is a flying critter that rushes in, the dummy just stands
  await q("UPDATE monsters SET fx = 'critters/ghost', fly = 1, style = 'melee', drop_rate = 0.3 WHERE type = 'ghost' AND fx = ''");
  await q("UPDATE monsters SET style = 'none' WHERE type = 'dummy' AND style = 'melee' AND fx = ''");
  const fresh = DEFAULTS.monsters.filter((m) => !had.has(m.type) && m.fx).map((m) => m.type);
  // the straw dummies now stand in the starter town to try the arts on: no spirit stones and only a token of exp for
  // breaking one, so they can't be farmed. Changed only if an admin never touched their rewards.
  await q("UPDATE monsters SET exp_base = 2, exp_per_level = 0, stones = 0 WHERE type = 'dummy' AND exp_base = 10 AND exp_per_level = 2 AND stones = 1");
  await pool.batch("INSERT IGNORE INTO skills (slot, name, type, cd, mult, params) VALUES (?, ?, ?, ?, ?, ?)", DEFAULTS.skills.map((s) => [s.slot, s.name, s.type, s.cd, s.mult, JSON.stringify(s.params)]));
  await seedArts(fresh);
  await pool.batch("INSERT IGNORE INTO settings (k, v, note) VALUES (?, ?, ?)", Object.entries(DEFAULTS.settings).map(([k, [v, note]]) => [k, v, note]));
}

/**
 * The arts, their books and essences, what each needs and where things drop. Arts and items go in by key (an admin's
 * changes stay). Requirements and drops are filled only the first time there are arts at all, so a row an admin deleted
 * doesn't come back. Phi Kiếm and Lôi Ấn Trận used to be skills 2 and 3: an admin's numbers for them move over.
 */
async function seedArts(freshMonsters = []) {
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM arts");
  const first = !Number(n);
  const old = first ? await q("SELECT slot, name, cd, mult, params FROM skills WHERE slot IN (1, 2)") : [];
  const rows = ARTS_SEED.map((a) => {
    const o = old.find((s) => (a.key === "phikiem" && s.slot === 1) || (a.key === "loian" && s.slot === 2));
    const params = o ? { ...a.params, ...JSON.parse(o.params) } : a.params;
    return [a.key, o?.name ?? a.name, a.desc, a.element, a.tier, a.type, o?.cd ?? a.cd, o?.mult ?? a.mult, JSON.stringify(params), a.fx, a.at, a.life, a.starter ? 1 : 0, a.sort, a.aim > 0 ? 1 : 0, a.aim || ZONE_AIM];
  });
  await pool.batch(
    "INSERT IGNORE INTO arts (art_key, name, description, element, tier, type, cd, mult, params, fx, fx_at, fx_life, starter, sort, aimable, aim_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    rows,
  );
  await pool.batch(
    "INSERT IGNORE INTO items (item_key, name, kind, description, price, heal, exp_base, exp_per_level, cooldown, on_sale, sort) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 1, 0, ?)",
    ART_ITEMS_SEED.map((i) => [i.key, i.name, i.kind, i.desc, i.sort]),
  );
  await q("UPDATE monsters SET common_drops = 0 WHERE type = 'dummy'");
  // the whole moves are drawn 1.65x now, so their target stands 96 px ahead, not 70 (only rows an admin left as seeded)
  await q("UPDATE arts SET params = JSON_SET(params, '$.dist', 96) WHERE fx LIKE 'moves/%' AND type = 'zone' AND JSON_VALUE(params, '$.dist') = 70");
  // the drag-to-aim switch first lived in params as "aim": moved to its own columns
  await q(`UPDATE arts SET aimable = JSON_VALUE(params, '$.aim') > 0, aim_range = IF(JSON_VALUE(params, '$.aim') > 0, JSON_VALUE(params, '$.aim'), aim_range),
    params = JSON_REMOVE(params, '$.aim') WHERE JSON_VALUE(params, '$.aim') IS NOT NULL`);
  // a campfire, a fountain or the weather stays where it was called up instead of walking along with the caster
  await q("UPDATE arts SET fx_at = 'target' WHERE fx_at = 'self' AND fx IN ('fire/brazier', 'fire/campfire', 'fire/candle', 'fire/torch', 'water/fountain', 'weather/aurora', 'weather/cherry-blossoms', 'weather/god-rays', 'weather/clouds')");
  await q("UPDATE arts SET fx_life = 10 WHERE fx = 'holy/halo' AND fx_life = 4");
  // each new monster's own list: the essence of its element, a little Linh Tủy, a Hồi Xuân Đan, and the bí kíp of its
  // element's arts (rarer the higher the tier). A weight, not a chance: one item is picked per drop.
  if (freshMonsters.length)
    await pool.batch(
      "INSERT IGNORE INTO monster_drops (monster, item_key, chance, min_qty, max_qty) VALUES (?, ?, ?, ?, ?)",
      freshMonsters.flatMap((t) => {
        const el = MONSTER_ELEMENT[t] ?? "kim";
        return [
          [t, ELEMENTS[el].mat, 50, 1, 2], [t, "mat_linhtuy", 3, 1, 1], [t, "hoixuan", 20, 1, 1],
          ...ARTS_SEED.filter((a) => !a.starter && a.element === el).map((a) => [t, "bk_" + a.key, [0, 6, 3, 1][a.tier], 1, 1]),
        ];
      }),
    );
  if (first) {
    // the old skill rows 2 and 3 now live on as arts
    await q("DELETE FROM skills WHERE slot IN (1, 2)");
    await pool.batch("INSERT IGNORE INTO art_reqs (art_key, item_key, qty) VALUES (?, ?, ?)", ART_REQS_SEED.map((r) => [r.art, r.item, r.qty]));
    await pool.batch("INSERT IGNORE INTO monster_drops (monster, item_key, chance, min_qty, max_qty) VALUES (?, ?, ?, ?, ?)", DROPS_SEED.map((d) => [d.monster, d.item, d.chance, d.min, d.max]));
  }
}

/** Read the config tables into a config object (not yet checked). conn: a connection inside a transaction, optional. */
export async function readConfig(conn = null) {
  const Q = (sql) => (conn ?? pool).query(sql);
  const [realms, items, monsters, skills, settings, arts, reqs, drops] = await Promise.all([
    Q("SELECT name, stages FROM realms ORDER BY sort, id"),
    Q("SELECT * FROM items ORDER BY sort, item_key"),
    Q("SELECT * FROM monsters"),
    Q("SELECT * FROM skills ORDER BY slot"),
    Q("SELECT k, v FROM settings"),
    Q("SELECT * FROM arts ORDER BY sort, art_key"),
    Q("SELECT art_key, item_key, qty FROM art_reqs ORDER BY id"),
    Q("SELECT monster, item_key, chance, min_qty, max_qty FROM monster_drops ORDER BY id"),
  ]);
  return {
    realms: realms.map((r) => ({ name: r.name, stages: Number(r.stages) })),
    items: items.map((i) => ({
      key: i.item_key, name: i.name, kind: i.kind ?? "pill", desc: i.description, price: Number(i.price), heal: i.heal, expBase: Number(i.exp_base), expPerLevel: Number(i.exp_per_level),
      cd: i.cooldown, onSale: !!i.on_sale, sort: i.sort,
    })),
    monsters: monsters.map((m) => ({
      type: m.type, name: m.name, hp: m.hp, atk: m.atk, def: m.def, spd: m.spd, respawn: m.respawn, expBase: Number(m.exp_base), expPerLevel: Number(m.exp_per_level),
      stones: Number(m.stones), aggro: m.aggro, reach: m.reach, cd: m.cooldown, mult: m.mult, commonDrops: m.common_drops === undefined ? true : !!m.common_drops,
      fx: m.fx ?? "", style: m.style ?? "melee", fly: !!m.fly, range: m.shot_range ?? 0, shotSpeed: m.shot_speed ?? 0, shotFx: m.shot_fx ?? "", dropRate: m.drop_rate ?? 0,
    })),
    arts: arts.map((a) => ({
      key: a.art_key, name: a.name, desc: a.description, element: a.element, tier: a.tier, type: a.type, cd: a.cd, mult: a.mult, params: a.params,
      fx: a.fx, at: a.fx_at, life: a.fx_life, scale: a.fx_scale ?? 0, aimable: !!a.aimable, aimRange: a.aim_range ?? ZONE_AIM, starter: !!a.starter, source: a.source ?? "learn", sourceNote: a.source_note ?? "", enabled: !!a.enabled, sort: a.sort,
    })),
    reqs: reqs.map((r) => ({ art: r.art_key, item: r.item_key, qty: Number(r.qty) })),
    drops: drops.map((d) => ({ monster: d.monster, item: d.item_key, chance: d.chance, min: Number(d.min_qty), max: Number(d.max_qty) })),
    skills: skills.map((s) => ({ slot: s.slot, name: s.name, type: s.type, cd: s.cd, mult: s.mult, params: s.params })),
    settings: Object.fromEntries(settings.map((s) => [s.k, s.v])),
  };
}

// what the browsers get: the config as read (and found valid), as JSON, cached until it changes
let current = "";
export const configJson = () => current;

/** Read, check and apply. Returns true if the numbers changed. Throws if the database's config is broken. */
export async function loadConfig() {
  const raw = await readConfig();
  // the browser gets the same raw shape and runs the same applyConfig, so both sides compute identical numbers
  const json = JSON.stringify(raw);
  if (json === current) return false;
  applyConfig(raw);
  current = json;
  return true;
}

/** Check the database again every `ms`; on a valid change call onChange(). A broken config is logged once, not applied. */
export function watchConfig(onChange, ms = 10_000) {
  let lastErr = "";
  return setInterval(async () => {
    try {
      if (await loadConfig()) {
        lastErr = "";
        console.log("config: số liệu mới từ database đã được áp dụng");
        onChange();
      }
    } catch (e) {
      if (e.message !== lastErr) console.error("config: database có số liệu không hợp lệ, giữ bộ cũ:", e.message);
      lastErr = e.message;
    }
  }, ms);
}
