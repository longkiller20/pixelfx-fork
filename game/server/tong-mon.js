// Tông Môn on the server: every rule, checked here and only here (the browser just shows buttons). How it stays safe:
//  1. A person is in at most one sect: sect_members is keyed by the person. Two joins at once (to one sect or to two)
//     can't both land; the second hits the key.
//  2. Everything that changes a sect runs in one transaction that first locks that sect's row (SELECT ... FOR UPDATE).
//     So changes to one sect happen one after another: two officers taking the last free place, a kick racing a leave,
//     a disband racing a join, two leaders... each one sees what the one before it did, and caps are counted under the lock.
//     The order is always the sect, then its members, then the person's own rows, so two of these never deadlock.
//  3. Inside the lock the actor's own membership and rank are read again: what the browser thought a moment ago counts for
//     nothing. Acting on someone needs a rank strictly higher than theirs (shared/tong-mon.js, CAN and over).
//  4. Money only moves through conditional updates (stones = stones - n WHERE stones >= n, contrib = contrib - n WHERE
//     contrib >= n), daily things through a row per person per day with its cap in the WHERE, and every donation and
//     purchase carries a request id with its own key: sent twice, it counts once.
//  5. Text from players is cleaned (no hidden, bidi or markup characters, a length cap) and shown with textContent; names
//     that would pass for the staff are refused. The log stores kinds and names only.
import { q, tx, isDup } from "./db.js";
import { userLock } from "./lock.js";
import { GameError, loadCharacter } from "./store.js";
import { SECT, ITEMS, levelFromExp } from "../shared/balance.js";
import { RANKS, LEADER, VICE, ELDER, INNER, OUTER, CAN, over, grantable, JOIN_MODES, EMBLEMS, cleanSectName, cleanText, sectExpFor, memberCap } from "../shared/tong-mon.js";

const no = (m, status = 400) => new GameError(m, status);
const NOT_IN = () => no("Đạo hữu chưa ở tông môn nào.", 404);
const reqId = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw no("Thiếu mã giao dịch.");
  return v.toLowerCase();
};
const idOf = (v, what = "tông môn") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) throw no(`Mã ${what} không hợp lệ.`);
  return n;
};
const intIn = (v, lo, hi, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw no(`${what} phải là số nguyên từ ${lo} đến ${hi}.`);
  return n;
};
const fmt = (n) => Number(n).toLocaleString("vi-VN");

// ---------------------------------------------------------------- inside a transaction
const log = (c, sectId, kind, actor = "", target = "", amount = 0) =>
  c.query("INSERT INTO sect_log (sect_id, kind, actor, target, amount) VALUES (?, ?, ?, ?, ?)", [sectId, kind, actor, String(target).slice(0, 60), amount]);
const nameOf = async (c, uid) => (await c.query("SELECT name FROM characters WHERE user_id = ?", [uid]))[0]?.name ?? "?";
const lockSect = async (c, id) => (await c.query("SELECT * FROM sects WHERE id = ? FOR UPDATE", [id]))[0] ?? null;
const memberRow = async (c, uid, sectId) =>
  (await c.query("SELECT m.user_id, m.sect_id, m.rnk, m.contrib, m.contrib_total, c.name, c.exp FROM sect_members m JOIN characters c ON c.user_id = m.user_id WHERE m.user_id = ? AND m.sect_id = ? FOR UPDATE", [uid, sectId]))[0] ?? null;
const countMembers = async (c, sectId) => Number((await c.query("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ?", [sectId]))[0].n);
const countRank = async (c, sectId, r) => Number((await c.query("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ? AND rnk = ?", [sectId, r]))[0].n);
/** Seconds this person must still wait after leaving a sect before joining one (0: none). */
async function waitLeft(c, uid) {
  const [r] = await c.query("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), at + INTERVAL ? SECOND)) AS s FROM sect_leave WHERE user_id = ?", [Math.round(SECT.rejoinHours * 3600), uid]);
  return r ? Number(r.s) : 0;
}
const waitText = (s) => (s >= 3600 ? `${Math.ceil(s / 3600)} giờ` : `${Math.max(1, Math.ceil(s / 60))} phút`);

/**
 * Run fn(c, sect, me) for the actor's own sect, with the sect locked and the actor's membership read again under the lock.
 * The sect is looked up first without a lock, then locked, then the membership checked against it: if the actor left
 * or was moved in between, they are simply not in it.
 */
function inMySect(uid, fn) {
  return tx(async (c) => {
    const [m0] = await c.query("SELECT sect_id FROM sect_members WHERE user_id = ?", [uid]);
    if (!m0) throw NOT_IN();
    const s = await lockSect(c, m0.sect_id);
    const me = s && (await memberRow(c, uid, s.id));
    if (!me) throw NOT_IN();
    me.rnk = Number(me.rnk);
    return fn(c, s, me);
  });
}
/** Add sect exp (sect locked): the level climbs as far as it reaches, never falls. Returns the new level. */
async function addExp(c, s, add) {
  if (add <= 0) return Number(s.level);
  const exp = Number(s.exp) + add;
  let L = Number(s.level);
  while (L < SECT.maxLevel && exp >= sectExpFor(L + 1, SECT.expBase)) L++;
  await c.query("UPDATE sects SET exp = exp + ?, level = GREATEST(level, ?) WHERE id = ?", [add, L, s.id]);
  for (let k = Number(s.level) + 1; k <= L; k++) await log(c, s.id, "levelup", "", "", k);
  s.exp = exp;
  s.level = Math.max(Number(s.level), L);
  return L;
}
/** An outer disciple whose total cống hiến reached sect.inner_contrib moves up by themself. */
async function autoInner(c, s, me, total) {
  if (me.rnk === OUTER && SECT.innerContrib > 0 && total >= SECT.innerContrib) {
    await c.query("UPDATE sect_members SET rnk = ? WHERE user_id = ? AND rnk = ?", [INNER, me.user_id, OUTER]);
    await log(c, s.id, "auto", me.name, "", INNER);
    me.rnk = INNER;
  }
}
const memberUids = async (c, sectId) => (await c.query("SELECT user_id FROM sect_members WHERE sect_id = ?", [sectId])).map((r) => r.user_id);

// ---------------------------------------------------------------- what a player sees
/** The sect a person is in, as the game world keeps it (stat bonus, name over the head), or null. */
export async function sectOf(uid) {
  const [r] = await q(
    "SELECT s.id, s.name, s.emblem, s.level, m.rnk, GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), s.array_until)) AS arr FROM sect_members m JOIN sects s ON s.id = m.sect_id WHERE m.user_id = ?",
    [uid],
  );
  return r ? { id: r.id, name: r.name, emblem: Number(r.emblem), level: Number(r.level), rank: Number(r.rnk), arrayUntil: Date.now() + Number(r.arr ?? 0) * 1000 } : null;
}

const pub = (s, members) => ({
  id: s.id, name: s.name, emblem: Number(s.emblem), level: Number(s.level), exp: Number(s.exp), members: Number(members ?? 0), cap: memberCap(Number(s.level), SECT),
  joinMode: s.join_mode, minLevel: Number(s.min_level), notice: s.notice, leader: s.leader ?? "", createdAt: s.created_at,
});

/**
 * Everything the sect panel shows: for a member, the sect, its members (online or not is the world's), the applications
 * (officers only), the log, the treasure house and what they did today; for anyone else, their applications and how long
 * they still have to wait after leaving one.
 */
export async function mySect(uid, online = () => false) {
  const [m] = await q("SELECT sect_id, rnk, contrib, contrib_total, joined_at FROM sect_members WHERE user_id = ?", [uid]);
  if (!m) {
    const apps = await q(
      `SELECT a.sect_id, s.name, s.emblem, a.created_at FROM sect_applications a JOIN sects s ON s.id = a.sect_id
       WHERE a.user_id = ? AND a.created_at > NOW() - INTERVAL ? DAY ORDER BY a.created_at DESC`,
      [uid, SECT.applyDays],
    );
    return { sect: null, applications: apps.map((a) => ({ id: a.sect_id, name: a.name, emblem: Number(a.emblem), at: a.created_at })), wait: await waitLeft({ query: q }, uid) };
  }
  const rank = Number(m.rnk);
  const [s] = await q("SELECT s.*, (SELECT c.name FROM sect_members l JOIN characters c ON c.user_id = l.user_id WHERE l.sect_id = s.id AND l.rnk = 1 LIMIT 1) AS leader FROM sects s WHERE s.id = ?", [m.sect_id]);
  if (!s) return { sect: null, applications: [], wait: 0 };
  const members = await q(
    `SELECT m.user_id, c.name, c.exp, c.gender, m.rnk, m.contrib, m.contrib_total, m.joined_at FROM sect_members m JOIN characters c ON c.user_id = m.user_id
     WHERE m.sect_id = ? ORDER BY m.rnk, m.contrib_total DESC, m.joined_at`,
    [s.id],
  );
  const apps = CAN.review(rank)
    ? await q(
        `SELECT a.user_id, c.name, c.exp, a.message, a.created_at FROM sect_applications a JOIN characters c ON c.user_id = a.user_id
         WHERE a.sect_id = ? AND a.created_at > NOW() - INTERVAL ? DAY ORDER BY a.created_at`,
        [s.id, SECT.applyDays],
      )
    : [];
  const logRows = await q("SELECT id, kind, actor, target, amount, at FROM sect_log WHERE sect_id = ? ORDER BY id DESC LIMIT 50", [s.id]);
  const [day] = await q("SELECT checked, donated FROM sect_daily WHERE user_id = ? AND day = CURDATE()", [uid]);
  const bought = Object.fromEntries((await q("SELECT item_key, n FROM sect_shop_daily WHERE user_id = ? AND day = CURDATE()", [uid])).map((r) => [r.item_key, Number(r.n)]));
  const shop = (await q("SELECT item_key, cost, min_level, daily_limit FROM sect_shop WHERE on_sale = 1 ORDER BY sort, item_key"))
    .filter((r) => ITEMS[r.item_key])
    .map((r) => ({ item: r.item_key, name: ITEMS[r.item_key].name, desc: ITEMS[r.item_key].desc, kind: ITEMS[r.item_key].kind ?? "pill", cost: Number(r.cost), minLevel: Number(r.min_level), limit: Number(r.daily_limit), bought: bought[r.item_key] ?? 0 }));
  const [arr] = await q("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), array_until)) AS s FROM sects WHERE id = ?", [s.id]);
  const L = Number(s.level);
  return {
    sect: {
      ...pub(s, members.length), treasury: Number(s.treasury), nextExp: L >= SECT.maxLevel ? null : sectExpFor(L + 1, SECT.expBase), levelExp: sectExpFor(L, SECT.expBase),
      arrayLeft: Number(arr?.s ?? 0), vices: members.filter((x) => Number(x.rnk) === VICE).length, elders: members.filter((x) => Number(x.rnk) === ELDER).length,
    },
    me: { uid, rank, contrib: Number(m.contrib), contribTotal: Number(m.contrib_total), joinedAt: m.joined_at, checked: !!day?.checked, donated: Number(day?.donated ?? 0) },
    members: members.map((x) => ({
      uid: x.user_id, name: x.name, level: levelFromExp(Number(x.exp)), g: x.gender, rank: Number(x.rnk), contrib: Number(x.contrib), contribTotal: Number(x.contrib_total), joinedAt: x.joined_at, online: online(x.user_id),
    })),
    applications: apps.map((a) => ({ uid: a.user_id, name: a.name, level: levelFromExp(Number(a.exp)), message: a.message, at: a.created_at })),
    log: logRows.map((r) => ({ id: r.id, kind: r.kind, actor: r.actor, target: r.target, amount: Number(r.amount), at: r.at })),
    shop,
  };
}

/** The sects to browse: by name (part of it), highest first, a page of 20. */
export async function listSects(search, page) {
  const p = Math.max(0, Math.min(500, Number(page) | 0));
  const term = cleanText(search, 16);
  const like = "%" + term.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
  const rows = await q(
    `SELECT s.*, (SELECT COUNT(*) FROM sect_members m WHERE m.sect_id = s.id) AS members,
       (SELECT c.name FROM sect_members l JOIN characters c ON c.user_id = l.user_id WHERE l.sect_id = s.id AND l.rnk = 1 LIMIT 1) AS leader
     FROM sects s WHERE s.name LIKE ? ORDER BY s.level DESC, s.exp DESC, s.id LIMIT 21 OFFSET ?`,
    [like, p * 20],
  );
  return { page: p, more: rows.length > 20, sects: rows.slice(0, 20).map((s) => ({ ...pub(s, s.members), notice: [...s.notice].slice(0, 120).join("") })) };
}

// ---------------------------------------------------------------- founding, joining, leaving
/** Found a sect: a high enough level, the stones (spent in the same transaction), a free name. The founder leads it. */
export function create(uid, rawName, rawEmblem) {
  const name = cleanSectName(rawName);
  if (name.startsWith("!")) throw no(name.slice(1));
  const emblem = intIn(rawEmblem ?? 0, 0, EMBLEMS.length - 1, "Huy hiệu");
  return userLock.run(uid, () => tx(async (c) => {
    const [ch] = await c.query("SELECT name, exp, stones FROM characters WHERE user_id = ? FOR UPDATE", [uid]);
    if (!ch) throw no("Hãy tạo nhân vật trước.");
    if ((await c.query("SELECT 1 FROM sect_members WHERE user_id = ?", [uid])).length) throw no("Đạo hữu đã ở một tông môn rồi.", 409);
    if (levelFromExp(Number(ch.exp)) < SECT.createLevel) throw no(`Cần đạt cấp ${SECT.createLevel} mới khai lập được tông môn.`, 403);
    const wait = await waitLeft(c, uid);
    if (wait > 0) throw no(`Vừa rời tông môn: đợi thêm ${waitText(wait)} nữa.`, 403);
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [SECT.createCost, uid, SECT.createCost]);
    if (r.affectedRows !== 1) throw no(`Cần ${fmt(SECT.createCost)} linh thạch để khai lập tông môn.`, 409);
    let id;
    try {
      id = (await c.query("INSERT INTO sects (name, emblem) VALUES (?, ?)", [name, emblem])).insertId;
      await c.query("INSERT INTO sect_members (user_id, sect_id, rnk) VALUES (?, ?, ?)", [uid, id, LEADER]);
    } catch (e) {
      if (isDup(e)) throw no(/uq_sect_name/.test(e.message) ? "Tên tông môn này đã có người dùng." : "Đạo hữu đã ở một tông môn rồi.", 409);
      throw e;
    }
    await c.query("DELETE FROM sect_applications WHERE user_id = ?", [uid]);
    await log(c, id, "create", ch.name);
    return { id, character: await loadCharacter(uid, c) };
  }));
}

/**
 * Ask to join a sect. Open: in at once (the level and a free place are checked under the sect's lock). By application: an
 * application waits for an officer (at most sect.apply_max at a time per person). Closed: no.
 */
export function join(uid, rawId, rawMsg) {
  const sectId = idOf(rawId), message = cleanText(rawMsg, 80);
  return userLock.run(uid, () => tx(async (c) => {
    const [ch] = await c.query("SELECT name, exp FROM characters WHERE user_id = ?", [uid]);
    if (!ch) throw no("Hãy tạo nhân vật trước.");
    if ((await c.query("SELECT 1 FROM sect_members WHERE user_id = ?", [uid])).length) throw no("Đạo hữu đã ở một tông môn rồi.", 409);
    const wait = await waitLeft(c, uid);
    if (wait > 0) throw no(`Vừa rời tông môn: đợi thêm ${waitText(wait)} nữa mới gia nhập được.`, 403);
    const s = await lockSect(c, sectId);
    if (!s) throw no("Tông môn không tồn tại.", 404);
    if (s.join_mode === "closed") throw no(`${s.name} đang đóng cửa, không nhận đệ tử.`, 403);
    if (levelFromExp(Number(ch.exp)) < Number(s.min_level)) throw no(`${s.name} chỉ nhận đệ tử từ cấp ${s.min_level}.`, 403);
    if (s.join_mode === "open") {
      if ((await countMembers(c, s.id)) >= memberCap(Number(s.level), SECT)) throw no(`${s.name} đã đủ người.`, 409);
      try {
        await c.query("INSERT INTO sect_members (user_id, sect_id, rnk) VALUES (?, ?, ?)", [uid, s.id, OUTER]);
      } catch (e) {
        if (isDup(e)) throw no("Đạo hữu đã ở một tông môn rồi.", 409);
        throw e;
      }
      await c.query("DELETE FROM sect_applications WHERE user_id = ?", [uid]);
      await log(c, s.id, "join", ch.name);
      return { joined: true, sectId: s.id, name: s.name };
    }
    // by application: old ones lapse; at most apply_max waiting, and a sect takes at most 50 at a time
    await c.query("DELETE FROM sect_applications WHERE user_id = ? AND created_at <= NOW() - INTERVAL ? DAY", [uid, SECT.applyDays]);
    const mine = Number((await c.query("SELECT COUNT(*) AS n FROM sect_applications WHERE user_id = ? AND sect_id <> ?", [uid, s.id]))[0].n);
    if (mine >= SECT.applyMax) throw no(`Mỗi lúc chỉ gửi được ${SECT.applyMax} đơn. Hãy rút bớt đơn cũ.`, 409);
    const theirs = Number((await c.query("SELECT COUNT(*) AS n FROM sect_applications WHERE sect_id = ? AND created_at > NOW() - INTERVAL ? DAY", [s.id, SECT.applyDays]))[0].n);
    if (theirs >= 50) throw no(`${s.name} đang có quá nhiều đơn chờ, hãy quay lại sau.`, 409);
    try {
      await c.query("INSERT INTO sect_applications (sect_id, user_id, message) VALUES (?, ?, ?)", [s.id, uid, message]);
    } catch (e) {
      if (isDup(e)) throw no("Đạo hữu đã gửi đơn vào tông môn này rồi.", 409);
      throw e;
    }
    return { joined: false, sectId: s.id, name: s.name };
  }));
}

export async function cancelApplication(uid, rawId) {
  const r = await q("DELETE FROM sect_applications WHERE user_id = ? AND sect_id = ?", [uid, idOf(rawId)]);
  if (!r.affectedRows) throw no("Không có đơn này.", 404);
}

/** Take (or turn down) an application: officers from Trưởng Lão up. Taking checks the level, a free place, and that the person isn't in a sect already. */
export function review(uid, rawTarget, accept) {
  const target = idOf(rawTarget, "người chơi");
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.review(me.rnk)) throw no("Chỉ từ Trưởng Lão trở lên mới duyệt đơn.", 403);
    const [a] = await c.query("SELECT a.user_id, c.name, c.exp FROM sect_applications a JOIN characters c ON c.user_id = a.user_id WHERE a.sect_id = ? AND a.user_id = ? AND a.created_at > NOW() - INTERVAL ? DAY FOR UPDATE", [s.id, target, SECT.applyDays]);
    if (!a) throw no("Đơn này không còn nữa (đã được duyệt, đã rút hoặc hết hạn).", 404);
    if (!accept) {
      await c.query("DELETE FROM sect_applications WHERE sect_id = ? AND user_id = ?", [s.id, target]);
      return { uid: target, accepted: false, sectId: s.id };
    }
    if ((await countMembers(c, s.id)) >= memberCap(Number(s.level), SECT)) throw no("Tông môn đã đủ người. Nâng cấp tông môn để nhận thêm.", 409);
    if (levelFromExp(Number(a.exp)) < Number(s.min_level)) throw no(`${a.name} chưa đạt cấp ${s.min_level}.`, 409);
    try {
      await c.query("INSERT INTO sect_members (user_id, sect_id, rnk) VALUES (?, ?, ?)", [target, s.id, OUTER]);
    } catch (e) {
      if (isDup(e)) {
        await c.query("DELETE FROM sect_applications WHERE user_id = ?", [target]);
        throw no(`${a.name} đã vào một tông môn khác.`, 409);
      }
      throw e;
    }
    await c.query("DELETE FROM sect_applications WHERE user_id = ?", [target]);
    await log(c, s.id, "accept", me.name, a.name);
    return { uid: target, accepted: true, sectId: s.id, name: s.name };
  });
}

/** Leave: anyone but the Tông Chủ (who hands the sect on first, or disbands it). They wait sect.rejoin_hours before joining another. */
export function leave(uid) {
  return inMySect(uid, async (c, s, me) => {
    if (me.rnk === LEADER) throw no("Tông Chủ không thể rời đi: hãy truyền chức cho người khác hoặc giải tán tông môn.", 409);
    await c.query("DELETE FROM sect_members WHERE user_id = ? AND sect_id = ?", [uid, s.id]);
    await c.query("INSERT INTO sect_leave (user_id, at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE at = NOW()", [uid]);
    await log(c, s.id, "leave", me.name);
    return { sectId: s.id };
  });
}

/** Send a lower member away (from Trưởng Lão up). They wait before joining another, as if they had left. */
export function kick(uid, rawTarget) {
  const target = idOf(rawTarget, "người chơi");
  if (target === uid) throw no("Không thể tự trục xuất mình.");
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.kick(me.rnk)) throw no("Chỉ từ Trưởng Lão trở lên mới trục xuất được.", 403);
    const t = await memberRow(c, target, s.id);
    if (!t) throw no("Người này không còn ở tông môn.", 404);
    if (!over(me.rnk, Number(t.rnk))) throw no(`Chỉ trục xuất được người có chức thấp hơn mình (${t.name} là ${RANKS[t.rnk].name}).`, 403);
    await c.query("DELETE FROM sect_members WHERE user_id = ? AND sect_id = ?", [target, s.id]);
    await c.query("INSERT INTO sect_leave (user_id, at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE at = NOW()", [target]);
    await log(c, s.id, "kick", me.name, t.name);
    return { uid: target, sectId: s.id, name: s.name };
  });
}

/** Give a lower member another rank below one's own; Phó Tông Chủ and Trưởng Lão have caps (sect.vices, sect.elders). */
export function setRank(uid, rawTarget, rawRank) {
  const target = idOf(rawTarget, "người chơi"), rank = intIn(rawRank, VICE, OUTER, "Chức vị");
  if (target === uid) throw no("Không thể tự đổi chức của mình.");
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.promote(me.rnk)) throw no("Chỉ từ Trưởng Lão trở lên mới phong chức được.", 403);
    const t = await memberRow(c, target, s.id);
    if (!t) throw no("Người này không còn ở tông môn.", 404);
    if (!over(me.rnk, Number(t.rnk))) throw no(`Chỉ đổi chức được người thấp hơn mình (${t.name} là ${RANKS[t.rnk].name}).`, 403);
    if (!grantable(me.rnk).includes(rank)) throw no(`${RANKS[me.rnk].name} chỉ phong được chức thấp hơn mình.`, 403);
    if (Number(t.rnk) === rank) return { uid: target, sectId: s.id, same: true };
    const cap = rank === VICE ? SECT.vices : rank === ELDER ? SECT.elders : Infinity;
    if ((await countRank(c, s.id, rank)) >= cap) throw no(`Tông môn đã đủ ${cap} ${RANKS[rank].name}.`, 409);
    await c.query("UPDATE sect_members SET rnk = ? WHERE user_id = ? AND sect_id = ?", [rank, target, s.id]);
    await log(c, s.id, "rank", me.name, t.name, rank);
    return { uid: target, sectId: s.id };
  });
}

/** The Tông Chủ hands the sect to another member, who must be named again (confirm) to be sure. The old leader takes their rank. */
export function transfer(uid, rawTarget, confirm) {
  const target = idOf(rawTarget, "người chơi");
  if (target === uid) throw no("Đạo hữu đã là Tông Chủ.");
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.transfer(me.rnk)) throw no("Chỉ Tông Chủ mới truyền chức được.", 403);
    const t = await memberRow(c, target, s.id);
    if (!t) throw no("Người này không còn ở tông môn.", 404);
    if (String(confirm ?? "").normalize("NFC").trim() !== t.name) throw no(`Hãy gõ đúng đạo hiệu "${t.name}" để xác nhận.`);
    await c.query("UPDATE sect_members SET rnk = ? WHERE user_id = ? AND sect_id = ?", [Number(t.rnk), uid, s.id]);
    await c.query("UPDATE sect_members SET rnk = ? WHERE user_id = ? AND sect_id = ?", [LEADER, target, s.id]);
    await log(c, s.id, "transfer", me.name, t.name);
    return { uids: [uid, target], sectId: s.id };
  });
}

/** The Tông Chủ ends the sect, typing its name to be sure. The treasury goes with it; nobody has to wait to join another. */
export function disband(uid, confirm) {
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.disband(me.rnk)) throw no("Chỉ Tông Chủ mới giải tán được tông môn.", 403);
    if (String(confirm ?? "").normalize("NFC").trim() !== s.name) throw no(`Hãy gõ đúng tên "${s.name}" để xác nhận giải tán.`);
    const uids = await memberUids(c, s.id);
    // members, applications and the log go with it (ON DELETE CASCADE)
    await c.query("DELETE FROM sects WHERE id = ?", [s.id]);
    return { uids, name: s.name };
  });
}

/** The sect's rules: the notice, how people join, the lowest level to join, the emblem (from Phó Tông Chủ up). */
export function settings(uid, body) {
  const set = {};
  if (body?.notice !== undefined) set.notice = cleanText(body.notice, 200, 6);
  if (body?.joinMode !== undefined) {
    if (!Object.hasOwn(JOIN_MODES, body.joinMode)) throw no("Cách gia nhập không hợp lệ.");
    set.join_mode = body.joinMode;
  }
  if (body?.minLevel !== undefined) set.min_level = intIn(body.minLevel, 1, 1000, "Cấp tối thiểu");
  if (body?.emblem !== undefined) set.emblem = intIn(body.emblem, 0, EMBLEMS.length - 1, "Huy hiệu");
  if (!Object.keys(set).length) throw no("Không có gì để lưu.");
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.settings(me.rnk)) throw no("Chỉ Tông Chủ và Phó Tông Chủ mới sửa quy định được.", 403);
    await c.query(`UPDATE sects SET ${Object.keys(set).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(set), s.id]);
    await log(c, s.id, "settings", me.name);
    return { sectId: s.id, emblemChanged: set.emblem !== undefined && set.emblem !== Number(s.emblem) };
  });
}

// ---------------------------------------------------------------- giving and getting
/**
 * Give stones to the treasury: the giver earns cống hiến (sect.contrib_per_stone each) and the sect exp (one per stone).
 * At most sect.donate_daily a day; the request id makes a retry count once.
 */
export function donate(uid, rawAmount, rawReq) {
  const amount = intIn(rawAmount, SECT.donateMin, Math.max(SECT.donateMin, SECT.donateDaily), "Số linh thạch"), rid = reqId(rawReq);
  return userLock.run(uid, () => inMySect(uid, async (c, s, me) => {
    try {
      await c.query("INSERT INTO sect_requests (user_id, request_id, kind, amount) VALUES (?, ?, 'donate', ?)", [uid, rid, amount]);
    } catch (e) {
      if (isDup(e)) return { repeat: true, sectId: s.id, character: await loadCharacter(uid, c) };
      throw e;
    }
    await c.query("INSERT IGNORE INTO sect_daily (user_id, day) VALUES (?, CURDATE())", [uid]);
    const d = await c.query("UPDATE sect_daily SET donated = donated + ? WHERE user_id = ? AND day = CURDATE() AND donated + ? <= ?", [amount, uid, amount, SECT.donateDaily]);
    if (d.affectedRows !== 1) throw no(`Mỗi ngày quyên tối đa ${fmt(SECT.donateDaily)} linh thạch.`, 409);
    const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [amount, uid, amount]);
    if (r.affectedRows !== 1) throw no("Không đủ linh thạch.", 409);
    const contrib = Math.floor(amount * SECT.contribPerStone);
    await c.query("UPDATE sect_members SET contrib = contrib + ?, contrib_total = contrib_total + ? WHERE user_id = ?", [contrib, contrib, uid]);
    await c.query("UPDATE sects SET treasury = treasury + ? WHERE id = ?", [amount, s.id]);
    const before = Number(s.level), L = await addExp(c, s, amount);
    await autoInner(c, s, me, Number(me.contrib_total) + contrib);
    await log(c, s.id, "donate", me.name, "", amount);
    return { repeat: false, sectId: s.id, contrib, levelUp: L > before ? L : 0, character: await loadCharacter(uid, c) };
  }));
}

/** The daily check-in: once a day per person (whichever sect they are in), cống hiến for them and exp for the sect. */
export function checkin(uid) {
  return userLock.run(uid, () => inMySect(uid, async (c, s, me) => {
    await c.query("INSERT IGNORE INTO sect_daily (user_id, day) VALUES (?, CURDATE())", [uid]);
    const r = await c.query("UPDATE sect_daily SET checked = 1 WHERE user_id = ? AND day = CURDATE() AND checked = 0", [uid]);
    if (r.affectedRows !== 1) throw no("Hôm nay đạo hữu đã điểm danh rồi.", 409);
    await c.query("UPDATE sect_members SET contrib = contrib + ?, contrib_total = contrib_total + ? WHERE user_id = ?", [SECT.checkinContrib, SECT.checkinContrib, uid]);
    const before = Number(s.level), L = await addExp(c, s, SECT.checkinExp);
    await autoInner(c, s, me, Number(me.contrib_total) + SECT.checkinContrib);
    return { sectId: s.id, contrib: SECT.checkinContrib, levelUp: L > before ? L : 0 };
  }));
}

/** Buy from the treasure house with cống hiến: the sect's level, the item's daily limit and the cống hiến all checked in one go. */
export function shopBuy(uid, rawItem, rawReq) {
  const item = String(rawItem ?? ""), rid = reqId(rawReq);
  if (!/^[a-z0-9_]{1,32}$/.test(item) || !ITEMS[item]) throw no("Vật phẩm không tồn tại.");
  return userLock.run(uid, () => inMySect(uid, async (c, s, me) => {
    const [row] = await c.query("SELECT cost, min_level, daily_limit FROM sect_shop WHERE item_key = ? AND on_sale = 1", [item]);
    if (!row) throw no("Bảo khố không có món này.", 404);
    if (Number(s.level) < Number(row.min_level)) throw no(`Tông môn cần đạt cấp ${row.min_level} mới mở được món này.`, 403);
    try {
      await c.query("INSERT INTO sect_requests (user_id, request_id, kind, amount) VALUES (?, ?, 'shop', ?)", [uid, rid, Number(row.cost)]);
    } catch (e) {
      if (isDup(e)) return { repeat: true, sectId: s.id };
      throw e;
    }
    await c.query("INSERT IGNORE INTO sect_shop_daily (user_id, item_key, day) VALUES (?, ?, CURDATE())", [uid, item]);
    const d = await c.query("UPDATE sect_shop_daily SET n = n + 1 WHERE user_id = ? AND item_key = ? AND day = CURDATE() AND n < ?", [uid, item, Number(row.daily_limit)]);
    if (d.affectedRows !== 1) throw no(`Món này mỗi ngày đổi tối đa ${row.daily_limit} lần.`, 409);
    const r = await c.query("UPDATE sect_members SET contrib = contrib - ? WHERE user_id = ? AND contrib >= ?", [Number(row.cost), uid, Number(row.cost)]);
    if (r.affectedRows !== 1) throw no("Không đủ điểm cống hiến.", 409);
    await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE qty = qty + 1", [uid, item]);
    return { repeat: false, sectId: s.id, item, name: ITEMS[item].name };
  }));
}

/** Raise the Hộ Sơn Đại Trận (from Phó Tông Chủ up): the treasury pays, every member hits harder in the open world for a while. Not while it stands. */
export function raiseArray(uid) {
  return inMySect(uid, async (c, s, me) => {
    if (!CAN.array(me.rnk)) throw no("Chỉ Tông Chủ và Phó Tông Chủ mới khai mở đại trận được.", 403);
    if (Number(s.level) < SECT.arrayLevel) throw no(`Tông môn cần đạt cấp ${SECT.arrayLevel} mới khai mở được Hộ Sơn Đại Trận.`, 403);
    const r = await c.query(
      "UPDATE sects SET treasury = treasury - ?, array_until = NOW() + INTERVAL ? MINUTE WHERE id = ? AND treasury >= ? AND (array_until IS NULL OR array_until <= NOW())",
      [SECT.arrayCost, Math.round(SECT.arrayMinutes), s.id, SECT.arrayCost],
    );
    if (r.affectedRows !== 1) {
      const [now] = await c.query("SELECT treasury, array_until > NOW() AS up FROM sects WHERE id = ?", [s.id]);
      throw no(now?.up ? "Hộ Sơn Đại Trận đang vận hành." : `Ngân khố cần ${fmt(SECT.arrayCost)} linh thạch.`, 409);
    }
    await log(c, s.id, "array", me.name);
    return { sectId: s.id, uids: await memberUids(c, s.id) };
  });
}

/** Every member of a sect (to tell the ones online). */
export const membersOf = (sectId) => q("SELECT user_id FROM sect_members WHERE sect_id = ?", [sectId]).then((r) => r.map((x) => x.user_id));

// ---------------------------------------------------------------- the admin site
export async function adminList() {
  return (await q(
    `SELECT s.*, (SELECT COUNT(*) FROM sect_members m WHERE m.sect_id = s.id) AS members,
       (SELECT c.name FROM sect_members l JOIN characters c ON c.user_id = l.user_id WHERE l.sect_id = s.id AND l.rnk = 1 LIMIT 1) AS leader
     FROM sects s ORDER BY s.level DESC, s.exp DESC, s.id`,
  )).map((s) => ({ ...pub(s, s.members), treasury: Number(s.treasury), arrayUntil: s.array_until }));
}
export async function adminOne(id) {
  id = idOf(id);
  const [s] = await q("SELECT * FROM sects WHERE id = ?", [id]);
  if (!s) throw no("Không có tông môn này.", 404);
  const members = await q("SELECT m.user_id, c.name, c.exp, m.rnk, m.contrib, m.contrib_total, m.joined_at FROM sect_members m JOIN characters c ON c.user_id = m.user_id WHERE m.sect_id = ? ORDER BY m.rnk, m.contrib_total DESC", [id]);
  const logRows = await q("SELECT kind, actor, target, amount, at FROM sect_log WHERE sect_id = ? ORDER BY id DESC LIMIT 100", [id]);
  return {
    ...pub(s, members.length), treasury: Number(s.treasury), arrayUntil: s.array_until,
    members: members.map((m) => ({ uid: m.user_id, name: m.name, level: levelFromExp(Number(m.exp)), rank: Number(m.rnk), contrib: Number(m.contrib), contribTotal: Number(m.contrib_total), joinedAt: m.joined_at })),
    log: logRows.map((r) => ({ ...r, amount: Number(r.amount) })),
  };
}
/** An admin's edit: name, notice, join mode, lowest level, emblem, level, exp, treasury. Returns the members to tell. */
export function adminEdit(id, body) {
  id = idOf(id);
  const set = {};
  if (body?.name !== undefined) {
    const n = cleanText(body.name, 16);
    if (!SECT_NAME_OK(n)) throw no("Tên tông môn dài 2-16 ký tự, chỉ gồm chữ, số và khoảng trắng.");
    set.name = n;
  }
  if (body?.notice !== undefined) set.notice = cleanText(body.notice, 200, 6);
  if (body?.joinMode !== undefined) {
    if (!Object.hasOwn(JOIN_MODES, body.joinMode)) throw no("Cách gia nhập không hợp lệ.");
    set.join_mode = body.joinMode;
  }
  if (body?.minLevel !== undefined) set.min_level = intIn(body.minLevel, 1, 1000, "Cấp tối thiểu");
  if (body?.emblem !== undefined) set.emblem = intIn(body.emblem, 0, EMBLEMS.length - 1, "Huy hiệu");
  if (body?.level !== undefined) set.level = intIn(body.level, 1, SECT.maxLevel, "Cấp tông môn");
  if (body?.exp !== undefined) set.exp = intIn(body.exp, 0, 1e12, "Kinh nghiệm");
  if (body?.treasury !== undefined) set.treasury = intIn(body.treasury, 0, 1e12, "Ngân khố");
  if (body?.endArray === true) set.array_until = null;
  if (!Object.keys(set).length) throw no("Không có gì để lưu.");
  return tx(async (c) => {
    const s = await lockSect(c, id);
    if (!s) throw no("Không có tông môn này.", 404);
    try {
      await c.query(`UPDATE sects SET ${Object.keys(set).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(set), id]);
    } catch (e) {
      if (isDup(e)) throw no("Tên tông môn này đã có.", 409);
      throw e;
    }
    await log(c, id, "admin", "", Object.keys(set).join(", "));
    return { before: s, set, uids: await memberUids(c, id) };
  });
}
const SECT_NAME_OK = (n) => /^[\p{L}\p{N} ]{2,16}$/u.test(n);
/** An admin removes a member (no waiting afterwards), or sets their rank, Tông Chủ included (the old one becomes a Phó). */
export function adminMember(id, rawUid, action, rawRank) {
  id = idOf(id);
  const target = idOf(rawUid, "người chơi");
  return tx(async (c) => {
    const s = await lockSect(c, id);
    if (!s) throw no("Không có tông môn này.", 404);
    const t = await memberRow(c, target, id);
    if (!t) throw no("Người này không ở tông môn.", 404);
    if (action === "remove") {
      if (Number(t.rnk) === LEADER && (await countMembers(c, id)) > 1) throw no("Hãy chọn Tông Chủ mới trước khi đưa Tông Chủ ra.", 409);
      await c.query("DELETE FROM sect_members WHERE user_id = ? AND sect_id = ?", [target, id]);
      await log(c, id, "admin", "", `đưa ${t.name} ra khỏi tông môn`);
      if (!(await countMembers(c, id))) await c.query("DELETE FROM sects WHERE id = ?", [id]);
      return { uids: [target, ...(await memberUids(c, id))], name: t.name };
    }
    if (action !== "rank") throw no("Không rõ thao tác.");
    const rank = intIn(rawRank, LEADER, OUTER, "Chức vị");
    if (rank === LEADER) await c.query("UPDATE sect_members SET rnk = ? WHERE sect_id = ? AND rnk = ?", [VICE, id, LEADER]);
    else if (Number(t.rnk) === LEADER) throw no("Muốn đổi chức Tông Chủ, hãy phong người khác làm Tông Chủ.", 409);
    await c.query("UPDATE sect_members SET rnk = ? WHERE user_id = ? AND sect_id = ?", [rank, target, id]);
    await log(c, id, "admin", "", `${t.name} làm ${RANKS[rank].name}`);
    return { uids: await memberUids(c, id), name: t.name };
  });
}
export function adminDisband(id) {
  id = idOf(id);
  return tx(async (c) => {
    const s = await lockSect(c, id);
    if (!s) throw no("Không có tông môn này.", 404);
    const uids = await memberUids(c, id);
    await c.query("DELETE FROM sects WHERE id = ?", [id]);
    return { uids, name: s.name };
  });
}
