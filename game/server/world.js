// The shared world. The server is the only authority: clients send what they press (a direction, a skill and where to aim)
// and the server moves everyone, checks cooldowns and ranges, deals damage, hands out rewards and sends back what happened,
// 20 times a second. Nothing a client claims about positions, damage or rewards is ever trusted.
import { WebSocket } from "ws";
import {
  TICK_HZ, PLAYER_R, CLASSES, MONSTERS, ITEMS, PVP, RESPAWN_WORLD, MEDITATE, levelFromExp, worldMult, arenaMult, mitigate, ARTS, ART_SLOTS, DROPS,
} from "../shared/balance.js";
import { mapInfo, START_MAP } from "../shared/maps/index.js";
import { stepBody, fits, PHYS } from "../shared/physics.js";
import * as store from "./store.js";
import { userFromToken } from "./auth.js";
import { KeyedLock } from "./lock.js";

const DT = 1 / TICK_HZ;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const MTYPES = ["dummy", "ghost"];
const sessionLock = new KeyedLock();

export class World {
  constructor() {
    this.ents = new Map(); // id -> player or monster
    this.players = new Map(); // userId -> player
    this.bolts = [];
    this.later = [];
    this.events = [];
    this.pairs = new Map(); // "killer:victim" -> time of the last rewarded kill
    this.t = 0;
    this.tick = 0;
    this.nid = 1;
    this.map = mapInfo(START_MAP);
    this.spawnMonsters();
    this.timer = setInterval(() => this.step(), 1000 / TICK_HZ);
    this.saver = setInterval(() => this.saveAll(), 5000);
  }

  // ---------------------------------------------------------------- connections
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
      this.onMessage(ws.player, m);
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      const p = ws.player;
      if (p) sessionLock.run(p.userId, () => this.remove(p)).catch((e) => console.error("leave", e));
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
        await this.remove(old);
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      const ch = await store.loadCharacter(uid);
      if (!ch) {
        send(ws, { t: "fatal", m: "Đạo hữu chưa tạo nhân vật." });
        return ws.close(4003, "no character");
      }
      const inv = await store.inventory(uid);
      const buffs = await store.activeBuffs(uid);
      if (ws.readyState !== WebSocket.OPEN) return;
      const p = {
        id: this.nid++, kind: "p", userId: uid, ws, name: ch.name, cls: ch.cls, look: ch.look,
        ...this.spawnPoint(), face: 1, in: { dx: 0, jump: false, down: false }, jumpUntil: 0, moving: false, portalAt: 0, vx: 0, vy: 0, ground: false, dropUntil: 0,
        hpFrac: 1, dead: false, respawnAt: 0, protectUntil: this.t + PVP.spawnProtect,
        cd: [0], artCd: {}, slots: ch.slots, learned: new Set(ch.learned), tbuffs: {}, busyUntil: 0, slowUntil: 0, lastHurt: -99, lastCast: -99, itemCd: 0, chatAt: 0,
        medAcc: 0, meditating: false, base: null, pend: zero(), fly: zero(), level: 1, medLeft: 0, saving: null, gone: false, buffs,
      };
      this.applyBase(p, ch, true);
      this.players.set(uid, p);
      this.ents.set(p.id, p);
      ws.player = p;
      send(ws, {
        t: "welcome", id: p.id, tick: this.tick, inv, map: this.map.id,
        players: [...this.players.values()].map(info),
      });
      this.broadcast({ t: "pi", ...info(p) }, p);
      this.sendArts(p);
      this.sendMe(p);
      this.feed(`${p.name} đã tiến vào Đa Vũ Trụ.`);
    });
  }

  /** Take a player out and save what they earned. Safe to call twice. */
  async remove(p) {
    if (p.gone) return p.saving;
    p.gone = true;
    if (this.players.get(p.userId) === p) this.players.delete(p.userId);
    this.ents.delete(p.id);
    this.broadcast({ t: "gone", id: p.id });
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
    clearInterval(this.timer);
    clearInterval(this.saver);
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
      const up = L > p.level;
      p.level = L;
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
    const b = (stat) => Math.max(0.1, (this.map.pvp ? 1 : 1 + this.buff(e, stat) / 100) + tb(stat));
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
      cd: this.cooldowns(p),
      respawn: p.dead ? Math.max(0, +(p.respawnAt - this.t).toFixed(1)) : 0, itemCd: Math.max(0, +(p.itemCd - this.t).toFixed(1)),
      buffs: (p.buffs ?? []).filter((x) => x.until === null || x.until > Date.now()).map((x) => ({ stat: x.stat, pct: x.pct, left: x.until === null ? null : Math.round((x.until - Date.now()) / 1000) })),
    });
  }

  // ---------------------------------------------------------------- input
  onMessage(p, m) {
    switch (m.t) {
      case "in": {
        // side view: a direction along the ground, and whether jump and down are held
        if (!num(m.dx)) return;
        // a tap shorter than a tick still counts: the press is kept for JUMP_BUFFER and spent on the next jump
        if (m.jump === true && !p.in.jump) p.jumpUntil = this.t + PHYS.JUMP_BUFFER;
        p.in = { dx: clamp(m.dx, -1, 1), jump: m.jump === true, down: m.down === true };
        return;
      }
      case "cast": {
        // 0 is the basic attack, 1-5 the arts on the bar
        const i = m.s | 0;
        if (i < 0 || i > ART_SLOTS) return;
        // aim mostly along the ground: at most a gentle slope up or down
        let ax = num(m.ax) ? m.ax : p.face, ay = num(m.ay) ? clamp(m.ay, -Math.abs(ax) * 0.6 - 0.01, Math.abs(ax) * 0.6 + 0.01) : 0;
        const l = Math.hypot(ax, ay);
        if (l < 1e-3) (ax = p.face), (ay = 0);
        else (ax /= l), (ay /= l);
        return this.cast(p, i, ax, ay);
      }
      case "chat": {
        if (typeof m.m !== "string" || this.t < p.chatAt) return;
        const text = m.m.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 120);
        if (!text) return;
        p.chatAt = this.t + 1;
        return this.broadcast({ t: "chat", n: p.name, m: text });
      }
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

  cast(p, i, ax, ay) {
    if (p.dead || p.busyUntil > this.t) return;
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
    // where the art's effect is drawn, for everyone: on the caster, before them, where the zone lands
    const show = (x, y) => key && this.ev({ e: "art", id: p.id, a: key, x: Math.round(x), y: Math.round(y), f: dir });
    // hit everyone hostile within r of (x, y) after `delay`, slowing them if the art does
    const burst = (x, y, delay) => {
      this.at(t + delay, () => {
        if (p.gone) return;
        for (const e of this.targetsOf(p))
          if (Math.hypot(e.x - x, e.y - y) <= sk.r + PLAYER_R) {
            if (sk.slow) e.slowUntil = this.t + sk.slowDur;
            this.damage(p, this.stats(p).atk, e, sk.mult);
          }
      });
    };
    switch (sk.type) {
      case "melee":
        show(p.x, p.y);
        this.cone(p, p.x, p.y, ax, ay, sk.range, sk.arc, st.atk, sk.mult);
        break;
      case "bolt":
        show(p.x, p.y);
        this.bolts.push({ id: this.nid++, owner: p, art: key, x: p.x + ax * 16, y: p.y + ay * 16, vx: ax * sk.speed, vy: ay * sk.speed, left: sk.range, r: sk.r, atk: st.atk, mult: sk.mult });
        break;
      case "zone": {
        const x = clamp(p.x + dir * sk.dist, 20, this.map.w - 20), y = p.y;
        if (key) show(sk.at === "target" ? x : p.x, p.y);
        else this.ev({ e: "fx", k: "thunder", x: Math.round(x), y: Math.round(y) });
        burst(x, y, sk.delay);
        break;
      }
      case "nova":
        show(p.x, p.y);
        burst(p.x, p.y, sk.delay);
        break;
      case "dash": {
        // rush forward until a wall, hitting everyone along the line once
        show(p.x, p.y);
        const x0 = p.x, step = 4 * dir;
        let x = p.x;
        for (let d = 0; d < sk.dist; d += 4) {
          if (!fits(x + step, p.y, this.map)) break;
          x += step;
        }
        p.x = x;
        const lo = Math.min(x0, x), hi = Math.max(x0, x);
        for (const e of this.targetsOf(p)) if (e.x >= lo - sk.r && e.x <= hi + sk.r && Math.abs(e.y - p.y) <= sk.r + 40) this.damage(p, st.atk, e, sk.mult);
        break;
      }
      case "heal":
        show(p.x, p.y);
        p.hpFrac = Math.min(1, p.hpFrac + sk.pct);
        break;
      case "buff":
        show(p.x, p.y);
        p.tbuffs[sk.stat] = { pct: sk.pct, until: t + sk.dur };
        break;
    }
    this.sendMe(p);
  }

  /** Roll a dead monster's drops for whoever killed it: its own list, plus the "*" list if it takes common drops. */
  rollDrops(owner, m) {
    const list = [...(DROPS[m.type] ?? []), ...(m.def.commonDrops ? DROPS["*"] ?? [] : [])], got = {};
    for (const d of list) if (Math.random() < d.chance) got[d.item] = (got[d.item] ?? 0) + d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    if (!Object.keys(got).length) return;
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
    // a player
    e.respawnAt = this.t + (this.map.pvp ? PVP.respawn : RESPAWN_WORLD);
    e.busyUntil = 0;
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

  stepPlayer(p) {
    const t = this.t;
    if (p.dead) {
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
    const st = this.stats(p), inp = p.in;
    p.moving = Math.abs(inp.dx) > 0.05;
    const wasGround = p.ground;
    stepBody(p, { ...inp, jump: inp.jump || p.jumpUntil > t }, st.spd * PHYS.RUN, DT, this.map, t);
    if (wasGround && !p.ground) p.jumpUntil = 0;
    if (p.moving && p.busyUntil <= t) p.face = inp.dx > 0 ? 1 : -1;
    // fell out of the world somehow: back to the spawn
    if (p.y > this.map.h + 200) Object.assign(p, this.spawnPoint());
    // a way out: for now every road beyond the town is still being built
    const gate = this.map.portalAt(p.x, p.y);
    if (gate && t >= p.portalAt) {
      p.portalAt = t + 2.5;
      send(p.ws, { t: "portal", m: gate.msg, to: gate.to });
      // step them back off the arrow so it doesn't fire again straight away
      const back = p.x >= gate.x ? 1 : -1;
      if (fits(gate.x + back * gate.r * 2, p.y, this.map)) p.x = gate.x + back * gate.r * 2;
    }
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

  spawnMonsters() {
    const add = (type, x, y) => {
      const d = MONSTERS[type];
      const m = { id: this.nid++, kind: "m", type, def: d, x, y, home: { x, y }, face: -1, hpFrac: 1, dead: false, respawnAt: 0, slowUntil: 0, lastHurt: -99, nextAtk: 0, target: null, wander: { x, y }, wanderAt: 0, atkAnim: 0, st: { maxHp: d.hp, atk: d.atk, def: d.def, spd: d.spd } };
      this.ents.set(m.id, m);
    };
    for (const m of this.map.mobs) add(m.type, m.x, m.y);
  }

  stepMonster(m) {
    const t = this.t;
    if (m.dead) {
      if (t >= m.respawnAt) {
        m.dead = false;
        m.hpFrac = 1;
        m.x = m.home.x;
        m.y = m.home.y;
        m.target = null;
        this.ev({ e: "spawn", id: m.id });
      }
      return;
    }
    if (m.type !== "ghost") {
      // straw dummies heal back slowly when left alone
      if (t - m.lastHurt > 4) m.hpFrac = Math.min(1, m.hpFrac + 0.1 * DT);
      return;
    }
    const d = m.def, spd = d.spd * (m.slowUntil > t ? 0.5 : 1);
    // pick a prey: whoever hit it, or anyone close, as long as they're out of the safe zone
    const ok = (p) => p && !p.gone && !p.dead && p.kind === "p" && p.protectUntil <= t && Math.hypot(p.x - m.home.x, p.y - m.home.y) < d.aggro * 3;
    if (!ok(m.target) || Math.hypot(m.target.x - m.x, m.target.y - m.y) > d.aggro * 1.6) {
      m.target = null;
      let bd = d.aggro;
      for (const p of this.players.values())
        if (ok(p)) {
          const dd = Math.hypot(p.x - m.x, p.y - m.y);
          if (dd < bd) (bd = dd), (m.target = p);
        }
      if (!m.target && ok(m.lastHitBy) && t - m.lastHurt < 3) m.target = m.lastHitBy;
    }
    let tx, ty;
    if (m.target) {
      const p = m.target, dd = Math.hypot(p.x - m.x, p.y - m.y);
      m.face = p.x > m.x ? 1 : -1;
      if (dd <= d.reach) {
        if (t >= m.nextAtk) {
          m.nextAtk = t + d.cd;
          m.atkAnim = t + 0.3;
          this.damage(m, d.atk, p, d.mult);
        }
        return;
      }
      (tx = p.x), (ty = p.y);
    } else {
      if (t >= m.wanderAt) {
        m.wanderAt = t + rnd(2, 5);
        m.wander = { x: m.home.x + rnd(-60, 60), y: m.home.y + rnd(-40, 40) };
      }
      (tx = m.wander.x), (ty = m.wander.y);
    }
    const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy);
    if (l > 2) {
      const s = Math.min(l, spd * DT * (m.target ? 1 : 0.5));
      this.move(m, (dx / l) * s, (dy / l) * s);
      if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
    }
  }

  stepBolts() {
    const keep = [];
    for (const b of this.bolts) {
      if (b.owner.gone) continue;
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
        (p.dead ? 1 : 0) | (p.slowUntil > t ? 4 : 0) | (p.protectUntil > t ? 8 : 0) | (p.meditating ? 16 : 0) | (p.moving ? 32 : 0) | (p.busyUntil > t ? 64 : 0) | (p.ground ? 0 : 128)]);
    for (const m of this.ents.values())
      if (m.kind === "m") M.push([m.id, MTYPES.indexOf(m.type), Math.round(m.x), Math.round(m.y), m.face, Math.round(m.hpFrac * 1000), (m.dead ? 1 : 0) | (m.slowUntil > t ? 4 : 0) | (m.atkAnim > t ? 128 : 0)]);
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
const rnd = (a, b) => a + Math.random() * (b - a);
const info = (p) => ({ id: p.id, name: p.name, look: p.look, lv: p.level });
// a client that can't keep up (more than 1 MB queued) skips snapshots instead of growing the server's memory
function sendRaw(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1 << 20) ws.send(msg);
}
const send = (ws, obj) => sendRaw(ws, JSON.stringify(obj));
