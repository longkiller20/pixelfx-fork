// MariaDB: the pool, transactions, and the schema (created on start, safe to run every time).
import mariadb from "mariadb";
import { config } from "./config.js";
import { fashionSeed, SWORDS_SEED, BASIC_SWORD } from "./cosmetics-seed.js";
import { KIND_KEYS } from "../shared/thoi-trang.js";
// the long sword everyone held before weapons went (the column stays, unused)
const DEFAULT_WEAPON = 60;
import { seedConfig } from "./gameconfig.js";
import { CONG_PHAP, DROPS_SEED } from "../shared/cong-phap.js";

// what the sect treasure house sells at first (cost in cống hiến); only items the game has: the books are added when their art exists
const SECT_SHOP_SEED = [
  { item: "hoixuan", cost: 15, level: 1, limit: 10 },
  { item: "tukhi", cost: 60, level: 2, limit: 5 },
  ...CONG_PHAP.filter((a) => !a.starter).map((a, i) => ({ item: "bk_" + a.key, cost: 600 + 300 * i, level: 3 + i, limit: 1 })),
];

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

/** The database gave up on a transaction to break a deadlock (or a lock wait ran out): running it again is safe. */
export const isDeadlock = (e) => e?.code === "ER_LOCK_DEADLOCK" || e?.errno === 1213 || e?.code === "ER_LOCK_WAIT_TIMEOUT" || e?.errno === 1205;

/**
 * A transaction for work that many people do at once, each about their own rows (Đạo Lữ: many couples marrying at the
 * same moment). Two things keep them from tripping over each other:
 *  - READ COMMITTED: InnoDB then locks only the rows a statement touches, not the gaps between index entries, so two
 *    couples' statements never lock each other's neighbourhood. What must not happen at once is serialised by the rows
 *    the work locks on purpose (the people's user rows, SELECT ... FOR UPDATE) and by unique keys, not by gap locks.
 *  - if the database still breaks a deadlock by rolling one back, everything of it is undone (the request id with it),
 *    so it is simply run again from the start, after a short random wait, up to `tries` times.
 */
export async function txRetry(fn, tries = 5) {
  for (let i = 1; ; i++) {
    const c = await pool.getConnection();
    try {
      await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await c.beginTransaction();
      const out = await fn(c);
      await c.commit();
      return out;
    } catch (e) {
      try { await c.rollback(); } catch {}
      if (!isDeadlock(e) || i >= tries) throw e;
    } finally {
      c.release();
    }
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 25 * i));
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
  // the wardrobe: every hair style and robe the game knows, by its number: its picture is public/thoi-trang/<kind>/<idx>.png (a flying sword public/phi-kiem/<idx>-<name>/) (server/assets.js). An admin adds,
  // prices, renames or takes items off sale here (or with tools/cosmetics.mjs); the game reads it live.
  `CREATE TABLE IF NOT EXISTS cosmetics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(12) NOT NULL,
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
  // ---- Tông Môn (server/tong-mon.js). A sect, its members (one sect per person: the key is the person), the applications
  // to it, what each person did today (check-in, donations, purchases: once or up to a cap per day), request ids (a
  // donation or a purchase sent twice counts once), when each person last left one (they wait before joining another),
  // and its log (only kinds and names: the text is made where it is shown).
  `CREATE TABLE IF NOT EXISTS sects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(16) NOT NULL,
    emblem TINYINT UNSIGNED NOT NULL DEFAULT 0,
    level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    exp BIGINT UNSIGNED NOT NULL DEFAULT 0,
    treasury BIGINT UNSIGNED NOT NULL DEFAULT 0,
    notice VARCHAR(400) NOT NULL DEFAULT '',
    join_mode VARCHAR(8) NOT NULL DEFAULT 'apply',
    min_level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    array_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sect_name (name),
    KEY k_sect_rank (level, exp)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sect_members (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    sect_id INT UNSIGNED NOT NULL,
    rnk TINYINT UNSIGNED NOT NULL DEFAULT 5,
    contrib BIGINT UNSIGNED NOT NULL DEFAULT 0,
    contrib_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_sm_sect (sect_id, rnk),
    CONSTRAINT fk_sm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sm_sect FOREIGN KEY (sect_id) REFERENCES sects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sect_applications (
    sect_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    message VARCHAR(160) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sect_id, user_id),
    KEY k_sa_user (user_id),
    CONSTRAINT fk_sa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sa_sect FOREIGN KEY (sect_id) REFERENCES sects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sect_daily (
    user_id INT UNSIGNED NOT NULL,
    day DATE NOT NULL,
    checked TINYINT(1) NOT NULL DEFAULT 0,
    donated INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day),
    CONSTRAINT fk_sd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sect_shop_daily (
    user_id INT UNSIGNED NOT NULL,
    item_key VARCHAR(32) NOT NULL,
    day DATE NOT NULL,
    n INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item_key, day),
    CONSTRAINT fk_ssd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sect_requests (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    kind VARCHAR(8) NOT NULL,
    amount INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sect_leave (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    at DATETIME NOT NULL,
    CONSTRAINT fk_sl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sect_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sect_id INT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL,
    actor VARCHAR(16) NOT NULL DEFAULT '',
    target VARCHAR(60) NOT NULL DEFAULT '',
    amount BIGINT NOT NULL DEFAULT 0,
    at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_slog (sect_id, id),
    CONSTRAINT fk_slog_sect FOREIGN KEY (sect_id) REFERENCES sects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // the sect treasure house (Tông Môn Bảo Khố): what members buy with their cống hiến, from what sect level, how many a day
  `CREATE TABLE IF NOT EXISTS sect_shop (
    item_key VARCHAR(32) NOT NULL PRIMARY KEY,
    cost INT UNSIGNED NOT NULL,
    min_level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    daily_limit INT UNSIGNED NOT NULL DEFAULT 1,
    on_sale TINYINT(1) NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // ---- Đạo Hữu (server/dao-huu.js). Friendship is stored both ways (a row for each side), so "my friends" is one key;
  // a request waits in friend_requests (one per pair and direction); a block stops requests and Truyền Âm both ways.
  `CREATE TABLE IF NOT EXISTS friends (
    user_id INT UNSIGNED NOT NULL,
    friend_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id),
    KEY k_fr_friend (friend_id),
    CONSTRAINT fk_fr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fr_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS friend_requests (
    from_id INT UNSIGNED NOT NULL,
    to_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (from_id, to_id),
    KEY k_frq_to (to_id),
    CONSTRAINT fk_frq_from FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_frq_to FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS blocks (
    user_id INT UNSIGNED NOT NULL,
    blocked_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, blocked_id),
    KEY k_bl_blocked (blocked_id),
    CONSTRAINT fk_bl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_bl_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // Truyền Âm: private messages between two Đạo Hữu; (lo, hi) is the pair whatever the direction, for one conversation's index
  `CREATE TABLE IF NOT EXISTS private_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lo INT UNSIGNED NOT NULL,
    hi INT UNSIGNED NOT NULL,
    from_id INT UNSIGNED NOT NULL,
    to_id INT UNSIGNED NOT NULL,
    body VARCHAR(400) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    KEY k_pm_pair (lo, hi, id),
    KEY k_pm_unread (to_id, read_at),
    KEY k_pm_at (created_at),
    CONSTRAINT fk_pm_from FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_to FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // ---- Gia Viên (server/gia-vien.js): unlocked once per person, with the ready-made house it lives in; the houses it
  // bought (a row each: bought once), the animals, the herb beds
  `CREATE TABLE IF NOT EXISTS homes (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    paid INT UNSIGNED NOT NULL DEFAULT 0,
    house VARCHAR(16) NOT NULL DEFAULT 'co_trach',
    unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_home_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS home_houses (
    user_id INT UNSIGNED NOT NULL,
    house VARCHAR(16) NOT NULL,
    paid INT UNSIGNED NOT NULL DEFAULT 0,
    bought_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, house),
    CONSTRAINT fk_hh_user FOREIGN KEY (user_id) REFERENCES homes(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS home_animals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,
    bought_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_at DATETIME NULL,
    KEY k_ha_user (user_id),
    CONSTRAINT fk_ha_user FOREIGN KEY (user_id) REFERENCES homes(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS home_plots (
    user_id INT UNSIGNED NOT NULL,
    plot TINYINT UNSIGNED NOT NULL,
    crop VARCHAR(16) NOT NULL,
    planted_at DATETIME NOT NULL,
    ready_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, plot),
    CONSTRAINT fk_hp_user FOREIGN KEY (user_id) REFERENCES homes(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS home_requests (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_hr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // ---- Câu Cá (server/cau-ca.js): the rod and bait each angler has chosen and their tallies; the Ngư Lục (how many of
  // each fish, the heaviest); request ids, so a buy or a sale sent twice counts once
  `CREATE TABLE IF NOT EXISTS fishers (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    rod VARCHAR(32) NULL,
    bait VARCHAR(32) NULL,
    casts INT UNSIGNED NOT NULL DEFAULT 0,
    catches INT UNSIGNED NOT NULL DEFAULT 0,
    sold BIGINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_fisher_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS fish_log (
    user_id INT UNSIGNED NOT NULL,
    fish VARCHAR(32) NOT NULL,
    n INT UNSIGNED NOT NULL DEFAULT 0,
    best_g INT UNSIGNED NOT NULL DEFAULT 0,
    best_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, fish),
    KEY k_fl_best (fish, best_g),
    CONSTRAINT fk_fl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS fish_requests (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_fishreq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // ---- Đạo Lữ (server/dao-lu.js). Hảo cảm: one row per pair (lo < hi), raised by roses; how many roses each gave each
  // today; proposals (one each may have sent, its key); the dao lu now (a row per person: its key makes "married to one"
  // a rule of the database, partner_id unique too); every marriage ever (history, for the admin); the wait after a
  // divorce; request ids, so a buy, a gift or an answer sent twice counts once
  `CREATE TABLE IF NOT EXISTS dl_affinity (
    lo INT UNSIGNED NOT NULL,
    hi INT UNSIGNED NOT NULL,
    points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    roses INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (lo, hi),
    KEY k_dla_hi (hi),
    CONSTRAINT fk_dla_lo FOREIGN KEY (lo) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dla_hi FOREIGN KEY (hi) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_rose_daily (
    giver INT UNSIGNED NOT NULL,
    receiver INT UNSIGNED NOT NULL,
    day DATE NOT NULL,
    n INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (giver, receiver, day),
    CONSTRAINT fk_dlrd_giver FOREIGN KEY (giver) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dlrd_receiver FOREIGN KEY (receiver) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_proposals (
    from_id INT UNSIGNED NOT NULL PRIMARY KEY,
    to_id INT UNSIGNED NOT NULL,
    ring VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_dlp_to (to_id),
    CONSTRAINT fk_dlp_from FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dlp_to FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_marriages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    a_id INT UNSIGNED NOT NULL,
    b_id INT UNSIGNED NOT NULL,
    ring VARCHAR(32) NOT NULL,
    paid_by INT UNSIGNED NOT NULL,
    price INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    ended_by INT UNSIGNED NULL,
    KEY k_dlm_a (a_id),
    KEY k_dlm_b (b_id),
    CONSTRAINT fk_dlm_a FOREIGN KEY (a_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dlm_b FOREIGN KEY (b_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_spouses (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    partner_id INT UNSIGNED NOT NULL,
    marriage_id INT UNSIGNED NOT NULL,
    ring VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_dls_partner (partner_id),
    CONSTRAINT fk_dls_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dls_partner FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dls_marriage FOREIGN KEY (marriage_id) REFERENCES dl_marriages(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_cooldown (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    until DATETIME NOT NULL,
    CONSTRAINT fk_dlc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dl_requests (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_dlreq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // ---- Chính Tà Phân Tranh (server/chinh-ta.js). One row per person signed up for a battle (named by its start, ms):
  // signing twice is the same row
  `CREATE TABLE IF NOT EXISTS ct_signups (
    slot BIGINT NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    faction CHAR(1) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (slot, user_id),
    KEY k_user (user_id),
    CONSTRAINT fk_cts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // one row per battle: slot is unique, so a battle can never be started twice (two timers, a restart, the admin's button)
  `CREATE TABLE IF NOT EXISTS ct_matches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slot BIGINT NOT NULL,
    state ENUM('running','done','cancelled') NOT NULL DEFAULT 'running',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    size_c TINYINT UNSIGNED NOT NULL DEFAULT 0,
    size_t TINYINT UNSIGNED NOT NULL DEFAULT 0,
    kills_c SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    kills_t SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    winner CHAR(1) NULL,
    note VARCHAR(200) NOT NULL DEFAULT '',
    UNIQUE KEY uq_slot (slot)
  ) ENGINE=InnoDB`,
  // who fought in a battle and what they got: (match, user) is the key, so a reward is written once whatever happens
  `CREATE TABLE IF NOT EXISTS ct_players (
    match_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    faction CHAR(1) NOT NULL,
    kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    assists SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    seconds SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    result CHAR(1) NOT NULL,
    mvp TINYINT(1) NOT NULL DEFAULT 0,
    points INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, user_id),
    KEY k_user (user_id, match_id),
    CONSTRAINT fk_ctp_match FOREIGN KEY (match_id) REFERENCES ct_matches(id) ON DELETE CASCADE,
    CONSTRAINT fk_ctp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  // the Tiệm Chính Tà: items sold for điểm Chính Tà (the admin fills it; empty until then)
  `CREATE TABLE IF NOT EXISTS ct_shop (
    item VARCHAR(32) NOT NULL PRIMARY KEY,
    price INT UNSIGNED NOT NULL,
    on_sale TINYINT(1) NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`,
  // a purchase or a change of side, by request id: sent twice, it counts once
  `CREATE TABLE IF NOT EXISTS ct_requests (
    user_id INT UNSIGNED NOT NULL,
    request_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id),
    CONSTRAINT fk_ctreq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  // an admin can bar an account from chat (and Truyền Âm) until a time
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_muted_until DATETIME NULL",
  "ALTER TABLE homes ADD COLUMN IF NOT EXISTS house VARCHAR(16) NOT NULL DEFAULT 'co_trach' AFTER paid",
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
  // Chính Tà: the side (c Chính Phái, t Tà Phái; NULL for a character made before there were sides, who picks one in the
  // panel), when it was last changed, and the điểm Chính Tà
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS faction CHAR(1) NULL AFTER sword",
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS faction_at DATETIME NULL AFTER faction",
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS ct_points INT UNSIGNED NOT NULL DEFAULT 0 AFTER faction_at",
  // Thời trang (shared/thoi-trang.js): what is worn in each of the 12 layers, 0 for the figure's own / nothing
  ...KIND_KEYS.map((k) => `ALTER TABLE characters ADD COLUMN IF NOT EXISTS ${k} SMALLINT UNSIGNED NOT NULL DEFAULT 0`),
  // the kinds are longer now (khuonmat, docamtay, haoquang)
  "ALTER TABLE cosmetics MODIFY kind VARCHAR(12) NOT NULL",
  // Đồ Sát: the sát khí from bringing down players who weren't fighting, and when it was last set (it wears off with time)
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS sat_khi SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER ct_points",
  "ALTER TABLE characters ADD COLUMN IF NOT EXISTS sat_khi_at DATETIME NULL AFTER sat_khi",
];

/**
 * The shop is emptied, to be filled again with things designed one by one: every hair style, robe, weapon and flying
 * sword that was sold goes, and so do the free weapons but the long sword. Kept: the 5 free hair styles and 5 robes per
 * gender, the long sword (DEFAULT_WEAPON), the basic flying sword, and every bảo vật. Whoever bought what goes gets the
 * stones back; whoever wears it changes to the first free one. Runs once per database, in one transaction.
 */
async function retireShop(c) {
  // the items going, as a condition on a cosmetics row named k
  // (only the kinds there were then: on a fresh database it runs after the fashion items are seeded, and leaves them)
  const gone = `k.kind IN ('hair', 'robe', 'weapon', 'sword') AND k.special = 0 AND (k.starter = 0 OR (k.kind = 'weapon' AND k.idx <> ${DEFAULT_WEAPON}) OR (k.kind = 'sword' AND k.idx <> ${BASIC_SWORD}))`;
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
/**
 * Then the bảo vật go too (pixelfx's weapons, the dragon swords...), to be redesigned one by one like the shop. They were
 * only ever given, so nothing is refunded; whoever holds one goes back to the long sword or the basic flying sword. The
 * flag stays: an admin can make any new item a bảo vật.
 */
async function retireSpecials(c) {
  await c.query("DELETE FROM cosmetics WHERE special = 1");
  await c.query(`UPDATE characters ch SET ch.weapon = ${DEFAULT_WEAPON} WHERE NOT EXISTS (SELECT 1 FROM cosmetics k WHERE k.kind = 'weapon' AND k.idx = ch.weapon)`);
  await c.query(`UPDATE characters ch SET ch.sword = ${BASIC_SWORD} WHERE NOT EXISTS (SELECT 1 FROM cosmetics k WHERE k.kind = 'sword' AND k.idx = ch.sword)`);
}
/**
 * The arts are designed in code now (shared/cong-phap.js): Phi Kiếm, Lôi Ấn Trận and four more. Every other art goes,
 * with its bí kíp (from bags too), where it dropped, and from whoever learned it and their bar. The old arts and
 * art_reqs tables (rows of numbers per art, what each needed) go too: an admin's switches are in cong_phap, and an art
 * that was switched off or event-only keeps that there.
 */
async function artsInCode(c) {
  const keys = CONG_PHAP.map((a) => a.key), books = CONG_PHAP.filter((a) => !a.starter).map((a) => "bk_" + a.key), ph = (a) => a.map(() => "?").join(",");
  const [{ n }] = await c.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'arts'");
  if (Number(n)) await c.query("UPDATE cong_phap cp JOIN arts a ON a.art_key = cp.art_key SET cp.enabled = a.enabled, cp.learnable = (a.source <> 'event')");
  for (const r of await c.query("SELECT user_id, art_slots FROM characters WHERE art_slots IS NOT NULL")) {
    let slots;
    try {
      slots = JSON.parse(r.art_slots);
    } catch {
      continue;
    }
    if (!Array.isArray(slots) || slots.every((k) => k === null || keys.includes(k))) continue;
    await c.query("UPDATE characters SET art_slots = ? WHERE user_id = ?", [JSON.stringify(slots.map((k) => (keys.includes(k) ? k : null))), r.user_id]);
  }
  await c.query(`DELETE FROM learned_arts WHERE art_key NOT IN (${ph(keys)})`, keys);
  await c.query(`DELETE FROM inventory WHERE item LIKE 'bk\\_%' AND item NOT IN (${ph(books)})`, books);
  await c.query(`DELETE FROM monster_drops WHERE item_key LIKE 'bk\\_%' AND item_key NOT IN (${ph(books)})`, books);
  await c.query(`DELETE FROM items WHERE kind = 'book' AND item_key NOT IN (${ph(books)})`, books);
  // the books of the arts that came back drop again, as a new database's do
  await c.batch("INSERT IGNORE INTO monster_drops (monster, item_key, chance, min_qty, max_qty) VALUES (?, ?, ?, ?, ?)",
    DROPS_SEED.filter((d) => books.includes(d.item)).map((d) => [d.monster, d.item, d.chance, d.min, d.max]));
  // the skill rows Phi Kiếm and Lôi Ấn Trận were before they were arts
  await c.query("DELETE FROM skills WHERE slot IN (1, 2)");
  await c.query("DROP TABLE IF EXISTS art_reqs");
  await c.query("DROP TABLE IF EXISTS arts");
}
// (retire_non_skill_arts_2026_11, which took out the arts that weren't skills, is part of arts_in_code_2026_11 now)
/** What learning each art spends moved into the database (cong_phap_reqs), for an admin to change: the arts' first lists. */
async function artReqs(c) {
  const rows = CONG_PHAP.flatMap((a) => (a.reqs ?? []).map((r) => [a.key, r.item, r.qty]));
  if (rows.length) await c.batch("INSERT IGNORE INTO cong_phap_reqs (art_key, item_key, qty) VALUES (?, ?, ?)", rows);
}
/**
 * The characters change to the old game's chibi figure (shared/thoi-trang.js): the hair styles, robes and weapons go from
 * the Y Các. Whoever paid for one gets every stone of it back; they all go (with who owned them), and everyone wears the
 * figure's own clothes until they pick new ones. The flying swords stay.
 */
async function chibiWardrobe(c) {
  const gone = "k.kind IN ('hair', 'robe', 'weapon')";
  await c.query(
    `UPDATE characters ch JOIN (SELECT o.user_id, SUM(o.price) AS paid FROM owned_cosmetics o JOIN cosmetics k ON k.id = o.cosmetic_id
       WHERE ${gone} GROUP BY o.user_id) r ON r.user_id = ch.user_id SET ch.stones = ch.stones + r.paid`,
  );
  await c.query(`DELETE k FROM cosmetics k WHERE ${gone}`);
}
const ONCE = [["retire_shop_2026_11", retireShop], ["retire_specials_2026_11", retireSpecials], ["arts_in_code_2026_11", artsInCode], ["cong_phap_reqs_2026_11", artReqs], ["chibi_wardrobe_2026_11", chibiWardrobe]];

export async function migrate() {
  for (const s of SCHEMA) await q(s);
  await seedConfig();
  for (const s of UPGRADES) await q(s);
  // the first wardrobe; rows already there (and an admin's changes to them) are kept
  await pool.batch(
    "INSERT IGNORE INTO cosmetics (kind, gender, idx, name, price, starter, on_sale, special, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [...fashionSeed(), ...SWORDS_SEED].map((c) => [c.kind, c.g, c.idx, c.name, c.price, c.starter ? 1 : 0, c.onSale === false ? 0 : 1, c.special ? 1 : 0, c.idx]),
  );
  // the first goods of the sect treasure house; rows an admin changed are kept
  await pool.batch("INSERT IGNORE INTO sect_shop (item_key, cost, min_level, daily_limit, on_sale, sort) VALUES (?, ?, ?, ?, 1, ?)", SECT_SHOP_SEED.map((r, i) => [r.item, r.cost, r.level, r.limit, (i + 1) * 10]));
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
  for (const kind of [...KIND_KEYS, "sword"])
    await q(
      `INSERT IGNORE INTO owned_cosmetics (user_id, cosmetic_id, price)
       SELECT ch.user_id, c.id, 0 FROM characters ch JOIN cosmetics c ON c.kind = ? AND c.gender = 'a' AND c.idx = ch.${kind}
       WHERE c.starter = 0`,
      [kind],
    );
}
