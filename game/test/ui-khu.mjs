// The box of Khu in a real browser, against a running server: node test/ui-khu.mjs [http://localhost:5886]
// Fills one Khu to 20 and another to 10 with players over the socket, then in Chromium (Playwright): arriving at the
// lake puts the player in the first Khu with room; the Khu button says which and how many; the box has 30 cells, each
// with its number, x/20 and a dot whose colour follows how full it is (green / yellow / red); the full Khu is locked;
// clicking another moves the player there and the button follows.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/")("playwright"));
}
const BASE = process.argv[2] ?? "http://localhost:5886";
const { q, pool } = await import("../server/db.js");
const { createSession } = await import("../server/auth.js");
const cc = await import("../shared/cau-ca.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString("hex");
let n = 0;
async function person(name) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tu_${tag}_${i}`])).insertId;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', 'm', 8, 16, 1000, 0)", [id, name ?? `U${tag.slice(0, 4)} ${i}`]);
  return createSession(id);
}
const enter = async (token, body) => {
  for (;;) {
    const r = await fetch(BASE + "/api/fishing/enter", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) });
    if (r.status !== 429) return r.status;
    await sleep(1500);
  }
};
const sockets = [];
async function fill(khu, count) {
  await Promise.all(Array.from({ length: count }, async () => {
    const token = await person();
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws", { headers: { origin: BASE } });
    await new Promise((r) => ws.on("open", () => (ws.send(JSON.stringify({ t: "auth", token })), r())));
    sockets.push(ws);
    await sleep(400);
    assert.equal(await enter(token, { khu }), 200);
  }));
}

// two empty Khu at the end: one filled to the brim, one to 10 (yellow)
const occ0 = await (await fetch(BASE + "/api/fishing", { headers: { authorization: "Bearer " + (await person()) } })).json();
const empty = occ0.occ.map((c, i) => [c, i + 1]).filter(([c]) => c === 0).map(([, i]) => i);
const FULL = empty.at(-1), BUSY = empty.at(-2);
await fill(FULL, cc.KHU_CAP);
await fill(BUSY, 10);
await sleep(1500);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((t) => localStorage.setItem("dvtt.token", t), await person("Ngư Thử UI"));
await page.goto(BASE);
await page.waitForSelector("#moreBtn");
await sleep(2500);
await page.click("#moreBtn", { force: true });
await page.click("#fishBtn");
await page.waitForFunction(() => !document.getElementById("fishbar").hidden, null, { timeout: 15000 });
await sleep(1500);
const api = await page.evaluate(async () => (await fetch("/api/fishing", { headers: { authorization: "Bearer " + localStorage.getItem("dvtt.token") } })).json());
const first = api.occ.findIndex((c, i) => i + 1 === api.khu) + 1;
assert.equal(api.khu, first, "in a Khu");
assert.ok(api.occ.slice(0, api.khu - 1).every((c) => c >= cc.KHU_CAP), "the first Khu with room");
const btnText = await page.textContent("#fishbar .khu small");
assert.match(btnText, new RegExp(`^Khu ${api.khu} · \\d+/${cc.KHU_CAP}$`), `the Khu button says where: ${btnText}`);

// the box: 30 cells, number, x/20, dot colour by level, the full one locked
await page.click("#fishbar .khu");
await page.waitForSelector(".ckgrid .ckcell");
const cells = await page.$$eval(".ckgrid .ckcell", (els) => els.map((e) => ({
  n: Number(e.querySelector("b").textContent), c: e.querySelector("small").textContent, dot: getComputedStyle(e.querySelector(".ckdot")).backgroundColor,
  disabled: e.disabled, on: e.classList.contains("on"),
})));
assert.equal(cells.length, cc.KHU_COUNT, "30 cells");
assert.deepEqual(cells.map((c) => c.n), Array.from({ length: cc.KHU_COUNT }, (_, i) => i + 1), "numbered 1-30");
const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const live = await page.evaluate(async () => (await fetch("/api/fishing", { headers: { authorization: "Bearer " + localStorage.getItem("dvtt.token") } })).json());
for (const c of cells) {
  const count = live.occ[c.n - 1];
  assert.equal(c.c, `${count}/${cc.KHU_CAP}`, `Khu ${c.n}: its count`);
  assert.equal(c.dot, rgb(cc.KHU_COLORS[cc.khuLevel(count)]), `Khu ${c.n}: its dot`);
}
assert.equal(cells[FULL - 1].dot, rgb(cc.KHU_COLORS[2]), "a full Khu is red");
assert.equal(cells[BUSY - 1].dot, rgb(cc.KHU_COLORS[1]), "a Khu of 10 is yellow");
assert.ok(cells.some((c) => c.dot === rgb(cc.KHU_COLORS[0])), "an empty one green");
assert.ok(cells[FULL - 1].disabled, "the full Khu is locked");
assert.ok(cells[api.khu - 1].on && cells[api.khu - 1].disabled, "the one one is in is marked");

// clicking another Khu moves there; the button follows
const to = cells.find((c) => !c.disabled && c.n !== BUSY).n;
await page.click(`.ckgrid .ckcell:nth-child(${to})`);
await page.waitForFunction((k) => document.querySelector("#fishbar .khu small").textContent.startsWith(`Khu ${k} ·`), to, { timeout: 15000 });
const after = await page.evaluate(async () => (await fetch("/api/fishing", { headers: { authorization: "Bearer " + localStorage.getItem("dvtt.token") } })).json());
assert.equal(after.khu, to, "moved to the Khu clicked");
// clicking the full one does nothing (it is locked)
await page.click("#fishbar .khu");
await page.waitForSelector(".ckgrid .ckcell");
assert.ok(await page.$eval(`.ckgrid .ckcell:nth-child(${FULL})`, (e) => e.disabled), "still locked");
assert.deepEqual(errors, [], "no page errors");

await browser.close();
for (const s of sockets) s.close();
await pool.end();
console.log(`  ✓ the box of Khu in a browser: put in Khu ${api.khu}, 30 cells with counts and green/yellow/red dots (Khu ${BUSY} yellow, Khu ${FULL} full and locked), moved to Khu ${to} by a click`);
process.exit(0);
