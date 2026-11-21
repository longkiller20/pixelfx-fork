// The lake's buttons in a real browser, against a running server: node test/ui-peace.mjs [http://localhost:5886] [shots dir]
// On the fishing lake (a peaceful map) the fight buttons (attack, arts, pills, flying sword) are hidden and the fishing
// buttons stand in their place in the bottom-right corner (they are there off the lake); the attack, art and sword keys
// send nothing there, K opens the box of Khu and Q the Ngư Cụ panel. On a computer and on a phone (touch).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require("playwright"));
} catch {
  ({ chromium, devices } = createRequire("/opt/")("playwright"));
}
const BASE = process.argv[2] ?? "http://localhost:5886", SHOTS = process.argv[3];
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString("hex");
let n = 0;
async function person() {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tp_${tag}_${i}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', 'm', 8, 16, 999999999, 0)", [id, `Hồ ${tag} ${i}`]);
  return createSession(id);
}
const shown = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && !e.closest("[hidden]"); }).catch(() => false);

const browser = await chromium.launch();
for (const [label, ctx] of [["computer", { viewport: { width: 1280, height: 720 } }], ["phone", { ...devices["Pixel 7"], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }]]) {
  const page = await (await browser.newContext(ctx)).newPage();
  const errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (ws) => ws.on("framesent", (f) => typeof f.payload === "string" && sent.push(f.payload)));
  await page.addInitScript((t) => localStorage.setItem("dvtt.token", t), await person());
  await page.goto(BASE);
  await page.waitForSelector("#moreBtn");
  await sleep(2500);
  // elsewhere: the fight buttons are there
  assert.ok(await shown(page, '.skills [data-skill="0"]'), `${label}: the attack button off the lake`);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains("peace"))), `${label}: not peaceful off the lake`);
  await page.click("#moreBtn", { force: true });
  await page.click("#fishBtn");
  await page.waitForFunction(() => !document.getElementById("fishbar").hidden, null, { timeout: 15000 });
  await sleep(1500);
  // at the lake: no fight buttons, the fishing ones in their place
  assert.ok(await page.evaluate(() => document.body.classList.contains("peace")), `${label}: the lake is peaceful`);
  for (const sel of ['[data-skill="0"]', '[data-skill="1"]', '[data-skill="5"]', '[data-item="hoixuan"]', '[data-item="tukhi"]', "#flyBtn"]) assert.ok(!(await shown(page, sel)), `${label}: ${sel} hidden at the lake`);
  for (const sel of ["#fishbar .fact", "#fishbar .shop", "#fishbar .khu"]) assert.ok(await shown(page, sel), `${label}: ${sel} shown`);
  const vw = await page.evaluate(() => [innerWidth, innerHeight]);
  const big = await page.$eval("#fishbar .fact", (e) => e.getBoundingClientRect().toJSON());
  const att = await page.evaluate(() => { const s = document.querySelector(".skills"); s.style.setProperty("display", "block", "important"); const r = s.querySelector('[data-skill="0"]').getBoundingClientRect().toJSON(); s.style.removeProperty("display"); return r; });
  // the big fishing button stands about where the attack button does (its centre within a quarter of its size)
  const c = (r) => [r.x + r.width / 2, r.y + r.height / 2];
  const [bx, by] = c(big), [ax, ay] = c(att);
  assert.ok(Math.abs(bx - ax) < big.width / 4 && Math.abs(by - ay) < big.height / 4, `${label}: the big button where the attack is (${bx | 0},${by | 0} vs ${ax | 0},${ay | 0})`);
  // every fishing button inside the screen, none over another
  const rects = await page.$$eval("#fishbar > button:not([hidden])", (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.right <= vw[0] + 1 && r.bottom <= vw[1] + 1, `${label}: a button off the screen ${JSON.stringify(r)}`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${label}: buttons ${i} and ${j} overlap`);
  }
  // the attack and art keys send nothing to fight with; F does not take to the sword
  if (label === "computer") {
    sent.length = 0;
    await page.click("#view", { position: { x: 300, y: 200 } });
    for (const k of ["k", "l", "u", "i", "o", "1", "2", "f"]) await page.keyboard.press(k);
    await sleep(400);
    assert.ok(!sent.some((s) => /"t":"(cast|fly)"/.test(s)), `${label}: no cast or fly sent at the lake: ${sent.filter((s) => /cast|fly/.test(s))}`);
    // K opens the box of Khu, Escape closes it; Q opens Ngư Cụ
    await page.keyboard.press("k");
    await page.waitForSelector(".ckgrid .ckcell");
    await page.keyboard.press("Escape");
    await page.keyboard.press("q");
    await page.waitForFunction(() => !document.getElementById("panel").hidden && !!document.querySelector("#panel .ccp"), null, { timeout: 5000 });
    await page.click("#panelClose");
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/peace-${label}.png` });
  assert.deepEqual(errors, [], `${label}: no page errors`);
  console.log(`  ✓ ${label}: at the lake the fight buttons are hidden, the fishing buttons stand in their place (big one where the attack is), nothing overlaps or leaves the screen`);
}
await browser.close();
await pool.end();
process.exit(0);
