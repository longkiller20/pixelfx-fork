#!/usr/bin/env bash
# Mật khẩu trang admin của game: ADMIN_USER (mặc định admin), ADMIN_PASS (8-72 ký tự). Không cần dừng game.
. "$(dirname "$0")/lib.sh"
: "${ADMIN_USER:=admin}"
[ -n "${ADMIN_PASS:-}" ] || die "Chưa nhập mật khẩu admin."
[ -f "$ENV_FILE" ] || die "Chưa cấu hình game (chạy bước \"Cơ sở dữ liệu\" trước)."
[ -d "$GAME_DIR/node_modules" ] || die "Chưa cài thư viện game (chạy bước \"Cài và chạy game\" trước)."
step "Đặt mật khẩu admin game cho \"$ADMIN_USER\""
cd "$GAME_DIR" || die "Không vào được $GAME_DIR."
# as the game's own user, reading the game's own .env (the script imports the game's modules)
runuser -u "$GAME_USER" -- env ADMIN_USER="$ADMIN_USER" ADMIN_PASS="$ADMIN_PASS" "$(command -v node)" "$(dirname "$(readlink -f "$0")")/admin-password.mjs"
ok "Xong. Đăng nhập trang admin bằng \"$ADMIN_USER\" và mật khẩu vừa đặt."
