// Tổ Đội and Phó Bản against a running server (game and admin site): node test/pho-ban.mjs [http://localhost:5886]
// The party: invitations (by name, only the leader, not oneself, not someone in a party, declined, full), joining, the
// party chat (heard by the party only), handing the lead, putting someone out. Going in: too low a level, no entries left
// (nothing counted, nobody goes in), the ready check (one no and it is off; all yes and the whole party is taken into its
// own copy of the dungeon, the day's entry counted once each). Inside: the seal (nobody passes it before the hall is
// clear), the shared lives (a fall spends one, rising at the checkpoint; a fall with none left loses the run, which gives
// nothing), a dropped connection (back inside on logging in), leaving (back where one came from, the others go on), the
// boss brought down (the run cleared once, a rank by time, each one still in rewarded once, the first clear of the day
// more), and everyone taken back after. The admin's numbers are changed for the run and put back after.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const { STAGES } = await import("../shared/maps/xaquat.js");
const { dayOf } = await import("../shared/pho-ban.js");
const tag = crypto.randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, n = 0;
const ok = (name) => (passed++, console.log("  ✓", name));
const HOME = "linhthuy", T = 32;
const socks = [];

async function person(exp = 3_000_000) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`pb_${tag}_${i}`])).insertId;
  const name = `Pb${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, exp, stones, map_id, faction) VALUES (?, ?, 'tu', 'm', ?, 0, ?, 'c')", [id, name, exp, HOME]);
  return { id, name, token: await createSession(id) };
}
function connect(P) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], ev: [], me: null, id: 0, P, pos: {}, mons: {}, party: undefined, st: null, end: null, map: null };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: P.token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "s") {
        for (const a of m.P) c.pos[a[0]] = { x: a[1], y: a[2], hp: a[4], dead: !!(a[5] & 1) };
        c.mons = {};
        for (const a of m.M) c.mons[a[0]] = { type: a[1], x: a[2], y: a[3], hp: a[5], dead: !!(a[6] & 1), elite: !!(a[6] & 256) };
        for (const e of m.E ?? []) c.ev.push(e);
        return;
      }
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), (c.map = m.map), c.resolve?.(c);
      if (m.t === "me") c.me = m;
      if (m.t === "party") c.party = m.party;
      if (m.t === "pbstate") c.st = m;
      if (m.t === "pbend") c.end = m;
    });
    c.resolve = resolve;
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
const got = (c, t, f = () => true) => c.msgs.some((m) => m.t === t && f(m));
const toast = (c, re) => c.msgs.some((m) => m.t === "toast" && re.test(m.m));
const clear = (c) => (c.msgs = []);
async function on(P) {
  const c = await connect(P);
  socks.push(c);
  return c;
}
/** Walk c along x (dir) for ms, striking ahead now and then. */
async function walk(c, dir, ms, strike = false) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    tx(c, { t: "in", dx: dir, jump: false, down: false });
    if (strike) tx(c, { t: "cast", s: 0, ax: dir, ay: 0 });
    await sleep(150);
  }
  tx(c, { t: "in", dx: 0, jump: false, down: false });
}

// the admin, and the numbers this test runs on (put back after)
const aname = "t_pb_" + tag, apw = "tamthoi123";
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [aname, await hashPassword(apw)]);
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: aname, password: apw }) })).json()).token;
const adm = async (path, body, method = "POST") => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + atok }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const BASE_SET = { "pb.party": 4, "pb.daily": 3, "pb.level": 6, "pb.lives": 3, "pb.lives_per_member": 1, "pb.respawn": 2, "pb.monster_atk": 1.3, "pb.minutes": 15 };
const KEYS = [...new Set([...Object.keys(BASE_SET), "pb.monster_atk"])];
const old = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k IN (?)", [KEYS])).map((r) => [r.k, r.v]));
const set = async (o) => {
  for (const [k, v] of Object.entries(o)) assert.equal((await adm(`/t/settings/${k}`, { v }, "PATCH")).status, 200, k);
};
await set(BASE_SET);
const runOf = async (uid) => (await adm("/phoban", null, "GET")).data.runs.find((r) => r.members.some((m) => m.uid === uid));
const daily = async (uid) => Number((await q("SELECT n FROM pb_daily WHERE user_id = ? AND day = ?", [uid, dayOf()]))[0]?.n ?? 0);

try {
  console.log("Tổ Đội và Phó Bản against", BASE);
  const [PA, PB_, PC, PD] = [await person(), await person(), await person(), await person(30)];
  const A = await on(PA), B = await on(PB_), C = await on(PC), D = await on(PD);
  for (const c of [A, B, C, D]) assert.equal(c.map, HOME);

  // ---- the party
  tx(A, { t: "party", a: "invite", name: "khong_co_ai_" + tag });
  assert.ok(await until(() => toast(A, /Không tìm thấy/)), "nobody by that name");
  tx(A, { t: "party", a: "invite", name: PA.name });
  assert.ok(await until(() => toast(A, /tự mời/)), "not oneself");
  tx(A, { t: "party", a: "invite", name: PB_.name.toLowerCase() });
  assert.ok(await until(() => got(B, "pinvite", (m) => m.name === PA.name)), "B is invited (the name in any case)");
  assert.ok(A.party && A.party.leader === PA.id && A.party.members.length === 1, "the party made with A its leader");
  tx(B, { t: "party", a: "accept", uid: PA.id });
  assert.ok(await until(() => A.party?.members.length === 2 && B.party?.members.length === 2), "B joins: both see two");
  tx(B, { t: "party", a: "invite", name: PC.name });
  assert.ok(await until(() => toast(B, /Chỉ đội trưởng/)), "only the leader invites");
  tx(A, { t: "party", a: "invite", name: PC.name });
  assert.ok(await until(() => got(C, "pinvite")));
  tx(C, { t: "party", a: "decline", uid: PA.id });
  assert.ok(await until(() => toast(A, /từ chối/)), "C declines: A is told");
  tx(C, { t: "party", a: "accept", uid: PA.id });
  assert.ok(await until(() => toast(C, /hết hạn/)), "a declined invitation is gone");
  await set({ "pb.party": 2 });
  clear(A);
  tx(A, { t: "party", a: "invite", name: PC.name });
  assert.ok(await until(() => toast(A, /đủ 2 người/)), "a full party invites nobody");
  await set({ "pb.party": 4 });
  ok("invitations: by name, only the leader, not oneself, declined, full");

  clear(B), clear(C);
  tx(A, { t: "chat", ch: "p", m: "tổ đội nghe rõ" });
  assert.ok(await until(() => got(B, "chat", (m) => m.ch === "p" && m.m === "tổ đội nghe rõ")), "B hears the party");
  await sleep(300);
  assert.ok(!got(C, "chat", (m) => m.ch === "p"), "C (not in it) does not");
  tx(A, { t: "party", a: "lead", uid: PB_.id });
  assert.ok(await until(() => A.party?.leader === PB_.id && B.party?.leader === PB_.id), "the lead handed to B");
  tx(B, { t: "party", a: "kick", uid: PA.id });
  assert.ok(await until(() => A.party === null && B.party?.members.length === 1), "A put out: no party for A, B alone");
  tx(B, { t: "party", a: "invite", name: PA.name });
  assert.ok(await until(() => got(A, "pinvite", (m) => m.from === PB_.id)));
  tx(A, { t: "party", a: "accept", uid: PB_.id });
  assert.ok(await until(() => B.party?.members.length === 2 && A.party?.leader === PB_.id));
  ok("the party chat (the party only), the lead handed, someone put out and invited again");

  // ---- going in: the checks
  clear(D);
  tx(D, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => toast(D, /chưa đủ cấp/)), "too low a level");
  await q("INSERT INTO pb_daily (user_id, day, n) VALUES (?, ?, 3) ON DUPLICATE KEY UPDATE n = 3", [PC.id, dayOf()]);
  clear(C);
  tx(C, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => toast(C, /hết 3 lượt/)), "no entries left today");
  assert.equal(await daily(PC.id), 3, "nothing counted");
  assert.equal(C.map, HOME, "and C did not go in");
  ok("going in: too low a level; no entries left (nothing counted, nobody in)");

  // ---- the ready check
  clear(A), clear(B);
  tx(A, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => toast(A, /Chỉ đội trưởng/)), "only the leader takes the party in");
  tx(B, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => got(A, "pready", (m) => m.key === "xaquat")), "A is asked if ready");
  tx(A, { t: "pb", a: "ready", ok: false });
  assert.ok(await until(() => got(B, "pready", (m) => m.cancel)), "A not ready: off for everyone");
  assert.equal(await daily(PA.id), 0, "nothing counted");
  clear(A), clear(B);
  tx(B, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => got(A, "pready", (m) => m.key === "xaquat")));
  tx(A, { t: "pb", a: "ready", ok: true });
  assert.ok(await until(() => A.map === "xaquat" && B.map === "xaquat", 8000), "all ready: both taken into the dungeon");
  assert.ok(await until(() => A.st && B.st && A.st.id === B.st.id), "the same run");
  assert.equal(A.st.stage, 0);
  assert.equal(A.st.lives, 4, "lives: 3 + 1 for the second member");
  assert.equal(await daily(PA.id), 1, "A's entry counted once");
  assert.equal(await daily(PB_.id), 1, "B's too");
  const run1 = A.st.id;
  assert.ok(Object.values(A.mons).length >= 10, "the den's monsters are there");
  assert.ok(Object.values(A.mons).some((m) => m.elite), "an elite among them");
  assert.ok(Object.values(A.mons).some((m) => m.type === "boss:xavuong"), "and the boss");
  ok("the ready check: one no and it is off; all yes and the party is in its own copy, entries counted once");

  // ---- the seal
  await walk(A, 1, 9000, true);
  const seal = STAGES[0].seal * T;
  assert.ok(me(A).x <= seal, `A stops at the seal (${me(A).x} ≤ ${seal})`);
  assert.equal(A.st.stage, 0, "the seal is still closed");
  ok("the seal: nobody passes before the hall is clear");

  // ---- a dropped connection, then back inside
  B.ws.close();
  await sleep(800);
  const B2 = await on(PB_);
  assert.equal(B2.map, "xaquat", "B logs in again: back inside the run");
  assert.ok(await until(() => B2.st?.id === run1));
  ok("a dropped connection: back inside on logging in");

  // ---- the boss brought down: cleared, ranked, rewarded once
  assert.equal((await adm(`/phoban/${run1}/skip`)).status, 200);
  assert.equal((await adm(`/phoban/${run1}/skip`)).status, 200);
  assert.ok(await until(() => A.st.stage === 2 && A.st.boss), "the halls cleared: the boss's hall open");
  assert.equal((await adm(`/phoban/${run1}/skip`)).status, 409, "no seal after the last hall");
  assert.equal((await adm(`/phoban/boss/${run1}`, { hp: 30 })).status, 200);
  assert.equal((await adm(`/phoban/${run1}/gather`)).status, 200);
  const before = Object.fromEntries((await q("SELECT user_id, stones, exp FROM characters WHERE user_id IN (?)", [[PA.id, PB_.id]])).map((r) => [r.user_id, r]));
  const bag = async (uid) => Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'hoixuan'", [uid]))[0]?.qty ?? 0);
  const bagA = await bag(PA.id);
  const boss = () => Object.values(A.mons).find((m) => m.type === "boss:xavuong");
  for (let i = 0; i < 160 && !A.end; i++) {
    const b = boss(), p = me(A);
    if (b && p && !p.dead) {
      const dx = b.x - p.x;
      tx(A, { t: "in", dx: Math.abs(dx) > 50 ? Math.sign(dx) : 0, jump: false, down: false });
      tx(A, { t: "cast", s: 0, ax: Math.sign(dx) || 1, ay: 0 });
    }
    await sleep(120);
  }
  tx(A, { t: "in", dx: 0, jump: false, down: false });
  assert.ok(A.end && A.end.state === "cleared", "cleared");
  assert.ok(await until(() => B2.end?.state === "cleared"));
  assert.ok(["S", "A", "B"].includes(A.end.rank) && A.end.rank === "S", "a rank by time (fast: S)");
  assert.ok(A.end.me.reward && A.end.me.first, "A rewarded, the first clear of the day");
  const [rowRun] = await q("SELECT state, rank_, seconds FROM pb_runs WHERE id = ?", [run1]);
  assert.equal(rowRun.state, "cleared");
  const rows = await q("SELECT user_id, rewarded, first, stones, exp FROM pb_members WHERE run_id = ?", [run1]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.rewarded === 1 && r.first === 1), "each one's row: rewarded once, first");
  const after = Object.fromEntries((await q("SELECT user_id, stones, exp FROM characters WHERE user_id IN (?)", [[PA.id, PB_.id]])).map((r) => [r.user_id, r]));
  const rA = rows.find((r) => r.user_id === PA.id);
  assert.ok(after[PA.id].stones - before[PA.id].stones >= rA.stones, "the stones in A's character");
  assert.ok(Number(after[PA.id].exp) - Number(before[PA.id].exp) >= Number(rA.exp), "and the exp");
  assert.equal(rA.stones, A.end.me.reward.stones);
  assert.ok((await bag(PA.id)) >= bagA + 3, "and the pills (S: one more)");
  const [dA] = await q("SELECT n, cleared FROM pb_daily WHERE user_id = ? AND day = ?", [PA.id, dayOf()]);
  assert.equal(dA.cleared, 1);
  ok("the boss brought down: cleared once, ranked by time, each one rewarded once (the first clear of the day)");

  assert.ok(await until(() => A.map === HOME && B2.map === HOME, 16000), "after the result everyone is back where they came from");
  assert.ok(!(await runOf(PA.id)), "and the run is gone");
  ok("everyone taken back after the result");

  // ---- leaving, the lives, a run lost
  await set({ "pb.monster_atk": 4000, "pb.lives": 1, "pb.lives_per_member": 0 });
  clear(A), clear(B2);
  A.end = null, B2.end = null;
  tx(B2, { t: "pb", a: "start", d: "xaquat" });
  assert.ok(await until(() => got(A, "pready")));
  tx(A, { t: "pb", a: "ready", ok: true });
  assert.ok(await until(() => A.map === "xaquat" && B2.map === "xaquat", 8000));
  assert.ok(await until(() => A.st && A.st.id !== run1 && A.st.lives === 1));
  const run2 = A.st.id;
  tx(B2, { t: "pb", a: "quit" });
  assert.ok(await until(() => B2.map === HOME, 6000), "B leaves: back where B came from");
  assert.ok(await until(() => A.st.board.find((r) => r.name === PB_.name)?.left), "the others go on, B marked as gone");
  await walk(A, 1, 15000, false);
  assert.ok(A.end && A.end.state === "failed", "the hits come: a fall spends the last life, the next loses the run");
  assert.ok(A.st.lives === 0);
  const [r2] = await q("SELECT state, note FROM pb_runs WHERE id = ?", [run2]);
  assert.equal(r2.state, "failed");
  assert.ok(!A.end.me.reward, "nothing given");
  const rows2 = await q("SELECT rewarded FROM pb_members WHERE run_id = ?", [run2]);
  assert.ok(rows2.every((r) => r.rewarded === 0));
  assert.equal(await daily(PA.id), 2, "the entry spent anyway");
  assert.ok(await until(() => A.map === HOME, 16000), "A back after the result");
  ok("leaving (the others go on), the lives (a fall with none left loses the run: nothing given, the entry spent)");
} finally {
  for (const c of socks) c.ws.close();
  await set(old).catch((e) => console.error("put back", e.message));
  await q("DELETE FROM admins WHERE username = ?", [aname]);
  await q("DELETE FROM users WHERE username LIKE ?", [`pb_${tag}_%`]);
  await pool.end();
}
console.log(`${passed} passed`);
