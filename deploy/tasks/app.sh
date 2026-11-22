#!/usr/bin/env bash
# Cài và chạy game: người dùng hệ thống "dvtt" (game không chạy bằng root), thư viện npm, .env (cổng, ai được vào),
# dịch vụ systemd "dvtt" tự chạy lại khi lỗi và khi khởi động máy; chạy lại game rồi đợi nó trả lời.
. "$(dirname "$0")/lib.sh"

[ -f "$GAME_DIR/package.json" ] || die "Chưa có mã nguồn game ở $GAME_DIR."
[ "$(node_major)" -ge 18 ] || die "Cần Node 18 trở lên (chạy bước \"Cài gói cần thiết\" trước)."

step "Người dùng hệ thống $GAME_USER"
if ! id "$GAME_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$GAME_DIR" --no-create-home --shell /usr/sbin/nologin "$GAME_USER"
  ok "đã tạo"
else ok "đã có"; fi

step "Thư viện npm"
cd "$GAME_DIR" || die "Không vào được $GAME_DIR."
chown -R "$GAME_USER:$GAME_USER" "$GAME_DIR"
export npm_config_cache="$GAME_DIR/.npm-cache"
if [ -f package-lock.json ]; then
  runuser -u "$GAME_USER" -- env npm_config_cache="$npm_config_cache" npm ci --omit=dev --no-audit --no-fund --loglevel=error
else
  runuser -u "$GAME_USER" -- env npm_config_cache="$npm_config_cache" npm install --omit=dev --no-audit --no-fund --loglevel=error
fi
rm -rf "$npm_config_cache"
ok "đã cài thư viện ($(ls node_modules | wc -l) gói)"

step "Cấu hình game (.env)"
grep -qE '^\s*DB_PASS\s*=' "$ENV_FILE" 2>/dev/null && [ "$(env_get DB_PASS)" != doi_mat_khau_nay ] || warn "Chưa có mật khẩu database: chạy bước \"Cơ sở dữ liệu\"."
write_game_env

step "Dịch vụ systemd dvtt"
has_systemd || die "Máy này không có systemd."
cat > /etc/systemd/system/dvtt.service <<UNIT
# Tạo bởi deploy/tasks/app.sh (bảng điều khiển). Sửa ở bảng điều khiển, đừng sửa tay: lần cài sau sẽ ghi đè.
[Unit]
Description=Da Vu Tru Tu Tien game server
After=network-online.target mariadb.service
Wants=network-online.target mariadb.service

[Service]
Type=simple
User=$GAME_USER
Group=$GAME_USER
WorkingDirectory=$GAME_DIR
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=3
TimeoutStopSec=20
Environment=NODE_ENV=production
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable dvtt >/dev/null 2>&1
systemctl restart dvtt
info "đợi game trả lời ở cổng $GAME_PORT…"
if wait_port "$GAME_PORT" 60; then
  ok "game đang chạy: http://127.0.0.1:$GAME_PORT"
else
  journalctl -u dvtt -n 40 --no-pager || true
  die "Game không chạy được (xem log ở trên)."
fi
wait_port "$ADMIN_PORT" 10 && ok "trang admin đang chạy: http://127.0.0.1:$ADMIN_PORT" || warn "trang admin chưa trả lời ở cổng $ADMIN_PORT"
ok "Xong: game đã chạy."
