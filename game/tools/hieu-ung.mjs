// Copy the pixel effects the game uses, and nothing else, from the pixelfx library (../src) into public/hieu-ung/:
//   public/hieu-ung/core/            pixelfx's engine (frames, painter, colours...), all of it
//   public/hieu-ung/fx/<loại>/<tên>.js   each effect the game uses, with the helpers it needs (_lib.js...)
//   public/hieu-ung/fx/index.js      the list of those effects, by id ("fire/fireball")
// The browser loads /hieu-ung/..., so the game no longer reaches into pixelfx at all.
//
// What the game uses: every effect the arts draw (shared/cong-phap.js), and every effect id written in the game's code and
// data (monsters and their shots in shared/balance.js, the maps' scenery, the warp, level-up, loot beam...). Effects
// already in public/hieu-ung stay (an admin may have chosen one for a new art), unless --lam-moi starts over.
//
//   node tools/hieu-ung.mjs                     bring the folder up to date
//   node tools/hieu-ung.mjs fire/candle ...     also add these effects (for an art or monster an admin made)
//   node tools/hieu-ung.mjs --lam-moi           only what the game uses now; anything else is removed
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync, cpSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONG_PHAP_FX } from "../shared/cong-phap.js";

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(GAME, "..", "src");
const OUT = join(GAME, "public", "hieu-ung");
const args = process.argv.slice(2), fresh = args.includes("--lam-moi");
const ID = /^[a-z]+\/[a-z0-9-]+$/;

if (!existsSync(join(SRC, "fx", "index.js"))) throw new Error(`pixelfx not found at ${SRC}`);
const exists = (id) => existsSync(join(SRC, "fx", id + ".js"));

// ---- which effects
const want = new Set(CONG_PHAP_FX);
// every "category/name" string in the game's code and data that names a pixelfx effect
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
for (const f of [...walk(join(GAME, "shared")), ...walk(join(GAME, "public", "js")), join(GAME, "server", "world.js")]) {
  if (!f.endsWith(".js")) continue;
  for (const [, id] of readFileSync(f, "utf8").matchAll(/["'`]([a-z]+\/[a-z0-9-]+)["'`]/g)) if (exists(id)) want.add(id);
}
for (const id of args.filter((a) => !a.startsWith("--"))) {
  if (!ID.test(id) || !exists(id)) throw new Error(`no such effect in pixelfx: ${id}`);
  want.add(id);
}
const had = existsSync(join(OUT, "fx")) ? readdirSync(join(OUT, "fx")).filter((c) => statSync(join(OUT, "fx", c)).isDirectory())
  .flatMap((c) => readdirSync(join(OUT, "fx", c)).filter((n) => n.endsWith(".js") && !n.startsWith("_")).map((n) => `${c}/${n.slice(0, -3)}`)) : [];
if (!fresh) for (const id of had) if (exists(id)) want.add(id);

// ---- the files they need: each effect and whatever it imports, followed through (core is copied whole)
const files = new Set();
const follow = (abs) => {
  if (files.has(abs)) return;
  files.add(abs);
  for (const [, spec] of readFileSync(abs, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const dep = resolve(dirname(abs), spec);
    if (!dep.startsWith(join(SRC, "core"))) follow(dep);
  }
};
for (const id of want) follow(join(SRC, "fx", id + ".js"));

rmSync(OUT, { recursive: true, force: true });
cpSync(join(SRC, "core"), join(OUT, "core"), { recursive: true });
for (const f of files) {
  const to = join(OUT, relative(SRC, f));
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(f));
}
const ids = [...want].sort();
const name = (id) => id.replace(/[/-]/g, "_");
writeFileSync(join(OUT, "fx", "index.js"),
  `// Made by tools/hieu-ung.mjs: the effects the game uses, by id. Don't edit; run \`node tools/hieu-ung.mjs\`.\n\n` +
  ids.map((id) => `import * as ${name(id)} from "./${id}.js";`).join("\n") +
  `\n\nexport const effects = {\n${ids.map((id) => `  "${id}": ${name(id)},`).join("\n")}\n};\n`);
writeFileSync(join(OUT, "danh-sach.json"), JSON.stringify(ids, null, 1) + "\n");
const gone = had.filter((id) => !want.has(id));
console.log(`public/hieu-ung: ${ids.length} effects, ${files.size} files besides core${gone.length ? `; removed ${gone.join(", ")}` : ""}`);
