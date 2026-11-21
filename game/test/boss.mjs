// Boss Thế Giới against a running server (game and admin site): node test/boss.mjs [http://localhost:5886]
// An admin calls Hỏa Ngưu Ma Vương onto a map (not onto the safe starter town, not twice at once); it stands in every
// Khu of that map with one shared life: a blow in Khu 2 shows on the bar in Khu 1 and Khu 3; it throws part of every blow
// back (phản đòn); its roar strikes every player of the map in every Khu at once; brought down, the pools are shared by
// damage and the one who finished it gets the bonus on top, written once (a row per player), each told what they got;
// a boss taken back by the admin leaves every Khu and gives nothing. The admin's numbers are put back after.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const { mapInfo } = await import("../shared/maps/index.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, n = 0;
const ok = (name) => (passed++, console.log("  ✓", name));
const MAP = "linhthuy", M = mapInfo(MAP);
const socks = [];

async function person(map, exp = 3_000_000) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`bs_${tag}_${i}`])).insertId;
  const name = `Bs${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', ?, 0, ?, 'c')", [id, name, exp, map]);
  return { id, name, token: await createSession(id) };
}
function connect(P) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], ev: [], me: null, id: 0, P, pos: {}, mons: {}, boss: null, bossend: null, info: null };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: P.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") {
        for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2], hp: a[4], dead: !!(a[5] & 1) };
        c.mons = {};
        for (const a of m.M) c.mons[a[0]] = { type: a[1], x: a[2], y: a[3], hp: a[5], dead: !!(a[6] & 1) };
        for (const e of m.E ?? []) c.ev.push(e);
        return;
      }
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
      if (m.t === "me") c.me = m;
      if (m.t === "boss") c.boss = m;
      if (m.t === "bossend") c.bossend = m;
      if (m.t === "bossinfo") c.info = m;
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 8000);
  });
}
const until = async (fn, ms = 6000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
const tx = (c, m) => c.ws.send(JSON.stringify(m));
const me = (c) => c.pos[c.id];
const bossOf = (c) => Object.entries(c.mons).filter(([, m]) => m.type === "boss:nguuma").sort((a, b) => a[1].dead - b[1].dead)[0];
/** Walk c up to the boss and keep striking it for ms. */
async function fight(c, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const b = bossOf(c), p = me(c);
    if (!b || b[1].dead) break;
    if (p && !p.dead) {
      const dx = b[1].x - p.x;
      if (Math.abs(dx) > 50) tx(c, { t: "in", dx: Math.sign(dx), jump: false, down: false });
      else tx(c, { t: "in", dx: 0, jump: false, down: false });
      tx(c, { t: "cast", s: 0, ax: Math.sign(dx) || 1, ay: 0 });
    }
    await sleep(120);
  }
  tx(c, { t: "in", dx: 0, jump: false, down: false });
}

// the admin, and the numbers this test runs on (put back after)
const aname = "t_boss_" + tag, apw = "tamthoi123";
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [aname, await hashPassword(apw)]);
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: aname, password: apw }) })).json()).token;
const adm = async (path, body, method = "POST") => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + atok }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const RUN = { "boss.roar_every": 4, "boss.roar_pct": 10, "boss.thorns_pct": 10, "boss.atk": 1, "boss.def": 0, "boss.slam_cd": 2 };
const old = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k IN (?)", [Object.keys(RUN)])).map((r) => [r.k, r.v]));
for (const [k, v] of Object.entries(RUN)) assert.equal((await adm(`/t/settings/${k}`, { v }, "PATCH")).status, 200, k);
if ((await adm("/boss", null, "GET")).data.now) await adm("/boss/despawn", {});

try {
  console.log("Boss Thế Giới against", BASE);
  // ---- calling it: not onto the starter town, not a boss that isn't, once at a time
  const view = (await adm("/boss", null, "GET")).data;
  assert.ok(view.maps.some((m) => m.id === MAP) && !view.maps.some((m) => m.id === "tanthu"), "the hunting maps, not the starter town");
  assert.equal((await adm("/boss/spawn", { key: "nguuma", map: "tanthu" })).status, 400, "not in Tân Thủ Thôn");
  assert.equal((await adm("/boss/spawn", { key: "nope", map: MAP })).status, 400, "not a boss that isn't");
  const X = 7 * M.T + 260;
  const sp = await adm("/boss/spawn", { key: "nguuma", map: MAP, x: X, hp: 20000, stones: 9000, exp: 30000, killBonus: 20, minutes: 10 });
  assert.equal(sp.status, 200, JSON.stringify(sp.data));
  assert.equal((await adm("/boss/spawn", { key: "nguuma", map: MAP, x: X })).status, 409, "not a second at once");
  ok("called by an admin onto a hunting map; not onto Tân Thủ Thôn, not twice at once");

  // ---- in every Khu, one life
  const A = await connect(await person(MAP)), B = await connect(await person(`${MAP}:2`)), C = await connect(await person(`${MAP}:3`)), far = await connect(await person("bichlac"));
  socks.push(A, B, C, far);
  for (const c of [A, B, C]) assert.ok(await until(() => bossOf(c)), "the boss is in every Khu");
  assert.ok(await until(() => far.info?.up === 1), "someone on another map hears it is up");
  assert.equal(far.info.map, MAP);
  assert.ok(!bossOf(far), "but doesn't see it there");
  const hp0 = bossOf(A)[1].hp;
  await fight(B, 2500);
  await until(() => bossOf(A)[1].hp < hp0 && bossOf(C)[1].hp < hp0, 3000);
  assert.ok(bossOf(A)[1].hp < hp0, "B's blows in Khu 2 show on Khu 1's bar");
  assert.equal(bossOf(A)[1].hp, bossOf(C)[1].hp, "and on Khu 3's, the same");
  await until(() => A.boss && A.boss.hp < A.boss.max, 2000);
  assert.ok(A.boss.top.some((r) => r.name === B.P.name), "B is on the ranking A sees");
  // phản đòn: the striker took some back
  assert.ok(B.ev.some((e) => e.e === "hit" && e.id === B.id && e.th), "part of each blow thrown back at B");
  ok("one boss in every Khu with one life: a blow in Khu 2 shows in Khu 1 and 3; the ranking; phản đòn on the striker");

  // ---- the roar strikes everyone on the map, in every Khu at once
  for (const c of [A, B, C]) c.ev.length = 0;
  assert.ok(await until(() => [A, B, C].every((c) => c.ev.some((e) => e.e === "hit" && e.id === c.id && e.roar)), 7000), "everyone on the map struck by the roar");
  assert.ok(A.ev.some((e) => e.e === "boss" && e.a === "roar"), "the roar seen in Khu 1");
  ok("the roar: every player of the map, in every Khu, struck at once");

  // ---- brought down: shared by damage, the killer's bonus, once, each told
  await Promise.all([fight(A, 60000), fight(B, 60000), fight(C, 60000)]);
  assert.ok(await until(() => A.bossend && B.bossend && C.bossend, 15000), "everyone who fought is told it fell");
  const [row] = await q("SELECT * FROM world_bosses WHERE id = ?", [sp.data.boss.id]);
  assert.equal(row.state, "dead");
  assert.equal(row.alive, null);
  const rw = await q("SELECT user_id, dmg, stones, exp, killer FROM boss_rewards WHERE boss_id = ?", [row.id]);
  assert.equal(rw.length, 3, "a row for each of the three who struck it");
  const total = rw.reduce((a, r) => a + Number(r.dmg), 0), killer = rw.filter((r) => r.killer);
  assert.equal(killer.length, 1, "one killer");
  assert.equal(killer[0].user_id, row.killer_id);
  for (const r of rw) {
    const base = Math.floor((9000 * Number(r.dmg)) / total) + (r.killer ? Math.floor(9000 * 0.2) : 0);
    assert.equal(r.stones, base, "linh thạch by damage (+20% of the pool for the killer)");
    const [ch] = await q("SELECT stones FROM characters WHERE user_id = ?", [r.user_id]);
    assert.ok(Number(ch.stones) >= r.stones, "and in their purse");
  }
  const killerC = [A, B, C].find((c) => c.P.id === row.killer_id);
  assert.ok(killerC.bossend.me.killer && killerC.bossend.me.stones === killer[0].stones, "the killer is told their share and bonus");
  assert.ok(far.info.up === 0 || (await until(() => far.info.up === 0, 6000)), "everyone hears it is gone");
  await sleep(1500);
  assert.ok([A, B, C].every((c) => !bossOf(c) || bossOf(c)[1].dead), "down in every Khu");
  ok("brought down: linh thạch and tu vi shared by damage, the killer's bonus on top, a row each (given once), each told");

  // ---- taken back by the admin: gone from every Khu, nothing given
  await until(async () => (await adm("/boss/spawn", { key: "nguuma", map: MAP, x: X, hp: 50000 })).status === 200, 12000);
  assert.ok(await until(() => bossOf(A) && !bossOf(A)[1].dead && bossOf(B) && !bossOf(B)[1].dead, 4000), "a new one in both Khu");
  const id2 = (await adm("/boss", null, "GET")).data.now.id;
  await fight(A, 1500);
  assert.equal((await adm("/boss/despawn", {})).status, 200);
  assert.ok(await until(() => !bossOf(A) && !bossOf(B), 3000), "gone from every Khu");
  const [r2] = await q("SELECT state, alive FROM world_bosses WHERE id = ?", [id2]);
  assert.equal(r2.state, "gone");
  assert.equal((await q("SELECT COUNT(*) AS n FROM boss_rewards WHERE boss_id = ?", [id2]))[0].n, 0, "nothing given");
  assert.equal((await adm("/boss/despawn", {})).status, 400, "nothing left to take back");
  ok("taken back by the admin: gone from every Khu, nothing given");
} finally {
  for (const c of socks) c.ws.close();
  if ((await adm("/boss", null, "GET")).data.now) await adm("/boss/despawn", {});
  for (const [k, v] of Object.entries(old)) await adm(`/t/settings/${k}`, { v }, "PATCH");
  await q("DELETE FROM admins WHERE username = ?", [aname]);
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
