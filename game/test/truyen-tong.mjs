// Truyền Tống Trận against a running server: node test/truyen-tong.mjs [http://localhost:5886]
// Away from an array nothing is sent; standing on one, nobody is moved by walking onto it; a map it doesn't list (the
// Gia Viên, the battlefield, nonsense) or the map one is on is refused; a listed map is reached, landing on its array,
// and remembered; asking five times at once moves them once.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const { mapInfo, MAPS } = await import("../shared/maps/index.js");
const { teleAt, TELE_MAPS } = await import("../shared/truyen-tong.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => (passed++, console.log("  ✓", name));

const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tt_${tag}`])).insertId;
await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 30000, 0, 'bichlac', 'c')", [id, `Tt${tag}`]);
const token = await createSession(id);
const c = await new Promise((resolve, reject) => {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
  const c = { ws, msgs: [], id: 0, pos: {}, map: null };
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "s") {
      for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2] };
      return;
    }
    c.msgs.push(m);
    if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
  });
  ws.on("error", reject);
  setTimeout(() => reject(new Error("no welcome")), 6000);
});
const tx = (m) => c.ws.send(JSON.stringify(m));
const me = () => c.pos[c.id];
const until = async (fn, ms = 6000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
};
const since = (k) => c.msgs.slice(k);
try {
  assert.deepEqual(TELE_MAPS.filter((m) => !MAPS[m].added), ["tanthu", "bichlac", "linhthuy", "uminh", "mavuc"], "the starter town and the maps with monsters (and any added since)");
  await until(() => me());
  const B = mapInfo("bichlac");
  // ---- away from the array
  assert.ok(!teleAt(B, me().x, me().y), "the spawn is not by the array");
  let k = c.msgs.length;
  tx({ t: "tele", to: "linhthuy" });
  await sleep(700);
  assert.ok(since(k).some((m) => m.t === "toast" && /đứng cạnh/.test(m.m)), "told to stand by the array");
  assert.ok(!since(k).some((m) => m.t === "warp"), "and not sent");
  ok("away from an array, nothing is sent");
  // ---- walk onto it: nothing happens by itself
  for (let i = 0; i < 120 && !teleAt(B, me().x, me().y); i++) {
    tx({ t: "in", dx: -1, jump: false, down: false });
    await sleep(50);
  }
  tx({ t: "in", dx: 0, jump: false, down: false });
  assert.ok(teleAt(B, me().x, me().y), "standing by the array");
  // walk right over it and back, then wait: a gate would have taken them
  for (let i = 0; i < 12; i++) (tx({ t: "in", dx: -1, jump: false, down: false }), await sleep(50));
  for (let i = 0; i < 8; i++) (tx({ t: "in", dx: 1, jump: false, down: false }), await sleep(50));
  tx({ t: "in", dx: 0, jump: false, down: false });
  k = c.msgs.length;
  await sleep(3000);
  assert.ok(!since(k).some((m) => m.t === "warp" || m.t === "portal"), "no warp by walking onto it");
  assert.equal((await q("SELECT map_id FROM characters WHERE user_id = ?", [id]))[0].map_id, "bichlac");
  ok("walking onto an array (and over it) moves nobody");
  // ---- what it won't do
  for (const [to, why] of [["giavien", /không đến được/], ["chientruong", /không đến được/], ["nowhere", /không đến được/], ["bichlac", /ở đây rồi/]]) {
    k = c.msgs.length;
    tx({ t: "tele", to });
    await sleep(400);
    assert.ok(since(k).some((m) => m.t === "toast" && why.test(m.m)), `${to}: refused`);
    assert.ok(!since(k).some((m) => m.t === "warp"), `${to}: not sent`);
  }
  ok("not to the Gia Viên, the battlefield, a map that isn't, or where one already is");
  // ---- sent: five asks at once, one move, onto the array there, remembered
  k = c.msgs.length;
  for (let i = 0; i < 5; i++) tx({ t: "tele", to: i % 2 ? "uminh" : "linhthuy" });
  assert.ok(await until(() => since(k).some((m) => m.t === "welcome" && m.map !== "bichlac"), 8000), "arrived");
  await sleep(1500);
  const warps = since(k).filter((m) => m.t === "warp"), landed = since(k).filter((m) => m.t === "welcome");
  assert.equal(warps.length, 1, "one warp for five asks");
  assert.equal(landed.length, 1, "one arrival");
  assert.equal(landed[0].map, "linhthuy", "the first ask wins");
  const L = mapInfo("linhthuy");
  await until(() => me() && teleAt(L, me().x, me().y));
  assert.ok(teleAt(L, me().x, me().y), "landed on the array there");
  assert.equal((await q("SELECT map_id FROM characters WHERE user_id = ?", [id]))[0].map_id, "linhthuy", "and the map is remembered");
  ok("sent where asked, once however many asks, onto the array there; remembered");
  // ---- and back to town from there
  k = c.msgs.length;
  tx({ t: "tele", to: "tanthu" });
  assert.ok(await until(() => since(k).some((m) => m.t === "welcome" && m.map === "tanthu"), 8000), "back in the starter town");
  ok("from a hunting map back to Tân Thủ Thôn");
} finally {
  c.ws.close();
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
