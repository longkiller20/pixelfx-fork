// The game's MCP tools: what an AI (Claude Code on the VPS, Claude Desktop, Cursor, any MCP client) can do to the game
// on the owner's behalf. Served by the dashboard at /mcp (deploy/mcp/http.mjs). Three kinds:
//   - the game's data, through its own admin API (every change checked and logged as the admin "ai-mcp" would be):
//     the editable tables (monsters, items, drops, realms, settings, Y Các…), monsters placed on maps, world bosses,
//     players, announcements;
//   - pixel art with the pixelfx library next to the game (src/fx): its guide, search, read, write (when the owner
//     allows code), render to look at, and a picture turned into a rigged character, boss or monster;
//   - putting a new character or boss into the game (game/tools/them.mjs), restarting the game, its logs.
// Every file it changes is committed to the local git (author "AI (MCP)"), so the dashboard can undo it.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import http from "node:http";

const ID = /^[a-z]+\/[a-z0-9_-]+$/;
const TABLES = ["realms", "items", "monsters", "cong_phap", "cong_phap_reqs", "monster_drops", "skills", "settings", "houses", "fish_rates", "ring_buffs", "sect_shop", "cosmetics"];
const UPLOADS = process.env.DVTT_UPLOADS ?? "/var/lib/dvtt-panel/uploads";

/**
 * ctx: { state() → the deployment's settings (dir, adminPort…), mcp() → { adminUser, adminPass, allowCode },
 * runAs(args, opts) → { code, out } (a command as the game's user), restartGame() → text, logs(n) → text }
 */
export function createTools(ctx) {
  let token = null;
  const dir = () => ctx.state().dir, game = () => join(dir(), "game");

  // ---------------------------------------------------------------- the game's admin API
  async function admin(method, path, body, retry = true) {
    if (!token) token = await login();
    const out = await request(method, path, body, token);
    if (out.status === 401 && retry) {
      token = null;
      return admin(method, path, body, false);
    }
    if (out.status >= 400) throw new Error(out.json?.error ?? `admin API ${method} ${path}: HTTP ${out.status}`);
    return out.json;
  }
  async function login() {
    const m = ctx.mcp();
    if (!m.adminUser || !m.adminPass) throw new Error("MCP chưa có tài khoản admin game (bật lại MCP ở bảng điều khiển).");
    const out = await request("POST", "/login", { username: m.adminUser, password: m.adminPass });
    if (!out.json?.token) throw new Error(`Không đăng nhập được trang admin game bằng ${m.adminUser}: ${out.json?.error ?? out.status} (game có đang chạy không?)`);
    return out.json.token;
  }
  function request(method, path, body, tok) {
    return new Promise((ok) => {
      const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = http.request({ host: "127.0.0.1", port: ctx.state().adminPort, path: "/api" + path, method, timeout: 60000, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(data ? { "content-length": data.length } : {}) } }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(b);
          } catch {}
          ok({ status: res.statusCode, json });
        });
      });
      req.on("error", (e) => ok({ status: 503, json: { error: `Trang admin game không trả lời (${e.code ?? e.message}): game có đang chạy không?` } }));
      req.on("timeout", () => req.destroy(new Error("timeout")));
      if (data) req.write(data);
      req.end();
    });
  }

  // ---------------------------------------------------------------- files and commands in the repository
  const effectFile = (id) => {
    if (!ID.test(id ?? "")) throw new Error(`"${id}": mã hiệu ứng dạng <loại>/<tên>, ví dụ critters/frog`);
    return join(dir(), "src", "fx", `${id}.js`);
  };
  const recDir = (id) => join(dir(), "records", ...id.split("/"));
  const png = (f) => (existsSync(f) ? { type: "image", data: readFileSync(f).toString("base64"), mimeType: "image/png" } : null);
  const node = (args, opts = {}) => ctx.runAs(["node", ...args], { cwd: dir(), timeout: 180000, ...opts });
  async function commit(msg) {
    // the AI's changes in the local git, so the dashboard can show and undo them (never pushed anywhere)
    const g = (a) => ctx.runRoot(["git", "-c", "safe.directory=*", "-C", dir(), ...a]);
    // (tools/index.mjs also counts the library in README.md and lists it in docs/CATALOG.md)
    await g(["add", "-A", "src/fx", "game/shared/them.js", "game/public/hieu-ung", "README.md", "docs/CATALOG.md"]);
    const st = await g(["diff", "--cached", "--quiet"]);
    if (st.code === 0) return null;
    const out = await g(["-c", "user.name=AI (MCP)", "-c", "user.email=ai-mcp@localhost", "commit", "-q", "-m", msg.slice(0, 200)]);
    return out.code === 0 ? (await g(["rev-parse", "--short", "HEAD"])).out.trim() : null;
  }
  let busy = Promise.resolve();
  const serial = (fn) => (busy = busy.then(fn, fn));

  const text = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 1) }] });
  const withImages = (t, imgs) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 1) }, ...imgs.filter(Boolean)] });
  const needCode = () => {
    if (!ctx.mcp().allowCode) throw new Error("Chủ server chưa cho phép AI viết code hiệu ứng qua MCP (Bảng điều khiển → Trợ lý AI → \"Cho phép viết code pixelfx\").");
  };
  const restart = async (why) => `${await ctx.restartGame()}${why ? ` (${why})` : ""}`;

  // ---------------------------------------------------------------- the tools
  const T = [];
  const tool = (name, description, properties, required, run) => T.push({ name, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, run });
  const S = (description, extra = {}) => ({ type: "string", description, ...extra });
  const N = (description, extra = {}) => ({ type: "number", description, ...extra });
  const B = (description) => ({ type: "boolean", description });
  const O = (description) => ({ type: "object", description });

  // ---- the game, at a glance
  tool("game_overview", "Start here. The game now: players online, accounts, maps (which take placed monsters, where bosses may appear), the world bosses there are, the characters and bosses added beyond the code, and how to do the usual things. The game is a Vietnamese xianxia side-view MMO; names shown to players are Vietnamese.", {}, [], async () => {
    const [ov, maps, boss, them] = await Promise.all([admin("GET", "/overview"), admin("GET", "/maps"), admin("GET", "/boss"), admin("GET", "/them")]);
    return text({
      online: ov.online, accounts: ov.users, characters: ov.characters, top: ov.top,
      maps: maps.map((m) => ({ id: m.id, name: m.name, widthCells: m.cols, monstersInCode: m.mobs.length, placedRows: m.spawns.length, spawnsAllowed: m.spawnsAllowed, bossAllowed: m.boss })),
      bosses: boss.bosses, bossNow: boss.now ? { key: boss.now.key, name: boss.now.name, map: boss.now.map, hp: boss.now.hp, max: boss.now.max } : null,
      added: them,
      howTo: {
        newMonster: "search_effects (critters) or make one (pixelfx_guide, write_effect / image_to_figure --kind critter) → create_monster (stats, drops, place on a map) → it appears at once, no restart.",
        newCharacter: "image_to_figure kind=nhanvat (a picture the owner uploaded) or write a nhanvat/* figure → render_effect to look → register_character (restarts the game) → it is on sale in the Y Các.",
        newBoss: "image_to_figure kind=boss (+ parts: heads/roots for serpents or tentacles, face, shoulders, waist) → render_effect anim=slam/roar → register_boss (restarts) → spawn_boss.",
        numbers: "get_schema, list_rows, update_row (live within seconds).",
        event: "announce + spawn_boss + give_item to many players.",
      },
    });
  });
  tool("get_schema", "The editable tables of the game (monsters, items, drops, realms, settings, Y Các cosmetics, houses, fish, rings, sect shop, công pháp toggles, the basic attack): each column and its type (str:N text up to N, int, uint, num, bool, json, enum:a|b), whether rows can be added or deleted, and whether a change applies live.", { table: S("one table (omit for all)") }, [], async ({ table }) => {
    const s = await admin("GET", "/schema");
    return text(table ? s[table] ?? `Không có bảng ${table}. Có: ${Object.keys(s).join(", ")}` : s);
  });
  tool("list_rows", "Rows of an editable table, optionally only those containing some text (in any column).", { table: S("table name", { enum: TABLES }), filter: S("only rows containing this text"), limit: N("at most this many (default 100)") }, ["table"], async ({ table, filter, limit = 100 }) => {
    let rows = await admin("GET", `/t/${table}`);
    if (filter) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(String(filter).toLowerCase()));
    return text({ total: rows.length, rows: rows.slice(0, Math.min(500, limit)) });
  });
  tool("create_row", "Add a row to an editable table (see get_schema for its columns). Checked like the admin site: a row that would break the game is refused with the reason. Items: item_key a-z0-9_, kind pill|book|material|rod|bait|fish|gift|ring. Monster drops: monster (a monsters.type or \"*\"), item_key, chance (weight), min_qty, max_qty.", { table: S("table name", { enum: TABLES }), row: O("column → value") }, ["table", "row"], async ({ table, row }) => text(await admin("POST", `/t/${table}`, row)));
  tool("update_row", "Change some columns of one row (key: the table's key column value, e.g. a monster's type, an item's item_key, a setting's k, a numeric id).", { table: S("table name", { enum: TABLES }), key: S("the row's key"), changes: O("column → new value") }, ["table", "key", "changes"], async ({ table, key, changes }) => text(await admin("PATCH", `/t/${table}/${encodeURIComponent(key)}`, changes)));
  tool("delete_row", "Delete one row (refused if something still needs it: a monster a map places, an item an art needs…).", { table: S("table name", { enum: TABLES }), key: S("the row's key") }, ["table", "key"], async ({ table, key }) => text(await admin("DELETE", `/t/${table}/${encodeURIComponent(key)}`)));

  // ---- maps and monsters
  tool("list_maps", "Every map: its size in cells (a cell is 32 px), whether monsters may be placed on it (spawnsAllowed) and bosses called there, the monsters its code places (type, x, row), the rows placed from the database (map_spawns, with ids), and the floor row at every 10th column.", {}, [], async () => text(await admin("GET", "/maps")));
  tool("place_monster", "Put monsters of an existing type on a map (a row in map_spawns): every Khu (copy) of the map gets them at once and they respawn like the others. x in cells from the left (2 .. width-3); the floor is found by itself unless floor_row is given; fliers: up = cells above the floor (2-4). n up to 12, spread 1.5 cells apart.", { map: S("map id (spawnsAllowed in list_maps)"), type: S("monster type (monsters table)"), x: N("cells from the left edge"), n: N("how many (1-12, default 1)"), up: N("fliers: cells above the floor (default 0)"), floor_row: N("the floor's row, if the automatic one is wrong"), note: S("a note for the admin") }, ["map", "type", "x"], async (a) => text(await admin("POST", "/spawns", { map: a.map, type: a.type, x: a.x, n: a.n, up: a.up, row: a.floor_row, note: a.note ?? "AI" })));
  tool("update_spawn", "Change a placed row (move it, change how many or which monster).", { id: N("the row id (list_maps → spawns)"), map: S("map id"), type: S("monster type"), x: N("cells"), n: N("how many"), up: N("cells above the floor"), floor_row: N("floor row"), note: S("note") }, ["id"], async ({ id, floor_row, ...rest }) => text(await admin("PATCH", `/spawns/${id}`, { ...rest, ...(floor_row !== undefined ? { row: floor_row } : {}) })));
  tool("remove_spawn", "Take a placed row (and its monsters) off the map.", { id: N("the row id") }, ["id"], async ({ id }) => text(await admin("DELETE", `/spawns/${id}`)));
  tool("create_monster", "Make a new monster in one go: its look (a pixelfx effect id: an existing critter from search_effects, or one you made), its numbers, what it drops, and optionally where it lives. It is live at once (no restart). Typical numbers by map tier (hp/atk/def/spd): Bích Lạc ~120/14/4/60, Linh Thủy ~400/35/12/65, U Minh ~1200/80/30/70, Ma Vực ~3500/160/60/75; exp_base ≈ hp/4, stones ≈ hp/20, respawn 8-20 s, aggro 120-200 px, reach 34-50 px, cooldown 1-1.6 s, mult 1-1.3. style: melee (walks up and bites), ranged (shoots shot_fx from shot_range px), none (does not attack).", {
    type: S("its code: a-z0-9_, at most 16 letters (e.g. hoa_ho)"), name: S("its name shown to players (Vietnamese, e.g. Hỏa Hồ)"), fx: S("its pixelfx effect id, e.g. critters/frog"),
    hp: N("life"), atk: N("attack"), def: N("defence"), spd: N("speed (px/s)"), respawn: N("seconds to come back (default 12)"),
    exp_base: N("tu vi given (base)"), exp_per_level: N("tu vi per player level"), stones: N("linh thạch given"), aggro: N("notices players this close (px)"), reach: N("bite reach (px)"), cooldown: N("seconds between strikes"), mult: N("damage multiplier"),
    style: S("melee | ranged | none", { enum: ["melee", "ranged", "none"] }), fly: B("it flies"), shot_fx: S("ranged: the effect it shoots"), shot_range: N("ranged: px"), shot_speed: N("ranged: px/s"), drop_rate: N("0-1 chance of a drop roll (0: the setting's default)"),
    drops: { type: "array", description: "what it drops: [{ item (item_key), chance (a weight), min, max }]", items: { type: "object" } },
    place: { type: "object", description: "optional: { map, x, n, up } to place it right away" },
  }, ["type", "name", "fx", "hp", "atk", "def", "spd"], async (a) => serial(async () => {
    const done = [];
    const lib = await admin("GET", `/fx?q=${encodeURIComponent(a.fx)}&limit=500`);
    const fx = lib.effects.find((f) => f.id === a.fx);
    if (!fx) throw new Error(`Không có hiệu ứng ${a.fx} trong thư viện pixelfx (search_effects để tìm).`);
    if (!fx.inGame) (await admin("POST", "/fx", { id: a.fx }), done.push(`đã chép ${a.fx} vào game`));
    if (a.shot_fx && !(await admin("GET", `/fx?q=${encodeURIComponent(a.shot_fx)}&limit=500`)).effects.find((f) => f.id === a.shot_fx)?.inGame) (await admin("POST", "/fx", { id: a.shot_fx }), done.push(`đã chép ${a.shot_fx} vào game`));
    const row = { type: a.type, name: a.name, fx: a.fx, hp: a.hp, atk: a.atk, def: a.def, spd: a.spd, respawn: a.respawn ?? 12, exp_base: a.exp_base ?? Math.round(a.hp / 4), exp_per_level: a.exp_per_level ?? 0, stones: a.stones ?? Math.round(a.hp / 20), aggro: a.aggro ?? 160, reach: a.reach ?? 40, cooldown: a.cooldown ?? 1.3, mult: a.mult ?? 1, style: a.style ?? "melee", fly: !!a.fly, shot_fx: a.shot_fx ?? "", shot_range: a.shot_range ?? 0, shot_speed: a.shot_speed ?? 0, drop_rate: a.drop_rate ?? 0 };
    await admin("POST", "/t/monsters", row);
    done.push(`đã tạo yêu thú ${a.type}`);
    for (const d of a.drops ?? []) {
      await admin("POST", "/t/monster_drops", { monster: a.type, item_key: d.item, chance: d.chance ?? 10, min_qty: d.min ?? 1, max_qty: d.max ?? d.min ?? 1 });
      done.push(`rơi ${d.item}`);
    }
    if (a.place) {
      const p = await admin("POST", "/spawns", { map: a.place.map, type: a.type, x: a.place.x, n: a.place.n ?? 3, up: a.place.up ?? (a.fly ? 3 : 0), note: "AI" });
      done.push(`đặt ${a.place.n ?? 3} con ở ${a.place.map} (dòng ${p.id})`);
    }
    return text({ ok: true, done });
  }));

  // ---- pixel art: the pixelfx library
  tool("pixelfx_guide", "How to make pixel art for this game with the pixelfx library. topic: skill (the method: search, draft, render, look, refine, check), authoring (the effect file contract and painter API: read before write_effect), catalog (every effect by category), game (what the game needs from a monster, a character, a boss, and how to put them in).", { topic: S("skill | authoring | catalog | game", { enum: ["skill", "authoring", "catalog", "game"] }) }, ["topic"], async ({ topic }) => {
    const f = { skill: "skills/pixelfx/SKILL.md", authoring: "docs/AUTHORING.md", catalog: "docs/CATALOG.md", game: "deploy/mcp/GAME-ART.md" }[topic];
    const p = join(dir(), f);
    return text(existsSync(p) ? readFileSync(p, "utf8") : `Không có ${f} trên máy này (bản cài cũ: chạy "Cập nhật" ở bảng điều khiển).`);
  });
  tool("search_effects", "Search the pixelfx library (244+ effects) by words in their id, name and tags; each says whether the game already has it (inGame). Monsters are critters/*, characters nhanvat/*, bosses boss/*.", { query: S("words, e.g. \"fire bird\""), category: S("only this category, e.g. critters") }, [], async ({ query = "", category = "" }) => {
    const r = await admin("GET", `/fx?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&limit=200`);
    return text(r.library ? r : "Thư viện pixelfx (thư mục src/) chưa có trên máy này: chạy \"Cập nhật\" ở bảng điều khiển.");
  });
  tool("read_effect_source", "The source of a pixelfx effect or helper (e.g. critters/frog, critters/_lib, nhanvat/_rig, boss/_rig, nhanvat/kiem-khach): read two or three close ones before writing your own.", { id: S("<category>/<name>") }, ["id"], async ({ id }) => {
    const f = effectFile(id);
    if (!existsSync(f)) throw new Error(`Không có ${id}.`);
    const s = readFileSync(f, "utf8");
    return text(s.length > 60000 ? s.slice(0, 60000) + "\n… (cắt bớt)" : s);
  });
  tool("render_effect", "Render an effect and look at it: returns its contact sheet (frames in a grid) as an image, plus for a figure made from a picture its parts map. Do this after every change; judge it like a picky pixel artist.", { id: S("<category>/<name>"), anim: S("for figures: idle, walk, attack (characters, monsters), slam, roar, dead (bosses)"), options: O("the effect's options (palette, seed, …)") }, ["id"], async ({ id, anim, options }) => {
    effectFile(id);
    const opts = { ...(options ?? {}), ...(anim ? { anim } : {}) };
    const r = await node(["tools/render.mjs", id, ...(Object.keys(opts).length ? ["--opts", JSON.stringify(opts)] : [])]);
    if (r.code !== 0) throw new Error(r.out.slice(-1500));
    return withImages(r.out.trim().slice(-500), [png(join(recDir(id), "contact.png")), png(join(recDir(id), "parts.png"))]);
  });
  tool("write_effect", "Write (or replace) a pixelfx effect file src/fx/<id>.js with your code, then check it (tools/check.mjs: canvas bounds, loops, randomness) and render it. Follow docs/AUTHORING.md (pixelfx_guide authoring). A monster is a looping critter (critters/<name>, faces right, feet at the origin); a character is a nhanvat/<name> figure using ./_rig.js; a boss a boss/<name> figure using ./_rig.js. Needs the owner's permission (allow code). The previous version is kept in records/<id>/before.js.", { id: S("<category>/<name>"), code: S("the whole file (ES module: export meta, and draw or create)") }, ["id", "code"], async ({ id, code }) => serial(async () => {
    needCode();
    const f = effectFile(id);
    if (basename(f).startsWith("_")) throw new Error("Không ghi đè tệp dùng chung (_rig.js, _lib.js…).");
    if (code.length > 400000) throw new Error("Tệp quá dài.");
    mkdirSync(recDir(id), { recursive: true });
    if (existsSync(f)) copyFileSync(f, join(recDir(id), "before.js"));
    mkdirSync(join(f, ".."), { recursive: true });
    writeFileSync(f, code);
    await ctx.runRoot(["chown", "-R", "dvtt:dvtt", join(dir(), "src", "fx"), join(dir(), "records")]).catch(() => null);
    const chk = await node(["tools/check.mjs", id]);
    const ren = await node(["tools/render.mjs", id]);
    await node(["tools/index.mjs"]);
    const sha = await commit(`viết hiệu ứng ${id}`);
    return withImages(`check:\n${chk.out.trim().slice(-2500)}\n\nrender:\n${ren.out.trim().slice(-600)}${sha ? `\n\n(git ${sha})` : ""}`, [png(join(recDir(id), "contact.png"))]);
  }));
  tool("list_uploads", "Pictures the owner uploaded on the dashboard (Trợ lý AI → Ảnh) for you to turn into figures.", {}, [], async () => {
    if (!existsSync(UPLOADS)) return text([]);
    return text(readdirSync(UPLOADS).filter((f) => /\.png$/i.test(f)).map((f) => ({ file: f, bytes: statSync(join(UPLOADS, f)).size, at: statSync(join(UPLOADS, f)).mtime })));
  });
  tool("image_to_figure", "Turn a picture (PNG with a clear background; an upload from list_uploads, or base64) into a rigged pixelfx figure: kind nhanvat (a character for the Y Các; faces right), boss (a world boss; faces the viewer) or critter (a monster; faces right). Returns the figure moving and a map of its parts (each part a colour, a grid line every 10 px). Then fix the split with `parts` (see pixelfx_guide game) and run again with the same id, until the motion looks right.", {
    kind: S("nhanvat | boss | critter", { enum: ["nhanvat", "boss", "critter"] }), id: S("nhanvat/<name>, boss/<name> or critters/<name> (lower case, dashes)"), name: S("its name (Vietnamese)"), desc: S("one line about it"),
    upload: S("a file from list_uploads"), image_base64: S("or the PNG itself, base64"),
    height: N("its height in pixels (default nhanvat 84, boss 148, critter 40)"), colors: N("at most this many colours"), flip: B("mirror it (it faces left in the picture)"), fly: B("critter: it flies"),
    parts: O("corrections of the split: { fx, legs, skirt, hair, eyes, skin (nhanvat); face, shoulders, waist, heads, roots (boss); boxes: [[part, x0, y0, x1, y1, only?]] }"),
    lab: { type: "array", items: { type: "string" }, description: "or a whole label grid (records/<id>/lab.json, edited)" },
  }, ["kind", "id"], async (a) => serial(async () => {
    needCode();
    effectFile(a.id);
    const tmp = join(dir(), "records", "_mcp");
    mkdirSync(tmp, { recursive: true });
    let pic;
    if (a.upload) {
      pic = join(UPLOADS, basename(a.upload));
      if (!existsSync(pic)) throw new Error(`Không có ảnh ${a.upload} (list_uploads).`);
      copyFileSync(pic, join(tmp, "in.png"));
      pic = join(tmp, "in.png");
    } else if (a.image_base64) {
      pic = join(tmp, "in.png");
      writeFileSync(pic, Buffer.from(a.image_base64.replace(/^data:image\/png;base64,/, ""), "base64"));
    } else throw new Error("Cần upload hoặc image_base64.");
    const args = ["tools/from-image.mjs", pic, "--kind", a.kind, "--id", a.id, "--force"];
    if (a.name) args.push("--name", a.name);
    if (a.desc) args.push("--desc", a.desc);
    if (a.height) args.push("--height", String(a.height));
    if (a.colors) args.push("--colors", String(a.colors));
    if (a.flip) args.push("--flip");
    if (a.fly) args.push("--fly");
    if (a.parts) (writeFileSync(join(tmp, "parts.json"), JSON.stringify(a.parts)), args.push("--parts", join(tmp, "parts.json")));
    if (a.lab) (writeFileSync(join(tmp, "lab.json"), JSON.stringify(a.lab)), args.push("--lab", join(tmp, "lab.json")));
    await ctx.runRoot(["chown", "-R", "dvtt:dvtt", tmp]).catch(() => null);
    const r = await node(args);
    if (r.code !== 0) throw new Error(r.out.slice(-1500));
    const sha = await commit(`${a.kind} ${a.id} từ ảnh`);
    const second = { nhanvat: "contact-walk.png", boss: "contact-slam.png", critter: "contact-walk.png" }[a.kind];
    return withImages(`${r.out.trim()}${sha ? `\n(git ${sha})` : ""}`, [png(join(recDir(a.id), "contact.png")), png(join(recDir(a.id), second)), png(join(recDir(a.id), "parts.png"))]);
  }));
  tool("add_effect_to_game", "Copy a pixelfx effect into the game (public/hieu-ung) so the game can draw it (create_monster does this by itself for its look).", { id: S("<category>/<name>") }, ["id"], async ({ id }) => text(await admin("POST", "/fx", { id })));

  // ---- putting figures in
  const them = async (args) => {
    const r = await ctx.runAs(["node", "tools/them.mjs", ...args], { cwd: game(), timeout: 180000 });
    const last = r.out.trim().split("\n").pop();
    let j = null;
    try {
      j = JSON.parse(last);
    } catch {}
    if (!j?.ok) throw new Error(j?.error ?? r.out.slice(-1500));
    return { j, out: r.out.trim() };
  };
  tool("list_added", "The characters and bosses added beyond the code (shared/them.js).", {}, [], async () => text(await admin("GET", "/them")));
  tool("register_character", "Put a character figure (nhanvat/<name>, rigged by the character rig) into the game: on sale in the Y Các at a price (linh thạch), for male (m), female (f) or anyone (a). Restarts the game (players reconnect by themselves in a few seconds).", { fx: S("nhanvat/<name>"), name: S("its name in the shop (Vietnamese)"), gender: S("m | f | a", { enum: ["m", "f", "a"] }), price: N("price in linh thạch (default 500)"), hidden: B("not on sale yet") }, ["fx", "name"], async (a) => serial(async () => {
    const { j } = await them(["skin", "add", a.fx, "--name", a.name, "--g", a.gender ?? "a", "--price", String(a.price ?? 500), ...(a.hidden ? ["--hidden"] : [])]);
    const sha = await commit(`nhân vật ${a.name}`);
    return text({ ok: true, added: j.added, restart: await restart("để game thấy nhân vật mới"), git: sha });
  }));
  tool("register_boss", "Put a boss figure (boss/<name>, rigged by the boss rig) into the game as a world boss the admin (or spawn_boss) can call. key: a short code (a-z0-9). colors: optional palettes for its slam, roar and hits ({ slam: [7 hex dark→bright], roar: [...], hit: [5 hex] }), to match its look. Restarts the game.", { fx: S("boss/<name>"), key: S("its code, 2-16 a-z0-9"), name: S("its name (Vietnamese)"), title: S("a line under its name"), colors: O("{ slam, roar, hit } palettes") }, ["fx", "key", "name"], async (a) => serial(async () => {
    const { j } = await them(["boss", "add", a.fx, "--key", a.key, "--name", a.name, ...(a.title ? ["--title", a.title] : []), ...(a.colors ? ["--colors", JSON.stringify(a.colors)] : [])]);
    const sha = await commit(`boss ${a.name}`);
    return text({ ok: true, added: j.added, restart: await restart("để game thấy boss mới"), git: sha });
  }));
  tool("unregister", "Take an added character (off sale; removed if nobody owns it) or an added boss (not while it is out) out of the game. Restarts the game.", { kind: S("character | boss", { enum: ["character", "boss"] }), id: S("character: its fx or idx; boss: its key") }, ["kind", "id"], async ({ kind, id }) => serial(async () => {
    const { j } = await them([kind === "boss" ? "boss" : "skin", "remove", id]);
    const sha = await commit(`gỡ ${kind} ${id}`);
    return text({ ok: true, ...j, restart: await restart(), git: sha });
  }));

  // ---- world bosses
  tool("boss_status", "The world boss now (life, map, top damage), the bosses there are, the maps a boss may be called on, the default numbers and the last fights.", {}, [], async () => text(await admin("GET", "/boss")));
  tool("spawn_boss", "Call a world boss onto a map (one at a time). Its life is shared by every Khu of that map; the rewards (stones, exp, pools) go to everyone who hit it, by damage, plus a bonus to the killer. Omit numbers for the defaults.", { key: S("boss key (boss_status)"), map: S("map id (boss_status.maps)"), x: N("where (px from the left; default the middle)"), hp: N("life"), stones: N("linh thạch pool"), exp: N("tu vi pool"), killBonus: N("% bonus for the killing blow"), minutes: N("how long before it leaves") }, ["key", "map"], async (a) => text(await admin("POST", "/boss/spawn", a)));
  tool("despawn_boss", "Send the world boss away (nobody gets anything).", {}, [], async () => text(await admin("POST", "/boss/despawn", {})));

  // ---- players
  tool("find_players", "Find players by name or account (part of it); online only if asked. Returns id, name, realm, level, stones, online.", { name: S("part of the name"), online: B("only those online"), limit: N("at most (default 30)") }, [], async ({ name = "", online, limit = 30 }) => {
    const rows = await admin("GET", `/players?q=${encodeURIComponent(name)}${online ? "&filter=online" : ""}`);
    return text(rows.slice(0, limit).map((p) => ({ id: p.id, name: p.name, account: p.username, realm: p.realm, level: p.level, stones: p.stones, online: p.online, banned: p.banned })));
  });
  tool("player_detail", "One player: resources, bag, arts, looks owned, buffs, recent history.", { id: N("player id") }, ["id"], async ({ id }) => text(await admin("GET", `/players/${id}`)));
  tool("give_item", "Give (or take) an item to a player (item_key from list_rows items).", { player_id: N("player id"), item: S("item_key"), qty: N("how many"), op: S("add (default) | sub | set", { enum: ["add", "sub", "set"] }) }, ["player_id", "item", "qty"], async (a) => {
    await admin("POST", `/players/${a.player_id}/items`, { item: a.item, op: a.op ?? "add", value: a.qty });
    return text({ ok: true });
  });
  tool("adjust_player", "Change a player's stones (linh thạch), exp (tu vi), rank, kills or deaths.", { player_id: N("player id"), field: S("stones | exp | rank | kills | deaths", { enum: ["stones", "exp", "rank", "kills", "deaths"] }), op: S("add | sub | set", { enum: ["add", "sub", "set"] }), value: N("amount") }, ["player_id", "field", "op", "value"], async (a) => {
    await admin("POST", `/players/${a.player_id}/adjust`, { field: a.field, op: a.op, value: a.value });
    return text({ ok: true });
  });
  tool("give_cosmetic", "Give a player a look from the Y Các (cosmetic id from list_rows cosmetics), or take it back (own: false).", { player_id: N("player id"), cosmetic_id: N("cosmetics.id"), own: B("true to give (default), false to take") }, ["player_id", "cosmetic_id"], async (a) => {
    await admin("POST", `/players/${a.player_id}/cosmetics`, { id: a.cosmetic_id, own: a.own !== false });
    return text({ ok: true });
  });

  // ---- running it
  tool("announce", "Say something to every player online (a banner and a line in the chat), e.g. an event starting.", { text: S("1-200 characters, Vietnamese") }, ["text"], async (a) => text(await admin("POST", "/announce", { text: a.text })));
  tool("restart_game", "Restart the game server (players reconnect by themselves; their progress is saved first). Needed after a code change; not after data changes.", {}, [], async () => text(await restart()));
  tool("game_logs", "The game server's last log lines (errors after a change show here).", { lines: N("how many (default 80)") }, [], async ({ lines = 80 }) => text(await ctx.logs(Math.min(1000, lines))));
  tool("admin_log", "What admins (and this AI, as its own admin) did lately.", { limit: N("how many (default 30)") }, [], async ({ limit = 30 }) => text(((await admin("GET", "/log")) ?? []).slice(0, limit)));

  return {
    list: () => T.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    async call(name, args) {
      const t = T.find((x) => x.name === name);
      if (!t) return { isError: true, content: [{ type: "text", text: `Không có tool ${name}.` }] };
      for (const k of t.inputSchema.required ?? []) if (args?.[k] === undefined || args[k] === "") return { isError: true, content: [{ type: "text", text: `Thiếu ${k}.` }] };
      try {
        return await t.run(args ?? {});
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  };
}
