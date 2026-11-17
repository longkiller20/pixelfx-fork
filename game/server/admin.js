// The admin site: its own Express app on its own port (ADMIN_PORT, 5885 by default), so it can be firewalled apart from the
// game. Admin accounts and sessions live in their own tables; every change is written to admin_log. It edits:
//   players (stones, exp, items, hair and robes, bans, passwords), realms, pills, monsters, arts, settings, hair & robes,
//   and the admin accounts themselves.
// Game numbers are checked with the same checkConfig() the game uses before anything is saved, then applied at once.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { q, tx, isDup } from "./db.js";
import { ROOT, config } from "./config.js";
import { hashPassword, verifyPassword, dummyVerify, rateLimit } from "./auth.js";
import { readConfig, loadConfig } from "./gameconfig.js";
import { checkConfig, levelFromExp, realmName, SKILL_PARAMS, NAME_RE, USER_RE, GENDERS } from "../shared/balance.js";
import { loadCharacter, inventory, GameError } from "./store.js";
import { userLock } from "./lock.js";

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
    cols: { name: "str:40", description: "str:200", price: "uint", heal: "num", exp_base: "uint", exp_per_level: "uint", cooldown: "num", on_sale: "bool", sort: "int" },
  },
  monsters: {
    pk: "type", order: "type", config: true,
    cols: { name: "str:40", hp: "num", atk: "num", def: "num", spd: "num", respawn: "num", exp_base: "uint", exp_per_level: "uint", stones: "uint", aggro: "num", reach: "num", cooldown: "num", mult: "num" },
  },
  skills: { pk: "slot", order: "slot", config: true, cols: { name: "str:40", type: "enum:melee|bolt|zone", cd: "num", mult: "num", params: "json" } },
  settings: { pk: "k", order: "k", config: true, cols: { v: "num" } },
  cosmetics: {
    pk: "id", order: "kind, gender, starter DESC, sort, idx", add: true, del: true,
    cols: { kind: "enum:hair|robe", gender: "enum:m|f", idx: "uint", name: "str:40", price: "uint", starter: "bool", on_sale: "bool", sort: "int" },
  },
};

function value(type, v, col) {
  if (type.startsWith("str:")) {
    const s = String(v ?? "").trim();
    if (!s && col !== "description") throw bad(`${col}: không được để trống`);
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

const atlasCount = (kind, g) => {
  const meta = JSON.parse(readFileSync(join(ROOT, "public", "avatar", "avatar.json"), "utf8"));
  return meta[`${kind}_${g}`]?.length ?? 0;
};

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
    const n = atlasCount(row.kind, row.gender);
    if (row.idx >= n) throw bad(`idx ${row.idx} không có trong atlas ${row.kind}_${row.gender} (có ${n} món, idx 0-${n - 1}).`);
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
      if (t.config) await checkInside(c);
      await log(req.admin, `${name}.del`, pk, before);
    });
    if (t.config) await applyNow();
    res.json({ ok: true });
  }));

  // ---- players
  const PLAYER_COLS = `u.id, u.username, u.banned, u.ban_reason, u.created_at, c.name, c.gender, c.hair, c.robe, c.exp, c.stones, c.rank_points,
    c.kills, c.deaths, c.created_at AS char_created`;
  const shapePlayer = (p) => ({
    ...p, exp: p.exp === null ? null : Number(p.exp), stones: p.stones === null ? null : Number(p.stones), banned: !!p.banned,
    realm: p.exp === null ? null : realmName(levelFromExp(Number(p.exp))), level: p.exp === null ? null : levelFromExp(Number(p.exp)),
    online: world.players.has(p.id),
  });
  r.get("/players", wrap(async (req, res) => {
    const s = `%${String(req.query.q ?? "").replace(/[%_\\]/g, "\\$&")}%`, sort = { exp: "c.exp DESC", stones: "c.stones DESC", new: "u.id DESC", rank: "c.rank_points DESC" }[req.query.sort] ?? "u.id DESC";
    const rows = await q(`SELECT ${PLAYER_COLS} FROM users u LEFT JOIN characters c ON c.user_id = u.id
      WHERE u.username LIKE ? OR c.name LIKE ? ORDER BY ${sort} LIMIT 100`, [s, s]);
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
    const owned = await q("SELECT c.id, c.kind, c.gender, c.idx, c.name, c.price, o.price AS paid, o.bought_at FROM owned_cosmetics o JOIN cosmetics c ON c.id = o.cosmetic_id WHERE o.user_id = ? ORDER BY c.kind, c.idx", [id]);
    const buys = await q("SELECT item, qty, price, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [id]);
    return { ...shapePlayer(p), inventory: await inventory(id), owned, buys };
  }
  r.get("/players/:id", wrap(async (req, res) => res.json(await playerDetail(playerId(req.params.id)))));

  /** After editing an online player's saved numbers: the world takes them (pending gains are kept on top). */
  const refresh = async (id) => {
    const ch = await loadCharacter(id);
    if (ch) world.refresh(id, ch);
  };

  r.patch("/players/:id", wrap(async (req, res) => {
    const id = playerId(req.params.id), b = req.body ?? {}, set = [];
    if (b.name !== undefined) {
      const name = String(b.name).trim().replace(/\s+/g, " ");
      if (!NAME_RE.test(name)) throw bad("Đạo hiệu 3-16 ký tự: chữ, số, khoảng trắng hoặc _.");
      set.push(["name", name]);
    }
    for (const k of ["stones", "exp", "rank_points", "kills", "deaths"]) if (b[k] !== undefined) set.push([k, value("uint", b[k], k)]);
    if (b.gender !== undefined) {
      if (!GENDERS.includes(b.gender)) throw bad("Giới tính m hoặc f.");
      set.push(["gender", b.gender]);
    }
    for (const k of ["hair", "robe"]) if (b[k] !== undefined) set.push([k, value("uint", b[k], k)]);
    if (!set.length) throw bad("Không có gì để lưu.");
    await userLock.run(id, () => tx(async (c) => {
      const [before] = await c.query("SELECT name, gender, hair, robe, exp, stones, rank_points, kills, deaths FROM characters WHERE user_id = ?", [id]);
      if (!before) throw bad("Người chơi này chưa có nhân vật.");
      try {
        await c.query(`UPDATE characters SET ${set.map(([k]) => `${k} = ?`).join(", ")} WHERE user_id = ?`, [...set.map(([, v]) => v), id]);
      } catch (e) {
        if (isDup(e)) throw bad("Đạo hiệu đã có người dùng.", 409);
        throw e;
      }
      await log(req.admin, "player.edit", id, Object.fromEntries(set.map(([k, v]) => [k, [before[k], v]])));
    }));
    // a new name or look needs a fresh join to show everywhere; numbers are taken over live
    if (set.some(([k]) => ["name", "gender", "hair", "robe"].includes(k))) world.kickUser(id, "Admin vừa cập nhật nhân vật của đạo hữu, hãy vào lại.");
    else await refresh(id);
    res.json(await playerDetail(id));
  }));

  r.put("/players/:id/items/:item", wrap(async (req, res) => {
    const id = playerId(req.params.id), item = String(req.params.item), qty = value("uint", req.body?.qty, "số lượng");
    if (!/^[a-z0-9_]{1,32}$/.test(item)) throw bad("Mã vật phẩm không hợp lệ.");
    await userLock.run(id, async () => {
      if (qty > 0) await q("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = VALUES(qty)", [id, item, qty]);
      else await q("DELETE FROM inventory WHERE user_id = ? AND item = ?", [id, item]);
    });
    await log(req.admin, "player.item", id, { item, qty });
    await world.sendInv(id);
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
  // the page, plus the hair and robe atlases for thumbnails
  app.use("/avatar", express.static(join(ROOT, "public", "avatar"), { maxAge: "1h" }));
  app.use(express.static(join(ROOT, "admin"), { index: "index.html", maxAge: 0 }));
  app.use((req, res) => res.status(404).json({ error: "Không tìm thấy." }));
  return app;
}
