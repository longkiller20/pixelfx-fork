// Draw the icon of every pixelfx effect into one sheet, so the Công Pháp panel and the skill bar show them all at once
// instead of drawing 200+ effects in the player's browser (slow on a phone while the game runs, so some came late or
// not at all). Writes public/arts/icons.png and icons.json ({ cell, cols, v, fx: { effect id: index, -1 if it draws
// nothing } }). Needs the game server running (it serves the modules): node tools/arts/icons.mjs [http://localhost:5886]
// Run again after adding effects to pixelfx; an effect missing from the sheet is still drawn in the browser.
import { createRequire } from "node:module";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/")("playwright"));
}
const BASE = process.argv[2] ?? "http://localhost:5886";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "arts");

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page:", e.message));
// any page of the game will do: the modules are what we need
await page.goto(BASE + "/js/arts.js");
const out = await page.evaluate(async () => {
  const { renderIcon } = await import("/js/arts.js");
  const { effects } = await import("/pixelfx/fx/index.js");
  const ids = Object.keys(effects).sort(), CELL = 64, COLS = 16;
  const fx = {}, drawn = [];
  for (const id of ids) {
    let c = null;
    try {
      c = renderIcon(id);
    } catch {}
    if (c) (fx[id] = drawn.length), drawn.push(c);
    else fx[id] = -1;
  }
  const sheet = document.createElement("canvas");
  sheet.width = COLS * CELL;
  sheet.height = Math.ceil(drawn.length / COLS) * CELL;
  const g = sheet.getContext("2d");
  drawn.forEach((c, i) => g.drawImage(c, (i % COLS) * CELL, Math.floor(i / COLS) * CELL));
  return { png: sheet.toDataURL("image/png"), meta: { cell: CELL, cols: COLS, fx } };
});
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "icons.png"), Buffer.from(out.png.split(",")[1], "base64"));
// down to 256 colours (a fifth of the size, no visible change) when Python's Pillow is there
try {
  require("node:child_process").execFileSync("python3", ["-c",
    "import sys;from PIL import Image;i=Image.open(sys.argv[1]);i.quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(sys.argv[1],optimize=True)",
    join(OUT, "icons.png")]);
} catch {
  console.log("(Pillow not found: the sheet is kept in full colour)");
}
const png = readFileSync(join(OUT, "icons.png"));
// v changes with the picture, so a browser never keeps an old sheet
const v = require("node:crypto").createHash("sha1").update(png).digest("hex").slice(0, 8);
writeFileSync(join(OUT, "icons.json"), JSON.stringify({ v, ...out.meta }));
const n = Object.values(out.meta.fx);
console.log(`${n.filter((i) => i >= 0).length} icons drawn, ${n.filter((i) => i < 0).length} effects draw nothing; ${(png.length / 1024).toFixed(0)} KB`);
