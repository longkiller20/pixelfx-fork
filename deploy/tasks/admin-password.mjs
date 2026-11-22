// Đặt mật khẩu cho một tài khoản của trang admin game (tạo nếu chưa có), bỏ yêu cầu đổi mật khẩu lần đầu và đăng xuất
// mọi phiên cũ của tài khoản đó. Dùng .env của game. Tên và mật khẩu lấy từ biến môi trường ADMIN_USER, ADMIN_PASS
// (không qua dòng lệnh, để không lộ trong danh sách tiến trình).
//   cd game && ADMIN_USER=admin ADMIN_PASS='...' node ../deploy/tasks/admin-password.mjs
const user = String(process.env.ADMIN_USER ?? "").trim(), pass = String(process.env.ADMIN_PASS ?? "");
if (!/^[A-Za-z0-9_.-]{3,32}$/.test(user)) fail("Tên admin: 3-32 ký tự chữ, số, dấu . _ -");
if (pass.length < 8 || pass.length > 72) fail("Mật khẩu admin: 8-72 ký tự.");
const root = process.cwd();
const { pool, migrate } = await import(`${root}/server/db.js`);
const { hashPassword } = await import(`${root}/server/auth.js`);
const { adminMigrate } = await import(`${root}/server/admin.js`);
try {
  await migrate();
  await adminMigrate();
  const hash = await hashPassword(pass);
  const rows = await pool.query("SELECT id FROM admins WHERE username = ?", [user]);
  if (rows.length) {
    await pool.query("UPDATE admins SET pass_hash = ?, must_change = 0 WHERE id = ?", [hash, rows[0].id]);
    await pool.query("DELETE FROM admin_sessions WHERE admin_id = ?", [rows[0].id]);
    console.log(`✔  Đã đổi mật khẩu của admin "${user}".`);
  } else {
    await pool.query("INSERT INTO admins (username, pass_hash, must_change) VALUES (?, ?, 0)", [user, hash]);
    console.log(`✔  Đã tạo admin "${user}".`);
  }
  // the first-run account admin / admin123456 is not left behind with its well-known password
  if (user !== "admin" && process.env.KEEP_DEFAULT !== "1") {
    const r = await pool.query("DELETE FROM admins WHERE username = 'admin' AND must_change = 1");
    if (r.affectedRows) console.log('    Đã xoá tài khoản mặc định "admin" (mật khẩu admin123456 chưa đổi).');
  }
} finally {
  await pool.end();
}
process.exit(0);
function fail(m) {
  console.error(`✖  ${m}`);
  process.exit(1);
}
