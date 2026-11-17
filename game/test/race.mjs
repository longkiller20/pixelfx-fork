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

{
  // the look is checked: bad genders and out-of-range parts are refused
  const u = "t_" + uid();
  const { data } = await call("/register", { method: "POST", body: { username: u, password: "secret123" } });
  // junk, a shop item (hair 0 is sold, not free), and a man's starter hair on a woman
  for (const look of [{ g: "x", hair: 8, robe: 16 }, { g: "m", hair: 1.5, robe: 16 }, { g: "f", hair: 24, robe: -1 }, null, { g: "m", hair: 0, robe: 16 }, { g: "f", hair: 8, robe: 2 }])
    assert.equal((await call("/character", { token: data.token, method: "POST", body: { name: "T " + u.slice(2), look } })).status, 400, JSON.stringify(look));
  const c = await call("/character", { token: data.token, method: "POST", body: { name: "T " + u.slice(2), look: { g: "f", hair: 34, robe: 21 } } });
  assert.deepEqual({ ...c.data.character.look, weapon: undefined }, { g: "f", hair: 34, robe: 21, weapon: undefined });
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

    // bảo vật (pixelfx's weapons): not in the wardrobe, can't be bought or worn; given by an admin, it shows up and is worn
    const sp = (await adm("/t/cosmetics", { token })).data.filter((c) => c.special);
    assert.equal(sp.length, 11, "all eleven pixelfx weapons seeded as bảo vật");
    const gem = sp.find((c) => c.idx === 90);
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
      const P = await player(), [pu] = await q("SELECT u.id FROM users u JOIN characters c ON c.user_id = u.id WHERE c.name = ?", [P.name]);
      const m0 = await me(P.token);
      assert.deepEqual(m0.character.slots, ["phikiem", "loian", null, null, null], "a fresh bar: the two arts everyone knows");
      assert.equal((await call("/arts/learn", { token: P.token, method: "POST", body: { key: "fire_fireball" } })).status, 409, "nothing in the bag: refused");
      const art = (await adm("/t/art_reqs", { token })).data.filter((r) => r.art_key === "fire_fireball");
      for (const r of art) await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: r.item_key, op: "add", value: r.qty } });
      const tries = await Promise.all(Array.from({ length: 6 }, () => call("/arts/learn", { token: P.token, method: "POST", body: { key: "fire_fireball" } })));
      assert.equal(tries.filter((x) => x.status === 200).length, 1, "six learns at once: one goes through");
      const after = await me(P.token);
      assert.ok(after.character.learned.includes("fire_fireball") && after.character.slots[2] === "fire_fireball", "learned, and on the first empty slot");
      for (const r of art) assert.equal(after.inventory[r.item_key] ?? 0, 0, `${r.item_key} spent once`);
      // two other arts and a repeat of one, all at once: each learned once, every item spent exactly once
      await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: "bk_fire_spirit_flame", op: "add", value: 1 } });
      await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: "bk_fire_flame_pillar", op: "add", value: 1 } });
      await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: "mat_am", op: "add", value: 3 } });
      await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: "mat_hoa", op: "add", value: 6 } });
      await adm(`/players/${pu.id}/items`, { token, method: "POST", body: { item: "mat_linhtuy", op: "add", value: 1 } });
      const two = await Promise.all(["fire_spirit_flame", "fire_flame_pillar", "fire_spirit_flame"].map((key) => call("/arts/learn", { token: P.token, method: "POST", body: { key } })));
      assert.equal(two.filter((x) => x.status === 200).length, 2, "two arts, once each; the repeat is refused");
      const inv2 = (await me(P.token)).inventory;
      assert.ok(!inv2.mat_am && !inv2.mat_hoa && !inv2.mat_linhtuy, "every essence spent exactly once");
      // the bar: unknown arts and the same art twice are refused; a good bar is live in the world at once
      const eq = (slots) => call("/arts/equip", { token: P.token, method: "POST", body: { slots } });
      assert.equal((await eq(["nuke", null, null, null, null])).status, 400);
      assert.equal((await eq(["explosions_nuke", null, null, null, null])).status, 403, "not learned");
      assert.equal((await eq(["fire_fireball", "fire_fireball", null, null, null])).status, 400, "not twice");
      const c3 = await connect(P.token);
      await sleep(300);
      assert.equal((await eq(["fire_fireball", "phikiem", null, "fire_flame_pillar", null])).status, 200);
      await sleep(200);
      assert.deepEqual(c3.msgs.filter((m) => m.t === "arts").pop().slots, ["fire_fireball", "phikiem", null, "fire_flame_pillar", null], "the online player's bar changed");
      send(c3, { t: "cast", s: 1, ax: 1, ay: 0 });
      send(c3, { t: "cast", s: 3, ax: 1, ay: 0 }); // an empty slot does nothing
      await sleep(300);
      const casts = c3.msgs.filter((m) => m.t === "s").flatMap((m) => m.E).filter((e) => e.e === "cast" && e.id === c3.id);
      assert.deepEqual(casts.map((e) => e.a), ["fire_fireball"], "slot 1 casts the fireball; the empty slot nothing");
      assert.ok(c3.me.cd[1] > 1, "and its cooldown runs");
      // an admin takes it back: it leaves the bar too
      await adm(`/players/${pu.id}/arts`, { token, method: "POST", body: { key: "fire_fireball", learn: false } });
      assert.equal((await me(P.token)).character.slots[0], null);
      // drops: a dummy set to always drop two Huyền Thiết Tinh; break it and they are in the bag
      const row = (await adm("/t/monster_drops", { token, method: "POST", body: { monster: "dummy", item_key: "mat_kim", chance: 1, min_qty: 2, max_qty: 2 } })).data;
      try {
        const d = c3.snap.M.find((m) => m[1] === 0);
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
        c3.ws.close();
      }
    }

    assert.equal((await adm(`/players/${u.id}/ban`, { token, method: "POST", body: { banned: true, reason: "thử" } })).status, 200);
    assert.equal((await call("/me", { token: p.token })).status, 401);
    assert.equal((await call("/login", { method: "POST", body: { username: u.username, password: "secret123" } })).status, 403);
  } finally {
    await q("DELETE FROM admins WHERE username = ?", [name]);
  }
  ok("admin site: forced password change, bad numbers refused, an online player's stones add up under concurrent edits, buffs, bảo vật gifts, công pháp (learn once, 5-slot bar, drops) and bans take effect");
}

{
  // the two straw dummies by the market: a cut lands, shows its damage, and leaves the dummy standing with less hp
  const { mapInfo, START_MAP } = await import("../shared/maps/index.js");
  const M = mapInfo(START_MAP);
  assert.equal(M.mobs.filter((m) => m.type === "dummy").length, 2);
  const P = await player(), c = await connect(P.token);
  await sleep(300);
  // a standing one (the công pháp check may just have broken the other)
  const d = c.snap.M.find((m) => m[1] === 0 && !(m[6] & 1));
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
    msg = c.msgs.find((m) => m.t === "portal");
  }
  send(c, { t: "in", dx: 0, jump: false, down: false });
  assert.ok(msg && /mở rộng sau/.test(msg.m), "the way out says the next map is coming");
  await sleep(300);
  p = at();
  assert.ok(!M.portalAt(p[1], p[2]), "stepped back off the arrow");
  c.ws.close();
  ok("the gold arrow at the foot of the east stairs: 'map sẽ mở rộng sau', and you're stepped back off it");
}

console.log(`${passed} checks passed`);
process.exit(0);
