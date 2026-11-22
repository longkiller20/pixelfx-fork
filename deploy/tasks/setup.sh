#!/usr/bin/env bash
# Cài tất cả, theo thứ tự: các gói cần thiết → database → game → mật khẩu admin (nếu có ADMIN_PASS) → tên miền (nếu
# PROXY khác none) → tường lửa (nếu FIREWALL=1) → sao lưu tự động (nếu BACKUP_DAILY=1).
. "$(dirname "$0")/lib.sh"
here="$(dirname "$(readlink -f "$0")")"
run() { printf '\n\n######## %s ########\n' "$1"; bash "$here/$2"; }
run "1. Cài gói cần thiết" deps.sh
run "2. Cơ sở dữ liệu" db.sh
run "3. Cài và chạy game" app.sh
if [ -n "${ADMIN_PASS:-}" ]; then run "4. Mật khẩu trang admin" adminpw.sh; else printf '\n(bỏ qua mật khẩu admin: chưa nhập)\n'; fi
if [ "$PROXY" != none ] && [ -n "$DOMAIN" ]; then run "5. Tên miền ($PROXY)" proxy.sh; else printf '\n(bỏ qua tên miền: chưa chọn)\n'; fi
if [ "${FIREWALL:-1}" = 1 ]; then run "6. Tường lửa" firewall.sh; fi
if [ "${BACKUP_DAILY:-0}" = 1 ]; then printf '\n\n######## 7. Sao lưu tự động ########\n'; ACTION=timer bash "$here/backup.sh"; fi
printf '\n'
ok "Cài đặt xong."
