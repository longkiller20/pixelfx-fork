// MariaDB: the pool, transactions, and the schema (created on start, safe to run every time).
import mariadb from "mariadb";
import { config } from "./config.js";

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
  // one row per account per day: the daily gift can only be claimed once
  `CREATE TABLE IF NOT EXISTS daily_claims (
    user_id INT UNSIGNED NOT NULL,
    day DATE NOT NULL,
    PRIMARY KEY (user_id, day),
    CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
];

export async function migrate() {
  for (const s of SCHEMA) await q(s);
  for (const s of UPGRADES) await q(s);
}
