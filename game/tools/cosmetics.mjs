// Admin tool for the wardrobe (the cosmetics table). Uses the same .env as the server; safe while the game runs, since the
// game reads the table on every request.
//
//   npm run cosmetics -- list [skin|sword] [m|f|a]
//   npm run cosmetics -- add <kind> <m|f|a> <idx> <price> "<name>" [--starter]     (kinds: skin, sword)
//   npm run cosmetics -- price <id> <price>
//   npm run cosmetics -- rename <id> "<name>"
//   npm run cosmetics -- sale <id> on|off          take off sale (owners keep it) or put back
//   npm run cosmetics -- starter <id> on|off       free at creation, or not
//   npm run cosmetics -- give <username> <id>      hand an item to a player (an event prize, a refund)
//
// idx: a character's number in shared/nhan-vat.js (its figure is src/fx/nhanvat/<key>.js), a flying sword's folder
// public/phi-kiem/<idx>-<name>/hinh.png. A new character is a new figure and a line in shared/nhan-vat.js (see the README).
import { pool, migrate } from "../server/db.js";

const [cmd, ...a] = process.argv.slice(2);
const KINDS = ["skin", "sword"], GENDERS = ["m", "f", "a"];
const die = (m) => {
  console.error(m);
  process.exitCode = 1;
};
const int = (v, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${what} phải là số nguyên không âm`);
  return n;
};
const onOff = (v) => {
  if (v !== "on" && v !== "off") throw new Error("dùng on hoặc off");
  return v === "on" ? 1 : 0;
};
const changed = (r) => console.log(r.affectedRows ? "Đã lưu." : "Không tìm thấy món đồ đó.");

try {
  await migrate();
  switch (cmd) {
    case "list": {
      const [kind, g] = a;
      const rows = await pool.query(
        `SELECT c.id, c.kind, c.gender, c.idx, c.name, c.price, c.starter, c.on_sale, COUNT(o.user_id) AS owners
         FROM cosmetics c LEFT JOIN owned_cosmetics o ON o.cosmetic_id = c.id
         WHERE (? IS NULL OR c.kind = ?) AND (? IS NULL OR c.gender = ?) GROUP BY c.id ORDER BY c.kind, c.gender, c.idx`,
        [kind ?? null, kind ?? null, g ?? null, g ?? null],
      );
      console.table(rows.map((r) => ({ id: r.id, loại: r.kind, giới: r.gender, idx: r.idx, tên: r.name, giá: r.price, "khởi đầu": r.starter ? "✓" : "", "đang bán": r.on_sale ? "✓" : "", "người có": Number(r.owners) })));
      break;
    }
    case "add": {
      const [kind, g, idx, price, name] = a;
      if (!KINDS.includes(kind) || !GENDERS.includes(g) || !name) throw new Error(`add <${KINDS.join("|")}> <m|f|a> <idx> <price> "<name>" [--starter]`);
      const r = await pool.query("INSERT INTO cosmetics (kind, gender, idx, name, price, starter, sort) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        kind, g, int(idx, "idx"), name.slice(0, 40), int(price, "giá"), a.includes("--starter") ? 1 : 0, int(idx, "idx"),
      ]);
      console.log(`Đã thêm, id ${r.insertId}.`);
      break;
    }
    case "price":
      changed(await pool.query("UPDATE cosmetics SET price = ? WHERE id = ?", [int(a[1], "giá"), int(a[0], "id")]));
      break;
    case "rename":
      if (!a[1]) throw new Error('rename <id> "<name>"');
      changed(await pool.query("UPDATE cosmetics SET name = ? WHERE id = ?", [a[1].slice(0, 40), int(a[0], "id")]));
      break;
    case "sale":
      changed(await pool.query("UPDATE cosmetics SET on_sale = ? WHERE id = ?", [onOff(a[1]), int(a[0], "id")]));
      break;
    case "starter":
      changed(await pool.query("UPDATE cosmetics SET starter = ? WHERE id = ?", [onOff(a[1]), int(a[0], "id")]));
      break;
    case "give": {
      const [u] = await pool.query("SELECT id FROM users WHERE username = ?", [a[0] ?? ""]);
      if (!u) throw new Error("Không có tài khoản đó.");
      const r = await pool.query("INSERT IGNORE INTO owned_cosmetics (user_id, cosmetic_id, price) VALUES (?, ?, 0)", [u.id, int(a[1], "id")]);
      console.log(r.affectedRows ? "Đã tặng." : "Người này đã có món đó.");
      break;
    }
    default:
      die("Lệnh: list | add | price | rename | sale | starter | give (xem đầu file tools/cosmetics.mjs)");
  }
} catch (e) {
  die(e.code === "ER_DUP_ENTRY" ? "Món này (loại, giới tính, idx) đã có trong bảng." : e.message);
} finally {
  await pool.end();
}
