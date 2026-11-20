// Race-condition and map checks against a running server: node test/race.mjs [http://localhost:5886]
// Each check fires many requests at once and then verifies the database-backed numbers add up.
import WebSocket from "ws";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5886";
const WS = BASE.replace(/^http/, "ws") + "/ws";
const uid = () => crypto.randomBytes(4).toString("hex");
let passed = 0;

async function call(path, { token, method = "GET", body } = {}) {
  const r = await fetch(BASE + "/api" + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function player(look = { g: "m", hair: 8, robe: 16 }) {
  const u = "t_" + uid();
  // sign-ups are limited per address (12 a minute): wait out the window when the suite runs into it
  let r = await call("/register", { method: "POST", body: { username: u, password: "secret123" } });
  while (r.status === 429) {
    await sleep(5000);
    r = await call("/register", { method: "POST", body: { username: u, password: "secret123" } });
  }
  const { data } = r;
  const c = await call("/character", { token: data.token, method: "POST", body: { name: "T " + u.slice(2), look } });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  return { token: data.token, name: c.data.character.name };
}
const me = async (token) => (await call("/me", { token })).data;
const ok = (name) => (passed++, console.log("  ✓", name));

function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS, { headers: { origin: BASE } });
    const c = { ws, msgs: [], me: null, id: 0, closed: null, snap: null };
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === "welcome") (c.id = m.id), resolve(c);
      if (m.t === "me") c.me = m;
      if (m.t === "s") c.snap = m;
    });
    ws.on("close", (code) => (c.closed = code));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("no welcome")), 5000);
  });
}
const send = (c, o) => c.ws.send(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function walkTo(c, x, y) {
  for (let i = 0; i < 400; i++) {
    const p = c.snap?.P.find((q) => q[0] === c.id);
    if (p) {
      const dx = x - p[1], dy = y - p[2], l = Math.hypot(dx, dy);
      if (l < 6) break;
      send(c, { t: "in", dx: dx / l, dy: dy / l });
    }
    await sleep(50);
  }
  send(c, { t: "in", dx: 0, dy: 0 });
  await sleep(100);
}

console.log("Đa vũ trụ tu tiên: race checks against", BASE);
// the shop is empty until things are designed for it: a few parts go on sale for the checks, and come off at the end
const SHOP_TEST = "Hàng thử nghiệm";
{
  const { q } = await import("../server/db.js");
  await q("DELETE FROM cosmetics WHERE name LIKE ?", [SHOP_TEST + "%"]);
  for (const [kind, g, idx, price] of [["hair", "m", 0, 150], ["robe", "m", 0, 300], ["hair", "f", 0, 150], ["sword", "a", 1, 600]])
    await q("INSERT INTO cosmetics (kind, gender, idx, name, price, starter, on_sale, special, sort) VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0)", [kind, g, idx, `${SHOP_TEST} ${kind} ${g}`, price]);
  // and two bảo vật, never sold: a weapon and a flying sword
  for (const [kind, idx] of [["weapon", 90], ["sword", 3]])
    await q("INSERT INTO cosmetics (kind, gender, idx, name, price, starter, on_sale, special, sort) VALUES (?, 'a', ?, ?, 0, 0, 0, 1, 0)", [kind, idx, `${SHOP_TEST} bảo vật ${kind}`]);
}

{
  // the look is checked: bad genders and out-of-range parts are refused
  const u = "t_" + uid();
  const { data } = await call("/register", { method: "POST", body: { username: u, password: "secret123" } });
  // junk, a shop item (hair 0 is sold, not free), and a man's starter hair on a woman
  for (const look of [{ g: "x", hair: 8, robe: 16 }, { g: "m", hair: 1.5, robe: 16 }, { g: "f", hair: 24, robe: -1 }, null, { g: "m", hair: 0, robe: 16 }, { g: "f", hair: 8, robe: 2 }])
    assert.equal((await call("/character", { token: data.token, method: "POST", body: { name: "T " + u.slice(2), look } })).status, 400, JSON.stringify(look));
  const c = await call("/character", { token: data.token, method: "POST", body: { name: "T " + u.slice(2), look: { g: "f", hair: 34, robe: 21 } } });
  assert.deepEqual({ ...c.data.character.look, weapon: undefined, sword: undefined }, { g: "f", hair: 34, robe: 21, weapon: undefined, sword: undefined });
  assert.equal(c.data.character.look.sword, 0, "and the basic flying sword, for when flight opens");
  assert.ok(Number.isInteger(c.data.character.look.weapon), "and a weapon in hand");
  const w = (await call("/cosmetics", { token: data.token })).data;
  for (const [k, g] of [["hair", "m"], ["hair", "f"], ["robe", "m"], ["robe", "f"]])
    assert.equal(w.items.filter((i) => i.kind === k && i.g === g && i.starter).length, 5, `5 free ${k} for ${g}`);
  ok("creating a character: only one of the 5 free hair styles and robes of that gender, and it's saved");
}

{
  // the wardrobe: 10 buys of one robe at once charge once; a robe you can't afford, or don't own, can't be worn
  const p = await player();
  const items = (await call("/cosmetics", { token: p.token })).data.items;
  const shop = items.filter((i) => i.g === "m" && !i.starter && i.onSale).sort((a, b) => a.price - b.price);
  const cheap = shop[0], dear = shop[shop.length - 1];
  assert.equal((await call("/cosmetics/wear", { token: p.token, method: "POST", body: { id: cheap.id } })).status, 403);
  assert.equal((await call("/cosmetics/buy", { token: p.token, method: "POST", body: { id: cheap.id } })).status, 409, "20 stones is not enough");
  const her = items.find((i) => i.g === "f" && !i.starter);
  assert.equal((await call("/cosmetics/buy", { token: p.token, method: "POST", body: { id: her.id } })).status, 400, "not for this gender");
  // give them stones straight in the database (an admin's gift) and spend them in a burst
  const { q } = await import("../server/db.js");
  const [row] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [p.name]);
  await q("UPDATE characters SET stones = ? WHERE user_id = ?", [cheap.price + 5, row.id]);
  const res = await Promise.all(Array.from({ length: 10 }, () => call("/cosmetics/buy", { token: p.token, method: "POST", body: { id: cheap.id, wear: true } })));
  assert.equal(res.filter((r) => r.status === 200).length, 1);
  const m = await me(p.token);
  assert.equal(m.character.stones, 5);
  assert.equal(m.character.look[cheap.kind], cheap.idx, "worn after buying");
  // and back to a free one
  const free = items.find((i) => i.g === "m" && i.starter && i.kind === cheap.kind && i.idx !== cheap.idx);
  assert.equal((await call("/cosmetics/wear", { token: p.token, method: "POST", body: { id: free.id } })).status, 200);
  assert.equal((await me(p.token)).character.look[free.kind], free.idx);
  ok("Y Các: 10 buys at once charge once and wear it; can't wear unbought, other-gender or unaffordable items");
}

{
  const p = await player();
  const res = await Promise.all(Array.from({ length: 15 }, () => call("/daily", { token: p.token, method: "POST" })));
  assert.equal(res.filter((r) => r.status === 200).length, 1);
  assert.equal((await me(p.token)).character.stones, 20 + 30);
  ok("15 daily claims at once: exactly one goes through");
}

{
  const p = await player();
  // 50 stones, pills cost 12: at most 4 can be bought, whatever the timing
  await call("/daily", { token: p.token, method: "POST" });
  const res = await Promise.all(Array.from({ length: 12 }, () => call("/shop/buy", { token: p.token, method: "POST", body: { item: "hoixuan", qty: 1, requestId: crypto.randomUUID() } })));
  const bought = res.filter((r) => r.status === 200).length;
  const m = await me(p.token);
  assert.equal(bought, 4);
  assert.equal(m.character.stones, 50 - 12 * bought);
  assert.equal(m.inventory.hoixuan, 2 + bought);
  ok("12 purchases at once with money for 4: 4 go through, nothing goes negative");
}

{
  const p = await player();
  await call("/daily", { token: p.token, method: "POST" });
  const rid = crypto.randomUUID();
  const res = await Promise.all(Array.from({ length: 8 }, () => call("/shop/buy", { token: p.token, method: "POST", body: { item: "hoixuan", qty: 1, requestId: rid } })));
  assert.ok(res.every((r) => r.status === 200));
  const m = await me(p.token);
  assert.equal(m.character.stones, 50 - 12);
  assert.equal(m.inventory.hoixuan, 3);
  ok("the same purchase sent 8 times: charged once");
}

{
  const p = await player();
  const a = await connect(p.token);
  const b = await connect(p.token);
  await sleep(300);
  assert.ok(a.closed === 4002 || a.msgs.some((m) => m.t === "fatal"), "the first connection is replaced");
  assert.equal(b.closed, null);
  // spam a pill: the cooldown and the conditional update let exactly one through
  for (let i = 0; i < 10; i++) send(b, { t: "use", item: "hoixuan" });
  await sleep(800);
  assert.equal((await me(p.token)).inventory.hoixuan, 1);
  b.ws.close();
  ok("a second login replaces the first; 10 pill taps use one pill");
}

{
  // the game's numbers live in the database: a valid change reaches the running server (and its /api/config) in seconds,
  // a broken one is refused and the game keeps the last good numbers
  const { q } = await import("../server/db.js");
  const config = async () => (await fetch(BASE + "/api/config")).json();
  const waitFor = async (pred) => {
    for (let i = 0; i < 30; i++) {
      if (pred(await config())) return true;
      await sleep(500);
    }
    return false;
  };
  const before = (await config()).settings["daily.stones"];
  try {
    await q("UPDATE settings SET v = 45 WHERE k = 'daily.stones'");
    assert.ok(await waitFor((c) => c.settings["daily.stones"] === 45), "the new gift size reached the server");
    const p = await player();
    assert.equal((await call("/daily", { token: p.token, method: "POST" })).data.character.stones, 20 + 45);
    // a negative max hp is nonsense: refused, the numbers stay as they were
    await q("UPDATE settings SET v = -1 WHERE k = 'class.hp'");
    await sleep(11_000);
    assert.equal((await config()).settings["class.hp"], 1000, "a broken edit is not applied");
  } finally {
    await q("UPDATE settings SET v = 1000 WHERE k = 'class.hp'");
    await q("UPDATE settings SET v = ? WHERE k = 'daily.stones'", [before]);
  }
  assert.ok(await waitFor((c) => c.settings["daily.stones"] === before && c.settings["class.hp"] === 1000));
  ok("settings in the database: a good change applies live, a broken one is refused");
}

{
  // the admin site: its own port, its own accounts; a first login must change the password; bad numbers are refused; a ban
  // locks the player out at once
  const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
  const { q } = await import("../server/db.js");
  const { hashPassword } = await import("../server/auth.js");
  const name = "t_adm_" + uid(), pw = "tamthoi123";
  await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 1)", [name, await hashPassword(pw)]);
  const adm = async (path, { token, method = "GET", body } = {}) => {
    const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  try {
    assert.equal((await adm("/login", { method: "POST", body: { username: name, password: "sai" } })).status, 401);
    const { data } = await adm("/login", { method: "POST", body: { username: name, password: pw } });
    assert.equal(data.mustChange, true);
    const token = data.token;
    assert.equal((await adm("/overview", { token })).status, 403, "nothing before the password is changed");
    assert.equal((await adm("/me/password", { token, method: "POST", body: { old: pw, password: "MatKhauMoi#9" } })).status, 200);
    assert.equal((await adm("/overview", { token })).status, 200);
    assert.equal((await adm("/overview")).status, 401, "no token, no admin");
    // a realm with no stages would break levels: refused, nothing saved
    const realms = (await adm("/t/realms", { token })).data;
    assert.equal((await adm(`/t/realms/${realms[0].id}`, { token, method: "PATCH", body: { stages: 0 } })).status, 400);
    assert.equal((await adm("/t/realms", { token })).data[0].stages, realms[0].stages);
    // ban a player: their login and their session stop working
    const p = await player();
    const [u] = await q("SELECT u.id, u.username FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [p.name]);
    assert.equal((await adm(`/players/${u.id}/adjust`, { token, method: "POST", body: { field: "stones", op: "set", value: 777 } })).status, 200);
    assert.equal((await me(p.token)).character.stones, 777);
    // a house renamed and repriced by the admin: the game has it at once; back as it was
    const hb = (await adm("/t/houses", { token })).data.find((h) => h.house_key === "gamer");
    assert.equal((await adm("/t/houses/gamer", { token, method: "PATCH", body: { name: "Nhà Thử Nghiệm", price: 1234 } })).status, 200, "a house renamed");
    const hc = (await call("/config")).data.houses.find((h) => h.key === "gamer");
    assert.ok(hc.name === "Nhà Thử Nghiệm" && hc.price === 1234, "the game has the new name and price");
    assert.equal((await adm("/t/houses/gamer", { token, method: "PATCH", body: { name: "x".repeat(41) } })).status, 400, "a name too long is refused");
    await adm("/t/houses/gamer", { token, method: "PATCH", body: { name: hb.name, price: hb.price } });
    // a house given by the admin: the Gia Viên unlocked for nothing if need be, given once, taken back once
    const house = (give, h = "gamer") => adm(`/players/${u.id}/houses`, { token, method: "POST", body: { house: h, give } });
    assert.equal((await house(true)).status, 200, "a house given");
    assert.equal(Number((await q("SELECT COUNT(*) AS n FROM homes WHERE user_id = ?", [u.id]))[0].n), 1, "its Gia Viên unlocked for nothing");
    assert.equal(Number((await q("SELECT paid FROM home_houses WHERE user_id = ? AND house = 'gamer'", [u.id]))[0].paid), 0, "given, not paid");
    assert.equal((await house(true)).status, 409, "not given twice");
    assert.equal((await house(true, "kim_lau")).status, 400, "no such house");
    assert.equal((await house(true, "co_trach")).status, 400, "the default one isn't given");
    assert.equal((await adm(`/players/${u.id}`, { token })).data.home.owned.length, 1, "shown in the player's page");
    assert.equal((await house(false)).status, 200, "taken back");
    assert.equal((await house(false)).status, 409, "not taken twice");

    // the player is online and everything happens at once: 20 admin top-ups, 10 admin deductions, 3 purchases, the
    // daily gift, a buff, and the world's own saves. Every stone must be accounted for, in the database and on screen.
    const q2 = await player(), [u2] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [q2.name]);
    const c2 = await connect(q2.token);
    await sleep(300);
    await adm(`/players/${u2.id}/adjust`, { token, method: "POST", body: { field: "stones", op: "add", value: 100 } });
    await Promise.all([
      ...Array.from({ length: 20 }, () => adm(`/players/${u2.id}/adjust`, { token, method: "POST", body: { field: "stones", op: "add", value: 5 } })),
      ...Array.from({ length: 10 }, () => adm(`/players/${u2.id}/adjust`, { token, method: "POST", body: { field: "stones", op: "sub", value: 3 } })),
      ...Array.from({ length: 3 }, () => call("/shop/buy", { token: q2.token, method: "POST", body: { item: "hoixuan", qty: 1, requestId: crypto.randomUUID() } })),
      call("/daily", { token: q2.token, method: "POST" }),
      adm(`/players/${u2.id}/buffs`, { token, method: "POST", body: { stat: "atk", pct: 50, hours: 1, note: "thử" } }),
    ]);
    await sleep(600);
    const want = 20 + 100 + 20 * 5 - 10 * 3 - 3 * 12 + 30;
    assert.equal((await me(q2.token)).character.stones, want, "the database adds up");
    assert.equal(c2.me.stones, want, "and so does what the online player sees");
    const d2 = (await adm(`/players/${u2.id}`, { token })).data;
    assert.equal(d2.live.atk, Math.round(60 * 1.5), "the +50% attack buff is live");
    assert.ok(c2.me.buffs.some((b) => b.stat === "atk" && b.pct === 50), "and shown to the player");
    c2.ws.close();

    // bảo vật: not in the wardrobe, can't be bought or worn; given by an admin, it shows up and is worn
    const gem = (await adm("/t/cosmetics", { token })).data.find((c) => c.special && c.kind === "weapon" && c.idx === 90);
    assert.ok(gem, "the test bảo vật weapon is there");
    const before = (await call("/cosmetics", { token: q2.token })).data;
    assert.ok(!before.items.some((it) => it.id === gem.id), "a bảo vật nobody gave you isn't on the shelf");
    assert.equal((await call("/cosmetics/buy", { token: q2.token, method: "POST", body: { id: gem.id } })).status, 403, "and can't be bought");
    assert.equal((await call("/cosmetics/wear", { token: q2.token, method: "POST", body: { id: gem.id } })).status, 403, "or worn");
    assert.equal((await adm(`/players/${u2.id}/cosmetics`, { token, method: "POST", body: { id: gem.id, own: true } })).status, 200);
    const after = (await call("/cosmetics", { token: q2.token })).data;
    const mineGem = after.items.find((it) => it.id === gem.id);
    assert.ok(mineGem?.special && !mineGem.onSale && after.owned.includes(gem.id), "given: it is theirs, marked special");
    assert.equal((await call("/cosmetics/wear", { token: q2.token, method: "POST", body: { id: gem.id } })).data.character.look.weapon, 90, "and in their hand");

    // công pháp: learning spends every required item exactly once, even when the same learn (or two arts that need the
    // same essence) arrive together; the bar holds only known arts, none twice; a monster's drop lands in the bag
    {
      const { CONG_PHAP_BY_KEY: CP } = await import("../shared/cong-phap.js");
      const give = async (uid, reqs) => { for (const r of reqs) await adm(`/players/${uid}/items`, { token, method: "POST", body: { item: r.item, op: "add", value: r.qty } }); };
      const P = await player(), [pu] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [P.name]);
      const m0 = await me(P.token);
      assert.deepEqual(m0.character.slots, ["phikiem", "loian", null, null, null], "a fresh bar: the two arts everyone knows");
      assert.equal((await call("/arts/learn", { token: P.token, method: "POST", body: { key: "tam_tuyet_kiem" } })).status, 409, "nothing in the bag: refused");
      await give(pu.id, CP.tam_tuyet_kiem.reqs);
      const tries = await Promise.all(Array.from({ length: 6 }, () => call("/arts/learn", { token: P.token, method: "POST", body: { key: "tam_tuyet_kiem" } })));
      assert.equal(tries.filter((x) => x.status === 200).length, 1, "six learns at once: one goes through");
      const after = await me(P.token);
      assert.ok(after.character.learned.includes("tam_tuyet_kiem") && after.character.slots[2] === "tam_tuyet_kiem", "learned, and on the first empty slot");
      for (const r of CP.tam_tuyet_kiem.reqs) assert.equal(after.inventory[r.item] ?? 0, 0, `${r.item} spent once`);
      // two other arts and a repeat of one, all at once: each learned once, every item (Linh Tủy both need) spent exactly once
      await give(pu.id, [...CP.dia_chan_cuoc.reqs, ...CP.luu_tinh_hoa_vu.reqs]);
      const two = await Promise.all(["dia_chan_cuoc", "luu_tinh_hoa_vu", "dia_chan_cuoc"].map((key) => call("/arts/learn", { token: P.token, method: "POST", body: { key } })));
      assert.equal(two.filter((x) => x.status === 200).length, 2, "two arts, once each; the repeat is refused");
      const inv2 = (await me(P.token)).inventory;
      assert.ok(!inv2.mat_tho && !inv2.mat_hoa && !inv2.mat_linhtuy, "every essence spent exactly once");
      // the bar: unknown arts and the same art twice are refused; a good bar is live in the world at once
      const eq = (slots) => call("/arts/equip", { token: P.token, method: "POST", body: { slots } });
      assert.equal((await eq(["nuke", null, null, null, null])).status, 400);
      assert.equal((await eq(["diet_the_than_bao", null, null, null, null])).status, 403, "not learned");
      assert.equal((await eq(["tam_tuyet_kiem", "tam_tuyet_kiem", null, null, null])).status, 400, "not twice");
      const c3 = await connect(P.token);
      await sleep(300);
      assert.equal((await eq(["tam_tuyet_kiem", "phikiem", null, "luu_tinh_hoa_vu", null])).status, 200);
      await sleep(200);
      assert.deepEqual(c3.msgs.filter((m) => m.t === "arts").pop().slots, ["tam_tuyet_kiem", "phikiem", null, "luu_tinh_hoa_vu", null], "the online player's bar changed");
      send(c3, { t: "cast", s: 1, ax: 1, ay: 0 });
      send(c3, { t: "cast", s: 3, ax: 1, ay: 0 }); // an empty slot does nothing
      await sleep(300);
      const casts = c3.msgs.filter((m) => m.t === "s").flatMap((m) => m.E).filter((e) => e.e === "cast" && e.id === c3.id);
      assert.deepEqual(casts.map((e) => e.a), ["tam_tuyet_kiem"], "slot 1 casts Tam Tuyệt Kiếm; the empty slot nothing");
      assert.ok(c3.me.cd[1] > 1, "and its cooldown runs");
      // an admin takes it back: it leaves the bar too
      await adm(`/players/${pu.id}/arts`, { token, method: "POST", body: { key: "tam_tuyet_kiem", learn: false } });
      assert.equal((await me(P.token)).character.slots[0], null);
      // an admin can only switch an art: its numbers are in code
      assert.equal((await adm("/t/cong_phap/diet_the_than_bao", { token, method: "PATCH", body: { cd: 1 } })).status, 400, "no numbers to edit");
      assert.equal((await adm("/t/cong_phap", { token, method: "POST", body: { art_key: "moi", enabled: true } })).status, 400, "no new arts from the admin site");
      // switched to "only given": learning it is refused even with every item in the bag; the admin hands it out by
      // đạo hiệu (twice at once: one row), and the player online has it straight away
      assert.equal((await adm("/t/cong_phap/diet_the_than_bao", { token, method: "PATCH", body: { learnable: false } })).status, 200);
      try {
        await give(pu.id, CP.diet_the_than_bao.reqs);
        assert.equal((await call("/arts/learn", { token: P.token, method: "POST", body: { key: "diet_the_than_bao" } })).status, 403, "event-only: can't be learned");
        const g = await Promise.all([1, 2].map(() => adm("/arts/diet_the_than_bao/grant", { token, method: "POST", body: { to: "names", names: P.name } })));
        assert.ok(g.every((x) => x.status === 200), "given by đạo hiệu");
        await sleep(200);
        assert.ok(c3.msgs.filter((m) => m.t === "arts").pop().learned.includes("diet_the_than_bao"), "the online player has it at once");
        assert.equal(Number((await q("SELECT COUNT(*) AS n FROM learned_arts WHERE user_id = ? AND art_key = 'diet_the_than_bao'", [pu.id]))[0].n), 1, "one row");
        assert.equal((await me(P.token)).inventory.bk_diet_the_than_bao, 1, "and its items were not spent");
      } finally {
        await adm("/t/cong_phap/diet_the_than_bao", { token, method: "PATCH", body: { learnable: true } });
      }
      // arts are never sold
      const B = await player(), [bu] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [B.name]);
      assert.equal((await call("/arts/buy", { token: B.token, method: "POST", body: { key: "tam_tuyet_kiem" } })).status, 404, "no buying");
      assert.equal((await adm("/t/cong_phap/tam_tuyet_kiem", { token, method: "PATCH", body: { on_sale: true } })).status, 400, "nothing to put on sale");
      // what learning spends is the admin's: Địa Chấn Cước with 2 Hậu Thổ Tinh instead of 6 is learned with 2; a starter
      // art can't be given a cost; an item an art needs can't be deleted
      const tho = (await adm("/t/cong_phap_reqs", { token })).data.find((r) => r.art_key === "dia_chan_cuoc" && r.item_key === "mat_tho");
      await give(bu.id, [{ item: "bk_dia_chan_cuoc", qty: 1 }, { item: "mat_tho", qty: 2 }, { item: "mat_linhtuy", qty: 1 }]);
      assert.equal((await call("/arts/learn", { token: B.token, method: "POST", body: { key: "dia_chan_cuoc" } })).status, 409, "6 needed, 2 in the bag");
      assert.equal((await adm(`/t/cong_phap_reqs/${tho.id}`, { token, method: "PATCH", body: { qty: 2 } })).status, 200);
      try {
        assert.equal((await call("/arts/learn", { token: B.token, method: "POST", body: { key: "dia_chan_cuoc" } })).status, 200, "the admin's 2 is enough");
        assert.ok(!(await me(B.token)).inventory.mat_tho, "and 2 were spent");
      } finally {
        await adm(`/t/cong_phap_reqs/${tho.id}`, { token, method: "PATCH", body: { qty: tho.qty } });
      }
      assert.equal((await adm("/t/cong_phap_reqs", { token, method: "POST", body: { art_key: "phikiem", item_key: "mat_kim", qty: 1 } })).status, 400, "known by all: no cost");
      assert.equal((await adm("/t/items/bk_dia_chan_cuoc", { token, method: "DELETE" })).status, 400, "a bí kíp in use stays");

      // drops: a dummy set to always drop two Huyền Thiết Tinh; break it and they are in the bag
      const row = (await adm("/t/monster_drops", { token, method: "POST", body: { monster: "dummy", item_key: "mat_kim", chance: 1, min_qty: 2, max_qty: 2 } })).data;
      await adm("/t/monsters/dummy", { token, method: "PATCH", body: { drop_rate: 1 } });
      try {
        const d = c3.snap.M.find((m) => m[1] === "dummy");
        for (let i = 0; i < 120; i++) {
          const pos = c3.snap.P.find((x) => x[0] === c3.id), dx = d[2] + 30 - pos[1];
          if (Math.abs(dx) < 6) break;
          send(c3, { t: "in", dx: Math.sign(dx), jump: false, down: false });
          await sleep(50);
        }
        send(c3, { t: "in", dx: 0, jump: false, down: false });
        for (let i = 0; i < 60 && !c3.msgs.some((m) => m.t === "drop"); i++) {
          send(c3, { t: "cast", s: 0, ax: -1, ay: 0 });
          await sleep(650);
        }
        await sleep(300);
        assert.deepEqual(c3.msgs.find((m) => m.t === "drop")?.items, { mat_kim: 2 }, "the drop is announced");
        assert.equal((await me(P.token)).inventory.mat_kim, 2, "and in the bag");
      } finally {
        await adm(`/t/monster_drops/${row.id}`, { token, method: "DELETE" });
        await adm("/t/monsters/dummy", { token, method: "PATCH", body: { drop_rate: 0 } });
      }

      // pixelfx's monsters, dropped by the player to try (no map has them yet): a bat rushes in and bites, an eyeball keeps
      // its distance and shoots; killed, one drops exactly one item from its own list
      assert.ok((await adm("/t/monsters", { token })).data.length >= 13, "all of pixelfx's critters are in");
      await adm(`/players/${pu.id}/live`, { token, method: "POST", body: { action: "heal" } });
      const hp0 = c3.me.hp;
      for (const type of ["bat", "eyeball"]) assert.equal((await adm(`/players/${pu.id}/summon`, { token, method: "POST", body: { type } })).status, 200);
      let shot = false, bit = false;
      for (let i = 0; i < 80 && !(shot && bit); i++) {
        await sleep(100);
        const s = c3.snap;
        shot ||= s.B.some((b) => b[6] === "@eyeball");
        const bat = s.M.find((m) => m[1] === "bat");
        bit ||= !!bat && (bat[6] & 128) > 0;
      }
      assert.ok(shot, "the eyeball shoots");
      assert.ok(bit, "the bat strikes");
      await sleep(300);
      assert.ok(c3.me.hp < hp0, `and the player is hurt (${hp0} -> ${c3.me.hp})`);
      // a monster that always drops, from a list of two: break it, one of the two, once
      await adm("/t/monsters", { token, method: "POST", body: { type: "t_box", name: "Hộp thử", style: "none", fx: "", hp: 1, atk: 0, def: 0, spd: 0, respawn: 60, aggro: 0, reach: 0, shot_range: 0, shot_speed: 0, cooldown: 0, mult: 0, exp_base: 0, exp_per_level: 0, stones: 0, drop_rate: 1, common_drops: 0 } });
      try {
        await adm("/t/monster_drops", { token, method: "POST", body: { monster: "t_box", item_key: "mat_thuy", chance: 1, min_qty: 1, max_qty: 1 } });
        await adm("/t/monster_drops", { token, method: "POST", body: { monster: "t_box", item_key: "mat_bang", chance: 1, min_qty: 1, max_qty: 1 } });
        await sleep(200);
        const before = (await me(P.token)).inventory, drops0 = c3.msgs.filter((m) => m.t === "drop").length;
        await adm(`/players/${pu.id}/summon`, { token, method: "POST", body: { type: "t_box" } });
        await sleep(300);
        const box = c3.snap.M.find((m) => m[1] === "t_box"), pos = c3.snap.P.find((x) => x[0] === c3.id);
        for (let i = 0; i < 100; i++) {
          const me2 = c3.snap.P.find((x) => x[0] === c3.id), dx = box[2] - Math.sign(box[2] - pos[1]) * 30 - me2[1];
          if (Math.abs(dx) < 6) break;
          send(c3, { t: "in", dx: Math.sign(dx), jump: false, down: false });
          await sleep(50);
        }
        send(c3, { t: "in", dx: 0, jump: false, down: false });
        for (let i = 0; i < 20 && c3.msgs.filter((m) => m.t === "drop").length === drops0; i++) {
          send(c3, { t: "cast", s: 0, ax: Math.sign(box[2] - pos[1]) || 1, ay: 0 });
          await sleep(650);
        }
        await sleep(300);
        const got = c3.msgs.filter((m) => m.t === "drop").slice(drops0);
        assert.equal(got.length, 1, "one drop");
        assert.equal(Object.keys(got[0].items).length, 1, "of exactly one item");
        const after = (await me(P.token)).inventory;
        assert.equal((after.mat_thuy ?? 0) + (after.mat_bang ?? 0) - (before.mat_thuy ?? 0) - (before.mat_bang ?? 0), 1, "and it is in the bag");
      } finally {
        await adm("/t/monsters/t_box", { token, method: "DELETE" });
        c3.ws.close();
      }
    }

    assert.equal((await adm(`/players/${u.id}/ban`, { token, method: "POST", body: { banned: true, reason: "thử" } })).status, 200);
    assert.equal((await call("/me", { token: p.token })).status, 401);
    assert.equal((await call("/login", { method: "POST", body: { username: u.username, password: "secret123" } })).status, 403);
  } finally {
    await q("DELETE FROM admins WHERE username = ?", [name]);
  }
  ok("admin site: forced password change, bad numbers refused, an online player's stones add up under concurrent edits, buffs, bảo vật gifts, công pháp (learn once, 5-slot bar, event-only arts, drops), monsters (melee, ranged, one weighted drop) and bans take effect");
}

{
  // the two straw dummies by the market: a cut lands, shows its damage, and leaves the dummy standing with less hp
  const { mapInfo, START_MAP } = await import("../shared/maps/index.js");
  const M = mapInfo(START_MAP);
  assert.equal(M.mobs.filter((m) => m.type === "dummy").length, 2);
  const P = await player(), c = await connect(P.token);
  await sleep(300);
  // a standing one (the công pháp check may just have broken the other)
  const d = c.snap.M.find((m) => m[1] === "dummy" && !(m[6] & 1));
  // walk to just right of the dummy, face it and cut
  for (let i = 0; i < 80; i++) {
    const me = c.snap.P.find((q) => q[0] === c.id), dx = d[2] + 30 - me[1];
    if (Math.abs(dx) < 6) break;
    send(c, { t: "in", dx: Math.sign(dx), jump: false, down: false });
    await sleep(50);
  }
  send(c, { t: "in", dx: 0, jump: false, down: false });
  await sleep(200);
  send(c, { t: "cast", s: 0, ax: -1, ay: 0 });
  await sleep(400);
  const hit = c.msgs.filter((m) => m.t === "s").flatMap((m) => m.E).find((e) => e.e === "hit" && e.id === d[0]);
  assert.ok(hit && hit.d > 0, "the cut hit the dummy for some damage");
  const after = c.snap.M.find((m) => m[0] === d[0]);
  assert.ok(after[5] < 1000 && !(after[6] & 1), "the dummy lost hp and still stands");
  c.ws.close();
  ok(`two straw dummies by the market: a cut deals ${hit.d} damage`);
}

{
  // a jump tap shorter than a server tick (pressed and let go in the same instant) still jumps
  const P = await player(), c = await connect(P.token);
  await sleep(600);
  send(c, { t: "in", dx: 0, jump: true, down: false });
  send(c, { t: "in", dx: 0, jump: false, down: false });
  let air = false;
  for (let i = 0; i < 20 && !air; i++) {
    await sleep(50);
    air = !!(c.snap?.P.find((q) => q[0] === c.id)?.[5] & 128);
  }
  c.ws.close();
  assert.ok(air, "the tap made a jump");
  ok("a jump tapped between two server ticks is not lost");
}

{
  // the starter town, side view: walls hold, jumps clear them, and the way out at the foot of the east stairs answers
  const { mapInfo, START_MAP } = await import("../shared/maps/index.js");
  const { fits } = await import("../shared/physics.js");
  const M = mapInfo(START_MAP), P = await player({ g: "f", hair: 24, robe: 2 }), c = await connect(P.token);
  const at = () => c.snap?.P.find((q) => q[0] === c.id);
  await sleep(300);
  const start = at();
  // west for 6 s without jumping: the temple terrace's stone step stops you, standing on the ground
  send(c, { t: "in", dx: -1, jump: false, down: false });
  await sleep(6000);
  send(c, { t: "in", dx: 0, jump: false, down: false });
  await sleep(300);
  let p = at();
  assert.ok(p[1] > 49 * M.T && p[1] < start[1], `stopped at the terrace step (x ${p[1]})`);
  assert.equal(p[2], 15 * M.T, "still on the ground");
  assert.ok(fits(p[1], p[2], M), "not inside a wall");
  ok("walking into the terrace step: stopped by it, standing on the ground");
  // now jump while walking: up onto the terrace
  send(c, { t: "in", dx: -1, jump: true, down: false });
  await sleep(1200);
  send(c, { t: "in", dx: 0, jump: false, down: false });
  await sleep(900);
  p = at();
  assert.equal(p[2], 13 * M.T, `up on the terrace (y ${p[2]})`);
  ok("jumping: up onto the temple terrace, two tiles high");
  // east, hopping over the hill, down the stairs to the gold arrow
  send(c, { t: "in", dx: 1, jump: true, down: false });
  let msg = null;
  for (let i = 0; i < 400 && !msg; i++) {
    await sleep(100);
    msg = c.msgs.filter((m) => m.t === "welcome")[1];
  }
  send(c, { t: "in", dx: 0, jump: false, down: false });
  // through the gate: a new welcome, on the forest map, just inside its gate back to the town; monsters there
  const w2 = c.msgs.filter((m) => m.t === "welcome")[1];
  assert.ok(w2 && w2.map === "bichlac", "the gate leads to Bích Lạc Lâm");
  await sleep(400);
  const F = (await import("../shared/maps/index.js")).mapInfo("bichlac");
  p = c.snap.P.find((q) => q[0] === w2.id);
  assert.ok(p && p[1] > F.portals[0].x && !F.portalAt(p[1], p[2]), `arrived beside the gate home, not on it (x ${p?.[1]})`);
  assert.ok(new Set(c.snap.M.map((m) => m[1])).size >= 4, "the forest's frogs, snakes, birds and butterflies are there");
  c.ws.close();
  await sleep(500);
  // log in again: back in the forest, where they left
  const c2 = await connect(P.token);
  assert.equal(c2.msgs.find((m) => m.t === "welcome").map, "bichlac", "the map is remembered");
  c2.ws.close();
  ok("the gold arrow at the foot of the east stairs leads to Bích Lạc Lâm, its monsters there, the map remembered");
}

// ngự kiếm phi hành: locked below the realm; then on the sword, up, down to a hover over the ground, off and falling;
// flying swords are sold only to those who can fly, and the bảo vật ones never
{
  const { q } = await import("../server/db.js");
  const bal = await import("../shared/balance.js");
  bal.applyConfig((await call("/config")).data);
  const P = await player();
  const [row] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [P.name]);
  const w = (await call("/cosmetics", { token: P.token })).data;
  const sale = w.items.find((i) => i.kind === "sword" && i.onSale && !i.starter), basic = w.items.find((i) => i.kind === "sword" && i.starter);
  assert.ok(sale && basic, "flying swords in the wardrobe: one free, others on sale");
  assert.ok(!w.items.some((i) => i.kind === "sword" && i.special), "bảo vật swords are not shown to those who don't own them");
  await q("UPDATE characters SET stones = ? WHERE user_id = ?", [sale.price + 5, row.id]);
  let r = await call("/cosmetics/buy", { token: P.token, method: "POST", body: { id: sale.id } });
  assert.equal(r.status, 403, "no flying sword before flight opens");
  let c = await connect(P.token);
  await sleep(300);
  send(c, { t: "fly", on: true });
  await sleep(400);
  const me0 = () => c.snap.P.find((x) => x[0] === c.id);
  assert.ok(!(me0()[5] & 256) && c.msgs.some((m) => m.t === "toast" && /mới ngự kiếm/.test(m.m)), "below the realm: refused, and told when");
  c.ws.close();
  await q("UPDATE characters SET exp = ? WHERE user_id = ?", [bal.expForLevel(bal.FLY.level), row.id]);
  c = await connect(P.token);
  await sleep(400);
  const ground = me0()[2];
  send(c, { t: "fly", on: true });
  send(c, { t: "in", dx: 0, dy: -1, jump: false, down: false });
  await sleep(700);
  send(c, { t: "in", dx: 0, dy: 0, jump: false, down: false });
  // the sword glides to a stop
  await sleep(1000);
  let p = me0();
  assert.ok(p[5] & 256, "on the sword");
  assert.ok(p[2] < ground - 80, `flew up (y ${ground} -> ${p[2]})`);
  await sleep(500);
  assert.ok(Math.abs(me0()[2] - p[2]) < 4, "and hovers there, no gravity");
  send(c, { t: "in", dx: 0, dy: 1, jump: false, down: false });
  await sleep(2000);
  send(c, { t: "in", dx: 0, dy: 0, jump: false, down: false });
  await sleep(200);
  p = me0();
  assert.ok(p[2] < ground && p[2] >= ground - 12, `down to a hover just over the ground (y ${p[2]}, ground ${ground})`);
  send(c, { t: "in", dx: 0, dy: -1, jump: false, down: false });
  await sleep(500);
  send(c, { t: "in", dx: 0, dy: 0, jump: false, down: false });
  send(c, { t: "fly", on: false });
  await sleep(1500);
  p = me0();
  assert.ok(!(p[5] & 256) && p[2] === ground, `off the sword: fell back to the ground (y ${p[2]})`);
  ok("ngự kiếm: locked below the realm; flies up, hovers, stops over the ground, falls when off");
  r = await call("/cosmetics/buy", { token: P.token, method: "POST", body: { id: sale.id, wear: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.character.look.sword, sale.idx, "riding the new sword");
  const [special] = await q("SELECT id FROM cosmetics WHERE kind = 'sword' AND special = 1 LIMIT 1");
  r = await call("/cosmetics/buy", { token: P.token, method: "POST", body: { id: special.id } });
  assert.equal(r.status, 403, "a bảo vật sword is never sold");
  r = await call("/cosmetics/wear", { token: P.token, method: "POST", body: { id: special.id } });
  assert.equal(r.status, 403, "nor ridden without being given");
  await sleep(300);
  assert.ok(c.msgs.some((m) => m.t === "pi" && m.look?.sword === sale.idx), "everyone sees the new sword");
  c.ws.close();
  ok("phi kiếm: bought once flight opens and ridden at once; bảo vật swords never sold or ridden ungiven");
}

// the arts are the six designed in code; every effect they draw is in the game's own public/hieu-ung, nothing else of pixelfx
{
  const { CONG_PHAP } = await import("../shared/cong-phap.js");
  const arts = (await call("/config")).data.arts;
  assert.deepEqual(arts.map((a) => a.key).sort(), CONG_PHAP.map((a) => a.key).sort(), "the switches cover exactly the arts in code");
  assert.deepEqual(CONG_PHAP.map((a) => a.key), ["phikiem", "loian", "dia_chan_cuoc", "tam_tuyet_kiem", "luu_tinh_hoa_vu", "diet_the_than_bao"]);
  const list = await (await fetch(BASE + "/hieu-ung/danh-sach.json")).json();
  for (const a of CONG_PHAP) for (const fx of [...a.fx, a.icon].filter(Boolean)) assert.ok(list.includes(fx), `${fx} is in public/hieu-ung`);
  for (const fx of ["moves/pistol-shots", "weather/rain", "fire/candle", "ice/ice-lance"]) assert.ok(!list.includes(fx), `${fx} is not copied`);
  assert.equal((await fetch(BASE + "/pixelfx/core/index.js")).status, 404, "pixelfx itself isn't served");
  ok(`the ${CONG_PHAP.length} arts designed in code; their effects, and only what the game uses, in public/hieu-ung`);
}

// each art fights its own way, tried on the straw dummies: Phi Kiếm cuts on the way out and on the way back; Lôi Ấn Trận
// lands where it is dragged (never beyond its reach) and strikes three times; Địa Chấn Cước runs a line of spikes along
// the ground; Tam Tuyệt Kiếm plants the caster and cuts four times; Lưu Tinh Hỏa Vũ drops six meteors round the spot;
// Diệt Thế Thần Bạo plants the caster, then goes off 1.6 s later
{
  const { q } = await import("../server/db.js");
  const bal = await import("../shared/balance.js");
  bal.applyConfig((await call("/config")).data);
  const P = await player();
  const [row] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [P.name]);
  const KEYS = ["dia_chan_cuoc", "tam_tuyet_kiem", "luu_tinh_hoa_vu", "diet_the_than_bao"];
  for (const k of KEYS) await q("INSERT INTO learned_arts (user_id, art_key) VALUES (?, ?)", [row.id, k]);
  const c = await connect(P.token);
  await sleep(400);
  const events = () => c.msgs.filter((m) => m.t === "s").flatMap((m) => m.E);
  const at = () => c.snap.P.find((x) => x[0] === c.id);
  const bar = async (slots) => assert.equal((await call("/arts/equip", { token: P.token, method: "POST", body: { slots } })).status, 200);
  // stand `gap` px left of a standing dummy, facing it
  let d = c.snap.M.find((m) => m[1] === "dummy" && !(m[6] & 1)), p;
  const stand = async (gap) => {
    d = c.snap.M.find((m) => m[0] === d[0]);
    for (let i = 0; i < 160; i++) {
      p = at();
      const dx = d[2] - gap - p[1];
      if (Math.abs(dx) < 6) break;
      send(c, { t: "in", dx: Math.sign(dx), jump: false, down: false });
      await sleep(50);
    }
    send(c, { t: "in", dx: 0, jump: false, down: false });
    await sleep(300);
    p = at();
  };
  await stand(120);
  const castAndWatch = async (slot, extra, ms) => {
    const n0 = events().length;
    send(c, { t: "cast", s: slot, ax: 1, ay: 0, ...extra });
    await sleep(ms);
    return events().slice(n0);
  };
  const hits = (ev) => ev.filter((e) => e.e === "hit" && e.by === c.id && e.id === d[0]).length;

  // Phi Kiếm (slot 1): out through the dummy, back through it again
  let ev = await castAndWatch(1, {}, 1400);
  assert.equal(hits(ev), 2, `Phi Kiếm: a cut out and a cut back (${hits(ev)})`);
  // Lôi Ấn Trận (slot 2): dragged far up and away, it lands at its reach; on the dummy, three strikes
  ev = await castAndWatch(2, { tx: p[1] + 2000, ty: p[2] - 900 }, 300);
  const seal = ev.find((e) => e.e === "art" && e.a === "loian" && e.ph === "seal");
  const d1 = Math.hypot(seal.x - p[1], seal.y - (p[2] - 30));
  assert.ok(d1 <= bal.ARTS.loian.aim + 2 && d1 > bal.ARTS.loian.aim - 40, `Lôi Ấn Trận: at its reach, not where asked (${Math.round(d1)} px)`);
  await sleep(bal.ARTS.loian.cd * 1000);
  ev = await castAndWatch(2, { tx: d[2], ty: d[3] - 20 }, 1700);
  const seal2 = ev.find((e) => e.e === "art" && e.a === "loian");
  assert.ok(seal2 && Math.abs(seal2.x - d[2]) < 4 && Math.abs(seal2.y - d[3]) < 4, `Lôi Ấn Trận: on the dummy, on the ground (${seal2?.x},${seal2?.y} vs ${d[2]},${d[3]})`);
  assert.equal(hits(ev), 3, "and three strikes");

  // the four others on slots 1, 3, 4, 5
  await bar(["tam_tuyet_kiem", "loian", "dia_chan_cuoc", "luu_tinh_hoa_vu", "diet_the_than_bao"]);
  await sleep(300);
  // Tam Tuyệt Kiếm, up close: four cuts (the second form cuts twice), planted while it lasts
  await stand(45);
  const x0 = at()[1];
  const n0 = events().length;
  send(c, { t: "cast", s: 1, ax: 1, ay: 0 });
  await sleep(400);
  assert.ok(at()[5] & 512, "Tam Tuyệt Kiếm: planted");
  // the key held back while planted moves nothing
  send(c, { t: "in", dx: -1, jump: false, down: false });
  await sleep(850);
  send(c, { t: "in", dx: 0, jump: false, down: false });
  await sleep(450);
  ev = events().slice(n0);
  assert.equal(hits(ev), 4, `Tam Tuyệt Kiếm: four cuts (${hits(ev)})`);
  assert.ok(at()[1] >= x0, "it stepped forward, not back with the key held");
  // Địa Chấn Cước: spikes one after another along the ground, a stride apart, and the dummy hit once
  await stand(120);
  ev = await castAndWatch(3, {}, 1400);
  const spikes = ev.filter((e) => e.e === "art" && e.a === "dia_chan_cuoc" && e.ph === "spike");
  assert.ok(spikes.length >= 2 && spikes.length <= 5 && spikes.every((s, i) => !i || s.x - spikes[i - 1].x === 46), `Địa Chấn Cước: a line of spikes (${spikes.map((s) => s.x).join(",")})`);
  assert.equal(hits(ev), 1, "the dummy thrown once");
  // Lưu Tinh Hỏa Vũ: six meteors round the spot over two seconds
  d = c.snap.M.find((m) => m[0] === d[0]);
  ev = await castAndWatch(4, { tx: d[2], ty: d[3] - 20 }, 2400);
  const met = ev.filter((e) => e.e === "art" && e.a === "luu_tinh_hoa_vu");
  assert.equal(met.length, 6, "Lưu Tinh Hỏa Vũ: six meteors");
  assert.ok(met.every((m) => Math.abs(m.x - d[2]) <= 110), "all round the spot");
  assert.ok(hits(ev) >= 2, "and some fall on the dummy");
  // Diệt Thế Thần Bạo: planted, the blast 1.6 s later, ahead of the caster
  await sleep(300);
  const n5 = events().length;
  send(c, { t: "cast", s: 5, ax: 1, ay: 0 });
  await sleep(500);
  assert.ok(at()[5] & 512, "Diệt Thế Thần Bạo: planted while it gathers");
  assert.ok(!events().slice(n5).some((e) => e.ph === "boom"), "not yet");
  await sleep(1500);
  ev = events().slice(n5);
  const boom = ev.find((e) => e.e === "art" && e.a === "diet_the_than_bao" && e.ph === "boom");
  assert.ok(boom && boom.x > at()[1], "then the blast, ahead");
  // (the first dummy may lie broken by the meteors: any straw dummy will do)
  const dummies = new Set(c.snap.M.filter((m) => m[1] === "dummy").map((m) => m[0]));
  assert.ok(ev.some((e) => e.e === "hit" && e.by === c.id && dummies.has(e.id) && e.d > 50), "a dummy caught in it");
  assert.ok(c.me.cd[5] > 30, "and a long wait before the next");
  c.ws.close();
  ok("each art its own way: Phi Kiếm comes back, Lôi Ấn Trận strikes three times where dragged, spikes run along the ground, Tam Tuyệt Kiếm cuts four times planted, six meteors fall, the great blast goes off after gathering");
}

// a cheating client: the server decides every art. It sends forged messages straight down the socket and gets nothing
// for them: no art it hasn't learned (even put on its bar behind the server's back), no slot that
// doesn't exist, no cast before the cooldown is over however fast it taps, no damage or position of its own making,
// nothing while dead; a zone asked for far away lands at the art's reach
{
  const { q } = await import("../server/db.js");
  const bal = await import("../shared/balance.js");
  bal.applyConfig((await call("/config")).data);
  const P = await player();
  const [row] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [P.name]);
  // the bar written straight into the database with an art never learned: the API would refuse it, the world must too
  assert.equal((await call("/arts/equip", { token: P.token, method: "POST", body: { slots: ["luu_tinh_hoa_vu", null, null, null, null] } })).status, 403);
  await q("UPDATE characters SET art_slots = ? WHERE user_id = ?", [JSON.stringify(["luu_tinh_hoa_vu", "phikiem", null, null, null]), row.id]);
  const c = await connect(P.token);
  await sleep(400);
  const casts = () => c.msgs.filter((m) => m.t === "s").flatMap((m) => m.E).filter((e) => e.e === "cast" && e.id === c.id);
  const hitsBy = () => c.msgs.filter((m) => m.t === "s").flatMap((m) => m.E).filter((e) => e.e === "hit" && e.by === c.id);
  const me0 = c.snap.P.find((x) => x[0] === c.id);
  // unlearned art, slots out of range, junk in every field, a forged hit
  for (const m of [
    { t: "cast", s: 1, ax: 1, ay: 0 },
    { t: "cast", s: 6, ax: 1, ay: 0 }, { t: "cast", s: -1 }, { t: "cast", s: 99 }, { t: "cast", s: "1; drop" },
    { t: "cast", s: 3, ax: 1 }, // an empty slot
    { t: "hit", id: 1, d: 99999 }, { t: "dmg", target: 1, amount: 99999 }, { t: "pos", x: 10, y: 10 }, { t: "me", hp: 1e9, atk: 1e9 },
    { t: "in", dx: 1e9, x: 10, y: 10 }, { t: "in", dx: NaN },
  ]) send(c, m);
  send(c, { t: "in", dx: 0, jump: false, down: false });
  await sleep(500);
  assert.equal(casts().filter((e) => e.a === "luu_tinh_hoa_vu").length, 0, "an art not learned is never cast, even on the bar");
  assert.equal(casts().length, 0, `no slot outside the bar, no empty slot (${JSON.stringify(casts())})`);
  assert.equal(hitsBy().length, 0, "no hit a client claims");
  const me1 = c.snap.P.find((x) => x[0] === c.id);
  assert.ok(Math.abs(me1[1] - me0[1]) < 30, "no position a client claims");
  assert.ok(c.me.atk < 1e6 && c.me.hp <= c.me.maxHp, "no numbers a client claims");
  // fifty taps of Phi Kiếm in a burst: one cast, the rest wait out the cooldown
  for (let i = 0; i < 50; i++) send(c, { t: "cast", s: 2, ax: 1, ay: 0 });
  await sleep(600);
  assert.equal(casts().filter((e) => e.a === "phikiem").length, 1, `one cast per cooldown (${casts().length})`);
  // and the basic attack too: twenty taps, one cut
  for (let i = 0; i < 20; i++) send(c, { t: "cast", s: 0, ax: 1, ay: 0 });
  await sleep(150);
  assert.equal(casts().filter((e) => e.s === 0).length, 1, "the basic attack waits its cooldown as well");
  c.ws.close();
  ok("a cheating client gets nothing: no unlearned art (even on its bar), no slot beyond the bar, no claimed hit, place or number, one cast per cooldown however fast it taps");
}

// Tông Môn: everything decided on the server, safe when requests race. Players are made straight in the database (with a
// session each) so the suite needn't wait on the sign-up limit; every request still goes through the API like a browser's.
{
  const { q } = await import("../server/db.js");
  const { createSession } = await import("../server/auth.js");
  const bal = await import("../shared/balance.js");
  bal.applyConfig((await call("/config")).data);
  const S = bal.SECT;
  const tag = uid();
  let n = 0;
  /** A character of `exp` exp with `stones`, logged in: { uid, token, name }. */
  const mk = async (exp = 400000, stones = 50000) => {
    const k = n++, u = `ts_${tag}_${k}`;
    const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [u.slice(0, 16)])).insertId;
    const name = `M${tag.slice(0, 5)} ${k}`;
    await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', 'm', 8, 16, ?, ?)", [id, name, exp, stones]);
    return { uid: id, token: await createSession(id), name };
  };
  // a refusal for going too fast (429, at most 12 sect actions in 10 s each) is waited out and sent again: whatever a
  // check counts (one sect, one check-in, three buys...) must hold however many times a request arrives
  const post = async (P, path, body) => {
    for (;;) {
      const r = await call(`/sect${path}`, { token: P.token, method: "POST", body });
      if (r.status !== 429) return r;
      await sleep(1500);
    }
  };
  const view = async (P) => (await call("/sect", { token: P.token })).data;
  const stonesOf = async (P) => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [P.uid]))[0].stones);
  const memberOf = async (P) => (await q("SELECT sect_id, rnk FROM sect_members WHERE user_id = ?", [P.uid]))[0] ?? null;
  const all = (k, f) => Promise.all(Array.from({ length: k }, (_, i) => f(i)));

  // ---- founding: level, stones, names
  const low = await mk(0);
  assert.equal((await post(low, "/create", { name: `Thấp ${tag.slice(0, 4)}` })).status, 403, "too low a level to found one");
  const A = await mk(), N0 = await mk();
  for (const bad of ["Admin Môn", "Ban Quản Trị", "hệ thống", "GM Tông", "a", "<b>xx</b>", "   ", "x".repeat(17)])
    assert.equal((await post(N0, "/create", { name: bad })).status, 400, `name refused: ${bad}`);
  assert.equal((await post(N0, "/create", { name: `Mộ Dung ${tag.slice(0, 4)}` })).status, 200, "an ordinary name that merely contains a short reserved word is fine");
  const base = await stonesOf(A);
  // five founding requests at once from one person: one sect, paid once
  const name = `Thiên Kiếm ${tag.slice(0, 4)}`;
  const five = await all(5, () => post(A, "/create", { name: `${name}\u202e`, emblem: 3 }));
  assert.equal(five.filter((r) => r.status === 200).length, 1, "five at once: one sect");
  assert.equal(await stonesOf(A), base - S.createCost, "paid once");
  const sid = (await memberOf(A)).sect_id;
  assert.equal((await q("SELECT name FROM sects WHERE id = ?", [sid]))[0].name, name, "the hidden right-to-left mark is gone from the name");
  // the same name (another case, without accents) for someone else: taken, and nothing paid
  const B = await mk(), bBase = await stonesOf(B);
  assert.equal((await post(B, "/create", { name: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") })).status, 409, "a name differing only in case and accents is taken");
  assert.equal(await stonesOf(B), bBase, "and nothing was paid for it");
  // two people founding the same new name at once: one sect, only its founder pays
  const C = await mk(), D = await mk(), cd0 = (await stonesOf(C)) + (await stonesOf(D));
  const twin = await Promise.all([C, D].map((P) => post(P, "/create", { name: `Song ${tag.slice(0, 4)}` })));
  assert.deepEqual(twin.map((r) => r.status).sort(), [200, 409], "the same name at once: one wins");
  assert.equal((await stonesOf(C)) + (await stonesOf(D)), cd0 - S.createCost, "only the winner paid");

  // ---- joining: one sect per person, never past the cap
  assert.equal((await post(A, "/settings", { joinMode: "open", notice: "Chào <script>alert(1)</script>​ mừng\n\n\nđạo hữu" })).status, 200);
  const notice = (await view(A)).sect.notice;
  assert.ok(!/[<>​]/.test(notice) && notice.split("\n").length === 2, `the notice is cleaned (${JSON.stringify(notice)})`);
  const cap = S.membersBase;
  const fill = await all(cap - 3, () => mk());
  for (const P of fill) assert.equal((await post(P, "/join", { id: sid })).status, 200);
  // six at once for the last two places
  const rush = await all(6, () => mk());
  const got = await Promise.all(rush.map((P) => post(P, "/join", { id: sid })));
  const [R1, R2] = rush.filter((_, i) => got[i].status === 200);
  assert.equal(got.filter((r) => r.status === 200).length, 2, `six at once for two places: two get in (${got.map((r) => r.status)})`);
  assert.equal(Number((await q("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ?", [sid]))[0].n), cap, "never past the cap");
  // one person into three open sects at once: in exactly one
  const E = await mk(), F = await mk(), G = await mk();
  const opened = [];
  for (const [i, P] of [E, F, G].entries()) {
    const r = await post(P, "/create", { name: `Môn ${i} ${tag.slice(0, 4)}` });
    await post(P, "/settings", { joinMode: "open" });
    opened.push(r.data.view.sect.id);
  }
  const H = await mk();
  const three = await Promise.all(opened.flatMap((id) => [post(H, "/join", { id }), post(H, "/join", { id })]));
  assert.equal(three.filter((r) => r.status === 200).length, 1, "six joins to three sects at once: in one");
  assert.equal(Number((await q("SELECT COUNT(*) AS n FROM sect_members WHERE user_id = ?", [H.uid]))[0].n), 1);

  // ---- ranks: only over someone lower, only to a rank lower than one's own, caps on Phó and Trưởng Lão
  const [m1, m2, m3, m4] = fill;
  assert.equal((await post(m1, "/kick", { uid: A.uid })).status, 403, "a disciple can't send the leader away");
  assert.equal((await post(m1, "/rank", { uid: m2.uid, rank: 3 })).status, 403, "nor give ranks");
  assert.equal((await post(m1, "/settings", { notice: "hack" })).status, 403, "nor change the rules");
  assert.equal((await post(A, "/rank", { uid: m1.uid, rank: 1 })).status, 400, "Tông Chủ is never given by /rank");
  assert.equal((await post(A, "/rank", { uid: m1.uid, rank: 3 })).status, 200);
  assert.equal((await post(m1, "/rank", { uid: m2.uid, rank: 3 })).status, 403, "a Trưởng Lão can't make another Trưởng Lão");
  assert.equal((await post(m1, "/rank", { uid: m2.uid, rank: 4 })).status, 200, "but can make a Nội Môn");
  assert.equal((await post(m1, "/kick", { uid: A.uid })).status, 403, "and can't send the leader away");
  // three made Phó at once with room for two (sect.vices)
  const vices = await Promise.all([m2, m3, m4].map((P) => post(A, "/rank", { uid: P.uid, rank: 2 })));
  assert.equal(vices.filter((r) => r.status === 200).length, Math.min(3, S.vices), "never more Phó Tông Chủ than the cap");
  const vice = [m2, m3, m4][vices.findIndex((r) => r.status === 200)];
  assert.equal((await post(vice, "/rank", { uid: m1.uid, rank: 2 })).status, 403, "a Phó can't make another Phó");
  // a kick and a leave of the same person at once: they are out once, and wait before joining another
  const k = fill[5];
  const kl = await Promise.all([post(vice, "/kick", { uid: k.uid }), post(k, "/leave")]);
  assert.equal(kl.filter((r) => r.status === 200).length, 1, "a kick racing a leave: one of them");
  assert.equal(await memberOf(k), null);
  assert.equal((await post(k, "/join", { id: opened[0] })).status, 403, "and they wait before joining another");
  assert.equal((await post(A, "/leave")).status, 409, "the leader can't just leave");

  // ---- giving: idempotent, never past what one has, a daily cap (each burst kept under the per-person limit of 12 in 10 s)
  const Pa = fill[6], Pb = fill[4];
  await q("UPDATE characters SET stones = 1000 WHERE user_id = ?", [Pa.uid]);
  await q("UPDATE characters SET stones = 900 WHERE user_id = ?", [Pb.uid]);
  const rid = crypto.randomUUID();
  const same = await all(6, () => post(Pa, "/donate", { amount: 100, requestId: rid }));
  assert.ok(same.every((r) => r.status === 200), "the same donation 6 times: all answered");
  assert.equal(await stonesOf(Pa), 900, "but paid once");
  const many = await all(6, () => post(Pb, "/donate", { amount: 300, requestId: crypto.randomUUID() }));
  assert.equal(many.filter((r) => r.status === 200).length, 3, "six donations with stones for three: three");
  assert.equal(await stonesOf(Pb), 0, "nothing below zero");
  const tre = Number((await q("SELECT treasury FROM sects WHERE id = ?", [sid]))[0].treasury);
  assert.equal(tre, 1000, "the treasury got exactly what was given");
  for (const body of [{ amount: -5 }, { amount: 1.5 }, { amount: "1e9" }, { amount: S.donateDaily + 1 }, { amount: 100 }])
    assert.ok((await post(Pb, "/donate", { requestId: crypto.randomUUID(), ...body })).status >= 400, `refused: ${JSON.stringify(body)}`);
  assert.equal((await post(Pa, "/donate", { amount: 100, requestId: "not-an-id" })).status, 400, "a donation needs a request id");
  // the check-in: ten at once, once
  const ci = await all(10, () => post(R1, "/checkin"));
  assert.equal(ci.filter((r) => r.status === 200).length, 1, "ten check-ins at once: one");
  assert.equal((await post(R1, "/array")).status, 403, "a disciple can't raise the great array");
  // the treasure house: ten buys with cống hiến for three
  const cost = (await q("SELECT cost FROM sect_shop WHERE item_key = 'hoixuan'"))[0].cost;
  await q("UPDATE sect_members SET contrib = ? WHERE user_id = ?", [cost * 3, R2.uid]);
  const buys = await all(10, () => post(R2, "/shop", { item: "hoixuan", requestId: crypto.randomUUID() }));
  assert.equal(buys.filter((r) => r.status === 200).length, 3, "ten buys with cống hiến for three: three");
  assert.equal(Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'hoixuan'", [R2.uid]))[0].qty), 3);
  assert.equal(Number((await q("SELECT contrib FROM sect_members WHERE user_id = ?", [R2.uid]))[0].contrib), 0, "and not a point below zero");
  assert.equal((await post(R2, "/shop", { item: "bk_diet_the_than_bao", requestId: crypto.randomUUID() })).status, 403, "a book the sect's level hasn't opened yet");
  assert.equal((await post(Pa, "/shop", { item: "../../etc", requestId: crypto.randomUUID() })).status, 400, "an item key that isn't one");

  // ---- the world: the name over the head, the bonus, and the sect channel only for the sect
  await q("UPDATE sects SET level = 5 WHERE id = ?", [sid]);
  const cA = await connect(A.token), cOut = await connect(H.token);
  await sleep(500);
  assert.equal(cA.me.sect?.name, name, "the world knows the sect");
  assert.equal(cA.me.sect.bonus, 4 * S.bonusPerLevel, "and its bonus");
  const pi = cOut.msgs.find((m) => m.t === "welcome").players.find((x) => x.name === A.name) ?? cOut.msgs.filter((m) => m.t === "pi").find((x) => x.name === A.name);
  if (pi) assert.equal(pi.sect?.n, name, "others see the sect over the name");
  send(cA, { t: "chat", ch: "s", m: "chỉ đồng môn" });
  await sleep(400);
  assert.ok(cA.msgs.some((m) => m.t === "chat" && m.ch === "s" && m.m === "chỉ đồng môn"), "the sect channel reaches the sect");
  assert.ok(!cOut.msgs.some((m) => m.t === "chat" && m.m === "chỉ đồng môn"), "and nobody else");
  cA.ws.close();
  cOut.ws.close();

  // ---- handing on and ending: typed to be sure; a disband racing joins leaves nobody in a sect that's gone
  assert.equal((await post(A, "/transfer", { uid: vice.uid, confirm: "sai" })).status, 400, "handing on needs the name typed");
  assert.equal((await post(A, "/transfer", { uid: vice.uid, confirm: vice.name })).status, 200);
  assert.equal((await memberOf(A)).rnk, 2, "the old leader takes the new one's rank");
  assert.equal((await post(A, "/disband", { confirm: name })).status, 403, "only the leader ends it");
  const late = await all(4, () => mk());
  const race = await Promise.all([post(vice, "/disband", { confirm: name }), ...late.map((L) => post(L, "/join", { id: sid }))]);
  assert.equal(race[0].status, 200, "disbanded");
  assert.equal(Number((await q("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ?", [sid]))[0].n), 0, "nobody left in it, however the joins fell");
  assert.equal(Number((await q("SELECT COUNT(*) AS n FROM sects WHERE id = ?", [sid]))[0].n), 0);
  ok("Tông Môn: founding once and paid once, names checked, never past the cap, one sect per person, ranks only downward with caps, donations idempotent and never below zero, one check-in a day, the treasure house, the sect channel private, disbanding racing joins");
}

// Chat and Đạo Hữu: who hears what, friendships that stay whole when requests race, Truyền Âm only between friends, blocks
{
  const { q } = await import("../server/db.js");
  const { createSession } = await import("../server/auth.js");
  const tag = uid();
  let n = 0;
  const mk = async (map = null) => {
    const k = n++;
    const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tc_${tag}_${k}`])).insertId;
    const name = `C${tag.slice(0, 5)} ${k}`;
    await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones, map_id) VALUES (?, ?, 'tu', 'm', 8, 16, 1000, 0, ?)", [id, name, map]);
    return { uid: id, token: await createSession(id), name };
  };
  const post = async (P, path, body) => {
    for (;;) {
      const r = await call(`/friends${path}`, { token: P.token, method: "POST", body });
      if (r.status !== 429) return r;
      await sleep(1500);
    }
  };
  const rows = async (sql, a) => Number((await q(sql, a))[0].n);
  const chats = (c, text) => c.msgs.filter((m) => m.t === "chat" && m.m === text);

  // ---- requests racing: A and B ask each other at once: friends once, both rows, no request left
  const A = await mk(), B = await mk(), C = await mk("bichlac"), D = await mk();
  await Promise.all([post(A, "/request", { uid: B.uid }), post(B, "/request", { uid: A.uid })]);
  assert.equal(await rows("SELECT COUNT(*) AS n FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [A.uid, B.uid, B.uid, A.uid]), 2, "asking each other at once: friends, both ways");
  assert.equal(await rows("SELECT COUNT(*) AS n FROM friend_requests WHERE from_id IN (?, ?) AND to_id IN (?, ?)", [A.uid, B.uid, A.uid, B.uid]), 0, "and no request left over");
  // the same request eight times: one
  const eight = await Promise.all(Array.from({ length: 8 }, () => post(D, "/request", { name: A.name })));
  assert.equal(eight.filter((r) => r.status === 200).length, 1, "asked 8 times at once: one request");
  // accepted twice at once: one friendship
  const acc = await Promise.all([post(A, "/answer", { uid: D.uid, accept: true }), post(A, "/answer", { uid: D.uid, accept: true })]);
  assert.equal(acc.filter((r) => r.status === 200).length, 1, "accepted twice at once: once");
  assert.equal(await rows("SELECT COUNT(*) AS n FROM friends WHERE user_id = ? AND friend_id = ?", [D.uid, A.uid]), 1);
  for (const bad of [{ uid: A.uid }, { uid: "abc" }, { uid: -1 }, { name: "" }, { name: "Không Có Ai Tên Này" }])
    assert.ok((await post(A, "/request", bad)).status >= 400, `refused: ${JSON.stringify(bad)}`);
  assert.equal((await post(A, "/request", { uid: B.uid })).status, 409, "already friends");
  // search shows what each is to me
  const found = (await call(`/friends/search?q=${encodeURIComponent(`C${tag.slice(0, 5)}`)}`, { token: A.token })).data;
  assert.equal(found.find((r) => r.uid === B.uid)?.state, "friend", "search knows a friend");

  // ---- the channels: Thế Giới everywhere, Khu Vực only on the map, Tông Môn only the sect
  const [ca, cb, cc, cd] = [await connect(A.token), await connect(B.token), await connect(C.token), await connect(D.token)];
  await sleep(500);
  send(ca, { t: "chat", ch: "w", m: "the gioi " + tag });
  await sleep(1100);
  send(ca, { t: "chat", ch: "k", m: "khu vuc " + tag });
  await sleep(1100);
  send(ca, { t: "chat", ch: "w", m: "the gioi lan hai " + tag });
  await sleep(400);
  assert.equal(chats(cc, "the gioi " + tag).length, 1, "Thế Giới reaches another map");
  assert.equal(chats(cb, "khu vuc " + tag).length, 1, "Khu Vực reaches the same map");
  assert.equal(chats(cc, "khu vuc " + tag).length, 0, "and not another map");
  assert.equal(chats(cb, "the gioi lan hai " + tag).length, 0, "Thế Giới waits its cooldown");
  send(ca, { t: "chat", ch: "s", m: "tong mon " + tag });
  await sleep(1100);
  assert.equal(chats(cb, "tong mon " + tag).length, 0, "no sect, no sect channel");
  // a line cleaned of hidden and markup characters
  send(ca, { t: "chat", ch: "k", m: "xin‮ chào <script>" });
  await sleep(1100);
  assert.ok(cb.msgs.some((m) => m.t === "chat" && m.m === "xin chào script"), "chat lines are cleaned");
  // the channel's last lines for someone opening it
  send(cb, { t: "hist", ch: "k" });
  await sleep(300);
  assert.ok(cb.msgs.find((m) => m.t === "hist")?.list.some((m) => m.m === "khu vuc " + tag), "Khu Vực's last lines");

  // ---- Truyền Âm: only to a friend, saved, delivered, history only for the two
  send(ca, { t: "pm", to: C.uid, m: "khong phai ban", c: "x1" });
  await sleep(700);
  assert.ok(ca.msgs.some((m) => m.t === "pmerr" && m.c === "x1"), "no Truyền Âm to a stranger");
  send(ca, { t: "pm", toName: C.name, m: "khong phai ban", c: "x2" });
  await sleep(700);
  assert.ok(ca.msgs.some((m) => m.t === "pmerr" && m.c === "x2"), "nor by name");
  send(ca, { t: "pm", to: B.uid, m: "chao <b>ban</b>", c: "x3" });
  await sleep(700);
  const got = cb.msgs.find((m) => m.t === "pm" && !m.mine);
  assert.equal(got?.text, "chao bban/b", "a friend gets it, cleaned");
  assert.ok(ca.msgs.some((m) => m.t === "pm" && m.mine && m.c === "x3"), "and the sender sees it sent");
  // ten at once: the rest are told to slow down, nothing lost silently
  for (let i = 0; i < 10; i++) send(ca, { t: "pm", to: B.uid, m: `nhanh ${i}`, c: `f${i}` });
  await sleep(800);
  const sent = ca.msgs.filter((m) => m.t === "pm" && m.mine && /^f/.test(m.c)).length, slowed = ca.msgs.filter((m) => m.t === "pmerr" && /^f/.test(m.c)).length;
  assert.ok(sent >= 1 && sent + slowed === 10, `a burst of Truyền Âm: ${sent} sent, ${slowed} told to slow down`);
  const hist = (await call(`/friends/${A.uid}/messages`, { token: B.token })).data;
  assert.ok(hist.messages.some((m) => m.text === "chao bban/b" && !m.mine), "B reads it in the history");
  assert.equal((await call(`/friends/${B.uid}/messages`, { token: C.token })).status, 403, "a third person can't read it");
  assert.equal(await rows("SELECT COUNT(*) AS n FROM private_messages WHERE to_id = ? AND read_at IS NULL", [B.uid]), 0, "opening it marks it read");
  // a long conversation comes 40 at a time
  await q(`INSERT INTO private_messages (lo, hi, from_id, to_id, body) VALUES ${Array.from({ length: 45 }, () => "(?, ?, ?, ?, ?)").join(",")}`,
    Array.from({ length: 45 }, (_, i) => [Math.min(A.uid, D.uid), Math.max(A.uid, D.uid), D.uid, A.uid, `cu ${i}`]).flat());
  const p1 = (await call(`/friends/${D.uid}/messages`, { token: A.token })).data;
  assert.equal(p1.messages.length, 40, "40 at a time");
  assert.ok(p1.more, "and more to come");
  const p2 = (await call(`/friends/${D.uid}/messages?before=${p1.messages[0].id}`, { token: A.token })).data;
  assert.equal(p2.messages.length, 5, "the rest before them");

  // ---- block: friendship ends, nothing of theirs gets through, they can't ask again (and aren't told why)
  assert.equal((await post(B, "/block", { uid: A.uid })).status, 200);
  assert.equal(await rows("SELECT COUNT(*) AS n FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", [A.uid, B.uid, B.uid, A.uid]), 0, "a block ends the friendship");
  await sleep(1100);
  send(ca, { t: "chat", ch: "k", m: "bi chan " + tag });
  send(ca, { t: "pm", to: B.uid, m: "con do khong", c: "x9" });
  await sleep(800);
  assert.equal(chats(cb, "bi chan " + tag).length, 0, "the blocked one's chat doesn't reach the blocker");
  assert.ok(chats(cd, "bi chan " + tag).length === 1, "but reaches everyone else");
  assert.ok(ca.msgs.some((m) => m.t === "pmerr" && m.c === "x9"), "no Truyền Âm through a block");
  const again = await post(A, "/request", { uid: B.uid });
  assert.equal(again.status, 403);
  assert.equal(again.data.error, "Không gửi được lời mời cho người này.", "asking again: refused, without saying it's a block");
  assert.equal((await call(`/friends/${A.uid}/messages`, { token: B.token })).status, 403, "and the history is closed");
  assert.equal((await post(B, "/unblock", { uid: A.uid })).status, 200);

  // ---- an admin's chat ban
  await q("UPDATE users SET chat_muted_until = NOW() + INTERVAL 5 MINUTE WHERE id = ?", [D.uid]);
  cd.ws.close();
  const cd2 = await connect(D.token);
  await sleep(400);
  send(cd2, { t: "chat", ch: "k", m: "bi cam " + tag });
  await sleep(500);
  assert.equal(chats(cb, "bi cam " + tag).length, 0, "barred from chat: nothing said");
  for (const c of [ca, cb, cc, cd2]) c.ws.close();
  ok("chat and Đạo Hữu: Thế Giới everywhere with a cooldown, Khu Vực on the map, lines cleaned; requests racing make one friendship; Truyền Âm only to friends, saved, paged, private, rate-limited; a block stops everything silently; an admin's chat ban");
}

// Gia Viên: unlocked once and paid once, with the ready-made default house, whose walls and floors carry people; no
// building by hand any more; animals and herbs bought, fed, collected and picked once however fast it's asked
{
  const { q } = await import("../server/db.js");
  const { createSession } = await import("../server/auth.js");
  const bal = await import("../shared/balance.js");
  bal.applyConfig((await call("/config")).data);
  const H = bal.HOME, tag = uid();
  const mk = async (k, stones) => {
    const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tg_${tag}_${k}`])).insertId;
    await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', 'm', 8, 16, 1000, ?)", [id, `G${tag.slice(0, 5)} ${k}`, stones]);
    return { uid: id, token: await createSession(id) };
  };
  const post = async (P, path, body) => {
    for (;;) {
      const r = await call(`/home${path}`, { token: P.token, method: "POST", body });
      if (r.status !== 429) return r;
      await sleep(1500);
    }
  };
  const stones = async (P) => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [P.uid]))[0].stones);
  const A = await mk(0, H.unlockCost + 20000), poor = await mk(1, H.unlockCost - 1);
  assert.equal((await post(poor, "/unlock")).status, 409, "not enough stones: no Gia Viên, nothing spent");
  assert.equal(await stones(poor), H.unlockCost - 1);
  assert.equal((await post(A, "/enter")).status, 403, "locked: can't go in");
  // five unlocks at once: one, paid once
  const five = await Promise.all(Array.from({ length: 5 }, () => post(A, "/unlock")));
  assert.equal(five.filter((r) => r.status === 200).length, 1, "five unlocks at once: one");
  assert.equal(await stones(A), 20000, "paid once");

  // ---- the house: the default one comes with unlocking
  const gvs = await import("../shared/gia-vien.js");
  assert.equal((await q("SELECT house FROM homes WHERE user_id = ?", [A.uid]))[0].house, gvs.DEFAULT_HOUSE, "the default house");
  assert.equal((await call("/home", { token: A.token })).data.house, gvs.DEFAULT_HOUSE, "shown in the view");
  // building by hand is gone: its route and its socket message do nothing
  assert.equal((await post(A, "/buy", { kind: "go", qty: 30, requestId: crypto.randomUUID() })).status, 404, "no buying materials");
  const c = await connect(A.token);
  await sleep(300);
  const msgs = (t) => c.msgs.filter((m) => m.t === t);
  assert.equal((await post(A, "/enter")).status, 200);
  await sleep(2500);
  assert.equal(msgs("welcome").pop().map, "giavien", "in the Gia Viên");
  assert.equal(msgs("home").pop()?.house, gvs.DEFAULT_HOUSE, "told which house stands there");
  assert.ok(msgs("homest").length, "and the farm");
  send(c, { t: "build", op: "put", l: "f", x: 33, y: 15, k: "go", c: "x" });
  await sleep(300);
  assert.ok(!msgs("blk").length && !msgs("blkerr").length, "a build message does nothing");
  // its walls stop people: in through the door on the right, as far as the left wall and no further
  for (let i = 0; i < 70; i++) (send(c, { t: "in", dx: -1, dy: 0 }), await sleep(50));
  send(c, { t: "in", dx: 0, dy: 0 });
  await sleep(200);
  const me = c.snap.P.find((p) => p[0] === c.id);
  assert.ok(me[1] > 8 * 32 && me[1] < 28 * 32, `in the house, stopped by its left wall (x ${Math.round(me[1])})`);
  // and its upper floor carries them, the outer walls are solid (the same map the server moves people on)
  const { mapInfo } = await import("../shared/maps/index.js");
  const hm = new gvs.HomeGrid(mapInfo(gvs.HOME_MAP)).load(gvs.houseCells(gvs.DEFAULT_HOUSE)).wrap();
  assert.ok(hm.solid(7, 12) && hm.solid(28, 8) && hm.plank(15, 10) && hm.plank(25, 13) && !hm.solid(28, 14), "walls, floor, step, the doorway open");

  // ---- the farm: never past the cap, fed and collected once
  await q("UPDATE characters SET stones = 1000000 WHERE user_id = ?", [A.uid]);
  const buys = await Promise.all(Array.from({ length: H.maxAnimals + 3 }, () => post(A, "/animal/buy", { kind: "ga", requestId: crypto.randomUUID() })));
  assert.equal(buys.filter((r) => r.status === 200).length, H.maxAnimals, `${H.maxAnimals + 3} bought at once: the pen holds ${H.maxAnimals}`);
  const s0 = await stones(A);
  const feeds = await Promise.all([post(A, "/animal/feed", { ids: "all" }), post(A, "/animal/feed", { ids: "all" })]);
  assert.equal(feeds.filter((r) => r.status === 200).length, 1, "fed twice at once: once");
  assert.equal(await stones(A), s0 - H.maxAnimals * 10, "and paid for once");
  assert.equal((await post(A, "/animal/collect", { ids: "all" })).status, 409, "nothing to collect before it's time");
  await q("UPDATE home_animals SET ready_at = NOW() WHERE user_id = ?", [A.uid]);
  const cols = await Promise.all([post(A, "/animal/collect", { ids: "all" }), post(A, "/animal/collect", { ids: "all" })]);
  assert.equal(cols.filter((r) => r.status === 200).length, 1, "collected twice at once: once");
  assert.equal(Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'gv_trung_ga'", [A.uid]))[0].qty), H.maxAnimals, "an egg each");

  // ---- the garden: a bed sown once, picked once
  const sow = await Promise.all(Array.from({ length: 5 }, () => post(A, "/plant", { plot: 3, crop: "nhan_sam" })));
  assert.equal(sow.filter((r) => r.status === 200).length, 1, "a bed sown five times at once: once");
  assert.equal((await post(A, "/plant", { plot: 99, crop: "nhan_sam" })).status, 400, "no such bed");
  assert.equal((await post(A, "/harvest", { plot: 3 })).status, 409, "not ripe yet");
  await q("UPDATE home_plots SET ready_at = NOW() WHERE user_id = ?", [A.uid]);
  const picks = await Promise.all([post(A, "/harvest", { plot: "all" }), post(A, "/harvest", { plot: 3 })]);
  assert.equal(picks.filter((r) => r.status === 200).length, 1, "picked twice at once: once");
  const ns = Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = 'gv_nhan_sam'", [A.uid]))[0].qty);
  assert.ok(ns >= 1 && ns <= 2, `a ginseng's yield (${ns})`);

  // ---- a house bought: never without the money, once however many times it's asked, moved into at once; houses one
  // has can be moved between, others can't
  const G2 = gvs.HOUSES.gamer;
  await q("UPDATE characters SET stones = ? WHERE user_id = ?", [G2.price - 1, A.uid]);
  assert.equal((await post(A, "/house/buy", { house: "gamer", requestId: crypto.randomUUID() })).status, 409, "not enough stones: no house");
  assert.equal((await post(A, "/house/use", { house: "gamer" })).status, 403, "can't move into a house not bought");
  await q("UPDATE characters SET stones = ? WHERE user_id = ?", [G2.price * 3, A.uid]);
  const hrid = crypto.randomUUID();
  const hb = await Promise.all(Array.from({ length: 5 }, () => post(A, "/house/buy", { house: "gamer", requestId: hrid })));
  assert.ok(hb.every((r) => r.status === 200), "the same purchase 5 times: all answered");
  const hb2 = await Promise.all(Array.from({ length: 3 }, () => post(A, "/house/buy", { house: "gamer", requestId: crypto.randomUUID() })));
  assert.ok(hb2.every((r) => r.status === 409), "bought again with new requests: refused");
  assert.equal(await stones(A), G2.price * 2, "paid once");
  assert.equal((await q("SELECT house FROM homes WHERE user_id = ?", [A.uid]))[0].house, "gamer", "moved in");
  await sleep(400);
  const hm2 = msgs("home").pop();
  assert.ok(hm2.house === "gamer" && hm2.moved, "the Gia Viên changed under them, they're put back at the gate");
  for (const bad of ["kim_lau", "", "__proto__", 5]) assert.equal((await post(A, "/house/use", { house: bad })).status, 400, `no such house: ${bad}`);
  assert.equal((await post(A, "/house/use", { house: gvs.DEFAULT_HOUSE })).status, 200, "back to the default one");
  assert.equal((await post(A, "/house/use", { house: "gamer" })).status, 200, "and to the bought one");
  assert.deepEqual((await call("/home", { token: A.token })).data.houses.sort(), [gvs.DEFAULT_HOUSE, "gamer"].sort(), "both listed as had");
  const gm = new gvs.HomeGrid(mapInfo(gvs.HOME_MAP)).load(gvs.houseCells("gamer")).wrap();
  assert.ok(gm.plank(20, 13) && gm.plank(20, 10) && !gm.solid(20, 15), "the Gamer house's floors are planks on rows 13 and 10");
  const tp = new gvs.HomeGrid(mapInfo(gvs.HOME_MAP)).load(gvs.houseCells("tien_phu")).wrap();
  assert.ok(tp.plank(20, 13) && tp.plank(20, 11) && !tp.plank(20, 10) && !tp.solid(20, 15), "Tiên Phủ's floors are planks on rows 13 and 11");
  assert.equal(gvs.housePrice("tien_phu", bal.HOME.houses), 500000, "its price from the settings");

  // ---- leaving: back where they were; the Gia Viên isn't where they log in next time
  assert.equal((await post(A, "/leave")).status, 200);
  await sleep(1200);
  assert.equal(msgs("welcome").pop().map, "tanthu", "back out");
  c.ws.close();
  ok("Gia Viên: unlocked and paid once, with the default house; its walls stop people and its floors carry them; no building by hand; the pen's cap, feeding, collecting and picking each once; a house bought once, paid once, moved into, switched only between houses one has");
}

// Câu Cá: to the lake from the menu; rods bought once and paid once, bait by the handful; buying and selling only at the
// stall; a cast whose bite, strike and reeling the server runs (a strike too early costs nothing, moving reels in, a bite
// takes one bait); the catch in the bag and the Ngư Lục; selling counted once however fast it's asked
{
  const { q } = await import("../server/db.js");
  const { createSession } = await import("../server/auth.js");
  const cc = await import("../shared/cau-ca.js");
  const tag = uid();
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tf_${tag}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', 'm', 8, 16, 1000, 20000)", [id, `F${tag.slice(0, 6)}`]);
  const A = { uid: id, token: await createSession(id) };
  const post = async (path, body) => {
    for (;;) {
      const r = await call(`/fishing${path}`, { token: A.token, method: "POST", body });
      if (r.status !== 429) return r;
      await sleep(1500);
    }
  };
  const stones = async () => Number((await q("SELECT stones FROM characters WHERE user_id = ?", [A.uid]))[0].stones);
  const qty = async (item) => Number((await q("SELECT qty FROM inventory WHERE user_id = ? AND item = ?", [A.uid, item]))[0]?.qty ?? 0);
  const c = await connect(A.token);
  const msgs = (t) => c.msgs.filter((m) => m.t === t);
  const fishMsg = async (pred, ms = 20000) => {
    for (let i = 0; i < ms / 50; i++) {
      const m = c.msgs.find((x) => x.t === "fish" && !x.seen && pred(x));
      if (m) return (m.seen = true), m;
      await sleep(50);
    }
    throw new Error("no fish message");
  };
  const end = () => fishMsg((m) => m.s === "end");
  const me0 = () => c.snap?.P.find((p) => p[0] === c.id);
  await sleep(300);
  // off the lake: casting does nothing but say so
  send(c, { t: "fish", a: "cast" });
  await sleep(300);
  assert.ok(msgs("toast").some((m) => /Vọng Nguyệt Hồ/.test(m.m)), "no fishing off the lake");
  assert.equal((await post("/enter")).status, 200);
  await sleep(2500);
  assert.equal(msgs("welcome").pop().map, cc.FISH_MAP, "at the lake");
  // ---- the stall: nothing is sold away from it
  const rod = "cc_can_truc", bait = "cc_moi_giun", P = { rod: cc.RODS[rod].price, bait: cc.BAITS[bait].price };
  assert.equal((await post("/buy", { item: rod, qty: 1, requestId: crypto.randomUUID() })).status, 403, "away from the stall: no buying");
  await walkTo(c, 12.5 * 32, me0()[2]);
  // five buys of the same rod at once: one, paid once; the same request again counts once
  const five = await Promise.all(Array.from({ length: 5 }, () => post("/buy", { item: rod, qty: 1, requestId: crypto.randomUUID() })));
  assert.equal(five.filter((r) => r.status === 200).length, 1, "a rod is bought once");
  assert.equal(await stones(), 20000 - P.rod, "paid once");
  assert.equal(await qty(rod), 1);
  const rid = crypto.randomUUID();
  const twice = await Promise.all([post("/buy", { item: bait, qty: 10, requestId: rid }), post("/buy", { item: bait, qty: 10, requestId: rid })]);
  assert.ok(twice.every((r) => r.status === 200), JSON.stringify(twice.map((r) => r.data)));
  assert.equal(await qty(bait), 10, "the same request twice: one handful");
  await Promise.all(Array.from({ length: 4 }, () => post("/buy", { item: bait, qty: 5, requestId: crypto.randomUUID() })));
  assert.equal(await qty(bait), 30, "four handfuls at once: all four");
  assert.equal(await stones(), 20000 - P.rod - 30 * P.bait, "and each paid");
  assert.equal((await post("/buy", { item: bait, qty: 100, requestId: crypto.randomUUID() })).status, 400, "at most 99 at once");
  assert.equal((await post("/choose", { rod: "cc_can_long" })).status, 403, "can't pick a rod one doesn't have");
  const v = (await call("/fishing", { token: A.token })).data;
  assert.equal(v.rod, rod, "the rod bought is in hand");
  assert.equal(v.bait, bait, "the bait bought is on the hook");
  assert.ok(v.atShop && v.here);
  // ---- from the shore by the dock, facing the water
  await walkTo(c, 21.4 * 32, me0()[2]);
  send(c, { t: "in", dx: 0.2, dy: 0 });
  await sleep(120);
  send(c, { t: "in", dx: 0, dy: 0 });
  await sleep(400);
  // struck too early: reeled in empty, nothing spent
  send(c, { t: "fish", a: "cast" });
  const cast1 = await fishMsg((m) => m.s === "cast" || m.s === "end");
  assert.equal(cast1.s, "cast", JSON.stringify(cast1));
  assert.equal(cast1.zone, "ben", "the shallows by the dock");
  await sleep(200);
  assert.ok(c.snap.P.find((p) => p[0] === c.id).length > 6, "the float shows in the snapshot");
  send(c, { t: "fish", a: "hook" });
  assert.equal((await end()).why, "early");
  assert.equal(await qty(bait), 30, "a strike before the bite costs no bait");
  // moving reels in
  await sleep(1400);
  send(c, { t: "fish", a: "cast" });
  await fishMsg((m) => m.s === "cast");
  send(c, { t: "in", dx: -1, dy: 0 });
  assert.equal((await end()).why, "move", "walking off reels the line in");
  send(c, { t: "in", dx: 0, dy: 0 });
  await walkTo(c, 21.4 * 32, me0()[2]);
  send(c, { t: "in", dx: 0.2, dy: 0 });
  await sleep(120);
  send(c, { t: "in", dx: 0, dy: 0 });
  await sleep(1400);
  // ---- a real cast: wait for the bite, strike, reel the fish in (holding while the zone is under the fish)
  let landed = null;
  for (let tries = 0; tries < 4 && !landed; tries++) {
    send(c, { t: "fish", a: "cast" });
    await fishMsg((m) => m.s === "cast");
    const bite = await fishMsg((m) => m.s === "bite" || m.s === "end", 20000);
    assert.equal(bite.s, "bite", JSON.stringify(bite));
    send(c, { t: "fish", a: "hook" });
    await fishMsg((m) => m.s === "reel");
    let hold = false, out = null;
    const seen = c.msgs.length;
    for (let i = 0; i < 1400 && !out; i++) {
      const fr = c.msgs.slice(seen).filter((m) => m.t === "fr").pop();
      if (fr && (fr.z < fr.f) !== hold) send(c, { t: "fish", a: "hold", on: (hold = fr.z < fr.f) });
      out = c.msgs.find((m) => m.t === "fish" && m.s === "end" && !m.seen);
      await sleep(25);
    }
    out.seen = true;
    if (out.why === "land") landed = out;
    await sleep(1400);
  }
  assert.ok(landed, "a fish landed");
  assert.ok(cc.FISH[landed.fish] && landed.g >= cc.FISH[landed.fish].kg[0] * 1000 && landed.g <= cc.FISH[landed.fish].kg[1] * 1000, "a fish of that spot, its weight in its range");
  assert.ok(cc.FISH[landed.fish].zones.includes("ben"));
  const log = await q("SELECT n, best_g FROM fish_log WHERE user_id = ? AND fish = ?", [A.uid, landed.fish]);
  assert.equal(Number(log[0].best_g), landed.g, "in the Ngư Lục with its weight");
  const f = (await q("SELECT casts, catches FROM fishers WHERE user_id = ?", [A.uid]))[0];
  assert.equal(30 - (await qty(bait)), Number(f.casts), "one bait a bite");
  assert.ok(Number(f.catches) >= 1);
  // ---- selling, back at the stall: five "sell all" at once are paid once
  if (!cc.FISH[landed.fish].stones) {
    assert.equal(await qty(landed.fish), 1, "the catch is in the bag");
    await q("UPDATE inventory SET qty = 7 WHERE user_id = ? AND item = ?", [A.uid, landed.fish]);
    assert.equal((await post("/sell", { item: landed.fish, qty: 1, requestId: crypto.randomUUID() })).status, 403, "away from the stall: no selling");
    await walkTo(c, 12.5 * 32, me0()[2]);
    const s0 = await stones();
    const sells = await Promise.all(Array.from({ length: 5 }, () => post("/sell", { item: "all", qty: "all", requestId: crypto.randomUUID() })));
    assert.equal(sells.filter((r) => r.status === 200).length, 1, "five sell-alls: one");
    assert.equal(await stones(), s0 + 7 * cc.FISH[landed.fish].price, "paid once for the seven");
    assert.equal(await qty(landed.fish), 0);
  }
  c.ws.close();
  ok("Câu Cá: to the lake from the menu; a rod bought once and paid once, bait by the handful, only at the stall; a strike too early costs nothing, moving reels in, a bite takes one bait; the reeling run by the server lands a fish of that spot into the bag and the Ngư Lục; selling paid once");
}

{
  const { q, pool } = await import("../server/db.js");
  await q("DELETE FROM cosmetics WHERE name LIKE ?", [SHOP_TEST + "%"]);
  await pool.end();
}
console.log(`${passed} checks passed`);
process.exit(0);
