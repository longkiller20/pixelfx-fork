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
import { DEFAULT_WEAPON } from "./cosmetics-seed.js";
import { CLASS, validLook, ITEMS, BUY_MAX, DAILY_STONES, MEDITATE, START, NAME_RE, levelFromExp, ARTS, ART_SLOTS, STARTER_ARTS } from "../shared/balance.js";

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const COLS = "user_id, name, gender, hair, robe, weapon, exp, stones, rank_points, kills, deaths, (med_day = CURDATE()) AS med_today, med_exp, art_slots";
/** The bar as saved, or the starters for a character that never changed it; always ART_SLOTS long. */
export function parseSlots(raw) {
  let a = null;
  try {
    a = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!Array.isArray(a)) a = STARTER_ARTS.slice(0, ART_SLOTS);
  return Array.from({ length: ART_SLOTS }, (_, i) => (typeof a[i] === "string" ? a[i] : null));
}
const shape = (r) => r && {
  userId: r.user_id, name: r.name, cls: CLASS, look: { g: r.gender === "f" ? "f" : "m", hair: Number(r.hair), robe: Number(r.robe), weapon: Number(r.weapon) }, exp: Number(r.exp), stones: Number(r.stones), rank: Number(r.rank_points),
  kills: Number(r.kills), deaths: Number(r.deaths), level: levelFromExp(Number(r.exp)),
  medLeft: Math.max(0, MEDITATE.dailyCap - (r.med_today ? Number(r.med_exp) : 0)),
  slots: parseSlots(r.art_slots),
};

export async function loadCharacter(uid, conn = null) {
  const Q = conn ?? { query: q };
  const rows = await Q.query(`SELECT ${COLS} FROM characters WHERE user_id = ?`, [uid]);
  const ch = shape(rows[0]);
  if (ch) ch.learned = (await Q.query("SELECT art_key FROM learned_arts WHERE user_id = ? ORDER BY learned_at", [uid])).map((r) => r.art_key);
  return ch;
}

export async function inventory(uid) {
  const rows = await q("SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0", [uid]);
  return Object.fromEntries(rows.map((r) => [r.item, Number(r.qty)]));
}

export async function dailyClaimed(uid) {
  const rows = await q("SELECT 1 FROM daily_claims WHERE user_id = ? AND day = CURDATE()", [uid]);
  return rows.length > 0;
}

export function createCharacter(uid, name, look) {
  name = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) throw new GameError("Đạo hiệu dài 3-16 ký tự, chỉ gồm chữ, số, khoảng trắng hoặc _.");
  const g = look?.g, hair = look?.hair, robe = look?.robe;
  if (!validLook(g, hair, robe)) throw new GameError("Ngoại hình không hợp lệ.");
  return userLock.run(uid, () => tx(async (c) => {
    // at creation only the free starter styles of that gender can be picked; the rest are bought in game
    const free = await c.query(
      "SELECT kind FROM cosmetics WHERE gender = ? AND starter = 1 AND ((kind = 'hair' AND idx = ?) OR (kind = 'robe' AND idx = ?))",
      [g, hair, robe],
    );
    if (free.length !== 2) throw new GameError("Ngoại hình này chưa mở, hãy chọn kiểu khởi đầu.");
    try {
      await c.query("INSERT INTO characters (user_id, name, class, gender, hair, robe, stones) VALUES (?, ?, ?, ?, ?, ?, ?)", [uid, name, CLASS, g, hair, robe, START.stones]);
    } catch (e) {
      if (isDup(e)) throw new GameError(/uq_name/.test(e.message) ? "Đạo hiệu này đã có người dùng." : "Tài khoản đã có nhân vật.", 409);
      throw e;
    }
    // a starter gift (settings start.stones and start.hoixuan)
    if (START.hoixuan > 0) await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, 'hoixuan', ?)", [uid, START.hoixuan]);
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
        `UPDATE characters SET exp = GREATEST(0, CAST(exp AS SIGNED) + ?), stones = GREATEST(0, CAST(stones AS SIGNED) + ?),
         rank_points = GREATEST(0, CAST(rank_points AS SIGNED) + ?), kills = GREATEST(0, CAST(kills AS SIGNED) + ?),
         deaths = GREATEST(0, CAST(deaths AS SIGNED) + ?) WHERE user_id = ?`,
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
  if (!it.onSale) throw new GameError("Vật phẩm này đã ngừng bán.");
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
  if ((it.kind ?? "pill") !== "pill") throw new GameError(`${it.name} không dùng trực tiếp được; dùng để lĩnh ngộ công pháp.`);
  return userLock.run(uid, () => tx(async (c) => {
    const r = await c.query("UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ? AND qty > 0", [uid, item]);
    if (r.affectedRows !== 1) throw new GameError("Đạo hữu không còn viên nào.", 409);
    if (it.exp) await c.query("UPDATE characters SET exp = exp + ? WHERE user_id = ?", [it.exp(level), uid]);
    return loadCharacter(uid, c);
  }));
}

// ---------------------------------------------------------------- công pháp (arts)
// Learning spends every required item in one transaction: each with "qty = qty - n WHERE qty >= n", so two learns at once
// (or a learn racing a drop or an admin's edit) can't spend the same item twice, and if any item is short nothing is
// spent. The learned row's primary key makes learning the same art twice impossible.

const knows = (ch, key) => !!ARTS[key] && (ARTS[key].starter || ch.learned.includes(key));

/** Learn an art: spend what it needs, put it on the first empty slot of the bar. Returns the character. */
export function learnArt(uid, key) {
  const art = ARTS[String(key ?? "")];
  if (!art || !art.enabled) throw new GameError("Công pháp không tồn tại.");
  if (art.starter) throw new GameError("Công pháp này ai cũng đã biết.");
  if (art.source === "event") throw new GameError(`${art.name} không lĩnh ngộ được: chỉ có qua ${art.sourceNote || "hoạt động, sự kiện"}.`, 403);
  return userLock.run(uid, () => tx(async (c) => {
    const ch = await loadCharacter(uid, c);
    if (!ch) throw new GameError("Hãy tạo nhân vật trước.");
    try {
      await c.query("INSERT INTO learned_arts (user_id, art_key) VALUES (?, ?)", [uid, art.key]);
    } catch (e) {
      if (isDup(e)) throw new GameError("Đạo hữu đã lĩnh ngộ công pháp này rồi.", 409);
      throw e;
    }
    for (const r of art.reqs) {
      const out = await c.query("UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?", [r.qty, uid, r.item, r.qty]);
      if (out.affectedRows !== 1) throw new GameError(`Thiếu ${ITEMS[r.item]?.name ?? r.item} (cần ${r.qty}).`, 409);
    }
    const slots = ch.slots.slice(), free = slots.indexOf(null);
    if (free >= 0 && !slots.includes(art.key)) {
      slots[free] = art.key;
      await c.query("UPDATE characters SET art_slots = ? WHERE user_id = ?", [JSON.stringify(slots), uid]);
    }
    return loadCharacter(uid, c);
  }));
}

/** Put arts on the bar: ART_SLOTS entries, each an art the player knows or null, none twice. Returns the character. */
export function equipArts(uid, slots) {
  if (!Array.isArray(slots) || slots.length !== ART_SLOTS) throw new GameError(`Thanh công pháp có ${ART_SLOTS} ô.`);
  slots = slots.map((s) => (s === null || s === "" ? null : String(s)));
  const set = slots.filter(Boolean);
  if (new Set(set).size !== set.length) throw new GameError("Một công pháp chỉ gán vào một ô.");
  return userLock.run(uid, () => tx(async (c) => {
    const ch = await loadCharacter(uid, c);
    if (!ch) throw new GameError("Hãy tạo nhân vật trước.");
    for (const k of set) {
      if (!ARTS[k]) throw new GameError("Công pháp không tồn tại.");
      if (!knows(ch, k)) throw new GameError("Đạo hữu chưa lĩnh ngộ công pháp này.", 403);
      if (!ARTS[k].enabled) throw new GameError(`${ARTS[k].name} đang tạm khóa.`);
    }
    await c.query("UPDATE characters SET art_slots = ? WHERE user_id = ?", [JSON.stringify(slots), uid]);
    return loadCharacter(uid, c);
  }));
}

/** Items dropped by a monster: added in one statement each, so nothing else touching the bag can lose them. */
export function grantItems(uid, items) {
  const list = Object.entries(items).filter(([k, n]) => ITEMS[k] && n > 0);
  if (!list.length) return Promise.resolve();
  return userLock.run(uid, () => tx(async (c) => {
    for (const [k, n] of list) await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, k, n]);
  }));
}

/**
 * Give an art to many at once (an event's reward): everyone with a character, or the given user ids. One INSERT IGNORE,
 * so it can run while they play or learn: whoever already has it keeps their one row. Returns the user ids that got it.
 */
export async function grantArtMany(key, uids = null) {
  const art = ARTS[String(key ?? "")];
  if (!art) throw new GameError("Công pháp không tồn tại.");
  if (art.starter) throw new GameError("Công pháp này ai cũng đã biết.");
  const who = uids ? await q("SELECT user_id FROM characters WHERE user_id IN (?)", [uids.length ? uids : [0]]) : await q("SELECT user_id FROM characters");
  const ids = who.map((r) => r.user_id);
  if (ids.length) await q(`INSERT IGNORE INTO learned_arts (user_id, art_key) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap((id) => [id, art.key]));
  return ids;
}

/** An admin teaches or takes back an art (no items spent). Taking it back also clears it from the bar. */
export function adminArt(uid, key, learn) {
  const art = ARTS[String(key ?? "")];
  if (!art) throw new GameError("Công pháp không tồn tại.");
  return userLock.run(uid, () => tx(async (c) => {
    const ch = await loadCharacter(uid, c);
    if (!ch) throw new GameError("Người chơi chưa có nhân vật.", 404);
    if (learn) await c.query("INSERT IGNORE INTO learned_arts (user_id, art_key) VALUES (?, ?)", [uid, art.key]);
    else {
      await c.query("DELETE FROM learned_arts WHERE user_id = ? AND art_key = ?", [uid, art.key]);
      if (!art.starter && ch.slots.includes(art.key))
        await c.query("UPDATE characters SET art_slots = ? WHERE user_id = ?", [JSON.stringify(ch.slots.map((s) => (s === art.key ? null : s))), uid]);
    }
    return loadCharacter(uid, c);
  }));
}

// ---------------------------------------------------------------- the wardrobe (Y Các)
const SLOT = { hair: "hair", robe: "robe", weapon: "weapon" };
const ITEM_COLS = "id, kind, gender, idx, name, price, starter, on_sale, special";
// a special item (bảo vật) is never on sale and never free, whatever its other flags say
const shapeItem = (r) => ({ id: r.id, kind: r.kind, g: r.gender, idx: r.idx, name: r.name, price: r.price, starter: !!r.starter && !r.special, onSale: !!r.on_sale && !r.special, special: !!r.special });

/** Everything a player may see in the wardrobe: what's on sale, the free styles, and anything they own (bảo vật only
 * when owned); plus their ids. */
export async function wardrobe(uid) {
  const owned = (await q("SELECT cosmetic_id FROM owned_cosmetics WHERE user_id = ?", [uid])).map((r) => r.cosmetic_id);
  const rows = await q(
    `SELECT ${ITEM_COLS} FROM cosmetics WHERE (special = 0 AND (on_sale = 1 OR starter = 1)) OR id IN (SELECT cosmetic_id FROM owned_cosmetics WHERE user_id = ?)
     ORDER BY kind, gender, starter DESC, sort, idx`,
    [uid],
  );
  return { items: rows.map(shapeItem), owned, defaultWeapon: DEFAULT_WEAPON };
}

const itemId = (id) => {
  id = Number(id);
  if (!Number.isInteger(id) || id < 1) throw new GameError("Món đồ không tồn tại.");
  return id;
};

/**
 * Buy a hair style or robe for spirit stones, and wear it straight away if asked. Owning is one row per (account, item):
 * a second buy of the same item, however many arrive at once, finds the row and is refused without charging.
 */
export function buyCosmetic(uid, id, wear) {
  id = itemId(id);
  return userLock.run(uid, () => tx(async (c) => {
    const [ch] = await c.query("SELECT gender FROM characters WHERE user_id = ?", [uid]);
    if (!ch) throw new GameError("Hãy tạo nhân vật trước.");
    const [it] = await c.query(`SELECT ${ITEM_COLS} FROM cosmetics WHERE id = ?`, [id]);
    if (!it) throw new GameError("Món đồ không tồn tại.");
    if (it.gender !== ch.gender && it.gender !== "a") throw new GameError("Món này dành cho giới tính khác.");
    if (it.special) throw new GameError("Bảo vật không bán ở Y Các; chỉ có được từ hoạt động, sự kiện hay đấu giá.", 403);
    if (it.starter) throw new GameError("Món này miễn phí, cứ mặc thôi.");
    if (!it.on_sale) throw new GameError("Món này đã ngừng bán.");
    try {
      await c.query("INSERT INTO owned_cosmetics (user_id, cosmetic_id, price) VALUES (?, ?, ?)", [uid, id, it.price]);
    } catch (e) {
      if (isDup(e)) throw new GameError("Đạo hữu đã có món này rồi.", 409);
      throw e;
    }
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [it.price, uid, it.price]);
    if (r.affectedRows !== 1) throw new GameError("Không đủ linh thạch.", 409);
    if (wear) await c.query(`UPDATE characters SET ${SLOT[it.kind]} = ? WHERE user_id = ?`, [it.idx, uid]);
    return loadCharacter(uid, c);
  }));
}

/** Wear a hair style or robe the player owns (or a free one). */
export function wearCosmetic(uid, id) {
  id = itemId(id);
  return userLock.run(uid, () => tx(async (c) => {
    const [ch] = await c.query("SELECT gender FROM characters WHERE user_id = ?", [uid]);
    if (!ch) throw new GameError("Hãy tạo nhân vật trước.");
    const [it] = await c.query(
      `SELECT ${ITEM_COLS}, EXISTS(SELECT 1 FROM owned_cosmetics WHERE user_id = ? AND cosmetic_id = cosmetics.id) AS mine FROM cosmetics WHERE id = ?`,
      [uid, id],
    );
    if (!it) throw new GameError("Món đồ không tồn tại.");
    if (it.gender !== ch.gender && it.gender !== "a") throw new GameError("Món này dành cho giới tính khác.");
    if ((!it.starter || it.special) && !it.mine) throw new GameError("Đạo hữu chưa có món này.", 403);
    await c.query(`UPDATE characters SET ${SLOT[it.kind]} = ? WHERE user_id = ?`, [it.idx, uid]);
    return loadCharacter(uid, c);
  }));
}

// ---------------------------------------------------------------- an admin's edits of one player
// Every one runs under the player's userLock, the same lock the world's saves, purchases, pills and the daily gift take, and
// writes with atomic SQL (col = col + ?), so it can't interleave with any of them. The character is read back inside the
// lock, and onLoaded(ch) runs there too: the world takes the numbers before the next save can start (see World.refresh).

/** Buffs still running for a player: [{ id, stat, pct, until (ms, null = for good), note, by, at }]. */
export async function activeBuffs(uid, conn = null) {
  const rows = await (conn ?? { query: q }).query(
    "SELECT id, stat, pct, expires_at, note, created_by, created_at FROM player_buffs WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY id",
    [uid],
  );
  return rows.map((b) => ({ id: Number(b.id), stat: b.stat, pct: b.pct, until: b.expires_at ? new Date(b.expires_at).getTime() : null, note: b.note, by: b.created_by, at: b.created_at }));
}

function adminRun(uid, fn, onLoaded) {
  return userLock.run(uid, async () => {
    const ch = await tx(async (c) => {
      const [has] = await c.query("SELECT 1 FROM characters WHERE user_id = ?", [uid]);
      if (!has) throw new GameError("Người chơi này chưa có nhân vật.");
      await fn(c);
      return loadCharacter(uid, c);
    });
    onLoaded?.(ch);
    return ch;
  });
}

const ADJUST = { stones: "stones", exp: "exp", rank: "rank_points", kills: "kills", deaths: "deaths" };
/** Add to (op "add", value may be negative; never below 0) or set (op "set") one of a player's numbers. */
export function adminAdjust(uid, field, op, value, onLoaded) {
  const col = ADJUST[field];
  if (!col) throw new GameError("Không có chỉ số này.");
  if (!Number.isInteger(value) || Math.abs(value) > 1e12 || (op === "set" && value < 0)) throw new GameError("Giá trị không hợp lệ.");
  if (op !== "add" && op !== "set") throw new GameError("Thao tác không hợp lệ.");
  return adminRun(uid, (c) => c.query(
    op === "add" ? `UPDATE characters SET ${col} = GREATEST(0, CAST(${col} AS SIGNED) + ?) WHERE user_id = ?` : `UPDATE characters SET ${col} = ? WHERE user_id = ?`,
    [value, uid],
  ), onLoaded);
}

/** Give back today's meditation allowance. */
export const adminResetMeditation = (uid, onLoaded) => adminRun(uid, (c) => c.query("UPDATE characters SET med_exp = 0, med_day = CURDATE() WHERE user_id = ?", [uid]), onLoaded);

/** Name, gender, hair, robe (any of them). */
export function adminLook(uid, ch, onLoaded) {
  const set = Object.entries(ch);
  if (!set.length) throw new GameError("Không có gì để lưu.");
  return adminRun(uid, async (c) => {
    try {
      await c.query(`UPDATE characters SET ${set.map(([k]) => `${k} = ?`).join(", ")} WHERE user_id = ?`, [...set.map(([, v]) => v), uid]);
    } catch (e) {
      if (isDup(e)) throw new GameError("Đạo hiệu đã có người dùng.", 409);
      throw e;
    }
  }, onLoaded);
}

/** Add to or set how many of an item a player holds (never below 0). Returns the inventory. */
export function adminItem(uid, item, op, value) {
  if (!/^[a-z0-9_]{1,32}$/.test(item)) throw new GameError("Mã vật phẩm không hợp lệ.");
  if (!Number.isInteger(value) || Math.abs(value) > 1e6 || (op === "set" && value < 0)) throw new GameError("Số lượng không hợp lệ.");
  return userLock.run(uid, async () => {
    if (op === "set") await q("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = VALUES(qty)", [uid, item, value]);
    else if (op === "add") await q("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, GREATEST(0, ?)) ON DUPLICATE KEY UPDATE qty = GREATEST(0, CAST(qty AS SIGNED) + ?)", [uid, item, value, value]);
    else throw new GameError("Thao tác không hợp lệ.");
    await q("DELETE FROM inventory WHERE user_id = ? AND item = ? AND qty = 0", [uid, item]);
    return inventory(uid);
  });
}

export const logPvp = (killer, victim, rewarded) => q("INSERT INTO pvp_log (killer_id, victim_id, rewarded) VALUES (?, ?, ?)", [killer, victim, rewarded ? 1 : 0]);

export async function leaderboard() {
  const rank = await q("SELECT name, gender, hair, robe, rank_points AS v, exp FROM characters ORDER BY rank_points DESC, exp DESC LIMIT 20");
  const exp = await q("SELECT name, gender, hair, robe, exp AS v, exp FROM characters ORDER BY exp DESC LIMIT 20");
  const fmt = (rows) => rows.map((r) => ({ name: r.name, look: { g: r.gender, hair: Number(r.hair), robe: Number(r.robe) }, v: Number(r.v), level: levelFromExp(Number(r.exp)) }));
  return { rank: fmt(rank), exp: fmt(exp) };
}
