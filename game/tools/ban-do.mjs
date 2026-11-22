#!/usr/bin/env node
// Maps made beyond the code: check one, picture it, put it into the game or take it out. A map is a JSON definition with
// the fields of the maps in shared/maps/*.js (see tanthu.js); this tool refuses anything the game could not load or a
// player could get stuck in, and warns about what is probably a mistake. Saved maps go into shared/maps/them.js; the game
// shows them after a restart (the dashboard's "Chạy lại game", or the MCP's restart_game).
//
//   node tools/ban-do.mjs assets                       what a map may use (tiles, props, pictures, music, effects, monsters)
//   node tools/ban-do.mjs list                         the maps there are (code and added)
//   node tools/ban-do.mjs get <id>                     a map's whole definition as JSON (a model to start from)
//   node tools/ban-do.mjs check <map.json>             problems (refused) and warnings
//   node tools/ban-do.mjs preview <map.json | id> [--out file.png]   a picture of its layout, with what stands where
//   node tools/ban-do.mjs add <map.json> [--replace]   check, then save it (--replace: change a map added before)
//   node tools/ban-do.mjs remove <id>                  take an added map out (its placed monsters too; not while a boss is on it)
// Prints one JSON line at the end ({ ok, ... }) for tools that call it.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GAME = join(dirname(fileURLToPath(import.meta.url)), "..");
// file arguments as given, then the game's folder (its .env holds the database's address)
const HERE = process.cwd();
const FILE = join(GAME, "shared", "maps", "them.js");
const args = process.argv.slice(2).map((a) => (/\.(json|png)$/.test(a) && !a.startsWith("/") ? join(HERE, a) : a)), flags = {}, pos = [];
process.chdir(GAME);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) pos.push(a);
  else if (["replace", "no-db"].includes(a.slice(2))) flags[a.slice(2)] = true;
  else flags[a.slice(2)] = args[++i];
}
const done = (o) => (console.log(JSON.stringify({ ok: true, ...o })), process.exit(0));
const die = (m, extra = {}) => (console.error(`✖ ${m}`), console.log(JSON.stringify({ ok: false, error: m, ...extra })), process.exit(1));

// ---------------------------------------------------------------- what a map may use
export const TILES = {
  ".": "air",
  "#": "earth (grass on top where open above): solid",
  s: "stone (terraces, steps, walls): solid",
  r: "red clay: solid",
  "=": "cloud: stand on it from above, jump up through it, down + jump drops through",
  k: "ledge drawn from the map's platform set (theme.platform): like a cloud",
  b: "wooden bridge: like a cloud, water drawn under it when there is",
  w: "water (scenery: players walk on the floor under it)",
  l: "lava (like water; with hurt: { cell: \"l\", hit } it burns)",
  "|": "waterfall (scenery)",
};
const SOLID = new Set(["#", "s", "r"]), PLANK = new Set(["=", "b", "k"]);
const standOn = (c) => SOLID.has(c) || PLANK.has(c);
// [kind, x, floor row, options]: what the browser draws standing on the floor of that row (public/js/scenery.js)
export const PROPS = {
  xx: "a picture from the Xianxia pack: { n: picture name (assets.pictures), s: shrink 1-6 (1 = full size, big trees 2, small deco 4-5), f: 1 mirror, dy: sink px, tint: \"#rrggbb\", k: 0-1 how much tint, d: 0-1 darken }",
  fx: "a pixelfx effect looping there: { id: effect in the game (assets.effects), h: px above the floor, k: size 0.5-3, f: 1 mirror, every: s between plays (0 = always) }",
  glow: "a light painted over the scene: { h: px above the floor, r: radius px (≤ 240), c: \"#rrggbb\", a: 0-1 strength }",
  lantern: "a stone lantern (lit at night, a warm glow)",
  sign: "a small wooden signpost",
  pine: "a tall mountain pine: { v: 0 | 1 | 2 }",
  cherry: "a peach blossom tree",
  bamboo: "a bamboo clump",
  house: "a house, x is its left edge: { w: width in cells 4-14, roof: 0-3 colour }",
  temple: "the golden palace on a marble base, x its left edge: { w: 10-16 }",
  pagoda: "a tall pagoda",
  gate: "a red paifang gate, x its left pillar (about 5 cells wide)",
  well: "a village well",
  stall: "a market stall, x its left edge: { w: 2-6, style: 0 red | 1 blue }",
  tomb: "a grave stone: { v: 0 | 1 | 2 }",
  taiji: "a taiji stone disc on the floor",
  spawnstone: "the glowing stone where newcomers appear",
};
export const THEME = {
  sky: "5 colours, top of the sky → horizon",
  heaven: "pictures high in the sky: [[picture, x px 0-2200, y px 0-200, { tint, k, d, half }], …] (assets.pictures, the *far* ones)",
  mountains: "{ tint: \"#rrggbb\", k: 0-1, dark: 0-1 } tints the misty peaks; or { ridge: [\"#back\", \"#front\"] } black crags instead; solid: true",
  earth: "6 colours of the soil, dark → light",
  grass: "5 colours of the grass, dark → light",
  rim: "the colour of the earth's outline",
  liquid: "water | lava | venom",
  platform: "the set k ledges are drawn from: bluestone | bamboo | cloud | redclay",
  dockWater: "true: water painted behind a bridge's planks; false: a pier above the air",
  motes: "what drifts in the air: petals | leaves | spores | souls | embers",
  isles: "true/false: little floating isles far away",
  clouds: "true/false: drifting clouds",
  cloud: "2 colours of the clouds",
  tiles: "{ tint, k, d } shades the terrain tiles (night, fire)",
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z]{3,16}$/;

const pictures = () => readdirSync(join(GAME, "public", "xianxia", "bg")).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
const musics = () => JSON.parse(readFileSync(join(GAME, "public", "nhac-nen", "danh-sach.json"), "utf8")).map((m) => m.dir);
const effects = () => JSON.parse(readFileSync(join(GAME, "public", "hieu-ung", "danh-sach.json"), "utf8"));

// ---------------------------------------------------------------- the added maps, between BEGIN and END
const text = readFileSync(FILE, "utf8");
const block = text.match(/\/\* BEGIN \*\/([\s\S]*?)\/\* END \*\//);
if (!block) die("shared/maps/them.js: no BEGIN/END block");
const REG = JSON.parse(block[1]);
REG.maps ??= [];
const write = () => writeFileSync(FILE, text.replace(block[0], `/* BEGIN */ ${JSON.stringify(REG, null, 2)} /* END */`));
const { MAPS, CODE_MAPS } = await import(pathToFileURL(join(GAME, "shared", "maps", "index.js")).href);

/** The monster types the game has (from its database), or null when the database can't be reached. */
async function monsterTypes() {
  if (flags["no-db"]) return null;
  try {
    const { q, pool } = await import("../server/db.js");
    const rows = await q("SELECT type, name, hp, atk, fly, fx FROM monsters ORDER BY hp");
    await pool.end();
    return rows.map((r) => ({ type: r.type, name: r.name, hp: Number(r.hp), atk: Number(r.atk), flying: !!r.fly, fx: r.fx }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- a grid from a few strokes
/**
 * The terrain as strokes instead of hundreds of characters (as the maps in code are laid out with shared/maps/build.js):
 * layout: { cols, rows, ops: [["ground", x0, x1, top, ch?], ["box", x0, x1, y0, y1, ch], ["row", y, x0, "string"]] }
 *   ground: ch (default #) from floor row `top` down to the bottom, columns x0..x1
 *   box:    fill the cells x0..x1, y0..y1 with ch (cut a pool with "w", lay a bridge with "b", clear with ".")
 *   row:    write characters from column x0 on row y, as they are
 * Gives the map its grid (and drops the layout); errors name the stroke that is wrong.
 */
export function expand(d) {
  if (!d?.layout) return [];
  const { cols, rows, ops } = d.layout, E = [];
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 60 || cols > 240 || rows < 16 || rows > 24) return ["layout: { cols 60-240, rows 16-24, ops }"];
  if (!Array.isArray(ops) || !ops.length) return ["layout.ops: a list of strokes"];
  const g = Array.from({ length: rows }, () => Array(cols).fill("."));
  const ch1 = (c) => typeof c === "string" && c.length === 1 && TILES[c];
  const box = (x0, x1, y0, y1, ch) => {
    for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) g[y][x] = ch;
  };
  ops.forEach((o, i) => {
    const w = `layout.ops[${i}] ${JSON.stringify(o)}`;
    if (!Array.isArray(o)) return E.push(`${w}: a stroke is an array`);
    const [k, ...a] = o, ints = (n) => a.slice(0, n).every(Number.isInteger);
    if (k === "ground") {
      if (!ints(3) || (a[3] !== undefined && !ch1(a[3]))) return E.push(`${w}: ["ground", x0, x1, top, ch?]`);
      box(a[0], a[1], a[2], rows - 1, a[3] ?? "#");
    } else if (k === "box") {
      if (!ints(4) || !ch1(a[4])) return E.push(`${w}: ["box", x0, x1, y0, y1, ch]`);
      box(a[0], a[1], a[2], a[3], a[4]);
    } else if (k === "row") {
      if (!ints(2) || typeof a[2] !== "string" || [...a[2]].some((c) => !TILES[c])) return E.push(`${w}: ["row", y, x0, "characters"]`);
      [...a[2]].forEach((c, j) => a[0] >= 0 && a[0] < rows && a[1] + j < cols && (g[a[0]][a[1] + j] = c));
    } else E.push(`${w}: unknown stroke (ground, box, row)`);
  });
  if (!E.length) {
    if (d.grid) E.push("give either grid or layout, not both");
    else (d.grid = g.map((r) => r.join(""))), delete d.layout;
  }
  return E;
}

// ---------------------------------------------------------------- checking a map
/**
 * Every problem that would stop the game loading it or leave a player stuck (errors: refused), and what is probably a
 * mistake (warnings). types: the monsters the database has (null: not checked). replacing: the id of an added map this
 * one replaces.
 */
export function check(d, types, replacing = null) {
  const E = [...expand(d)], W = [];
  const err = (m) => E.push(m), warn = (m) => W.push(m);
  const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!d || typeof d !== "object" || Array.isArray(d)) return { errors: ["the map must be a JSON object"], warnings: [] };
  const KEYS = ["id", "name", "sub", "music", "cell", "pvp", "nopk", "town", "hurt", "theme", "mobs", "spawn", "spring", "portals", "props", "deco", "signs", "grid", "layout"];
  for (const k of Object.keys(d)) if (!KEYS.includes(k)) err(`unknown field "${k}" (fields: ${KEYS.join(", ")})`);
  // who it is
  if (!ID.test(d.id ?? "")) err(`id: 3-16 lowercase letters a-z, nothing else (got ${JSON.stringify(d.id)})`);
  else if (CODE_MAPS.includes(d.id)) err(`id "${d.id}" is a map designed in code: pick another`);
  else if (REG.maps.some((m) => m.id === d.id) && replacing !== d.id) err(`there is already an added map "${d.id}" (add --replace / replace: true to change it)`);
  if (typeof d.name !== "string" || d.name.trim().length < 2 || d.name.length > 40) err("name: 2-40 characters (Vietnamese, shown to players)");
  if (d.sub !== undefined && (typeof d.sub !== "string" || d.sub.length > 220)) err("sub: up to 220 characters (the line under the name when one arrives)");
  if (!d.sub) warn("no sub: players see only the name when they arrive; one line about the place helps");
  const MUS = musics();
  if (d.music !== undefined && !MUS.includes(d.music)) err(`music: one of ${MUS.join(", ")}`);
  if (d.cell !== undefined && d.cell !== 32) err("cell: 32 (every map of the road is drawn at 32 px a cell)");
  for (const f of ["pvp", "nopk", "town"]) if (d[f] !== undefined && typeof d[f] !== "boolean") err(`${f}: true or false`);
  if (d.pvp) warn("pvp: true takes the map off the Truyền Tống Trận list (only gates lead there)");

  // the grid
  const g = d.grid;
  let rows = 0, cols = 0;
  if (!Array.isArray(g) || !g.every((r) => typeof r === "string")) err("grid: an array of strings, one per row, top to bottom");
  else {
    rows = g.length;
    cols = g[0]?.length ?? 0;
    if (rows < 16 || rows > 24) err(`grid: 16-24 rows (the road's maps have 20); this one has ${rows}`);
    if (cols < 60 || cols > 240) err(`grid: 60-240 columns; this one has ${cols}`);
    g.forEach((r, i) => {
      if (r.length !== cols) err(`grid row ${i}: ${r.length} characters, row 0 has ${cols} (every row the same length)`);
      const bad = [...new Set(r.replace(/[.#sr=bkwl|]/g, ""))];
      if (bad.length) err(`grid row ${i}: unknown characters ${bad.map((c) => JSON.stringify(c)).join(" ")} (use ${Object.keys(TILES).join(" ")})`);
    });
    if (g.some((r) => r.includes("l")) && !d.hurt) warn("the grid has lava (l) but no hurt: it will not burn (hurt: { cell: \"l\", hit: 0.2 })");
  }
  const cell = (cx, cy) => (cx < 0 || cx >= cols ? "#" : cy < 0 ? "." : cy >= rows ? "#" : g[cy][cx]);
  const gridOk = E.length === 0 || (Array.isArray(g) && rows >= 16 && cols >= 60 && g.every((r) => typeof r === "string" && r.length === cols));
  /** Whether one can stand at (x cells, floor row): ground or a plank under, two cells of room above. */
  const standing = (x, row) => {
    const cx = Math.floor(x);
    if (!gridOk) return true;
    return standOn(cell(cx, row)) && !SOLID.has(cell(cx, row - 1)) && !SOLID.has(cell(cx, row - 2));
  };
  const inside = (x, row) => num(x, 0, Math.max(0, cols - 0.01)) && num(row, 1, Math.max(1, rows - 1));
  const at = (what, x, row) => `${what} at x ${x}, row ${row}`;

  // where one arrives
  const sp = d.spawn;
  if (!sp || !inside(sp.x, sp.row)) err(`spawn: { x, row } inside the grid (x 0-${cols - 1}, row 1-${rows - 1}): where one arrives, standing on the floor of that row`);
  else if (!standing(sp.x, sp.row)) err(`spawn: nothing to stand on (or no room) ${at("", sp.x, sp.row)}: the cell at that row must be ground or a plank, the two above it open`);
  if (d.spring !== undefined) {
    const s = d.spring;
    if (!s || !num(s.x0, 0, cols) || !num(s.x1, 0, cols) || !(s.x1 > s.x0) || !num(s.row, 1, rows - 1)) err("spring: { x0, x1, row }: where one cultivates, x0 < x1, on the floor of that row");
    else if (!standing((s.x0 + s.x1) / 2, s.row)) err(`spring: no floor under it at row ${s.row}`);
  }
  if (d.hurt !== undefined && (!d.hurt || d.hurt.cell !== "l" || !num(d.hurt.hit, 0.02, 0.5))) err("hurt: { cell: \"l\", hit: 0.02-0.5 } (the share of life a second of lava takes)");

  // the ways out: at least one Truyền Tống Trận
  const ROAD = Object.keys(MAPS).filter((id) => !MAPS[id].instanced && id !== d.id);
  if (!Array.isArray(d.portals) || !d.portals.length) err("portals: at least one Truyền Tống Trận ({ x, row, to: a map of the road, msg }), or nobody can leave");
  else {
    if (d.portals.length > 6) err("portals: at most 6");
    d.portals.forEach((p, i) => {
      const w = `portals[${i}]`;
      if (!p || !inside(p.x, p.row)) return err(`${w}: { x, row } inside the grid`);
      if (!ROAD.includes(p.to)) err(`${w}.to: one of ${ROAD.join(", ")} (a map of the road; "${p.to}" is not)`);
      if (p.r !== undefined && !num(p.r, 0.5, 2)) err(`${w}.r: 0.5-2 cells`);
      if (typeof p.msg !== "string" || !p.msg || p.msg.length > 40) err(`${w}.msg: 1-40 characters, e.g. "Về Tân Thủ Thôn"`);
      if (!standing(p.x, p.row)) err(`${w}: nothing to stand on ${at("", p.x, p.row)}`);
    });
    if (sp && inside(sp.x, sp.row) && !d.portals.some((p) => Math.abs(p.x - sp.x) <= 20)) warn("no Truyền Tống Trận within 20 cells of the spawn: one near where people arrive is easiest to find");
  }

  // monsters
  const mobs = d.mobs ?? [];
  if (!Array.isArray(mobs)) err("mobs: an array of { type, x, row, up }");
  else {
    if (mobs.length > 60) err("mobs: at most 60 (more can be placed later on the live game with place_monster)");
    if (!mobs.length && !d.town) err("mobs: a map of the road needs monsters (or town: true for a safe place with none)");
    if (mobs.length && d.town) err("town: true is a safe place: no mobs");
    const known = types ? new Map(types.map((t) => [t.type, t])) : null;
    mobs.forEach((m, i) => {
      const w = `mobs[${i}]`;
      if (!m || typeof m.type !== "string") return err(`${w}: { type, x, row, up }`);
      if (known && !known.has(m.type)) err(`${w}.type: no monster "${m.type}" (assets.monsters; make one first with create_monster)`);
      if (!inside(m.x, m.row)) return err(`${w}: x, row inside the grid`);
      if (m.up !== undefined && !num(m.up, 0, 8)) err(`${w}.up: 0-8 cells (a flier waits that high above the floor)`);
      const flier = known?.get(m.type)?.flying;
      if (!standOn(cell(Math.floor(m.x), m.row)) && !flier) (known ? err : warn)(`${w}: no floor ${at(m.type, m.x, m.row)}${known ? " (only flying monsters may hover over nothing)" : ""}`);
      if (known?.get(m.type)?.flying && !m.up) warn(`${w}: ${m.type} flies: give it up: 2-4 so it hovers`);
      if (sp && Math.abs(m.x - sp.x) < 8 && Math.abs(m.row - sp.row) < 4) warn(`${w}: ${m.type} is right where people arrive (${Math.abs(m.x - sp.x).toFixed(0)} cells): newcomers get hit at once`);
    });
  }

  // scenery
  const PIC = new Set(pictures()), FX = new Set(effects());
  const props = d.props ?? [];
  if (!Array.isArray(props)) err("props: an array of [kind, x, floor row, options]");
  else {
    if (props.length > 200) err("props: at most 200");
    props.forEach((p, i) => {
      const w = `props[${i}]`;
      if (!Array.isArray(p) || p.length < 3 || p.length > 4) return err(`${w}: [kind, x, row] or [kind, x, row, { options }]`);
      const [kind, x, row, o = {}] = p;
      if (!PROPS[kind]) return err(`${w}: unknown kind "${kind}" (${Object.keys(PROPS).join(", ")})`);
      if (!num(x, -2, cols + 2) || !num(row, 0, rows)) err(`${w}: x, row inside the grid`);
      if (typeof o !== "object" || Array.isArray(o)) return err(`${w}: options must be an object`);
      if (kind === "xx") {
        if (!PIC.has(o.n)) err(`${w}: picture "${o.n}" does not exist (assets.pictures)`);
        if (o.s !== undefined && !num(o.s, 1, 8)) err(`${w}.s: 1-8`);
      }
      if (kind === "fx") {
        if (!FX.has(o.id)) err(`${w}: effect "${o.id}" is not in the game (assets.effects; add_effect_to_game first)`);
        if (o.k !== undefined && !num(o.k, 0.3, 4)) err(`${w}.k: 0.3-4`);
      }
      if (kind === "glow" && ((o.c !== undefined && !HEX.test(o.c)) || (o.r !== undefined && !num(o.r, 4, 240)) || (o.a !== undefined && !num(o.a, 0, 1)))) err(`${w}: glow { c: "#rrggbb", r: 4-240, a: 0-1 }`);
      if (kind === "house" && (!num(o.w, 4, 14) || (o.roof !== undefined && !num(o.roof, 0, 3)))) err(`${w}: house { w: 4-14, roof: 0-3 }`);
      if (kind === "temple" && o.w !== undefined && !num(o.w, 10, 16)) err(`${w}: temple { w: 10-16 }`);
      if (kind === "stall" && (!num(o.w, 2, 6) || (o.style !== undefined && !num(o.style, 0, 1)))) err(`${w}: stall { w: 2-6, style: 0 | 1 }`);
      if ((kind === "pine" || kind === "tomb") && o.v !== undefined && !num(o.v, 0, 2)) err(`${w}: ${kind} { v: 0-2 }`);
      for (const c of ["tint", "c"]) if (o[c] !== undefined && !HEX.test(o[c])) err(`${w}.${c}: a colour "#rrggbb"`);
      if (gridOk && !["fx", "glow"].includes(kind) && num(x, 0, cols - 1) && num(row, 1, rows - 1) && !standOn(cell(Math.floor(x), row)) && cell(Math.floor(x), row) !== "w")
        warn(`${w}: ${kind}${o.n ? ` ${o.n}` : ""} stands on nothing ${at("", x, row)} (it will float)`);
    });
    if (props.length < Math.max(8, cols / 12)) warn(`only ${props.length} props on ${cols} columns: the maps of the road have one every 4-6 columns (trees, lanterns, rocks, effects)`);
  }
  if (d.deco !== undefined && (!Array.isArray(d.deco) || !d.deco.every((x) => Array.isArray(x) && x.length === 4 && x.every((v) => num(v, 0, 400))))) err("deco: [[sheet col, sheet row, x, floor row], …]");
  if (d.signs !== undefined && (!Array.isArray(d.signs) || !d.signs.every((s) => Array.isArray(s) && num(s[0], 0, cols) && num(s[1], 0, rows) && typeof s[2] === "string" && s[2].length <= 30))) err("signs: [[x, floor row, \"text ≤ 30\"], …] (words written over a place)");

  // the look
  const th = d.theme ?? {};
  if (typeof th !== "object" || Array.isArray(th)) err("theme: an object");
  else {
    for (const k of Object.keys(th)) if (!THEME[k]) err(`theme.${k}: unknown (${Object.keys(THEME).join(", ")})`);
    const cols_ = (k, n) => th[k] !== undefined && (!Array.isArray(th[k]) || th[k].length !== n || !th[k].every((c) => HEX.test(c))) && err(`theme.${k}: ${n} colours "#rrggbb"`);
    cols_("sky", 5), cols_("earth", 6), cols_("grass", 5), cols_("cloud", 2);
    if (th.rim !== undefined && !HEX.test(th.rim)) err("theme.rim: a colour");
    if (th.liquid !== undefined && !["water", "lava", "venom"].includes(th.liquid)) err("theme.liquid: water | lava | venom");
    if (th.platform !== undefined && !["bluestone", "bamboo", "cloud", "redclay"].includes(th.platform)) err("theme.platform: bluestone | bamboo | cloud | redclay");
    if (th.motes !== undefined && !["petals", "leaves", "spores", "souls", "embers"].includes(th.motes)) err("theme.motes: petals | leaves | spores | souls | embers");
    for (const b of ["dockWater", "isles", "clouds"]) if (th[b] !== undefined && typeof th[b] !== "boolean") err(`theme.${b}: true or false`);
    if (th.heaven !== undefined) {
      if (!Array.isArray(th.heaven) || th.heaven.length > 8) err("theme.heaven: up to 8 [picture, x, y, { options }]");
      else th.heaven.forEach((h, i) => {
        if (!Array.isArray(h) || !PIC.has(h[0]) || !num(h[1], -200, 2200) || !num(h[2], -100, 220)) err(`theme.heaven[${i}]: [picture (assets.pictures), x 0-2200, y 0-220]`);
      });
    }
    if (th.mountains !== undefined) {
      const m = th.mountains;
      if (!m || typeof m !== "object") err("theme.mountains: an object");
      else if (m.ridge !== undefined && (!Array.isArray(m.ridge) || m.ridge.length !== 2 || !m.ridge.every((c) => HEX.test(c)))) err("theme.mountains.ridge: [\"#back\", \"#front\"]");
      else if ((m.tint !== undefined && m.tint !== null && !HEX.test(m.tint)) || (m.k !== undefined && !num(m.k, 0, 1))) err("theme.mountains: { tint: \"#rrggbb\", k: 0-1 }");
    }
    if (th.tiles !== undefined && (!th.tiles || !HEX.test(th.tiles.tint ?? "") || (th.tiles.k !== undefined && !num(th.tiles.k, 0, 1)))) err("theme.tiles: { tint: \"#rrggbb\", k: 0-1, d: 0-1 }");
    if (!d.theme) warn("no theme: it looks like the starter town; a sky, grass and motes of its own make it a place");
  }

  // can one get everywhere from where one arrives? (walking, and jumping up to 3 cells and across gaps of up to 4;
  // a flying sword gets past more, but nobody should need one)
  if (gridOk && E.length === 0) {
    const key = (x, y) => y * cols + x, seen = new Set(), stack = [];
    const ok = (x, y) => x >= 0 && x < cols && y > 1 && y < rows && standOn(cell(x, y)) && !SOLID.has(cell(x, y - 1)) && !SOLID.has(cell(x, y - 2));
    const start = [Math.floor(sp.x), sp.row];
    if (ok(...start)) (seen.add(key(...start)), stack.push(start));
    while (stack.length) {
      const [x, y] = stack.pop();
      for (let dx = -5; dx <= 5; dx++)
        for (let ny = y - 3; ny < rows; ny++) {
          const nx = x + dx;
          if (!dx && ny === y) continue;
          // across a gap only at about the same height; straight up or down anywhere near
          if (Math.abs(dx) > 1 && ny < y - 1) continue;
          if (ok(nx, ny) && !seen.has(key(nx, ny))) {
            // nothing solid in the way: going up, head room over where one jumps from; going down, the column one falls
            // through; across, the cells over the gap at the higher of the two floors
            let clear = true;
            if (ny < y) for (let yy = ny - 2; yy < y - 2; yy++) if (SOLID.has(cell(x, yy))) clear = false;
            if (ny > y) for (let yy = y - 2; yy < ny - 2; yy++) if (SOLID.has(cell(nx, yy))) clear = false;
            const hi = Math.min(y, ny);
            for (let xx = Math.min(x, nx) + 1; xx < Math.max(x, nx); xx++) if (SOLID.has(cell(xx, hi - 1)) || SOLID.has(cell(xx, hi - 2))) clear = false;
            if (!clear) continue;
            seen.add(key(nx, ny));
            stack.push([nx, ny]);
          }
        }
    }
    const reach = (x, row) => {
      for (let dx = -1; dx <= 1; dx++) if (seen.has(key(Math.floor(x) + dx, row))) return true;
      return false;
    };
    (d.portals ?? []).forEach((p, i) => !reach(p.x, p.row) && warn(`portals[${i}] (to ${p.to}) cannot be reached from the spawn by walking and jumping`));
    (d.mobs ?? []).forEach((m, i) => !m.up && !reach(m.x, m.row) && warn(`mobs[${i}] (${m.type}) at x ${m.x} cannot be reached from the spawn by walking and jumping`));
    if (d.spring && !reach((d.spring.x0 + d.spring.x1) / 2, d.spring.row)) warn("the spring cannot be reached from the spawn by walking and jumping");
    const floors = [...seen].length;
    if (floors < cols * 0.5) warn(`only ${floors} floor cells can be walked to from the spawn (the map is ${cols} wide): parts of it are cut off`);
  }
  return { errors: E, warnings: W };
}

// ---------------------------------------------------------------- a picture of it
/** The layout drawn small: the sky, every cell in its colour, and what stands where (labels in ASCII). */
export async function preview(d, out) {
  const { canvas, textWidth } = await import(pathToFileURL(join(GAME, "..", "tools", "lib", "fxlib.mjs")).href);
  const rows = d.grid.length, cols = d.grid[0].length, k = Math.max(6, Math.min(12, Math.floor(1800 / cols)));
  const top = 34, W = cols * k + 40, H = top + rows * k + 150;
  const C = canvas(W, H);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
  const th = d.theme ?? {}, sky = th.sky ?? ["#24306a", "#3a58a0", "#6a94d0", "#a8c8ea", "#f2dcc4"];
  const earth = th.earth ?? ["#1c140f", "#261b14", "#30231a", "#3a2b1f", "#463425", "#5a4430"], grass = th.grass ?? ["#1d3a22", "#2b5230", "#3b6a3a", "#547f45", "#7c9d5a"];
  const liq = th.liquid === "lava" ? "#f05a14" : th.liquid === "venom" ? "#4a9a3a" : "#3a78c8";
  const X0 = 20, Y0 = top;
  C.text(`${d.id}  ${cols}x${rows} cells  (${cols * 32}x${rows * 32} px)`, X0, 8, 2, [230, 220, 180]);
  for (let y = 0; y < rows; y++) {
    const band = sky[Math.min(4, Math.floor((y / rows) * 5))];
    for (let x = 0; x < cols; x++) {
      const ch = d.grid[y][x], open = y === 0 || ".=k".includes(d.grid[y - 1][x]);
      let c = band;
      if (ch === "#") c = open ? grass[3] : earth[(x + y) % 2 ? 3 : 2];
      else if (ch === "s") c = open ? "#9a9aa8" : "#6a6a78";
      else if (ch === "r") c = open ? "#c8784a" : "#8a4a2e";
      else if (ch === "=") c = "#f4f6ff";
      else if (ch === "k") c = "#c8b48a";
      else if (ch === "b") c = "#8a5a32";
      else if (ch === "w") c = liq;
      else if (ch === "l") c = "#f05a14";
      else if (ch === "|") c = "#9ad8ff";
      C.rect(X0 + x * k, Y0 + y * k, k, ch === "=" || ch === "k" || ch === "b" ? Math.max(2, k >> 1) : k, rgb(c));
    }
  }
  // a ruler every 10 cells, rows down the left
  for (let x = 0; x < cols; x += 10) (C.rect(X0 + x * k, Y0 + rows * k, 1, 6, [200, 200, 200, 255]), C.text(String(x), X0 + x * k + 2, Y0 + rows * k + 3, 1, [200, 200, 200]));
  for (let y = 0; y < rows; y += 5) C.text(String(y), 2, Y0 + y * k, 1, [200, 200, 200]);
  const mark = (x, row, c, label, up = 0, dyText = 0) => {
    const px = X0 + Math.round(x * k), py = Y0 + (row - up) * k;
    C.rect(px - 2, py - k * 2, 4, k * 2, c);
    if (label) C.text(label, Math.max(0, Math.min(W - textWidth(label, "mini") - 2, px - (textWidth(label, "mini") >> 1))), py - k * 2 - 7 - dyText, 1, c.slice(0, 3));
  };
  // props first (small, yellow), then the spring, the portals, the monsters, the spawn on top
  (d.props ?? []).forEach(([kind, x, row, o = {}], i) => mark(x, row - (kind === "fx" || kind === "glow" ? (o.h ?? 0) / 32 : 0), [240, 210, 90, 255], i % 2 ? "" : kind === "xx" ? (o.n ?? "").replace(/^bg_(xianxia_)?/, "") : kind === "fx" ? (o.id ?? "").split("/")[1] : kind, 0, (i % 4) * 7));
  if (d.spring) C.rect(X0 + d.spring.x0 * k, Y0 + d.spring.row * k - 4, (d.spring.x1 - d.spring.x0) * k, 4, [190, 120, 255, 255]);
  for (const p of d.portals ?? []) mark(p.x, p.row, [80, 230, 255, 255], `TT>${p.to}`, 0, 14);
  (d.mobs ?? []).forEach((m) => mark(m.x, m.row, [255, 80, 80, 255], m.type, m.up ?? 0, 0));
  if (d.spawn) mark(d.spawn.x, d.spawn.row, [90, 255, 120, 255], "SPAWN", 0, 22);
  // the legend
  const L = Y0 + rows * k + 22, items = [["SPAWN", [90, 255, 120]], ["TT> truyen tong tran", [80, 230, 255]], ["monster", [255, 80, 80]], ["prop", [240, 210, 90]], ["spring", [190, 120, 255]]];
  let lx = X0;
  for (const [t, c] of items) (C.rect(lx, L, 10, 10, [...c, 255]), C.text(t, lx + 14, L + 2, 1, c), (lx += textWidth(t, "mini") + 34));
  const tiles = [["# earth", grass[3]], ["s stone", "#9a9aa8"], ["r clay", "#c8784a"], ["= cloud", "#f4f6ff"], ["k ledge", "#c8b48a"], ["b bridge", "#8a5a32"], ["w water", liq], ["l lava", "#f05a14"], ["| fall", "#9ad8ff"]];
  lx = X0;
  for (const [t, c] of tiles) (C.rect(lx, L + 20, 10, 10, rgb(c)), C.text(t, lx + 14, L + 22, 1, [200, 200, 200]), (lx += textWidth(t, "mini") + 30));
  const mobs = Object.entries((d.mobs ?? []).reduce((a, m) => ((a[m.type] = (a[m.type] ?? 0) + 1), a), {})).map(([t, n]) => `${t} x${n}`).join("  ");
  C.text(`monsters: ${mobs || "none"}`, X0, L + 42, 1, [255, 150, 150]);
  C.text(`props: ${(d.props ?? []).length}   portals: ${(d.portals ?? []).map((p) => p.to).join(", ")}   music: ${d.music ?? "(default)"}   motes: ${th.motes ?? "petals"}`, X0, L + 56, 1, [220, 220, 220]);
  // the sky's colours as a strip, then grass and earth
  [...sky, "", ...grass, "", ...earth].forEach((c, i) => c && C.rect(X0 + i * 18, L + 72, 16, 16, rgb(c)));
  C.text("sky / grass / earth", X0 + 20 * 18, L + 76, 1, [200, 200, 200]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, C.png());
  return out;
}

// ---------------------------------------------------------------- the commands
const readDef = (f) => {
  if (!f) die("give a map file (JSON)");
  if (!f.endsWith(".json") && MAPS[f]) return JSON.parse(JSON.stringify(MAPS[f]));
  if (!existsSync(f)) die(`no file ${f}`);
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    die(`${f}: not JSON (${e.message})`);
  }
};
const [cmd, arg] = pos;
if (cmd === "assets") {
  const types = await monsterTypes();
  done({
    tiles: TILES, props: PROPS, theme: THEME,
    pictures: pictures(), music: musics(),
    effects: effects().filter((id) => !/^(nhanvat|boss|vukhi|kiem|phi-kiem)\//.test(id)),
    monsters: types ?? "(the database could not be reached: list_rows monsters)",
    roadMaps: Object.keys(MAPS).filter((id) => !MAPS[id].instanced),
    rules: "grid 16-24 rows x 60-240 columns, 32 px a cell; spawn, portals, mobs, spring stand on the floor of their row (that cell ground or a plank, two cells of room above); at least one Truyền Tống Trận (portal to a map of the road); monsters (or town: true); a player can climb 3 cells and jump gaps of about 4",
  });
}
if (cmd === "list" || !cmd) {
  for (const id of Object.keys(MAPS)) console.log(`  ${id.padEnd(12)} ${MAPS[id].added ? "added" : "code "} ${MAPS[id].instanced ? "instanced" : ""} ${MAPS[id].name}`);
  done({ maps: Object.keys(MAPS).map((id) => ({ id, name: MAPS[id].name, added: !!MAPS[id].added, instanced: !!MAPS[id].instanced, cols: MAPS[id].grid[0].length })) });
}
if (cmd === "get") {
  if (!MAPS[arg]) die(`no map "${arg}"`);
  const def = JSON.parse(JSON.stringify(MAPS[arg]));
  delete def.added;
  if (flags.out) writeFileSync(flags.out, JSON.stringify(def, null, 1));
  else console.log(JSON.stringify(def));
  done({ id: arg, added: !!MAPS[arg].added, file: flags.out ?? null });
}
if (cmd === "check" || cmd === "preview" || cmd === "add") {
  const d = readDef(arg), fromCode = !arg?.endsWith(".json") && !!MAPS[arg];
  // only saving minds a map of that name being there already (check and preview just say so)
  const exists = REG.maps.some((m) => m.id === d.id);
  const replacing = flags.replace || cmd !== "add" || fromCode ? d.id : null;
  const types = await monsterTypes();
  const r = fromCode && cmd === "preview" ? { errors: [], warnings: [] } : check(d, types, replacing);
  for (const e of r.errors) console.log(`  ✖ ${e}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  if (!types && !flags["no-db"]) r.warnings.push("monster types not checked (the database could not be reached)");
  if (exists && cmd !== "add" && !fromCode) r.warnings.push(`"${d.id}" is saved already: saving this replaces it (replace: true)`);
  let png = null;
  if (cmd === "preview" || cmd === "add") {
    if (Array.isArray(d.grid) && d.grid.length && d.grid.every((x) => typeof x === "string" && x.length === d.grid[0].length) && d.grid[0].length <= 400 && d.grid.length <= 60)
      png = await preview(d, flags.out ?? join(GAME, "..", "records", "ban-do", `${d.id ?? "map"}.png`));
  }
  if (cmd !== "add") {
    console.log(r.errors.length ? `${r.errors.length} problem(s): not saved` : "no problems");
    done({ id: d.id, errors: r.errors, warnings: r.warnings, preview: png });
  }
  if (r.errors.length) die(`${r.errors.length} problem(s), not saved:\n- ${r.errors.join("\n- ")}`, { errors: r.errors, warnings: r.warnings, preview: png });
  const clean = { cell: 32, ...d };
  const i = REG.maps.findIndex((m) => m.id === d.id);
  if (i >= 0) REG.maps[i] = clean;
  else REG.maps.push(clean);
  write();
  console.log(`✔ ${d.name} (${d.id}) ${i >= 0 ? "changed" : "added"}. Restart the game to open it.`);
  done({ id: d.id, replaced: i >= 0, warnings: r.warnings, preview: png });
}
if (cmd === "remove") {
  if (CODE_MAPS.includes(arg)) die(`"${arg}" is designed in code: only added maps can be removed`);
  if (!REG.maps.some((m) => m.id === arg)) die(`no added map "${arg}"`);
  let spawnRows = 0;
  if (!flags["no-db"]) {
    const { q, pool } = await import("../server/db.js");
    try {
      const [{ n }] = await q("SELECT COUNT(*) AS n FROM world_bosses WHERE map_id = ? AND alive IS NOT NULL", [arg]);
      if (Number(n)) die("a world boss is out on this map: send it away first (despawn_boss)");
      spawnRows = Number((await q("DELETE FROM map_spawns WHERE map_id = ?", [arg])).affectedRows ?? 0);
    } finally {
      await pool.end();
    }
  }
  REG.maps = REG.maps.filter((m) => m.id !== arg);
  write();
  console.log(`✔ ${arg} removed (and ${spawnRows} placed monster row(s)). Restart the game; players who were there wake up in Tân Thủ Thôn.`);
  done({ id: arg, spawnRowsRemoved: spawnRows });
}
die(`unknown command "${cmd}" (assets, list, get, check, preview, add, remove)`);
