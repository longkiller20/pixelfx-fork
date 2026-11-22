// Fallen in the open world (server/world.js revive/reviveTown, settings revive.*), against a running server:
//   node test/hoi-sinh.mjs [http://localhost:5886] [admin port 5885]
// A weak player on Linh Thủy Đàm with monsters placed right where they stand falls; the box offers the town (not before
// respawn.world) and rising here for reviveCost(level); too poor is refused; paying takes exactly that, up where they
// fell with revive.hp of their life; the town is Tân Thủ Thôn's spawn, full life; nobody choosing is taken to town when
// revive.wait runs out. Leaves the game as it found it.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.argv[3] ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const { mapInfo } = await import("../shared/maps/index.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (n) => (passed++, console.log("  ✓", n));

const apass = `p${tag}${tag}`;
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [`hs_${tag}`, await hashPassword(apass)]);
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: `hs_${tag}`, password: apass }) })).json()).token;
assert.ok(atok, "admin login");
const A = async (method, path, body) => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + atok }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const settings = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k LIKE 'revive.%' OR k = 'respawn.world'")).map((r) => [r.k, Number(r.v)]));
const setting = (k, v) => A("PATCH", `/t/settings/${encodeURIComponent(k)}`, { v });

// a weak player (level 1, a little linh thạch) on Linh Thủy Đàm, and fierce monsters placed where they appear
const L = mapInfo("linhthuy"), sx = L.def.spawn.x;
const uid = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`hs_${tag}`])).insertId;
await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 0, 30, 'linhthuy', 'c')", [uid, `Hs${tag}`]);
const spawnRow = (await A("POST", "/spawns", { map: "linhthuy", type: "eyeball", x: sx + 3, n: 4, note: "test hoi-sinh" })).j;
assert.ok(spawnRow.id, JSON.stringify(spawnRow));
const token = await createSession(uid);
let c;
const connect = () =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], id: 0, pos: {}, me: null, map: null };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") {
        for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2], hp: a[4], dead: !!(a[5] & 1) };
        return;
      }
      if (m.t === "me") c.me = m;
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 6000);
  });
const tx = (m) => c.ws.send(JSON.stringify(m));
const until = async (fn, ms = 8000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
};
const since = (k) => c.msgs.slice(k);
const fall = async () => {
  assert.ok(await until(() => c.me?.rv, 40000), "fell to the monsters");
  return c.me;
};
try {
  // nobody waits long in the test
  await setting("revive.wait", 8);
  await setting("respawn.world", 2);
  c = await connect();
  // ---- fallen: the box's numbers
  let me = await fall();
  const cost = me.rv.cost, here = { ...c.pos[c.id] };
  assert.ok(cost === settings["revive.base"] + settings["revive.per_level"] * me.lv, `the cost: base + per level × ${me.lv} = ${cost}`);
  assert.equal(me.rv.town, "Tân Thủ Thôn");
  assert.ok(me.respawn > 0 && me.rv.left > 5);
  ok(`fallen: the box offers the town and rising here for ${cost} linh thạch (level ${me.lv})`);
  // ---- not yet to town; too poor to rise here
  let k = c.msgs.length;
  tx({ t: "revive", how: "town" });
  await sleep(300);
  assert.ok(since(k).some((m) => m.t === "toast" && /Chờ/.test(m.m)), "told to wait");
  assert.ok(c.me.rv, "still fallen");
  await q("UPDATE characters SET stones = 0 WHERE user_id = ?", [uid]);
  await A("POST", `/players/${uid}/adjust`, { field: "stones", op: "set", value: cost - 1 });
  await until(() => c.me.stones === cost - 1, 3000);
  k = c.msgs.length;
  tx({ t: "revive", how: "here" });
  await sleep(300);
  assert.ok(since(k).some((m) => m.t === "toast" && /Cần/.test(m.m)), "too poor");
  assert.ok(c.me.rv, "still fallen");
  ok("the town not before respawn.world; rising here refused without the linh thạch");
  // ---- pay, up where they fell
  await A("POST", `/players/${uid}/adjust`, { field: "stones", op: "set", value: cost + 100 });
  await until(() => c.me.stones === cost + 100, 3000);
  k = c.msgs.length;
  tx({ t: "revive", how: "here" });
  assert.ok(await until(() => !c.me.rv && c.me.stones === 100), `paid and up (${JSON.stringify(c.me.rv)}, ${c.me.stones})`);
  await until(() => c.pos[c.id] && !c.pos[c.id].dead);
  const up = c.pos[c.id];
  // (the snapshot's life is per mille; the monsters may already have bitten once the moment's protection is over)
  assert.ok(up.hp <= settings["revive.hp"] * 10 && up.hp >= settings["revive.hp"] * 10 - 150, `life ${up.hp}‰`);
  assert.ok(Math.abs(up.x - here.x) < 64, `where they fell (${here.x} → ${up.x})`);
  assert.ok(since(k).some((m) => m.t === "toast" && new RegExp(`−${cost}`).test(m.m)));
  ok(`rising here: exactly ${cost} linh thạch, up where they fell (${Math.round(here.x)} → ${Math.round(up.x)} px), with ${settings["revive.hp"]}% life`);
  // ---- fallen again: to town
  me = await fall();
  await until(() => c.me.respawn <= 0, 4000);
  await sleep(2100);
  k = c.msgs.length;
  tx({ t: "revive", how: "town" });
  assert.ok(await until(() => since(k).some((m) => m.t === "welcome" && m.map === "tanthu"), 8000), "taken to Tân Thủ Thôn");
  const T = mapInfo("tanthu");
  await until(() => c.pos[c.id]);
  assert.ok(Math.abs(c.pos[c.id].x - T.spawn.x) < 96, `at its spawn (${c.pos[c.id].x} vs ${T.spawn.x})`);
  assert.equal((await q("SELECT map_id FROM characters WHERE user_id = ?", [uid]))[0].map_id, "tanthu");
  await until(() => c.me && !c.me.rv);
  assert.ok(!c.me.rv && c.me.stones === 100, "nothing paid");
  assert.ok(c.pos[c.id].hp === 1000, `full life (${c.pos[c.id].hp}‰)`);
  // the payment is saved, not just shown
  const saved = async () => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [uid]))[0].stones);
  for (let i = 0; i < 40 && (await saved()) !== 100; i++) await sleep(500);
  assert.equal(await saved(), 100, "the database has the linh thạch after the payment");
  ok("to town: Tân Thủ Thôn's spawn, full life, remembered, nothing paid; the earlier payment saved in the database");
  // ---- back to the monsters; this time nobody chooses
  c.ws.close();
  await q("UPDATE characters SET map_id = 'linhthuy' WHERE user_id = ?", [uid]);
  await sleep(1500);
  c = await connect();
  assert.equal(c.map, "linhthuy");
  me = await fall();
  k = c.msgs.length;
  assert.ok(await until(() => since(k).some((m) => m.t === "welcome" && m.map === "tanthu"), 15000), "taken to town when the time ran out");
  assert.ok(since(k).some((m) => m.t === "toast" && /Hết thời gian/.test(m.m)));
  ok("nobody choosing: taken to Tân Thủ Thôn when revive.wait runs out");
} finally {
  c?.ws.close();
  await A("DELETE", `/spawns/${spawnRow.id}`);
  for (const k of ["revive.wait", "respawn.world"]) await setting(k, settings[k]);
  await q("DELETE FROM characters WHERE user_id = ?", [uid]);
  await q("DELETE FROM users WHERE id = ?", [uid]);
  await q("DELETE FROM admins WHERE username = ?", [`hs_${tag}`]);
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
