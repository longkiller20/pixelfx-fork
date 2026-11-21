// Chính Tà Phân Tranh on the server (shared/chinh-ta.js has the rules and numbers). Two halves:
//  - the database (signing up, the side, the điểm Chính Tà, the Tiệm, the record of battles), every step checked here;
//  - the War: the one battle running now, in memory, on the game's own thread (the Universe's), on its own map.
// Against races:
//  1. One process runs the game (the Universe), so the War is the only one starting, scoring and ending battles; a battle
//     is a ct_matches row whose slot (its start, ms) is unique: a second start of the same one (a timer, a restart, the
//     admin's button) fails on that key and does nothing.
//  2. Signing up and picking the teams for a slot run one after another (slotLock): nobody slips in while the teams are
//     read, and nobody signs for a battle that has begun (its ct_matches row is checked under the lock).
//  3. The side changes only with the character row locked (FOR UPDATE), while not signed up and not fighting; signing up
//     locks the same row: the two never cross. The teams are picked only from those whose side is still the one they signed for.
//  4. Points move only by conditional updates (ct_points - n WHERE ct_points >= n); a purchase or a change of side carries
//     a request id: sent twice, it counts once.
//  5. The rewards are written in one transaction that first moves the battle from running to done (WHERE state = 'running'):
//     whatever calls it twice, the points are given once; each fighter's row has (match, user) as its key.
import { tx, isDup, q } from "./db.js";
import { KeyedLock, userLock } from "./lock.js";
import { GameError } from "./store.js";
import { ITEMS, levelFromExp } from "../shared/balance.js";
import { CT, FACTIONS, factionOk, other, nextStart, regCloses, startText, pickTeams, pointsFor, POINTS, WAR_KEY } from "../shared/chinh-ta.js";

const no = (m, status = 400) => new GameError(m, status);
const one = async (c, sql, args) => (await c.query(sql, args))[0] ?? null;
const reqId = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw no("Thiếu mã giao dịch.");
  return v.toLowerCase();
};
async function once(c, uid, rid) {
  try {
    await c.query("INSERT INTO ct_requests (user_id, request_id) VALUES (?, ?)", [uid, rid]);
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}
const slotLock = new KeyedLock();
// the slots whose battle has started (a ct_matches row): one started early by the admin is not offered again
const used = new Set();
/** The next battle one can sign up for: the next slot on the schedule whose battle has not been started yet. */
export function upcoming(now = Date.now()) {
  let s = nextStart(now);
  for (let i = 0; s && used.has(s) && i < 2000; i++) s = nextStart(s);
  return s && !used.has(s) ? s : null;
}
const fmt = (n) => Number(n).toLocaleString("vi-VN");
const fname = (f) => FACTIONS[f]?.name ?? "?";
/** How long until (s): "3 ngày", "5 giờ", "12 phút". */
const wait = (s) => (s >= 86400 ? `${Math.ceil(s / 86400)} ngày` : s >= 3600 ? `${Math.ceil(s / 3600)} giờ` : `${Math.max(1, Math.ceil(s / 60))} phút`);

// ---------------------------------------------------------------- the panel
/**
 * What the Chính Tà panel shows one person: their side and points, the next battle (when, registration open or closed,
 * whether they are signed, how many have signed for each side), the battle on now, their last battles, the Tiệm and the
 * best by điểm Chính Tà. war: the War (for the battle now).
 */
export async function view(uid, war = null) {
  const ch = (await q("SELECT name, faction, ct_points, exp, faction_at, GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), faction_at + INTERVAL ? SECOND)) AS wait FROM characters WHERE user_id = ?", [Math.round(CT.changeDays * 86400), uid]))[0];
  if (!ch) throw no("Đạo hữu chưa tạo nhân vật.", 404);
  const now = Date.now(), slot = upcoming(now);
  const [signed] = slot ? await q("SELECT faction FROM ct_signups WHERE slot = ? AND user_id = ?", [slot, uid]) : [];
  const counts = { c: 0, t: 0 };
  if (slot) for (const r of await q("SELECT faction, COUNT(*) AS n FROM ct_signups WHERE slot = ? GROUP BY faction", [slot])) counts[r.faction] = Number(r.n);
  const history = (await q(
    `SELECT m.id, m.slot, m.state, m.winner, m.kills_c, m.kills_t, p.faction, p.kills, p.deaths, p.assists, p.result, p.mvp, p.points
     FROM ct_players p JOIN ct_matches m ON m.id = p.match_id WHERE p.user_id = ? ORDER BY m.id DESC LIMIT 10`, [uid],
  )).map((r) => ({
    id: r.id, at: Number(r.slot), winner: r.winner, kills: { c: r.kills_c, t: r.kills_t }, faction: r.faction, k: r.kills, d: r.deaths, a: r.assists,
    result: r.result, mvp: !!r.mvp, points: r.points,
  }));
  const top = (await q("SELECT name, faction, ct_points AS v, exp FROM characters WHERE ct_points > 0 ORDER BY ct_points DESC, exp DESC LIMIT 10")).map((r) => ({ name: r.name, faction: r.faction, v: Number(r.v), level: levelFromExp(Number(r.exp)) }));
  const level = levelFromExp(Number(ch.exp));
  return {
    faction: factionOk(ch.faction) ? ch.faction : null, points: Number(ch.ct_points), level,
    // the first pick is free and any time; after that changeCost stones, once every changeDays
    change: { cost: CT.changeCost, days: CT.changeDays, wait: ch.faction_at ? Number(ch.wait) : 0, first: !factionOk(ch.faction) },
    next: slot ? { at: slot, text: startText(slot), closes: regCloses(slot), open: now < regCloses(slot), signed: !!signed, counts } : null,
    rules: {
      times: CT.times, tz: CT.tz, team: CT.team, minSide: CT.minSide, maxGap: CT.maxGap, level: CT.level, minutes: CT.minutes, respawn: CT.respawn,
      win: CT.win, lose: CT.lose, draw: CT.draw, killPts: CT.killPts, killCap: CT.killCap, mvp: CT.mvp, minStay: CT.minStay,
    },
    now: war?.summary(uid) ?? null,
    history, top, shop: await shopList(),
  };
}

// ---------------------------------------------------------------- signing up
/** Sign up for the next battle (on the side one has now). inMatch: they are on the field (can't sign for the next yet). */
export async function register(uid) {
  const slot = upcoming();
  if (!slot) throw no("Chính Tà Phân Tranh chưa có lịch, hãy chờ thông báo.");
  return slotLock.run(slot, () => userLock.run(uid, () => tx(async (c) => {
    if (Date.now() >= regCloses(slot)) throw no(`Đã đóng đăng ký trận ${startText(slot)}.`);
    if (await one(c, "SELECT 1 AS x FROM ct_matches WHERE slot = ?", [slot])) throw no("Trận này đã bắt đầu.");
    const ch = await one(c, "SELECT faction, exp FROM characters WHERE user_id = ? FOR UPDATE", [uid]);
    if (!ch) throw no("Đạo hữu chưa tạo nhân vật.", 404);
    if (!factionOk(ch.faction)) throw no("Hãy chọn Chính Phái hoặc Tà Phái trước.");
    const L = levelFromExp(Number(ch.exp));
    if (L < CT.level) throw no(`Cần đạt cấp ${CT.level} mới đăng ký được (đạo hữu đang cấp ${L}).`);
    const r = await c.query("INSERT IGNORE INTO ct_signups (slot, user_id, faction) VALUES (?, ?, ?)", [slot, uid, ch.faction]);
    return { slot, faction: ch.faction, again: !r.affectedRows };
  })));
}
/** Take one's name off the next battle, while registration is open. */
export async function unregister(uid) {
  const slot = upcoming();
  if (!slot) return { slot: null };
  return slotLock.run(slot, () => userLock.run(uid, () => tx(async (c) => {
    if (Date.now() >= regCloses(slot) || (await one(c, "SELECT 1 AS x FROM ct_matches WHERE slot = ?", [slot]))) throw no("Đã đóng đăng ký, không hủy được nữa.");
    await c.query("DELETE FROM ct_signups WHERE slot = ? AND user_id = ?", [slot, uid]);
    return { slot };
  })));
}

/**
 * Pick (or change) one's side. The first pick (a character made before sides existed) is free; changing costs
 * CT.changeCost stones and may be done once every CT.changeDays days, not while signed up or on the field (fighting: the War says).
 */
export async function setFaction(uid, f, requestId, fighting = false) {
  if (!factionOk(f)) throw no("Phe không hợp lệ.");
  const rid = reqId(requestId);
  return userLock.run(uid, () => tx(async (c) => {
    if (!(await once(c, uid, rid))) return { repeat: true };
    const ch = await one(c, `SELECT faction, stones, GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), faction_at + INTERVAL ? SECOND)) AS wait FROM characters WHERE user_id = ? FOR UPDATE`, [Math.round(CT.changeDays * 86400), uid]);
    if (!ch) throw no("Đạo hữu chưa tạo nhân vật.", 404);
    if (ch.faction === f) throw no(`Đạo hữu đã ở ${fname(f)}.`);
    const first = !factionOk(ch.faction);
    if (!first) {
      if (fighting) throw no("Đang ở chiến trường, không đổi phe được.");
      const slot = upcoming();
      if (slot && (await one(c, "SELECT 1 AS x FROM ct_signups WHERE slot = ? AND user_id = ?", [slot, uid]))) throw no("Đạo hữu đang đăng ký trận sắp tới: hủy đăng ký trước khi đổi phe.");
      if (Number(ch.wait) > 0) throw no(`Vừa đổi phe: còn ${wait(Number(ch.wait))} nữa mới đổi lại được.`);
      if (CT.changeCost > 0) {
        const r = await c.query("UPDATE characters SET stones = stones - ? WHERE user_id = ? AND stones >= ?", [CT.changeCost, uid, CT.changeCost]);
        if (!r.affectedRows) throw no(`Đổi phe cần ${fmt(CT.changeCost)} linh thạch.`);
      }
    }
    // the first pick sets no wait: one may still change their mind once, paying, straight away
    await c.query(`UPDATE characters SET faction = ?, faction_at = ${first ? "NULL" : "NOW()"} WHERE user_id = ?`, [f, uid]);
    return { faction: f, first, cost: first ? 0 : CT.changeCost };
  }));
}

// ---------------------------------------------------------------- the Tiệm Chính Tà
/** What the Tiệm sells (on sale, with a known item), cheapest first. */
export async function shopList(all = false) {
  const rows = await q(`SELECT item, price, on_sale, sort FROM ct_shop ${all ? "" : "WHERE on_sale = 1"} ORDER BY sort, price, item`);
  return rows.filter((r) => all || ITEMS[r.item]).map((r) => ({ item: r.item, name: ITEMS[r.item]?.name ?? r.item, desc: ITEMS[r.item]?.desc ?? "", price: Number(r.price), onSale: !!r.on_sale, sort: r.sort }));
}
/** Buy qty of an item from the Tiệm with điểm Chính Tà. */
export async function buy(uid, item, qty, requestId) {
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1 || n > 99) throw no("Số lượng 1-99.");
  if (typeof item !== "string" || !ITEMS[item]) throw no("Không có món này.");
  const rid = reqId(requestId);
  return userLock.run(uid, () => tx(async (c) => {
    if (!(await once(c, uid, rid))) return { repeat: true };
    const it = await one(c, "SELECT price FROM ct_shop WHERE item = ? AND on_sale = 1", [item]);
    if (!it) throw no("Tiệm Chính Tà không bán món này.");
    const cost = Number(it.price) * n;
    const r = await c.query("UPDATE characters SET ct_points = ct_points - ? WHERE user_id = ? AND ct_points >= ?", [cost, uid, cost]);
    if (!r.affectedRows) throw no(`Cần ${fmt(cost)} điểm ${POINTS}.`);
    await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [uid, item, n]);
    return { item, qty: n, cost };
  }));
}

// ---------------------------------------------------------------- the admin
export async function adminView(war) {
  const slot = upcoming();
  const signups = slot ? await q(
    `SELECT s.user_id AS uid, s.faction, s.created_at AS at, c.name, c.exp, c.rank_points AS \`rank\`, c.faction AS cur
     FROM ct_signups s JOIN characters c ON c.user_id = s.user_id WHERE s.slot = ? ORDER BY s.created_at`, [slot]) : [];
  const matches = await q("SELECT id, slot, state, started_at, ended_at, size_c, size_t, kills_c, kills_t, winner, note FROM ct_matches ORDER BY id DESC LIMIT 30");
  const counts = Object.fromEntries((await q("SELECT faction, COUNT(*) AS n FROM characters GROUP BY faction")).map((r) => [r.faction ?? "-", Number(r.n)]));
  return {
    next: slot ? { at: slot, text: startText(slot), closes: regCloses(slot) } : null, rules: { ...CT },
    signups: signups.map((r) => ({ uid: r.uid, name: r.name, faction: r.faction, cur: r.cur, level: levelFromExp(Number(r.exp)), rank: Number(r.rank), at: r.at })),
    matches: matches.map((m) => ({ ...m, slot: Number(m.slot), text: startText(Number(m.slot)) })),
    now: war?.adminSummary() ?? null, sides: counts, shop: await shopList(true),
  };
}
/** A player's side, points and last battles, for the admin's player page. */
export async function adminPlayer(uid) {
  const [c] = await q("SELECT faction, ct_points, faction_at FROM characters WHERE user_id = ?", [uid]);
  if (!c) return null;
  const last = await q(
    `SELECT m.id, m.slot, m.winner, m.kills_c, m.kills_t, p.faction, p.kills, p.deaths, p.assists, p.result, p.mvp, p.points
     FROM ct_players p JOIN ct_matches m ON m.id = p.match_id WHERE p.user_id = ? ORDER BY m.id DESC LIMIT 10`, [uid]);
  return { faction: c.faction, points: Number(c.ct_points), changedAt: c.faction_at, last: last.map((r) => ({ ...r, slot: Number(r.slot), text: startText(Number(r.slot)) })) };
}
export async function matchPlayers(id) {
  return (await q(
    `SELECT p.user_id AS uid, c.name, p.faction, p.kills, p.deaths, p.assists, p.seconds, p.result, p.mvp, p.points
     FROM ct_players p LEFT JOIN characters c ON c.user_id = p.user_id WHERE p.match_id = ? ORDER BY p.faction, p.kills DESC`, [id]));
}
/** Add (or take: negative) điểm Chính Tà, never below 0. */
export async function adminPoints(uid, delta) {
  const d = Number(delta);
  if (!Number.isInteger(d) || Math.abs(d) > 1e8) throw no("Số điểm không hợp lệ.");
  await q("UPDATE characters SET ct_points = GREATEST(0, CAST(ct_points AS SIGNED) + ?) WHERE user_id = ?", [d, uid]);
  return Number((await q("SELECT ct_points FROM characters WHERE user_id = ?", [uid]))[0]?.ct_points ?? 0);
}
/** Set someone's side (no cost, no wait); also takes them off the next battle's list (they signed for the other side). */
export async function adminFaction(uid, f) {
  if (!factionOk(f)) throw no("Phe không hợp lệ.");
  await q("UPDATE characters SET faction = ? WHERE user_id = ?", [f, uid]);
  const slot = upcoming();
  if (slot) await q("DELETE FROM ct_signups WHERE slot = ? AND user_id = ? AND faction <> ?", [slot, uid, f]);
}
export async function adminShop(item, price, onSale, sort, remove = false) {
  if (typeof item !== "string" || !ITEMS[item]) throw no("Không có vật phẩm này.");
  if (remove) return void (await q("DELETE FROM ct_shop WHERE item = ?", [item]));
  const p = Number(price);
  if (!Number.isInteger(p) || p < 1 || p > 1e8) throw no("Giá 1-100.000.000 điểm.");
  await q("INSERT INTO ct_shop (item, price, on_sale, sort) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), on_sale = VALUES(on_sale), sort = VALUES(sort)", [item, p, onSale ? 1 : 0, Number(sort) | 0]);
}

// ---------------------------------------------------------------- the War: the battle running now
// Seconds on the field after a battle ends, the result on screen, before everyone is taken back (getting ready before
// it starts, the camps closed: the setting chinhta.prep).
export const AFTER = 12;
// a hit counts for an assist (hỗ trợ) if the one hit falls within this many seconds of it
const ASSIST = 10;
// a kill streak worth announcing (liên trảm)
const STREAKS = { 3: "Tam Liên Trảm", 5: "Ngũ Liên Trảm", 8: "Bát Phương Sát Thần", 10: "Thập Diện Mai Phục", 15: "Vô Song", 20: "Sát Thần Giáng Thế" };

/**
 * The battles: the schedule (reminders, the start), picking the teams, bringing them onto the field, the score, people
 * leaving and the dự bị stepping in, the end, the rewards and taking everyone back. u: the Universe; make(): a new
 * world for the field (a World on WAR_MAP that knows this War).
 */
export class War {
  constructor(u, make) {
    this.u = u;
    this.make = make;
    this.m = null; // the battle now
    this.last = Date.now();
    this.said = new Set();
    this.busy = false;
    // a battle the server was running when it stopped can't go on: no rewards, a note (the roster was in memory)
    q("UPDATE ct_matches SET state = 'cancelled', ended_at = NOW(), note = 'Máy chủ khởi động lại giữa trận' WHERE state = 'running'").catch((e) => console.error("ct boot", e.message));
    q("SELECT slot FROM ct_matches WHERE slot > ?", [Date.now() - 86400_000]).then((rows) => rows.forEach((r) => used.add(Number(r.slot))), (e) => console.error("ct boot", e.message));
    this.timer = setInterval(() => this.tick().catch((e) => console.error("ct tick", e)), 1000);
    this.timer.unref?.();
  }
  stop() {
    clearInterval(this.timer);
  }

  // ---- whom a player is to the battle
  /** The fighter record of uid in the battle now (also a dự bị who was called in), or null. */
  rec(uid) {
    return this.m?.roster.get(uid) ?? null;
  }
  /** Whether uid has a place on the field now (picked, not left, not replaced). */
  fighting(uid) {
    const r = this.rec(uid);
    return !!(r && !r.left && this.m.phase !== "over");
  }
  get world() {
    return this.m?.world ?? null;
  }
  /** Fighting time so far (s), from the start of the fight to now or its end. */
  fought(now = Date.now()) {
    const m = this.m;
    return m && now > m.fightAt ? Math.min(now, m.ends) - m.fightAt : 0;
  }

  // ---- the schedule: every second
  async tick() {
    if (this.busy) return;
    const now = Date.now();
    if (this.m) return this.step(now);
    const due = nextStart(this.last), next = upcoming(now);
    this.last = now;
    if (due && due <= now && !used.has(due)) return this.start(due);
    if (!next) return;
    // reminders to the whole server, then to those signed up
    const left = next - now;
    for (const [mark, ms, text] of [
      ["30m", 30 * 60_000, `⚔ Chính Tà Phân Tranh lúc ${startText(next)}: còn 30 phút. Mở ▦ Thêm → Chính Tà để đăng ký!`],
      ["10m", 10 * 60_000, `⚔ Chính Tà Phân Tranh sau 10 phút nữa. Đăng ký ở ▦ Thêm → Chính Tà!`],
      ["close", next - regCloses(next) + 60_000, `⚔ Còn 1 phút là đóng đăng ký Chính Tà Phân Tranh!`],
    ]) {
      const key = `${next}:${mark}`;
      if (left <= ms && left > ms - 5000 && !this.said.has(key)) {
        this.said.add(key);
        this.u.feed(text);
      }
    }
    const key = `${next}:soon`;
    if (left <= 10_000 && !this.said.has(key)) {
      this.said.add(key);
      for (const r of await q("SELECT user_id FROM ct_signups WHERE slot = ?", [next]))
        this.u.toastUser(r.user_id, "⚔ 10 giây nữa Chính Tà Phân Tranh bắt đầu: chuẩn bị được đưa vào chiến trường!", true);
    }
    if (this.said.size > 50) this.said = new Set([...this.said].slice(-20));
  }

  /**
   * Start the battle of `slot`: write it (once), pick the teams from those signed up who can go now, open the field and
   * bring them in. Returns why not, or { id, c, t }.
   */
  async start(slot, by = "lịch") {
    if (this.m || this.busy) return { error: "Đang có trận Chính Tà." };
    this.busy = true;
    try {
      return await slotLock.run(slot, async () => {
        let id;
        used.add(slot);
        try {
          id = (await q("INSERT INTO ct_matches (slot, note) VALUES (?, ?)", [slot, by === "lịch" ? "" : `Bắt đầu bởi ${by}`])).insertId;
        } catch (e) {
          if (isDup(e)) return { error: "Trận này đã chạy rồi." };
          throw e;
        }
        const rows = await q(
          `SELECT s.user_id AS uid, s.faction, s.created_at AS at, c.name, c.exp, c.rank_points AS \`rank\`, c.faction AS cur
           FROM ct_signups s JOIN characters c ON c.user_id = s.user_id WHERE s.slot = ?`, [slot]);
        const online = this.u.players, why = new Map();
        const list = [];
        for (const r of rows) {
          const level = levelFromExp(Number(r.exp)), p = online.get(r.uid);
          if (r.cur !== r.faction) why.set(r.uid, "đã đổi phe");
          else if (level < CT.level) why.set(r.uid, `chưa đủ cấp ${CT.level}`);
          else if (!p || p.gone) why.set(r.uid, "không trực tuyến");
          else list.push({ uid: r.uid, name: r.name, faction: r.faction, level, exp: Number(r.exp), rank: Number(r.rank), at: +new Date(r.at) });
        }
        const pick = pickTeams(list);
        if (!pick.ok) {
          const note = `Không đủ người: Chính ${pick.c.length}, Tà ${pick.t.length} (cần mỗi phe ${CT.minSide})`;
          await q("UPDATE ct_matches SET state = 'cancelled', ended_at = NOW(), note = ? WHERE id = ?", [note, id]);
          this.u.feed(`⚔ Chính Tà Phân Tranh ${startText(slot)} bị hủy: mỗi phe cần ít nhất ${CT.minSide} người trực tuyến đủ điều kiện (Chính ${pick.c.length}, Tà ${pick.t.length}).`);
          for (const r of rows) this.u.toastUser(r.uid, `Chính Tà Phân Tranh bị hủy vì không đủ người. Hẹn trận sau!`);
          return { error: note, cancelled: true };
        }
        const now = Date.now(), world = this.make();
        this.m = {
          id, slot, world, phase: "prep", startedAt: now, fightAt: now + CT.prep * 1000, ends: now + CT.prep * 1000 + CT.minutes * 60_000,
          roster: new Map(), bench: { c: pick.bench.c, t: pick.bench.t }, kills: { c: 0, t: 0 }, first: false, endAt: 0, minutes: CT.minutes,
        };
        world.war = this;
        this.u.worlds.set(WAR_KEY, world);
        await q("UPDATE ct_matches SET size_c = ?, size_t = ? WHERE id = ?", [pick.c.length, pick.t.length, id]);
        for (const x of [...pick.c, ...pick.t]) this.enlist(x);
        pick.bench.c.forEach((x, i) => this.u.toastUser(x.uid, `Chính Phái đã đủ người: đạo hữu là dự bị số ${i + 1}, sẽ được gọi vào khi có người rời trận.`));
        pick.bench.t.forEach((x, i) => this.u.toastUser(x.uid, `Tà Phái đã đủ người: đạo hữu là dự bị số ${i + 1}, sẽ được gọi vào khi có người rời trận.`));
        for (const [uid, w] of why) this.u.toastUser(uid, `Không vào được Chính Tà Phân Tranh: ${w}.`);
        this.u.feed(`⚔ Chính Tà Phân Tranh bắt đầu! Chính Phái ${pick.c.length} người đối đầu Tà Phái ${pick.t.length} người, trong ${CT.minutes} phút.`);
        return { id, c: pick.c.length, t: pick.t.length };
      });
    } finally {
      this.busy = false;
    }
  }

  /** Give x ({ uid, name, faction }) a place on the field and bring them in. */
  enlist(x, sub = false) {
    const r = { uid: x.uid, name: x.name, faction: x.faction, kills: 0, deaths: 0, assists: 0, streak: 0, best: 0, ms: 0, left: false, away: null, sub, from: null, pulling: false, seen: false };
    this.m.roster.set(x.uid, r);
    this.pull(r);
    return r;
  }
  /** Bring a fighter onto the field from wherever they are (if they are online and not already there). */
  pull(r) {
    const p = this.u.players.get(r.uid), w = this.world;
    if (!p || p.gone || !w || r.left || r.pulling || p.world === w) return;
    if (p.warping) return; // on the way somewhere: tried again next second
    r.pulling = true;
    if (p.fish) p.world.fishEnd(p, "move");
    r.from ??= { key: p.world.key, at: { x: p.x, y: p.y } };
    this.u.warpTo(p, WAR_KEY, () => w.spawnPoint(p)).catch((e) => console.error("ct pull", e.message)).finally(() => (r.pulling = false));
  }
  /** Someone came onto the field (pulled, or logging in again): alive, full, on their side's camp. */
  onEnter(p) {
    const r = this.rec(p.userId);
    if (!r) return;
    r.seen = true;
    r.away = null;
    p.dead = false;
    p.hpFrac = 1;
    p.hitBy = new Map();
    p.protectUntil = this.world.t + CT.protect;
    this.sendState(p);
  }
  /** Someone's socket closed on the field: their place is kept for CT.away seconds. */
  onGone(p) {
    const r = this.rec(p.userId);
    if (r && !r.left) r.away = Date.now();
  }

  // ---- the fight
  /** victim fell to killer (a player of the other side, or null). */
  onKill(victim, killer) {
    const m = this.m;
    if (!m || m.phase !== "fight") return;
    const rv = this.rec(victim.userId), rk = killer ? this.rec(killer.userId) : null, w = this.world;
    if (rv) {
      rv.deaths++;
      if (rv.streak >= 3 && rk) w.feed(`⚔ ${rk.name} chấm dứt chuỗi ${rv.streak} lần hạ gục liên tiếp của ${rv.name}!`);
      rv.streak = 0;
    }
    if (!rk || rk.faction === rv?.faction) return this.push();
    rk.kills++;
    rk.streak++;
    rk.best = Math.max(rk.best, rk.streak);
    m.kills[rk.faction]++;
    // whoever of the killer's side hit the victim lately helped
    for (const [uid, t] of victim.hitBy ?? []) {
      const ra = this.rec(uid);
      if (ra && uid !== rk.uid && ra.faction === rk.faction && w.t - t <= ASSIST) ra.assists++;
    }
    victim.hitBy = new Map();
    const tag = (r) => `${r.name} (${FACTIONS[r.faction].short})`;
    if (!m.first) {
      m.first = true;
      w.feed(`🩸 Nhất Huyết! ${tag(rk)} hạ gục ${rv ? tag(rv) : "đối thủ"} đầu tiên.`);
      w.ev({ e: "ctfx", k: "first", id: killer.id });
    } else w.feed(`⚔ ${tag(rk)} hạ gục ${rv ? tag(rv) : "đối thủ"}.`);
    if (STREAKS[rk.streak]) {
      w.feed(`🔥 ${rk.name}: ${STREAKS[rk.streak]}! (${rk.streak} lần hạ gục liên tiếp)`);
      w.ev({ e: "ctfx", k: "streak", id: killer.id, n: rk.streak });
    }
    this.push();
  }

  /** The score bar to everyone on the field. */
  push() {
    const w = this.world, m = this.m;
    if (!w) return;
    const now = Date.now();
    for (const p of w.players.values()) {
      const r = this.rec(p.userId);
      w.sendTo(p, { t: "ctscore", phase: m.phase, c: m.kills.c, tk: m.kills.t, left: Math.max(0, Math.ceil(((m.phase === "prep" ? m.fightAt : m.ends) - now) / 1000)), me: r ? { k: r.kills, d: r.deaths, a: r.assists, s: r.streak } : null });
    }
  }
  /** Everyone on the field, by side, best first: for the board (Tab). */
  board() {
    const rows = [...this.m.roster.values()].filter((r) => !r.left || r.kills || r.deaths).map((r) => ({
      uid: r.uid, n: r.name, f: r.faction, k: r.kills, d: r.deaths, a: r.assists, b: r.best, on: !r.left && this.world?.players.has(r.uid), left: r.left,
    }));
    rows.sort((a, b) => b.k - a.k || b.a - a.a || a.d - b.d);
    return rows;
  }
  sendState(p) {
    const m = this.m;
    this.world?.sendTo(p, { t: "ctstate", id: m.id, phase: m.phase, fightAt: m.fightAt, ends: m.ends, now: Date.now(), faction: this.rec(p.userId)?.faction, minutes: m.minutes });
    this.push();
  }

  /** Every second while a battle is on. */
  async step(now) {
    const m = this.m, w = m.world;
    if (m.phase === "over") {
      if (now >= m.endAt) await this.close();
      return;
    }
    if (m.phase === "prep" && now >= m.fightAt) {
      m.phase = "fight";
      w.broadcast({ t: "toast", m: "⚔ KHAI CHIẾN! Hạ gục thật nhiều đệ tử phe địch!", big: 1 });
      w.ev({ e: "ctfx", k: "start" });
      for (const p of w.players.values()) this.sendState(p);
    }
    for (const r of m.roster.values()) {
      if (r.left) continue;
      const p = w.players.get(r.uid);
      if (p) {
        r.away = null;
        if (m.phase === "fight") r.ms += 1000;
        continue;
      }
      // not on the field: online elsewhere (never came in, or was on the way): brought in; offline: their place is held a while
      const q2 = this.u.players.get(r.uid);
      if (q2 && !q2.gone) this.pull(r);
      else {
        r.away ??= now;
        if (now - r.away > CT.away * 1000 && this.canRefill(now)) {
          r.left = true;
          r.why = "mất kết nối";
          this.refill(r.faction);
        }
      }
    }
    if (now >= m.ends) return this.finish("hết giờ");
    if (Math.floor(now / 1000) % 2 === 0) w.broadcast({ t: "ctboard", rows: this.board() });
    this.push();
  }
  canRefill(now = Date.now()) {
    const m = this.m;
    return m.phase === "prep" || (m.ends - now) / (m.minutes * 60_000) >= CT.refill / 100;
  }
  /** A place on side f opened: the best dự bị still online steps in. */
  refill(f) {
    const b = this.m.bench[f];
    while (b.length) {
      const x = b.shift(), p = this.u.players.get(x.uid);
      if (!p || p.gone || this.rec(x.uid)) continue;
      if (p.faction !== f) continue;
      this.enlist(x, true);
      this.u.toastUser(x.uid, `⚔ Một chỗ ${fname(f)} vừa trống: đạo hữu được gọi vào Chính Tà Phân Tranh!`, true);
      this.world.feed(`${x.name} (dự bị) vào thay chỗ cho ${fname(f)}.`);
      return true;
    }
    return false;
  }
  /** A fighter leaves the field by their own choice: no reward; a dự bị takes their place if there is time. */
  async forfeit(uid) {
    const r = this.rec(uid);
    if (!r || r.left) throw no("Đạo hữu không ở trong trận Chính Tà.");
    if (this.m.phase === "over") throw no("Trận đã kết thúc, sắp được đưa về.");
    r.left = true;
    r.why = "tự rời trận";
    this.world.feed(`${r.name} đã rời chiến trường.`);
    const p = this.u.players.get(uid);
    if (p && p.world === this.world) await this.sendBack(p, r);
    if (this.canRefill()) this.refill(r.faction);
  }

  /** Time is up (or the admin ended it): the result, the rewards, and a while later everyone back. */
  async finish(why = "hết giờ") {
    const m = this.m;
    if (!m || m.phase === "over") return;
    m.phase = "over";
    m.endAt = Date.now() + AFTER * 1000;
    const end = Math.min(Date.now(), m.ends), total = Math.max(1, end - m.fightAt);
    const winner = m.kills.c > m.kills.t ? "c" : m.kills.t > m.kills.c ? "t" : "d";
    // each side's best: most hạ gục, then most hỗ trợ, then fewest deaths (at least one hạ gục)
    const mvp = {};
    for (const f of ["c", "t"]) {
      const best = [...m.roster.values()].filter((r) => r.faction === f && !r.left && r.kills > 0).sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths)[0];
      if (best) mvp[f] = best.uid;
    }
    const rows = [...m.roster.values()].map((r) => {
      const result = r.left ? "x" : winner === "d" ? "d" : r.faction === winner ? "w" : "l";
      const points = pointsFor({ result, kills: r.kills, stayed: Math.min(1, r.ms / total), mvp: mvp[r.faction] === r.uid, left: r.left });
      return { ...r, result, points, mvp: mvp[r.faction] === r.uid, secs: Math.round(r.ms / 1000) };
    });
    let saved = false;
    try {
      saved = await tx(async (c) => {
        const u = await c.query("UPDATE ct_matches SET state = 'done', ended_at = NOW(), kills_c = ?, kills_t = ?, winner = ?, note = CONCAT(note, ?) WHERE id = ? AND state = 'running'",
          [m.kills.c, m.kills.t, winner, why === "hết giờ" ? "" : ` ${why}`, m.id]);
        if (!u.affectedRows) return false;
        for (const r of rows) {
          await c.query("INSERT INTO ct_players (match_id, user_id, faction, kills, deaths, assists, seconds, result, mvp, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [m.id, r.uid, r.faction, r.kills, r.deaths, r.assists, Math.min(65535, r.secs), r.result, r.mvp ? 1 : 0, r.points]);
          if (r.points > 0) await c.query("UPDATE characters SET ct_points = ct_points + ? WHERE user_id = ?", [r.points, r.uid]);
        }
        return true;
      });
    } catch (e) {
      console.error("ct rewards", e);
    }
    const name = (uid) => m.roster.get(uid)?.name ?? null;
    const head = winner === "d" ? `hòa ${m.kills.c} - ${m.kills.t}` : `${fname(winner)} thắng ${Math.max(m.kills.c, m.kills.t)} - ${Math.min(m.kills.c, m.kills.t)}`;
    this.u.feed(`⚔ Chính Tà Phân Tranh kết thúc: ${head}!${mvp.c ? ` Chính Phái xuất sắc nhất: ${name(mvp.c)}.` : ""}${mvp.t ? ` Tà Phái xuất sắc nhất: ${name(mvp.t)}.` : ""}`);
    const board = this.board();
    for (const r of rows) {
      const msg = { t: "ctend", winner, c: m.kills.c, tk: m.kills.t, mvp: { c: name(mvp.c), t: name(mvp.t) }, board, saved, back: AFTER,
        me: { faction: r.faction, result: r.result, points: r.points, k: r.kills, d: r.deaths, a: r.assists, mvp: r.mvp, stayed: Math.min(100, Math.round((r.ms / total) * 100)), why: r.why ?? null } };
      const p = this.u.players.get(r.uid);
      if (p && p.world === this.world) this.world.sendTo(p, msg);
      else if (p && saved) this.u.toastUser(r.uid, r.points ? `Chính Tà Phân Tranh kết thúc (${head}): đạo hữu nhận ${r.points} điểm ${POINTS}.` : `Chính Tà Phân Tranh kết thúc (${head}).`);
    }
    // anyone on the field without a place (an admin watching) sees the result too
    for (const p of this.world.players.values()) if (!this.rec(p.userId)) this.world.sendTo(p, { t: "ctend", winner, c: m.kills.c, tk: m.kills.t, mvp: { c: name(mvp.c), t: name(mvp.t) }, board, saved, back: AFTER, me: null });
    this.world.ev({ e: "ctfx", k: "end", w: winner });
  }
  /** Cancel the battle now (the admin): no rewards, everyone back at once. */
  async cancel(why = "Admin hủy trận") {
    const m = this.m;
    if (!m) throw no("Không có trận nào.");
    if (m.phase !== "over") {
      m.phase = "over";
      await q("UPDATE ct_matches SET state = 'cancelled', ended_at = NOW(), note = ? WHERE id = ? AND state = 'running'", [why, m.id]);
      this.u.feed(`⚔ Chính Tà Phân Tranh bị hủy: ${why}.`);
    }
    await this.close();
  }
  /** Everyone off the field, back to where they came from; the field is closed. */
  async close() {
    const m = this.m, w = m?.world;
    if (!w) return;
    if (this.closing) return;
    this.closing = true;
    try {
      for (const p of [...w.players.values()]) await this.sendBack(p, this.rec(p.userId)).catch((e) => console.error("ct back", e.message));
      this.u.worlds.delete(WAR_KEY);
      this.m = null;
    } finally {
      this.closing = false;
    }
  }
  /** Take p off the field to where they were (still there), else the starter town. */
  async sendBack(p, r) {
    const from = r?.from ?? p.homeFrom, to = from && this.u.canGo(from.key) && from.key !== WAR_KEY ? from.key : "tanthu";
    p.dead = false;
    p.hpFrac = Math.max(p.hpFrac, 1);
    await this.u.transfer(p, to, WAR_KEY, to === from?.key ? from.at : null);
  }

  // ---- what the panels see
  summary(uid) {
    const m = this.m;
    if (!m) return null;
    const r = this.rec(uid);
    return { id: m.id, phase: m.phase, kills: { ...m.kills }, ends: m.ends, fightAt: m.fightAt, size: this.sizes(), mine: r ? { faction: r.faction, left: r.left } : null, bench: this.benchPos(uid) };
  }
  sizes() {
    const s = { c: 0, t: 0 };
    for (const r of this.m.roster.values()) if (!r.left) s[r.faction]++;
    return s;
  }
  benchPos(uid) {
    for (const f of ["c", "t"]) {
      const i = this.m.bench[f].findIndex((x) => x.uid === uid);
      if (i >= 0) return { faction: f, n: i + 1 };
    }
    return null;
  }
  adminSummary() {
    const m = this.m;
    if (!m) return null;
    return { id: m.id, slot: m.slot, text: startText(m.slot), phase: m.phase, kills: { ...m.kills }, fightAt: m.fightAt, ends: m.ends, size: this.sizes(), board: this.board(), bench: { c: m.bench.c.map((x) => x.name), t: m.bench.t.map((x) => x.name) } };
  }
}

export { other };
