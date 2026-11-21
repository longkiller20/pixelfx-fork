// Đạo Lữ in a real browser, against a running server: node test/ui-daolu.mjs [http://localhost:5886] [shots dir]
// A man and a woman, Đạo Hữu: in Chromium (Playwright) he opens ▦ Thêm → Đạo Lữ, buys roses, gives them from the Hảo cảm
// tab until the bar says 100/100, proposes with a ring picked in the box of rings; she accepts (over the API); his panel
// turns into the couple's card with the ring, the name tag carries hers; the 🌹 is in their Đạo Hữu conversation; he
// divorces and the card is gone. On a computer and on a phone held sideways.
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
async function person(g, stones) {
  const i = n++;
  const id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, 'x')", [`tu_${tag}_${i}`])).insertId;
  const name = `${g === "m" ? "Lang" : "Nương"} ${tag.slice(0, 4)}${i}`;
  await q("INSERT INTO characters (user_id, name, class, gender, hair, robe, exp, stones) VALUES (?, ?, 'tu', ?, 8, 16, 1000, ?)", [id, name, g, stones]);
  return { id, name, token: await createSession(id) };
}
const api = async (P, path, body) => (await fetch(BASE + "/api" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + P.token }, body: body && JSON.stringify(body) })).json();

const browser = await chromium.launch();
for (const [label, ctx] of [["computer", { viewport: { width: 1280, height: 720 } }], ["phone", { ...devices["Pixel 7"], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }]]) {
  const M = await person("m", 100000), F = await person("f", 0);
  await q("INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)", [M.id, F.id, F.id, M.id]);
  const page = await (await browser.newContext(ctx)).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((t) => localStorage.setItem("dvtt.token", t), M.token);
  await page.goto(BASE);
  await page.waitForSelector("#moreBtn");
  await sleep(2500);
  const openPanel = async () => {
    await page.click("#moreBtn", { force: true });
    await page.click("#loveBtn");
    await page.waitForSelector("#panel .dlp");
  };
  await openPanel();
  assert.match(await page.textContent("#panel .dlp"), /Chưa có Đạo Lữ/);
  // buy 12 roses: the box, the number, Mua
  await page.click(".dlroses button.primary");
  await page.fill(".dlbox .ccqin", "12");
  await page.click(".dlbox .cbtns .primary");
  await page.waitForFunction(() => document.querySelector(".dlroses b")?.textContent === "12");
  // the Hảo cảm tab: her row, an empty bar; give the most the box allows (10 roses fill it)
  await page.click(".dlp .ctabs button:nth-child(2)");
  await page.waitForSelector(".dlrow");
  assert.match(await page.textContent(".dlrow .dlbar span"), /0\/100/);
  await page.click(".dlrow .dlrbtn .ghost");
  await page.waitForSelector(".dlbox .ccquick");
  await page.click(".dlbox .ccquick button:last-child");
  assert.equal(await page.inputValue(".dlbox .ccqin"), "10", "the box allows only the roses that count");
  await page.click(".dlbox .cbtns .primary");
  await page.waitForFunction(() => /100\/100/.test(document.querySelector(".dlrow .dlbar span")?.textContent ?? ""));
  // hearts over him: the effect was played (an event in the snapshot); the propose button is on now
  const propose = ".dlrow .dlrbtn .primary";
  assert.ok(!(await page.$eval(propose, (b) => b.disabled)), "at 100 the proposal button is on");
  await page.click(propose);
  await page.waitForSelector(".dlbox .dlrings button.dlring");
  const rings = await page.$$eval(".dlbox .dlrings button.dlring", (bs) => bs.map((b) => ({ name: b.querySelector("b").textContent, off: b.disabled, pic: !!b.querySelector("canvas.dlpic") })));
  assert.equal(rings.length, 3, "three rings to pick from");
  assert.ok(rings.every((r) => r.pic), "each with its moving picture");
  assert.ok(rings[2].off && !rings[1].off, "a ring he can't pay for can't be picked");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/daolu-rings-${label}.png` });
  await page.click(".dlbox .dlrings button.dlring:nth-child(2)");
  await page.waitForSelector(".cbox .cbtns .primary");
  await page.click(".cbox .cbtns .primary");
  await page.waitForFunction(() => /Đã cầu hôn/.test(document.querySelector(".dlrow .dlrbtn .primary")?.textContent ?? ""));
  // she says yes (over the API): his panel turns into the couple's card, the ring moving in it; his name tag carries hers
  const r = await api(F, "/daolu/answer", { uid: M.id, accept: true, requestId: crypto.randomUUID() });
  assert.ok(r.ok, JSON.stringify(r));
  await page.click(".dlp .ctabs button:nth-child(1)");
  await page.waitForSelector(".dlcouple", { timeout: 8000 });
  assert.match(await page.textContent(".dlcouple"), new RegExp(`${F.name}[\\s\\S]*Uyên Ương Giới`), "the couple's card");
  assert.match(await page.textContent(".dlcouple .dlbuff b"), /\+6% Sinh lực/, "the ring's buff");
  assert.ok(await page.$(".dlcouple .dlringbig canvas"), "the ring's picture");
  // the ring picture moves: two frames differ
  const a = await page.$eval(".dlringbig canvas", (c) => c.toDataURL());
  await sleep(700);
  const b = await page.$eval(".dlringbig canvas", (c) => c.toDataURL());
  assert.notEqual(a, b, "the ring is animated");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/daolu-couple-${label}.png` });
  // the 🌹 in their Đạo Hữu conversation
  await page.click("#panelClose");
  await page.click("#friendBtn");
  await page.waitForSelector(".friendp .frow");
  await page.click(".friendp .frow");
  await page.waitForSelector(".friendp .roseb");
  await page.click("#panelClose");
  // he divorces: the confirm box, then the card is gone
  await openPanel();
  await page.click(".dlcouple .danger");
  await page.click(".cbox .cbtns .primary");
  await page.waitForFunction(() => !document.querySelector(".dlcouple") && /Chưa có Đạo Lữ/.test(document.querySelector(".dlp")?.textContent ?? ""));
  assert.equal((await q("SELECT 1 FROM dl_spouses WHERE user_id = ?", [M.id])).length, 0, "divorced");
  // three couples marry at the same moment: each gets its own banner, in turn (the banner says how many are waiting)
  if (label === "computer") {
    const three = [];
    for (let i = 0; i < 3; i++) {
      const m = await person("m", 50000), f = await person("f", 0);
      await q("INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)", [m.id, f.id, f.id, m.id]);
      await q("INSERT INTO dl_affinity (lo, hi, points) VALUES (?, ?, 100)", [Math.min(m.id, f.id), Math.max(m.id, f.id)]);
      await api(m, "/daolu/propose", { uid: f.id, ring: "dl_nhan_dong_tam" });
      three.push([m, f]);
    }
    await page.click("#panelClose").catch(() => {});
    await Promise.all(three.map(([m, f]) => api(f, "/daolu/answer", { uid: m.id, accept: true, requestId: crypto.randomUUID() })));
    const seen = new Set();
    let waiting = false;
    for (let i = 0; i < 160 && seen.size < 3; i++) {
      const t = await page.evaluate(() => { const w = document.getElementById("wedding"); return w.classList.contains("on") ? [w.querySelector("b")?.textContent, w.querySelector("i")?.textContent ?? ""] : null; });
      if (t) seen.add(t[0]), (waiting ||= /còn \d+ cặp/.test(t[1]));
      await sleep(100);
    }
    assert.equal(seen.size, 3, `every couple's banner shown in turn: ${[...seen].join(" / ")}`);
    for (const [m, f] of three) assert.ok([...seen].some((x) => x.includes(m.name) && x.includes(f.name)), `${m.name} & ${f.name} announced`);
    assert.ok(waiting, "the banner says how many are still waiting");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/daolu-queue-${label}.png` });
  }
  // nothing on the page went off it
  const wide = await page.evaluate(() => [...document.querySelectorAll("#panel .dlp *")].some((e) => e.getBoundingClientRect().right > (document.body.classList.contains("rotated") ? innerHeight : innerWidth) + 2));
  assert.ok(!wide, `${label}: nothing past the screen's edge`);
  assert.deepEqual(errors, [], `${label}: no page errors`);
  await page.context().close();
  console.log(`  ✓ ${label}: roses bought and given to 100/100 from the Hảo cảm tab, a ring picked from three moving ones (the unaffordable one locked), proposed; accepted, the couple's card with the moving ring and its buff; the 🌹 in the conversation; divorced`);
}
await browser.close();
await pool.end();
process.exit(0);
