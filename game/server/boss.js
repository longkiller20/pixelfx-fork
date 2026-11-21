// Boss Thế Giới (shared/boss.js): the one boss up at a time, its life shared by its copies in every Khu of its map.
//
//   spawn     an admin calls it onto a map (the first boss, Cửu U Xà Vương), with its life, its pools of linh thạch and
//             tu vi, and how long it stays; one row in world_bosses (alive = 1: a second can't be called while it stands)
//   attach    every Khu of that map gets a copy (World.addBoss), the ones made later too
//   hit       a blow in any Khu takes from the one life, and is written down against whoever struck it
//   tick      once a second: the roar (its counter-blow on every player of the map, in every Khu) when it is due,
//             the bar and the ranking to everyone on the map, leaving when its time is up; every few seconds its life and
//             the ledger are saved, so a restart brings it back as it was
//   die       the last blow: each who struck it gets the pools shared by their damage, the one who finished it a bonus on
//             top; one row per (boss, player) in boss_rewards, so it is given once whatever happens (a restart mid-way
//             finishes the sharing without giving anything twice)
import { q, tx, pool } from "./db.js";
import { userLock } from "./lock.js";
import * as store from "./store.js";
import { BOSSES, BOSS, bossMaps } from "../shared/boss.js";
import { MAPS, mapInfo } from "../shared/maps/index.js";

const SAVE_EVERY = 5; // seconds
const fmt = (n) => Math.round(n).toLocaleString("vi-VN");

/** The ground at column x of a map: the highest floor with five open tiles over it (world px), or null. */
export function groundAt(M, x) {
  const col = Math.floor(x / M.T);
  for (let row = 5; row < M.rows; row++) {
    if (!(M.solid(col, row) || M.plank(col, row))) continue;
    let open = true;
    for (let k = 1; k <= 5 && open; k++) if (M.solid(col, row - k) || M.plank(col, row - k)) open = false;
    if (open) return row * M.T;
  }
  return null;
}

export class BossFight {
  constructor(u) {
    this.u = u;
    this.b = null;
    this.ticks = 0;
    this.lastInfo = "";
  }

  /** Bring back a boss that was up when the server stopped (or finish sharing out one that fell mid-way). */
  async load() {
    const [r] = await q("SELECT * FROM world_bosses WHERE alive = 1 LIMIT 1");
    if (!r) return;
    const def = BOSSES[r.boss_key];
    if (!def || !MAPS[r.map_id]) {
      await q("UPDATE world_bosses SET state = 'gone', alive = NULL, ended_at = NOW() WHERE id = ?", [r.id]);
      return;
    }
    this.b = this.shape(r, def);
    for (const d of await q("SELECT d.user_id, d.dmg, d.hits, c.name FROM boss_damage d LEFT JOIN characters c ON c.user_id = d.user_id WHERE d.boss_id = ?", [r.id]))
      this.b.dmg.set(d.user_id, { dmg: Number(d.dmg), hits: Number(d.hits), name: d.name ?? "?" });
    if (this.b.hp <= 0) return void this.die(null).catch((e) => console.error("boss die", e));
    for (const w of this.u.worlds.values()) this.attach(w);
  }
  shape(r, def) {
    return {
      id: r.id, key: r.boss_key, def, map: r.map_id, x: Number(r.x), y: Number(r.y), maxHp: Number(r.max_hp), hp: Number(r.hp),
      stones: Number(r.pool_stones), exp: Number(r.pool_exp), killBonus: Number(r.kill_bonus), endsAt: +new Date(r.ends_at),
      spawnedAt: +new Date(r.spawned_at), state: "alive", dmg: new Map(), dirty: new Set(), saved: Number(r.hp), nextRoar: Date.now() + BOSS.roarEvery * 1000,
    };
  }
  get alive() {
    return this.b?.state === "alive";
  }

  /** Put a copy of the boss into world w if it is a Khu of the boss's map. */
  attach(w) {
    const b = this.b;
    if (!b || b.state !== "alive" || !w.zone || w.map.id !== b.map) return;
    if (w.bossEnt?.bid === b.id) return;
    // the last boss still lying there (it sinks for a few seconds): the new one takes its place
    if (w.bossEnt) w.bossLeave(w.bossEnt);
    w.addBoss(b);
  }
  /** Every world holding a copy of the boss. */
  copies() {
    return [...this.u.worlds.values()].filter((w) => w.bossEnt && w.bossEnt.bid === this.b?.id);
  }

  /**
   * An admin calls a boss: key (shared/boss.js), map (one of bossMaps()), x (world px; or the middle of the map), and
   * optionally hp, stones, exp, killBonus (%), minutes, instead of the settings boss.*. Refused while one stands.
   */
  async spawn({ key = "xavuong", map, x = null, hp = null, stones = null, exp = null, killBonus = null, minutes = null, by = null } = {}) {
    const def = BOSSES[key];
    if (!def) throw bad("Không có boss này.");
    if (!bossMaps().includes(map)) throw bad("Map này không gọi boss được (chỉ các map có yêu thú).");
    if (this.b && this.b.state !== "gone" && this.b.state !== "dead") throw bad("Đang có một Boss Thế Giới, hãy đợi nó bị hạ hoặc thu hồi trước.", 409);
    const M = mapInfo(map), num = (v, d, min, max) => (v === null || v === undefined || v === "" ? d : Math.min(max, Math.max(min, Math.round(Number(v)))));
    if ([hp, stones, exp, killBonus, minutes, x].some((v) => v !== null && v !== undefined && v !== "" && !Number.isFinite(Number(v)))) throw bad("Số không hợp lệ.");
    const X = num(x, Math.round(M.w / 2), 60, M.w - 60), Y = groundAt(M, X);
    if (Y === null) throw bad("Chỗ đó không có mặt đất để boss đứng.");
    const H = num(hp, BOSS.hp, 1, 1e12), S = num(stones, BOSS.stones, 0, 1e9), E = num(exp, BOSS.exp, 0, 1e12), K = num(killBonus, BOSS.killBonus, 0, 500), MIN = num(minutes, BOSS.minutes, 1, 24 * 60);
    let id;
    try {
      id = (await q(
        "INSERT INTO world_bosses (boss_key, map_id, x, y, max_hp, hp, pool_stones, pool_exp, kill_bonus, spawned_by, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? MINUTE)",
        [key, map, X, Y, H, H, S, E, K, by, MIN],
      )).insertId;
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") throw bad("Đang có một Boss Thế Giới, hãy đợi nó bị hạ hoặc thu hồi trước.", 409);
      throw e;
    }
    const [r] = await q("SELECT * FROM world_bosses WHERE id = ?", [id]);
    this.b = this.shape(r, def);
    for (const w of this.u.worlds.values()) this.attach(w);
    const where = MAPS[map].name;
    this.u.feed(`👹 Boss Thế Giới ${def.name} đã giáng thế tại ${where}! Mọi khu của ${where} đều thấy nó, chung một thanh máu.`);
    this.u.broadcast({ t: "toast", m: `👹 ${def.name} xuất hiện tại ${where}! Dùng Truyền Tống Trận để tới.`, big: 1 });
    this.pushInfo(true);
    return this.view();
  }

  /** A player's blow in any Khu: off the one life, written against them. The last blow brings it down. */
  hit(att, dmg) {
    const b = this.b;
    if (!b || b.state !== "alive" || !(dmg > 0)) return 0;
    const took = Math.min(b.hp, Math.round(dmg));
    b.hp -= took;
    const rec = b.dmg.get(att.userId) ?? { dmg: 0, hits: 0, name: att.name };
    rec.dmg += took;
    rec.hits++;
    rec.name = att.name;
    b.dmg.set(att.userId, rec);
    b.dirty.add(att.userId);
    for (const w of this.copies()) w.bossEnt.hpFrac = b.hp / b.maxHp;
    if (b.hp <= 0) this.die(att).catch((e) => console.error("boss die", e));
    return took;
  }

  /** Once a second (the Universe's clock). */
  tick() {
    const b = this.b;
    this.ticks++;
    if (!b) return;
    if (b.state === "alive") {
      if (Date.now() >= b.endsAt) return void this.leave("time").catch((e) => console.error("boss leave", e));
      // the roar: every player of the map, in every Khu, at once
      if (Date.now() >= b.nextRoar) {
        b.nextRoar = Date.now() + BOSS.roarEvery * 1000;
        for (const w of this.copies()) w.bossRoar(w.bossEnt);
      }
      this.push();
      if (this.ticks % SAVE_EVERY === 0) this.save().catch((e) => console.error("boss save", e.message));
    }
    if (this.ticks % 5 === 0) this.pushInfo();
  }

  /** The bar and the ranking, to everyone on the boss's map (each with their own damage and place). */
  push() {
    const b = this.b, v = this.view(), rank = [...b.dmg.entries()].sort((x, y) => y[1].dmg - x[1].dmg);
    const place = new Map(rank.map(([uid], i) => [uid, i + 1]));
    for (const w of this.copies())
      for (const p of w.players.values()) {
        const me = b.dmg.get(p.userId);
        w.sendTo(p, { t: "boss", ...v, me: { dmg: me?.dmg ?? 0, rank: place.get(p.userId) ?? 0, pct: me ? +((me.dmg / Math.max(1, b.maxHp - b.hp)) * 100).toFixed(1) : 0 } });
      }
  }
  /** A word to everyone online, wherever: which boss is up, where, how much life it has (only when it changed). */
  /** The word about the boss as it is now (a new arrival is told straight away). */
  infoMsg() {
    const b = this.b;
    return b && b.state === "alive" ? { t: "bossinfo", up: 1, name: b.def.name, map: b.map, mapName: MAPS[b.map].name, pct: Math.ceil((b.hp / b.maxHp) * 100), left: Math.max(0, Math.round((b.endsAt - Date.now()) / 1000)) } : { t: "bossinfo", up: 0 };
  }
  pushInfo(force = false) {
    const info = this.infoMsg();
    const j = JSON.stringify({ ...info, left: 0 });
    if (!force && j === this.lastInfo) return;
    this.lastInfo = j;
    this.u.broadcast(info);
  }
  /** What the bar and the admin show: the boss, its life, the top ten. */
  view() {
    const b = this.b;
    if (!b) return null;
    const total = Math.max(1, b.maxHp - b.hp);
    return {
      id: b.id, key: b.key, name: b.def.name, title: b.def.title, map: b.map, mapName: MAPS[b.map]?.name ?? b.map, hp: b.hp, max: b.maxHp, state: b.state,
      left: Math.max(0, Math.round((b.endsAt - Date.now()) / 1000)), roarIn: Math.max(0, Math.round((b.nextRoar - Date.now()) / 1000)),
      stones: b.stones, exp: b.exp, killBonus: b.killBonus, fighters: b.dmg.size,
      top: [...b.dmg.entries()].sort((x, y) => y[1].dmg - x[1].dmg).slice(0, 10).map(([uid, r]) => ({ uid, name: r.name, dmg: r.dmg, pct: +((r.dmg / total) * 100).toFixed(1) })),
    };
  }

  /** Its life and what changed in the ledger, to the database. */
  async save() {
    const b = this.b;
    if (!b) return;
    const rows = [...b.dirty].map((uid) => [b.id, uid, b.dmg.get(uid).dmg, b.dmg.get(uid).hits]);
    b.dirty.clear();
    if (rows.length) await pool.batch("INSERT INTO boss_damage (boss_id, user_id, dmg, hits) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE dmg = VALUES(dmg), hits = VALUES(hits)", rows);
    if (b.hp !== b.saved) {
      b.saved = b.hp;
      await q("UPDATE world_bosses SET hp = ? WHERE id = ?", [b.hp, b.id]);
    }
  }

  /**
   * Brought down by killer (a player, or null when finishing one that fell before a restart). Each who struck it gets
   * floor(pool × their damage / all damage) of both pools; the killer killBonus% of each pool on top.
   */
  async die(killer) {
    const b = this.b;
    if (!b || b.state === "dying" || b.state === "dead") return;
    b.state = "dying";
    b.hp = 0;
    for (const w of this.copies()) w.bossDie(w.bossEnt);
    const killerId = killer?.userId ?? (await q("SELECT killer_id FROM world_bosses WHERE id = ?", [b.id]))[0]?.killer_id ?? null;
    const killerName = killer?.name ?? b.dmg.get(killerId)?.name ?? null;
    await q("UPDATE world_bosses SET hp = 0, killer_id = ?, killer_name = ? WHERE id = ?", [killerId, killerName, b.id]);
    b.dirty = new Set(b.dmg.keys());
    await this.save();
    const total = [...b.dmg.values()].reduce((a, r) => a + r.dmg, 0) || 1;
    const shares = [...b.dmg.entries()].map(([uid, r]) => {
      const k = uid === killerId;
      return {
        uid, name: r.name, dmg: r.dmg, killer: k,
        stones: Math.floor((b.stones * r.dmg) / total) + (k ? Math.floor((b.stones * b.killBonus) / 100) : 0),
        exp: Math.floor((b.exp * r.dmg) / total) + (k ? Math.floor((b.exp * b.killBonus) / 100) : 0),
      };
    }).sort((x, y) => y.dmg - x.dmg);
    // each player on their own lock (the one their saves take), the reward row first: given once, whatever happens
    for (const s of shares) {
      try {
        await userLock.run(s.uid, async () => {
          const given = await tx(async (c) => {
            const r = await c.query("INSERT IGNORE INTO boss_rewards (boss_id, user_id, dmg, stones, exp, killer) VALUES (?, ?, ?, ?, ?, ?)", [b.id, s.uid, s.dmg, s.stones, s.exp, s.killer ? 1 : 0]);
            if (r.affectedRows !== 1) return false;
            await c.query("UPDATE characters SET stones = stones + ?, exp = exp + ? WHERE user_id = ?", [s.stones, s.exp, s.uid]);
            return true;
          });
          if (given) this.u.refresh(s.uid, await store.loadCharacter(s.uid));
        });
      } catch (e) {
        console.error("boss reward", s.uid, e.message);
      }
    }
    await q("UPDATE world_bosses SET state = 'dead', alive = NULL, ended_at = NOW() WHERE id = ?", [b.id]);
    b.state = "dead";
    const top = shares.slice(0, 5).map((s, i) => ({ i: i + 1, name: s.name, dmg: s.dmg, pct: +((s.dmg / total) * 100).toFixed(1) }));
    const where = MAPS[b.map].name;
    this.u.feed(`👹 ${b.def.name} đã tử trận tại ${where}${killerName ? `, ${killerName} kết liễu` : ""}! ${shares.length} đạo hữu chia ${fmt(b.stones)} linh thạch và ${fmt(b.exp)} tu vi.`);
    // to each one who fought: what they got
    const players = this.u.players;
    for (const s of shares) {
      const p = players.get(s.uid);
      if (p) p.world.sendTo(p, { t: "bossend", name: b.def.name, killer: killerName, top, me: { dmg: s.dmg, stones: s.stones, exp: s.exp, killer: s.killer, pct: +((s.dmg / total) * 100).toFixed(1) } });
    }
    for (const w of this.copies()) for (const p of w.players.values()) if (!b.dmg.has(p.userId)) w.sendTo(p, { t: "bossend", name: b.def.name, killer: killerName, top, me: null });
    this.pushInfo(true);
    return shares;
  }

  /** It goes without being brought down (its time is up, or an admin takes it back): nobody gets anything. */
  async leave(why = "time") {
    const b = this.b;
    if (!b || b.state !== "alive") return false;
    b.state = "gone";
    for (const w of this.copies()) w.bossLeave(w.bossEnt);
    await this.save().catch(() => {});
    await q("UPDATE world_bosses SET state = 'gone', alive = NULL, ended_at = NOW() WHERE id = ?", [b.id]);
    this.u.feed(why === "admin" ? `👹 ${b.def.name} đã bị thu hồi.` : `👹 ${b.def.name} đã rời khỏi ${MAPS[b.map].name}: hết thời gian mà chưa ai hạ được.`);
    this.pushInfo(true);
    return true;
  }

  /** The bosses called before, newest first, for the admin. */
  async history(limit = 20) {
    return (await q("SELECT id, boss_key, map_id, max_hp, hp, pool_stones, pool_exp, kill_bonus, state, spawned_by, spawned_at, ended_at, killer_name, (SELECT COUNT(*) FROM boss_rewards r WHERE r.boss_id = b.id) AS rewarded FROM world_bosses b ORDER BY id DESC LIMIT ?", [limit]))
      .map((r) => ({ ...r, max_hp: Number(r.max_hp), hp: Number(r.hp), rewarded: Number(r.rewarded), name: BOSSES[r.boss_key]?.name ?? r.boss_key, mapName: MAPS[r.map_id]?.name ?? r.map_id }));
  }
  /** One boss's sharing, for the admin. */
  async rewards(id) {
    return (await q("SELECT r.user_id, c.name, r.dmg, r.stones, r.exp, r.killer FROM boss_rewards r LEFT JOIN characters c ON c.user_id = r.user_id WHERE r.boss_id = ? ORDER BY r.dmg DESC", [id]))
      .map((r) => ({ ...r, dmg: Number(r.dmg), exp: Number(r.exp), killer: !!r.killer }));
  }
}

function bad(m, status = 400) {
  return Object.assign(new Error(m), { status });
}
