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

{
  const { q, pool } = await import("../server/db.js");
  await q("DELETE FROM cosmetics WHERE name LIKE ?", [SHOP_TEST + "%"]);
  await pool.end();
}
console.log(`${passed} checks passed`);
process.exit(0);
