// Gia Viên on the server: what is saved and every rule about money and things. How it stays safe:
//  1. Unlocking is once: homes is keyed by the person; the stones go in the same transaction, so a refused unlock costs nothing.
//  2. Everything about one home runs in one transaction that first locks its row (SELECT ... FOR UPDATE), and per person
//     one at a time (userLock): two buys, a feed racing a collect, two herbs sown in one bed... happen one after another.
//  3. Money only moves by conditional updates (stones - n WHERE stones >= n).
//  4. Buying carries a request id: sent twice, it counts once.
//  5. Time is the database's: an animal is ready, a herb ripe, when NOW() says so, not when the browser says so. What a
//     herb gives is rolled here.
// Houses are ready-made (shared/gia-vien.js HOUSES): a home keeps the one it lives in (homes.house) and those it bought
// (home_houses: a row each, so one is never bought twice); the default comes with unlocking.
import { q, tx, isDup } from "./db.js";
import { userLock } from "./lock.js";
import { GameError } from "./store.js";
import { HOME } from "../shared/balance.js";
import { ANIMALS, CROPS, LAYOUT, HOUSES, DEFAULT_HOUSE, housePrice, houseName } from "../shared/gia-vien.js";

const no = (m, status = 400) => new GameError(m, status);
const fmt = (n) => Number(n).toLocaleString("vi-VN");
const reqId = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw no("Thiếu mã giao dịch.");
  return v.toLowerCase();
};
/** Lock this person's home (or say it isn't unlocked). */
async function lockHome(c, uid) {
  const [h] = await c.query("SELECT user_id FROM homes WHERE user_id = ? FOR UPDATE", [uid]);
  if (!h) throw no("Đạo hữu chưa mở khoá Gia Viên.", 403);
}
/** Spend stones from the character, or refuse. */
async function pay(c, uid, n, what) {
  if (n <= 0) return;
  const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [n, uid, n]);
  if (r.affectedRows !== 1) throw no(`Cần ${fmt(n)} linh thạch ${what}.`, 409);
}
const give = (c, uid, item, n) => c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, item, n]);
/** A request id, once: false if it was seen before. */
async function once(c, uid, rid) {
  try {
    await c.query("INSERT INTO home_requests (user_id, request_id) VALUES (?, ?)", [uid, rid]);
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}
const run = (uid, fn) => userLock.run(uid, () => tx(fn));

// ---------------------------------------------------------------- reading
export async function unlocked(uid) {
  return (await q("SELECT 1 FROM homes WHERE user_id = ?", [uid])).length > 0;
}
/** The house, the animals and herb beds with what the database's clock says about them. */
export async function state(uid) {
  const [[home], owned, animals, plots, [now]] = await Promise.all([
    q("SELECT house FROM homes WHERE user_id = ?", [uid]),
    q("SELECT house FROM home_houses WHERE user_id = ?", [uid]),
    q("SELECT id, kind, ready_at, (ready_at IS NOT NULL AND ready_at <= NOW()) AS ready FROM home_animals WHERE user_id = ? ORDER BY id", [uid]),
    q("SELECT plot, crop, planted_at, ready_at, (ready_at <= NOW()) AS ripe FROM home_plots WHERE user_id = ? ORDER BY plot", [uid]),
    q("SELECT NOW() AS now"),
  ]);
  // times as ms, with the database's clock beside them so the browser can count down on its own
  return {
    now: new Date(now.now).getTime(),
    house: HOUSES[home?.house] ? home.house : DEFAULT_HOUSE,
    houses: [DEFAULT_HOUSE, ...owned.map((h) => h.house).filter((h) => HOUSES[h] && h !== DEFAULT_HOUSE)],
    animals: animals.map((a) => ({ id: a.id, kind: a.kind, readyAt: a.ready_at ? new Date(a.ready_at).getTime() : null, ready: !!a.ready })),
    plots: plots.map((p) => ({ plot: p.plot, crop: p.crop, plantedAt: new Date(p.planted_at).getTime(), readyAt: new Date(p.ready_at).getTime(), ripe: !!p.ripe })),
  };
}
/** Which house a home has (for its world). */
export async function houseOf(uid) {
  const [h] = await q("SELECT house FROM homes WHERE user_id = ?", [uid]);
  return HOUSES[h?.house] ? h.house : DEFAULT_HOUSE;
}

// ---------------------------------------------------------------- unlocking (the default house comes with it)
export function unlock(uid) {
  return run(uid, async (c) => {
    if ((await c.query("SELECT 1 FROM homes WHERE user_id = ?", [uid])).length) throw no("Gia Viên đã mở khoá rồi.", 409);
    if (!(await c.query("SELECT 1 FROM characters WHERE user_id = ?", [uid])).length) throw no("Hãy tạo nhân vật trước.");
    await pay(c, uid, HOME.unlockCost, "để mở khoá Gia Viên");
    try {
      await c.query("INSERT INTO homes (user_id, paid, house) VALUES (?, ?, ?)", [uid, HOME.unlockCost, DEFAULT_HOUSE]);
    } catch (e) {
      if (isDup(e)) throw no("Gia Viên đã mở khoá rồi.", 409);
      throw e;
    }
  });
}

// ---------------------------------------------------------------- houses: buy one (and move in), move into one owned
const houseOf_ = (id) => {
  if (typeof id !== "string" || !Object.hasOwn(HOUSES, id)) throw no("Không có kiểu nhà này.");
  return id;
};
/** Buy a ready-made house, once, and move into it. A retried request counts once. */
export function buyHouse(uid, rawHouse, rawReq) {
  const id = houseOf_(rawHouse), H = { name: houseName(id, HOME.houses) }, rid = reqId(rawReq), price = housePrice(id, HOME.houses);
  if (id !== DEFAULT_HOUSE && !price) throw no(`${H.name} không bán.`, 409);
  return run(uid, async (c) => {
    await lockHome(c, uid);
    if (!(await once(c, uid, rid))) return { repeat: true };
    if (id === DEFAULT_HOUSE || (await c.query("SELECT 1 FROM home_houses WHERE user_id = ? AND house = ?", [uid, id])).length) throw no(`Đạo hữu đã có ${H.name} rồi.`, 409);
    await pay(c, uid, price, `để mua ${H.name}`);
    try {
      await c.query("INSERT INTO home_houses (user_id, house, paid) VALUES (?, ?, ?)", [uid, id, price]);
    } catch (e) {
      if (isDup(e)) throw no(`Đạo hữu đã có ${H.name} rồi.`, 409);
      throw e;
    }
    await c.query("UPDATE homes SET house = ? WHERE user_id = ?", [id, uid]);
    return { repeat: false };
  });
}
/** Move into a house one has (the default, or one bought). */
export function useHouse(uid, rawHouse) {
  const id = houseOf_(rawHouse);
  return run(uid, async (c) => {
    await lockHome(c, uid);
    if (id !== DEFAULT_HOUSE && !(await c.query("SELECT 1 FROM home_houses WHERE user_id = ? AND house = ?", [uid, id])).length) throw no(`Đạo hữu chưa có ${houseName(id, HOME.houses)}.`, 403);
    await c.query("UPDATE homes SET house = ? WHERE user_id = ?", [id, uid]);
  });
}

/**
 * An admin gives a house (give: true; the Gia Viên is unlocked for nothing if it wasn't), or takes one back (false: if
 * it was lived in, the default one is). Returns whether anything changed, and whether the home's house changed.
 */
export function adminHouse(uid, rawHouse, give) {
  const id = houseOf_(rawHouse);
  if (id === DEFAULT_HOUSE) throw no("Nhà mặc định ai mở khoá Gia Viên cũng có.");
  return run(uid, async (c) => {
    if (!(await c.query("SELECT 1 FROM characters WHERE user_id = ?", [uid])).length) throw no("Người này chưa tạo nhân vật.");
    if (give) {
      await c.query("INSERT IGNORE INTO homes (user_id, paid, house) VALUES (?, 0, ?)", [uid, DEFAULT_HOUSE]);
      const r = await c.query("INSERT IGNORE INTO home_houses (user_id, house, paid) VALUES (?, ?, 0)", [uid, id]);
      return { changed: r.affectedRows === 1, moved: false };
    }
    const r = await c.query("DELETE FROM home_houses WHERE user_id = ? AND house = ?", [uid, id]);
    const m = await c.query("UPDATE homes SET house = ? WHERE user_id = ? AND house = ?", [DEFAULT_HOUSE, uid, id]);
    return { changed: r.affectedRows === 1, moved: m.affectedRows === 1 };
  });
}
/** For the admin: whether unlocked, the house lived in, the houses had. */
export async function adminView(uid) {
  const [[h], owned] = await Promise.all([q("SELECT house FROM homes WHERE user_id = ?", [uid]), q("SELECT house, paid, bought_at FROM home_houses WHERE user_id = ? ORDER BY bought_at", [uid])]);
  return { unlocked: !!h, house: h?.house ?? null, owned: owned.map((o) => ({ house: o.house, paid: Number(o.paid), at: o.bought_at })) };
}

// ---------------------------------------------------------------- animals
export function buyAnimal(uid, kind, rawReq) {
  const a = ANIMALS[kind], rid = reqId(rawReq);
  if (!a) throw no("Không có con vật này.");
  return run(uid, async (c) => {
    await lockHome(c, uid);
    if (!(await once(c, uid, rid))) return { repeat: true };
    const [{ n }] = await c.query("SELECT COUNT(*) AS n FROM home_animals WHERE user_id = ?", [uid]);
    if (Number(n) >= HOME.maxAnimals) throw no(`Nông Trại chỉ nuôi được ${HOME.maxAnimals} con.`, 409);
    await pay(c, uid, a.price, `để mua ${a.name}`);
    await c.query("INSERT INTO home_animals (user_id, kind) VALUES (?, ?)", [uid, kind]);
    return { repeat: false };
  });
}
const pick = (ids) => (ids === "all" ? null : [].concat(ids).map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 100));
/** Feed the hungry ones (ids, or "all"): each costs its feed; it is ready `cycle` seconds later. */
export function feed(uid, ids) {
  const only = pick(ids);
  if (only && !only.length) throw no("Chưa chọn con nào.");
  return run(uid, async (c) => {
    await lockHome(c, uid);
    const rows = (await c.query("SELECT id, kind FROM home_animals WHERE user_id = ? AND ready_at IS NULL FOR UPDATE", [uid])).filter((a) => !only || only.includes(a.id));
    if (!rows.length) throw no("Không có con nào đang đói.", 409);
    await pay(c, uid, rows.reduce((s, a) => s + (ANIMALS[a.kind]?.feed ?? 0), 0), "để mua thức ăn");
    for (const a of rows) await c.query("UPDATE home_animals SET ready_at = NOW() + INTERVAL ? SECOND WHERE id = ?", [ANIMALS[a.kind]?.cycle ?? 3600, a.id]);
    return { fed: rows.length };
  });
}
/** Collect from the ready ones (ids, or "all"): one of its product each, into the bag; then they are hungry again. */
export function collect(uid, ids) {
  const only = pick(ids);
  return run(uid, async (c) => {
    await lockHome(c, uid);
    const rows = (await c.query("SELECT id, kind FROM home_animals WHERE user_id = ? AND ready_at IS NOT NULL AND ready_at <= NOW() FOR UPDATE", [uid])).filter((a) => !only || only.includes(a.id));
    if (!rows.length) throw no("Chưa con nào có gì để thu.", 409);
    const got = {};
    for (const a of rows) {
      const item = ANIMALS[a.kind]?.product;
      await c.query("UPDATE home_animals SET ready_at = NULL WHERE id = ?", [a.id]);
      if (item) got[item] = (got[item] ?? 0) + 1;
    }
    for (const [item, n] of Object.entries(got)) await give(c, uid, item, n);
    return { got };
  });
}
/** Let one go (nothing back). */
export function release(uid, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw no("Không có con vật này.");
  return run(uid, async (c) => {
    await lockHome(c, uid);
    const r = await c.query("DELETE FROM home_animals WHERE id = ? AND user_id = ?", [id, uid]);
    if (!r.affectedRows) throw no("Không có con vật này.", 404);
  });
}

// ---------------------------------------------------------------- herbs
const plotOf = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n >= LAYOUT.plots.length) throw no("Không có luống này.");
  return n;
};
export function plant(uid, rawPlot, crop) {
  const plot = plotOf(rawPlot), cr = CROPS[crop];
  if (!cr) throw no("Không có hạt giống này.");
  return run(uid, async (c) => {
    await lockHome(c, uid);
    if ((await c.query("SELECT 1 FROM home_plots WHERE user_id = ? AND plot = ? FOR UPDATE", [uid, plot])).length) throw no("Luống này đang có cây.", 409);
    await pay(c, uid, cr.seed, `để mua hạt ${cr.name}`);
    try {
      await c.query("INSERT INTO home_plots (user_id, plot, crop, planted_at, ready_at) VALUES (?, ?, ?, NOW(), NOW() + INTERVAL ? SECOND)", [uid, plot, crop, cr.grow]);
    } catch (e) {
      if (isDup(e)) throw no("Luống này đang có cây.", 409);
      throw e;
    }
  });
}
/** Pick the ripe herbs (one bed, or "all"): each gives min..max of its item, rolled here; the bed is empty again. */
export function harvest(uid, which) {
  const one = which === "all" ? null : plotOf(which);
  return run(uid, async (c) => {
    await lockHome(c, uid);
    const rows = (await c.query("SELECT plot, crop FROM home_plots WHERE user_id = ? AND ready_at <= NOW() FOR UPDATE", [uid])).filter((p) => one === null || p.plot === one);
    if (!rows.length) throw no(one === null ? "Chưa luống nào chín." : "Cây ở luống này chưa chín.", 409);
    const got = {};
    for (const p of rows) {
      const cr = CROPS[p.crop];
      await c.query("DELETE FROM home_plots WHERE user_id = ? AND plot = ?", [uid, p.plot]);
      if (!cr) continue;
      const n = cr.min + Math.floor(Math.random() * (cr.max - cr.min + 1));
      got[cr.item] = (got[cr.item] ?? 0) + n;
    }
    for (const [item, n] of Object.entries(got)) await give(c, uid, item, n);
    return { got };
  });
}
/** Dig up what grows in a bed, ripe or not (nothing back). */
export function clearPlot(uid, rawPlot) {
  const plot = plotOf(rawPlot);
  return run(uid, async (c) => {
    await lockHome(c, uid);
    const r = await c.query("DELETE FROM home_plots WHERE user_id = ? AND plot = ?", [uid, plot]);
    if (!r.affectedRows) throw no("Luống này đang trống.", 404);
  });
}
