// The game's numbers in the database: realms, items (pills), monsters, skills and settings. The tables are created and
// filled with shared/balance.js DEFAULTS the first time; after that the database is the source and an admin edits it
// (tools/admin.mjs, or plain SQL). The server reads it at start and checks it again every few seconds: a valid change is
// applied live and pushed to every browser; a broken one is refused with a log line and the game keeps the last good set.
import { q, pool } from "./db.js";
import { DEFAULTS, applyConfig } from "../shared/balance.js";

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
  await pool.batch(
    "INSERT IGNORE INTO monsters (type, name, hp, atk, def, spd, respawn, exp_base, exp_per_level, stones, aggro, reach, cooldown, mult) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    DEFAULTS.monsters.map((m) => [m.type, m.name, m.hp, m.atk, m.def, m.spd, m.respawn, m.expBase, m.expPerLevel, m.stones, m.aggro, m.reach, m.cd, m.mult]),
  );
  // the straw dummies now stand in the starter town to try the arts on: no spirit stones and only a token of exp for
  // breaking one, so they can't be farmed. Changed only if an admin never touched their rewards.
  await q("UPDATE monsters SET exp_base = 2, exp_per_level = 0, stones = 0 WHERE type = 'dummy' AND exp_base = 10 AND exp_per_level = 2 AND stones = 1");
  await pool.batch("INSERT IGNORE INTO skills (slot, name, type, cd, mult, params) VALUES (?, ?, ?, ?, ?, ?)", DEFAULTS.skills.map((s) => [s.slot, s.name, s.type, s.cd, s.mult, JSON.stringify(s.params)]));
  await pool.batch("INSERT IGNORE INTO settings (k, v, note) VALUES (?, ?, ?)", Object.entries(DEFAULTS.settings).map(([k, [v, note]]) => [k, v, note]));
}

/** Read the five tables into a config object (not yet checked). conn: a connection inside a transaction, optional. */
export async function readConfig(conn = null) {
  const Q = (sql) => (conn ?? pool).query(sql);
  const [realms, items, monsters, skills, settings] = await Promise.all([
    Q("SELECT name, stages FROM realms ORDER BY sort, id"),
    Q("SELECT * FROM items ORDER BY sort, item_key"),
    Q("SELECT * FROM monsters"),
    Q("SELECT * FROM skills ORDER BY slot"),
    Q("SELECT k, v FROM settings"),
  ]);
  return {
    realms: realms.map((r) => ({ name: r.name, stages: Number(r.stages) })),
    items: items.map((i) => ({
      key: i.item_key, name: i.name, desc: i.description, price: Number(i.price), heal: i.heal, expBase: Number(i.exp_base), expPerLevel: Number(i.exp_per_level),
      cd: i.cooldown, onSale: !!i.on_sale, sort: i.sort,
    })),
    monsters: monsters.map((m) => ({
      type: m.type, name: m.name, hp: m.hp, atk: m.atk, def: m.def, spd: m.spd, respawn: m.respawn, expBase: Number(m.exp_base), expPerLevel: Number(m.exp_per_level),
      stones: Number(m.stones), aggro: m.aggro, reach: m.reach, cd: m.cooldown, mult: m.mult,
    })),
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
