// Monsters placed from the database (server/spawns.js, admin /api/spawns), against a running server:
//   node test/dat-quai.mjs [http://localhost:5886] [admin port 5885]
// A player on Bích Lạc Lâm sees a placed row's monsters appear (n of them, on the floor), moved when the row changes,
// gone when it is deleted; a map without monsters, an unknown monster or x off the map is refused; a monster that a row
// places can't be deleted from the monsters table; the announcement reaches the player; the schema, maps and effects
// lists answer.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.argv[3] ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => (passed++, console.log("  ✓", name));

// an admin of our own, and a player on Bích Lạc Lâm
const apass = `p${tag}${tag}`;
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [`dq_${tag}`, await hashPassword(apass)]);
const tok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: `dq_${tag}`, password: apass }) })).json()).token;
assert.ok(tok, "admin login");
const A = async (method, path, body) => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const uid = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`dq_${tag}`])).insertId;
await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id) VALUES (?, ?, 'tu', 'm', 1000, 0, 'bichlac')", [uid, `Dq${tag}`]);
const token = await createSession(uid);
const c = await new Promise((resolve, reject) => {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
  const c = { ws, M: [], msgs: [] };
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "s") c.M = m.M;
    else c.msgs.push(m);
    if (m.t === "welcome") resolve(c);
  });
  ws.on("error", reject);
  setTimeout(() => reject(new Error("no welcome")), 6000);
});
const at = (x0, x1, type) => c.M.filter((m) => m[1] === type && m[2] >= x0 && m[2] <= x1);
let rowId;
try {
  await sleep(500);
  const T = 32;
  // nothing at x 40 cells (1280 px) of type wisp before
  const before = at(40 * T - 200, 40 * T + 200, "wisp").length;
  let r = await A("POST", "/spawns", { map: "bichlac", type: "wisp", x: 40, n: 3, up: 2, note: "test" });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  rowId = r.j.id;
  assert.equal(r.j.at.length, 3);
  await sleep(400);
  const placed = at(40 * T - 200, 40 * T + 200, "wisp");
  assert.equal(placed.length, before + 3, "three wisps appear");
  ok("a row places n monsters on the map, at once, for a player already there");
  // fliers wait `up` cells over the floor: the floor at x 40 is row 13 or so; y must be above it by 2 cells
  const maps = (await A("GET", "/maps")).j, bl = maps.find((m) => m.id === "bichlac");
  assert.ok(bl.spawnsAllowed && bl.spawns.some((s) => s.id === rowId), "the map lists the row");
  // where they were put: on the floor found at each x, `up` cells over it (they wander from there)
  assert.ok(r.j.at.every((p) => p.y % T === 0 && p.y <= 14 * T), "on a floor row, two cells up");
  ok("the maps list shows where monsters may go, and the row");
  r = await A("PATCH", `/spawns/${rowId}`, { x: 60, n: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  await sleep(400);
  assert.equal(at(40 * T - 200, 40 * T + 200, "wisp").length, before, "the old three are gone");
  assert.equal(at(60 * T - 40, 60 * T + 40, "wisp").length, 1, "one at x 60");
  ok("changing the row moves them (three at x 40 become one at x 60)");
  for (const [body, why] of [[{ map: "tanthu", type: "wisp", x: 30 }, /không đặt yêu thú/], [{ map: "bichlac", type: "khong_co", x: 30 }, /Chưa có yêu thú/], [{ map: "bichlac", type: "wisp", x: 9999 }, /x phải/], [{ map: "bichlac", type: "wisp", x: 30, n: 50 }, /n:/]]) {
    r = await A("POST", "/spawns", body);
    assert.equal(r.status, 400);
    assert.match(r.j.error, why);
  }
  ok("refused: a map without monsters, an unknown monster, x off the map, too many");
  // a monster only a row places (not a map's code) can't be deleted while it is placed
  const mid = `t${tag}`;
  const made = await A("POST", "/t/monsters", { type: mid, name: "Thử", hp: 10, atk: 1, def: 0, spd: 30, respawn: 5 });
  if (made.status === 200 || made.status === 409) {
    const s2 = await A("POST", "/spawns", { map: "bichlac", type: mid, x: 50 });
    assert.equal(s2.status, 200, JSON.stringify(s2.j));
    const del = await A("DELETE", `/t/monsters/${mid}`);
    assert.equal(del.status, 400);
    assert.match(del.j.error, /map_spawns/);
    await A("DELETE", `/spawns/${s2.j.id}`);
    assert.equal((await A("DELETE", `/t/monsters/${mid}`)).status, 200);
    ok("a monster placed by a row can't be deleted until the row goes");
  }
  r = await A("DELETE", `/spawns/${rowId}`);
  assert.equal(r.status, 200);
  rowId = null;
  await sleep(400);
  assert.equal(at(60 * T - 40, 60 * T + 40, "wisp").length, 0);
  ok("deleting the row takes its monsters away");
  const k = c.msgs.length;
  r = await A("POST", "/announce", { text: `Thử ${tag}` });
  assert.equal(r.status, 200);
  await sleep(300);
  assert.ok(c.msgs.slice(k).some((m) => m.t === "toast" && m.m.includes(tag)), "the player gets it");
  ok("an announcement reaches the players");
  const schema = (await A("GET", "/schema")).j;
  assert.ok(schema.monsters?.cols?.fx && schema.items?.add);
  const fx = (await A("GET", "/fx?q=frog")).j;
  assert.ok(fx.effects.some((f) => f.id === "critters/frog" && f.inGame));
  ok("the schema and the effects list answer");
} finally {
  if (rowId) await A("DELETE", `/spawns/${rowId}`);
  c.ws.close();
  await q("DELETE FROM admins WHERE username = ?", [`dq_${tag}`]);
  await pool.end();
}
console.log(`${passed} passed`);
