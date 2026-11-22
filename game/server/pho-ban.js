// Phó Bản on the server (shared/pho-ban.js has the rules and numbers): runs, each a party's own copy of a dungeon's map
// (a World keyed "pb:<run id>"), on the game's one thread (the Universe's).
// Against races and double rewards:
//  1. Starting: every member's entry for the day is counted in one transaction (pb_daily, a conditional n + 1 under the
//     limit); if anyone has none left nothing is counted and nobody goes in. The run's row and its members' rows are
//     written in the same transaction. A member already in a run (memory, one process) can't start another.
//  2. Clearing: the run's row moves from running to cleared once (WHERE state = 'running'); each member's reward is
//     written in their own transaction under their lock, guarded by their row (rewarded = 0 → 1): given once, whatever
//     calls it twice. Failing and abandoning move the row the same way, and give nothing.
//  3. A restart: runs live in memory; a run the server was running when it stopped can't go on: it is marked failed and
//     the day's entry is given back to its members.
import { tx, q } from "./db.js";
import { userLock } from "./lock.js";
import * as store from "./store.js";
import { MONSTERS, ITEMS, levelFromExp, realmName } from "../shared/balance.js";
import { BOSSES } from "../shared/boss.js";
import { MAPS, mapInfo } from "../shared/maps/index.js";
import { PB, DUNGEONS, ELITE, scaleFor, livesFor, rankOf, rewardFor, dayOf, runKey, STATE_NAMES } from "../shared/pho-ban.js";

const no = (m, status = 409) => Object.assign(new Error(m), { status });
const fmt = (n) => Number(n).toLocaleString("vi-VN");
// after the end: this many seconds to read the result before everyone is taken back
export const AFTER = 10;
// everyone of a run offline this long: it is abandoned
const ALL_AWAY = 180;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Every run now. u: the Universe; make(id, mapId): a new World for run id, on the dungeon's map, that knows its run.
 */
export class Runs {
  constructor(u, make) {
    this.u = u;
    this.make = make;
    this.runs = new Map(); // id -> Run
    // runs the server was running when it stopped: failed, their entries given back
    this.boot = this.recover().catch((e) => console.error("pb boot", e));
  }
  async recover() {
    const rows = await q("SELECT id FROM pb_runs WHERE state = 'running'");
    for (const r of rows) {
      await tx(async (c) => {
        const u = await c.query("UPDATE pb_runs SET state = 'failed', ended_at = NOW(), note = 'Máy chủ khởi động lại giữa lượt (đã hoàn lượt vào)' WHERE id = ? AND state = 'running'", [r.id]);
        if (!u.affectedRows) return;
        for (const m of await c.query("SELECT user_id, day FROM pb_members WHERE run_id = ?", [r.id]))
          await c.query("UPDATE pb_daily SET n = GREATEST(0, n - 1) WHERE user_id = ? AND day = ?", [m.user_id, m.day]);
      });
    }
  }

  /** The run uid has a place in (not left, not over), or null. */
  runOf(uid) {
    for (const r of this.runs.values()) {
      const m = r.members.get(uid);
      if (m && !m.left && r.state === "running") return r;
    }
    return null;
  }
  /** Whether uid holds a place in a run now (their party place is kept while they do). */
  holds(uid) {
    return !!this.runOf(uid);
  }

  // ---- the panel
  /** What the Phó Bản panel shows uid: the dungeons, their day, their party's readiness, their runs, the best clears. */
  async view(uid) {
    const day = dayOf(), players = this.u.players, party = this.u.parties.partyOf(uid);
    const uids = party ? [...party.members.keys()] : [uid];
    const daily = new Map((await q("SELECT user_id, n, cleared FROM pb_daily WHERE day = ? AND user_id IN (?)", [day, uids])).map((r) => [r.user_id, r]));
    const names = new Map((await q("SELECT user_id, name, exp FROM characters WHERE user_id IN (?)", [uids])).map((r) => [r.user_id, r]));
    const members = uids.map((id) => {
      const p = players.get(id), d = daily.get(id), ch = names.get(id), level = p?.level ?? levelFromExp(Number(ch?.exp ?? 0));
      const used = Number(d?.n ?? 0);
      const why = !p ? "không trực tuyến" : level < PB.level ? `chưa đủ cấp (cần ${realmName(PB.level)})` : used >= PB.daily ? "hết lượt hôm nay" : this.runOf(id) ? "đang ở phó bản" : this.u.war?.fighting(id) ? "đang ở Chính Tà" : null;
      return { uid: id, name: ch?.name ?? p?.name ?? "?", leader: party ? party.leader === id : true, realm: realmName(level), used, left: Math.max(0, PB.daily - used), cleared: Number(d?.cleared ?? 0), why };
    });
    const mine = await q(
      `SELECT r.id, r.dungeon, r.size, r.state, r.seconds, r.rank_ AS \`rank\`, r.started_at, m.stones, m.exp, m.rewarded, m.first, m.deaths
       FROM pb_members m JOIN pb_runs r ON r.id = m.run_id WHERE m.user_id = ? ORDER BY r.id DESC LIMIT 10`, [uid]);
    const best = {};
    for (const key of Object.keys(DUNGEONS))
      best[key] = (await q(
        `SELECT r.id, r.seconds, r.size, r.rank_ AS \`rank\`, GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') AS names
         FROM pb_runs r JOIN pb_members m ON m.run_id = r.id WHERE r.dungeon = ? AND r.state = 'cleared' GROUP BY r.id ORDER BY r.seconds, r.id LIMIT 5`, [key]))
        .map((r) => ({ id: r.id, secs: r.seconds, size: r.size, rank: r.rank, names: r.names }));
    const run = this.runOf(uid);
    return {
      rules: { party: PB.party, daily: PB.daily, level: realmName(PB.level), minutes: PB.minutes, lives: PB.lives, livesPer: PB.livesPerMember, respawn: PB.respawn, rankS: PB.rankS, rankA: PB.rankA, mulS: PB.mulS, mulA: PB.mulA, firstBonus: PB.firstBonus, hpPer: PB.hpPerMember, atkPer: PB.atkPerMember },
      dungeons: Object.values(DUNGEONS).map((d) => ({
        key: d.key, name: d.name, desc: d.desc,
        stages: d.stages.map((s) => ({ name: s.name, goal: s.goal, mobs: (s.mobs ?? []).map((m) => ({ name: (m.elite ? `${MONSTERS[m.type]?.name} ${ELITE.title}` : MONSTERS[m.type]?.name) ?? m.type, n: m.n, elite: !!m.elite })), boss: s.boss ? BOSSES[s.boss]?.name : null })),
        reward: { B: rewardFor("B", false), A: rewardFor("A", false), S: rewardFor("S", false), first: PB.firstBonus },
        best: best[d.key],
      })),
      party: party ? { id: party.id, leader: party.leader, size: party.members.size, ready: party.ready ? party.ready.key : null } : null,
      leader: party ? party.leader === uid : true,
      members,
      run: run ? { id: run.id, dungeon: run.d.key, name: run.d.name } : null,
      history: mine.map((r) => ({ id: r.id, name: DUNGEONS[r.dungeon]?.name ?? r.dungeon, size: r.size, state: r.state, stateName: STATE_NAMES[r.state] ?? r.state, secs: r.seconds, rank: r.rank, at: +new Date(r.started_at), stones: r.stones, exp: Number(r.exp), rewarded: !!r.rewarded, first: !!r.first, deaths: r.deaths })),
      itemNames: Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.name])),
    };
  }

  // ---- going in
  /** uid (the leader, or alone) asks to take their party into dungeon key: the ready check first. */
  request(uid, key) {
    const d = DUNGEONS[key];
    if (!d) throw no("Không có phó bản này.", 400);
    let party = this.u.parties.partyOf(uid);
    if (party && party.leader !== uid) throw no("Chỉ đội trưởng mới đưa tổ đội vào phó bản được.");
    if (party?.ready) throw no("Đang chờ cả đội sẵn sàng.");
    // checked now (and again when everyone is ready): nobody is asked for nothing
    this.check(party ? [...party.members.keys()] : [uid]);
    if (!party) party = this.u.parties.create(uid);
    this.u.parties.askReady(party, key, (pt) => this.start(pt, key).catch((e) => {
      for (const m of pt.members.keys()) this.u.toastUser(m, e.message ?? "Không vào được phó bản.");
      if (!e.status) console.error("pb start", e);
    }));
    return { asked: party.members.size - 1 };
  }
  /** Can these all go in now? Throws the first reason why not (the database's daily count is checked when they go). */
  check(uids) {
    const players = this.u.players;
    if (uids.length > PB.party) throw no(`Tổ đội quá ${PB.party} người.`);
    for (const id of uids) {
      const p = players.get(id), name = p?.name ?? "Một thành viên";
      if (!p || p.gone) throw no(`${name} đang không trực tuyến.`);
      if (this.runOf(id)) throw no(`${p.name} đang ở trong phó bản.`);
      if (this.u.war?.fighting(id)) throw no(`${p.name} đang ở Chính Tà chiến trường.`);
      if (p.level < PB.level) throw no(`${p.name} chưa đủ cấp: cần ${realmName(PB.level)}.`);
      if (p.dead) throw no(`${p.name} đang trọng thương, chờ hồi sinh đã.`);
      if (p.warping) throw no(`${p.name} đang dịch chuyển.`);
    }
  }
  /** Everyone said ready: count the day's entries (all or none), make the run, take them in. */
  async start(party, key) {
    const d = DUNGEONS[key], uids = [...party.members.keys()];
    this.check(uids);
    const players = this.u.players, day = dayOf();
    const id = await tx(async (c) => {
      for (const uid of uids) {
        await c.query("INSERT INTO pb_daily (user_id, day, n) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE n = n", [uid, day]);
        const r = await c.query("UPDATE pb_daily SET n = n + 1 WHERE user_id = ? AND day = ? AND n < ?", [uid, day, PB.daily]);
        if (r.affectedRows !== 1) throw no(`${players.get(uid)?.name ?? "Một thành viên"} đã hết ${PB.daily} lượt phó bản hôm nay.`);
      }
      const runId = (await c.query("INSERT INTO pb_runs (dungeon, leader_id, size, lives) VALUES (?, ?, ?, ?)", [key, party.leader, uids.length, livesFor(uids.length)])).insertId;
      for (const uid of uids) await c.query("INSERT INTO pb_members (run_id, user_id, name, day) VALUES (?, ?, ?, ?)", [runId, uid, players.get(uid)?.name ?? "?", day]);
      return runId;
    });
    // between the check and now someone may have gone: they come in when they come back (their entry is spent)
    const run = new Run(this, id, d, uids.map((uid) => ({ uid, name: players.get(uid)?.name ?? "?" })), party.leader);
    this.runs.set(id, run);
    run.open();
    return run;
  }

  /** Every second: each run's clock, its boss's roar, the HUD; ended runs taken down. */
  tick() {
    for (const r of [...this.runs.values()]) r.tick().catch((e) => console.error("pb tick", e));
  }

  /** uid leaves their run by choice: no reward; the others go on. */
  async quit(uid) {
    const r = this.runOf(uid);
    if (!r) throw no("Đạo hữu không ở trong phó bản.");
    await r.quit(uid);
  }

  // ---- the admin
  adminList() {
    return [...this.runs.values()].map((r) => r.summary());
  }
  async history(limit = 30) {
    return (await q(
      `SELECT r.id, r.dungeon, r.size, r.state, r.stage, r.lives, r.deaths, r.seconds, r.rank_ AS \`rank\`, r.started_at, r.ended_at, r.note,
              GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') AS names
       FROM pb_runs r LEFT JOIN pb_members m ON m.run_id = r.id GROUP BY r.id ORDER BY r.id DESC LIMIT ?`, [limit]))
      .map((r) => ({ ...r, name: DUNGEONS[r.dungeon]?.name ?? r.dungeon, stateName: STATE_NAMES[r.state] ?? r.state }));
  }
  async members(id) {
    return (await q("SELECT user_id, name, day, deaths, dmg, stones, exp, items, rewarded, first, `left` FROM pb_members WHERE run_id = ? ORDER BY dmg DESC", [id]))
      .map((r) => ({ ...r, dmg: Number(r.dmg), exp: Number(r.exp), items: r.items ? JSON.parse(r.items) : {}, rewarded: !!r.rewarded, first: !!r.first, left: !!r.left }));
  }
  async daily(uid) {
    return (await q("SELECT day, n, cleared FROM pb_daily WHERE user_id = ? ORDER BY day DESC LIMIT 7", [uid])).map((r) => ({ day: r.day instanceof Date ? dayOf(+r.day + 12 * 3600_000) : String(r.day), n: r.n, cleared: r.cleared }));
  }
  /** Give uid back their entries for today (the admin). */
  async resetDaily(uid) {
    await q("UPDATE pb_daily SET n = 0 WHERE user_id = ? AND day = ?", [uid, dayOf()]);
  }
}

/**
 * One run: a party in their own copy of a dungeon. Its members (fixed when it starts), its stages and seals, its
 * monsters (stronger by party size), its boss, the shared lives, the clock; the end and the rewards.
 */
export class Run {
  constructor(runs, id, d, members, leader) {
    this.runs = runs;
    this.u = runs.u;
    this.id = id;
    this.d = d;
    this.key = runKey(id);
    this.leader = leader;
    this.members = new Map(members.map((m) => [m.uid, { ...m, deaths: 0, dmg: 0, left: false, away: null, from: null, pulling: false, seen: false }]));
    this.size = members.length;
    this.scale = scaleFor(this.size);
    this.lives = livesFor(this.size);
    this.deaths = 0;
    this.stage = 0; // the hall open to them: its seal is closed until it is cleared
    this.state = "running";
    this.startedAt = Date.now();
    this.ends = this.startedAt + PB.minutes * 60_000;
    this.endAt = 0;
    this.boss = null;
    this.helped = false;
    this.raged = false;
    this.nextRoar = 0;
    this.world = null;
  }
  get map() {
    return this.world.map;
  }
  get stages() {
    return this.map.def.stages;
  }
  /** Make the world, put the monsters and the boss in it, bring everyone in. */
  open() {
    const w = (this.world = this.runs.make(this.id, this.d.map));
    w.run = this;
    this.u.worlds.set(this.key, w);
    const T = this.map.T;
    this.d.stages.forEach((st, i) => {
      const at = this.stages[i], spots = [...at.spots];
      let k = 0;
      for (const g of st.mobs ?? [])
        for (let n = 0; n < g.n; n++) {
          const [x, row, up] = spots[k++ % spots.length], d = MONSTERS[g.type];
          if (!d) continue;
          this.addMob(g.type, (x + (k > spots.length ? 0.5 : 0)) * T, (row - (d.fly ? Math.max(1, up) : 0)) * T, i, !!g.elite);
        }
      if (st.boss) this.addBoss(st.boss, at.boss[0] * T, at.boss[1] * T, i);
    });
    for (const m of this.members.values()) this.pull(m);
    this.u.feed(`🏯 Tổ đội ${[...this.members.values()].map((m) => m.name).join(", ")} tiến vào ${this.d.name}.`);
  }
  /** A monster of the den: its kind's numbers, stronger for the run (and much stronger for an elite); never comes back. */
  addMob(type, x, y, stage, elite = false) {
    const w = this.world, m = w.addMonster(type, x, y);
    if (!m) return null;
    const d = m.def, k = elite ? ELITE : { hp: 1, atk: 1 };
    m.st = { maxHp: Math.round(d.hp * PB.monsterHp * this.scale.hp * k.hp), atk: d.atk * PB.monsterAtk * this.scale.atk * k.atk, def: d.def * (elite ? 1.4 : 1), spd: d.spd };
    m.stage = stage;
    m.once = true;
    if (elite) m.elite = true;
    return m;
  }
  addBoss(key, x, y, stage) {
    const def = BOSSES[key], maxHp = Math.round(PB.bossHp * this.scale.hp);
    this.boss = { key, def, hp: maxHp, maxHp, stage, x, y, m: null };
    const fight = {
      hit: (att, dmg) => {
        const b = this.boss;
        if (!b || b.hp <= 0 || this.state !== "running") return 0;
        const took = Math.min(b.hp, dmg);
        b.hp -= took;
        if (b.hp <= 0) this.bossDown(att);
        else this.bossPhase();
        return took;
      },
      frac: () => (this.boss ? this.boss.hp / this.boss.maxHp : 0),
    };
    // its numbers: the run's (shared/pho-ban.js), stronger by party size; the world boss's for the rest
    const cfg = { atk: PB.bossAtk * this.scale.atk, def: PB.bossDef, roarPct: PB.roarPct, thornsPct: PB.thornsPct, slamCd: 3.5, slamMult: 2, slamReach: 150, aggro: 460, leash: 900, spd: 55 };
    this.boss.m = this.world.addRunBoss(key, x, y, fight, cfg, maxHp);
    this.boss.m.stage = stage;
  }

  // ---- who is in
  /** Bring member m in from wherever they are (if online, not left, not there already). */
  pull(m) {
    const p = this.u.players.get(m.uid), w = this.world;
    if (!p || p.gone || !w || m.left || m.pulling || p.world === w || p.warping) return;
    m.pulling = true;
    if (p.fish) p.world.fishEnd(p, "move");
    m.from ??= { key: p.world.key, at: { x: p.x, y: p.y } };
    this.u.warpTo(p, this.key, () => w.spawnPoint(p)).catch((e) => console.error("pb pull", e.message)).finally(() => (m.pulling = false));
  }
  /** Someone came in (pulled, or logging in again): alive, full, told where things stand. */
  onEnter(p) {
    const m = this.members.get(p.userId);
    if (!m) return;
    m.seen = true;
    m.away = null;
    p.dead = false;
    p.hpFrac = 1;
    p.pk = false;
    this.push(p);
  }
  /** Someone's socket closed inside: their place is kept (they come back in when they log in). */
  onGone(p) {
    const m = this.members.get(p.userId);
    if (m && !m.left) m.away = Date.now();
  }
  /** Someone was taken off the map some other way (a battle called them): they are out of the run. */
  onLeave(p) {
    const m = this.members.get(p.userId);
    if (!m || m.left || this.state !== "running" || this.closing || p.leavingRun) return;
    m.left = true;
    this.world.feed(`${m.name} đã rời phó bản.`);
    this.pushAll();
    this.checkEmpty();
  }
  async quit(uid) {
    const m = this.members.get(uid);
    if (!m || m.left) throw no("Đạo hữu không ở trong phó bản.");
    if (this.state !== "running") throw no("Phó bản đã kết thúc, sắp được đưa về.");
    m.left = true;
    q("UPDATE pb_members SET `left` = 1 WHERE run_id = ? AND user_id = ?", [this.id, uid]).catch(() => {});
    this.world.feed(`${m.name} đã rời phó bản.`);
    const p = this.u.players.get(uid);
    if (p && p.world === this.world) await this.sendBack(p, m);
    this.pushAll();
    this.checkEmpty();
  }
  /** Nobody left in it: abandoned. */
  checkEmpty() {
    if (this.state === "running" && [...this.members.values()].every((m) => m.left)) this.finish("abandoned", "Cả tổ đội đã rời phó bản");
  }

  // ---- the fight
  /** Damage dealt by a member (to anything here), for the board. */
  onDmg(p, dmg) {
    const m = this.members.get(p.userId);
    if (m) m.dmg += dmg;
  }
  /** A monster fell: when its hall is clear, the seal opens. */
  onMobDie(e) {
    if (this.state !== "running") return;
    this.advance();
  }
  /** How many of hall i's monsters are still up (and how many there were). */
  count(i) {
    let up = 0, all = 0;
    for (const e of this.world.ents.values())
      if (e.kind === "m" && e.stage === i && !e.boss) {
        all++;
        if (!e.dead) up++;
      }
    return { up, all };
  }
  /** Open every seal whose hall is clear, in order. */
  advance() {
    while (this.stage < this.stages.length - 1 && this.count(this.stage).up === 0) {
      const st = this.d.stages[this.stage];
      this.stage++;
      const next = this.d.stages[this.stage];
      this.world.feed(`🏯 ${st.name} đã được dọn sạch! Phong ấn mở ra: tiến vào ${next.name}.`);
      this.world.ev({ e: "pb", k: "seal", n: this.stage - 1, x: Math.round(this.stages[this.stage - 1].seal * this.map.T) });
      q("UPDATE pb_runs SET stage = ? WHERE id = ?", [this.stage, this.id]).catch(() => {});
    }
    this.pushAll();
  }
  /** The seals: nobody passes a closed one (a wall of light at its cell). */
  wall(p) {
    for (let i = this.stage; i < this.stages.length; i++) {
      const s = this.stages[i].seal;
      if (s === null || s === undefined) continue;
      const x = s * this.map.T - 6;
      if (p.x > x) {
        p.x = x;
        p.vx = 0;
        if (this.world.t >= (p.wallSaid ?? 0)) {
          p.wallSaid = this.world.t + 3;
          this.world.sendTo(p, { t: "toast", m: `Phong ấn còn đóng: ${this.d.stages[i].goal.toLowerCase()} trước đã.` });
        }
      }
      return;
    }
  }
  /** Where someone rises: the checkpoint of the hall open now. */
  checkpoint() {
    return this.stages[this.stage].check * this.map.T;
  }
  /** A member fell (to a monster, the boss, the venom): a life spent, or none left and the run is lost. */
  onFall(p) {
    const m = this.members.get(p.userId);
    if (!m || this.state !== "running") return;
    m.deaths++;
    this.deaths++;
    if (this.lives <= 0) {
      this.world.feed(`☠ ${m.name} gục ngã và tổ đội đã hết lượt hồi sinh!`);
      this.finish("failed", "Hết lượt hồi sinh");
      return;
    }
    this.lives--;
    p.respawnAt = this.world.t + PB.respawn;
    this.world.feed(`☠ ${m.name} gục ngã: còn ${this.lives} lượt hồi sinh, hồi sinh sau ${PB.respawn} giây ở điểm hồi sinh.`);
    this.pushAll();
  }
  /** The boss lost a share of its life: help at half, rage at a quarter. */
  bossPhase() {
    const b = this.boss, f = b.hp / b.maxHp, w = this.world, T = this.map.T;
    if (!this.helped && f <= 0.5) {
      this.helped = true;
      const help = this.d.stages[b.stage].help ?? [], spots = this.stages[b.stage].spots;
      let k = 0;
      for (const g of help)
        for (let n = 0; n < g.n; n++) {
          const [x, row, up] = spots[k++ % spots.length], d = MONSTERS[g.type];
          const m = d && this.addMob(g.type, x * T, (row - (d.fly ? Math.max(1, up) : 0)) * T, b.stage);
          if (m) w.ev({ e: "spawn", id: m.id });
        }
      w.feed(`🐍 ${b.def.name} gầm lên gọi thuộc hạ tới trợ chiến!`);
      w.ev({ e: "pb", k: "help" });
    }
    if (!this.raged && f <= 0.25) {
      this.raged = true;
      b.m.cfg.slamCd = 1.75;
      b.m.cfg.atk *= 1.2;
      w.feed(`🔥 ${b.def.name} nổi cơn cuồng bạo: ra đòn nhanh gấp đôi!`);
      w.ev({ e: "pb", k: "rage" });
    }
    this.pushAll();
  }
  bossDown(att) {
    const w = this.world, b = this.boss;
    w.bossDie(b.m);
    w.feed(`🏆 ${b.def.name} đã bị hạ${att?.name ? ` bởi ${att.name}` : ""}!`);
    this.finish("cleared").catch((e) => console.error("pb clear", e));
  }

  // ---- every second
  async tick() {
    const now = Date.now();
    if (this.state !== "running") {
      if (this.endAt && now >= this.endAt) await this.close();
      return;
    }
    if (now >= this.ends) return this.finish("failed", "Hết giờ");
    // those who are away come back in when they log in; those online elsewhere (a hiccup) are brought in
    for (const m of this.members.values()) if (!m.left && !m.away) this.pull(m);
    if ([...this.members.values()].every((m) => m.left || (m.away && now - m.away > ALL_AWAY * 1000))) return this.finish("abandoned", "Cả tổ đội mất kết nối quá lâu");
    // the boss roars at the whole party every PB.roarEvery seconds once the fight is on
    const bm = this.boss?.m;
    if (bm && !bm.dead && this.stage === this.boss.stage) {
      if (bm.target && !this.nextRoar) this.nextRoar = now + PB.roarEvery * 1000;
      if (this.nextRoar && now >= this.nextRoar) {
        this.nextRoar = now + PB.roarEvery * 1000;
        this.world.bossRoar(bm);
      }
    }
    this.pushAll();
  }

  // ---- what the HUD shows
  state_() {
    const st = this.d.stages[this.stage], c = this.count(this.stage), b = this.boss, now = Date.now();
    return {
      t: "pbstate", id: this.id, name: this.d.name, stage: this.stage, stages: this.d.stages.map((s) => s.name), goal: st.goal,
      up: c.up, all: c.all, lives: this.lives, deaths: this.deaths, left: Math.max(0, Math.ceil((this.ends - now) / 1000)), limit: PB.minutes * 60,
      seals: this.stages.map((s, i) => (s.seal === null || s.seal === undefined ? null : { x: s.seal * this.map.T, open: i < this.stage })).filter(Boolean),
      boss: b && this.stage === b.stage ? { name: b.def.name, hp: b.hp, max: b.maxHp, rage: this.raged, roarIn: this.nextRoar ? Math.max(0, Math.ceil((this.nextRoar - now) / 1000)) : null } : null,
      board: [...this.members.values()].map((m) => ({ name: m.name, dmg: Math.round(m.dmg), deaths: m.deaths, left: m.left, away: !!m.away })),
      state: this.state,
    };
  }
  push(p) {
    this.world.sendTo(p, this.state_());
  }
  pushAll() {
    const raw = this.state_();
    for (const p of this.world.players.values()) this.world.sendTo(p, raw);
  }

  // ---- the end
  /** Cleared, failed or abandoned: written once; for a clear, the rewards; everyone back AFTER seconds later. */
  async finish(state, why = "") {
    if (this.state !== "running") return;
    this.state = state;
    this.endAt = Date.now() + AFTER * 1000;
    const secs = Math.round((Math.min(Date.now(), this.ends) - this.startedAt) / 1000), limit = PB.minutes * 60;
    const rank = state === "cleared" ? rankOf(secs, limit) : null;
    let saved = false;
    try {
      const r = await q("UPDATE pb_runs SET state = ?, ended_at = NOW(), seconds = ?, rank_ = ?, stage = ?, lives = ?, deaths = ?, note = ? WHERE id = ? AND state = 'running'",
        [state, secs, rank, this.stage, this.lives, this.deaths, why, this.id]);
      saved = r.affectedRows === 1;
    } catch (e) {
      console.error("pb end", e);
    }
    const out = new Map();
    for (const m of this.members.values()) {
      const row = { dmg: Math.round(m.dmg), deaths: m.deaths, left: m.left, reward: null, first: false };
      q("UPDATE pb_members SET dmg = ?, deaths = ?, `left` = ? WHERE run_id = ? AND user_id = ?", [row.dmg, m.deaths, m.left ? 1 : 0, this.id, m.uid]).catch(() => {});
      out.set(m.uid, row);
    }
    if (saved && state === "cleared") {
      for (const m of this.members.values()) {
        if (m.left) continue;
        try {
          const got = await userLock.run(m.uid, () => tx(async (c) => {
            const [mem] = await c.query("SELECT day, rewarded FROM pb_members WHERE run_id = ? AND user_id = ? FOR UPDATE", [this.id, m.uid]);
            if (!mem || mem.rewarded) return null;
            const day = mem.day instanceof Date ? mem.day : new Date(mem.day);
            const [d] = await c.query("SELECT cleared FROM pb_daily WHERE user_id = ? AND day = ? FOR UPDATE", [m.uid, day]);
            const first = !d || Number(d.cleared) === 0;
            const rw = rewardFor(rank, first);
            await c.query("UPDATE pb_daily SET cleared = cleared + 1 WHERE user_id = ? AND day = ?", [m.uid, day]);
            await c.query("UPDATE characters SET stones = stones + ?, exp = exp + ? WHERE user_id = ?", [rw.stones, rw.exp, m.uid]);
            for (const [k, n] of Object.entries(rw.items)) if (ITEMS[k] && n > 0) await c.query("INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)", [m.uid, k, n]);
            await c.query("UPDATE pb_members SET rewarded = 1, first = ?, stones = ?, exp = ?, items = ? WHERE run_id = ? AND user_id = ?", [first ? 1 : 0, rw.stones, rw.exp, JSON.stringify(rw.items), this.id, m.uid]);
            return { ...rw, first };
          }));
          if (got) {
            const r = out.get(m.uid);
            r.reward = got;
            r.first = got.first;
            const ch = await store.loadCharacter(m.uid);
            this.u.refresh(m.uid, ch);
            this.u.sendInvOf?.(m.uid);
          }
        } catch (e) {
          console.error("pb reward", m.uid, e.message);
        }
      }
    }
    const names = [...this.members.values()].map((m) => m.name).join(", ");
    if (state === "cleared") this.u.feed(`🏯 Tổ đội ${names} đã thông quan ${this.d.name} trong ${mmss(secs)}, hạng ${rank}!`);
    const board = [...this.members.values()].map((m) => ({ name: m.name, dmg: Math.round(m.dmg), deaths: m.deaths, left: m.left })).sort((a, b) => b.dmg - a.dmg);
    for (const m of this.members.values()) {
      const p = this.u.players.get(m.uid), row = out.get(m.uid);
      const msg = { t: "pbend", name: this.d.name, state, stateName: STATE_NAMES[state], why, secs, limit, rank, board, back: AFTER, me: row, saved };
      if (p && p.world === this.world) this.world.sendTo(p, msg);
      else if (p && row.reward) this.u.toastUser(m.uid, `🏯 Tổ đội đã thông quan ${this.d.name} (hạng ${rank}): đạo hữu nhận ${fmt(row.reward.stones)} linh thạch, ${fmt(row.reward.exp)} tu vi.`);
    }
    this.world.ev({ e: "pb", k: "end", s: state, r: rank });
    this.pushAll();
  }
  /** Everyone back where they came from; the world is taken down. */
  async close() {
    if (this.closing) return;
    this.closing = true;
    try {
      for (const p of [...this.world.players.values()]) await this.sendBack(p, this.members.get(p.userId)).catch((e) => console.error("pb back", e.message));
      this.u.worlds.delete(this.key);
      this.runs.runs.delete(this.id);
    } finally {
      this.closing = false;
    }
  }
  /** Take p out to where they came from (if it is still there), else the starter town. */
  async sendBack(p, m) {
    const from = m?.from, to = from && this.u.canGo(from.key) && !String(from.key).startsWith("pb:") ? from.key : "tanthu";
    p.dead = false;
    p.hpFrac = Math.max(p.hpFrac, 1);
    p.leavingRun = true;
    try {
      await this.u.transfer(p, to, this.key, to === from?.key ? from.at : null);
    } finally {
      p.leavingRun = false;
    }
  }
  /** The admin ends it now: failed, nothing given, everyone back at once. */
  async cancel(why = "Admin kết thúc") {
    await this.finish("failed", why);
    this.endAt = Date.now();
    await this.close();
  }
  /** The admin (or a test) opens the next seal at once: the hall's monsters are gone. */
  skip() {
    if (this.state !== "running") throw no("Phó bản đã kết thúc.");
    if (this.stage >= this.stages.length - 1) throw no("Đã tới tầng cuối.");
    for (const e of [...this.world.ents.values()]) if (e.kind === "m" && e.stage === this.stage && !e.boss) {
      e.dead = true;
      e.hpFrac = 0;
      this.world.ents.delete(e.id);
      this.world.ev({ e: "die", id: e.id });
    }
    this.advance();
  }
  /** The admin (or a test) brings everyone inside to the checkpoint of the hall open now. */
  gather() {
    for (const p of this.world.players.values()) {
      if (!this.members.has(p.userId)) continue;
      Object.assign(p, this.world.spawnPoint(p));
      this.world.ev({ e: "warp", id: p.id, x: Math.round(p.x), y: Math.round(p.y), out: 0 });
      this.world.sendMe(p);
    }
  }
  summary() {
    const now = Date.now();
    return {
      id: this.id, dungeon: this.d.key, name: this.d.name, state: this.state, stage: this.stage, stageName: this.d.stages[this.stage]?.name, lives: this.lives, deaths: this.deaths,
      left: Math.max(0, Math.ceil((this.ends - now) / 1000)), boss: this.boss ? { hp: this.boss.hp, max: this.boss.maxHp } : null,
      members: [...this.members.values()].map((m) => ({ uid: m.uid, name: m.name, dmg: Math.round(m.dmg), deaths: m.deaths, left: m.left, away: !!m.away })),
    };
  }
}

export { MAPS, mapInfo };
