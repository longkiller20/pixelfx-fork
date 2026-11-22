#!/usr/bin/env node
// Put a new pixelfx figure into the game, or take it out: a whole character for the Y Các, or a world boss. It writes
// shared/them.js (the list of what was added beyond the code), copies the figure into public/hieu-ung (tools/hieu-ung.mjs)
// and, for a character, puts it on sale in the Y Các (the cosmetics table). Restart the game afterwards (the
// dashboard's "Chạy lại game", or the MCP's restart_game) so the server and the browsers see it.
// The figure itself is made first, in the pixelfx library next to the game (../src/fx): with the pixelfx skill, or
// from a picture with `node ../tools/from-image.mjs`.
//
//   node tools/them.mjs list
//   node tools/them.mjs skin add nhanvat/<name> --name "Tên" [--g m|f|a] [--price 500] [--hidden]
//   node tools/them.mjs skin remove nhanvat/<name>          (refused while a player owns it; --force takes it off sale only)
//   node tools/them.mjs boss add boss/<name> --key <key> --name "Tên" [--title "…"] [--colors '{"slam":[…],"roar":[…],"hit":[…]}']
//   node tools/them.mjs boss remove <key>                   (refused while that boss is out)
// Prints one JSON line at the end ({ ok, ... }) for tools that call it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const GAME = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(GAME, "..", "src", "fx");
const FILE = join(GAME, "shared", "them.js");
const args = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) pos.push(a);
  else if (["hidden", "force"].includes(a.slice(2))) flags[a.slice(2)] = true;
  else flags[a.slice(2)] = args[++i];
}
const done = (o) => (console.log(JSON.stringify({ ok: true, ...o })), process.exit(0));
const die = (m) => (console.error(`✖ ${m}`), console.log(JSON.stringify({ ok: false, error: m })), process.exit(1));

// ---- the list, between BEGIN and END
const text = readFileSync(FILE, "utf8");
const m = text.match(/\/\* BEGIN \*\/([\s\S]*?)\/\* END \*\//);
if (!m) die("shared/them.js: no BEGIN/END block");
const THEM = JSON.parse(m[1]);
THEM.skins ??= [];
THEM.bosses ??= [];
const write = () => writeFileSync(FILE, text.replace(m[0], `/* BEGIN */ ${JSON.stringify(THEM, null, 2)} /* END */`));
const copyFx = (id) => execFileSync(process.execPath, [join(GAME, "tools", "hieu-ung.mjs"), id], { cwd: GAME, stdio: ["ignore", "ignore", "inherit"] });
const fxFile = (id) => {
  if (!/^[a-z]+\/[a-z0-9-]+$/.test(id ?? "")) die(`"${id}": an effect id is <category>/<name>`);
  const f = join(SRC, `${id}.js`);
  if (!existsSync(f)) die(`no ${f}: make the figure first (pixelfx skill, or ../tools/from-image.mjs)`);
  return f;
};
const db = async () => (await import("../server/db.js"));

const [what, verb, arg] = pos;
if (what === "list" || !what) {
  console.log(`characters (Y Các):\n${THEM.skins.map((s) => `  ${s.idx}  ${s.fx}  ${s.name}  (${s.g}, ${s.price})`).join("\n") || "  —"}`);
  console.log(`bosses:\n${THEM.bosses.map((b) => `  ${b.key}  ${b.fx}  ${b.name}`).join("\n") || "  —"}`);
  done({ skins: THEM.skins, bosses: THEM.bosses });
}

if (what === "skin" && verb === "add") {
  const f = fxFile(arg);
  if (!arg.startsWith("nhanvat/")) die("a character's figure is nhanvat/<name> (the character rig)");
  const mod = await import(pathToFileURL(f).href);
  if (!mod.FIGURE?.u) die(`${arg} is not a rigged character (no FIGURE from makeFigure): make it with the nhanvat rig`);
  const name = String(flags.name ?? mod.meta?.name ?? "").trim(), g = flags.g ?? "a", price = Number(flags.price ?? 500);
  if (!name || name.length > 40) die("--name: 1-40 characters");
  if (!["m", "f", "a"].includes(g)) die("--g: m, f or a");
  if (!Number.isInteger(price) || price < 0) die("--price: a whole number ≥ 0");
  const key = arg.slice(8), had = THEM.skins.find((s) => s.fx === arg);
  const idx = had?.idx ?? Math.max(2, ...THEM.skins.map((s) => s.idx)) + 1;
  const entry = { idx, key, fx: arg, name, g, price, starter: false };
  THEM.skins = THEM.skins.filter((s) => s.fx !== arg).concat(entry).sort((a, b) => a.idx - b.idx);
  copyFx(arg);
  write();
  // on sale in the Y Các (one row for each gender it can be worn by, as the cosmetics table counts them)
  const { q, pool } = await db();
  for (const gg of g === "a" ? ["a"] : [g])
    await q("INSERT INTO cosmetics (kind, gender, idx, name, price, starter, on_sale, sort) VALUES ('skin', ?, ?, ?, ?, 0, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), on_sale = VALUES(on_sale)", [gg, idx, name, price, flags.hidden ? 0 : 1, idx * 10]);
  await pool.end();
  console.log(`✔ ${name} (idx ${idx}) added; ${flags.hidden ? "not on sale yet" : `on sale for ${price}`}. Restart the game to show it.`);
  done({ added: entry, restart: true });
}

if (what === "skin" && verb === "remove") {
  const s = THEM.skins.find((x) => x.fx === arg || x.key === arg || String(x.idx) === arg);
  if (!s) die(`no added character "${arg}" (see: node tools/them.mjs list)`);
  const { q, pool } = await db();
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM owned_cosmetics o JOIN cosmetics c ON c.id = o.cosmetic_id WHERE c.kind = 'skin' AND c.idx = ?", [s.idx]);
  await q("UPDATE cosmetics SET on_sale = 0 WHERE kind = 'skin' AND idx = ?", [s.idx]);
  if (Number(n) && !flags.force) {
    await pool.end();
    die(`${Number(n)} player(s) own ${s.name}: it is now off sale, but stays in the game (--force to take it off sale only, as now)`);
  }
  if (!Number(n)) {
    await q("DELETE FROM cosmetics WHERE kind = 'skin' AND idx = ?", [s.idx]);
    THEM.skins = THEM.skins.filter((x) => x !== s);
    write();
  }
  await pool.end();
  done({ removed: Number(n) ? null : s, offSale: true, restart: true });
}

if (what === "boss" && verb === "add") {
  const f = fxFile(arg);
  if (!arg.startsWith("boss/")) die("a boss's figure is boss/<name> (the boss rig)");
  const mod = await import(pathToFileURL(f).href);
  if (!mod.FIGURE?.CH) die(`${arg} is not a rigged boss (no FIGURE from makeBoss): make it with the boss rig`);
  const key = String(flags.key ?? "");
  if (!/^[a-z][a-z0-9]{1,15}$/.test(key)) die("--key: 2-16 lower-case letters and digits, no spaces (e.g. hoalong)");
  if (key === "xavuong") die("xavuong is the built-in boss");
  const name = String(flags.name ?? mod.meta?.name ?? "").trim();
  if (!name || name.length > 40) die("--name: 1-40 characters");
  const colors = flags.colors ? JSON.parse(flags.colors) : {
    slam: ["#12040e", "#3a0a2a", "#6a1440", "#b0204a", "#e8506a", "#ffa0b8", "#fff0f4"],
    roar: ["#10030c", "#2e0828", "#5e1048", "#a8205a", "#e84a7a", "#ffa0c8", "#fff0f6"],
    hit: ["#1a0414", "#5a1040", "#c02a5a", "#ff7aa0", "#fff0f4"],
  };
  for (const k of ["slam", "roar", "hit"]) if (colors[k] && !(Array.isArray(colors[k]) && colors[k].every((c) => /^#[0-9a-f]{6}$/i.test(c)))) die(`--colors.${k}: an array of #rrggbb, dark to bright`);
  const F = mod.FIGURE;
  const entry = {
    key, name, title: String(flags.title ?? mod.meta?.desc ?? "").slice(0, 80), fx: arg,
    roarFx: "boss/roar-wave", slamFx: "impacts/ground-slam", hitFx: "impacts/crit-hit", colors,
    // how wide it is either side of its feet (a strike reaches this far), how tall, where its slam lands
    half: Math.round(F.W * 0.43), tall: F.H, slamAt: Math.round(F.W * 0.41),
  };
  THEM.bosses = THEM.bosses.filter((b) => b.key !== key).concat(entry);
  copyFx(arg);
  for (const id of ["boss/roar-wave", "impacts/ground-slam", "impacts/crit-hit"]) copyFx(id);
  write();
  console.log(`✔ boss ${name} (${key}) added. Restart the game, then call it from the admin (Boss tab) or the MCP's spawn_boss.`);
  done({ added: entry, restart: true });
}

if (what === "boss" && verb === "remove") {
  const b = THEM.bosses.find((x) => x.key === arg);
  if (!b) die(`no added boss "${arg}" (see: node tools/them.mjs list)`);
  const { q, pool } = await db();
  const out = await q("SELECT COUNT(*) AS n FROM world_bosses WHERE boss_key = ? AND alive IS NOT NULL", [arg]).catch(() => [{ n: 0 }]);
  await pool.end();
  if (Number(out[0].n)) die(`${b.name} is out now: send it away first (admin Boss tab, or the MCP's despawn_boss)`);
  THEM.bosses = THEM.bosses.filter((x) => x !== b);
  write();
  done({ removed: b, restart: true });
}

die("usage: node tools/them.mjs list | skin add|remove … | boss add|remove … (see the top of this file)");
