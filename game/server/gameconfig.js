// The game's numbers in the database: realms, items (pills), monsters, skills and settings. The tables are created and
// filled with shared/balance.js DEFAULTS the first time; after that the database is the source and an admin edits it
// (tools/admin.mjs, or plain SQL). The server reads it at start and checks it again every few seconds: a valid change is
// applied live and pushed to every browser; a broken one is refused with a log line and the game keeps the last good set.
import { q, pool } from "./db.js";
import { DEFAULTS, applyConfig } from "../shared/balance.js";
import { CONG_PHAP, ART_ITEMS_SEED, DROPS_SEED, ELEMENTS } from "../shared/cong-phap.js";
import { HOME_ITEMS } from "../shared/gia-vien.js";

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
  // công pháp: each art is designed in code (shared/cong-phap.js); a row holds only an admin's switches for it: on or off,
  // learnable with its bí kíp (off: only given, by events and activities); arts are never sold
  `CREATE TABLE IF NOT EXISTS cong_phap (
    art_key VARCHAR(32) NOT NULL PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    learnable TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // arts were once sold: no more
  "ALTER TABLE cong_phap DROP COLUMN IF EXISTS on_sale",
  // what learning an art spends, an item per row (an admin's to change; an art's first list is in shared/cong-phap.js)
  `CREATE TABLE IF NOT EXISTS cong_phap_reqs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    art_key VARCHAR(32) NOT NULL,
    item_key VARCHAR(32) NOT NULL,
    qty INT UNSIGNED NOT NULL DEFAULT 1,
    UNIQUE KEY uq_cp_req (art_key, item_key)
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
  // what the Gia Viên's animals and herbs give: materials, never sold; an admin may change them like any item
  await pool.batch(
    "INSERT IGNORE INTO items (item_key, name, kind, description, price, heal, exp_base, exp_per_level, cooldown, on_sale, sort) VALUES (?, ?, 'material', ?, 0, 0, 0, 0, 1, 0, ?)",
    HOME_ITEMS.map((i, n) => [i.key, i.name, i.desc, 300 + n]),
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
  // settings that went with building a house by hand (gone: houses are ready-made now)
  await q("DELETE FROM settings WHERE k IN ('home.max_blocks', 'home.reach', 'home.buy_max')");
}

/**
 * The arts' switches (a row per art in code, on and learnable to start), their books and essences, and where things
 * drop. Items go in by key (an admin's changes stay); the drop lists only the first time, so a row an admin deleted
 * doesn't come back. Each new monster gets its own list.
 */
async function seedArts(freshMonsters = []) {
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM monster_drops");
  const first = !Number(n);
  // an art new to this database: its switches, and (once its items exist, below) its first list of what learning spends
  const had = new Set((await q("SELECT art_key FROM cong_phap")).map((r) => r.art_key)), fresh = CONG_PHAP.filter((a) => !had.has(a.key));
  if (fresh.length) await pool.batch("INSERT IGNORE INTO cong_phap (art_key) VALUES (?)", fresh.map((a) => [a.key]));
  await pool.batch(
    "INSERT IGNORE INTO items (item_key, name, kind, description, price, heal, exp_base, exp_per_level, cooldown, on_sale, sort) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 1, 0, ?)",
    ART_ITEMS_SEED.map((i) => [i.key, i.name, i.kind, i.desc, i.sort]),
  );
  const reqs = fresh.flatMap((a) => (a.reqs ?? []).map((r) => [a.key, r.item, r.qty]));
  if (reqs.length) await pool.batch("INSERT IGNORE INTO cong_phap_reqs (art_key, item_key, qty) VALUES (?, ?, ?)", reqs);
  await q("UPDATE monsters SET common_drops = 0 WHERE type = 'dummy'");
  // each new monster's own list: the essence of its element, a little Linh Tủy, a Hồi Xuân Đan, and the bí kíp of its
  // element's arts (rarer the higher the tier). A weight, not a chance: one item is picked per drop.
  if (freshMonsters.length)
    await pool.batch(
      "INSERT IGNORE INTO monster_drops (monster, item_key, chance, min_qty, max_qty) VALUES (?, ?, ?, ?, ?)",
      freshMonsters.flatMap((t) => {
        const el = MONSTER_ELEMENT[t] ?? "kim";
        return [
          [t, ELEMENTS[el].mat, 50, 1, 2], [t, "mat_linhtuy", 3, 1, 1], [t, "hoixuan", 20, 1, 1],
          ...CONG_PHAP.filter((a) => !a.starter && a.element === el).map((a) => [t, "bk_" + a.key, [0, 6, 3, 1][a.tier], 1, 1]),
        ];
      }),
    );
  if (first) await pool.batch("INSERT IGNORE INTO monster_drops (monster, item_key, chance, min_qty, max_qty) VALUES (?, ?, ?, ?, ?)", DROPS_SEED.map((d) => [d.monster, d.item, d.chance, d.min, d.max]));
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
    Q("SELECT * FROM cong_phap"),
    Q("SELECT art_key, item_key, qty FROM cong_phap_reqs ORDER BY id"),
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
    // the admin's switches for each art (the arts themselves are in shared/cong-phap.js)
    arts: arts.map((a) => ({ key: a.art_key, enabled: !!a.enabled, learnable: !!a.learnable })),
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
