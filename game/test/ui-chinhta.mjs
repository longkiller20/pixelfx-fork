// Chính Tà Phân Tranh in a real browser, against a running server: node test/ui-chinhta.mjs [http://localhost:5886] [shots dir]
// A new account makes a character: no side, no character; Tà Phái picked, made in it. In ▦ Thêm → Chính Tà: the side's
// card, the next battle, signing up (the count goes up); the Tiệm Chính Tà with its note. The battle (started by the admin,
// with a few players over sockets): the browser is brought onto the battlefield, the score bar with both emblems, Tab
// opens the board with its own row; the end: the result with the winner and the points; back where it was, the bar gone.
// Leaving the field (computer): confirm, taken back, no points. On a computer and on a phone held sideways.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require("playwright"));
} catch {
  ({ chromium, devices } = createRequire("/opt/")("playwright"));
}
const BASE = process.argv[2] ?? "http://localhost:5886", SHOTS = process.argv[3];
const ADMIN = process.env.ADMIN_URL ?? BASE.replace(/:\d+$/, ":5885");
const { q, pool } = await import("../server/db.js");
const { createSession, hashPassword } = await import("../server/auth.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString("hex");
let n = 0;
async function bot(f) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`uc_${tag}_${i}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, faction) VALUES (?, ?, 'tu', 'm', 8, 16, 30000, ?)", [id, `Bot${tag.slice(0, 4)}${i}`, f]);
  const token = await createSession(id), ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ t: "auth", token }));
  await sleep(300);
  await fetch(BASE + "/api/chinhta/register", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: "{}" });
  return ws;
}
const aname = "t_auc_" + tag, apw = "tamthoi123";
await q("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [aname, await hashPassword(apw)]);
const atok = (await (await fetch(ADMIN + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: aname, password: apw }) })).json()).token;
const adm = async (path, body, method = "POST") => {
  const r = await fetch(ADMIN + "/api" + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + atok }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const RUN = { "chinhta.prep": 2, "chinhta.min_side": 1, "chinhta.level": 1 };
const old = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k IN (?)", [Object.keys(RUN)])).map((r) => [r.k, r.v]));
for (const [k, v] of Object.entries(RUN)) assert.equal((await adm(`/t/settings/${k}`, { v }, "PATCH")).status, 200);
if ((await adm("/chinhta", null, "GET")).data.now) await adm("/chinhta/cancel", {});

const browser = await chromium.launch();
const socks = [];
try {
  for (const [label, ctx] of [["computer", { viewport: { width: 1280, height: 720 } }], ["phone", { ...devices["Pixel 7"], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }]]) {
    const uid = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`uc_${tag}_p${label[0]}`])).insertId;
    const token = await createSession(uid);
    const page = await (await browser.newContext(ctx)).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((t) => localStorage.setItem("dvtt.token", t), token);
    await page.goto(BASE);
    // ---- making the character: the side is required
    await page.waitForSelector("#sides .side");
    assert.equal(await page.locator("#sides .side canvas").count(), 2, "both emblems drawn");
    await page.fill("#charName", `Tà ${tag.slice(0, 4)}${label[0]}`);
    await page.click("#createForm button.primary");
    await page.waitForFunction(() => /Chính Phái hoặc Tà Phái/.test(document.getElementById("createErr").textContent));
    await page.click('#sides .side[data-f="t"]');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chinhta-create-${label}.png` });
    await page.click("#createForm button.primary");
    await page.waitForSelector("#moreBtn");
    assert.equal((await q("SELECT faction FROM characters WHERE user_id = ?", [uid]))[0].faction, "t", "made in Tà Phái");
    await q("UPDATE characters SET exp = 30000 WHERE user_id = ?", [uid]);
    await sleep(2000);
    // ---- the panel: the side, signing up, the shop's note
    const openPanel = async () => {
      // the map has loaded (arriving back from the field, it is drawn again first)
      await page.waitForSelector("#loading", { state: "hidden" });
      await sleep(300);
      await page.click("#moreBtn", { force: true });
      await page.click("#ctBtn");
      await page.waitForSelector("#panel .ctp");
    };
    await openPanel();
    assert.match(await page.textContent(".ctme"), /Tà Phái/);
    const before = await page.textContent(".ctreg .f-t");
    await page.click(".ctnext .cbtns .primary");
    await page.waitForSelector(".ctnext .cbtns .ghost");
    assert.notEqual(await page.textContent(".ctreg .f-t"), before, "the count went up");
    assert.match(await page.textContent(".ctnext"), /Đã đăng ký cho Tà Phái/);
    // a phone held sideways: the whole tab shows at once, two columns, nothing to scroll
    if (label === "phone") {
      assert.ok(await page.$(".ctp.short .ctwar.cols"), "the short layout in two columns");
      const over = await page.evaluate(() => [...document.querySelectorAll("#panel *")].filter((e) => e.getClientRects().length && e.checkVisibility() && e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => `${e.id} ${e.className} ${e.scrollHeight}/${e.clientHeight}`).join("; "));
      assert.equal(over, "", "nothing scrolls in the Chính Tà panel on a phone");
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chinhta-panel-${label}.png` });
    await page.click(".ctp .ctabs button:nth-child(2)");
    assert.match(await page.textContent(".ctnote"), /phát triển thêm sau/);
    assert.match(await page.textContent(".ctnote"), /tích lũy điểm/);
    const wide = await page.evaluate(() => [...document.querySelectorAll("#panel .ctp *")].some((e) => e.getBoundingClientRect().right > (document.body.classList.contains("rotated") ? innerHeight : innerWidth) + 2));
    assert.ok(!wide, `${label}: nothing past the screen's edge`);
    await page.click("#panelClose");
    // ---- the battle: a Chính and a Tà over sockets
    socks.push(await bot("c"), await bot("t"));
    const st = await adm("/chinhta/start", {});
    assert.equal(st.status, 200, JSON.stringify(st.data));
    await page.waitForSelector("#ctbar .ctsc", { timeout: 10000 });
    assert.ok(await page.evaluate(() => document.body.classList.contains("war")), "on the battlefield");
    assert.equal(await page.locator("#ctbar canvas").count(), 2, "both emblems on the bar");
    await page.waitForFunction(() => /Giao chiến/.test(document.querySelector("#ctbar .cttime")?.textContent ?? ""), null, { timeout: 8000 });
    if (label === "computer") {
      await page.keyboard.press("Tab");
      await page.waitForSelector("#ctboard .ctrow.mine");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chinhta-board-${label}.png` });
      await page.keyboard.press("Tab");
      assert.equal(await page.locator("#ctboard").count(), 0, "Tab closes the board");
    } else {
      await page.click("#ctbar .ctbtns button:first-child");
      await page.waitForSelector("#ctboard .ctrow.mine");
      await page.click("#ctboard", { position: { x: 5, y: 5 } });
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chinhta-field-${label}.png` });
    // ---- the end: the result, then back
    assert.equal((await adm("/chinhta/end", {})).status, 200);
    await page.waitForSelector("#ctend h2");
    assert.match(await page.textContent("#ctend h2"), /HÒA|THẮNG/);
    assert.match(await page.textContent("#ctend .cteme"), /điểm Chính Tà/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chinhta-end-${label}.png` });
    await page.waitForFunction(() => !document.body.classList.contains("war") && !document.getElementById("ctbar"), null, { timeout: 20000 });
    // the record in the panel
    await openPanel();
    await page.click(".ctp .ctabs button:nth-child(3)");
    await page.waitForSelector(".cthrow");
    await page.click("#panelClose");
    // ---- leaving the field (computer): confirm, back, no points
    if (label === "computer") {
      await openPanel();
      await page.click(".ctp .ctabs button:nth-child(1)");
      await page.click(".ctnext .cbtns .primary");
      await page.waitForSelector(".ctnext .cbtns .ghost");
      await page.click("#panelClose");
      socks.push(await bot("c"));
      assert.equal((await adm("/chinhta/start", {})).status, 200);
      await page.waitForSelector("#ctbar .ctbtns .danger", { timeout: 10000 });
      const pts = Number((await q("SELECT ct_points FROM characters WHERE user_id = ?", [uid]))[0].ct_points);
      await page.click("#ctbar .ctbtns .danger");
      await page.click(".cbox .cbtns .primary");
      await page.waitForFunction(() => !document.body.classList.contains("war") && !document.getElementById("ctbar"), null, { timeout: 10000 });
      await adm("/chinhta/end", {});
      await sleep(500);
      assert.equal(Number((await q("SELECT ct_points FROM characters WHERE user_id = ?", [uid]))[0].ct_points), pts, "who left gets nothing");
      await sleep(13000);
    } else await sleep(1000);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await page.context().close();
    console.log(`  ✓ ${label}: the side required at creation (Tà picked); signed up from the panel, the Tiệm's note; brought onto the field, the score bar and board; the result with the points; back, the record${label === "computer" ? "; leaving the field: back, no points" : ""}`);
  }
} finally {
  for (const s of socks) s.close();
  for (const [k, v] of Object.entries(old)) await adm(`/t/settings/${k}`, { v }, "PATCH");
  if ((await adm("/chinhta", null, "GET")).data.now) await adm("/chinhta/cancel", {});
  await q("DELETE FROM admins WHERE username = ?", [aname]);
}
await browser.close();
await pool.end();
process.exit(0);
