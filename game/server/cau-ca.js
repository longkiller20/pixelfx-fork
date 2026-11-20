// Câu Cá on the server: what is saved and every rule about money and things (the cast itself, its timing and the reeling,
// are run by the world, server/world.js). How it stays safe, as the Gia Viên does:
//  1. Everything about one person runs one at a time (userLock) in one transaction.
//  2. Money and things only move by conditional updates: stones - n WHERE stones >= n, qty - n WHERE qty >= n.
//  3. Buying and selling carry a request id: sent twice, it counts once.
//  4. A rod is bought once (an inventory row of 1); having it is having the row.
//  5. The catch is rolled by the world, never told by the browser; the bait is taken from the bag before the fish is.
// Names and prices are the items table's (an admin's), the numbers that make a rod, bait or fish what it is are
// shared/cau-ca.js's.
import { q, tx, isDup } from "./db.js";
import { userLock } from "./lock.js";
import { GameError } from "./store.js";
import { ITEMS } from "../shared/balance.js";
import { RODS, BAITS, FISH, fishName, fishPrice } from "../shared/cau-ca.js";

const no = (m, status = 400) => new GameError(m, status);
const fmt = (n) => Number(n).toLocaleString("vi-VN");
const reqId = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw no("Thiếu mã giao dịch.");
  return v.toLowerCase();
};
async function once(c, uid, rid) {
  try {
    await c.query("INSERT INTO fish_requests (user_id, request_id) VALUES (?, ?)", [uid, rid]);
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}
const run = (uid, fn) => userLock.run(uid, () => tx(fn));
const give = (c, uid, item, n) => c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, item, n]);
const name = (k) => fishName(k, ITEMS);
const price = (k) => fishPrice(k, ITEMS);
const fisher = (c, uid) => c.query("INSERT IGNORE INTO fishers (user_id) VALUES (?)", [uid]);
const MAX_BAIT = 99;

// ---------------------------------------------------------------- reading
/** What the Ngư Cụ panel shows: the rod and bait chosen, the bag's fishing things, the Ngư Lục, the tallies. */
export async function view(uid) {
  const [[f], bag, log] = await Promise.all([
    q("SELECT rod, bait, casts, catches, sold FROM fishers WHERE user_id = ?", [uid]),
    q("SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0 AND item LIKE 'cc\\_%'", [uid]),
    q("SELECT fish, n, best_g FROM fish_log WHERE user_id = ?", [uid]),
  ]);
  const has = Object.fromEntries(bag.map((r) => [r.item, Number(r.qty)]));
  return {
    rod: RODS[f?.rod] && has[f.rod] ? f.rod : null,
    bait: BAITS[f?.bait] ? f.bait : null,
    rods: Object.keys(RODS).filter((k) => has[k] > 0),
    baits: Object.fromEntries(Object.keys(BAITS).map((k) => [k, has[k] ?? 0])),
    fish: Object.fromEntries(Object.keys(FISH).filter((k) => has[k] > 0).map((k) => [k, has[k]])),
    log: Object.fromEntries(log.filter((r) => FISH[r.fish]).map((r) => [r.fish, { n: Number(r.n), best: Number(r.best_g) }])),
    casts: Number(f?.casts ?? 0), catches: Number(f?.catches ?? 0), sold: Number(f?.sold ?? 0),
  };
}
/** The lake's records: for each fish, the heaviest ever caught and by whom. */
export async function records() {
  const rows = await q(
    `SELECT l.fish, l.best_g, c.name FROM fish_log l JOIN characters c ON c.user_id = l.user_id
      WHERE l.best_g > 0 AND l.best_g = (SELECT MAX(best_g) FROM fish_log x WHERE x.fish = l.fish) ORDER BY l.best_at`,
  );
  const out = {};
  for (const r of rows) if (FISH[r.fish] && !out[r.fish]) out[r.fish] = { g: Number(r.best_g), by: r.name };
  return out;
}
/** For a cast: the rod and bait chosen and whether the bag still has them. */
export async function gear(uid) {
  const [[f], bag] = await Promise.all([
    q("SELECT rod, bait FROM fishers WHERE user_id = ?", [uid]),
    q("SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0 AND item LIKE 'cc\\_%'", [uid]),
  ]);
  const has = Object.fromEntries(bag.map((r) => [r.item, Number(r.qty)]));
  // no rod chosen yet: the best one owned
  const rod = RODS[f?.rod] && has[f.rod] ? f.rod : Object.keys(RODS).filter((k) => has[k]).sort((a, b) => RODS[b].tier - RODS[a].tier)[0] ?? null;
  const bait = BAITS[f?.bait] && has[f.bait] ? f.bait : Object.keys(BAITS).filter((k) => has[k]).sort((a, b) => BAITS[a].tier - BAITS[b].tier)[0] ?? null;
  return { rod, bait, baitLeft: bait ? has[bait] : 0 };
}

// ---------------------------------------------------------------- choosing, buying, selling
/** Pick the rod (one owned) and the bait (any; it is checked at each cast) to fish with. */
export function choose(uid, rawRod, rawBait) {
  const rod = rawRod == null ? undefined : String(rawRod), bait = rawBait == null ? undefined : String(rawBait);
  if (rod !== undefined && !Object.hasOwn(RODS, rod)) throw no("Không có cần câu này.");
  if (bait !== undefined && !Object.hasOwn(BAITS, bait)) throw no("Không có mồi câu này.");
  return run(uid, async (c) => {
    if (rod !== undefined && !(await c.query("SELECT 1 FROM inventory WHERE user_id = ? AND item = ? AND qty > 0", [uid, rod])).length) throw no(`Đạo hữu chưa có ${name(rod)}.`, 403);
    await fisher(c, uid);
    if (rod !== undefined) await c.query("UPDATE fishers SET rod = ? WHERE user_id = ?", [rod, uid]);
    if (bait !== undefined) await c.query("UPDATE fishers SET bait = ? WHERE user_id = ?", [bait, uid]);
  });
}
/** Buy a rod (once) or a handful of bait at the Ngư Cụ. A retried request counts once. */
export function buy(uid, rawKey, rawQty, rawReq) {
  const key = String(rawKey ?? ""), rid = reqId(rawReq), isRod = Object.hasOwn(RODS, key);
  if (!isRod && !Object.hasOwn(BAITS, key)) throw no("Ngư Cụ không bán món này.");
  const qty = isRod ? 1 : Number(rawQty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_BAIT) throw no(`Mỗi lần mua 1-${MAX_BAIT} mồi.`);
  const each = price(key), cost = each * qty;
  if (!(each > 0)) throw no(`${name(key)} hiện không bán.`, 409);
  return run(uid, async (c) => {
    if (!(await once(c, uid, rid))) return { repeat: true };
    if (!(await c.query("SELECT 1 FROM characters WHERE user_id = ?", [uid])).length) throw no("Hãy tạo nhân vật trước.");
    if (isRod && (await c.query("SELECT 1 FROM inventory WHERE user_id = ? AND item = ? AND qty > 0", [uid, key])).length) throw no(`Đạo hữu đã có ${name(key)} rồi.`, 409);
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [cost, uid, cost]);
    if (r.affectedRows !== 1) throw no(`Cần ${fmt(cost)} linh thạch để mua ${name(key)}${isRod ? "" : ` ×${qty}`}.`, 409);
    await give(c, uid, key, qty);
    // the first rod or bait bought is the one fished with
    // and a better rod than the one in hand is taken up
    await fisher(c, uid);
    const [f] = await c.query("SELECT rod, bait FROM fishers WHERE user_id = ? FOR UPDATE", [uid]);
    if (isRod && !(RODS[f.rod]?.tier >= RODS[key].tier)) await c.query("UPDATE fishers SET rod = ? WHERE user_id = ?", [key, uid]);
    if (!isRod && !BAITS[f.bait]) await c.query("UPDATE fishers SET bait = ? WHERE user_id = ?", [key, uid]);
    return { repeat: false, cost };
  });
}
/** Sell fish to the Ngư Cụ: one kind (qty of it, or "all" of it), or every fish in the bag (key "all"). */
export function sell(uid, rawKey, rawQty, rawReq) {
  const rid = reqId(rawReq), every = rawKey === "all";
  const key = every ? null : String(rawKey ?? "");
  if (!every && !(Object.hasOwn(FISH, key) && !FISH[key].stones)) throw no("Ngư Cụ không mua món này.");
  const qty = rawQty === "all" ? null : Number(rawQty);
  if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > 9999)) throw no("Số lượng không hợp lệ.");
  return run(uid, async (c) => {
    if (!(await once(c, uid, rid))) return { repeat: true, got: 0, n: 0 };
    const rows = await c.query(`SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0 AND ${every ? "item LIKE 'cc\\_%'" : "item = ?"} FOR UPDATE`, every ? [uid] : [uid, key]);
    let got = 0, n = 0;
    for (const r of rows) {
      if (!FISH[r.item] || FISH[r.item].stones || !(price(r.item) > 0)) continue;
      const k = qty === null || every ? Number(r.qty) : qty;
      if (k > Number(r.qty)) throw no(`Đạo hữu chỉ có ${fmt(r.qty)} ${name(r.item)}.`, 409);
      const u = await c.query("UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?", [k, uid, r.item, k]);
      if (u.affectedRows !== 1) throw no(`Đạo hữu không đủ ${name(r.item)}.`, 409);
      got += k * price(r.item);
      n += k;
    }
    if (!n) throw no(every ? "Trong túi không có cá nào để bán." : `Đạo hữu không có ${name(key)}.`, 409);
    await c.query("DELETE FROM inventory WHERE user_id = ? AND qty = 0 AND item LIKE 'cc\\_%'", [uid]);
    await c.query("UPDATE characters SET stones = stones + ? WHERE user_id = ?", [got, uid]);
    await fisher(c, uid);
    await c.query("UPDATE fishers SET sold = sold + ? WHERE user_id = ?", [got, uid]);
    return { repeat: false, got, n };
  });
}

// ---------------------------------------------------------------- the cast (called by the world)
/** A fish bit: one bait out of the bag, or false if there is none left. */
export function takeBait(uid, bait) {
  if (!BAITS[bait]) return Promise.resolve(false);
  return run(uid, async (c) => {
    const r = await c.query("UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ? AND qty >= 1", [uid, bait]);
    if (r.affectedRows !== 1) return false;
    await fisher(c, uid);
    await c.query("UPDATE fishers SET casts = casts + 1 WHERE user_id = ?", [uid]);
    return true;
  });
}
/**
 * A fish landed: into the bag (a chest: its stones, opened on the spot), into the Ngư Lục with its weight. Returns
 * { stones, best: heavier than any of this kind they caught before, record: heavier than anyone's }.
 */
export function land(uid, fish, grams, rnd = Math.random) {
  const f = FISH[fish];
  if (!f) throw new Error(`no fish ${fish}`);
  return run(uid, async (c) => {
    const [[mine], [top]] = await Promise.all([
      c.query("SELECT best_g FROM fish_log WHERE user_id = ? AND fish = ? FOR UPDATE", [uid, fish]),
      c.query("SELECT MAX(best_g) AS g FROM fish_log WHERE fish = ?", [fish]),
    ]);
    let stones = 0;
    if (f.stones) {
      stones = Math.round(f.stones[0] + (f.stones[1] - f.stones[0]) * rnd() * rnd());
      await c.query("UPDATE characters SET stones = stones + ? WHERE user_id = ?", [stones, uid]);
    } else await give(c, uid, fish, 1);
    // best_at before best_g: MariaDB assigns left to right, so it still sees the old best
    await c.query(
      `INSERT INTO fish_log (user_id, fish, n, best_g) VALUES (?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE n = n + 1, best_at = IF(VALUES(best_g) > best_g, NOW(), best_at), best_g = GREATEST(best_g, VALUES(best_g))`,
      [uid, fish, grams],
    );
    await fisher(c, uid);
    await c.query("UPDATE fishers SET catches = catches + 1 WHERE user_id = ?", [uid]);
    return { stones, best: !mine || grams > Number(mine.best_g), record: grams > Number(top?.g ?? 0) };
  });
}

// ---------------------------------------------------------------- the admin
export async function adminView(uid) {
  const v = await view(uid);
  return {
    rod: v.rod && name(v.rod), bait: v.bait && name(v.bait), casts: v.casts, catches: v.catches, sold: v.sold,
    log: Object.fromEntries(Object.entries(v.log).map(([k, l]) => [name(k), l])),
  };
}
