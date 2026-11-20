// Đạo Hữu (friends) and Truyền Âm (private messages) on the server. Every rule is checked here; the browser only asks.
//  1. A friendship is two rows (each side's), written and removed together in one transaction; a request is one row per
//     pair and direction (its key), so asking twice is one request.
//  2. Everything between two people runs with both their user rows locked, lower id first (SELECT ... FOR UPDATE): A
//     asking B while B asks A, two accepts at once, an accept racing a block or a removal... happen one after another, and
//     the caps (friends, requests) are counted under the lock. Asking someone who already asked you simply makes you friends.
//  3. A block wins over everything: it ends the friendship and the requests both ways, and nothing (requests, Truyền Âm)
//     gets through it in either direction. Whether someone blocked you is never told: the answer is the same as for anyone
//     who can't be asked.
//  4. Truyền Âm only between Đạo Hữu, checked in the database when it is sent; the text is cleaned like all chat (no hidden,
//     bidi or markup characters), at most 200 characters; a conversation's history is only shown to its two people, and
//     only while they are friends. Messages older than pm.keep_days are deleted.
import { q, tx, isDup } from "./db.js";
import { GameError } from "./store.js";
import { SOCIAL, levelFromExp } from "../shared/balance.js";
import { cleanText } from "../shared/tong-mon.js";

const no = (m, status = 400) => new GameError(m, status);
const idOf = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) throw no("Người chơi không hợp lệ.");
  return n;
};
const CANT = "Không gửi được lời mời cho người này.";
/** Lock both people's rows, the lower id first, so two transactions about the same pair never deadlock. */
const lockPair = (c, a, b) => c.query("SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE", [Math.min(a, b), Math.max(a, b)]);
const one = async (c, sql, args) => (await c.query(sql, args))[0] ?? null;
const count = async (c, sql, args) => Number((await c.query(sql, args))[0].n);
const isFriend = async (c, a, b) => !!(await one(c, "SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?", [a, b]));
const blockedEither = async (c, a, b) => !!(await one(c, "SELECT 1 AS x FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)", [a, b, b, a]));

/** A character by đạo hiệu (exact, any case) or by user id: { uid, name } or null. */
async function findChar(c, { uid, name }) {
  if (uid !== undefined && uid !== null && uid !== "") {
    const r = await one(c, "SELECT user_id AS uid, name FROM characters WHERE user_id = ?", [idOf(uid)]);
    return r;
  }
  const n = cleanText(name, 16);
  if (!n) return null;
  return one(c, "SELECT user_id AS uid, name FROM characters WHERE name = ?", [n]);
}

/** Make a and b friends (both rows) and drop the requests between them; caps checked (both rows locked by the caller). */
async function befriend(c, a, b) {
  for (const [x, who] of [[a, "Đạo hữu"], [b, "Người này"]])
    if ((await count(c, "SELECT COUNT(*) AS n FROM friends WHERE user_id = ?", [x])) >= SOCIAL.friendsMax)
      throw no(`${who} đã có đủ ${SOCIAL.friendsMax} Đạo Hữu.`, 409);
  await c.query("INSERT IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)", [a, b, b, a]);
  await c.query("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", [a, b, b, a]);
}

// ---------------------------------------------------------------- requests and friendships
/**
 * Ask someone (by đạo hiệu or id) to be Đạo Hữu. If they already asked you, you become friends at once. Returns
 * { uid, name, friends: bool }.
 */
export function request(me, target) {
  return tx(async (c) => {
    const t = await findChar(c, target);
    if (!t) throw no("Không có ai mang đạo hiệu này.", 404);
    if (t.uid === me) throw no("Không thể kết giao với chính mình.");
    await lockPair(c, me, t.uid);
    if (await isFriend(c, me, t.uid)) throw no(`${t.name} đã là Đạo Hữu của đạo hữu.`, 409);
    if (await blockedEither(c, me, t.uid)) throw no(CANT, 403);
    if (await one(c, "SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?", [t.uid, me])) {
      await befriend(c, me, t.uid);
      return { uid: t.uid, name: t.name, friends: true };
    }
    if ((await count(c, "SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = ?", [me])) >= SOCIAL.requestsMax)
      throw no(`Đang có ${SOCIAL.requestsMax} lời mời chờ trả lời. Hãy rút bớt.`, 409);
    if ((await count(c, "SELECT COUNT(*) AS n FROM friends WHERE user_id = ?", [me])) >= SOCIAL.friendsMax) throw no(`Đạo hữu đã có đủ ${SOCIAL.friendsMax} Đạo Hữu.`, 409);
    // someone flooded with requests takes no more (100 waiting)
    if ((await count(c, "SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?", [t.uid])) >= 100) throw no(CANT, 409);
    try {
      await c.query("INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)", [me, t.uid]);
    } catch (e) {
      if (isDup(e)) throw no(`Đã gửi lời mời cho ${t.name} rồi.`, 409);
      throw e;
    }
    return { uid: t.uid, name: t.name, friends: false };
  });
}

/** Answer a request someone sent me: accept (friends) or decline (it goes). */
export function answer(me, rawFrom, accept) {
  const from = idOf(rawFrom);
  return tx(async (c) => {
    await lockPair(c, me, from);
    const r = await one(c, "SELECT c.name FROM friend_requests f JOIN characters c ON c.user_id = f.from_id WHERE f.from_id = ? AND f.to_id = ?", [from, me]);
    if (!r) throw no("Lời mời này không còn nữa.", 404);
    if (!accept) {
      await c.query("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?", [from, me]);
      return { uid: from, name: r.name, friends: false };
    }
    if (await blockedEither(c, me, from)) {
      await c.query("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?", [from, me]);
      throw no("Lời mời này không còn nữa.", 404);
    }
    await befriend(c, me, from);
    return { uid: from, name: r.name, friends: true };
  });
}

/** Take back a request I sent. */
export async function cancel(me, rawTo) {
  const r = await q("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?", [me, idOf(rawTo)]);
  if (!r.affectedRows) throw no("Không có lời mời này.", 404);
}

/** No longer Đạo Hữu: both rows go together. Their Truyền Âm history stays hidden until they are friends again. */
export function remove(me, rawOther) {
  const other = idOf(rawOther);
  return tx(async (c) => {
    await lockPair(c, me, other);
    const r = await c.query("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [me, other, other, me]);
    if (!r.affectedRows) throw no("Người này không phải Đạo Hữu của đạo hữu.", 404);
    return { uid: other };
  });
}

/** Block someone (by id or đạo hiệu): friendship and requests end both ways; nothing of theirs reaches me any more. */
export function block(me, target) {
  return tx(async (c) => {
    const t = await findChar(c, target);
    if (!t) throw no("Không có ai mang đạo hiệu này.", 404);
    if (t.uid === me) throw no("Không thể tự chặn mình.");
    await lockPair(c, me, t.uid);
    if ((await count(c, "SELECT COUNT(*) AS n FROM blocks WHERE user_id = ?", [me])) >= SOCIAL.blocksMax) throw no(`Chỉ chặn được tối đa ${SOCIAL.blocksMax} người.`, 409);
    await c.query("INSERT IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)", [me, t.uid]);
    await c.query("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [me, t.uid, t.uid, me]);
    await c.query("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", [me, t.uid, t.uid, me]);
    return { uid: t.uid, name: t.name };
  });
}
export async function unblock(me, rawOther) {
  const r = await q("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?", [me, idOf(rawOther)]);
  if (!r.affectedRows) throw no("Người này không bị chặn.", 404);
}

/** Who I am friends with and who I blocked, for the game world (its chat filter and Truyền Âm). */
export async function socialOf(uid) {
  const [f, b] = await Promise.all([
    q("SELECT friend_id AS id FROM friends WHERE user_id = ?", [uid]),
    q("SELECT blocked_id AS id FROM blocks WHERE user_id = ?", [uid]),
  ]);
  return { friends: new Set(f.map((r) => r.id)), blocked: new Set(b.map((r) => r.id)) };
}

/**
 * The Đạo Hữu panel: my friends (with where they are, from the world, and the unread Truyền Âm and the last line of each
 * conversation), the requests to me and from me, and who I blocked.
 */
export async function list(uid, where = () => null) {
  const friends = await q(
    `SELECT f.friend_id AS uid, c.name, c.exp, c.gender, f.created_at,
       (SELECT COUNT(*) FROM private_messages m WHERE m.to_id = ? AND m.from_id = f.friend_id AND m.read_at IS NULL) AS unread,
       (SELECT m.id FROM private_messages m WHERE m.lo = LEAST(?, f.friend_id) AND m.hi = GREATEST(?, f.friend_id) ORDER BY m.id DESC LIMIT 1) AS last_id
     FROM friends f JOIN characters c ON c.user_id = f.friend_id WHERE f.user_id = ?`,
    [uid, uid, uid, uid],
  );
  const lastIds = friends.map((f) => f.last_id).filter(Boolean);
  const last = lastIds.length ? Object.fromEntries((await q(`SELECT id, from_id, body, created_at FROM private_messages WHERE id IN (${lastIds.map(() => "?").join(",")})`, lastIds)).map((m) => [m.id, m])) : {};
  const incoming = await q("SELECT r.from_id AS uid, c.name, c.exp, r.created_at FROM friend_requests r JOIN characters c ON c.user_id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC", [uid]);
  const outgoing = await q("SELECT r.to_id AS uid, c.name, c.exp, r.created_at FROM friend_requests r JOIN characters c ON c.user_id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC", [uid]);
  const blocked = await q("SELECT b.blocked_id AS uid, c.name, b.created_at FROM blocks b JOIN characters c ON c.user_id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC", [uid]);
  const person = (r) => ({ uid: r.uid, name: r.name, level: levelFromExp(Number(r.exp ?? 0)), at: r.created_at });
  return {
    friends: friends.map((f) => {
      const m = last[f.last_id];
      return { ...person(f), g: f.gender, unread: Number(f.unread), last: m ? { mine: m.from_id === uid, text: m.body, at: m.created_at } : null, ...(where(f.uid) ?? { online: false }) };
    }).sort((a, b) => b.online - a.online || b.unread - a.unread || new Date(b.last?.at ?? 0) - new Date(a.last?.at ?? 0) || a.name.localeCompare(b.name, "vi")),
    incoming: incoming.map(person), outgoing: outgoing.map(person), blocked: blocked.map((b) => ({ uid: b.uid, name: b.name, at: b.created_at })),
    max: SOCIAL.friendsMax,
  };
}

/** Find people by đạo hiệu to ask (the start of it), with what I already have to do with each. */
export async function search(uid, raw) {
  const t = cleanText(raw, 16);
  if (t.length < 2) return [];
  const like = t.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
  const rows = await q(
    `SELECT c.user_id AS uid, c.name, c.exp,
       EXISTS(SELECT 1 FROM friends f WHERE f.user_id = ? AND f.friend_id = c.user_id) AS fr,
       EXISTS(SELECT 1 FROM friend_requests r WHERE r.from_id = ? AND r.to_id = c.user_id) AS sent,
       EXISTS(SELECT 1 FROM friend_requests r WHERE r.from_id = c.user_id AND r.to_id = ?) AS asked,
       EXISTS(SELECT 1 FROM blocks b WHERE b.user_id = ? AND b.blocked_id = c.user_id) AS bl
     FROM characters c WHERE c.name LIKE ? AND c.user_id <> ? ORDER BY c.name LIMIT 12`,
    [uid, uid, uid, uid, like, uid],
  );
  return rows.map((r) => ({ uid: r.uid, name: r.name, level: levelFromExp(Number(r.exp)), state: r.fr ? "friend" : r.bl ? "blocked" : r.asked ? "asked" : r.sent ? "sent" : "" }));
}

// ---------------------------------------------------------------- Truyền Âm
/** Clean a line of chat: no hidden, bidi or markup characters, one line, at most `max`. */
export const cleanLine = (raw, max) => cleanText(raw, max, 1);

/** Send a Truyền Âm (to a friend: by id, or by đạo hiệu). Returns the message as both sides see it. */
export async function send(me, target, raw) {
  const body = cleanLine(raw, 200);
  if (!body) throw no("Chưa có lời nào.");
  return tx(async (c) => {
    const t = await findChar(c, target);
    if (!t || t.uid === me) throw no("Không có Đạo Hữu này.", 404);
    // a friendship row exists only while neither has blocked the other (blocking deletes it)
    if (!(await isFriend(c, me, t.uid))) throw no(`Chỉ Truyền Âm được cho Đạo Hữu. Hãy kết giao với ${t.name} trước.`, 403);
    const id = (await c.query("INSERT INTO private_messages (lo, hi, from_id, to_id, body) VALUES (?, ?, ?, ?, ?)", [Math.min(me, t.uid), Math.max(me, t.uid), me, t.uid, body])).insertId;
    const [{ at }] = await c.query("SELECT created_at AS at FROM private_messages WHERE id = ?", [id]);
    return { id, from: me, to: t.uid, toName: t.name, text: body, at };
  });
}

/** A conversation, newest last, 40 at a time going back from `before`. Only between friends. Marks what I received as read. */
export async function history(me, rawOther, rawBefore) {
  const other = idOf(rawOther), before = Number(rawBefore) > 0 ? Math.floor(Number(rawBefore)) : Number.MAX_SAFE_INTEGER;
  if (!(await isFriend({ query: q }, me, other))) throw no("Chỉ xem được Truyền Âm với Đạo Hữu.", 403);
  const rows = await q(
    "SELECT id, from_id, body, created_at, read_at FROM private_messages WHERE lo = ? AND hi = ? AND id < ? ORDER BY id DESC LIMIT 41",
    [Math.min(me, other), Math.max(me, other), before],
  );
  await markRead(me, other);
  return {
    more: rows.length > 40,
    messages: rows.slice(0, 40).reverse().map((m) => ({ id: m.id, mine: m.from_id === me, text: m.body, at: m.created_at, read: !!m.read_at })),
  };
}
export async function markRead(me, rawOther) {
  const other = idOf(rawOther);
  return (await q("UPDATE private_messages SET read_at = NOW() WHERE to_id = ? AND from_id = ? AND read_at IS NULL", [me, other])).affectedRows;
}
export async function unreadCount(uid) {
  return Number((await q("SELECT COUNT(*) AS n FROM private_messages m WHERE m.to_id = ? AND m.read_at IS NULL AND EXISTS (SELECT 1 FROM friends f WHERE f.user_id = m.to_id AND f.friend_id = m.from_id)", [uid]))[0].n);
}
/** Delete Truyền Âm older than pm.keep_days (run every hour). */
export async function prune() {
  return (await q("DELETE FROM private_messages WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 5000", [Math.round(SOCIAL.keepDays)])).affectedRows;
}
/** Everyone who has this person as a friend (to tell them they came or went). */
export const friendsOf = (uid) => q("SELECT user_id AS id FROM friends WHERE friend_id = ?", [uid]).then((r) => r.map((x) => x.id));
