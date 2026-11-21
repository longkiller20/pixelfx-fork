// Đạo Lữ against a running server (game and admin site): node test/dao-lu.mjs [http://localhost:5886]
// Every rule, and what happens when things are asked many times at once: roses bought once per request, given only to a
// Đạo Hữu of the other gender, affinity never past 100 and no rose taken past it, at most rose_daily a day; a proposal only
// at 100, one at a time, the ring paid by who proposed only on "yes", only once however many yeses arrive, never two
// marriages for one person; the ring's buff in the world and the partner's name by theirs; divorce takes the ring and the
// buff, resets the affinity, makes both wait; the admin's names, prices, buffs and parting.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const dl = await import("../shared/dao-lu.js");
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
/** A character made in the database (gender g, stones), with a session. */
async function person(g, stones = 0) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tl_${tag}_${i}`])).insertId;
  const name = `Lữ${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', ?, 8, 16, 0, ?)", [id, name, g, stones]);
  return { id, name, g, token: await createSession(id) };
}
const befriend = (a, b) => q("INSERT IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)", [a.id, b.id, b.id, a.id]);
const stones = async (P) => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [P.id]))[0].stones);
const roses = async (P) => Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = ?", [P.id, dl.ROSE]))[0]?.qty ?? 0);
const points = async (A, B) => Number((await q("SELECT points FROM dl_affinity WHERE lo = ? AND hi = ?", [Math.min(A.id, B.id), Math.max(A.id, B.id)]))[0]?.points ?? 0);
const spouse = async (P) => (await q("SELECT partner_id, ring FROM dl_spouses WHERE user_id = ?", [P.id]))[0] ?? null;
const setPoints = (A, B, p) => q("INSERT INTO dl_affinity (lo, hi, points) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points)", [Math.min(A.id, B.id), Math.max(A.id, B.id), p]);
const post = (P, path, body) => call(`/daolu${path}`, { token: P.token, method: "POST", body });
function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    const c = { ws, msgs: [], me: null, id: 0 };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), resolve(c);
      if (m.t === "me") c.me = m;
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 5000);
  });
}
const until = async (fn, ms = 4000) => {
  for (let i = 0; i < ms / 50; i++) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};

console.log("Đạo Lữ against", BASE);
const ROSE_PRICE = (await call("/config")).data.items?.find?.((i) => i.key === dl.ROSE)?.price ?? 50;

// ---------------------------------------------------------------- roses: bought once per request, given only to a friend of the other gender
const A = await person("m", 100000), B = await person("f", 0), C = await person("m", 0), D = await person("f", 100000);
{
  // five buys with the same request id: one handful, paid once; four with their own: four handfuls
  const id1 = rid();
  const five = await Promise.all(Array.from({ length: 5 }, () => post(A, "/buy", { qty: 5, requestId: id1 })));
  assert.ok(five.every((r) => r.status === 200), JSON.stringify(five.map((r) => r.data)));
  assert.equal(await roses(A), 5, "the same request five times: one handful");
  assert.equal(await stones(A), 100000 - 5 * ROSE_PRICE, "paid once");
  await Promise.all(Array.from({ length: 4 }, () => post(A, "/buy", { qty: 5, requestId: rid() })));
  assert.equal(await roses(A), 25);
  assert.equal(await stones(A), 100000 - 25 * ROSE_PRICE, "four handfuls, each paid");
  assert.equal((await post(A, "/buy", { qty: 100, requestId: rid() })).status, 400, "at most rose_buy_max at once");
  assert.equal((await post(B, "/buy", { qty: 1, requestId: rid() })).status, 409, "no stones, no rose");
  assert.equal((await post(A, "/buy", { qty: 1 })).status, 400, "no request id");
  // not a friend: no gift; a friend of the same gender: no gift either
  let r = await post(A, "/gift", { uid: B.id, qty: 1, requestId: rid() });
  assert.equal(r.status, 403, "only to a Đạo Hữu");
  await befriend(A, C);
  r = await post(A, "/gift", { uid: C.id, qty: 1, requestId: rid() });
  assert.equal(r.status, 403, "only to the other gender");
  assert.match(r.data.error, /khác giới/);
  assert.equal(await roses(A), 25, "nothing taken");
  assert.equal((await post(A, "/gift", { uid: A.id, qty: 1, requestId: rid() })).status, 400, "not to oneself");
  ok("Hoa Hồng: bought once per request and paid once, never without the stones; given only to a Đạo Hữu of the other gender (nothing taken otherwise)");
}

// ---------------------------------------------------------------- affinity: never past 100, no rose wasted, at most rose_daily a day
{
  await befriend(A, B);
  const per = (await call("/daolu", { token: A.token })).data.rules.rosePoints;
  let r = await post(A, "/gift", { uid: B.id, qty: 3, requestId: rid() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(await points(A, B), 3 * per);
  assert.equal(await roses(A), 22);
  // the same gift twice: once
  const g = rid();
  await Promise.all([post(A, "/gift", { uid: B.id, qty: 1, requestId: g }), post(A, "/gift", { uid: B.id, qty: 1, requestId: g })]);
  assert.equal(await points(A, B), 4 * per, "the same gift twice counts once");
  // five gifts of two at once, when six more roses fill it: it stops at 100 and only six are taken
  const need = Math.ceil((dl.NEED - 4 * per) / per);
  const before = await roses(A);
  const five = await Promise.all(Array.from({ length: 5 }, () => post(A, "/gift", { uid: B.id, qty: 2, requestId: rid() })));
  assert.equal(await points(A, B), dl.NEED, "affinity never past 100");
  assert.equal(before - (await roses(A)), need, `only the ${need} roses that count are taken`);
  assert.ok(five.some((x) => x.status === 409 && /đủ 100/.test(x.data.error)), "a gift past 100 is refused");
  // the view says so; B sees the same number from her side
  const vb = (await call("/daolu", { token: B.token })).data;
  assert.equal(vb.friends.find((f) => f.uid === A.id).points, dl.NEED, "both see the same affinity");
  // the daily cap: a fresh pair (C, D) and rose_daily + 5 roses, one at a time
  await befriend(C, D);
  await q("UPDATE characters SET stones = 100000 WHERE user_id = ?", [D.id]);
  const daily = vb.rules.roseDaily;
  await post(D, "/buy", { qty: Math.min(99, daily + 5), requestId: rid() });
  // the affinity is put back to 0 between handfuls, so only the day's count can stop it
  for (let k = 0; k < daily; k += 5) {
    await setPoints(C, D, 0);
    r = await post(D, "/gift", { uid: C.id, qty: Math.min(5, daily - k), requestId: rid() });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  await setPoints(C, D, 0);
  r = await post(D, "/gift", { uid: C.id, qty: 1, requestId: rid() });
  assert.equal(r.status, 409, "past rose_daily today: refused");
  assert.match(r.data.error, /Hôm nay/);
  ok(`Hảo cảm: ${per} a rose, one number for the pair, never past ${dl.NEED} and no rose taken past it (five gifts at once), the same gift twice counted once, at most ${daily} a day`);
}

// ---------------------------------------------------------------- proposals: only at 100, one at a time, the ring paid only on yes, once
const cA = await connect(A.token), cB = await connect(B.token);
await sleep(600);
{
  const hp0 = cA.me.maxHp, atk0 = cA.me.atk;
  // C and D at less than 100: no proposal
  await setPoints(C, D, 90);
  let r = await post(C, "/propose", { uid: D.id, ring: "dl_nhan_dong_tam" });
  assert.equal(r.status, 409, "under 100: no proposal");
  // a ring that doesn't exist; a ring A can't pay for (the check at proposing)
  assert.equal((await post(A, "/propose", { uid: B.id, ring: "nhan_gia" })).status, 400);
  await q("UPDATE characters SET stones = ? WHERE user_id = ?", [40000, A.id]);
  r = await post(A, "/propose", { uid: B.id, ring: "dl_nhan_thien_duyen" });
  assert.equal(r.status, 409, "a ring one can't pay for");
  assert.match(r.data.error, /trả khi được đồng ý/);
  r = await post(A, "/propose", { uid: B.id, ring: "dl_nhan_uyen_uong" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(await until(() => cB.msgs.some((m) => m.t === "daolu" && /cầu hôn/.test(m.note ?? ""))), "B hears of it at once");
  assert.equal(await stones(A), 40000, "nothing paid yet");
  assert.equal((await post(A, "/propose", { uid: B.id, ring: "dl_nhan_dong_tam" })).status, 409, "one proposal at a time");
  // B proposing back to A while A's waits: refused (answer it instead)
  assert.equal((await post(B, "/propose", { uid: A.id, ring: "dl_nhan_dong_tam" })).status, 409);
  // five yeses at once (each its own request): one marriage, the ring paid once
  const price = (await call("/daolu", { token: A.token })).data.rings.find((x) => x.key === "dl_nhan_uyen_uong").price;
  const yes = await Promise.all(Array.from({ length: 5 }, () => post(B, "/answer", { uid: A.id, accept: true, requestId: rid() })));
  assert.equal(yes.filter((x) => x.status === 200).length, 1, "one yes counts");
  assert.equal(await stones(A), 40000 - price, "the ring paid once, by who proposed");
  assert.equal(await stones(B), 0, "nothing from the one who said yes");
  assert.deepEqual(await spouse(A), { partner_id: B.id, ring: "dl_nhan_uyen_uong" });
  assert.deepEqual(await spouse(B), { partner_id: A.id, ring: "dl_nhan_uyen_uong" });
  assert.equal(Number((await q("SELECT COUNT(*) AS n FROM dl_marriages WHERE (a_id = ? OR b_id = ?) AND ended_at IS NULL", [A.id, A.id]))[0].n), 1, "one marriage");
  assert.equal((await q("SELECT 1 FROM dl_proposals WHERE from_id IN (?, ?) OR to_id IN (?, ?)", [A.id, B.id, A.id, B.id])).length, 0, "no proposals left");
  // the world: the ring's buff for both, the partner's name by theirs, the wedding over them, a line in the feed
  const buff = dl.RING_BUFF.dl_nhan_uyen_uong;
  assert.ok(await until(() => cA.me?.daolu?.name === B.name), "A's world knows his dao lu");
  assert.ok(Math.abs(cA.me.maxHp / hp0 - (1 + buff.hp / 100)) < 0.02 && cA.me.atk > atk0, `the ring's buff counts: ${hp0} → ${cA.me.maxHp}`);
  assert.ok(await until(() => cB.msgs.some((m) => m.t === "pi" && m.id === cA.id && m.dl === B.name)), "A's name tag carries B");
  assert.ok(await until(() => cA.msgs.some((m) => m.t === "s" && (m.E ?? []).some((e) => e.e === "love" && e.k === "wedding"))), "the wedding effect");
  assert.ok(await until(() => cA.msgs.some((m) => m.t === "feed" && /Đạo Lữ/.test(m.m))), "the feed tells everyone");
  // married: no roses to anyone else, no proposal to or from anyone else; roses to one's own dao lu are fine
  await befriend(A, D);
  await setPoints(A, D, dl.NEED);
  assert.equal((await post(A, "/gift", { uid: D.id, qty: 1, requestId: rid() })).status, 409, "no roses to another while married");
  r = await post(D, "/propose", { uid: A.id, ring: "dl_nhan_dong_tam" });
  assert.equal(r.status, 409, "no proposing to someone married");
  assert.match(r.data.error, /đã có Đạo Lữ/);
  const ra = await roses(A);
  assert.equal((await post(A, "/gift", { uid: B.id, qty: 2, requestId: rid() })).status, 200, "roses to one's dao lu");
  assert.equal(await roses(A), ra - 2);
  ok("Cầu hôn: only at 100 and only with a ring one can pay for, one at a time; five yeses at once make one marriage, the ring paid once by who proposed; both get the ring's buff, the name by theirs, the wedding and the feed; married, no roses or proposals with anyone else");
}

// ---------------------------------------------------------------- divorce: the ring and buff go, affinity back to 0, a wait
{
  const both = await Promise.all([post(A, "/divorce", {}), post(B, "/divorce", {})]);
  assert.equal(both.filter((x) => x.status === 200).length, 1, "divorcing from both sides at once: one divorce");
  assert.equal(await spouse(A), null);
  assert.equal(await spouse(B), null);
  assert.equal(await points(A, B), 0, "affinity back to 0");
  assert.ok(await until(() => cA.me?.daolu === null), "the world takes the ring away");
  const v = (await call("/daolu", { token: A.token })).data;
  assert.ok(v.wait > 0 && !v.spouse, "a wait before marrying again");
  await setPoints(A, B, dl.NEED);
  const r = await post(A, "/propose", { uid: B.id, ring: "dl_nhan_dong_tam" });
  assert.equal(r.status, 409, "no marrying again during the wait");
  assert.match(r.data.error, /ly hôn/);
  assert.equal((await post(A, "/divorce", {})).status, 404, "no dao lu, no divorce");
  ok("Ly hôn: from both sides at once one divorce; the ring and its buff gone, the affinity back to 0, a wait before marrying again");
}

// ---------------------------------------------------------------- accepting with the ring unaffordable; two proposals for one man accepted at once
{
  // C proposes to D with the cheapest ring, then spends his stones: D's yes changes nothing, the proposal waits
  await setPoints(C, D, dl.NEED);
  await q("UPDATE characters SET stones = 6000 WHERE user_id = ?", [C.id]);
  let r = await post(C, "/propose", { uid: D.id, ring: "dl_nhan_dong_tam" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await q("UPDATE characters SET stones = 10 WHERE user_id = ?", [C.id]);
  r = await post(D, "/answer", { uid: C.id, accept: true, requestId: rid() });
  assert.equal(r.status, 409, "the one who proposed can't pay now: nothing happens");
  assert.equal(await spouse(D), null);
  assert.equal(await stones(C), 10);
  assert.equal((await q("SELECT 1 FROM dl_proposals WHERE from_id = ?", [C.id])).length, 1, "the proposal waits");
  await q("UPDATE characters SET stones = 6000 WHERE user_id = ?", [C.id]);
  r = await post(D, "/answer", { uid: C.id, accept: true, requestId: rid() });
  assert.equal(r.status, 200);
  assert.equal((await spouse(C)).partner_id, D.id);
  // E (a man) has two women at 100 proposing; he says yes to both at once: one marriage
  const E = await person("m"), F = await person("f", 50000), G = await person("f", 50000);
  await befriend(E, F), await befriend(E, G);
  await setPoints(E, F, dl.NEED), await setPoints(E, G, dl.NEED);
  assert.equal((await post(F, "/propose", { uid: E.id, ring: "dl_nhan_dong_tam" })).status, 200);
  assert.equal((await post(G, "/propose", { uid: E.id, ring: "dl_nhan_dong_tam" })).status, 200);
  const two = await Promise.all([post(E, "/answer", { uid: F.id, accept: true, requestId: rid() }), post(E, "/answer", { uid: G.id, accept: true, requestId: rid() })]);
  assert.equal(two.filter((x) => x.status === 200).length, 1, "two yeses at once: one marriage");
  const wife = (await spouse(E)).partner_id, other = wife === F.id ? G : F;
  assert.equal(await spouse(other), null);
  assert.equal(await stones(other), 50000, "the other paid nothing");
  // no longer friends: the gift is refused
  await q("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [E.id, other.id, other.id, E.id]);
  // a decline: it goes
  const H = await person("m", 50000), I = await person("f");
  await befriend(H, I), await setPoints(H, I, dl.NEED);
  await post(H, "/propose", { uid: I.id, ring: "dl_nhan_dong_tam" });
  assert.equal((await post(I, "/answer", { uid: H.id, accept: false, requestId: rid() })).status, 200);
  assert.equal((await q("SELECT 1 FROM dl_proposals WHERE from_id = ?", [H.id])).length, 0, "declined: gone");
  assert.equal(await stones(H), 50000);
  // withdrawn: gone
  await post(H, "/propose", { uid: I.id, ring: "dl_nhan_dong_tam" });
  assert.equal((await post(H, "/cancel", {})).status, 200);
  assert.equal((await post(I, "/answer", { uid: H.id, accept: true, requestId: rid() })).status, 404, "a withdrawn proposal can't be accepted");
  ok("Nhận lời: the one who proposed must still afford the ring (else it waits); two proposals accepted at once make one marriage; declined or withdrawn, a proposal is gone");
}

// ---------------------------------------------------------------- the admin: names, prices, buffs, parting a couple, setting affinity
{
  const name = "t_adl_" + tag, pw = "tamthoi123";
  await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [name, await hashPassword(pw)]);
  const adm = async (path, { token, method = "GET", body } = {}) => {
    const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const token = (await adm("/login", { method: "POST", body: { username: name, password: pw } })).data.token;
  try {
    const v = (await adm("/daolu", { token })).data;
    assert.equal(v.rings.length, 3, "three rings");
    assert.ok(v.now.some((m) => [m.a_id, m.b_id].includes(C.id)), "the couples now");
    // a ring renamed and repriced, a buff changed: the game has them at once
    const ring = "dl_nhan_dong_tam", old = v.rings.find((x) => x.key === ring);
    assert.equal((await adm(`/t/items/${ring}`, { token, method: "PATCH", body: { name: "Nhẫn Thử", price: 777 } })).status, 200);
    assert.equal((await adm(`/t/ring_buffs/${ring}`, { token, method: "PATCH", body: { hp: 20 } })).status, 200);
    const gv = (await call("/daolu", { token: C.token })).data;
    assert.ok(gv.rings.find((x) => x.key === ring).name === "Nhẫn Thử" && gv.rings.find((x) => x.key === ring).price === 777 && gv.rings.find((x) => x.key === ring).buff.hp === 20, "the game has the new name, price and buff");
    assert.equal(gv.spouse.ring.buff.hp, 20, "a couple's buff follows the admin's at once");
    assert.equal((await adm(`/t/ring_buffs/${ring}`, { token, method: "PATCH", body: { hp: -5 } })).status, 400, "a negative buff is refused");
    assert.equal((await adm(`/t/ring_buffs/${ring}`, { token, method: "PATCH", body: { atk: 500 } })).status, 400, "more than 100% is refused");
    // the rose's price
    assert.equal((await adm(`/t/items/${dl.ROSE}`, { token, method: "PATCH", body: { price: 7 } })).status, 200);
    assert.equal((await call("/daolu", { token: C.token })).data.rules.rosePrice, 7, "the rose's price");
    // a rule: the roses a day
    assert.equal((await adm("/t/settings/daolu.rose_daily", { token, method: "PATCH", body: { v: 7 } })).status, 200);
    assert.equal((await call("/daolu", { token: C.token })).data.rules.roseDaily, 7, "the day's roses as the admin set");
    await adm("/t/settings/daolu.rose_daily", { token, method: "PATCH", body: { v: v.rules.roseDaily } });
    // part C and D; set a pair's affinity
    assert.equal((await adm("/daolu/divorce", { token, method: "POST", body: { uid: C.id } })).status, 200);
    assert.equal(await spouse(C), null);
    assert.equal(await spouse(D), null);
    assert.equal((await adm("/daolu/affinity", { token, method: "POST", body: { a: C.id, b: D.id, points: 55 } })).status, 200);
    assert.equal(await points(C, D), 55);
    assert.equal((await adm("/daolu/affinity", { token, method: "POST", body: { a: C.id, b: D.id, points: 101 } })).status, 400);
    const pv = (await adm(`/players/${C.id}`, { token })).data;
    assert.ok(pv.daolu && pv.daolu.history.length >= 1, "the player page has the Đạo Lữ section");
    // back as it was
    await adm(`/t/items/${ring}`, { token, method: "PATCH", body: { name: old.name, price: old.price } });
    await adm(`/t/ring_buffs/${ring}`, { token, method: "PATCH", body: { ...old.buff } });
    await adm(`/t/items/${dl.ROSE}`, { token, method: "PATCH", body: { price: v.rose.price } });
  } finally {
    await q("DELETE FROM admins WHERE username = ?", [name]);
  }
  ok("Admin: rings renamed, repriced, their buff changed (a couple's buff follows at once; broken numbers refused), the rose's price; a couple parted, a pair's affinity set; the player page");
}

cA.ws.close(), cB.ws.close();
await pool.end();
console.log(`${passed} checks passed`);
process.exit(0);
