// The shared world. The server is the only authority: clients send what they press (a direction, a skill and where to aim)
// and the server moves everyone, checks cooldowns and ranges, deals damage, hands out rewards and sends back what happened,
// 20 times a second. Nothing a client claims about positions, damage or rewards is ever trusted.
import { WebSocket } from "ws";
import {
  TICK_HZ, PLAYER_R, CLASSES, MONSTERS, ITEMS, PVP, RESPAWN_WORLD, MEDITATE, levelFromExp, worldMult, arenaMult, mitigate, ARTS, ART_SLOTS, DROPS,
  FLY, canFly, flyRealmName,
} from "../shared/balance.js";
import { mapInfo, START_MAP, MAPS } from "../shared/maps/index.js";
import { stepBody, fits, PHYS, zoneLanding } from "../shared/physics.js";
import { CAST, stepReturning } from "./cong-phap.js";
import * as store from "./store.js";
import { sectOf } from "./tong-mon.js";
import * as dao from "./dao-huu.js";
import * as gv from "./gia-vien.js";
import { HomeGrid, HOME_MAP, houseCells } from "../shared/gia-vien.js";
import * as cc from "./cau-ca.js";
import { FISH_MAP, RODS, BAITS, FISH, CAST as FCAST, rollFish, rollWeight, reelStart, reelStep, kgText, RARITY, KHU_COUNT, KHU_CAP, khuKey, khuOf } from "../shared/cau-ca.js";
import { SOCIAL } from "../shared/balance.js";
import { SECT } from "../shared/balance.js";
import { sectBonus } from "../shared/tong-mon.js";
import { userFromToken } from "./auth.js";
import { KeyedLock } from "./lock.js";

const DT = 1 / TICK_HZ;
// seconds between stepping into a gate and arriving on the other map: the departure plays, the screen closes
const WARP_DELAY = 0.9;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const sessionLock = new KeyedLock();

// ids are unique across every map, so a player keeps theirs and nothing mixes up when they walk from one map to another
let NID = 1;
const nextId = () => NID++;

/**
 * One map's world: its players, monsters and projectiles, stepped by the Universe 20 times a second. Every map steps on
 * the same tick, so their clocks (this.t) are always equal and a player's timers (cooldowns, buffs, protection) mean the
 * same thing on whichever map they are.
 */
export class World {
  constructor(mapId = START_MAP, universe = null, home = null) {
    this.u = universe;
    this.ents = new Map(); // id -> player or monster
    this.players = new Map(); // userId -> player
    this.bolts = [];
    this.later = [];
    this.events = [];
    this.pairs = new Map(); // "killer:victim" -> time of the last rewarded kill
    this.t = 0;
    this.tick = 0;
    this.map = mapInfo(mapId);
    // which world this is in the Universe: the map's id, or for a Gia Viên "gv:<owner>" (one copy per owner)
    this.key = mapId;
    if (home?.khu) {
      // a Khu of the fishing lake: one of KHU_COUNT copies of it, numbered
      this.key = home.key;
      this.khu = home.khu;
    } else if (home) {
      // a Gia Viên: its owner's ready-made house over the plain map, its walls and floors carrying people like the ground
      this.key = home.key;
      this.owner = home.owner;
      this.house = home.house;
      this.grid = new HomeGrid(this.map).load(houseCells(home.house));
      this.map = this.grid.wrap();
    }
    this.spawnMonsters();
  }

  // ---------------------------------------------------------------- arriving and leaving
  /** A player logging in onto this map (the Universe has checked the token and loaded the character). */
  admit(ws, ch, inv, buffs, sect = null, social = null) {
    const p = {
      id: nextId(), kind: "p", userId: ch.userId, ws, name: ch.name, cls: ch.cls, look: ch.look,
      ...this.spawnPoint(), face: 1, in: { dx: 0, dy: 0, jump: false, down: false }, flying: false, jumpUntil: 0, moving: false, portalAt: 0, vx: 0, vy: 0, ground: false, dropUntil: 0,
      hpFrac: 1, dead: false, respawnAt: 0, protectUntil: this.t + PVP.spawnProtect,
      cd: [0], artCd: {}, slots: ch.slots, learned: new Set(ch.learned), tbuffs: {}, busyUntil: 0, rootUntil: 0, slowUntil: 0, lastHurt: -99, lastCast: -99, itemCd: 0, chatAt: 0,
      medAcc: 0, meditating: false, base: null, pend: zero(), fly: zero(), level: 1, medLeft: 0, saving: null, gone: false, buffs,
      // their Tông Môn as the database says (server/tong-mon.js sectOf): its bonus counts in stats(), its name shows over them
      sect,
      // Đạo Hữu and who they blocked (server/dao-huu.js socialOf): Truyền Âm goes only to friends, nothing from the blocked arrives
      friends: social?.friends ?? new Set(), blocked: social?.blocked ?? new Set(), worldAt: 0, pmAt: 0, lastLine: null,
    };
    this.applyBase(p, ch, true);
    ws.player = p;
    this.enter(p, inv);
    this.u?.feed(`${p.name} đã tiến vào Đa Vũ Trụ.`);
    return p;
  }
  /** Put a player on this map (logging in, or walking in through a gate) and tell their browser where they are. */
  enter(p, inv, at = null) {
    p.world = this;
    p.safe = null;
    if (at) Object.assign(p, { x: at.x, y: at.y, vx: 0, vy: 0, ground: false });
    this.players.set(p.userId, p);
    this.ents.set(p.id, p);
    send(p.ws, { t: "welcome", id: p.id, tick: this.tick, inv, map: this.map.id, players: [...this.players.values()].map(info) });
    // a Gia Viên: which house stands in it (the browser has the designs), and the farm's animals and herbs
    if (this.grid) {
      send(p.ws, { t: "home", owner: this.owner, mine: p.userId === this.owner, house: this.house });
      this.u?.homeState(this.owner);
    }
    this.broadcast({ t: "pi", ...info(p) }, p);
    if (this.map.def.fishing) send(p.ws, { t: "fzones", occ: this.khuOcc() });
    if (this.khu) send(p.ws, { t: "fkhu", n: this.khu, occ: this.u?.khuCounts() ?? [] });
    this.sendArts(p);
    this.sendMe(p);
  }
  /** Take a player off this map without saving or ending anything: they are walking to another map. */
  leave(p) {
    p.fish = null;
    if (this.players.get(p.userId) === p) this.players.delete(p.userId);
    this.ents.delete(p.id);
    for (const m of this.ents.values()) if (m.target === p) m.target = null;
    this.broadcast({ t: "gone", id: p.id });
    if ((this.grid || this.khu) && !this.players.size) this.u?.dropHomeLater(this.key);
  }

  /** Take a player out and save what they earned. Safe to call twice. */
  async remove(p) {
    if (p.gone) return p.saving;
    p.gone = true;
    p.fish = null;
    if (this.players.get(p.userId) === p) this.players.delete(p.userId);
    this.ents.delete(p.id);
    for (const m of this.ents.values()) if (m.target === p) m.target = null;
    this.broadcast({ t: "gone", id: p.id });
    if ((this.grid || this.khu) && !this.players.size) this.u?.dropHomeLater(this.key);
    await this.save(p);
  }

  /** An admin changed someone's inventory: show them the new one if they're on. */
  async sendInv(uid) {
    const p = this.players.get(uid);
    if (p) send(p.ws, { t: "inv", inv: await store.inventory(uid) });
  }

  kickUser(uid, why) {
    const p = this.players.get(uid);
    if (p) {
      send(p.ws, { t: "fatal", m: why });
      p.ws.close(4004, "kicked");
    }
  }

  /** An admin changed the game's numbers: monsters take their new stats, players their new levels, browsers the new set. */
  onConfig() {
    for (const m of this.ents.values())
      if (m.kind === "m") {
        const d = MONSTERS[m.type];
        m.st = { maxHp: d.hp, atk: d.atk, def: d.def, spd: d.spd };
      }
    for (const p of this.players.values()) {
      this.relevel(p);
      this.sendMe(p);
    }
    this.broadcast({ t: "config" });
  }

  /**
   * The database changed under a connected player (a purchase, the daily gift, an admin's edit): take its numbers. ch must
   * have been read under the player's userLock (store functions do), so it holds every save before it and none after;
   * applyBase adds what is still on its way (p.fly) on top. Name and look changes are shown to everyone.
   */
  refresh(uid, ch) {
    const p = this.players.get(uid);
    if (!p || !ch || p.gone) return;
    this.applyBase(p, ch);
    if (ch.slots && (JSON.stringify(ch.slots) !== JSON.stringify(p.slots) || ch.learned.length !== p.learned.size)) {
      p.slots = ch.slots;
      p.learned = new Set(ch.learned);
      this.sendArts(p);
    }
    this.sendMe(p);
    if ((ch.look && JSON.stringify(ch.look) !== JSON.stringify(p.look)) || (ch.name && ch.name !== p.name)) {
      p.look = ch.look ?? p.look;
      p.name = ch.name ?? p.name;
      this.broadcast({ t: "pi", ...info(p) });
    }
  }

  // ---------------------------------------------------------------- admin
  /** An admin changed this player's buffs: read them again. */
  async reloadBuffs(uid) {
    const p = this.players.get(uid);
    if (!p) return;
    p.buffs = await store.activeBuffs(uid);
    this.sendMe(p);
  }
  /** Total percent of every live buff on one stat. */
  buff(p, stat) {
    if (!p.buffs?.length) return 0;
    const now = Date.now();
    let s = 0;
    for (const b of p.buffs) if (b.stat === stat && (b.until === null || b.until > now)) s += b.pct;
    return s;
  }
  /** What an admin sees of a connected player right now, or null if they're off. */
  liveInfo(uid) {
    const p = this.players.get(uid);
    if (!p) return null;
    const st = this.stats(p);
    return {
      map: this.map.name, x: Math.round(p.x), y: Math.round(p.y), hp: Math.max(0, Math.round(p.hpFrac * st.maxHp)), maxHp: st.maxHp,
      atk: Math.round(st.atk), def: Math.round(st.def), spd: Math.round(st.spd), dead: p.dead, meditating: p.meditating, level: p.level,
      pending: { ...p.pend }, saving: { ...p.fly },
    };
  }
  /** Things only the running world can do to a player. Runs on the game's own thread, between ticks: nothing races it. */
  liveAction(uid, action) {
    const p = this.players.get(uid);
    if (!p) return false;
    const t = this.t;
    switch (action) {
      case "heal":
        if (!p.dead) p.hpFrac = 1;
        p.slowUntil = 0;
        break;
      case "revive":
        if (p.dead) p.respawnAt = t;
        break;
      case "spawn":
        Object.assign(p, this.spawnPoint());
        this.ev({ e: "spawn", id: p.id });
        break;
      case "cooldowns":
        p.cd = [0];
        p.artCd = {};
        p.itemCd = 0;
        p.busyUntil = 0;
        break;
      default:
        return false;
    }
    this.sendMe(p);
    return true;
  }

  // ---------------------------------------------------------------- saving
  // What a player has = what the database says (ch) + what is being written right now (p.fly) + what is not yet
  // written (p.pend). ch is always read under the player's userLock, which also orders the writes, so it already holds
  // every save that finished before it and none still in p.fly: the sum never counts a gain twice or drops one.
  applyBase(p, ch, first = false) {
    const f = p.fly;
    p.base = { exp: ch.exp + f.exp + f.med, stones: ch.stones + f.stones, rank: Math.max(0, ch.rank + f.rank), kills: ch.kills + f.kills, deaths: ch.deaths + f.deaths };
    p.medLeft = Math.max(0, ch.medLeft - p.pend.med - f.med);
    this.relevel(p, first);
  }

  /** Save the earnings since the last save as increments; on failure they stay pending for the next try. */
  save(p) {
    const d = p.pend;
    if (!d.exp && !d.stones && !d.rank && !d.kills && !d.deaths && !d.med) return p.saving ?? Promise.resolve();
    p.pend = zero();
    // move it from "not yet written" to "being written": the total on screen stays the same while the write is in flight
    for (const k in d) p.fly[k] += d[k];
    const run = store.flush(p.userId, d).then(
      (ch) => {
        for (const k in d) p.fly[k] -= d[k];
        if (!p.gone) {
          this.applyBase(p, ch);
          this.sendMe(p);
        }
      },
      (e) => {
        console.error("save failed, will retry", p.userId, e.message);
        for (const k in d) (p.fly[k] -= d[k]), (p.pend[k] += d[k]);
        if (p.gone) return store.flush(p.userId, d).catch((e2) => console.error("save lost", p.userId, d, e2.message));
      },
    );
    p.saving = run;
    return run;
  }

  saveAll() {
    for (const p of this.players.values()) this.save(p);
  }

  async shutdown() {
    const all = [...this.players.values()];
    for (const p of all) send(p.ws, { t: "fatal", m: "Máy chủ đang bảo trì, hẹn gặp lại." });
    await Promise.all(all.map((p) => this.remove(p)));
  }

  // ---------------------------------------------------------------- numbers
  exp(p) {
    return p.base.exp + p.pend.exp + p.pend.med;
  }
  relevel(p, quiet = false) {
    const L = levelFromExp(this.exp(p));
    if (L !== p.level) {
      const up = L > p.level, could = canFly(p.level);
      p.level = L;
      if (!quiet && up && !could && canFly(L))
        send(p.ws, { t: "toast", m: `Đạt ${flyRealmName()}: mở khoá Ngự Kiếm Phi Hành! Nhấn nút phi kiếm (phím F) để bay; đổi phi kiếm ở Y Các.`, big: 1 });
      if (!quiet) {
        this.broadcast({ t: "pi", ...info(p) });
        if (up) {
          p.hpFrac = 1;
          this.ev({ e: "lvl", id: p.id, lv: L });
        }
      }
    }
  }
  stats(e) {
    if (e.kind === "m") return e.st;
    const c = CLASSES[e.cls], m = this.map.pvp ? arenaMult(e.level) : worldMult(e.level);
    // an admin's buffs count in the open world; on PvP maps everyone fights on the same numbers
    // an admin's buffs count in the open world; an art's own buff (Cuồng Bạo Quyết, Thánh Quang Hộ Thuẫn...) everywhere
    const tb = (stat) => {
      const x = e.tbuffs?.[stat];
      return x && x.until > this.t ? x.pct / 100 : 0;
    };
    // and the sect's: its level (hp, atk, def) and, while it stands, the Hộ Sơn Đại Trận (atk), in the open world only
    const sb = (stat) => {
      if (this.map.pvp || !e.sect || stat === "spd") return 0;
      return (sectBonus(e.sect.level, SECT) + (stat === "atk" && e.sect.arrayUntil > Date.now() ? SECT.arrayAtk : 0)) / 100;
    };
    const b = (stat) => Math.max(0.1, (this.map.pvp ? 1 : 1 + this.buff(e, stat) / 100) + tb(stat) + sb(stat));
    return {
      maxHp: Math.round(c.hp * m * b("hp")), atk: c.atk * m * b("atk"), def: c.def * m * b("def"),
      spd: c.spd * b("spd") * (e.slowUntil > this.t ? 0.5 : 1) * (e.busyUntil > this.t ? 0.45 : 1),
    };
  }
  /** The player's bar and what they have learned (the starters are known by all and not listed). */
  sendArts(p) {
    send(p.ws, { t: "arts", slots: p.slots, learned: [...p.learned] });
  }
  /** Seconds left on the basic attack and on each slot of the bar. */
  cooldowns(p) {
    const left = (c) => Math.max(0, +((c ?? 0) - this.t).toFixed(2));
    return [left(p.cd[0]), ...p.slots.map((k) => (k ? left(p.artCd[k]) : 0))];
  }
  sendMe(p) {
    const st = this.stats(p);
    send(p.ws, {
      t: "me", lv: p.level, exp: this.exp(p), stones: p.base.stones + p.pend.stones, rank: p.base.rank + p.pend.rank,
      kills: p.base.kills + p.pend.kills, deaths: p.base.deaths + p.pend.deaths, medLeft: p.medLeft,
      hp: Math.max(0, Math.round(p.hpFrac * st.maxHp)), maxHp: st.maxHp, atk: Math.round(st.atk), def: Math.round(st.def),
      // walking speed before a slow or a cast's pause (the browser applies those itself from the snapshot's flags)
      spd: +(st.spd / (p.slowUntil > this.t ? 0.5 : 1) / (p.busyUntil > this.t ? 0.45 : 1)).toFixed(2),
      cd: this.cooldowns(p),
      sect: p.sect ? { id: p.sect.id, name: p.sect.name, rank: p.sect.rank, level: p.sect.level, bonus: this.map.pvp ? 0 : sectBonus(p.sect.level, SECT), array: Math.max(0, Math.round((p.sect.arrayUntil - Date.now()) / 1000)) } : null,
      respawn: p.dead ? Math.max(0, +(p.respawnAt - this.t).toFixed(1)) : 0, itemCd: Math.max(0, +(p.itemCd - this.t).toFixed(1)),
      buffs: (p.buffs ?? []).filter((x) => x.until === null || x.until > Date.now()).map((x) => ({ stat: x.stat, pct: x.pct, left: x.until === null ? null : Math.round((x.until - Date.now()) / 1000) })),
    });
  }

  // ---------------------------------------------------------------- input
  onMessage(p, m) {
    switch (m.t) {
      case "in": {
        // side view: a direction along the ground, and whether jump and down are held (nothing while teleporting)
        if (!num(m.dx) || p.warping) return;
        // a tap shorter than a tick still counts: the press is kept for JUMP_BUFFER and spent on the next jump
        if (m.jump === true && !p.in.jump) p.jumpUntil = this.t + PHYS.JUMP_BUFFER;
        p.in = { dx: clamp(m.dx, -1, 1), dy: num(m.dy) ? clamp(m.dy, -1, 1) : 0, jump: m.jump === true, down: m.down === true };
        return;
      }
      case "fly":
        return this.setFlying(p, m.on === true);
      // Câu Cá: cast, strike, hold the line (on/off) while reeling, or reel in
      case "fish":
        return this.fishInput(p, m);
      case "cast": {
        // a peaceful map (the fishing lake): no attack, no art
        if (this.map.def.peaceful) return;
        // 0 is the basic attack, 1-5 the arts on the bar
        // (a whole number, nothing else: "1; x", 1.5 or null are not slots)
        const i = m.s;
        if (!Number.isInteger(i) || i < 0 || i > ART_SLOTS) return;
        // aim mostly along the ground: at most a gentle slope up or down
        let ax = num(m.ax) ? m.ax : p.face, ay = num(m.ay) ? clamp(m.ay, -Math.abs(ax) * 0.6 - 0.01, Math.abs(ax) * 0.6 + 0.01) : 0;
        const l = Math.hypot(ax, ay);
        if (l < 1e-3) (ax = p.face), (ay = 0);
        else (ax /= l), (ay /= l);
        // a zone dragged to a spot: where (checked against the art's reach in cast)
        const to = num(m.tx) && num(m.ty) ? { x: m.tx, y: m.ty } : null;
        return this.cast(p, i, ax, ay, to);
      }
      case "chat": {
        // three channels: Thế Giới (w, every map), Khu Vực (k, this map), Tông Môn (s, the sect wherever its members are)
        if (typeof m.m !== "string" || this.t < p.chatAt) return;
        const ch = m.ch === "k" || m.ch === "s" ? m.ch : "w";
        const text = dao.cleanLine(m.m, 120);
        if (!text) return;
        if (ch === "w" && this.t < p.worldAt)
          return send(p.ws, { t: "toast", m: `Kênh Thế Giới: đợi ${Math.ceil(p.worldAt - this.t)} giây nữa.` });
        // the same line again within 10 s is dropped (no flooding by repeating)
        if (p.lastLine && p.lastLine.text === text && p.lastLine.ch === ch && this.t - p.lastLine.t < 10) return send(p.ws, { t: "toast", m: "Đừng lặp lại một câu liên tục." });
        if (p.chatMuted && p.chatMuted > Date.now()) return send(p.ws, { t: "toast", m: `Đạo hữu đang bị cấm chat, còn ${Math.ceil((p.chatMuted - Date.now()) / 60000)} phút.` });
        p.chatAt = this.t + 1;
        if (ch === "w") p.worldAt = this.t + SOCIAL.worldCooldown;
        p.lastLine = { text, ch, t: this.t };
        const msg = { t: "chat", ch, n: p.name, lv: p.level, m: text, at: Date.now() };
        if (ch === "s") {
          if (!p.sect) return send(p.ws, { t: "toast", m: "Đạo hữu chưa ở tông môn nào." });
          return this.u?.say(msg, p, (q) => q.sect?.id === p.sect.id, `s${p.sect.id}`);
        }
        if (ch === "k") return this.u ? this.u.say({ ...msg, map: this.map.name }, p, (q) => q.world === this, `k${this.key}`) : this.broadcast(msg);
        return this.u ? this.u.say(msg, p, () => true, "w") : this.broadcast(msg);
      }
      case "hist":
        // a channel's last lines (the chat panel opening it), without anyone this player blocked
        return this.u?.history(p, m.ch);
      case "pm":
        // Truyền Âm: to a friend, by id (or đạo hiệu); checked and saved by server/dao-huu.js, then delivered
        return this.u?.whisper(p, m);
      case "use":
        if (typeof m.item === "string") this.useItem(p, m.item);
        return;
      case "ping":
        if (num(m.c)) send(p.ws, { t: "pong", c: m.c });
        return;
    }
  }

  async useItem(p, item) {
    const it = ITEMS[item];
    if (!it || p.dead) return;
    if (it.heal && this.map.pvp) return send(p.ws, { t: "toast", m: "Không thể dùng đan dược hồi phục ở nơi tỷ thí." });
    if (p.itemCd > this.t) return send(p.ws, { t: "toast", m: "Đan dược chưa hồi." });
    // set the cooldown before waiting on the database, so a burst of taps uses one pill
    p.itemCd = this.t + (it.cd ?? 1);
    try {
      const ch = await store.useItem(p.userId, item, p.level);
      if (p.gone) return;
      this.applyBase(p, ch);
      if (it.heal && !p.dead) p.hpFrac = Math.min(1, p.hpFrac + it.heal);
      this.ev({ e: "item", id: p.id, item });
      this.sendMe(p);
      send(p.ws, { t: "inv", inv: await store.inventory(p.userId) });
    } catch (e) {
      p.itemCd = this.t + 0.5;
      send(p.ws, { t: "toast", m: e instanceof store.GameError ? e.message : "Không dùng được vật phẩm." });
      if (!(e instanceof store.GameError)) console.error("use", e);
    }
  }

  // ---------------------------------------------------------------- combat
  hostile(att, e) {
    if (!e || e.dead) return false;
    // monsters only go for players, and not one who just appeared
    // (a trial monster only its own player)
    if (att.kind === "m") return e.kind === "p" && !e.gone && e.protectUntil <= this.t && (!att.forUid || e.userId === att.forUid);
    if (e.kind === "m") return true;
    if (e.kind !== "p" || e === att || att.kind !== "p") return false;
    return this.map.pvp && e.protectUntil <= this.t;
  }
  targetsOf(att) {
    const out = [];
    for (const e of this.ents.values()) if (this.hostile(att, e)) out.push(e);
    return out;
  }
  /** Hit every enemy of att in a cone from (x, y) along (ax, ay). */
  cone(att, x, y, ax, ay, range, arc, atk, mult) {
    const c = Math.cos(arc / 2);
    for (const e of this.targetsOf(att)) {
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d > range + PLAYER_R) continue;
      if (d > 12 && (dx * ax + dy * ay) / d < c) continue;
      this.damage(att, atk, e, mult);
    }
  }
  damage(att, atk, e, mult) {
    if (e.dead) return 0;
    const st = this.stats(e);
    const dmg = Math.max(1, Math.round(atk * mult * mitigate(st.def) * (0.95 + Math.random() * 0.1)));
    e.hpFrac -= dmg / st.maxHp;
    e.lastHurt = this.t;
    if (att.kind === "p") e.lastHitBy = att;
    this.ev({ e: "hit", id: e.id, d: dmg, by: att.id });
    if (e.hpFrac <= 0) this.kill(e, att);
    return dmg;
  }

  newId() {
    return nextId();
  }

  cast(p, i, ax, ay, to = null) {
    if (this.map.def.peaceful || p.dead || p.busyUntil > this.t || p.warping) return;
    const t = this.t;
    let sk;
    if (i === 0) {
      sk = CLASSES[p.cls].skills[0];
      if (p.cd[0] > t + 0.05) return;
      p.cd[0] = t + sk.cd;
    } else {
      // only an art on the bar that the player knows and that is switched on
      const key = p.slots[i - 1];
      sk = key && ARTS[key];
      if (!sk || !sk.enabled || !(sk.starter || p.learned.has(key))) return;
      // cooldowns belong to the art, not the slot: moving it to another slot doesn't reset it
      if ((p.artCd[key] ?? 0) > t + 0.05) return;
      p.artCd[key] = t + sk.cd;
    }
    p.lastCast = t;
    if (Math.abs(ax) > 0.15) p.face = ax > 0 ? 1 : -1;
    const st = this.stats(p), key = i === 0 ? "" : sk.key, dir = Math.sign(ax || p.face) || 1;
    this.ev({ e: "cast", id: p.id, s: i, a: key, ax: +ax.toFixed(2), ay: +ay.toFixed(2) });
    // an art fights its own way (server/cong-phap.js)
    if (i > 0) {
      CAST[key]?.(this, p, { t, dir, ax, ay, to: sk.aim > 0 ? to : null, aim: sk.aim, atk: st.atk });
      return void this.sendMe(p);
    }
    // the basic attack: a cut in front (or, as an admin may set it, a bolt or a zone ahead)
    switch (sk.type) {
      case "melee":
        this.cone(p, p.x, p.y, ax, ay, sk.range, sk.arc, st.atk, sk.mult);
        break;
      case "bolt":
        this.bolts.push({ id: nextId(), owner: p, art: "", x: p.x + ax * 16, y: p.y + ay * 16, vx: ax * sk.speed, vy: ay * sk.speed, left: sk.range, r: sk.r, atk: st.atk, mult: sk.mult });
        break;
      case "zone": {
        const x = clamp(p.x + dir * sk.dist, 20, this.map.w - 20), y = p.y;
        this.ev({ e: "fx", k: "thunder", x: Math.round(x), y: Math.round(y) });
        this.at(t + sk.delay, () => {
          if (p.gone) return;
          for (const e of this.targetsOf(p))
            if (Math.hypot(e.x - x, e.y - y) <= sk.r + PLAYER_R) {
              if (sk.slow) e.slowUntil = this.t + sk.slowDur;
              this.damage(p, st.atk, e, sk.mult);
            }
        });
        break;
      }
    }
    this.sendMe(p);
  }

  /**
   * A dead monster's drop: with its drop chance, exactly one item, picked by weight from its own list (plus the "*" list if
   * it takes common drops), in a number between that row's min and max. It goes straight into the killer's bag.
   */
  rollDrops(owner, m) {
    if (!(Math.random() < (m.def.dropRate ?? 0))) return;
    const list = [...(DROPS[m.type] ?? []), ...(m.def.commonDrops ? DROPS["*"] ?? [] : [])].filter((d) => d.chance > 0);
    const total = list.reduce((a, d) => a + d.chance, 0);
    if (!total) return;
    let r = Math.random() * total, d = list[list.length - 1];
    for (const x of list) if ((r -= x.chance) < 0) {
      d = x;
      break;
    }
    const got = { [d.item]: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) };
    store.grantItems(owner.userId, got).then(() => {
      if (owner.gone) return;
      this.sendInv(owner.userId);
      send(owner.ws, { t: "drop", items: got });
    }).catch((e) => console.error("drop", e.message));
    this.ev({ e: "drop", id: owner.id, x: Math.round(m.x), y: Math.round(m.y) });
  }


  /** A reward after the player's gain buff (exp, stones, med), never below zero. */
  gain(p, stat, v) {
    return Math.max(0, Math.round(v * (1 + this.buff(p, stat) / 100)));
  }

  kill(e, att) {
    e.dead = true;
    e.hpFrac = 0;
    this.ev({ e: "die", id: e.id });
    const owner = att.kind === "p" ? att : null;
    if (e.kind === "m") {
      e.respawnAt = this.t + e.def.respawn;
      if (owner && !owner.gone) {
        const gx = this.gain(owner, "exp", e.def.exp(owner.level)), gs = this.gain(owner, "stones", e.def.stones);
        owner.pend.exp += gx;
        owner.pend.stones += gs;
        this.ev({ e: "loot", id: owner.id, x: Math.round(e.x), y: Math.round(e.y), exp: gx, stones: gs });
        this.rollDrops(owner, e);
        this.relevel(owner);
        this.sendMe(owner);
      }
      return;
    }
    // a player: falls off the sword
    e.flying = false;
    e.respawnAt = this.t + (this.map.pvp ? PVP.respawn : RESPAWN_WORLD);
    e.busyUntil = 0;
    e.rootUntil = 0;
    if (owner && owner !== e) {
      const key = `${owner.userId}:${e.userId}`, last = this.pairs.get(key);
      const rewarded = last === undefined || this.t - last > PVP.repeatCooldown;
      if (rewarded) {
        this.pairs.set(key, this.t);
        owner.pend.exp += this.gain(owner, "exp", PVP.exp(owner.level));
        owner.pend.stones += this.gain(owner, "stones", PVP.stones);
        owner.pend.rank += PVP.rankWin;
        owner.pend.kills += 1;
        e.pend.rank -= PVP.rankLose;
        e.pend.deaths += 1;
        this.relevel(owner);
        this.sendMe(owner);
      }
      store.logPvp(owner.userId, e.userId, rewarded).catch((err) => console.error("pvp log", err.message));
      this.feed(`${owner.name} đã hạ ${e.name}${rewarded ? "" : " (không tính thưởng: vừa hạ người này)"}.`);
    } else this.feed(`${e.name} đã bị ${att.def?.name ?? "quái"} đánh bại.`);
    this.sendMe(e);
  }

  // ---------------------------------------------------------------- Câu Cá (shared/cau-ca.js; money and things: server/cau-ca.js)
  // p.fish: { s: wait | biting | bite | reel | landing, rod, bait, zone, bx, by (the float), ... } while a line is out
  // The lake's piers are Khu (map.def.fishing), each with a few places: one person a place, taken while their line is out.
  /** Which places of a Khu are taken (by anyone but `but`). */
  khuTaken(k, but = null) {
    const out = new Set();
    for (const q of this.players.values()) if (q !== but && q.fish?.khu === k.id) out.add(q.fish.i);
    return out;
  }
  /** How many are fishing in each Khu. */
  khuOcc() {
    return (this.map.def.fishing ?? []).map((k) => this.khuTaken(k).size);
  }
  /** What to do when the pier is full: the other Khu with fewest people. */
  khuRoom() {
    const occ = this.u?.khuCounts() ?? [], best = occ.map((n, i) => [n, i + 1]).filter(([n, i]) => i !== this.khu && n < KHU_CAP).sort((a, b) => a[0] - b[0]).slice(0, 3);
    return best.length ? `Đợi người khác thu cần, hoặc sang khu khác: ${best.map(([n, i]) => `Khu ${i} (${n}/${KHU_CAP} người)`).join(", ")}.` : "Hãy đợi người khác thu cần.";
  }
  /** The place a player stands at, free: { khu, i, x }; or why not (and, when the Khu is full, which). */
  fishPlace(p) {
    const T = this.map.T, khus = this.map.def.fishing ?? [];
    const k = khus.find((k) => Math.abs(p.y - k.row * T) < 3 && p.x >= k.x0 * T - 8 && p.x <= (k.x1 + 1) * T + 8);
    if (!k) return { why: "Chỉ câu được trên cầu câu. Ra cầu, đứng vào một trong 8 chỗ có bồ đoàn đánh số rồi thả câu." };
    const taken = this.khuTaken(k, p), free = k.spots.map((_, i) => i).filter((i) => !taken.has(i));
    if (!free.length) return { why: `${k.name}${this.khu ? ` Khu ${this.khu}` : ""} đã kín chỗ (${k.spots.length}/${k.spots.length}). ${this.khuRoom()}`, full: this.khu ?? 1 };
    let i = 0;
    k.spots.forEach((x, n) => Math.abs(p.x - x * T) < Math.abs(p.x - k.spots[i] * T) && (i = n));
    const nums = free.map((n) => n + 1).join(", ");
    // anywhere on the pier sits on the nearest place
    if (Math.abs(p.x - k.spots[i] * T) > 1.6 * T) return { why: `Hãy đứng vào một chỗ câu (bồ đoàn có số). ${k.name} còn trống chỗ số ${nums}.` };
    if (taken.has(i)) return { why: `Chỗ số ${i + 1} có người câu rồi. ${k.name} còn trống chỗ số ${nums}.` };
    return { khu: k, i, x: k.spots[i] * T };
  }
  /** Where a cast from a place lands: the first water below, ahead by the rod's reach (or behind, if ahead is land). */
  fishSpot(p, k, x, reach) {
    const M = this.map, T = M.T, solid = (c) => c === "#" || c === "s" || c === "r";
    for (const dir of [p.face || 1, -(p.face || 1)]) {
      const bx = x + dir * reach * T, cx = Math.floor(bx / T);
      for (let r = k.row; r <= k.row + 3; r++) {
        const c = M.cell(cx, r);
        if (solid(c)) break;
        if (c === "w") return { dir, bx, by: r * T };
      }
    }
    return null;
  }
  fishInput(p, m) {
    if (m.a === "cast") return void this.fishCast(p).catch((e) => console.error("fish", e.message));
    if (m.a === "hook") return this.fishHook(p);
    if (m.a === "hold") {
      if (p.fish?.s === "reel") p.fish.hold = m.on === true;
      return;
    }
    if (m.a === "stop" && p.fish && p.fish.s !== "landing") return this.fishEnd(p, "stop");
  }
  async fishCast(p) {
    const t = this.t;
    if (!this.map.def.fishing) return send(p.ws, { t: "toast", m: "Chỉ câu cá được ở Vọng Nguyệt Hồ." });
    if (p.fish || p.dead || p.warping || t < (p.fishCd ?? 0)) return;
    const fail = (m, extra = {}) => ((p.fish = null), send(p.ws, { t: "fish", s: "end", why: extra.full ? "full" : "no", m, ...extra }));
    if (p.flying || !p.ground || p.moving) return fail("Hãy đứng yên ở một chỗ câu trên cầu rồi thả câu.");
    // the place first, and taken at once (before any wait), so two people can't sit on one mat
    const place = this.fishPlace(p);
    if (place.why) return fail(place.why, place.full ? { full: 1, khu: place.full } : {});
    const me = (p.fish = { s: "prep", khu: place.khu.id, i: place.i });
    const g = await cc.gear(p.userId);
    if (p.fish !== me || p.world !== this || p.gone) return;
    if (!g.rod) return fail("Đạo hữu chưa có cần câu. Hãy mua ở quầy Ngư Cụ.");
    if (!g.bait) return fail("Hết mồi câu rồi. Hãy mua mồi ở quầy Ngư Cụ.");
    const rod = RODS[g.rod], bait = BAITS[g.bait], k = place.khu;
    const spot = this.fishSpot(p, k, place.x, rod.reach);
    if (!spot) return fail("Không quăng được câu từ chỗ này.");
    // seated on the mat, facing the water
    p.x = place.x;
    p.face = spot.dir;
    const wait = (FCAST.wait[0] + Math.random() * (FCAST.wait[1] - FCAST.wait[0])) / bait.speed;
    const nib = Array.from({ length: Math.floor(Math.random() * (FCAST.nibbles + 1)) }, () => t + 0.8 + Math.random() * Math.max(0.2, wait - 1.4)).sort((a, b) => a - b);
    Object.assign(me, { s: "wait", rod: g.rod, bait: g.bait, bx: spot.bx, by: spot.by, biteAt: t + 0.6 + wait, nib, struck: false });
    send(p.ws, { t: "fish", s: "cast", bx: Math.round(spot.bx), by: spot.by, rod: g.rod, bait: g.bait, khu: this.khu ?? 0, n: place.i + 1, left: g.baitLeft });
  }
  fishHook(p) {
    const f = p.fish;
    if (!f) return;
    if (f.s === "wait") return this.fishEnd(p, "early");
    if (f.s === "biting") return void (f.struck = true);
    if (f.s === "bite") this.fishReel(p);
  }
  fishReel(p) {
    const f = p.fish;
    f.s = "reel";
    f.r = reelStart();
    f.hold = false;
    const fish = FISH[f.key];
    send(p.ws, { t: "fish", s: "reel", rarity: fish.rarity, bar: RODS[f.rod].bar, fight: fish.fight });
  }
  /** Each tick while a line is out. */
  stepFish(p) {
    const f = p.fish, t = this.t;
    if (f.s === "prep") return;
    // moving, jumping, taking off, dying: the line comes in (a fish on it is lost)
    if (p.dead || p.flying || p.warping || p.moving || p.in.jump || !p.ground) return f.s !== "landing" && this.fishEnd(p, "move");
    if (f.s === "wait") {
      while (f.nib.length && t >= f.nib[0]) (f.nib.shift(), send(p.ws, { t: "fish", s: "nib" }));
      if (t < f.biteAt) return;
      // a bite: the bait is taken (from the bag first), then the fish is on
      f.s = "biting";
      cc.takeBait(p.userId, f.bait).then((ok) => {
        if (p.fish !== f) return;
        if (!ok) return this.fishEnd(p, "nobait");
        f.key = rollFish(f.rod, f.bait);
        f.s = "bite";
        f.until = this.t + FCAST.window + RODS[f.rod].hook + FCAST.grace;
        send(p.ws, { t: "fish", s: "bite", window: +(FCAST.window + RODS[f.rod].hook).toFixed(2) });
        if (f.struck) this.fishReel(p);
      }, (e) => (console.error("fish bait", e.message), p.fish === f && this.fishEnd(p, "stop")));
      return;
    }
    if (f.s === "bite" && t > f.until) return this.fishEnd(p, "miss");
    if (f.s !== "reel") return;
    const fish = FISH[f.key], out = reelStep(f.r, f.hold, fish.fight, RODS[f.rod], DT);
    send(p.ws, { t: "fr", f: +f.r.f.toFixed(3), z: +f.r.z.toFixed(3), p: +f.r.p.toFixed(3), on: f.r.on ? 1 : 0 });
    if (out === "lost") return this.fishEnd(p, "lost", { rarity: fish.rarity });
    if (out !== "land") return;
    f.s = "landing";
    const g = rollWeight(f.key, f.bait);
    cc.land(p.userId, f.key, g).then(async (r) => {
      if (p.fish === f) p.fish = null;
      p.fishCd = this.t + FCAST.cooldown;
      const who = p.world ?? this;
      who.ev({ e: "fland", id: p.id, fish: f.key, x: Math.round(f.bx), y: f.by });
      send(p.ws, { t: "fish", s: "end", why: "land", fish: f.key, g, best: r.best, record: r.record, stones: r.stones });
      // a rare one, or a lake record: everyone here hears; a Tiên fish: the whole world does
      const R = RARITY[fish.rarity], line = `${p.name} câu được ${fish.name} [${R.name}] nặng ${kgText(g)}${r.record ? ", kỷ lục của Vọng Nguyệt Hồ!" : "!"}`;
      if (fish.rarity >= 5) this.u?.feed(line);
      else if (fish.rarity >= 4 || (r.record && fish.rarity >= 2)) who.feed(line);
      who.sendInv(p.userId);
      if (r.stones) who.refresh(p.userId, await store.loadCharacter(p.userId));
    }, (e) => (console.error("fish land", e.message), p.fish === f && this.fishEnd(p, "stop")));
  }
  /** The line comes in: why (stop, move, early, miss, lost, nobait), told to the player. */
  fishEnd(p, why, extra = {}) {
    p.fish = null;
    p.fishCd = this.t + FCAST.cooldown;
    send(p.ws, { t: "fish", s: "end", why, ...extra });
  }

  // ---------------------------------------------------------------- the tick
  at(time, fn) {
    this.later.push({ time, fn });
  }
  ev(e) {
    this.events.push(e);
  }
  feed(m) {
    this.broadcast({ t: "feed", m });
  }

  step() {
    this.t += DT;
    this.tick++;
    const t = this.t;
    // timed hits
    if (this.later.length) {
      const due = this.later.filter((l) => l.time <= t);
      this.later = this.later.filter((l) => l.time > t);
      for (const l of due) l.fn();
    }
    for (const p of this.players.values()) this.stepPlayer(p);
    for (const m of this.ents.values()) if (m.kind === "m") this.stepMonster(m);
    this.stepBolts();
    // the lake: how full each Khu is, to everyone here whenever it changes
    if (this.map.def.fishing) {
      const occ = JSON.stringify(this.khuOcc());
      if (occ !== this.lastOcc) (this.lastOcc = occ), this.broadcast({ t: "fzones", occ: JSON.parse(occ) });
    }
    this.snapshot();
    if (this.tick % 5 === 0) for (const p of this.players.values()) this.sendMe(p);
  }

  /** Where someone appears: the map's spawn, nudged a little, always on open ground. */
  spawnPoint() {
    const s = this.map.spawn;
    for (let i = 0; i < 12; i++) {
      const x = s.x + rnd(-40, 40);
      if (fits(x, s.y, this.map)) return { x, y: s.y, vx: 0, vy: 0, ground: false };
    }
    return { x: s.x, y: s.y, vx: 0, vy: 0, ground: false };
  }
  /** Flying things (ghosts) just move, kept inside the map. */
  move(e, dx, dy) {
    e.x = clamp(e.x + dx, 20, this.map.w - 20);
    e.y = clamp(e.y + dy, 40, this.map.h - 10);
  }

  /**
   * Where an aimed zone lands: the point asked for, pulled in to `reach` px of the caster (measured from their chest), and
   * dropped onto the ground under it when that is within three tiles; otherwise it bursts in the air there.
   */
  zoneSpot(p, to, reach) {
    const cx = p.x, cy = p.y - 30;
    let dx = to.x - cx, dy = to.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > reach) (dx *= reach / d), (dy *= reach / d);
    const x = clamp(cx + dx, 20, this.map.w - 20);
    let y = clamp(cy + dy, 40, this.map.h - 2);
    y = zoneLanding(this.map, x, y);
    return [x, y];
  }

  /** Get on (or off) the flying sword. Getting off in the air just drops them: gravity takes over. */
  setFlying(p, on) {
    if (on === p.flying) return;
    if (on) {
      if (p.dead || p.warping) return;
      if (this.map.def.peaceful) return send(p.ws, { t: "toast", m: "Ở Vọng Nguyệt Hồ không ngự kiếm được." });
      if (!canFly(p.level)) return send(p.ws, { t: "toast", m: `Tới cảnh giới ${flyRealmName()} mới ngự kiếm phi hành được.` });
      if (this.map.pvp && !FLY.arena) return send(p.ws, { t: "toast", m: "Nơi tỷ thí không được ngự kiếm." });
      p.flying = true;
      p.meditating = false;
      p.vy = Math.min(0, p.vy);
      this.ev({ e: "fly", id: p.id, on: 1 });
    } else {
      p.flying = false;
      this.ev({ e: "fly", id: p.id, on: 0 });
    }
  }

  stepPlayer(p) {
    const t = this.t;
    if (p.dead) {
      if (p.fish && p.fish.s !== "landing") this.fishEnd(p, "move");
      if (t >= p.respawnAt) {
        Object.assign(p, this.spawnPoint());
        p.dead = false;
        p.hpFrac = 1;
        p.slowUntil = 0;
        p.protectUntil = t + PVP.spawnProtect;
        this.ev({ e: "spawn", id: p.id });
        this.sendMe(p);
      }
      return;
    }
    const st = this.stats(p);
    // planted by an art (Tam Tuyệt Kiếm, Diệt Thế Thần Bạo): no moving or jumping until it ends
    const inp = p.rootUntil > t ? { dx: 0, dy: 0, jump: false, down: false } : p.in;
    // the realm needed went up (an admin's edit), or the exp went down: off the sword
    if (p.flying && (!canFly(p.level) || (this.map.pvp && !FLY.arena) || this.map.def.peaceful)) this.setFlying(p, false);
    p.moving = Math.abs(inp.dx) > 0.05 || (p.flying && Math.abs(inp.dy) > 0.05);
    const wasGround = p.ground;
    stepBody(p, { ...inp, jump: inp.jump || (p.jumpUntil > t && !(p.rootUntil > t)) }, st.spd * PHYS.RUN * (p.flying ? FLY.speed : 1), DT, this.map, t);
    if (wasGround && !p.ground) p.jumpUntil = 0;
    if (p.moving && p.busyUntil <= t) p.face = inp.dx > 0 ? 1 : -1;
    // a map's burning ground (the abyss's lava): touching it sears off a share of sinh lực and throws the player back out
    // onto the last solid ground they stood on, as a platformer does; nobody wades about at the bottom of a lava pool
    const hurt = this.map.def.hurt, T = this.map.T;
    const under = (y) => this.map.cell(Math.floor(p.x / T), Math.floor(y / T));
    if (hurt && under(p.y - 6) === hurt.cell && t >= (p.burnSafe ?? 0)) {
      p.hpFrac -= hurt.hit;
      p.lastHurt = t;
      this.ev({ e: "burn", id: p.id });
      send(p.ws, { t: "toast", m: "Bị nham thạch thiêu đốt!" });
      if (p.hpFrac <= 0) {
        p.dead = true;
        p.hpFrac = 0;
        p.respawnAt = t + RESPAWN_WORLD;
        this.ev({ e: "die", id: p.id });
        this.feed(`${p.name} đã bị nham thạch thiêu đốt.`);
        this.sendMe(p);
        return;
      }
      Object.assign(p, p.safe ?? this.spawnPoint(), { vx: 0, vy: 0, ground: false, jumpUntil: 0 });
      p.slowUntil = t + 1;
      p.burnSafe = t + 1;
      this.sendMe(p);
    } else if (hurt && p.ground && fits(p.x, p.y, this.map)) {
      // a safe spot is solid ground with no lava within a tile and a half either side
      const row = Math.floor((p.y + 2) / T), near = [-1.5, -0.75, 0, 0.75, 1.5].some((k) => this.map.cell(Math.floor((p.x + k * T) / T), row) === hurt.cell);
      if (!near) p.safe = { x: p.x, y: p.y };
    }
    // fell out of the world somehow: back to the spawn
    if (p.y > this.map.h + 200) Object.assign(p, this.spawnPoint());
    // a way out: to the map it leads to, or (a road still being built) a word and a step back
    const gate0 = this.map.portalAt(p.x, p.y);
    // a Gia Viên's way out leads back to wherever its owner came from
    const gate = gate0?.to === "@back" ? { ...gate0, to: this.u?.worlds.has(p.homeFrom?.key) && p.homeFrom.key !== this.key ? p.homeFrom.key : START_MAP } : gate0;
    if (gate && t >= p.portalAt && gate.to && this.u?.worlds.has(gate.to) && !p.warping) {
      // the teleport: everyone here sees them break into light at the gate, their own screen closes in a star; a moment
      // later they are moved, and the map they arrive on sees a pillar of light bring them down
      p.portalAt = t + 2.5;
      p.warping = true;
      p.in = { dx: 0, dy: 0, jump: false, down: false };
      this.ev({ e: "warp", id: p.id, x: Math.round(p.x), y: Math.round(p.y), out: 1 });
      send(p.ws, { t: "warp", to: gate.to });
      const from = this.key, back = gate0.to === "@back" && gate.to === p.homeFrom?.key ? p.homeFrom?.at : null;
      this.at(t + WARP_DELAY, () => {
        if (p.gone || p.world !== this) return void (p.warping = false);
        this.u.transfer(p, gate.to, from, back).finally(() => (p.warping = false));
      });
      return;
    }
    if (gate && t >= p.portalAt) {
      p.portalAt = t + 2.5;
      send(p.ws, { t: "portal", m: gate.msg, to: gate.to });
      // step them back off the arrow so it doesn't fire again straight away
      const back = p.x >= gate.x ? 1 : -1;
      if (fits(gate.x + back * gate.r * 2, p.y, this.map)) p.x = gate.x + back * gate.r * 2;
    }
    if (p.fish) this.stepFish(p);
    // cultivating at the spirit vein: standing still, not fighting, up to today's cap
    p.meditating = !p.moving && !!p.ground && p.medLeft > 0 && t - p.lastHurt > MEDITATE.calmAfterHit && t - p.lastCast > 1.5 && this.map.inSpring(p.x, p.y);
    if (p.meditating) {
      p.medAcc += DT;
      if (p.medAcc >= 1) {
        p.medAcc -= 1;
        const g = Math.min(this.gain(p, "med", MEDITATE.perSec(p.level)), p.medLeft);
        p.pend.med += g;
        p.medLeft -= g;
        this.relevel(p);
      }
    } else p.medAcc = 0;
  }

  /** A monster at (x, y): from the map, or (temp) one an admin dropped by a player to try, which never comes back. */
  addMonster(type, x, y, temp = false) {
    const d = MONSTERS[type];
    if (!d) return null;
    const m = {
      id: nextId(), kind: "m", type, def: d, x, y, home: { x, y }, face: -1, hpFrac: 1, dead: false, respawnAt: 0, slowUntil: 0, lastHurt: -99, nextAtk: 0,
      target: null, wander: { x, y }, wanderAt: 0, atkAnim: 0, vx: 0, vy: 0, ground: false, dropUntil: 0, temp, bornAt: this.t,
      st: { maxHp: d.hp, atk: d.atk, def: d.def, spd: d.spd },
    };
    this.ents.set(m.id, m);
    return m;
  }
  spawnMonsters() {
    for (const m of this.map.mobs) this.addMonster(m.type, m.x, m.y);
  }
  /** An admin's test: a monster of that type a little way from the player. Gone after it dies or after 5 minutes. */
  summon(uid, type) {
    const p = this.players.get(uid);
    if (!p || !MONSTERS[type]) return null;
    const d = MONSTERS[type], x = clamp(p.x + p.face * 160, 30, this.map.w - 30);
    const m = this.addMonster(type, x, d.fly ? p.y - 40 : p.y, true);
    // a trial monster is that player's alone: it goes for nobody else, and is gone when they leave the map
    m.forUid = uid;
    this.ev({ e: "spawn", id: m.id });
    return m;
  }

  stepMonster(m) {
    const t = this.t, d = m.def;
    if (m.dead) {
      if (m.temp) {
        if (t - m.respawnAt > -d.respawn + 1.5) this.ents.delete(m.id);
        return;
      }
      if (t >= m.respawnAt) {
        Object.assign(m, { dead: false, hpFrac: 1, x: m.home.x, y: m.home.y, vx: 0, vy: 0, target: null });
        this.ev({ e: "spawn", id: m.id });
      }
      return;
    }
    if (m.temp && (t - m.bornAt > 300 || (m.forUid && !this.players.has(m.forUid)))) return void this.ents.delete(m.id);
    if (d.style === "none") {
      // straw dummies heal back slowly when left alone
      if (t - m.lastHurt > 4) m.hpFrac = Math.min(1, m.hpFrac + 0.1 * DT);
      return;
    }
    const spd = d.spd * (m.slowUntil > t ? 0.5 : 1);
    // pick a prey: whoever hit it, or anyone close, as long as they're out of the safe zone and not too far from its home
    const ok = (p) => p && !p.gone && !p.dead && p.kind === "p" && p.protectUntil <= t && (!m.forUid || p.userId === m.forUid) && Math.hypot(p.x - m.home.x, p.y - m.home.y) < Math.max(d.aggro, 60) * 3;
    const sense = Math.max(d.aggro, d.style === "ranged" ? d.range : 0);
    if (!ok(m.target) || Math.hypot(m.target.x - m.x, m.target.y - m.y) > sense * 1.6) {
      m.target = null;
      let bd = sense;
      for (const p of this.players.values())
        if (ok(p)) {
          const dd = Math.hypot(p.x - m.x, p.y - m.y);
          if (dd < bd) (bd = dd), (m.target = p);
        }
      if (!m.target && ok(m.lastHitBy) && t - m.lastHurt < 3) m.target = m.lastHitBy;
    }
    // where to go: at the prey (melee), or to a spot at about two thirds of its range, backing off if it comes too close
    let gx = null, gy = null, run = 1;
    if (m.target) {
      const p = m.target, ty = d.fly ? p.y - 34 : p.y, dx = p.x - m.x, dd = Math.hypot(dx, ty - m.y);
      m.face = dx > 0 ? 1 : -1;
      if (d.style === "melee") {
        if (Math.hypot(p.x - m.x, p.y - m.y) <= d.reach + PLAYER_R) {
          if (t >= m.nextAtk) {
            m.nextAtk = t + d.cd;
            m.atkAnim = t + 0.3;
            this.damage(m, d.atk, p, d.mult);
          }
        } else (gx = p.x - Math.sign(dx) * d.reach * 0.6), (gy = ty);
      } else {
        if (dd <= d.range && t >= m.nextAtk) {
          // a shot at the prey's chest, flying at shotSpeed, carrying the monster's type so it's drawn as its own
          m.nextAtk = t + d.cd;
          m.atkAnim = t + 0.3;
          const sy = m.y - (d.fly ? 0 : 24), ax = p.x - m.x, ay = p.y - 26 - sy, l = Math.hypot(ax, ay) || 1;
          this.bolts.push({ id: nextId(), owner: m, art: "@" + m.type, x: m.x, y: sy + 30, vx: (ax / l) * d.shotSpeed, vy: (ay / l) * d.shotSpeed, left: d.range * 1.3, r: 12, atk: d.atk, mult: d.mult });
        }
        if (dd > d.range * 0.85) (gx = p.x - Math.sign(dx) * d.range * 0.6), (gy = ty);
        else if (dd < d.range * 0.4) (gx = m.x - Math.sign(dx) * 60), (gy = ty), (run = 0.7);
      }
    } else {
      if (t >= m.wanderAt) {
        m.wanderAt = t + rnd(2, 5);
        m.wander = { x: m.home.x + rnd(-70, 70), y: d.fly ? m.home.y + rnd(-30, 30) : m.home.y };
      }
      (gx = m.wander.x), (gy = m.wander.y), (run = 0.5);
    }
    if (d.fly) {
      // flyers go straight there, through anything
      if (gx !== null) {
        const dx = gx - m.x, dy = gy - m.y, l = Math.hypot(dx, dy);
        if (l > 2) {
          const st = Math.min(l, spd * DT * run);
          this.move(m, (dx / l) * st, (dy / l) * st);
          if (!m.target && Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
        }
      }
    } else {
      // walkers: along the ground with gravity, the same steps as players; a hop when a wall is in the way
      const dx = gx === null || Math.abs(gx - m.x) < 4 ? 0 : Math.sign(gx - m.x), x0 = m.x;
      stepBody(m, { dx, jump: !!m.hop, down: false }, spd * run, DT, this.map, t);
      m.hop = dx !== 0 && m.ground && Math.abs(m.x - x0) < 0.01;
      if (!m.target && dx) m.face = dx;
      if (m.y > this.map.h + 100) Object.assign(m, { x: m.home.x, y: m.home.y, vx: 0, vy: 0 });
    }
  }

  stepBolts() {
    const keep = [];
    for (const b of this.bolts) {
      if (b.owner.gone) continue;
      if (b.hit) {
        if (stepReturning(this, b, DT)) keep.push(b);
        continue;
      }
      const s = Math.hypot(b.vx, b.vy) * DT;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.left -= s;
      let hit = null;
      for (const e of this.targetsOf(b.owner))
        if (Math.hypot(e.x - b.x, e.y - b.y) <= b.r + PLAYER_R) {
          hit = e;
          break;
        }
      if (hit) {
        this.damage(b.owner, b.atk, hit, b.mult);
        this.ev({ e: "boom", x: Math.round(b.x), y: Math.round(b.y) });
        continue;
      }
      // walls stop them (bolts fly at chest height, 30 px above the line they're aimed along)
      if (this.map.solid(Math.floor(b.x / this.map.T), Math.floor((b.y - 30) / this.map.T))) {
        this.ev({ e: "boom", x: Math.round(b.x), y: Math.round(b.y) });
        continue;
      }
      if (b.left > 0 && b.x > 0 && b.x < this.map.w && b.y > 0 && b.y < this.map.h) keep.push(b);
    }
    this.bolts = keep;
  }

  snapshot() {
    const t = this.t, P = [], M = [], B = [];
    for (const p of this.players.values())
      P.push([p.id, Math.round(p.x), Math.round(p.y), p.face, Math.round(Math.max(0, p.hpFrac) * 1000),
        (p.dead ? 1 : 0) | (p.slowUntil > t ? 4 : 0) | (p.protectUntil > t ? 8 : 0) | (p.meditating ? 16 : 0) | (p.moving ? 32 : 0) | (p.busyUntil > t ? 64 : 0) | (p.ground ? 0 : 128) | (p.flying ? 256 : 0) | (p.rootUntil > t ? 512 : 0),
        // fishing: where the float is, what it is doing (1 floating, 2 under, 3 a fish on the line), the rod's tier
        ...(p.fish?.bx ? [Math.round(p.fish.bx), Math.round(p.fish.by), FSTATE[p.fish.s] ?? 1, RODS[p.fish.rod]?.tier ?? 1] : [])]);
    for (const m of this.ents.values())
      if (m.kind === "m") M.push([m.id, m.type, Math.round(m.x), Math.round(m.y), m.face, Math.round(m.hpFrac * 1000), (m.dead ? 1 : 0) | (m.slowUntil > t ? 4 : 0) | (m.atkAnim > t ? 128 : 0)]);
    // the thrower's id: a flying sword is drawn as the weapon its owner holds
    // ... and the art it belongs to ("" for none): Phi Kiếm draws the weapon, other arts their own effect
    for (const b of this.bolts) B.push([b.id, b.owner.id, Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.art ?? ""]);
    const msg = JSON.stringify({ t: "s", k: this.tick, P, M, B, E: this.events });
    this.events = [];
    for (const p of this.players.values()) sendRaw(p.ws, msg);
  }

  broadcast(obj, except = null) {
    const msg = JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except) sendRaw(p.ws, msg);
  }

  get online() {
    return this.players.size;
  }
}

const zero = () => ({ exp: 0, stones: 0, rank: 0, kills: 0, deaths: 0, med: 0 });
const FSTATE = { wait: 1, biting: 1, bite: 2, reel: 3, landing: 3 };
const rnd = (a, b) => a + Math.random() * (b - a);
const info = (p) => ({ id: p.id, name: p.name, look: p.look, lv: p.level, sect: p.sect ? { n: p.sect.name, e: p.sect.emblem, r: p.sect.rank } : null });
// a client that can't keep up (more than 1 MB queued) skips snapshots instead of growing the server's memory
function sendRaw(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1 << 20) ws.send(msg);
}
const send = (ws, obj) => sendRaw(ws, JSON.stringify(obj));

/**
 * Every map at once. It takes the connections, logs players in onto the map they were last on, moves them through the
 * gates from one map to another, and answers the API and the admin site for a player wherever they are.
 */
export class Universe {
  constructor() {
    this.worlds = new Map(Object.keys(MAPS).filter((id) => !MAPS[id].instanced).map((id) => [id, new World(id, this)]));
    // one tick for every map, so all their clocks stay equal
    this.timer = setInterval(() => {
      for (const w of this.worlds.values()) w.step();
      if (++this.ticks % TICK_HZ === 0) this.pushKhu();
    }, 1000 / TICK_HZ);
    this.ticks = 0;
    // Truyền Âm older than pm.keep_days goes, once an hour
    this.pruner = setInterval(() => dao.prune().catch((e) => console.error("pm prune", e.message)), 3600_000);
    this.pruner.unref?.();
    this.saver = setInterval(() => {
      for (const w of this.worlds.values()) w.saveAll();
    }, 5000);
  }
  /** userId -> player, every map (a fresh Map each time: for lookups, not for keeping). */
  get players() {
    const all = new Map();
    for (const w of this.worlds.values()) for (const [k, v] of w.players) all.set(k, v);
    return all;
  }
  get online() {
    let n = 0;
    for (const w of this.worlds.values()) n += w.players.size;
    return n;
  }
  worldOf(uid) {
    for (const w of this.worlds.values()) if (w.players.has(uid)) return w;
    return null;
  }
  broadcast(obj) {
    for (const w of this.worlds.values()) w.broadcast(obj);
  }
  feed(m) {
    this.broadcast({ t: "feed", m });
  }

  attach(ws) {
    ws.bucket = 80;
    ws.lastFill = Date.now();
    const authTimer = setTimeout(() => !ws.player && ws.close(4001, "auth timeout"), 8000);
    ws.on("message", (raw, binary) => {
      // a token bucket: 40 messages a second, bursts of 80; a client far past that is cut off
      const now = Date.now();
      ws.bucket = Math.min(80, ws.bucket + ((now - ws.lastFill) / 1000) * 40);
      ws.lastFill = now;
      if (--ws.bucket < -40) return ws.close(4008, "flood");
      if (ws.bucket < 0 || binary) return;
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!ws.player) {
        if (m.t === "auth" && !ws.authing) {
          ws.authing = true;
          clearTimeout(authTimer);
          this.join(ws, m.token).catch((e) => {
            console.error("join", e);
            ws.close(1011, "join failed");
          });
        }
        return;
      }
      // whichever map the player is on now
      ws.player.world.onMessage(ws.player, m);
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      const p = ws.player;
      if (p) {
        sessionLock.run(p.userId, () => p.world.remove(p)).catch((e) => console.error("leave", e));
        // gone for good (not replaced by a new tab of the same account): friends hear it
        setTimeout(() => !this.players.has(p.userId) && this.presence(p, false), 1500);
      }
    });
    ws.on("error", () => {});
  }

  // joining and leaving for one account run one at a time: a second tab replaces the first, never runs beside it
  async join(ws, token) {
    const uid = await userFromToken(token);
    if (!uid) {
      send(ws, { t: "fatal", m: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại." });
      return ws.close(4001, "bad token");
    }
    await sessionLock.run(uid, async () => {
      const old = this.players.get(uid);
      if (old) {
        send(old.ws, { t: "fatal", m: "Tài khoản vừa vào game ở nơi khác." });
        old.ws.close(4002, "replaced");
        await old.world.remove(old);
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      const ch = await store.loadCharacter(uid);
      if (!ch) {
        send(ws, { t: "fatal", m: "Đạo hữu chưa tạo nhân vật." });
        return ws.close(4003, "no character");
      }
      const inv = await store.inventory(uid);
      const buffs = await store.activeBuffs(uid);
      const sect = await sectOf(uid);
      const social = await dao.socialOf(uid);
      const unread = await dao.unreadCount(uid);
      const mute = (await store.chatMute(uid)) ?? 0;
      if (ws.readyState !== WebSocket.OPEN) return;
      // back on the map they were last on (at its arrival point), or the starter town
      (this.worlds.get(ch.mapId) ?? this.worlds.get(START_MAP)).admit(ws, ch, inv, buffs, sect, social);
      const me = ws.player;
      if (me) {
        me.chatMuted = mute;
        send(ws, { t: "unread", n: unread });
        this.presence(me, true);
      }
    });
  }

  /**
   * Walk a player through a gate: off this map, onto the other, just inside its gate back to where they came from (or at
   * its spawn). Nothing they carry is lost: their unsaved gains and saves in flight go with them. The map is remembered.
   */
  async transfer(p, toId, fromId, at0 = null) {
    const from = p.world, to = this.worlds.get(toId);
    if (!to || p.gone || from === to) return;
    // the bag first (the one wait), then off one map and onto the other in the same moment: never on no map at all
    const inv = await store.inventory(p.userId).catch(() => ({}));
    if (p.gone || p.world !== from) return;
    from.leave(p);
    const back = at0 ? null : to.map.portals.find((g) => g.to === fromId);
    let at = at0 && fits(at0.x, at0.y, to.map) ? { x: at0.x, y: at0.y } : null;
    if (back && !at) {
      // beside the gate, inward first, the first spot that is open ground and not the gate itself
      const dir = back.x < to.map.w / 2 ? 1 : -1;
      for (const k of [3, -3, 2, -2, 4, -4]) {
        const x = back.x + dir * back.r * k;
        if (fits(x, back.y, to.map) && !to.map.portalAt(x, back.y)) {
          at = { x, y: back.y };
          break;
        }
      }
    }
    at ??= to.spawnPoint();
    p.portalAt = to.t + 2.5;
    p.protectUntil = to.t + PVP.spawnProtect;
    p.in = { dx: 0, dy: 0, jump: false, down: false };
    p.meditating = false;
    p.flying = false;
    to.enter(p, inv, at);
    to.ev({ e: "warp", id: p.id, x: Math.round(at.x), y: Math.round(at.y), out: 0 });
    // a Gia Viên isn't remembered: logging in again starts where they came from
    if (!to.grid && !to.khu) store.setMap(p.userId, toId).catch((e) => console.error("map", e.message));
    if (to.grid) to.ev({ e: "spawn", id: p.id });
  }

  // ---- Gia Viên: each owner's copy of the homestead, made when they go in, dropped a while after they leave
  /** Take a player into their own Gia Viên (unlocked), from wherever they are; remembered to come back to. */
  async enterHome(uid) {
    const p = this.players.get(uid);
    if (!p) throw new Error("not online");
    const key = `gv:${uid}`;
    if (p.world.key === key) return;
    if (p.warping || p.dead) throw Object.assign(new Error("Không thể vào Gia Viên lúc này."), { status: 409 });
    let w = this.worlds.get(key);
    if (!w) {
      const house = await gv.houseOf(uid);
      w = this.worlds.get(key) ?? new World(HOME_MAP, this, { key, owner: uid, house });
      this.worlds.set(key, w);
    }
    clearTimeout(this.homeDrops?.get(key));
    p.homeFrom = { key: p.world.key, at: { x: p.x, y: p.y } };
    send(p.ws, { t: "warp", to: key });
    p.warping = true;
    p.world.ev({ e: "warp", id: p.id, x: Math.round(p.x), y: Math.round(p.y), out: 1 });
    await new Promise((r) => setTimeout(r, WARP_DELAY * 1000));
    try {
      await this.transfer(p, key, p.world.key);
    } finally {
      p.warping = false;
    }
  }
  // ---- Câu Cá: the lake is KHU_COUNT Khu (worlds "cc:<n>", made when someone goes in, dropped a while after the last leaves),
  // each for at most KHU_CAP people; someone on their way in counts already, so a Khu never takes more than its room
  /** How many are in (or on their way into) Khu n. */
  khuCount(n) {
    const w = this.worlds.get(khuKey(n));
    return w ? w.players.size + (w.coming ?? 0) : 0;
  }
  khuCounts() {
    return Array.from({ length: KHU_COUNT }, (_, i) => this.khuCount(i + 1));
  }
  /**
   * Take a player to the lake: into Khu `want`, or (null) the first Khu with room, from wherever they are (moving from
   * one Khu to another keeps where they came from, for the way out).
   */
  async enterFishing(uid, want = null) {
    const p = this.players.get(uid);
    if (!p) throw new Error("not online");
    const no = (m) => Object.assign(new Error(m), { status: 409 });
    const cur = khuOf(p.world.key);
    if (want !== null && (!Number.isInteger(want) || want < 1 || want > KHU_COUNT)) throw Object.assign(new Error("Không có khu này."), { status: 400 });
    if (cur && (want === null || want === cur)) return cur;
    if (p.warping || p.dead) throw no("Không thể tới Vọng Nguyệt Hồ lúc này.");
    if (p.fish) throw no("Hãy thu cần trước khi đổi khu.");
    let n = want;
    if (n === null) {
      for (let i = 1; i <= KHU_COUNT && n === null; i++) if (this.khuCount(i) < KHU_CAP) n = i;
      if (n === null) throw no(`Cả ${KHU_COUNT} khu đều đã đủ ${KHU_CAP} người, hãy thử lại sau.`);
    } else if (this.khuCount(n) >= KHU_CAP) throw no(`Khu ${n} đã đủ ${KHU_CAP} người, hãy chọn khu khác.`);
    const key = khuKey(n);
    let w = this.worlds.get(key);
    if (!w) this.worlds.set(key, (w = new World(FISH_MAP, this, { key, khu: n })));
    clearTimeout(this.homeDrops?.get(key));
    w.coming = (w.coming ?? 0) + 1;
    try {
      if (!cur) p.homeFrom = { key: p.world.key, at: { x: p.x, y: p.y } };
      send(p.ws, { t: "warp", to: key });
      p.warping = true;
      p.world.ev({ e: "warp", id: p.id, x: Math.round(p.x), y: Math.round(p.y), out: 1 });
      await new Promise((r) => setTimeout(r, WARP_DELAY * 1000));
      await this.transfer(p, key, p.world.key);
    } finally {
      w.coming--;
      p.warping = false;
      if (!w.players.size) this.dropHomeLater(key);
    }
    return n;
  }
  /** Every second: if how full the Khu are changed, everyone at the lake is told (for the box of Khu). */
  pushKhu() {
    const occ = this.khuCounts(), j = JSON.stringify(occ);
    if (j === this.lastKhu) return;
    this.lastKhu = j;
    const raw = JSON.stringify({ t: "fkhu", occ });
    for (const w of this.worlds.values()) if (w.khu) for (const q of w.players.values()) sendRaw(q.ws, raw);
  }
  /** Whether a player stands at the Ngư Cụ stall (buying and selling are done there, in person). */
  atFishShop(uid) {
    const p = this.players.get(uid), sh = p?.world.map.def.shop;
    return !!(p && sh && p.world.khu && Math.abs(p.x - sh.x * p.world.map.T) <= sh.r * p.world.map.T && !p.dead);
  }
  /** Back out of a Gia Viên to where they came from. */
  async leaveHome(uid) {
    const p = this.players.get(uid);
    if (!p || !p.world.grid) return;
    const to = this.worlds.has(p.homeFrom?.key) && !this.worlds.get(p.homeFrom.key).grid ? p.homeFrom.key : START_MAP;
    await this.transfer(p, to, p.world.key, p.homeFrom?.at ?? null);
  }
  dropHomeLater(key) {
    this.homeDrops ??= new Map();
    clearTimeout(this.homeDrops.get(key));
    this.homeDrops.set(key, setTimeout(() => {
      const w = this.worlds.get(key);
      if (w && (w.grid || w.khu) && !w.players.size && !w.coming) this.worlds.delete(key);
    }, 60_000));
  }
  /**
   * The owner moved into another house: if their Gia Viên is up, it stands there now; whoever is inside is put back at
   * the gate (the new walls might be where they stood) and shown it.
   */
  async homeHouse(owner) {
    const w = this.worlds.get(`gv:${owner}`);
    if (!w) return;
    const house = await gv.houseOf(owner);
    if (house === w.house) return;
    w.house = house;
    w.grid = new HomeGrid(w.grid.base).load(houseCells(house));
    w.map = w.grid.wrap();
    const sp = w.map.spawn;
    for (const p of w.players.values()) {
      Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, ground: false });
      send(p.ws, { t: "home", owner: w.owner, mine: p.userId === w.owner, house, moved: [p.x, p.y] });
    }
  }
  /** The farm changed (or someone came in): tell whoever is in that Gia Viên. */
  async homeState(owner) {
    const w = this.worlds.get(`gv:${owner}`);
    if (!w || !w.players.size) return;
    const st = await gv.state(owner).catch(() => null);
    if (st) w.broadcast({ t: "homest", ...st });
  }

  // ---- chat: who hears a line, and the last lines of each channel (kept in memory, for the chat panel)
  /** Send msg to every player for whom who(player) holds, except those who blocked the sender; remember it under key. */
  say(msg, from, who, key) {
    const raw = JSON.stringify(msg);
    for (const w of this.worlds.values()) for (const q of w.players.values()) if (who(q) && !q.blocked.has(from.userId)) sendRaw(q.ws, raw);
    this.hist ??= new Map();
    const list = this.hist.get(key) ?? [];
    list.push({ u: from.userId, msg });
    if (list.length > 40) list.shift();
    this.hist.set(key, list);
  }
  history(p, ch) {
    const key = ch === "k" ? `k${p.world.key}` : ch === "s" ? (p.sect ? `s${p.sect.id}` : null) : "w";
    const list = (key && this.hist?.get(key)) || [];
    send(p.ws, { t: "hist", ch: ch === "k" || ch === "s" ? ch : "w", list: list.filter((x) => !p.blocked.has(x.u)).map((x) => x.msg) });
  }
  /** Truyền Âm: a few a second at most; only to a friend (checked here first, then in the database when it is saved). */
  whisper(p, m) {
    const c = typeof m.c === "string" ? m.c.slice(0, 16) : "";
    const fail = (why) => send(p.ws, { t: "pmerr", c, m: why });
    if (typeof m.m !== "string") return;
    const now = Date.now();
    if (now < p.pmAt) return fail("Truyền Âm quá nhanh, chậm lại một chút.");
    if (p.chatMuted && p.chatMuted > now) return fail("Đạo hữu đang bị cấm chat.");
    p.pmAt = now + 500;
    const to = Number.isInteger(m.to) ? m.to : null;
    if (to !== null && !p.friends.has(to)) return fail("Chỉ Truyền Âm được cho Đạo Hữu.");
    dao.send(p.userId, to !== null ? { uid: to } : { name: m.toName }, m.m).then(
      (out) => {
        const all = this.players, them = all.get(out.to);
        send(p.ws, { t: "pm", id: out.id, with: out.to, name: out.toName, mine: true, text: out.text, at: out.at, c });
        if (them && !them.blocked.has(p.userId)) send(them.ws, { t: "pm", id: out.id, with: p.userId, name: p.name, mine: false, text: out.text, at: out.at });
      },
      (e) => fail(e instanceof Error && e.status ? e.message : "Không gửi được Truyền Âm."),
    );
  }
  // ---- Đạo Hữu: the API changed someone's friends or blocks; the world reads them again and their panel reloads
  async syncSocial(uids, note = null) {
    const all = this.players;
    await Promise.all([...new Set(uids)].map(async (uid) => {
      const p = all.get(uid);
      if (!p) return;
      const s = await dao.socialOf(uid);
      if (p.gone) return;
      p.friends = s.friends;
      p.blocked = s.blocked;
      send(p.ws, { t: "friends", ...(note?.[uid] ? { note: note[uid] } : {}) });
    }));
  }
  /** An admin barred (or freed) this player from chat: at once, wherever they are. */
  setChatMute(uid, until) {
    const p = this.players.get(uid);
    if (!p) return;
    p.chatMuted = until;
    send(p.ws, { t: "toast", m: until ? `Đạo hữu bị cấm chat ${Math.ceil((until - Date.now()) / 60000)} phút.` : "Đạo hữu đã được chat trở lại." });
  }
  /** How many Truyền Âm this player has not read (for the badge on the Đạo Hữu button). */
  async sendUnread(uid) {
    const p = this.players.get(uid);
    if (p) send(p.ws, { t: "unread", n: await dao.unreadCount(uid) });
  }
  /** Someone came or went: their friends online hear it (and their list reloads). */
  async presence(p, on) {
    const ids = await dao.friendsOf(p.userId).catch(() => []);
    const all = this.players;
    for (const id of ids) {
      const f = all.get(id);
      if (f && f !== p && !f.blocked.has(p.userId)) send(f.ws, { t: "friends", presence: { name: p.name, on } });
    }
  }

  // ---- Tông Môn: the API changed a sect; the world takes it for whoever is online
  /** Save what this player earned and hasn't written yet (before spending stones from the database). */
  async flushUser(uid) {
    const p = this.players.get(uid);
    if (p) await p.world.save(p);
  }
  /** Read these players' sect again (joined, left, kicked, rank, level, the array...): their bonus, the name over them, their panel. */
  async syncSect(uids) {
    const all = this.players;
    await Promise.all([...new Set(uids)].map(async (uid) => {
      const p = all.get(uid);
      if (!p) return;
      const s = await sectOf(uid);
      if (p.gone) return;
      const shown = JSON.stringify(info(p));
      p.sect = s;
      if (JSON.stringify(info(p)) !== shown) p.world.broadcast({ t: "pi", ...info(p) });
      p.world.sendMe(p);
      send(p.ws, { t: "sect" });
    }));
  }
  /** Tell members online that their sect changed (their panel reloads), but not `except`. */
  sectPing(uids, except = null) {
    const all = this.players;
    for (const uid of uids) if (uid !== except) send(all.get(uid)?.ws, { t: "sect" });
  }
  sectToast(uids, m, except = null) {
    const all = this.players;
    for (const uid of uids) if (uid !== except) send(all.get(uid)?.ws, { t: "toast", m, ch: "s" }), send(all.get(uid)?.ws, { t: "sect" });
  }
  toastUser(uid, m, big = false) {
    send(this.players.get(uid)?.ws, { t: "toast", m, ...(big ? { big: 1 } : {}) });
  }
  async nameOf(uid) {
    return this.players.get(uid)?.name ?? (await store.loadCharacter(uid))?.name ?? "?";
  }


  // ---- the same calls the API and the admin site made on the one world, now for wherever the player is
  refresh(uid, ch) {
    this.worldOf(uid)?.refresh(uid, ch);
  }
  sendInv(uid) {
    return this.worldOf(uid)?.sendInv(uid);
  }
  kickUser(uid, why) {
    this.worldOf(uid)?.kickUser(uid, why);
  }
  reloadBuffs(uid) {
    return this.worldOf(uid)?.reloadBuffs(uid);
  }
  liveInfo(uid) {
    return this.worldOf(uid)?.liveInfo(uid) ?? null;
  }
  liveAction(uid, action) {
    return this.worldOf(uid)?.liveAction(uid, action) ?? false;
  }
  summon(uid, type) {
    return this.worldOf(uid)?.summon(uid, type) ?? null;
  }
  onConfig() {
    for (const w of this.worlds.values()) w.onConfig();
  }
  async shutdown() {
    clearInterval(this.timer);
    clearInterval(this.saver);
    await Promise.all([...this.worlds.values()].map((w) => w.shutdown()));
  }
}
