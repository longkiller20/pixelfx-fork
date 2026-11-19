// MariaDB: the pool, transactions, and the schema (created on start, safe to run every time).
import mariadb from "mariadb";
import { config } from "./config.js";
import { COSMETICS_SEED, WEAPONS_SEED, SPECIAL_WEAPONS_SEED, DEFAULT_WEAPON, SWORDS_SEED, BASIC_SWORD } from "./cosmetics-seed.js";
import { seedConfig } from "./gameconfig.js";

export const pool = mariadb.createPool({
  ...config.db,
  bigIntAsNumber: true,
  insertIdAsNumber: true,
  decimalAsNumber: true,
  // every connection reads committed data and fails fast instead of waiting forever on a lock
  initSql: ["SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED", "SET SESSION innodb_lock_wait_timeout = 5"],
});

export const q = (sql, params) => pool.query(sql, params);

/** Run fn(conn) in one transaction: everything commits together or nothing does. */
export async function tx(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (e) {
    try { await c.rollback(); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

export const isDup = (e) => e?.code === "ER_DUP_ENTRY" || e?.errno === 1062;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(16) NOT NULL,
    pass_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    KEY k_user (user_id),
    CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS characters (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(16) NOT NULL,
    class VARCHAR(16) NOT NULL,
    gender CHAR(1) NOT NULL DEFAULT 'm',
    hair TINYINT UNSIGNED NOT NULL DEFAULT 0,
    robe TINYINT UNSIGNED NOT NULL DEFAULT 0,
    exp BIGINT UNSIGNED NOT NULL DEFAULT 0,
    stones INT UNSIGNED NOT NULL DEFAULT 0,
    rank_points INT UNSIGNED NOT NULL DEFAULT 1000,
    kills INT UNSIGNED NOT NULL DEFAULT 0,
    deaths INT UNSIGNED NOT NULL DEFAULT 0,
    med_day DATE NULL,
    med_exp INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_name (name),
    KEY k_rank (rank_points),
    KEY k_exp (exp),
    CONSTRAINT fk_char_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS inventory (
    user_id INT UNSIGNED NOT NULL,
    item VARCHAR(32) NOT NULL,
    qty INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item),
    CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // one row per purchase request: the same request id can never be charged twice
  `CREATE TABLE IF NOT EXISTS purchases (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    item VARCHAR(32) NOT NULL,
    qty INT UNSIGNED NOT NULL,
    price INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_buy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // công pháp learned (the starter arts are known by everyone and have no row); one row per art, so learning twice is refused
  `CREATE TABLE IF NOT EXISTS learned_arts (
    user_id INT UNSIGNED NOT NULL,
    art_key VARCHAR(32) NOT NULL,
    learned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, art_key),
    CONSTRAINT fk_art_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // one row per account per day: the daily gift can only be claimed once
  `CREATE TABLE IF NOT EXISTS daily_claims (
    user_id INT UNSIGNED NOT NULL,
    day DATE NOT NULL,
    PRIMARY KEY (user_id, day),
    CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // the wardrobe: every hair style and robe the game knows, by its place in the atlases (public/avatar/). An admin adds,
  // prices, renames or takes items off sale here (or with tools/cosmetics.mjs); the game reads it live.
  `CREATE TABLE IF NOT EXISTS cosmetics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(8) NOT NULL,
    gender CHAR(1) NOT NULL,
    idx SMALLINT UNSIGNED NOT NULL,
    name VARCHAR(40) NOT NULL,
    price INT UNSIGNED NOT NULL DEFAULT 0,
    starter TINYINT(1) NOT NULL DEFAULT 0,
    on_sale TINYINT(1) NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_part (kind, gender, idx)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // what each account has bought: one row per item, so the same item can never be paid for twice
  `CREATE TABLE IF NOT EXISTS owned_cosmetics (
    user_id INT UNSIGNED NOT NULL,
    cosmetic_id INT UNSIGNED NOT NULL,
    price INT UNSIGNED NOT NULL DEFAULT 0,
    bought_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, cosmetic_id),
    CONSTRAINT fk_own_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_own_item FOREIGN KEY (cosmetic_id) REFERENCES cosmetics(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // buffs an admin gives one player: a percent on one stat, until a time or for good. They add up per stat.
  `CREATE TABLE IF NOT EXISTS player_buffs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    stat VARCHAR(8) NOT NULL,
    pct DOUBLE NOT NULL,
    expires_at DATETIME NULL,
    note VARCHAR(200) NOT NULL DEFAULT '',
    created_by VARCHAR(32) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_user (user_id),
    CONSTRAINT fk_buff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // one-off data changes already made to this database, by name (see ONCE in migrate())
  `CREATE TABLE IF NOT EXISTS migrations (
    name VARCHAR(64) PRIMARY KEY,
    at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS pvp_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    killer_id INT UNSIGNED NOT NULL,
    victim_id INT UNSIGNED NOT NULL,
    rewarded TINYINT(1) NOT NULL,
    at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_killer (killer_id, at)
  ) ENGINE=InnoDB`,
];

// columns added after the first release: older databases get them here (characters made before keep the first look)
const UPGRADES = [
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS gender CHAR(1) NOT NULL DEFAULT 'm' AFTER class",
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS hair TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER gender",
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS robe TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER hair",
  // the weapon in hand (Xianxia Pixel Pack); everyone starts with the plain long sword
  `ALTER TABLE characters ADD COLUMN IF NOT EXISTS weapon SMALLINT UNSIGNED NOT NULL DEFAULT ${DEFAULT_WEAPON} AFTER robe`,
  // bảo vật: never sold, never free; only given (by an admin now, by events and the auction house later)
  "ALTER TABLE cosmetics ADD COLUMN IF NOT EXISTS special TINYINT(1) NOT NULL DEFAULT 0 AFTER on_sale",
  // the five arts on the bar, as a JSON array of art keys (null: an empty slot); NULL until first changed (starters)
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS art_slots VARCHAR(400) NULL",
  // the map a character was last on (NULL: the starter town)
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS map_id VARCHAR(16) NULL",
  // the flying sword ridden when flying (ngự kiếm phi hành); everyone has the basic one, rideable from fly.realm
  `ALTER TABLE characters ADD COLUMN IF NOT EXISTS sword SMALLINT UNSIGNED NOT NULL DEFAULT ${BASIC_SWORD} AFTER weapon`,
];

/**
 * The shop is emptied, to be filled again with things designed one by one: every hair style, robe, weapon and flying
 * sword that was sold goes, and so do the free weapons but the long sword. Kept: the 5 free hair styles and 5 robes per
 * gender, the long sword (DEFAULT_WEAPON), the basic flying sword, and every bảo vật. Whoever bought what goes gets the
 * stones back; whoever wears it changes to the first free one. Runs once per database, in one transaction.
 */
async function retireShop(c) {
  // the items going, as a condition on a cosmetics row named k
  const gone = `k.special = 0 AND (k.starter = 0 OR (k.kind = 'weapon' AND k.idx <> ${DEFAULT_WEAPON}) OR (k.kind = 'sword' AND k.idx <> ${BASIC_SWORD}))`;
  await c.query(
    `UPDATE characters ch JOIN (SELECT o.user_id, SUM(o.price) AS paid FROM owned_cosmetics o JOIN cosmetics k ON k.id = o.cosmetic_id
       WHERE ${gone} GROUP BY o.user_id) r ON r.user_id = ch.user_id
     SET ch.stones = ch.stones + r.paid WHERE r.paid > 0`,
  );
  await c.query(`DELETE k FROM cosmetics k WHERE ${gone}`);
  // anything worn that is no longer in the wardrobe: the first free one instead
  for (const kind of ["hair", "robe"])
    await c.query(
      `UPDATE characters ch SET ch.${kind} = (SELECT MIN(f.idx) FROM cosmetics f WHERE f.kind = '${kind}' AND f.gender = ch.gender AND f.starter = 1)
       WHERE NOT EXISTS (SELECT 1 FROM cosmetics k WHERE k.kind = '${kind}' AND k.gender = ch.gender AND k.idx = ch.${kind})`,
    );
  await c.query(`UPDATE characters ch SET ch.weapon = ${DEFAULT_WEAPON} WHERE NOT EXISTS (SELECT 1 FROM cosmetics k WHERE k.kind = 'weapon' AND k.idx = ch.weapon)`);
  await c.query(`UPDATE characters ch SET ch.sword = ${BASIC_SWORD} WHERE NOT EXISTS (SELECT 1 FROM cosmetics k WHERE k.kind = 'sword' AND k.idx = ch.sword)`);
}
const ONCE = [["retire_shop_2026_11", retireShop]];

export async function migrate() {
  for (const s of SCHEMA) await q(s);
  await seedConfig();
  for (const s of UPGRADES) await q(s);
  // the first wardrobe; rows already there (and an admin's changes to them) are kept
  await pool.batch(
    "INSERT IGNORE INTO cosmetics (kind, gender, idx, name, price, starter, on_sale, special, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [...COSMETICS_SEED, ...WEAPONS_SEED, ...SPECIAL_WEAPONS_SEED, ...SWORDS_SEED].map((c) => [c.kind, c.g, c.idx, c.name, c.price, c.starter ? 1 : 0, c.onSale === false ? 0 : 1, c.special ? 1 : 0, c.idx]),
  );
  for (const [name, run] of ONCE) {
    const [done] = await q("SELECT 1 FROM migrations WHERE name = ?", [name]);
    if (done) continue;
    await tx(async (c) => {
      await run(c);
      await c.query("INSERT INTO migrations (name) VALUES (?)", [name]);
    });
    console.log("migration:", name);
  }
  // whatever a character already wears is theirs to keep, even if it is now sold in the shop
  for (const kind of ["hair", "robe", "weapon", "sword"])
    await q(
      `INSERT IGNORE INTO owned_cosmetics (user_id, cosmetic_id, price)
       SELECT ch.user_id, c.id, 0 FROM characters ch JOIN cosmetics c ON c.kind = ? AND c.gender = ${kind === "weapon" || kind === "sword" ? "'a'" : "ch.gender"} AND c.idx = ch.${kind}
       WHERE c.starter = 0`,
      [kind],
    );
}
