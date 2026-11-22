#!/usr/bin/env bash
# Cơ sở dữ liệu của game: database dvtt và tài khoản dvtt@localhost chỉ có quyền trên nó. Mật khẩu ngẫu nhiên, ghi vào
# .env của game (DB_PASS). Chạy lại thì giữ mật khẩu đang dùng nếu nó còn đăng nhập được, không thì đặt mới.
. "$(dirname "$0")/lib.sh"

[ -d "$GAME_DIR" ] || die "Chưa có mã nguồn game ở $GAME_DIR."
have mariadb || die "Chưa cài MariaDB (chạy bước \"Cài gói cần thiết\" trước)."
mariadb -e "SELECT 1" >/dev/null 2>&1 || { has_systemd && systemctl start mariadb; sleep 2; }
mariadb -e "SELECT 1" >/dev/null 2>&1 || die "MariaDB không chạy."
[ -f "$ENV_FILE" ] || { cp "$GAME_DIR/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"; }

step "Database $DB_NAME"
mariadb -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
ok "có database $DB_NAME"

step "Tài khoản $DB_USER@localhost"
pass="$(env_get DB_PASS)"
if [ -n "$pass" ] && [ "$pass" != doi_mat_khau_nay ] && mariadb -u "$DB_USER" -p"$pass" -h 127.0.0.1 -e "USE \`$DB_NAME\`" >/dev/null 2>&1; then
  ok "mật khẩu trong .env vẫn đúng, giữ nguyên"
else
  pass="$(openssl rand -hex 24)"
  mariadb <<SQL
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$pass';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$pass';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$pass';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$pass';
SQL
  ok "đã đặt mật khẩu mới (ngẫu nhiên, lưu trong .env)"
fi
mariadb <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
env_set DB_HOST 127.0.0.1
env_set DB_PORT 3306
env_set DB_USER "$DB_USER"
env_set DB_PASS "$pass"
env_set DB_NAME "$DB_NAME"
chmod 600 "$ENV_FILE"
id "$GAME_USER" >/dev/null 2>&1 && chown "$GAME_USER:$GAME_USER" "$ENV_FILE"
mariadb -u "$DB_USER" -p"$pass" -h 127.0.0.1 -e "USE \`$DB_NAME\`" || die "Tài khoản $DB_USER không đăng nhập được."
step "MariaDB chỉ nghe ở máy này"
if mariadb -N -e "SELECT @@bind_address" 2>/dev/null | grep -qvE '^(127\.0\.0\.1|localhost)$'; then
  printf '[mysqld]\nbind-address = 127.0.0.1\n' > /etc/mysql/mariadb.conf.d/90-dvtt.cnf
  has_systemd && systemctl restart mariadb
  info "đặt bind-address = 127.0.0.1"
fi
ok "Xong: database sẵn sàng."
