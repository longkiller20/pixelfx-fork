// Admin tool for the game's numbers in the database: realms, pills (items), monsters, arts (skills) and settings.
// Uses the server's .env. Every change is checked the same way the game checks it, and refused if it would break the game;
// a running server picks a good change up within about 10 seconds and pushes it to every player, no restart needed.
//
//   npm run admin -- show realms|items|monsters|skills|settings
//   npm run admin -- set <setting> <value>                        e.g. set daily.stones 50
//
//   npm run admin -- realm add "<name>" [stages] [--after <id>]   a new realm at the end, or after realm <id>
//   npm run admin -- realm rename <id> "<name>"
//   npm run admin -- realm stages <id> <n>                        how many levels ("tầng") the realm has
//   npm run admin -- realm move <id> --after <id2>                put it right after realm id2 (--first: at the top)
//   npm run admin -- realm del <id>
//
//   npm run admin -- item add <key> "<name>" <price>              then set what it does:
//   npm run admin -- item set <key> <field> <value>               fields: name desc price heal exp_base exp_per_level
//                                                                 cooldown on_sale sort  (heal 0.4 = 40% of max hp)
//   npm run admin -- monster set <dummy|ghost> <field> <value>    fields: name hp atk def spd respawn exp_base
//                                                                 exp_per_level stones aggro reach cooldown mult
//   npm run admin -- skill set 0 <field> <value>      (the basic attack; arts are edited on the admin site)            fields: name cd mult, or the type's own numbers:
//                                                                 melee range arc · bolt range speed r · zone dist r delay slow slowDur
//
// Hair styles and robes have their own tool: npm run cosmetics.
import { pool, migrate, tx } from "../server/db.js";
import { readConfig } from "../server/gameconfig.js";
import { checkConfig, DEFAULTS, SKILL_PARAMS } from "../shared/balance.js";

const [what, ...a] = process.argv.slice(2);
const ITEM_FIELDS = { name: "s", desc: "description", price: "n", heal: "n", exp_base: "n", exp_per_level: "n", cooldown: "n", on_sale: "n", sort: "n" };
const MONSTER_FIELDS = ["name", "hp", "atk", "def", "spd", "respawn", "exp_base", "exp_per_level", "stones", "aggro", "reach", "cooldown", "mult"];
const number = (v, what) => {
  const n = Number(v);
  if (v === undefined || v === "" || !Number.isFinite(n)) throw new Error(`${what} phải là một số`);
  return n;
};
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`id "${v}" không hợp lệ`);
  return n;
};
const afterArg = () => {
  const i = a.indexOf("--after");
  return i >= 0 ? id(a[i + 1]) : null;
};

/** Run fn(conn) in a transaction, then check the whole config; anything that would break the game is rolled back. */
async function change(fn) {
  await tx(async (c) => {
    const msg = await fn(c);
    checkConfig(await readConfig(c));
    console.log(msg ?? "Đã lưu. Máy chủ đang chạy sẽ áp dụng trong khoảng 10 giây.");
  });
}
const one = (r, what) => {
  if (!r.affectedRows) throw new Error(`Không tìm thấy ${what}.`);
};

/** Put realm rid right after realm `after` (null: first), renumbering every realm's sort in steps of 10. */
async function placeRealm(c, rid, after) {
  const rows = (await c.query("SELECT id FROM realms ORDER BY sort, id")).map((r) => r.id).filter((x) => x !== rid);
  const at = after === null ? 0 : rows.indexOf(after) + 1;
  if (after !== null && at === 0) throw new Error(`Không có cảnh giới id ${after}.`);
  rows.splice(at, 0, rid);
  for (const [i, x] of rows.entries()) await c.query("UPDATE realms SET sort = ? WHERE id = ?", [(i + 1) * 10, x]);
}

function table(rows) {
  console.table(rows);
}

try {
  await migrate();
  const [verb, ...b] = a;
  switch (what) {
    case "show": {
      const t = a[0];
      if (t === "realms") {
        let L = 0;
        table((await pool.query("SELECT id, name, stages FROM realms ORDER BY sort, id")).map((r) => ({
          id: r.id, "cảnh giới": r.name, "số tầng": r.stages, "cấp": `${L + 1}-${(L += r.stages)}`,
        })));
      } else if (t === "items") table(await pool.query("SELECT item_key, name, price, heal, exp_base, exp_per_level, cooldown, on_sale, sort, description FROM items ORDER BY sort, item_key"));
      else if (t === "monsters") table(await pool.query("SELECT * FROM monsters"));
      else if (t === "skills") table(await pool.query("SELECT * FROM skills ORDER BY slot"));
      else if (t === "settings") table(await pool.query("SELECT k AS khoá, v AS giá_trị, note AS ý_nghĩa FROM settings ORDER BY k"));
      else throw new Error("show realms|items|monsters|skills|settings");
      break;
    }
    case "set": {
      const [k, v] = a;
      if (!DEFAULTS.settings[k]) throw new Error(`Không có cài đặt "${k}". Xem: npm run admin -- show settings`);
      await change(async (c) => one(await c.query("UPDATE settings SET v = ? WHERE k = ?", [number(v, k), k]), k));
      break;
    }
    case "realm":
      if (verb === "add") {
        const [name, stages] = b;
        await change(async (c) => {
          const r = await c.query("INSERT INTO realms (sort, name, stages) VALUES (1000000, ?, ?)", [String(name ?? "").trim(), stages && !stages.startsWith("--") ? number(stages, "số tầng") : 5]);
          const after = afterArg();
          if (after !== null) await placeRealm(c, r.insertId, after);
          else await placeRealm(c, r.insertId, (await c.query("SELECT id FROM realms WHERE id <> ? ORDER BY sort DESC, id DESC LIMIT 1", [r.insertId]))[0]?.id ?? null);
          return `Đã thêm cảnh giới, id ${r.insertId}.`;
        });
      } else if (verb === "rename") await change(async (c) => one(await c.query("UPDATE realms SET name = ? WHERE id = ?", [String(b[1] ?? "").trim(), id(b[0])]), "cảnh giới đó"));
      else if (verb === "stages") await change(async (c) => one(await c.query("UPDATE realms SET stages = ? WHERE id = ?", [number(b[1], "số tầng"), id(b[0])]), "cảnh giới đó"));
      else if (verb === "move") await change(async (c) => placeRealm(c, id(b[0]), a.includes("--first") ? null : afterArg()));
      else if (verb === "del") await change(async (c) => one(await c.query("DELETE FROM realms WHERE id = ?", [id(b[0])]), "cảnh giới đó"));
      else throw new Error("realm add|rename|stages|move|del");
      break;
    case "item":
      if (verb === "add") {
        const [key, name, price] = b;
        await change(async (c) => {
          await c.query("INSERT INTO items (item_key, name, price, sort) VALUES (?, ?, ?, 100)", [key, name, number(price, "giá")]);
          return `Đã thêm ${key}. Đặt công dụng bằng: item set ${key} heal 0.5 (hoặc exp_base / exp_per_level).`;
        });
      } else if (verb === "set") {
        const [key, field, v] = b, f = ITEM_FIELDS[field];
        if (!f) throw new Error(`Trường: ${Object.keys(ITEM_FIELDS).join(", ")}`);
        const col = field === "desc" ? "description" : field;
        await change(async (c) => one(await c.query(`UPDATE items SET ${col} = ? WHERE item_key = ?`, [f === "n" ? number(v, field) : v, key]), `vật phẩm ${key}`));
      } else throw new Error("item add|set");
      break;
    case "monster": {
      const [type, field, v] = b;
      if (verb !== "set" || !MONSTER_FIELDS.includes(field)) throw new Error(`monster set <type> <${MONSTER_FIELDS.join("|")}> <giá trị>`);
      await change(async (c) => one(await c.query(`UPDATE monsters SET ${field} = ? WHERE type = ?`, [field === "name" ? v : number(v, field), type]), `yêu thú ${type}`));
      break;
    }
    case "skill": {
      const [slot, field, v] = b;
      if (verb !== "set") throw new Error("skill set 0 <trường> <giá trị> (công pháp sửa ở trang admin)");
      await change(async (c) => {
        const [s] = await c.query("SELECT * FROM skills WHERE slot = ?", [number(slot, "ô chiêu")]);
        if (!s) throw new Error(`Không có chiêu ô ${slot}.`);
        if (field === "name") await c.query("UPDATE skills SET name = ? WHERE slot = ?", [v, s.slot]);
        else if (field === "cd" || field === "mult") await c.query(`UPDATE skills SET ${field} = ? WHERE slot = ?`, [number(v, field), s.slot]);
        else if (SKILL_PARAMS[s.type].includes(field)) {
          const p = JSON.parse(s.params);
          p[field] = number(v, field);
          await c.query("UPDATE skills SET params = ? WHERE slot = ?", [JSON.stringify(p), s.slot]);
        } else throw new Error(`Chiêu loại ${s.type} có: name, cd, mult, ${SKILL_PARAMS[s.type].join(", ")}`);
      });
      break;
    }
    default:
      throw new Error("Lệnh: show | set | realm | item | monster | skill (xem đầu file tools/admin.mjs)");
  }
} catch (e) {
  console.error(e.code === "ER_DUP_ENTRY" ? "Mã này đã có." : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
