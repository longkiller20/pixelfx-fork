// The pictures of things in the game, one folder per thing, in public/:
//   toc-nam/ toc-nu/ y-phuc-nam/ y-phuc-nu/ vu-khi/ phi-kiem/   <idx>-<name>/hinh.png + thong-tin.json
//   cong-phap/                                                    <n>-<name>/icon.png + thong-tin.json ({ key })
// (only the free parts are there now; tools/arts/icons.mjs makes the art icons, an artist the rest.) The
// folders are listed here, so a new hair style or weapon is just a new folder: its number is the idx the database uses
// (cosmetics.idx, characters.hair...). The list is read again at most every few seconds, and served as /assets.json.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.js";

/** folder -> [kind, gender] as the game names them ("a": for everyone) */
export const PART_DIRS = { "toc-nam": ["hair", "m"], "toc-nu": ["hair", "f"], "y-phuc-nam": ["robe", "m"], "y-phuc-nu": ["robe", "f"], "vu-khi": ["weapon", "a"], "phi-kiem": ["sword", "a"] };
export const ART_DIR = "cong-phap";
const ITEM = /^(\d+)-[a-z0-9]*$/;
const PUB = join(ROOT, "public");

let cache = null, json = "", at = 0;

function readInfo(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "thong-tin.json"), "utf8"));
  } catch {
    return {};
  }
}

function scan() {
  const out = { parts: {}, arts: {} };
  for (const [folder, [kind, g]] of Object.entries(PART_DIRS)) {
    const list = (out.parts[`${kind}_${g}`] = {});
    const base = join(PUB, folder);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const m = ITEM.exec(name);
      if (!m || !existsSync(join(base, name, "hinh.png"))) continue;
      const { idx, ...info } = readInfo(join(base, name));
      list[Number(m[1])] = { dir: `${folder}/${name}`, ...info };
    }
  }
  const base = join(PUB, ART_DIR);
  if (existsSync(base))
    for (const name of readdirSync(base)) {
      if (!ITEM.test(name) || !existsSync(join(base, name, "icon.png"))) continue;
      const { key } = readInfo(join(base, name));
      if (key) out.arts[key] = `${ART_DIR}/${name}`;
    }
  return out;
}

/** { parts: { hair_m: { idx: { dir, ten, dx, dy } }, ..., weapon_a: { idx: { dir, gx, gy, dai } }, sword_a: { idx: { dir, by } } }, arts: { key: dir } } */
export function assets() {
  if (!cache || Date.now() - at > 5000) {
    cache = scan();
    json = JSON.stringify(cache);
    at = Date.now();
  }
  return cache;
}
export const assetsJson = () => (assets(), json);

/** Whether a part exists: kind hair|robe|weapon|sword, g m|f|a. */
export const hasPart = (kind, g, idx) => !!assets().parts[`${kind}_${g}`]?.[idx];
/** The idx numbers there are for a kind, in order. */
export const partIdx = (kind, g) => Object.keys(assets().parts[`${kind}_${g}`] ?? {}).map(Number).sort((a, b) => a - b);
