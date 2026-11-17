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
  const { data } = await call("/register", { method: "POST", body: { username: u, password: "secret123" } });
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
  assert.deepEqual(c.data.character.look, { g: "f", hair: 34, robe: 21 });
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
    assert.equal((await adm(`/players/${u.id}`, { token, method: "PATCH", body: { stones: 777 } })).status, 200);
    assert.equal((await me(p.token)).character.stones, 777);
    assert.equal((await adm(`/players/${u.id}/ban`, { token, method: "POST", body: { banned: true, reason: "thử" } })).status, 200);
    assert.equal((await call("/me", { token: p.token })).status, 401);
    assert.equal((await call("/login", { method: "POST", body: { username: u.username, password: "secret123" } })).status, 403);
  } finally {
    await q("DELETE FROM admins WHERE username = ?", [name]);
  }
  ok("admin site: password change forced first, bad numbers refused, edits and bans take effect");
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
