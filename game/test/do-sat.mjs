// Đồ Sát against a running server (game and admin site): node test/do-sat.mjs [http://localhost:5886]
// Two players without Đồ Sát never hurt each other; under pk.level it can't be switched on; on, one hits anyone, and
// anyone (without it) hits them back; bringing down someone without it gives sát khí (written), switching off waits
// pk.off_delay after the last fight; someone on Đồ Sát brought down pays the bounty on their sát khí to the killer;
// Tân Thủ Thôn is safe whatever is on; one's own Đạo Lữ is never hit. The admin's numbers are put back after.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, n = 0;
const ok = (name) => (passed++, console.log("  ✓", name));
async function person(map, exp = 60000, stones = 1000) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`pk_${tag}_${i}`])).insertId;
  const name = `Sát${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', 8, 16, ?, ?, ?, 'c')", [id, name, exp, stones, map]);
  return { id, name, token: await createSession(id) };
}
function connect(P) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], me: null, id: 0, P, pos: {} };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: P.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") {
        for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2], hp: a[4], dead: !!(a[5] & 1) };
        return;
      }
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
      if (m.t === "me") c.me = m;
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 6000);
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
/** Walk a toward b until within reach. */
async function near(a, b) {
  await until(() => me(a) && a.pos[b.id]);
  for (let i = 0; i < 200; i++) {
    const d = a.pos[b.id].x - me(a).x;
    if (Math.abs(d) < 30) break;
    tx(a, { t: "in", dx: Math.sign(d), jump: false, down: false });
    await sleep(50);
  }
  tx(a, { t: "in", dx: 0, jump: false, down: false });
  await sleep(300);
}
/** a swings at b for ms. */
async function swing(a, b, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    tx(a, { t: "cast", s: 0, ax: Math.sign(a.pos[b.id].x - me(a).x) || 1, ay: 0 });
    await sleep(200);
  }
}
const stones = async (P) => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [P.id]))[0].stones);

console.log("Đồ Sát against", BASE);
const aname = "t_apk_" + tag, apw = "tamthoi123";
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [aname, await hashPassword(apw)]);
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: aname, password: apw }) })).json()).token;
const adm = async (path, body, method = "POST") => (await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + atok }, body: body && JSON.stringify(body) })).status;
const RUN = { "pk.off_delay": 3, "class.hp": 150, "pk.bounty": 50, "pk.level": 6, "respawn.world": 1 };
const old = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k IN (?)", [Object.keys(RUN)])).map((r) => [r.k, r.v]));
const socks = [];
try {
  for (const [k, v] of Object.entries(RUN)) assert.equal(await adm(`/t/settings/${k}`, { v }, "PATCH"), 200, k);
  const A = await connect(await person("bichlac")), B = await connect(await person("bichlac")), C = await connect(await person("bichlac", 60000, 0)), L = await connect(await person("bichlac", 0));
  socks.push(A, B, C, L);
  await sleep(800);

  // ---- nobody on Đồ Sát: no harm
  await near(A, B);
  const hp0 = B.pos[B.id].hp;
  await swing(A, B, 1500);
  assert.equal(B.pos[B.id].hp, hp0, "two without Đồ Sát don't hurt each other");
  // ---- under the level: can't switch it on
  tx(L, { t: "pk", on: true });
  assert.ok(await until(() => L.msgs.some((m) => m.t === "toast" && /mới bật được Đồ Sát/.test(m.m))), "under pk.level: refused");
  assert.equal(L.me.pk.on, false);
  ok("Without Đồ Sát nobody hurts anybody; under pk.level it can't be switched on");

  // ---- A on: A hits B; C (off) hits A back
  tx(A, { t: "pk", on: true });
  assert.ok(await until(() => B.msgs.some((m) => m.t === "pi" && m.id === A.id && m.pk === 1)), "everyone sees A on Đồ Sát");
  await swing(A, B, 600);
  assert.ok(await until(() => B.pos[B.id].hp < hp0 || B.pos[B.id].dead), "A on Đồ Sát hurts B");
  await near(C, A);
  const ha = A.pos[A.id].hp;
  await swing(C, A, 600);
  assert.ok(await until(() => A.pos[A.id].hp < ha || A.pos[A.id].dead), "C, not on it, hurts A who is");
  ok("On Đồ Sát one hits anyone; anyone (not on it) hits them back");

  // ---- A brings B down: sát khí; switching off waits
  await near(A, B);
  // swing until B falls once (no more: risen beside A, B would fall again)
  // (stopping the moment B is down: "me" comes a few ticks later, and B rises beside A)
  for (let i = 0; i < 40 && !(A.me?.pk?.sk >= 1) && !B.pos[B.id]?.dead; i++) await swing(A, B, 200);
  // (B may fall twice before the swinging stops: rising beside A; each fall a point)
  assert.ok(await until(() => A.me?.pk?.sk >= 1, 8000), "a point of sát khí: " + JSON.stringify(A.me?.pk));
  await sleep(600);
  const sk = A.me.pk.sk;
  assert.ok(sk >= 1 && sk <= 2, "one point a fall");
  assert.equal(Number((await q("SELECT sat_khi FROM characters WHERE user_id = ?", [A.P.id]))[0].sat_khi), sk, "written");
  assert.ok(A.msgs.some((m) => m.t === "feed" && /Sát khí/.test(m.m)), "the server hears of it");
  tx(A, { t: "pk", on: false });
  assert.ok(await until(() => A.msgs.some((m) => m.t === "toast" && /chưa tan/.test(m.m))), "switching off waits after a fight");
  ok("Bringing down someone without Đồ Sát: a point of sát khí (written, announced); switching off waits after fighting");

  // ---- C brings A down: the bounty
  // (whoever fell above waits on the death box now: an admin gets them up where they are, free, before the next fight)
  for (const c of [A, B]) if (c.me?.rv || me(c)?.dead) await adm(`/players/${c.P.id}/live`, { action: "revive" });
  assert.ok(await until(() => !me(A)?.dead && !me(B)?.dead), "A and B up again");
  const a0 = await stones(A.P), c0 = await stones(C.P);
  await near(C, A);
  await swing(C, A, 5000);
  await sleep(6000); // saved (every 5 s)
  assert.equal(await stones(A.P), a0 - 50 * sk, `A paid the bounty (50 × sát khí ${sk})`);
  assert.equal(await stones(C.P), c0 + 50 * sk, "to C");
  ok("Brought down while on Đồ Sát: the bounty on the sát khí goes to the killer");

  // ---- off after the wait
  await sleep(3500);
  tx(A, { t: "pk", on: false });
  assert.ok(await until(() => A.me?.pk?.on === false), "off after pk.off_delay without fighting");
  ok("Switched off after pk.off_delay without fighting");

  // ---- Tân Thủ Thôn: safe; Đồ Sát can't be switched on there, and goes off on the way in
  const T1 = await connect(await person("tanthu")), T2 = await connect(await person("tanthu"));
  socks.push(T1, T2);
  await sleep(800);
  let k = T1.msgs.length;
  tx(T1, { t: "pk", on: true });
  await until(() => T1.msgs.slice(k).some((m) => m.t === "toast"));
  assert.ok(T1.msgs.slice(k).some((m) => m.t === "toast" && /vùng an toàn/.test(m.m) && /bù nhìn rơm/.test(m.m)), "refused: a safe place, only the straw dummies");
  assert.equal(T1.me.pk.on, false, "still off");
  assert.equal(T1.me.pk.here, false, "it says this place is safe");
  await near(T1, T2);
  const ht = T2.pos[T2.id].hp;
  await swing(T1, T2, 1500);
  assert.equal(T2.pos[T2.id].hp, ht, "no harm in Tân Thủ Thôn");
  // on Đồ Sát elsewhere, through a Truyền Tống Trận into Tân Thủ Thôn: off on arrival
  const W = await connect(await person("bichlac"));
  socks.push(W);
  tx(W, { t: "pk", on: true });
  await until(() => W.me?.pk?.on);
  const { mapInfo } = await import("../shared/maps/index.js"), { teleAt } = await import("../shared/truyen-tong.js"), BL = mapInfo("bichlac");
  for (let i = 0; i < 120 && !teleAt(BL, W.pos[W.id].x, W.pos[W.id].y); i++) (tx(W, { t: "in", dx: -1, jump: false, down: false }), await sleep(50));
  tx(W, { t: "in", dx: 0, jump: false, down: false });
  k = W.msgs.length;
  tx(W, { t: "tele", to: "tanthu" });
  assert.ok(await until(() => W.msgs.slice(k).some((m) => m.t === "welcome" && m.map === "tanthu"), 6000), "arrived in Tân Thủ Thôn");
  await until(() => W.me?.pk?.on === false);
  assert.equal(W.me.pk.on, false, "Đồ Sát off on the way in");
  assert.ok(W.msgs.slice(k).some((m) => m.t === "toast" && /Đồ Sát đã tắt/.test(m.m)), "and told so");
  ok("Tân Thủ Thôn is safe: Đồ Sát can't be switched on there (only the straw dummies to try arts on), it goes off on the way in, and nobody is hurt");

  // ---- one's own Đạo Lữ: never
  const D1 = await connect(await person("bichlac")), D2 = await connect(await person("bichlac"));
  socks.push(D1, D2);
  const mid = (await q("INSERT INTO dl_marriages (a_id, b_id, ring, price, paid_by) VALUES (?, ?, 'dl_nhan_dong_tam', 0, ?)", [D1.P.id, D2.P.id, D1.P.id]))?.insertId;
  if (mid) {
    await q("INSERT INTO dl_spouses (user_id, partner_id, marriage_id, ring) VALUES (?, ?, ?, 'dl_nhan_dong_tam'), (?, ?, ?, 'dl_nhan_dong_tam')", [D1.P.id, D2.P.id, mid, D2.P.id, D1.P.id, mid]);
    D1.ws.close();
    await sleep(500);
    const D1b = await connect(D1.P);
    socks.push(D1b);
    await sleep(800);
    tx(D1b, { t: "pk", on: true });
    await until(() => D1b.me?.pk?.on);
    await near(D1b, D2);
    const hd = D2.pos[D2.id].hp;
    await swing(D1b, D2, 1500);
    assert.equal(D2.pos[D2.id].hp, hd, "never one's own Đạo Lữ");
    ok("One's own Đạo Lữ is never hit");
  } else console.log("  (Đạo Lữ check skipped: dl_marriages columns differ)");
} finally {
  for (const c of socks) c.ws.close();
  for (const [k, v] of Object.entries(old)) await adm(`/t/settings/${k}`, { v }, "PATCH");
  await q("DELETE FROM admins WHERE username = ?", [aname]);
}
console.log(`${passed} passed`);
await pool.end();
process.exit(0);
