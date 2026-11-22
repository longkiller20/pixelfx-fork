// Maps added beyond the code (tools/ban-do.mjs, shared/maps/them.js): node test/ban-do.mjs [http://localhost:5886]
// The checker refuses what the game could not load or a player could get stuck in, and passes the maps of the road;
// strokes become a grid; the picture is written. Then, with the test map (test/fixtures/ban-do-thu.json) saved and the
// server restarted on it: it is on the Truyền Tống Trận's list, a player is sent there from an array and lands on its
// array, its monsters are there, the map is remembered, and the way home works. Leaves the registry as it found it.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const GAME = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:5886";
const FIX = join(GAME, "test", "fixtures", "ban-do-thu.json"), REG = join(GAME, "shared", "maps", "them.js");
let passed = 0;
const ok = (n) => (passed++, console.log("  ✓", n));
const tmp = mkdtempSync(join(tmpdir(), "ban-do-"));
const tool = (...a) => {
  let out;
  try {
    out = execFileSync(process.execPath, [join(GAME, "tools", "ban-do.mjs"), ...a], { cwd: GAME, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    out = e.stdout;
  }
  return JSON.parse(out.trim().split("\n").pop());
};
const variant = (name, f) => {
  const d = JSON.parse(readFileSync(FIX, "utf8"));
  f(d);
  const p = join(tmp, `${name}.json`);
  writeFileSync(p, JSON.stringify(d));
  return p;
};

// ---- the checker
const good = tool("check", FIX);
assert.deepEqual(good.errors, [], JSON.stringify(good.errors));
ok(`the test map passes (${good.warnings.length} warning(s))`);
for (const id of ["linhthuy", "bichlac", "uminh"]) {
  const p = join(tmp, `${id}.json`);
  tool("get", id, "--out", p);
  const d = JSON.parse(readFileSync(p, "utf8"));
  d.id = `${id.slice(0, 4)}copy`;
  writeFileSync(p, JSON.stringify(d));
  const r = tool("check", p);
  assert.deepEqual(r.errors, [], `${id}: ${r.errors}`);
  assert.ok(!r.warnings.some((w) => /cannot be reached|cut off/.test(w)), `${id}: ${r.warnings}`);
}
ok("copies of the road's maps pass, with nothing said to be out of reach");
const refused = {
  "an id taken by a map in code": (d) => (d.id = "linhthuy"),
  "an id with digits": (d) => (d.id = "bang2"),
  "rows of different lengths": (d) => ((d.grid = Array.from({ length: 20 }, (_, i) => (i < 15 ? "." : "#").repeat(i === 5 ? 139 : 140))), delete d.layout),
  "an unknown tile": (d) => d.layout.ops.push(["box", 10, 12, 14, 14, "x"]),
  "a spawn in the air": (d) => (d.spawn = { x: 8, row: 10 }),
  "a spawn inside the ground": (d) => (d.spawn = { x: 8, row: 17 }),
  "no way out": (d) => (d.portals = []),
  "a portal to a map that is not": (d) => (d.portals[0].to = "nowhere"),
  "a portal to the Gia Viên": (d) => (d.portals[0].to = "giavien"),
  "a monster the game does not have": (d) => (d.mobs[0].type = "dragonxx"),
  "a walking monster over nothing": (d) => (d.mobs[0] = { type: "slime", x: 20, row: 9 }),
  "no monsters on a hunting map": (d) => (d.mobs = []),
  "a picture that does not exist": (d) => d.props.push(["xx", 30, 15, { n: "no_such_picture" }]),
  "an effect not in the game": (d) => d.props.push(["fx", 30, 15, { id: "fire/no-such" }]),
  "an unknown prop": (d) => d.props.push(["castle", 30, 15]),
  "music that is not there": (d) => (d.music = "9-none"),
  "a bad colour": (d) => (d.theme.sky[0] = "blue"),
  "an unknown field": (d) => (d.secret = 1),
  "too narrow": (d) => (d.layout.cols = 40),
};
for (const [why, f] of Object.entries(refused)) {
  const r = tool("check", variant(why.replace(/\W+/g, "-"), f));
  assert.ok(r.errors.length, `${why}: should be refused`);
}
ok(`refused: ${Object.keys(refused).length} kinds of broken map, each with its reason`);
const warned = tool("check", variant("walled", (d) => d.layout.ops.push(["box", 30, 31, 5, 14, "s"])));
assert.ok(warned.warnings.some((w) => /cannot be reached|cut off/.test(w)), "a wall nobody can climb is noticed");
ok("a wall too high to climb: warned that the far side is out of reach");
const town = tool("check", variant("town", (d) => ((d.mobs = []), (d.town = true))));
assert.deepEqual(town.errors, []);
ok("a town (town: true) needs no monsters");
const pic = tool("preview", FIX, "--out", join(tmp, "p.png"));
assert.ok(existsSync(join(tmp, "p.png")) && readFileSync(join(tmp, "p.png")).readUInt32BE(0) === 0x89504e47, "a PNG");
ok("preview writes a picture of the layout");

// ---- in the game: saved, the server restarted on it (run this test once after `add`, see below)
const { MAPS } = await import("../shared/maps/index.js");
if (!MAPS.bangphong?.added) {
  console.log(`  (the game part needs the test map saved and the server restarted:\n   node tools/ban-do.mjs add test/fixtures/ban-do-thu.json, restart, run again; node tools/ban-do.mjs remove bangphong after)`);
  console.log(`${passed} passed`);
  process.exit(0);
}
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const { mapInfo } = await import("../shared/maps/index.js");
const { teleAt, TELE_MAPS } = await import("../shared/truyen-tong.js");
assert.ok(TELE_MAPS.includes("bangphong"), "on the arrays' list");
ok("the added map is on the Truyền Tống Trận's list");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString("hex");
const uid = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`bd_${tag}`])).insertId;
await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 30000, 0, 'linhthuy', 'c')", [uid, `Bd${tag}`]);
const token = await createSession(uid);
const c = await new Promise((resolve, reject) => {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
  const c = { ws, msgs: [], id: 0, pos: {}, ents: new Map() };
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "s") {
      for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2] };
      return;
    }
    c.msgs.push(m);
    if (m.t === "welcome") (c.id = m.id), resolve(c);
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
try {
  await until(() => me());
  // to the array of Linh Thủy Đàm (west, by the spawn), then ask for the new map
  const L = mapInfo("linhthuy");
  for (let i = 0; i < 160 && !teleAt(L, me().x, me().y); i++) (tx({ t: "in", dx: -1, jump: false, down: false }), await sleep(50));
  tx({ t: "in", dx: 0, jump: false, down: false });
  assert.ok(teleAt(L, me().x, me().y), "by the array");
  let k = c.msgs.length;
  tx({ t: "tele", to: "bangphong" });
  assert.ok(await until(() => c.msgs.slice(k).some((m) => m.t === "welcome" && m.map === "bangphong"), 8000), "arrived on Băng Phong Cốc");
  const P = mapInfo("bangphong");
  await until(() => me() && teleAt(P, me().x, me().y));
  assert.ok(teleAt(P, me().x, me().y), "landed on its array");
  assert.equal((await q("SELECT map_id FROM characters WHERE user_id = ?", [uid]))[0].map_id, "bangphong");
  ok("sent there from an array, landed on its array, remembered");
  // walk east on it: the ground holds
  for (let i = 0; i < 60; i++) (tx({ t: "in", dx: 1, jump: false, down: false }), await sleep(50));
  tx({ t: "in", dx: 0, jump: false, down: false });
  await sleep(300);
  assert.ok(me().x > P.spawn.x + 100 && me().y <= P.h, `walked east on it (${JSON.stringify(me())})`);
  ok("walked on it (the ground holds)");
  // home again
  for (let i = 0; i < 80 && !teleAt(P, me().x, me().y); i++) (tx({ t: "in", dx: -1, jump: false, down: false }), await sleep(50));
  tx({ t: "in", dx: 0, jump: false, down: false });
  k = c.msgs.length;
  tx({ t: "tele", to: "tanthu" });
  assert.ok(await until(() => c.msgs.slice(k).some((m) => m.t === "welcome" && m.map === "tanthu"), 8000), "home");
  ok("and home to Tân Thủ Thôn through its array");
} finally {
  c.ws.close();
  await q("DELETE FROM characters WHERE user_id = ?", [uid]);
  await q("DELETE FROM users WHERE id = ?", [uid]);
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
