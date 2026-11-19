// Draw every công pháp's icon into its own folder: public/cong-phap/<n>-<name>/icon.png + thong-tin.json ({ key, ten, fx }),
// n being its place in the list (the order the game shows them), <name> its name without accents or spaces. The game
// finds an art's icon through the key in thong-tin.json (server/assets.js), so the folders can be renamed or renumbered
// freely, and an icon replaced by drawing a new icon.png. An art with no folder is drawn in the browser instead.
// Needs the game server running (it serves the modules and the arts): node tools/arts/icons.mjs [http://localhost:5886]
// Run it again after adding an art (shared/cong-phap.js) or changing its icon effect; it redraws every folder it made (others are left alone).
import { createRequire } from "node:module";
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/")("playwright"));
}
const BASE = process.argv[2] ?? "http://localhost:5886";
const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
const OUT = join(PUB, "cong-phap");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page:", e.message));
await page.goto(BASE + "/js/arts.js");
const arts = await page.evaluate(async () => {
  const { renderIcon, FIXED } = await import("/js/arts.js");
  const bal = await import("/shared/balance.js");
  bal.applyConfig(await (await fetch("/api/config")).json());
  const list = Object.values(bal.ARTS).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  return list.map((a) => {
    let png = null;
    if (!FIXED[a.key])
      try {
        png = renderIcon(a.icon)?.toDataURL("image/png") ?? null;
      } catch {}
    return { key: a.key, name: a.name, fx: a.icon, fixed: FIXED[a.key] ?? null, png };
  });
});
await browser.close();

// clear what an earlier run made (numbered folders with our files), then write every art's folder
mkdirSync(OUT, { recursive: true });
for (const d of readdirSync(OUT))
  if (/^\d+-[a-z0-9]*$/.test(d) && existsSync(join(OUT, d, "thong-tin.json"))) rmSync(join(OUT, d), { recursive: true });
let n = 0, none = 0;
arts.forEach((a, i) => {
  const dir = join(OUT, `${i + 1}-${slug(a.name)}`);
  if (!a.png && !a.fixed) return void none++;
  mkdirSync(dir, { recursive: true });
  if (a.fixed) copyFileSync(join(PUB, a.fixed), join(dir, "icon.png"));
  else writeFileSync(join(dir, "icon.png"), Buffer.from(a.png.split(",")[1], "base64"));
  writeFileSync(join(dir, "thong-tin.json"), JSON.stringify({ key: a.key, ten: a.name, fx: a.fx }, null, 2) + "\n");
  n++;
});
// down to 256 colours each (a fraction of the size, no visible change) when Python's Pillow is there
try {
  execFileSync("python3", ["-c",
    "import sys,glob;from PIL import Image\nfor f in glob.glob(sys.argv[1]+'/*/icon.png'):\n i=Image.open(f).convert('RGBA');i.quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(f,optimize=True)",
    OUT]);
} catch {
  console.log("(Pillow not found: icons kept in full colour)");
}
console.log(`${n} công pháp icons in public/cong-phap/${none ? `, ${none} draw nothing (drawn in the browser)` : ""}`);
