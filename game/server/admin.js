// The admin site: its own Express app on its own port (ADMIN_PORT, 5885 by default), so it can be firewalled apart from the
// game. Admin accounts and sessions live in their own tables; every change is written to admin_log. It edits:
//   players (stones, exp, items, hair and robes, bans, passwords), realms, pills, monsters, arts, settings, hair & robes,
//   and the admin accounts themselves.
// Game numbers are checked with the same checkConfig() the game uses before anything is saved, then applied at once.
import crypto from "node:crypto";
import { join } from "node:path";
import express from "express";
import { q, tx, isDup } from "./db.js";
import { ROOT, config } from "./config.js";
import { assetsJson, hasPart, PART_DIRS, ART_DIR } from "./assets.js";
import { hashPassword, verifyPassword, dummyVerify, rateLimit } from "./auth.js";
import { readConfig, loadConfig } from "./gameconfig.js";
import { checkConfig, levelFromExp, realmName, expForLevel, MAX_LEVEL, MEDITATE, BUFF_STATS, NAME_RE, GENDERS } from "../shared/balance.js";
import { inventory, GameError, activeBuffs, adminAdjust, adminResetMeditation, adminLook, adminItem, adminArt, loadCharacter, grantArtMany } from "./store.js";
import { userLock } from "./lock.js";
import { MAPS as MAP_DEFS, mapInfo } from "../shared/maps/index.js";

const MAPS = Object.keys(MAP_DEFS).map((id) => mapInfo(id));

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const bad = (m, status = 400) => new GameError(m, status);

// ---------------------------------------------------------------- schema
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    pass_hash VARCHAR(200) NOT NULL,
    must_change TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL,
    UNIQUE KEY uq_admin (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    admin_id INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    CONSTRAINT fk_asess FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS admin_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin VARCHAR(32) NOT NULL,
    action VARCHAR(40) NOT NULL,
    target VARCHAR(120) NOT NULL DEFAULT '',
    detail TEXT NULL,
    at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY k_at (at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(200) NOT NULL DEFAULT ''",
];

/** Create the admin tables; with no admin at all, create admin / admin123456, to be changed at first login. */
export async function adminMigrate() {
  for (const s of SCHEMA) await q(s);
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM admins");
  if (!Number(n)) {
    await q("INSERT INTO admins (username, pass_hash, must_change) VALUES ('admin', ?, 1)", [await hashPassword("admin123456")]);
    console.log("admin: đã tạo tài khoản admin / admin123456 (bắt buộc đổi mật khẩu khi đăng nhập lần đầu)");
  }
}

// ---------------------------------------------------------------- what can be edited, column by column
// type: str:N (text up to N), int, uint, num, bool, json, enum:a|b. Config tables are checked as a whole before saving.
const T = {
  realms: { pk: "id", order: "sort, id", config: true, add: true, del: true, cols: { name: "str:32", stages: "uint", sort: "int" } },
  items: {
    pk: "item_key", pkType: "key", order: "sort, item_key", config: true, add: true, del: true,
    cols: { name: "str:40", kind: "enum:pill|book|material", description: "str:200", price: "uint", heal: "num", exp_base: "uint", exp_per_level: "uint", cooldown: "num", on_sale: "bool", sort: "int" },
  },
  monsters: {
    pk: "type", pkType: "key", order: "type", config: true, add: true, del: true,
    cols: {
      name: "str:40", hp: "num", atk: "num", def: "num", spd: "num", respawn: "num", exp_base: "uint", exp_per_level: "uint", stones: "uint", aggro: "num", reach: "num",
      cooldown: "num", mult: "num", common_drops: "bool", fx: "str:48", style: "enum:melee|ranged|none", fly: "bool", shot_range: "num", shot_speed: "num", shot_fx: "str:48", drop_rate: "num",
    },
  },
  // công pháp, what each needs to learn, and what monsters drop (see shared/arts-seed.js)
  arts: {
    pk: "art_key", pkType: "key", order: "sort, art_key", config: true, add: true, del: true,
    cols: {
      name: "str:30", description: "str:200", element: "str:8", tier: "uint", type: "enum:melee|bolt|zone|nova|dash|heal|buff", cd: "num", mult: "num",
      params: "json", fx: "str:48", fx_at: "enum:front|self|target|bolt", fx_life: "num", fx_scale: "num", aimable: "bool", aim_range: "uint", starter: "bool", source: "enum:learn|event", source_note: "str:100", enabled: "bool", sort: "int",
    },
  },
  art_reqs: { pk: "id", order: "art_key, id", config: true, add: true, del: true, cols: { art_key: "str:32", item_key: "str:32", qty: "uint" } },
  monster_drops: { pk: "id", order: "monster, id", config: true, add: true, del: true, cols: { monster: "str:16", item_key: "str:32", chance: "num", min_qty: "uint", max_qty: "uint" } },
  skills: { pk: "slot", order: "slot", config: true, cols: { name: "str:40", type: "enum:melee|bolt|zone", cd: "num", mult: "num", params: "json" } },
  settings: { pk: "k", order: "k", config: true, cols: { v: "num" } },
  cosmetics: {
    pk: "id", order: "kind, gender, starter DESC, sort, idx", add: true, del: true,
    cols: { kind: "enum:hair|robe|weapon|sword", gender: "enum:m|f|a", idx: "uint", name: "str:40", price: "uint", starter: "bool", on_sale: "bool", special: "bool", sort: "int" },
  },
};

function value(type, v, col) {
  if (type.startsWith("str:")) {
    const s = String(v ?? "").trim();
    if (!s && !["description", "fx", "source_note", "shot_fx"].includes(col)) throw bad(`${col}: không được để trống`);
    if (s.length > Number(type.slice(4))) throw bad(`${col}: tối đa ${type.slice(4)} ký tự`);
    return s;
  }
  if (type.startsWith("enum:")) {
    if (!type.slice(5).split("|").includes(v)) throw bad(`${col}: chỉ nhận ${type.slice(5).replace(/\|/g, ", ")}`);
    return v;
  }
  if (type === "bool") return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
  if (type === "json") {
    const o = typeof v === "string" ? JSON.parse(v) : v;
    if (!o || typeof o !== "object" || Array.isArray(o)) throw bad(`${col}: cần một object JSON`);
    return JSON.stringify(o);
  }
  const n = Number(v);
  if (v === "" || v === null || v === undefined || !Number.isFinite(n)) throw bad(`${col}: cần một số`);
  if ((type === "int" || type === "uint") && !Number.isInteger(n)) throw bad(`${col}: cần số nguyên`);
  if (type === "uint" && n < 0) throw bad(`${col}: không được âm`);
  return n;
}

// the parts there are pictures of: one folder each in public/ (server/assets.js)
const partName = { hair: "Tóc", robe: "Y phục", weapon: "Vũ khí", sword: "Phi kiếm" };
const folderOf = (kind, g) => Object.entries(PART_DIRS).find(([, v]) => v[0] === kind && v[1] === g)?.[0] ?? kind;

// ---------------------------------------------------------------- the app
export function adminApp(world) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  const r = express.Router();
  r.use(express.json({ limit: "32kb" }));

  // ---- sessions
  const loginLimit = rateLimit({ windowMs: 60_000, max: 8, message: "Sai quá nhiều lần, hãy đợi 1 phút." });
  r.post("/login", loginLimit, wrap(async (req, res) => {
    const username = String(req.body?.username ?? ""), password = String(req.body?.password ?? "");
    const [a] = await q("SELECT id, pass_hash, must_change FROM admins WHERE username = ?", [username]);
    const ok = a ? await verifyPassword(password, a.pass_hash) : await dummyVerify(password);
    if (!a || !ok) throw bad("Sai tài khoản hoặc mật khẩu.", 401);
    const token = crypto.randomBytes(32).toString("base64url");
    await q("DELETE FROM admin_sessions WHERE expires_at < NOW()");
    await q("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, NOW() + INTERVAL 12 HOUR)", [sha(token), a.id]);
    await q("UPDATE admins SET last_login = NOW() WHERE id = ?", [a.id]);
    await log({ name: username }, "login", "", null);
    res.json({ token, username, mustChange: !!a.must_change });
  }));

  // everything below needs an admin session; until the first password change, only that is allowed
  r.use((req, res, next) => (async () => {
    const m = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
    const [a] = m ? await q("SELECT a.id, a.username, a.must_change FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > NOW()", [sha(m[1])]) : [];
    if (!a) return res.status(401).json({ error: "Phiên admin đã hết hạn, hãy đăng nhập lại." });
    req.admin = { id: a.id, name: a.username, mustChange: !!a.must_change, token: m[1] };
    if (a.must_change && req.path !== "/me/password" && req.path !== "/me" && req.path !== "/logout")
      return res.status(403).json({ error: "Hãy đổi mật khẩu trước.", mustChange: true });
    next();
  })().catch(next));

  const log = (admin, action, target, detail) =>
    q("INSERT INTO admin_log (admin, action, target, detail) VALUES (?, ?, ?, ?)", [admin.name, action, String(target).slice(0, 120), detail === null ? null : JSON.stringify(detail).slice(0, 4000)]);

  r.get("/me", (req, res) => res.json({ username: req.admin.name, mustChange: req.admin.mustChange }));
  r.post("/logout", wrap(async (req, res) => {
    await q("DELETE FROM admin_sessions WHERE token_hash = ?", [sha(req.admin.token)]);
    res.json({ ok: true });
  }));
  r.post("/me/password", wrap(async (req, res) => {
    const old = String(req.body?.old ?? ""), pw = String(req.body?.password ?? "");
    const [a] = await q("SELECT pass_hash FROM admins WHERE id = ?", [req.admin.id]);
    if (!(await verifyPassword(old, a.pass_hash))) throw bad("Mật khẩu hiện tại không đúng.");
    if (pw.length < 8 || pw.length > 72) throw bad("Mật khẩu mới dài 8-72 ký tự.");
    if (pw === old) throw bad("Mật khẩu mới phải khác mật khẩu cũ.");
    await q("UPDATE admins SET pass_hash = ?, must_change = 0 WHERE id = ?", [await hashPassword(pw), req.admin.id]);
    // other sessions of this admin end; this one stays
    await q("DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash <> ?", [req.admin.id, sha(req.admin.token)]);
    await log(req.admin, "password", req.admin.name, null);
    res.json({ ok: true });
  }));

  // ---- admin accounts
  r.get("/admins", wrap(async (req, res) => res.json(await q("SELECT id, username, must_change, created_at, last_login FROM admins ORDER BY id"))));
  r.post("/admins", wrap(async (req, res) => {
    const username = String(req.body?.username ?? "").trim(), pw = String(req.body?.password ?? "");
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw bad("Tên admin 3-32 ký tự: chữ không dấu, số, _.");
    if (pw.length < 8 || pw.length > 72) throw bad("Mật khẩu dài 8-72 ký tự.");
    try {
      await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 1)", [username, await hashPassword(pw)]);
    } catch (e) {
      if (isDup(e)) throw bad("Tên admin đã có.", 409);
      throw e;
    }
    await log(req.admin, "admin.add", username, null);
    res.json({ ok: true });
  }));
  r.delete("/admins/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.admin.id) throw bad("Không thể tự xóa tài khoản đang dùng.");
    const [a] = await q("SELECT username FROM admins WHERE id = ?", [id]);
    if (!a) throw bad("Không có admin này.", 404);
    await q("DELETE FROM admins WHERE id = ?", [id]);
    await log(req.admin, "admin.del", a.username, null);
    res.json({ ok: true });
  }));

  // ---- overview and log
  r.get("/overview", wrap(async (req, res) => {
    const one = async (sql) => Number((await q(sql))[0].n);
    const top = await q("SELECT c.name, c.exp, c.stones, c.rank_points FROM characters c ORDER BY c.exp DESC LIMIT 5");
    res.json({
      online: world.online,
      users: await one("SELECT COUNT(*) AS n FROM users"),
      characters: await one("SELECT COUNT(*) AS n FROM characters"),
      newToday: await one("SELECT COUNT(*) AS n FROM users WHERE created_at >= CURDATE()"),
      banned: await one("SELECT COUNT(*) AS n FROM users WHERE banned = 1"),
      dailyToday: await one("SELECT COUNT(*) AS n FROM daily_claims WHERE day = CURDATE()"),
      stones: await one("SELECT COALESCE(SUM(stones), 0) AS n FROM characters"),
      spentToday: await one("SELECT COALESCE(SUM(price), 0) AS n FROM purchases WHERE created_at >= CURDATE()"),
      cosmeticsToday: await one("SELECT COALESCE(SUM(price), 0) AS n FROM owned_cosmetics WHERE bought_at >= CURDATE()"),
      top: top.map((t) => ({ name: t.name, realm: realmName(levelFromExp(Number(t.exp))), exp: Number(t.exp), stones: Number(t.stones), rank: Number(t.rank_points) })),
    });
  }));
  r.get("/log", wrap(async (req, res) => {
    const before = Number(req.query.before) || 2 ** 53;
    res.json(await q("SELECT id, admin, action, target, detail, at FROM admin_log WHERE id < ? ORDER BY id DESC LIMIT 100", [before]));
  }));

  // ---- the game's tables
  /** After a change to a config table: check the whole set inside the transaction (throws → rollback). */
  const checkInside = async (c) => {
    try {
      checkConfig(await readConfig(c));
    } catch (e) {
      throw bad(`Không lưu: ${e.message}`);
    }
  };
  /** After the commit: the game takes the new numbers now, not in 10 s. */
  const applyNow = async () => {
    if (await loadConfig()) world.onConfig();
  };
  const tableOf = (name) => {
    const t = T[name];
    if (!t) throw bad("Không có bảng này.", 404);
    return t;
  };
  const pkValue = (t, v) => (t.pkType === "key" || t.pk === "k" || t.pk === "type" ? String(v) : Number(v));
  const checkCosmetic = (row) => {
    if (!hasPart(row.kind, row.gender, row.idx))
      throw bad(`Không có hình số ${row.idx}: cần thư mục public/${folderOf(row.kind, row.gender)}/${row.idx}-tenmon/ có hinh.png (và thong-tin.json).`);
  };

  r.get("/t/:table", wrap(async (req, res) => {
    const t = tableOf(req.params.table);
    const extra = req.params.table === "settings" ? ", note" : req.params.table === "cosmetics" ? ", (SELECT COUNT(*) FROM owned_cosmetics o WHERE o.cosmetic_id = cosmetics.id) AS owners" : "";
    const rows = await q(`SELECT ${t.pk}${Object.keys(t.cols).filter((c) => c !== t.pk).map((c) => `, ${c}`).join("")}${extra} FROM ${req.params.table} ORDER BY ${t.order}`);
    res.json(rows.map((x) => ({ ...x, owners: x.owners === undefined ? undefined : Number(x.owners) })));
  }));

  r.patch("/t/:table/:pk", wrap(async (req, res) => {
    const name = req.params.table, t = tableOf(name), pk = pkValue(t, req.params.pk), body = req.body ?? {};
    const set = Object.entries(body).filter(([k]) => t.cols[k]).map(([k, v]) => [k, value(t.cols[k], v, k)]);
    if (!set.length) throw bad("Không có gì để lưu.");
    await tx(async (c) => {
      const [before] = await c.query(`SELECT * FROM ${name} WHERE ${t.pk} = ?`, [pk]);
      if (!before) throw bad("Không tìm thấy dòng này.", 404);
      if (name === "cosmetics") checkCosmetic({ ...before, ...Object.fromEntries(set) });
      await c.query(`UPDATE ${name} SET ${set.map(([k]) => `${k} = ?`).join(", ")} WHERE ${t.pk} = ?`, [...set.map(([, v]) => v), pk]);
      if (t.config) await checkInside(c);
      await log(req.admin, `${name}.edit`, pk, Object.fromEntries(set.map(([k, v]) => [k, [before[k], v]])));
    }).catch((e) => {
      if (isDup(e)) throw bad("Trùng với một món đã có (loại, giới tính, idx).", 409);
      throw e;
    });
    if (t.config) await applyNow();
    res.json({ ok: true });
  }));

  r.post("/t/:table", wrap(async (req, res) => {
    const name = req.params.table, t = tableOf(name), body = req.body ?? {};
    if (!t.add) throw bad("Bảng này không thêm dòng được.");
    const row = {};
    for (const [k, type] of Object.entries(t.cols)) if (body[k] !== undefined) row[k] = value(type, body[k], k);
    if (t.pkType === "key") {
      const key = String(body[t.pk] ?? "").trim();
      if (!/^[a-z0-9_]{2,32}$/.test(key)) throw bad("Mã: 2-32 ký tự chữ thường không dấu, số, _.");
      row[t.pk] = key;
    }
    if (name === "realms" && row.sort === undefined) row.sort = Number((await q("SELECT COALESCE(MAX(sort), 0) + 10 AS s FROM realms"))[0].s);
    if (name === "cosmetics") {
      for (const k of ["kind", "gender", "idx", "name"]) if (row[k] === undefined) throw bad(`Thiếu ${k}.`);
      checkCosmetic(row);
    }
    let id;
    await tx(async (c) => {
      const keys = Object.keys(row);
      const out = await c.query(`INSERT INTO ${name} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, keys.map((k) => row[k]));
      id = row[t.pk] ?? out.insertId;
      if (t.config) await checkInside(c);
      await log(req.admin, `${name}.add`, id, row);
    }).catch((e) => {
      if (isDup(e)) throw bad("Đã có dòng này rồi.", 409);
      throw e;
    });
    if (t.config) await applyNow();
    res.json({ ok: true, id });
  }));

  r.delete("/t/:table/:pk", wrap(async (req, res) => {
    const name = req.params.table, t = tableOf(name), pk = pkValue(t, req.params.pk);
    if (!t.del) throw bad("Bảng này không xóa dòng được.");
    await tx(async (c) => {
      const [before] = await c.query(`SELECT * FROM ${name} WHERE ${t.pk} = ?`, [pk]);
      if (!before) throw bad("Không tìm thấy dòng này.", 404);
      await c.query(`DELETE FROM ${name} WHERE ${t.pk} = ?`, [pk]);
      // an art takes what it needed with it; who learned it keeps the row (harmless) until it comes back
      if (name === "arts") await c.query("DELETE FROM art_reqs WHERE art_key = ?", [pk]);
      // a monster takes its drop list with it; one a map places can't go
      if (name === "monsters") {
        const used = MAPS.filter((m) => m.mobs.some((x) => x.type === pk)).map((m) => m.name);
        if (used.length) throw bad(`Không xóa được: bản đồ ${used.join(", ")} đang đặt yêu thú này.`);
        await c.query("DELETE FROM monster_drops WHERE monster = ?", [pk]);
      }
      if (t.config) await checkInside(c);
      await log(req.admin, `${name}.del`, pk, before);
    });
    if (t.config) await applyNow();
    res.json({ ok: true });
  }));

  // ---- players
  // Every edit of a player goes through store.admin*(), under the player's own lock with atomic SQL, and hands the
  // re-read character to world.refresh() while still holding that lock: an online player's running numbers, their
  // unsaved gains and the save in flight all stay right (see World.applyBase).
  const PLAYER_COLS = `u.id, u.username, u.banned, u.ban_reason, u.created_at, c.name, c.gender, c.hair, c.robe, c.weapon, c.sword, c.exp, c.stones, c.rank_points,
    c.kills, c.deaths, c.created_at AS char_created, (c.med_day = CURDATE()) AS med_today, c.med_exp`;
  const shapePlayer = (p) => ({
    ...p, exp: p.exp === null ? null : Number(p.exp), stones: p.stones === null ? null : Number(p.stones), banned: !!p.banned,
    realm: p.exp === null ? null : realmName(levelFromExp(Number(p.exp))), level: p.exp === null ? null : levelFromExp(Number(p.exp)),
    online: world.players.has(p.id), medLeft: p.exp === null ? null : Math.max(0, MEDITATE.dailyCap - (p.med_today ? Number(p.med_exp) : 0)),
  });
  r.get("/players", wrap(async (req, res) => {
    const s = `%${String(req.query.q ?? "").replace(/[%_\\]/g, "\\$&")}%`;
    const sort = { exp: "c.exp DESC", stones: "c.stones DESC", new: "u.id DESC", rank: "c.rank_points DESC" }[req.query.sort] ?? "u.id DESC";
    const only = req.query.filter === "online" ? [...world.players.keys()] : null;
    if (only && !only.length) return res.json([]);
    const rows = await q(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN characters c ON c.user_id = u.id
      WHERE (u.username LIKE ? OR c.name LIKE ?) ${req.query.filter === "banned" ? "AND u.banned = 1" : ""} ${only ? `AND u.id IN (${only.map(() => "?").join(",")})` : ""}
      ORDER BY ${sort} LIMIT 500`, [s, s, ...(only ?? [])]);
    res.json(rows.map(shapePlayer));
  }));
  const playerId = (v) => {
    const id = Number(v);
    if (!Number.isInteger(id) || id < 1) throw bad("Người chơi không hợp lệ.");
    return id;
  };
  async function playerDetail(id) {
    const [p] = await q(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN characters c ON c.user_id = u.id WHERE u.id = ?`, [id]);
    if (!p) throw bad("Không có người chơi này.", 404);
    const [owned, buys, pvp, history, oldBuffs] = await Promise.all([
      q("SELECT c.id, c.kind, c.gender, c.idx, c.name, c.price, c.special, o.price AS paid, o.bought_at FROM owned_cosmetics o JOIN cosmetics c ON c.id = o.cosmetic_id WHERE o.user_id = ? ORDER BY c.kind, c.idx", [id]),
      q("SELECT item, qty, price, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [id]),
      q(`SELECT l.killer_id, l.victim_id, l.rewarded, l.at, k.name AS killer, v.name AS victim FROM pvp_log l
         LEFT JOIN characters k ON k.user_id = l.killer_id LEFT JOIN characters v ON v.user_id = l.victim_id
         WHERE l.killer_id = ? OR l.victim_id = ? ORDER BY l.id DESC LIMIT 20`, [id, id]),
      q("SELECT admin, action, detail, at FROM admin_log WHERE target = ? AND action LIKE 'player.%' ORDER BY id DESC LIMIT 30", [String(id)]),
      q("SELECT id, stat, pct, expires_at, note, created_by, created_at FROM player_buffs WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW() ORDER BY id DESC LIMIT 10", [id]),
    ]);
    const ch = p.name === null ? null : await loadCharacter(id);
    return {
      ...shapePlayer(p), inventory: await inventory(id), owned, buys, pvp, history, learned: ch?.learned ?? [], slots: ch?.slots ?? [],
      buffs: await activeBuffs(id), expiredBuffs: oldBuffs.map((b) => ({ ...b, id: Number(b.id) })), live: world.liveInfo(id),
    };
  }
  r.get("/players/:id", wrap(async (req, res) => res.json(await playerDetail(playerId(req.params.id)))));
  const refresh = (id) => (ch) => world.refresh(id, ch);

  // one number at a time: add, take away (never below 0) or set
  r.post("/players/:id/adjust", wrap(async (req, res) => {
    const id = playerId(req.params.id), { field, op } = req.body ?? {}, v = value("int", req.body?.value, "giá trị");
    if (!["add", "sub", "set"].includes(op)) throw bad("Thao tác: add, sub hoặc set.");
    const ch = await adminAdjust(id, field, op === "set" ? "set" : "add", op === "sub" ? -Math.abs(v) : op === "add" ? Math.abs(v) : v, refresh(id));
    await log(req.admin, "player.adjust", id, { field, op, value: v, now: { stones: ch.stones, exp: ch.exp, rank: ch.rank, kills: ch.kills, deaths: ch.deaths }[field] });
    res.json(await playerDetail(id));
  }));
  // straight to a level: tu vi set to the first point of that level
  r.post("/players/:id/level", wrap(async (req, res) => {
    const id = playerId(req.params.id), L = value("uint", req.body?.level, "cấp");
    if (L < 1 || L > MAX_LEVEL) throw bad(`Cấp từ 1 đến ${MAX_LEVEL}.`);
    await adminAdjust(id, "exp", "set", expForLevel(L), refresh(id));
    await log(req.admin, "player.level", id, { level: L, realm: realmName(L) });
    res.json(await playerDetail(id));
  }));
  r.post("/players/:id/meditation", wrap(async (req, res) => {
    const id = playerId(req.params.id);
    await adminResetMeditation(id, refresh(id));
    await log(req.admin, "player.meditation", id, null);
    res.json(await playerDetail(id));
  }));
  r.post("/players/:id/items", wrap(async (req, res) => {
    const id = playerId(req.params.id), { item, op } = req.body ?? {}, v = value("uint", req.body?.value, "số lượng");
    if (!["add", "sub", "set"].includes(op)) throw bad("Thao tác: add, sub hoặc set.");
    await adminItem(id, String(item ?? ""), op === "set" ? "set" : "add", op === "sub" ? -v : v);
    await log(req.admin, "player.item", id, { item, op, value: v });
    await world.sendInv(id);
    res.json(await playerDetail(id));
  }));
  // an event's reward: give an art to everyone, everyone online, or a list of đạo hiệu; who is online gets it at once
  r.post("/arts/:key/grant", wrap(async (req, res) => {
    const key = String(req.params.key), to = String(req.body?.to ?? "");
    let uids = null;
    if (to === "online") uids = [...world.players.keys()];
    else if (to !== "all") {
      const names = String(req.body?.names ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) throw bad("Nhập đạo hiệu, cách nhau bằng dấu phẩy.");
      const rows = await q("SELECT user_id, name FROM characters WHERE name IN (?)", [names]);
      const miss = names.filter((n) => !rows.some((r) => r.name.toLowerCase() === n.toLowerCase()));
      if (miss.length) throw bad(`Không có nhân vật: ${miss.join(", ")}`);
      uids = rows.map((r) => r.user_id);
    }
    const ids = await grantArtMany(key, uids);
    for (const id of ids) if (world.players.has(id)) world.refresh(id, await loadCharacter(id));
    await log(req.admin, "arts.grant", key, { to: to === "all" || to === "online" ? to : req.body?.names, count: ids.length });
    res.json({ ok: true, count: ids.length });
  }));

  // an admin's test: drop a monster by an online player (no map has the new ones yet). It never comes back once killed.
  r.post("/players/:id/summon", wrap(async (req, res) => {
    const id = playerId(req.params.id), type = String(req.body?.type ?? "");
    if (!world.players.has(id)) throw bad("Người chơi đang offline.", 409);
    if (!world.summon(id, type)) throw bad("Không có yêu thú này.");
    await log(req.admin, "player.summon", id, { type });
    res.json(await playerDetail(id));
  }));

  // teach an art without spending anything, or take one back (it leaves the bar too); an online player gets it at once
  r.post("/players/:id/arts", wrap(async (req, res) => {
    const id = playerId(req.params.id), key = String(req.body?.key ?? ""), learn = req.body?.learn === true;
    world.refresh(id, await adminArt(id, key, learn));
    await log(req.admin, learn ? "player.teach" : "player.unteach", id, { art: key });
    res.json(await playerDetail(id));
  }));
  // name and look: shown to everyone at once, no need to log back in
  r.patch("/players/:id/look", wrap(async (req, res) => {
    const id = playerId(req.params.id), b = req.body ?? {}, set = {};
    if (b.name !== undefined) {
      const name = String(b.name).trim().replace(/\s+/g, " ");
      if (!NAME_RE.test(name)) throw bad("Đạo hiệu 3-16 ký tự: chữ, số, khoảng trắng hoặc _.");
      set.name = name;
    }
    const [cur] = await q("SELECT gender, hair, robe, weapon, sword FROM characters WHERE user_id = ?", [id]);
    if (!cur) throw bad("Người chơi này chưa có nhân vật.");
    if (b.gender !== undefined) {
      if (!GENDERS.includes(b.gender)) throw bad("Giới tính m hoặc f.");
      set.gender = b.gender;
    }
    const g = set.gender ?? cur.gender;
    for (const k of ["hair", "robe"]) {
      const v = b[k] === undefined ? (set.gender ? cur[k] : undefined) : value("uint", b[k], k);
      if (v === undefined) continue;
      if (!hasPart(k, g, v)) throw bad(`${partName[k]} số ${v} không có cho giới tính này (không có thư mục public/${folderOf(k, g)}/${v}-...).`);
      set[k] = v;
    }
    if (b.weapon !== undefined) {
      const v = value("uint", b.weapon, "vũ khí");
      if (!hasPart("weapon", "a", v)) throw bad(`Vũ khí số ${v} không có (không có thư mục public/vu-khi/${v}-...).`);
      set.weapon = v;
    }
    if (b.sword !== undefined) {
      const v = value("uint", b.sword, "phi kiếm");
      if (!hasPart("sword", "a", v)) throw bad(`Phi kiếm số ${v} không có (không có thư mục public/phi-kiem/${v}-...).`);
      set.sword = v;
    }
    await adminLook(id, set, refresh(id));
    await log(req.admin, "player.look", id, set);
    res.json(await playerDetail(id));
  }));

  // buffs: a percent on one stat, for some hours or for good; they add up per stat
  r.post("/players/:id/buffs", wrap(async (req, res) => {
    const id = playerId(req.params.id), b = req.body ?? {}, def = BUFF_STATS[b.stat];
    if (!def) throw bad("Chỉ số buff không hợp lệ.");
    const pct = value("num", b.pct, "phần trăm");
    if (pct < def.min || pct > def.max || pct === 0) throw bad(`${def.name}: từ ${def.min}% đến ${def.max}%, khác 0.`);
    const hours = b.hours === "" || b.hours === null || b.hours === undefined ? null : value("num", b.hours, "số giờ");
    if (hours !== null && (hours <= 0 || hours > 24 * 365)) throw bad("Số giờ từ lớn hơn 0 đến 8760 (để trống là vĩnh viễn).");
    const [u] = await q("SELECT 1 FROM users WHERE id = ?", [id]);
    if (!u) throw bad("Không có người chơi này.", 404);
    await q(`INSERT INTO player_buffs (user_id, stat, pct, expires_at, note, created_by) VALUES (?, ?, ?, ${hours === null ? "NULL" : "NOW() + INTERVAL ? SECOND"}, ?, ?)`,
      [id, b.stat, pct, ...(hours === null ? [] : [Math.round(hours * 3600)]), String(b.note ?? "").slice(0, 200), req.admin.name]);
    await world.reloadBuffs(id);
    await log(req.admin, "player.buff", id, { stat: b.stat, pct, hours });
    res.json(await playerDetail(id));
  }));
  r.delete("/players/:id/buffs/:bid", wrap(async (req, res) => {
    const id = playerId(req.params.id);
    const out = await q("DELETE FROM player_buffs WHERE id = ? AND user_id = ?", [Number(req.params.bid), id]);
    if (!out.affectedRows) throw bad("Không có buff này.", 404);
    await world.reloadBuffs(id);
    await log(req.admin, "player.unbuff", id, { buff: Number(req.params.bid) });
    res.json(await playerDetail(id));
  }));

  // things only the running game can do: heal, revive, back to the spawn, clear cooldowns
  r.post("/players/:id/live", wrap(async (req, res) => {
    const id = playerId(req.params.id), action = String(req.body?.action ?? "");
    if (!["heal", "revive", "spawn", "cooldowns"].includes(action)) throw bad("Thao tác không hợp lệ.");
    if (!world.liveAction(id, action)) throw bad("Người chơi đang offline.", 409);
    await log(req.admin, "player.live", id, { action });
    res.json(await playerDetail(id));
  }));

  r.post("/players/:id/cosmetics", wrap(async (req, res) => {
    const id = playerId(req.params.id), cid = value("uint", req.body?.id, "món"), own = req.body?.own === true;
    if (own) await q("INSERT IGNORE INTO owned_cosmetics (user_id, cosmetic_id, price) VALUES (?, ?, 0)", [id, cid]);
    else await q("DELETE FROM owned_cosmetics WHERE user_id = ? AND cosmetic_id = ?", [id, cid]);
    await log(req.admin, own ? "player.give" : "player.take", id, { cosmetic: cid });
    res.json(await playerDetail(id));
  }));

  r.post("/players/:id/ban", wrap(async (req, res) => {
    const id = playerId(req.params.id), banned = req.body?.banned === true, reason = String(req.body?.reason ?? "").slice(0, 200);
    const out = await q("UPDATE users SET banned = ?, ban_reason = ? WHERE id = ?", [banned ? 1 : 0, banned ? reason : "", id]);
    if (!out.affectedRows) throw bad("Không có người chơi này.", 404);
    if (banned) {
      await q("DELETE FROM sessions WHERE user_id = ?", [id]);
      world.kickUser(id, `Tài khoản đã bị khóa${reason ? `: ${reason}` : "."}`);
    }
    await log(req.admin, banned ? "player.ban" : "player.unban", id, { reason });
    res.json(await playerDetail(id));
  }));

  r.post("/players/:id/kick", wrap(async (req, res) => {
    const id = playerId(req.params.id);
    world.kickUser(id, String(req.body?.reason || "Đạo hữu đã bị admin mời ra khỏi game."));
    await log(req.admin, "player.kick", id, null);
    res.json({ ok: true });
  }));

  r.post("/players/:id/password", wrap(async (req, res) => {
    const id = playerId(req.params.id), pw = String(req.body?.password ?? "");
    if (pw.length < 6 || pw.length > 72) throw bad("Mật khẩu dài 6-72 ký tự.");
    const out = await q("UPDATE users SET pass_hash = ? WHERE id = ?", [await hashPassword(pw), id]);
    if (!out.affectedRows) throw bad("Không có người chơi này.", 404);
    await q("DELETE FROM sessions WHERE user_id = ?", [id]);
    world.kickUser(id, "Mật khẩu đã được đặt lại, hãy đăng nhập lại.");
    await log(req.admin, "player.password", id, null);
    res.json({ ok: true });
  }));

  r.delete("/players/:id", wrap(async (req, res) => {
    const id = playerId(req.params.id);
    const [u] = await q("SELECT username FROM users WHERE id = ?", [id]);
    if (!u) throw bad("Không có người chơi này.", 404);
    if (req.body?.confirm !== u.username) throw bad("Gõ đúng tên đăng nhập để xác nhận xóa.");
    world.kickUser(id, "Tài khoản đã bị xóa.");
    // let the world save and drop them before the rows go
    await new Promise((ok) => setTimeout(ok, 300));
    await userLock.run(id, () => q("DELETE FROM users WHERE id = ?", [id]));
    await log(req.admin, "player.delete", u.username, null);
    res.json({ ok: true });
  }));

  r.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON không hợp lệ." });
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") return res.status(400).json({ error: "Yêu cầu không hợp lệ." });
    console.error("admin", err);
    res.status(500).json({ error: "Lỗi máy chủ, hãy thử lại." });
  });

  app.use("/api", r);
  // the page, plus the parts' pictures (one folder each) for the thumbnails
  // the pictures of parts and arts (one folder each), and their list, for the thumbnails
  app.get("/assets.json", (req, res) => res.set("cache-control", "no-cache").type("application/json").send(assetsJson()));
  for (const d of [...Object.keys(PART_DIRS), ART_DIR, "nhan-vat"]) app.use(`/${d}`, express.static(join(ROOT, "public", d), { maxAge: 0 }));
  app.use("/xianxia", express.static(join(ROOT, "public", "xianxia"), { maxAge: "1h" }));
  app.use(express.static(join(ROOT, "admin"), { index: "index.html", maxAge: 0 }));
  app.use((req, res) => res.status(404).json({ error: "Không tìm thấy." }));
  return app;
}
