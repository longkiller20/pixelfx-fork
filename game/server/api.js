// The REST API: accounts, the character, the shop, the daily gift, the leaderboard.
import express from "express";
import { q, tx, isDup } from "./db.js";
import { hashPassword, verifyPassword, dummyVerify, createSession, dropSession, requireAuth, rateLimit } from "./auth.js";
import * as store from "./store.js";
import { GameError } from "./store.js";
import { USER_RE } from "../shared/balance.js";

const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function api(world) {
  const r = express.Router();
  r.use(express.json({ limit: "4kb" }));

  // logging in and signing up are slow on purpose (scrypt) and limited per address
  const authLimit = rateLimit({ windowMs: 60_000, max: 12, message: "Đăng nhập sai quá nhiều, hãy đợi 1 phút." });
  const writeLimit = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `u${req.userId}` });

  const creds = (body) => {
    const username = String(body?.username ?? ""), password = String(body?.password ?? "");
    if (!USER_RE.test(username)) throw new GameError("Tên đăng nhập 3-16 ký tự: chữ không dấu, số hoặc _.");
    if (password.length < 6 || password.length > 72) throw new GameError("Mật khẩu dài 6-72 ký tự.");
    return { username, password };
  };

  r.post("/register", authLimit, wrap(async (req, res) => {
    const { username, password } = creds(req.body);
    const hash = await hashPassword(password);
    let id;
    try {
      id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, ?)", [username, hash])).insertId;
    } catch (e) {
      if (isDup(e)) throw new GameError("Tên đăng nhập đã có người dùng.", 409);
      throw e;
    }
    res.json({ token: await createSession(id) });
  }));

  r.post("/login", authLimit, wrap(async (req, res) => {
    const { username, password } = creds(req.body);
    const rows = await q("SELECT id, pass_hash FROM users WHERE username = ?", [username]);
    const ok = rows.length ? await verifyPassword(password, rows[0].pass_hash) : await dummyVerify(password);
    if (!rows.length || !ok) throw new GameError("Sai tên đăng nhập hoặc mật khẩu.", 401);
    res.json({ token: await createSession(rows[0].id) });
  }));

  r.post("/logout", requireAuth, wrap(async (req, res) => {
    await dropSession(req.token);
    world.kickUser(req.userId, "Đã đăng xuất.");
    res.json({ ok: true });
  }));

  r.get("/me", requireAuth, wrap(async (req, res) => {
    const [u] = await q("SELECT username FROM users WHERE id = ?", [req.userId]);
    const character = await store.loadCharacter(req.userId);
    res.json({
      username: u?.username, character, inventory: character ? await store.inventory(req.userId) : {},
      dailyClaimed: character ? await store.dailyClaimed(req.userId) : false,
    });
  }));

  r.post("/character", requireAuth, writeLimit, wrap(async (req, res) => {
    res.json({ character: await store.createCharacter(req.userId, req.body?.name, req.body?.look) });
  }));

  r.post("/shop/buy", requireAuth, writeLimit, wrap(async (req, res) => {
    const { item, qty, requestId } = req.body ?? {};
    const out = await store.buy(req.userId, item, qty, requestId);
    world.refresh(req.userId, out.character);
    res.json({ ...out, inventory: await store.inventory(req.userId) });
  }));

  r.post("/daily", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.claimDaily(req.userId);
    world.refresh(req.userId, character);
    res.json({ character });
  }));

  r.get("/leaderboard", rateLimit({ windowMs: 10_000, max: 20 }), wrap(async (req, res) => {
    res.json(await store.leaderboard());
  }));

  r.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") return res.status(400).json({ error: "Yêu cầu không hợp lệ." });
    console.error(err);
    res.status(500).json({ error: "Lỗi máy chủ, hãy thử lại." });
  });
  return r;
}

export { tx };
