// Khu of the road's maps against a running server: node test/khu.mjs [http://localhost:5886]
// Every map of the road is 30 Khu of at most 20 people. Logging in fills Khu 1, the 21st goes to Khu 2; each one hears
// which Khu it is in and how full they all are; moving to a full Khu is refused, to one with room works (at the same
// spot) and is remembered for the next login; when one place frees up and five ask for it at once, one gets it; a Truyền
// Tống Trận into a map whose Khu 1 is full lands in a Khu with room; Khu Vực chat stays in its Khu.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const { ZONE_CAP } = await import("../shared/khu.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, n = 0;
const ok = (name) => (passed++, console.log("  ✓", name));
const all = [];
// the test uses a map nobody else is on (well away from the starter town)
const MAP = "mavuc";

async function bot(map = MAP, x = null) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`kz_${tag}_${i}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 30000, 0, ?, 'c')", [id, `Kz${tag.slice(0, 4)}${i}`, map]);
  const token = await createSession(id);
  const c = await new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], id: 0, uid: id, zone: 0, occ: [], pos: {}, map: null };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") {
        for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2] };
        return;
      }
      c.msgs.push(m);
      if (m.t === "zones") (m.n && (c.zone = m.n)), (c.occ = m.occ);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 8000);
  });
  c.token = token;
  all.push(c);
  await until(() => c.zone);
  return c;
}
const until = async (fn, ms = 6000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
};
const tx = (c, m) => c.ws.send(JSON.stringify(m));
const mapOf = async (c) => (await q("SELECT map_id FROM characters WHERE user_id = ?", [c.uid]))[0].map_id;

try {
  // ---- logging in: 20 fill Khu 1, the 21st goes to Khu 2
  const first = [];
  for (let i = 0; i < ZONE_CAP; i++) first.push(await bot());
  assert.ok(first.every((c) => c.zone === 1), "the first 20 in Khu 1");
  const extra = await bot();
  assert.equal(extra.zone, 2, "the 21st in Khu 2");
  await until(() => first[0].occ[0] === ZONE_CAP && first[0].occ[1] === 1, 3000);
  assert.equal(first[0].occ[0], ZONE_CAP, "everyone hears Khu 1 is full");
  assert.equal(first[0].occ[1], 1, "and Khu 2 has one");
  ok("logging in: 20 fill Khu 1, the 21st is put in Khu 2; everyone hears how full each Khu is");

  // ---- moving: a full Khu is refused, one with room works at the same spot, remembered
  let k = extra.msgs.length;
  tx(extra, { t: "zone", n: 1 });
  await sleep(600);
  assert.ok(extra.msgs.slice(k).some((m) => m.t === "toast" && m.zfull && /đã đủ/.test(m.m)), "Khu 1 full: refused, the box offered again");
  assert.equal(extra.zone, 2);
  const at = { ...extra.pos[extra.id] };
  tx(extra, { t: "zone", n: 7 });
  assert.ok(await until(() => extra.zone === 7, 5000), "moved to Khu 7");
  await sleep(300);
  assert.ok(Math.abs(extra.pos[extra.id].x - at.x) < 40, "at the same spot");
  assert.equal(await mapOf(extra), `${MAP}:7`, "the Khu is remembered");
  for (const bad of [0, 31, "x", 2.5]) {
    k = extra.msgs.length;
    tx(extra, { t: "zone", n: bad });
    await sleep(200);
    assert.ok(extra.msgs.slice(k).some((m) => m.t === "toast"), `Khu ${bad}: refused`);
  }
  assert.equal(extra.zone, 7, "still in Khu 7");
  ok("moving: a full Khu refused, a Khu that isn't refused, one with room taken at the same spot and remembered");

  // ---- logging in again: back in the Khu they were in
  extra.ws.close();
  await sleep(800);
  const again = await new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, zone: 0 };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: extra.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "zones" && m.n) (c.zone = m.n), resolve(c);
    });
  });
  all.push(again);
  assert.equal(again.zone, 7, "back in Khu 7");
  ok("logging in again: back in the Khu they were in");

  // ---- one place frees up in Khu 1, five ask for it at once: one gets it
  const five = [];
  for (let i = 0; i < 5; i++) five.push(await bot(`${MAP}:3`));
  assert.ok(five.every((c) => c.zone === 3), "five in Khu 3");
  first[0].ws.close();
  await until(() => five[0].occ[0] === ZONE_CAP - 1, 4000);
  for (const c of five) tx(c, { t: "zone", n: 1 });
  await sleep(2500);
  assert.equal(five.filter((c) => c.zone === 1).length, 1, "one of the five got the place");
  assert.equal(five.filter((c) => c.zone === 3).length, 4, "the other four stayed");
  await until(() => five[0].occ[0] === ZONE_CAP, 3000);
  assert.equal(five[0].occ[0], ZONE_CAP, "Khu 1 never past 20");
  ok("one place free and five asking at once: one moves in, Khu 1 never holds more than 20");

  // ---- a Truyền Tống Trận into the map while Khu 1 is full: a Khu with room
  const { mapInfo } = await import("../shared/maps/index.js");
  const { teleAt } = await import("../shared/truyen-tong.js");
  const walker = await bot("uminh");
  const U = mapInfo("uminh");
  for (let i = 0; i < 120 && !teleAt(U, walker.pos[walker.id].x, walker.pos[walker.id].y); i++) (tx(walker, { t: "in", dx: -1, jump: false, down: false }), await sleep(50));
  tx(walker, { t: "in", dx: 0, jump: false, down: false });
  tx(walker, { t: "tele", to: MAP });
  assert.ok(await until(() => walker.map === MAP, 6000), "arrived on the map");
  await until(() => walker.zone !== 0 && walker.msgs.filter((m) => m.t === "zones").length >= 2, 3000);
  assert.notEqual(walker.zone, 1, "not in the full Khu 1");
  ok(`through a Truyền Tống Trận while Khu 1 is full: into Khu ${walker.zone}, which has room`);

  // ---- Khu Vực chat stays in its Khu
  const a = five.find((c) => c.zone === 3), b = first[1], line = `xin chào ${tag}`;
  tx(a, { t: "chat", ch: "k", m: line });
  await sleep(800);
  assert.ok(a.msgs.some((m) => m.t === "chat" && m.m === line), "heard in Khu 3");
  assert.ok(!b.msgs.some((m) => m.t === "chat" && m.m === line), "not in Khu 1");
  ok("Khu Vực chat stays in its Khu");
} finally {
  for (const c of all) c.ws.close();
  await sleep(300);
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
