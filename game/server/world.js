// The shared world. The server is the only authority: clients send what they press (a direction, a skill and where to aim)
// and the server moves everyone, checks cooldowns and ranges, deals damage, hands out rewards and sends back what happened,
// 20 times a second. Nothing a client claims about positions, damage or rewards is ever trusted.
import { WebSocket } from "ws";
import {
  TICK_HZ, PLAYER_R, CLASSES, MONSTERS, ITEMS, PVP, RESPAWN_WORLD, MEDITATE, levelFromExp, worldMult, arenaMult, mitigate,
} from "../shared/balance.js";
import { mapInfo, START_MAP } from "../shared/maps/index.js";
import * as store from "./store.js";
import { userFromToken } from "./auth.js";
import { KeyedLock } from "./lock.js";

const DT = 1 / TICK_HZ;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const CLS = Object.keys(CLASSES);
const MTYPES = ["dummy", "ghost"];
const sessionLock = new KeyedLock();

export class World {
  constructor() {
    this.ents = new Map(); // id -> player or monster
    this.players = new Map(); // userId -> player
    this.bolts = [];
    this.summons = [];
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
      if (ws.readyState !== WebSocket.OPEN) return;
      const p = {
        id: this.nid++, kind: "p", userId: uid, ws, name: ch.name, cls: ch.cls,
        ...this.spawnPoint(), face: 1, in: { dx: 0, dy: 0 }, moving: false, portalAt: 0,
        hpFrac: 1, dead: false, respawnAt: 0, protectUntil: this.t + PVP.spawnProtect,
        cd: [0, 0, 0], busyUntil: 0, tfUntil: 0, slowUntil: 0, lastHurt: -99, lastCast: -99, itemCd: 0, chatAt: 0,
        medAcc: 0, meditating: false, base: null, pend: zero(), level: 1, medLeft: 0, saving: null, gone: false,
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
    this.summons = this.summons.filter((s) => s.owner !== p);
    this.broadcast({ t: "gone", id: p.id });
    await this.save(p);
  }

  kickUser(uid, why) {
    const p = this.players.get(uid);
    if (p) {
      send(p.ws, { t: "fatal", m: why });
      p.ws.close(4004, "kicked");
    }
  }

  /** The database changed under a connected player (a purchase, the daily gift): take its numbers. */
  refresh(uid, ch) {
    const p = this.players.get(uid);
    if (p && ch) {
      this.applyBase(p, ch);
      this.sendMe(p);
    }
  }

  // ---------------------------------------------------------------- saving
  applyBase(p, ch, first = false) {
    p.base = { exp: ch.exp, stones: ch.stones, rank: ch.rank, kills: ch.kills, deaths: ch.deaths };
    p.medLeft = Math.max(0, ch.medLeft - p.pend.med);
    this.relevel(p, first);
  }

  /** Save the earnings since the last save as increments; on failure they stay pending for the next try. */
  save(p) {
    const d = p.pend;
    if (!d.exp && !d.stones && !d.rank && !d.kills && !d.deaths && !d.med) return p.saving ?? Promise.resolve();
    p.pend = zero();
    // count it as saved straight away so the numbers on screen don't dip while the write is in flight
    p.base.exp += d.exp + d.med;
    p.base.stones += d.stones;
    p.base.rank += d.rank;
    const run = store.flush(p.userId, d).then(
      (ch) => {
        if (!p.gone) {
          this.applyBase(p, ch);
          this.sendMe(p);
        }
      },
      (e) => {
        console.error("save failed, will retry", p.userId, e.message);
        p.base.exp -= d.exp + d.med;
        p.base.stones -= d.stones;
        p.base.rank -= d.rank;
        for (const k in d) p.pend[k] += d[k];
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
    const tf = e.tfUntil > this.t ? c.skills[2] : null;
    return {
      maxHp: Math.round(c.hp * m), atk: c.atk * m * (tf?.atk ?? 1), def: c.def * m * (tf?.def ?? 1),
      spd: c.spd * (tf?.spd ?? 1) * (e.slowUntil > this.t ? 0.5 : 1) * (e.busyUntil > this.t ? 0.45 : 1),
    };
  }
  sendMe(p) {
    const st = this.stats(p);
    send(p.ws, {
      t: "me", lv: p.level, exp: this.exp(p), stones: p.base.stones + p.pend.stones, rank: p.base.rank + p.pend.rank,
      kills: p.base.kills + p.pend.kills, deaths: p.base.deaths + p.pend.deaths, medLeft: p.medLeft,
      hp: Math.max(0, Math.round(p.hpFrac * st.maxHp)), maxHp: st.maxHp, atk: Math.round(st.atk), def: Math.round(st.def),
      cd: p.cd.map((c) => Math.max(0, +(c - this.t).toFixed(2))), tf: Math.max(0, +(p.tfUntil - this.t).toFixed(2)),
      respawn: p.dead ? Math.max(0, +(p.respawnAt - this.t).toFixed(1)) : 0, itemCd: Math.max(0, +(p.itemCd - this.t).toFixed(1)),
    });
  }

  // ---------------------------------------------------------------- input
  onMessage(p, m) {
    switch (m.t) {
      case "in": {
        if (!num(m.dx) || !num(m.dy)) return;
        let dx = clamp(m.dx, -1, 1), dy = clamp(m.dy, -1, 1);
        const l = Math.hypot(dx, dy);
        if (l > 1) (dx /= l), (dy /= l);
        p.in = { dx, dy };
        return;
      }
      case "cast": {
        const i = m.s | 0;
        if (i < 0 || i > 2) return;
        let ax = num(m.ax) ? m.ax : p.face, ay = num(m.ay) ? m.ay : 0;
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
        return this.broadcast({ t: "chat", n: p.name, c: p.cls, m: text });
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
  nearest(att, x, y, range) {
    let best = null, bd = range;
    for (const e of this.targetsOf(att)) {
      const d = Math.hypot(e.x - x, e.y - y) - PLAYER_R;
      if (d < bd) (bd = d), (best = e);
    }
    return best;
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
    if (p.dead) return;
    const sk = CLASSES[p.cls].skills[i], t = this.t;
    if (p.cd[i] > t + 0.05) return;
    if (p.busyUntil > t && sk.type !== "transform") return;
    p.cd[i] = t + sk.cd;
    p.lastCast = t;
    if (Math.abs(ax) > 0.15) p.face = ax > 0 ? 1 : -1;
    const st = this.stats(p);
    this.ev({ e: "cast", id: p.id, s: i, ax: +ax.toFixed(2), ay: +ay.toFixed(2) });
    switch (sk.type) {
      case "melee":
        this.cone(p, p.x, p.y, ax, ay, sk.range, sk.arc, st.atk, sk.mult);
        break;
      case "breath":
        p.busyUntil = t + sk.ticks * sk.every;
        for (let k = 0; k < sk.ticks; k++)
          this.at(t + 0.15 + k * sk.every, () => {
            if (p.dead || p.gone) return;
            this.cone(p, p.x + ax * 10, p.y + ay * 10, ax, ay, sk.range, sk.arc, this.stats(p).atk, sk.mult);
          });
        break;
      case "bolt":
        this.bolts.push({ id: this.nid++, owner: p, cls: p.cls, x: p.x + ax * 16, y: p.y + ay * 16, vx: ax * sk.speed, vy: ay * sk.speed, left: sk.range, r: sk.r, atk: st.atk, mult: sk.mult });
        break;
      case "zone": {
        const x = clamp(p.x + ax * sk.dist, 20, this.map.w - 20), y = clamp(p.y + ay * sk.dist, 20, this.map.h - 20);
        this.ev({ e: "fx", k: "timestop", x: Math.round(x), y: Math.round(y) });
        this.at(t + sk.delay, () => {
          if (p.gone) return;
          for (const e of this.targetsOf(p))
            if (Math.hypot(e.x - x, e.y - y) <= sk.r + PLAYER_R) {
              e.slowUntil = this.t + sk.slowDur;
              this.damage(p, this.stats(p).atk, e, sk.mult);
            }
        });
        break;
      }
      case "summon":
        this.summons = this.summons.filter((s) => s.owner !== p);
        this.summons.push({ id: this.nid++, owner: p, ...(this.map.canStand(p.x + p.face * 26, p.y + 2) ? { x: p.x + p.face * 26, y: p.y + 2 } : { x: p.x, y: p.y }), face: p.face, until: t + sk.dur, atk: st.atk, sk, nextBite: t + 0.8, bite: 0 });
        break;
      case "devour": {
        const e = this.nearest(p, p.x, p.y, sk.range);
        if (!e) {
          p.cd[i] = t + 0.5; // nothing in reach: almost no cooldown spent
          send(p.ws, { t: "toast", m: "Không có mục tiêu trong tầm." });
          break;
        }
        this.ev({ e: "fx", k: "devour", from: e.id, to: p.id });
        const d = this.damage(p, st.atk, e, sk.mult);
        if (!p.dead) p.hpFrac = Math.min(1, p.hpFrac + (d * sk.heal) / st.maxHp);
        break;
      }
      case "transform":
        p.tfUntil = t + sk.dur;
        break;
    }
    this.sendMe(p);
  }

  kill(e, att) {
    e.dead = true;
    e.hpFrac = 0;
    this.ev({ e: "die", id: e.id });
    const owner = att.kind === "p" ? att : null;
    if (e.kind === "m") {
      e.respawnAt = this.t + e.def.respawn;
      if (owner && !owner.gone) {
        owner.pend.exp += e.def.exp(owner.level);
        owner.pend.stones += e.def.stones;
        this.ev({ e: "loot", id: owner.id, x: Math.round(e.x), y: Math.round(e.y), exp: e.def.exp(owner.level), stones: e.def.stones });
        this.relevel(owner);
        this.sendMe(owner);
      }
      return;
    }
    // a player
    e.respawnAt = this.t + (this.map.pvp ? PVP.respawn : RESPAWN_WORLD);
    e.busyUntil = 0;
    e.tfUntil = 0;
    this.summons = this.summons.filter((s) => s.owner !== e);
    if (owner && owner !== e) {
      const key = `${owner.userId}:${e.userId}`, last = this.pairs.get(key);
      const rewarded = last === undefined || this.t - last > PVP.repeatCooldown;
      if (rewarded) {
        this.pairs.set(key, this.t);
        owner.pend.exp += PVP.exp(owner.level);
        owner.pend.stones += PVP.stones;
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
    this.stepSummons();
    this.snapshot();
    if (this.tick % 5 === 0) for (const p of this.players.values()) this.sendMe(p);
  }

  /** Where someone appears: the map's spawn, nudged a little, always on open ground. */
  spawnPoint() {
    const s = this.map.spawn;
    for (let i = 0; i < 12; i++) {
      const x = s.x + rnd(-40, 40), y = s.y + rnd(-20, 20);
      if (this.map.canStand(x, y)) return { x, y };
    }
    return { x: s.x, y: s.y };
  }
  /** Move by (dx, dy), sliding along walls: try the whole step, then each axis alone. */
  move(e, dx, dy) {
    const M = this.map;
    if (M.canStand(e.x + dx, e.y + dy)) (e.x += dx), (e.y += dy);
    else if (dx && M.canStand(e.x + dx, e.y)) e.x += dx;
    else if (dy && M.canStand(e.x, e.y + dy)) e.y += dy;
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
    const st = this.stats(p), { dx, dy } = p.in;
    p.moving = dx !== 0 || dy !== 0;
    if (p.moving) {
      this.move(p, dx * st.spd * DT, dy * st.spd * DT);
      if (Math.abs(dx) > 0.1 && p.busyUntil <= t) p.face = dx > 0 ? 1 : -1;
    }
    // a way out: for now every road beyond the town is still being built
    const gate = this.map.portalAt(p.x, p.y);
    if (gate && t >= p.portalAt) {
      p.portalAt = t + 2.5;
      send(p.ws, { t: "portal", m: gate.msg, to: gate.to });
      // step them back off the arrow so it doesn't fire again straight away
      this.move(p, 0, -gate.r * 3);
    }
    // cultivating at the spirit vein: standing still, not fighting, up to today's cap
    p.meditating = !p.moving && p.medLeft > 0 && t - p.lastHurt > MEDITATE.calmAfterHit && t - p.lastCast > 1.5 && this.map.inSpring(p.x, p.y);
    if (p.meditating) {
      p.medAcc += DT;
      if (p.medAcc >= 1) {
        p.medAcc -= 1;
        const g = Math.min(MEDITATE.perSec(p.level), p.medLeft);
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
        this.ev({ e: "boom", k: b.cls, x: Math.round(b.x), y: Math.round(b.y) });
        continue;
      }
      if (b.left > 0 && b.x > 0 && b.x < this.map.w && b.y > 0 && b.y < this.map.h) keep.push(b);
    }
    this.bolts = keep;
  }

  stepSummons() {
    const t = this.t, keep = [];
    for (const s of this.summons) {
      const o = s.owner;
      if (t >= s.until || o.gone || o.dead) {
        this.ev({ e: "unsummon", id: s.id, x: Math.round(s.x), y: Math.round(s.y) });
        continue;
      }
      keep.push(s);
      const sk = s.sk, prey = this.nearest(o, s.x, s.y, 220);
      let tx = o.x - o.face * 28, ty = o.y + 4;
      if (prey) {
        const d = Math.hypot(prey.x - s.x, prey.y - s.y);
        s.face = prey.x > s.x ? 1 : -1;
        if (d <= sk.reach + PLAYER_R) {
          if (t >= s.nextBite) {
            s.nextBite = t + sk.every;
            s.bite = t + 0.35;
            this.damage(o, s.atk, prey, sk.mult);
          }
          continue;
        }
        (tx = prey.x), (ty = prey.y);
      }
      const dx = tx - s.x, dy = ty - s.y, l = Math.hypot(dx, dy);
      if (l > 3) {
        const st = Math.min(l, sk.spd * DT);
        this.move(s, (dx / l) * st, (dy / l) * st);
        if (Math.abs(dx) > 1) s.face = dx > 0 ? 1 : -1;
      }
    }
    this.summons = keep;
  }

  snapshot() {
    const t = this.t, P = [], M = [], B = [], S = [];
    for (const p of this.players.values())
      P.push([p.id, Math.round(p.x), Math.round(p.y), p.face, Math.round(Math.max(0, p.hpFrac) * 1000),
        (p.dead ? 1 : 0) | (p.tfUntil > t ? 2 : 0) | (p.slowUntil > t ? 4 : 0) | (p.protectUntil > t ? 8 : 0) | (p.meditating ? 16 : 0) | (p.moving ? 32 : 0) | (p.busyUntil > t ? 64 : 0)]);
    for (const m of this.ents.values())
      if (m.kind === "m") M.push([m.id, MTYPES.indexOf(m.type), Math.round(m.x), Math.round(m.y), m.face, Math.round(m.hpFrac * 1000), (m.dead ? 1 : 0) | (m.slowUntil > t ? 4 : 0) | (m.atkAnim > t ? 128 : 0)]);
    for (const b of this.bolts) B.push([b.id, CLS.indexOf(b.cls), Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)]);
    for (const s of this.summons) S.push([s.id, s.owner.id, Math.round(s.x), Math.round(s.y), s.face, s.bite > t ? 1 : 0]);
    const msg = JSON.stringify({ t: "s", k: this.tick, P, M, B, S, E: this.events });
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
const info = (p) => ({ id: p.id, name: p.name, cls: p.cls, lv: p.level });
// a client that can't keep up (more than 1 MB queued) skips snapshots instead of growing the server's memory
function sendRaw(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1 << 20) ws.send(msg);
}
const send = (ws, obj) => sendRaw(ws, JSON.stringify(obj));
