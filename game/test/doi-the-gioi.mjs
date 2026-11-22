// Moving between worlds keeps every moment a player carries (server/world.js rebase), against a running server:
//   node test/doi-the-gioi.mjs [http://localhost:5886]
// Each world counts its own time from when it was made (a Khu, a Gia Viên, a lake's Khu made a moment ago starts at 0).
// Moving from a world that has been up a while into a new one used to carry its moments over as they were: one who had
// just swung arrived "busy" (and rooted, after an art that plants) for as long as the old world had been up, and an
// angler who changed Khu could not cast again for as long. Here: a swing on Bích Lạc Lâm, then to a new Khu and into
// the Gia Viên: free to move and swing again at once; at the lake, a cast, then another Khu: casting again at once.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const cc = await import("../shared/cau-ca.js");
const { PIER } = await import("../shared/maps/cauca.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (n) => (passed++, console.log("  ✓", n));
const BUSY = 64, ROOT = 512;

const users = [];
async function person(map, extra = "") {
  const i = users.length;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`dt_${tag}_${i}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 30000, 5000000, ?, 'c')", [id, `Dt${tag.slice(0, 4)}${i}`, map]);
  if (extra) await q(extra.replaceAll("?", id));
  users.push(id);
  return { id, token: await createSession(id) };
}
function connect(P) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], id: 0, snap: null, P, ev: [] };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: P.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") (c.snap = m), c.ev.push(...(m.E ?? []));
      else c.msgs.push(m);
      // a new world: forget where the last one had them
      if (m.t === "welcome") (c.id = m.id), (c.snap = null), resolve(c);
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 6000);
  });
}
const tx = (c, m) => c.ws.send(JSON.stringify(m));
const me = (c) => c.snap?.P.find((p) => p[0] === c.id);
const until = async (fn, ms = 6000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
const api = (P, path, body) => fetch(BASE + "/api" + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + P.token }, body: JSON.stringify(body ?? {}) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const welcomed = (c, map, k) => until(() => c.msgs.slice(k).some((m) => m.t === "welcome" && (!map || m.map === map)), 10000);
// free to act: not busy or rooted, a swing shows, and a step to the right moves them
async function free(c, what) {
  assert.ok(await until(() => me(c) && !(me(c)[5] & (BUSY | ROOT)), 1500), `${what}: not busy or rooted (flags ${me(c)?.[5]})`);
  const x0 = me(c)[1];
  for (let i = 0; i < 10; i++) (tx(c, { t: "in", dx: 1, jump: false, down: false }), await sleep(60));
  tx(c, { t: "in", dx: 0, jump: false, down: false });
  assert.ok(await until(() => me(c)[1] > x0 + 40, 1500), `${what}: walks (${x0} → ${me(c)[1]})`);
}
// a swing of the basic attack: it shows (its cooldown, on the world's clock, lets it)
const swing = async (c, what) => {
  c.ev.length = 0;
  tx(c, { t: "cast", s: 0, ax: 1, ay: 0 });
  assert.ok(await until(() => c.ev.some((e) => e.e === "cast" && e.id === c.id), 1500), `${what}: the swing shows`);
};

const socks = [];
try {
  const up = Number((await (await fetch(BASE + "/health")).json()).online ?? 0) >= 0;
  assert.ok(up, "the server answers");
  // ---- a Khu of the road: Bích Lạc Lâm's Khu 1 has been up since the server started; Khu 2.. are made when someone goes in
  const A = await person("bichlac");
  const a = await connect(A);
  socks.push(a);
  await until(() => me(a));
  await sleep(500);
  await swing(a, "on Khu 1");
  let k = a.msgs.length;
  const n = 2 + Math.floor(Math.random() * 25);
  tx(a, { t: "zone", n });
  assert.ok(await welcomed(a, "bichlac", k), "into another Khu");
  await free(a, `in Khu ${n}, just made`);
  await swing(a, `in Khu ${n}`);
  ok(`from Bích Lạc Lâm's Khu 1 (up since the server started) into Khu ${n}, just made: free to walk and swing at once`);

  // ---- into the Gia Viên (a world made for it), straight after a swing
  await api(A, "/home/unlock");
  await sleep(800);
  await swing(a, "before the Gia Viên");
  k = a.msgs.length;
  assert.equal((await api(A, "/home/enter")).status, 200);
  assert.ok(await welcomed(a, "giavien", k), "in the Gia Viên");
  await free(a, "in the Gia Viên");
  ok("into the Gia Viên straight after a swing: free to walk");

  // ---- the lake: a cast in one Khu, then another Khu, made just now: casting again at once
  const B = await person("tanthu", "INSERT INTO inventory (user_id, item, qty) VALUES (?, 'cc_can_truc', 1), (?, 'cc_moi_giun', 30)");
  const b = await connect(B);
  socks.push(b);
  await sleep(500);
  const occ0 = (await (await fetch(BASE + "/api/fishing", { headers: { authorization: "Bearer " + B.token } })).json()).occ ?? [];
  const empty = (skip) => occ0.findIndex((x, i) => !x && i + 1 !== skip) + 1;
  const K1 = empty(0) || 1;
  k = b.msgs.length;
  assert.equal((await api(B, "/fishing/enter", { khu: K1 })).status, 200);
  assert.ok(await welcomed(b, cc.FISH_MAP, k), "at the lake");
  await until(() => me(b));
  // stay a while: this Khu's clock runs on, the next one's starts at 0
  const spot = PIER.spots[0] * 32;
  for (let i = 0; i < 200 && Math.abs(me(b)[1] - spot) > 6; i++) (tx(b, { t: "in", dx: Math.sign(spot - me(b)[1]), jump: false, down: false }), await sleep(50));
  tx(b, { t: "in", dx: 0, jump: false, down: false });
  await sleep(12000);
  const cast = async () => {
    const k0 = b.msgs.length;
    tx(b, { t: "fish", a: "cast" });
    await until(() => b.msgs.slice(k0).some((m) => m.t === "fish"), 3000);
    return b.msgs.slice(k0).find((m) => m.t === "fish");
  };
  let f = await cast();
  assert.equal(f?.s, "cast", `a first cast: ${JSON.stringify(f)}`);
  tx(b, { t: "fish", a: "stop" });
  assert.ok(await until(() => b.msgs.some((m) => m.t === "fish" && m.s === "end")), "reeled in");
  const K2 = empty(K1) || (K1 % cc.KHU_COUNT) + 1;
  k = b.msgs.length;
  assert.equal((await api(B, "/fishing/enter", { khu: K2 })).status, 200);
  assert.ok(await until(() => b.msgs.slice(k).some((m) => m.t === "fkhu" && m.n === K2), 10000), `into Khu ${K2}`);
  await until(() => me(b));
  for (let i = 0; i < 200 && Math.abs(me(b)[1] - spot) > 6; i++) (tx(b, { t: "in", dx: Math.sign(spot - me(b)[1]), jump: false, down: false }), await sleep(50));
  tx(b, { t: "in", dx: 0, jump: false, down: false });
  await sleep(cc.FCAST?.cooldown ? cc.FCAST.cooldown * 1000 : 1500);
  f = await cast();
  assert.equal(f?.s, "cast", `casting again in Khu ${K2} (made just now): ${JSON.stringify(f)}`);
  tx(b, { t: "fish", a: "stop" });
  ok(`the lake: a cast in Khu ${K1} (up 12 s), then Khu ${K2} (just made): the line goes out again at once`);
} finally {
  for (const c of socks) c.ws.close();
  await sleep(500);
  for (const id of users) {
    for (const t of ["home_animals", "home_plots", "homes", "fishers", "inventory", "characters"]) await q(`DELETE FROM ${t} WHERE user_id = ?`, [id]).catch(() => {});
    await q("DELETE FROM users WHERE id = ?", [id]);
  }
  await pool.end();
}
console.log(`${passed} passed`);
process.exit(0);
