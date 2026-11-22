#!/usr/bin/env bash
# Cập nhật lên mã mới nhất của nhánh BRANCH: sao lưu database trước, tải mã (giữ .env), cài lại thư viện, chạy lại game.
# Bảng điều khiển cũng được cập nhật và tự chạy lại sau đó vài giây.
. "$(dirname "$0")/lib.sh"
cd "$DVTT_DIR" || die "Không vào được $DVTT_DIR."
[ -d .git ] || die "$DVTT_DIR không phải thư mục git."
git config --global --add safe.directory "$DVTT_DIR" 2>/dev/null || true
before="$(git rev-parse --short HEAD)"
step "Phiên bản đang chạy: $before ($(git log -1 --format=%cd --date=format:'%d/%m/%Y %H:%M'))"

step "Sao lưu trước khi cập nhật"
if mariadb -e "USE \`$DB_NAME\`" >/dev/null 2>&1; then ACTION=create bash "$(dirname "$0")/backup.sh" | grep -E '✔|!!' || true; else info "chưa có database, bỏ qua"; fi

step "Tải mã mới (nhánh $BRANCH)"
git remote set-url origin "$REPO"
git fetch --depth 1 origin "$BRANCH" 2>&1 | sed 's/^/    /'
after="$(git rev-parse --short FETCH_HEAD)"
if [ "$before" = "$after" ] && [ "${FORCE:-0}" != 1 ]; then ok "Đã là bản mới nhất ($after)."; exit 0; fi
git reset --hard FETCH_HEAD >/dev/null
git log -1 --format='    %h %s (%cd)' --date=format:'%d/%m/%Y %H:%M'

bash "$(dirname "$0")/app.sh"
ok "Đã cập nhật $before → $after."
if systemctl list-unit-files dvtt-panel.service >/dev/null 2>&1; then
  info "bảng điều khiển sẽ chạy lại sau 3 giây (tải lại trang nếu mất kết nối)"
  systemd-run --on-active=3 --unit="dvtt-panel-restart-$(date +%s)" /bin/systemctl restart dvtt-panel >/dev/null 2>&1 || true
fi
