// Chính Tà Phân Tranh against a running server (game and admin site): node test/chinh-ta.mjs [http://localhost:5886]
// The side at creation (required) and later (the first pick free, then paid, not often, not while signed up); signing up
// (once however many times, only of the level, closed once the battle began); the teams (each side's best, the bigger cut
// to the smaller + max_gap, the rest dự bị, the offline left out); the field (everyone brought in at their camp, the camps
// closed while getting ready, a kill counted for the side, the killed rising at their camp); leaving (no reward, a dự bị
// called in), a dropped connection (the place kept, back on the field when they return); the end (the winner by hạ gục,
// points for everyone who stayed, more for the winners, the MVP's extra, written once however often it is ended), everyone
// back where they came from; a battle with too few is cancelled; the Tiệm Chính Tà (points spent once per request, never
// below zero, however many buys at once). The admin's numbers are changed for the run and put back after.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const { CAMPS } = await import("../shared/maps/chientruong.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => crypto.randomUUID();
let passed = 0, n = 0;
const ok = (name) => (passed++, console.log("  ✓", name));

async function call(path, { token, method = "GET", body } = {}) {
  for (;;) {
    const r = await fetch(BASE + "/api" + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) {
      await sleep(1500);
      continue;
    }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
}
const post = (P, path, body = {}) => call(`/chinhta${path}`, { token: P.token, method: "POST", body });
/** A character made in the database (side f, exp, stones), with a session. */
async function person(f, exp = 2000, stones = 0) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tc_${tag}_${i}`])).insertId;
  const name = `${f === "c" ? "Chính" : f === "t" ? "Tà" : "Vô"}${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones, faction) VALUES (?, ?, 'tu', 'm', 8, 16, ?, ?, ?)", [id, name, exp, stones, f]);
  return { id, name, f, token: await createSession(id) };
}
function connect(P) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], me: null, id: 0, map: null, pos: null, P };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: P.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t !== "s") c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), resolve(c);
      if (m.t === "me") c.me = m;
      if (m.t === "s") {
        c.snap = m;
        const me = m.P.find((x) => x[0] === c.id);
        if (me) c.pos = { x: me[1], y: me[2], dead: !!(me[5] & 1) };
      }
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
const got = (c, pred) => c.msgs.some(pred);
const pts = async (P) => Number((await q("SELECT ct_points FROM characters WHERE user_id = ?", [P.id]))[0].ct_points);
const T = 32;

console.log("Chính Tà against", BASE);
// ---- the admin, and the numbers for the run (put back at the end)
const aname = "t_act_" + tag, apw = "tamthoi123";
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [aname, await hashPassword(apw)]);
const adm = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${atok}` }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: aname, password: apw }) })).json()).token;
const RUN = { "chinhta.prep": 3, "chinhta.min_side": 1, "chinhta.max_gap": 1, "chinhta.level": 2, "chinhta.respawn": 1, "chinhta.protect": 0, "chinhta.minutes": 5,
  "chinhta.away": 2, "chinhta.change_cost": 1000, "chinhta.change_days": 7, "chinhta.min_stay": 50, "class.hp": 120 };
const old = {};
for (const r of await q("SELECT k, v FROM settings WHERE k IN (?)", [Object.keys(RUN)])) old[r.k] = r.v;
const setAll = async (o) => {
  for (const [k, v] of Object.entries(o)) {
    const r = await adm(`/t/settings/${k}`, { method: "PATCH", body: { v } });
    assert.equal(r.status, 200, `${k}: ${JSON.stringify(r.data)}`);
  }
};
const socks = [];
try {
  await setAll(RUN);
  // a battle left running by an earlier, broken run: cancelled first
  if ((await adm("/chinhta")).data.now) await adm("/chinhta/cancel", { method: "POST" });

  // ---------------------------------------------------------------- the side at creation, and changing it
  {
    const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tc_${tag}_new`])).insertId, token = await createSession(id);
    const look = (await call("/cosmetics", { token })).data.items.filter((c) => c.starter && c.g === "m");
    const lk = { g: "m", hair: look.find((c) => c.kind === "hair").idx, robe: look.find((c) => c.kind === "robe").idx };
    assert.equal((await call("/character", { token, method: "POST", body: { name: `Mới ${tag}`, look: lk } })).status, 400, "no side: refused");
    assert.equal((await call("/character", { token, method: "POST", body: { name: `Mới ${tag}`, look: lk, faction: "x" } })).status, 400, "a side that isn't one: refused");
    const r = await call("/character", { token, method: "POST", body: { name: `Mới ${tag}`, look: lk, faction: "t" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.character.faction, "t", "made in Tà Phái");
    // an old character (no side): can't sign up; the first pick is free and any time
    const O = await person(null, 2000, 1500);
    assert.match((await post(O, "/register")).data.error ?? "", /Chính Phái hoặc Tà Phái/);
    const first = await post(O, "/faction", { faction: "c", requestId: rid() });
    assert.ok(first.data.ok && first.data.view.faction === "c", JSON.stringify(first.data));
    assert.equal(Number((await q("SELECT stones FROM characters WHERE user_id = ?", [O.id]))[0].stones), 1500, "the first pick costs nothing");
    // a change: paid (the same request five times: once), then not again for change_days
    const id1 = rid();
    const five = await Promise.all(Array.from({ length: 5 }, () => post(O, "/faction", { faction: "t", requestId: id1 })));
    assert.ok(five.every((x) => x.status === 200), JSON.stringify(five.map((x) => x.data)));
    assert.equal(Number((await q("SELECT stones FROM characters WHERE user_id = ?", [O.id]))[0].stones), 500, "paid once");
    const again = await post(O, "/faction", { faction: "c", requestId: rid() });
    assert.match(again.data.error ?? "", /còn .* nữa mới đổi lại/, JSON.stringify(again.data));
    // signed up: no change of side
    await q("UPDATE characters SET faction_at = NULL, stones = 5000 WHERE user_id = ?", [O.id]);
    assert.ok((await post(O, "/register")).data.ok);
    assert.match((await post(O, "/faction", { faction: "c", requestId: rid() })).data.error ?? "", /hủy đăng ký trước/);
    assert.ok((await post(O, "/unregister")).data.ok);
    // not enough stones
    await q("UPDATE characters SET stones = 10 WHERE user_id = ?", [O.id]);
    assert.match((await post(O, "/faction", { faction: "c", requestId: rid() })).data.error ?? "", /linh thạch/);
    ok("The side: required at creation; an old character picks it free; changing is paid once per request, then waits change_days; not while signed up; not without the stones");
  }

  // ---------------------------------------------------------------- signing up
  const C = [await person("c", 90000), await person("c", 60000), await person("c", 30000), await person("c", 5000)];
  const Ta = [await person("t", 80000), await person("t", 40000)];
  const off = await person("t", 99999), low = await person("c", 0);
  {
    const v = (await call("/chinhta", { token: C[0].token })).data;
    assert.ok(v.next && v.next.open, "a battle to sign up for: " + JSON.stringify(v.next));
    // many sign-ups at once: one row
    const all = await Promise.all(Array.from({ length: 6 }, () => post(C[0], "/register")));
    assert.ok(all.every((r) => r.status === 200), JSON.stringify(all.map((r) => r.data)));
    assert.equal(Number((await q("SELECT COUNT(*) AS n FROM ct_signups WHERE slot = ? AND user_id = ?", [v.next.at, C[0].id]))[0].n), 1, "signed once");
    for (const P of [...C.slice(1), ...Ta, off]) assert.ok((await post(P, "/register")).data.ok, P.name);
    assert.match((await post(low, "/register")).data.error ?? "", /Cần đạt cấp 2/, "under the level: refused");
    const v2 = (await call("/chinhta", { token: C[0].token })).data;
    assert.ok(v2.next.signed && v2.next.counts.c >= 4 && v2.next.counts.t >= 3, JSON.stringify(v2.next));
    ok("Signing up: once however many at once; the level needed; counts per side in the panel");
  }

  // ---------------------------------------------------------------- the teams and the field
  const cs = [], ts = [];
  for (const P of C) cs.push(await connect(P));
  for (const P of Ta) ts.push(await connect(P));
  socks.push(...cs, ...ts);
  const fromMap = cs[0].map;
  const st = await adm("/chinhta/start", { method: "POST" });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  // max_gap 1: Tà has 2 online (the third is offline), so Chính takes its best 3; the weakest Chính waits as dự bị
  assert.deepEqual([st.data.c, st.data.t], [3, 2], JSON.stringify(st.data));
  assert.equal((await adm("/chinhta/start", { method: "POST" })).status, 400, "a second start while one runs: refused");
  for (const c of [cs[0], cs[1], cs[2], ...ts]) assert.ok(await until(() => c.msgs.some((m) => m.t === "welcome" && m.map === "chientruong")), `${c.P.name} brought onto the field`);
  assert.ok(await until(() => got(cs[3], (m) => m.t === "toast" && /dự bị số 1/.test(m.m))), "the weakest Chính waits as dự bị 1");
  assert.ok(!got(cs[3], (m) => m.t === "welcome" && m.map === "chientruong"), "and isn't on the field");
  // everyone at their side's camp
  await until(() => cs[0].pos && ts[0].pos && cs[0].map !== fromMap);
  await sleep(300);
  assert.ok(cs[0].pos.x >= CAMPS.c.x0 * T && cs[0].pos.x <= CAMPS.c.x1 * T, `Chính at its camp: ${cs[0].pos.x}`);
  assert.ok(ts[0].pos.x >= CAMPS.t.x0 * T && ts[0].pos.x <= CAMPS.t.x1 * T, `Tà at its camp: ${ts[0].pos.x}`);
  const w = cs[0].msgs.find((m) => m.t === "welcome" && m.map === "chientruong");
  assert.ok(w.players.every((p) => p.f === "c" || p.f === "t"), "everyone's side is known to the browsers");
  assert.ok(got(cs[0], (m) => m.t === "ctstate" && m.faction === "c"), "the state of the battle sent on arrival");
  // getting ready: walking east is stopped at the camp's edge
  const walk = (c, dx) => c.ws.send(JSON.stringify({ t: "in", dx, jump: false, down: false }));
  walk(cs[0], 1);
  await sleep(1500);
  assert.ok(cs[0].pos.x <= CAMPS.c.x1 * T + 1, `held in the camp while getting ready: ${cs[0].pos.x}`);
  ok("The teams: each side's best (the bigger cut to the smaller + max_gap, the rest dự bị, the offline left out); a second start refused; everyone brought in at their camp; the camps closed while getting ready");

  // ---------------------------------------------------------------- the fight: a kill for the side
  assert.ok(await until(() => got(cs[0], (m) => m.t === "ctscore" && m.phase === "fight"), 6000), "the fight begins");
  walk(ts[0], -1);
  assert.ok(await until(() => Math.abs(cs[0].pos.x - ts[0].pos.x) < 60, 30000), `they meet: ${cs[0].pos.x} ${ts[0].pos.x}`);
  walk(cs[0], 0);
  walk(ts[0], 0);
  // the Tà fighter doesn't fight back; the Chính one cuts until he falls
  const swing = setInterval(() => cs[0].ws.send(JSON.stringify({ t: "cast", s: 0, ax: Math.sign(ts[0].pos.x - cs[0].pos.x) || 1, ay: 0 })), 250);
  const fell = await until(() => got(cs[0], (m) => m.t === "ctscore" && m.c >= 1), 20000);
  clearInterval(swing);
  assert.ok(fell, "a hạ gục for Chính");
  const sc = cs[0].msgs.filter((m) => m.t === "ctscore").at(-1);
  assert.equal(sc.me.k, 1, "counted as his");
  assert.ok(got(ts[0], (m) => m.t === "feed" && /Nhất Huyết/.test(m.m)), "the first blood announced on the field");
  // he rises again at his camp
  assert.ok(await until(() => ts[0].pos && !ts[0].pos.dead && ts[0].pos.x >= CAMPS.t.x0 * T, 6000), `risen at the Tà camp: ${JSON.stringify(ts[0].pos)}`);
  assert.equal(Number((await q("SELECT kills FROM characters WHERE user_id = ?", [C[0].id]))[0].kills), 0, "no PvP tallies (tu vi, stones, rank) for a kill here: the battle has its own rewards");
  ok("The fight: a kill is one hạ gục for the killer's side (first blood announced); the fallen rise at their camp");

  // ---------------------------------------------------------------- leaving (a dự bị steps in), a dropped connection (the place kept)
  {
    const r = await post(C[2], "/leave");
    assert.ok(r.data.ok, JSON.stringify(r.data));
    assert.ok(await until(() => cs[2].msgs.filter((m) => m.t === "welcome").at(-1).map !== "chientruong"), "the one who left is taken back");
    assert.ok(await until(() => got(cs[3], (m) => m.t === "welcome" && m.map === "chientruong"), 6000), "the dự bị is called onto the field");
    // Tà's second drops; comes back within chinhta.away: straight onto the field
    ts[1].ws.close();
    await sleep(800);
    const back = await connect(Ta[1]);
    socks.push(back);
    ts[1] = back;
    assert.equal(back.map, "chientruong", "back on the field after a dropped connection");
    ok("Leaving: taken back, a dự bị called in; a dropped connection: the place kept, back on the field when they return");
  }

  // ---------------------------------------------------------------- the end: the winner, the points, once
  {
    const before = await Promise.all([...C, ...Ta].map(pts));
    await sleep(1200);
    const e1 = adm("/chinhta/end", { method: "POST" }), e2 = adm("/chinhta/end", { method: "POST" });
    const [r1, r2] = await Promise.all([e1, e2]);
    assert.equal([r1.status, r2.status].filter((s) => s === 200).length, 1, "ended once: " + JSON.stringify([r1.data, r2.data]));
    assert.ok(await until(() => got(cs[0], (m) => m.t === "ctend")), "the result on screen");
    const end = cs[0].msgs.find((m) => m.t === "ctend");
    assert.equal(end.winner, "c", "Chính wins 1 - 0");
    assert.equal(end.me.result, "w");
    const CTn = { win: 30, lose: 10 };
    assert.equal(end.me.points, CTn.win + 1 + 10, "win + a kill + MVP: " + JSON.stringify(end.me));
    assert.equal(end.mvp.c, C[0].name);
    const after = await Promise.all([...C, ...Ta].map(pts));
    assert.equal(after[0] - before[0], end.me.points, "written");
    assert.equal(after[2] - before[2], 0, "who left gets nothing");
    const tEnd = ts[0].msgs.find((m) => m.t === "ctend");
    assert.equal(tEnd.me.result, "l");
    assert.equal(tEnd.me.points, CTn.lose, "the losers get points too, fewer");
    assert.ok(after[4] - before[4] === CTn.lose, "written for the losers");
    const [m] = await q("SELECT state, winner, kills_c, kills_t FROM ct_matches WHERE id = ?", [end.board ? (await q("SELECT MAX(id) AS id FROM ct_matches"))[0].id : 0]);
    assert.deepEqual([m.state, m.winner, m.kills_c, m.kills_t], ["done", "c", 1, 0]);
    // the dự bị who came late: under min_stay % of the battle, or not, by the clock; either way no double reward rows
    const rows = await q("SELECT COUNT(*) AS n FROM ct_players WHERE match_id = (SELECT MAX(id) FROM ct_matches)");
    assert.equal(Number(rows[0].n), 6, "one row for each who fought (5 picked + the dự bị)");
    // a while later, everyone back where they came from
    assert.ok(await until(() => cs[0].msgs.filter((x) => x.t === "welcome").at(-1).map === fromMap, 20000), "taken back after the result");
    assert.ok(await until(() => ts[0].msgs.filter((x) => x.t === "welcome").at(-1).map !== "chientruong", 5000));
    assert.equal((await adm("/chinhta")).data.now, null, "the field is closed");
    const hist = (await call("/chinhta", { token: C[0].token })).data.history[0];
    assert.ok(hist && hist.result === "w" && hist.mvp && hist.points === end.me.points, "in their record: " + JSON.stringify(hist));
    ok("The end: the winner by hạ gục; points for winners, fewer for losers, the MVP's extra, nothing for who left; written once however often it is ended; everyone back where they came from; the record");
  }

  // ---------------------------------------------------------------- too few: cancelled
  {
    const P = await person("c", 9000), sP = await connect(P);
    socks.push(sP);
    assert.ok((await post(P, "/register")).data.ok);
    const r = await adm("/chinhta/start", { method: "POST" });
    assert.ok(r.data.cancelled, JSON.stringify(r.data));
    assert.ok(await until(() => got(sP, (m) => m.t === "toast" && /bị hủy/.test(m.m))), "told it's cancelled");
    assert.equal((await q("SELECT state FROM ct_matches ORDER BY id DESC LIMIT 1"))[0].state, "cancelled");
    ok("Too few on a side: the battle is cancelled, those signed up are told");
  }

  // ---------------------------------------------------------------- the Tiệm Chính Tà
  {
    const P = C[1];
    assert.equal((await adm("/chinhta/shop", { method: "POST", body: { item: "hoixuan", price: 5, sort: 1 } })).status, 200);
    await q("UPDATE characters SET ct_points = 12 WHERE user_id = ?", [P.id]);
    const v = (await call("/chinhta", { token: P.token })).data;
    assert.ok(v.shop.some((s) => s.item === "hoixuan" && s.price === 5), "sold in the Tiệm");
    const inv0 = Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'hoixuan'", [P.id]))[0]?.qty ?? 0);
    const id1 = rid();
    const same = await Promise.all(Array.from({ length: 4 }, () => post(P, "/buy", { item: "hoixuan", qty: 1, requestId: id1 })));
    assert.ok(same.every((r) => r.status === 200));
    assert.equal(await pts(P), 7, "the same request four times: paid once");
    // four buys at once with points for one: exactly one
    const four = await Promise.all(Array.from({ length: 4 }, () => post(P, "/buy", { item: "hoixuan", qty: 1, requestId: rid() })));
    assert.equal(four.filter((r) => r.status === 200).length, 1, JSON.stringify(four.map((r) => r.data)));
    assert.equal(await pts(P), 2, "never below zero");
    assert.equal(Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'hoixuan'", [P.id]))[0].qty), inv0 + 2);
    assert.equal((await post(P, "/buy", { item: "dl_hoa_hong", qty: 1, requestId: rid() })).status, 400, "not sold there: refused");
    await adm("/chinhta/shop", { method: "POST", body: { item: "hoixuan", remove: true } });
    ok("The Tiệm Chính Tà: points spent once per request, never below zero however many buys at once; only what it sells");
  }
} finally {
  for (const c of socks) c.ws.close();
  await setAll(old).catch((e) => console.error("restore", e.message));
  await q("DELETE FROM admins WHERE username = ?", [aname]);
}
console.log(`${passed} passed`);
await pool.end();
process.exit(0);
