// Đạo Lữ on the server: every rule is checked here, the browser only asks (shared/dao-lu.js has the rings).
//  1. Everything between two people runs in one transaction with both their user rows locked, lower id first
//     (SELECT ... FOR UPDATE), as Đạo Hữu does: two gifts at once, a proposal racing a divorce, two accepts at once, an
//     accept racing a removal of the friendship... happen one after another, and every rule is read again under the lock.
//  2. Money and things move only by conditional updates: stones - n WHERE stones >= n, qty - n WHERE qty >= n; a rose
//     bought, a gift, an answer carry a request id: sent twice, it counts once.
//  3. Being dao lu is a row per person in dl_spouses (user_id is its key, partner_id unique): nobody can be married twice
//     whatever runs at the same moment; both rows are written and removed together.
//  4. Only Đạo Hữu (friends, which a block also ends) of different gender: roses, proposals and accepting all check it.
//  5. Hảo cảm is one number per pair, at most NEED; roses past it are not taken. At most daolu.rose_daily roses a day from
//     one person to another.
//  6. The ring is paid when the proposal is accepted, by the one who proposed, at the price it has then (the admin's);
//     not enough stones then: nothing happens, the proposal waits. Divorce takes both rings (and their buff), puts the
//     affinity back to 0 and makes both wait daolu.remarry_hours before marrying again.
import { tx, isDup, q } from "./db.js";
import { userLock } from "./lock.js";
import { GameError } from "./store.js";
import { ITEMS, DAOLU, levelFromExp } from "../shared/balance.js";
import { ROSE, NEED, RINGS, RING_KEYS, RING_BUFF, pairOk, ringName, ringPrice } from "../shared/dao-lu.js";

const no = (m, status = 400) => new GameError(m, status);
const fmt = (n) => Number(n).toLocaleString("vi-VN");
const idOf = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) throw no("Người chơi không hợp lệ.");
  return n;
};
const reqId = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw no("Thiếu mã giao dịch.");
  return v.toLowerCase();
};
const one = async (c, sql, args) => (await c.query(sql, args))[0] ?? null;
const lockPair = (c, a, b) => c.query("SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE", [Math.min(a, b), Math.max(a, b)]);
async function once(c, uid, rid) {
  try {
    await c.query("INSERT INTO dl_requests (user_id, request_id) VALUES (?, ?)", [uid, rid]);
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}
const pair = (a, b) => [Math.min(a, b), Math.max(a, b)];
const ringN = (k) => ringName(k, ITEMS);
const ringP = (k) => ringPrice(k, ITEMS);
const roseName = () => ITEMS[ROSE]?.name ?? "Hoa Hồng";
const rosePrice = () => Number(ITEMS[ROSE]?.price ?? 0);
const charOf = (c, uid) => one(c, "SELECT user_id AS uid, name, gender, stones FROM characters WHERE user_id = ?", [uid]);
const isFriend = async (c, a, b) => !!(await one(c, "SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?", [a, b]));
const spouseRow = (c, uid, lock = false) => one(c, `SELECT partner_id, marriage_id, ring FROM dl_spouses WHERE user_id = ?${lock ? " FOR UPDATE" : ""}`, [uid]);
const pointsOf = async (c, a, b, lock = false) => {
  const [lo, hi] = pair(a, b);
  return Number((await one(c, `SELECT points FROM dl_affinity WHERE lo = ? AND hi = ?${lock ? " FOR UPDATE" : ""}`, [lo, hi]))?.points ?? 0);
};
/** Seconds left before this person may marry again (after a divorce), 0 if none. */
const waitOf = async (c, uid) => Number((await one(c, "SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), until)) AS s FROM dl_cooldown WHERE user_id = ?", [uid]))?.s ?? 0);
const hours = (s) => (s >= 3600 ? `${Math.ceil(s / 3600)} giờ` : `${Math.max(1, Math.ceil(s / 60))} phút`);
const fresh = () => `created_at > NOW() - INTERVAL ${Math.round(DAOLU.proposeHours * 60)} MINUTE`;

/**
 * Checks for two people to become dao lu (both rows locked by the caller): friends, different gender, affinity full,
 * neither married, neither waiting after a divorce. me: who asks (for the wording), t: the other's character.
 */
async function canMarry(c, me, t) {
  const mine = await charOf(c, me);
  if (!(await isFriend(c, me, t.uid))) throw no(`${t.name} không còn là Đạo Hữu của đạo hữu.`, 403);
  if (!pairOk(mine.gender, t.gender)) throw no("Đạo Lữ phải là hai người khác giới.", 403);
  const pts = await pointsOf(c, me, t.uid);
  if (pts < NEED) throw no(`Hảo cảm với ${t.name} mới ${pts}/${NEED}. Tặng thêm ${roseName()} để đủ ${NEED}.`, 409);
  if (await spouseRow(c, me, true)) throw no("Đạo hữu đã có Đạo Lữ.", 409);
  if (await spouseRow(c, t.uid, true)) throw no(`${t.name} đã có Đạo Lữ.`, 409);
  const w1 = await waitOf(c, me), w2 = await waitOf(c, t.uid);
  if (w1) throw no(`Vừa ly hôn: còn ${hours(w1)} nữa mới kết Đạo Lữ được.`, 409);
  if (w2) throw no(`${t.name} vừa ly hôn: còn ${hours(w2)} nữa mới kết Đạo Lữ được.`, 409);
  return mine;
}

// ---------------------------------------------------------------- reading
/** The Đạo Lữ panel: me, my roses, my dao lu (and ring), the friends I could give roses to, the proposals, the rings. */
export async function view(uid) {
  await q(`DELETE FROM dl_proposals WHERE (from_id = ? OR to_id = ?) AND NOT (${fresh()})`, [uid, uid]);
  const me = await one({ query: q }, "SELECT name, gender, stones FROM characters WHERE user_id = ?", [uid]);
  if (!me) throw no("Hãy tạo nhân vật trước.", 409);
  const roses = Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = ?", [uid, ROSE]))[0]?.qty ?? 0);
  const sp = (await q(
    `SELECT s.partner_id AS uid, s.ring, c.name, c.gender, c.exp, m.created_at AS since, m.paid_by, m.price
     FROM dl_spouses s JOIN characters c ON c.user_id = s.partner_id JOIN dl_marriages m ON m.id = s.marriage_id WHERE s.user_id = ?`, [uid]))[0] ?? null;
  const friends = await q(
    `SELECT f.friend_id AS uid, c.name, c.gender, c.exp,
       COALESCE(a.points, 0) AS points, COALESCE(a.roses, 0) AS roses,
       COALESCE((SELECT d.n FROM dl_rose_daily d WHERE d.giver = ? AND d.receiver = f.friend_id AND d.day = CURDATE()), 0) AS today,
       EXISTS(SELECT 1 FROM dl_spouses s WHERE s.user_id = f.friend_id) AS married
     FROM friends f JOIN characters c ON c.user_id = f.friend_id
     LEFT JOIN dl_affinity a ON a.lo = LEAST(?, f.friend_id) AND a.hi = GREATEST(?, f.friend_id)
     WHERE f.user_id = ?`, [uid, uid, uid, uid]);
  const out = (await q(`SELECT p.to_id AS uid, c.name, p.ring, p.created_at AS at FROM dl_proposals p JOIN characters c ON c.user_id = p.to_id WHERE p.from_id = ?`, [uid]))[0] ?? null;
  const incoming = await q(`SELECT p.from_id AS uid, c.name, c.exp, p.ring, p.created_at AS at FROM dl_proposals p JOIN characters c ON c.user_id = p.from_id WHERE p.to_id = ? ORDER BY p.created_at DESC`, [uid]);
  const wait = await waitOf({ query: q }, uid);
  const ring = (k) => k && { key: k, name: ringN(k), price: ringP(k), buff: { ...RING_BUFF[k] }, look: RINGS[k].look, tier: RINGS[k].tier, desc: RINGS[k].desc };
  return {
    me: { name: me.name, gender: me.gender, stones: Number(me.stones) }, roses,
    spouse: sp ? { uid: sp.uid, name: sp.name, gender: sp.gender, level: levelFromExp(Number(sp.exp)), since: sp.since, ring: ring(sp.ring), paidByMe: sp.paid_by === uid, price: Number(sp.price) } : null,
    friends: friends
      .map((f) => ({ uid: f.uid, name: f.name, gender: f.gender, level: levelFromExp(Number(f.exp)), points: Number(f.points), roses: Number(f.roses), today: Number(f.today), married: !!f.married, ok: pairOk(me.gender, f.gender) }))
      .sort((a, b) => b.ok - a.ok || b.points - a.points || a.name.localeCompare(b.name, "vi")),
    proposal: out ? { uid: out.uid, name: out.name, ring: ring(out.ring), at: out.at } : null,
    incoming: incoming.map((p) => ({ uid: p.uid, name: p.name, level: levelFromExp(Number(p.exp)), ring: ring(p.ring), at: p.at })),
    rings: RING_KEYS.map(ring),
    wait,
    rules: { need: NEED, rosePoints: DAOLU.rosePoints, roseDaily: DAOLU.roseDaily, roseBuyMax: DAOLU.roseBuyMax, rosePrice: rosePrice(), roseName: roseName(), proposeHours: DAOLU.proposeHours, remarryHours: DAOLU.remarryHours },
  };
}

/** For the game world: this person's dao lu (whose name shows by theirs, whose ring's buff they have), or null. */
export async function spouseOf(uid) {
  const r = (await q("SELECT s.partner_id AS uid, s.ring, c.name FROM dl_spouses s JOIN characters c ON c.user_id = s.partner_id WHERE s.user_id = ?", [uid]))[0];
  return r ? { uid: r.uid, name: r.name, ring: r.ring } : null;
}

// ---------------------------------------------------------------- roses
/** Buy roses (qty 1..daolu.rose_buy_max) at the admin's price. */
export function buyRoses(uid, rawQty, rawReq) {
  const rid = reqId(rawReq), qty = Number(rawQty), each = rosePrice();
  if (!Number.isInteger(qty) || qty < 1 || qty > DAOLU.roseBuyMax) throw no(`Mỗi lần mua 1-${DAOLU.roseBuyMax} bông.`);
  if (!(each > 0)) throw no(`${roseName()} hiện không bán.`, 409);
  const cost = each * qty;
  return userLock.run(uid, () => tx(async (c) => {
    if (!(await once(c, uid, rid))) return { repeat: true };
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [cost, uid, cost]);
    if (r.affectedRows !== 1) throw no(`Cần ${fmt(cost)} linh thạch để mua ${qty} ${roseName()}.`, 409);
    await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, ROSE, qty]);
    return { repeat: false, qty, cost };
  }));
}

/**
 * Give roses to a Đạo Hữu of the other gender: each adds daolu.rose_points of affinity, up to NEED (roses past it are kept).
 * To one's own dao lu, roses are a gift of love: taken, no affinity to add. Returns { uid, name, used, points, spouse }.
 */
export function gift(uid, rawTo, rawQty, rawReq) {
  const to = idOf(rawTo), rid = reqId(rawReq), qty = Number(rawQty);
  if (to === uid) throw no("Không thể tự tặng hoa cho mình.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw no("Mỗi lần tặng 1-99 bông.");
  return tx(async (c) => {
    await lockPair(c, uid, to);
    if (!(await once(c, uid, rid))) return { repeat: true };
    const me = await charOf(c, uid), t = await charOf(c, to);
    if (!me || !t) throw no("Không có người này.", 404);
    if (!(await isFriend(c, uid, to))) throw no(`Chỉ tặng hoa được cho Đạo Hữu. Hãy kết giao với ${t.name} trước.`, 403);
    if (!pairOk(me.gender, t.gender)) throw no("Hoa Hồng chỉ tặng được cho Đạo Hữu khác giới.", 403);
    const mySp = await spouseRow(c, uid, true), theirSp = await spouseRow(c, to, true);
    const spouses = mySp?.partner_id === to;
    if (mySp && !spouses) throw no("Đạo hữu đã có Đạo Lữ: chỉ tặng hoa cho Đạo Lữ của mình.", 409);
    if (theirSp && !spouses) throw no(`${t.name} đã có Đạo Lữ.`, 409);
    const [lo, hi] = pair(uid, to);
    await c.query("INSERT IGNORE INTO dl_affinity (lo, hi) VALUES (?, ?)", [lo, hi]);
    const pts = await pointsOf(c, uid, to, true);
    if (!spouses && pts >= NEED) throw no(`Hảo cảm với ${t.name} đã đủ ${NEED}/${NEED}: hãy cầu hôn.`, 409);
    // how many may go today, and how many are still worth giving
    await c.query("INSERT IGNORE INTO dl_rose_daily (giver, receiver, day) VALUES (?, ?, CURDATE())", [uid, to]);
    const today = Number((await one(c, "SELECT n FROM dl_rose_daily WHERE giver = ? AND receiver = ? AND day = CURDATE() FOR UPDATE", [uid, to])).n);
    const left = DAOLU.roseDaily - today;
    if (left <= 0) throw no(`Hôm nay đã tặng ${t.name} đủ ${DAOLU.roseDaily} bông. Mai tặng tiếp nhé.`, 409);
    const worth = spouses ? qty : Math.ceil((NEED - pts) / DAOLU.rosePoints);
    const n = Math.min(qty, left, worth);
    const have = Number((await one(c, "SELECT qty FROM inventory WHERE user_id = ? AND item = ? FOR UPDATE", [uid, ROSE]))?.qty ?? 0);
    const r = await c.query("UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?", [n, uid, ROSE, n]);
    if (r.affectedRows !== 1) throw no(`Không đủ ${roseName()}: có ${have}, cần ${n}. Mua thêm ở bảng Đạo Lữ.`, 409);
    const points = spouses ? NEED : Math.min(NEED, pts + n * DAOLU.rosePoints);
    await c.query("UPDATE dl_affinity SET points = ?, roses = roses + ? WHERE lo = ? AND hi = ?", [points, n, lo, hi]);
    await c.query("UPDATE dl_rose_daily SET n = n + ? WHERE giver = ? AND receiver = ? AND day = CURDATE()", [n, uid, to]);
    return { repeat: false, uid: to, name: t.name, from: me.name, used: n, points, spouse: spouses, today: today + n };
  });
}

// ---------------------------------------------------------------- proposals
/** Propose to a Đạo Hữu of the other gender with full affinity, naming the ring (paid when they accept). */
export function propose(uid, rawTo, rawRing) {
  const to = idOf(rawTo), ring = String(rawRing ?? "");
  if (to === uid) throw no("Không thể tự cầu hôn mình.");
  if (!Object.hasOwn(RINGS, ring)) throw no("Hãy chọn một chiếc nhẫn cưới.");
  const price = ringP(ring);
  if (!(price > 0)) throw no(`${ringN(ring)} hiện không bán.`, 409);
  return tx(async (c) => {
    await lockPair(c, uid, to);
    const t = await charOf(c, to);
    if (!t) throw no("Không có người này.", 404);
    const me = await canMarry(c, uid, t);
    await c.query(`DELETE FROM dl_proposals WHERE from_id IN (?, ?) AND NOT (${fresh()})`, [uid, to]);
    const mine = await one(c, "SELECT p.to_id, c.name FROM dl_proposals p JOIN characters c ON c.user_id = p.to_id WHERE p.from_id = ?", [uid]);
    if (mine) throw no(mine.to_id === to ? `Đã cầu hôn ${t.name} rồi, đang chờ trả lời.` : `Đạo hữu đang chờ ${mine.name} trả lời. Hãy rút lời cầu hôn đó trước.`, 409);
    if (await one(c, "SELECT 1 AS x FROM dl_proposals WHERE from_id = ? AND to_id = ?", [to, uid])) throw no(`${t.name} đã cầu hôn đạo hữu: hãy trả lời ở bảng Đạo Lữ.`, 409);
    if (Number(me.stones) < price) throw no(`${ringN(ring)} giá ${fmt(price)} linh thạch, trả khi được đồng ý. Đạo hữu mới có ${fmt(me.stones)}.`, 409);
    try {
      await c.query("INSERT INTO dl_proposals (from_id, to_id, ring) VALUES (?, ?, ?)", [uid, to, ring]);
    } catch (e) {
      if (isDup(e)) throw no("Đạo hữu đang có một lời cầu hôn chờ trả lời.", 409);
      throw e;
    }
    return { uid: to, name: t.name, from: me.name, ring, ringName: ringN(ring), price };
  });
}

/** Take back the proposal I sent. Returns who it was to. */
export async function cancel(uid) {
  const r = (await q("SELECT p.to_id AS uid, c.name FROM dl_proposals p JOIN characters c ON c.user_id = p.to_id WHERE p.from_id = ?", [uid]))[0];
  if (!r) throw no("Không có lời cầu hôn nào đang chờ.", 404);
  await q("DELETE FROM dl_proposals WHERE from_id = ? AND to_id = ?", [uid, r.uid]);
  return { uid: r.uid, name: r.name };
}

/**
 * Answer a proposal made to me. Declined: it goes. Accepted: everything is checked again, the one who proposed pays the
 * ring, both become dao lu with it, and every other proposal of either goes. Returns { uid, name, accepted, ring, price }.
 */
export function answer(uid, rawFrom, accept, rawReq) {
  const from = idOf(rawFrom), rid = reqId(rawReq);
  return tx(async (c) => {
    await lockPair(c, uid, from);
    if (!(await once(c, uid, rid))) return { repeat: true };
    const p = await one(c, `SELECT ring, ${fresh()} AS live FROM dl_proposals WHERE from_id = ? AND to_id = ? FOR UPDATE`, [from, uid]);
    const t = await charOf(c, from);
    if (!p || !t) throw no("Lời cầu hôn này không còn nữa.", 404);
    if (!p.live) {
      await c.query("DELETE FROM dl_proposals WHERE from_id = ? AND to_id = ?", [from, uid]);
      throw no(`Lời cầu hôn của ${t.name} đã hết hạn.`, 404);
    }
    const me = await charOf(c, uid);
    if (!accept) {
      await c.query("DELETE FROM dl_proposals WHERE from_id = ? AND to_id = ?", [from, uid]);
      return { repeat: false, uid: from, name: t.name, me: me.name, accepted: false };
    }
    await canMarry(c, uid, t);
    const ring = p.ring, price = ringP(ring);
    if (!RINGS[ring] || !(price > 0)) throw no(`${ringN(ring)} hiện không bán: ${t.name} cần cầu hôn lại với nhẫn khác.`, 409);
    const paid = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [price, from, price]);
    if (paid.affectedRows !== 1) throw no(`${t.name} không đủ ${fmt(price)} linh thạch để mua ${ringN(ring)}. Lời cầu hôn vẫn chờ.`, 409);
    const [lo, hi] = pair(uid, from);
    const mid = (await c.query("INSERT INTO dl_marriages (a_id, b_id, ring, paid_by, price) VALUES (?, ?, ?, ?, ?)", [lo, hi, ring, from, price])).insertId;
    try {
      await c.query("INSERT INTO dl_spouses (user_id, partner_id, marriage_id, ring) VALUES (?, ?, ?, ?), (?, ?, ?, ?)", [uid, from, mid, ring, from, uid, mid, ring]);
    } catch (e) {
      if (isDup(e)) throw no("Một trong hai người đã có Đạo Lữ.", 409);
      throw e;
    }
    await c.query("DELETE FROM dl_proposals WHERE from_id IN (?, ?) OR to_id IN (?, ?)", [uid, from, uid, from]);
    return { repeat: false, uid: from, name: t.name, me: me.name, accepted: true, ring, ringName: ringN(ring), price };
  });
}

/** Divorce: both rings (and their buff) go, the affinity is back to 0, both wait daolu.remarry_hours. Returns the ex. */
export function divorce(uid, by = uid) {
  return tx(async (c) => {
    const first = await spouseRow(c, uid);
    if (!first) throw no("Đạo hữu chưa có Đạo Lữ.", 404);
    await lockPair(c, uid, first.partner_id);
    const sp = await spouseRow(c, uid, true);
    if (!sp || sp.partner_id !== first.partner_id) throw no("Đạo Lữ đã thay đổi, hãy thử lại.", 409);
    const ex = sp.partner_id, t = await charOf(c, ex), me = await charOf(c, uid);
    await c.query("DELETE FROM dl_spouses WHERE user_id IN (?, ?)", [uid, ex]);
    await c.query("UPDATE dl_marriages SET ended_at = NOW(), ended_by = ? WHERE id = ?", [by, sp.marriage_id]);
    const [lo, hi] = pair(uid, ex);
    await c.query("UPDATE dl_affinity SET points = 0 WHERE lo = ? AND hi = ?", [lo, hi]);
    const mins = Math.round(DAOLU.remarryHours * 60);
    if (mins > 0)
      await c.query("INSERT INTO dl_cooldown (user_id, until) VALUES (?, NOW() + INTERVAL ? MINUTE), (?, NOW() + INTERVAL ? MINUTE) ON DUPLICATE KEY UPDATE until = VALUES(until)", [uid, mins, ex, mins]);
    return { uid: ex, name: t?.name ?? "?", me: me?.name ?? "?", ring: sp.ring, ringName: ringN(sp.ring) };
  });
}

// ---------------------------------------------------------------- admin
/** What the admin's player page shows: their dao lu, the marriages they had, their highest affinities, proposals. */
export async function adminView(uid) {
  const sp = await spouseOf(uid);
  const history = await q(
    `SELECT m.id, m.ring, m.price, m.paid_by, m.created_at, m.ended_at, m.ended_by, c.name AS partner
     FROM dl_marriages m JOIN characters c ON c.user_id = IF(m.a_id = ?, m.b_id, m.a_id) WHERE m.a_id = ? OR m.b_id = ? ORDER BY m.id DESC LIMIT 20`, [uid, uid, uid]);
  const aff = await q(
    `SELECT IF(a.lo = ?, a.hi, a.lo) AS uid, c.name, a.points, a.roses FROM dl_affinity a JOIN characters c ON c.user_id = IF(a.lo = ?, a.hi, a.lo)
     WHERE a.lo = ? OR a.hi = ? ORDER BY a.points DESC, a.roses DESC LIMIT 20`, [uid, uid, uid, uid]);
  const props = await q(
    `SELECT p.from_id, p.to_id, p.ring, p.created_at, cf.name AS from_name, ct.name AS to_name FROM dl_proposals p
     JOIN characters cf ON cf.user_id = p.from_id JOIN characters ct ON ct.user_id = p.to_id WHERE p.from_id = ? OR p.to_id = ?`, [uid, uid]);
  return {
    spouse: sp ? { ...sp, ringName: ringN(sp.ring), buff: { ...RING_BUFF[sp.ring] } } : null,
    history: history.map((m) => ({ ...m, ringName: ringN(m.ring), price: Number(m.price), paidByThem: m.paid_by === uid })),
    affinity: aff.map((a) => ({ uid: a.uid, name: a.name, points: Number(a.points), roses: Number(a.roses) })),
    proposals: props.map((p) => ({ from: p.from_name, to: p.to_name, ring: ringN(p.ring), at: p.created_at })),
  };
}
/** The marriages now (for the admin's Đạo Lữ tab). */
export async function marriages() {
  const rows = await q(
    `SELECT m.id, m.ring, m.price, m.created_at, m.a_id, m.b_id, ca.name AS a_name, cb.name AS b_name, cp.name AS payer
     FROM dl_marriages m JOIN characters ca ON ca.user_id = m.a_id JOIN characters cb ON cb.user_id = m.b_id JOIN characters cp ON cp.user_id = m.paid_by
     WHERE m.ended_at IS NULL ORDER BY m.id DESC LIMIT 200`);
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM dl_marriages WHERE ended_at IS NOT NULL");
  return { now: rows.map((r) => ({ ...r, ringName: ringN(r.ring), price: Number(r.price) })), divorced: Number(n) };
}
/** The admin sets a pair's affinity (0..NEED). */
export async function adminAffinity(a, b, rawPoints) {
  const x = idOf(a), y = idOf(b), pts = Number(rawPoints);
  if (x === y) throw no("Hai người phải khác nhau.");
  if (!Number.isInteger(pts) || pts < 0 || pts > NEED) throw no(`Hảo cảm 0-${NEED}.`);
  const [lo, hi] = pair(x, y);
  await q("INSERT INTO dl_affinity (lo, hi, points) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points)", [lo, hi, pts]);
}
