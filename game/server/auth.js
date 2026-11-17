// Accounts and sessions. Passwords are hashed with scrypt and a random salt; session tokens are random and only their
// SHA-256 is stored, so a leaked database can't be used to log in.
import crypto from "node:crypto";
import { promisify } from "node:util";
import { q } from "./db.js";
import { config } from "./config.js";

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw, stored) {
  const [v, s, k] = String(stored).split("$");
  if (v !== "s1" || !s || !k) return false;
  const want = Buffer.from(k, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), want.length, SCRYPT);
  return crypto.timingSafeEqual(want, got);
}

// a fixed hash to check against when the user doesn't exist, so a wrong username takes as long as a wrong password
const DUMMY = await hashPassword(crypto.randomBytes(12).toString("hex"));
export const dummyVerify = (pw) => verifyPassword(pw, DUMMY);

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await q("DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()", [userId]);
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)", [sha(token), userId, config.sessionDays]);
  return token;
}

/** The user id a token belongs to, or null. */
export async function userFromToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  // a banned account's sessions stop working at once
  const rows = await q("SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.banned = 0", [sha(token)]);
  return rows[0]?.user_id ?? null;
}

export const dropSession = (token) => q("DELETE FROM sessions WHERE token_hash = ?", [sha(String(token))]);

/** Express middleware: req.userId from "Authorization: Bearer <token>". */
export async function requireAuth(req, res, next) {
  try {
    const m = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
    const uid = m && (await userFromToken(m[1]));
    if (!uid) return res.status(401).json({ error: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại." });
    req.userId = uid;
    req.token = m[1];
    next();
  } catch (e) {
    next(e);
  }
}

/** A fixed-window rate limit per key (usually the client address): at most `max` hits per `windowMs`. */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = "Thao tác quá nhanh, hãy thử lại sau." }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req), now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, (h = { n: 0, reset: now + windowMs }));
    if (++h.n > max) {
      res.set("Retry-After", Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
