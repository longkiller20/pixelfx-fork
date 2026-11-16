// Everything that changes a character's saved state. The rules that keep it safe when requests race each other:
//  1. Money and items only change through conditional updates ("stones = stones - 40 WHERE stones >= 40"): two buys at once
//     can't both spend the same stones, and nothing ever goes negative.
//  2. Anything that must happen once has a unique key: a purchase request id, one daily gift per day. A second attempt hits
//     the key and is refused, even from another process.
//  3. Steps that belong together run in one transaction, and per account they run one at a time (userLock).
//  4. The world never writes totals it remembered: it adds what was earned since the last save (exp = exp + 35), so a buy
//     that happened in between is never overwritten.
import { q, tx, isDup } from "./db.js";
import { userLock } from "./lock.js";
import { CLASSES, ITEMS, BUY_MAX, DAILY_STONES, MEDITATE, NAME_RE, levelFromExp } from "../shared/balance.js";

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const COLS = "user_id, name, class, exp, stones, rank_points, kills, deaths, (med_day = CURDATE()) AS med_today, med_exp";
const shape = (r) => r && {
  userId: r.user_id, name: r.name, cls: r.class, exp: Number(r.exp), stones: Number(r.stones), rank: Number(r.rank_points),
  kills: Number(r.kills), deaths: Number(r.deaths), level: levelFromExp(Number(r.exp)),
  medLeft: Math.max(0, MEDITATE.dailyCap - (r.med_today ? Number(r.med_exp) : 0)),
};

export async function loadCharacter(uid, conn = null) {
  const rows = await (conn ?? { query: q }).query(`SELECT ${COLS} FROM characters WHERE user_id = ?`, [uid]);
  return shape(rows[0]);
}

export async function inventory(uid) {
  const rows = await q("SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0", [uid]);
  return Object.fromEntries(rows.map((r) => [r.item, Number(r.qty)]));
}

export async function dailyClaimed(uid) {
  const rows = await q("SELECT 1 FROM daily_claims WHERE user_id = ? AND day = CURDATE()", [uid]);
  return rows.length > 0;
}

export function createCharacter(uid, name, cls) {
  name = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) throw new GameError("Đạo hiệu dài 3-16 ký tự, chỉ gồm chữ, số, khoảng trắng hoặc _.");
  if (!CLASSES[cls]) throw new GameError("Môn phái không hợp lệ.");
  return userLock.run(uid, () => tx(async (c) => {
    try {
      await c.query("INSERT INTO characters (user_id, name, class, stones) VALUES (?, ?, ?, 20)", [uid, name, cls]);
    } catch (e) {
      if (isDup(e)) throw new GameError(/uq_name/.test(e.message) ? "Đạo hiệu này đã có người dùng." : "Tài khoản đã có nhân vật.", 409);
      throw e;
    }
    // a starter gift
    await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, 'hoixuan', 2)", [uid]);
    return loadCharacter(uid, c);
  }));
}

/**
 * Save what the world earned since the last save, as increments, and read the result back. d: { exp, stones, rank, kills,
 * deaths, med } (med is meditation exp, granted only up to today's cap: the cap is checked in the same statement).
 */
export function flush(uid, d) {
  return userLock.run(uid, () => tx(async (c) => {
    if (d.exp || d.stones || d.rank || d.kills || d.deaths)
      await c.query(
        `UPDATE characters SET exp = exp + ?, stones = stones + ?, rank_points = GREATEST(0, CAST(rank_points AS SIGNED) + ?),
         kills = kills + ?, deaths = deaths + ? WHERE user_id = ?`,
        [d.exp | 0, d.stones | 0, d.rank | 0, d.kills | 0, d.deaths | 0, uid],
      );
    if (d.med > 0) {
      // MariaDB assigns left to right: exp and med_exp both see yesterday's med_day before it's moved to today
      const room = `LEAST(?, GREATEST(0, ${MEDITATE.dailyCap} - IF(med_day = CURDATE(), med_exp, 0)))`;
      await c.query(`UPDATE characters SET exp = exp + ${room}, med_exp = IF(med_day = CURDATE(), med_exp, 0) + ${room}, med_day = CURDATE() WHERE user_id = ?`, [d.med | 0, d.med | 0, uid]);
    }
    return loadCharacter(uid, c);
  }));
}

/** Buy qty of an item. requestId makes it idempotent: sending the same request twice charges once. */
export function buy(uid, item, qty, requestId) {
  const it = ITEMS[item];
  qty = Number(qty);
  if (!it) throw new GameError("Vật phẩm không tồn tại.");
  if (!Number.isInteger(qty) || qty < 1 || qty > BUY_MAX) throw new GameError(`Mỗi lần mua 1-${BUY_MAX} viên.`);
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new GameError("Thiếu mã giao dịch.");
  const cost = it.price * qty;
  return userLock.run(uid, () => tx(async (c) => {
    // claim the request id first: a second request with the same id waits on this row, then fails as a duplicate
    try {
      await c.query("INSERT INTO purchases (user_id, request_id, item, qty, price) VALUES (?, ?, ?, ?, ?)", [uid, requestId, item, qty, cost]);
    } catch (e) {
      if (isDup(e)) return { repeat: true, character: await loadCharacter(uid, c) };
      throw e;
    }
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [cost, uid, cost]);
    if (r.affectedRows !== 1) throw new GameError("Không đủ linh thạch.", 409);
    await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, item, qty]);
    return { repeat: false, character: await loadCharacter(uid, c) };
  }));
}

export function claimDaily(uid) {
  return userLock.run(uid, () => tx(async (c) => {
    const ch = await c.query("SELECT 1 FROM characters WHERE user_id = ?", [uid]);
    if (!ch.length) throw new GameError("Hãy tạo nhân vật trước.");
    try {
      await c.query("INSERT INTO daily_claims (user_id, day) VALUES (?, CURDATE())", [uid]);
    } catch (e) {
      if (isDup(e)) throw new GameError("Hôm nay đạo hữu đã nhận quà rồi.", 409);
      throw e;
    }
    await c.query("UPDATE characters SET stones = stones + ? WHERE user_id = ?", [DAILY_STONES, uid]);
    return loadCharacter(uid, c);
  }));
}

/** Spend one of an item; returns the character after. Exp pills are granted in the same transaction. */
export function useItem(uid, item, level) {
  const it = ITEMS[item];
  if (!it) throw new GameError("Vật phẩm không tồn tại.");
  return userLock.run(uid, () => tx(async (c) => {
    const r = await c.query("UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ? AND qty > 0", [uid, item]);
    if (r.affectedRows !== 1) throw new GameError("Đạo hữu không còn viên nào.", 409);
    if (it.exp) await c.query("UPDATE characters SET exp = exp + ? WHERE user_id = ?", [it.exp(level), uid]);
    return loadCharacter(uid, c);
  }));
}

export const logPvp = (killer, victim, rewarded) => q("INSERT INTO pvp_log (killer_id, victim_id, rewarded) VALUES (?, ?, ?)", [killer, victim, rewarded ? 1 : 0]);

export async function leaderboard() {
  const rank = await q("SELECT name, class, rank_points AS v, exp FROM characters ORDER BY rank_points DESC, exp DESC LIMIT 20");
  const exp = await q("SELECT name, class, exp AS v, exp FROM characters ORDER BY exp DESC LIMIT 20");
  const fmt = (rows) => rows.map((r) => ({ name: r.name, cls: r.class, v: Number(r.v), level: levelFromExp(Number(r.exp)) }));
  return { rank: fmt(rank), exp: fmt(exp) };
}
