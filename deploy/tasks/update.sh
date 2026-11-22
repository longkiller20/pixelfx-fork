#!/usr/bin/env bash
# Cập nhật lên mã mới nhất của nhánh BRANCH: sao lưu database trước, tải mã (giữ .env), cài lại thư viện, chạy lại game.
# Bảng điều khiển cũng được cập nhật và tự chạy lại sau đó vài giây.
. "$(dirname "$0")/lib.sh"
cd "$DVTT_DIR" || die "Không vào được $DVTT_DIR."
[ -d .git ] || die "$DVTT_DIR không phải thư mục git."
git config --global --add safe.directory "$DVTT_DIR" 2>/dev/null || true
# what the game came as (the last update); what was changed on this machine since (the AI's figures, the owner's own
# edits) is carried over the update as a patch
base="$(git config dvtt.base || git rev-parse HEAD)"
git cat-file -e "$base^{commit}" 2>/dev/null || base="$(git rev-parse HEAD)"
before="$(git rev-parse --short "$base")"
step "Phiên bản đang chạy: $before ($(git log -1 --format=%cd --date=format:'%d/%m/%Y %H:%M' "$base"))"

step "Sao lưu trước khi cập nhật"
if mariadb -e "USE \`$DB_NAME\`" >/dev/null 2>&1; then ACTION=create bash "$(dirname "$0")/backup.sh" | grep -E '✔|!!' || true; else info "chưa có database, bỏ qua"; fi

step "Tải mã mới (nhánh $BRANCH)"
git remote set-url origin "$REPO"
# an install from before the AI tools had only game/ and deploy/: now the pixelfx library too (src, tools, skills, docs)
if [ "$(git config core.sparseCheckout || true)" = true ]; then git sparse-checkout set --no-cone '/*' '!/docs/readme/' >/dev/null 2>&1 || true; fi
git fetch --depth 1 origin "$BRANCH" 2>&1 | sed 's/^/    /'
after="$(git rev-parse --short FETCH_HEAD)"
if [ "$before" = "$after" ] && [ "${FORCE:-0}" != 1 ]; then ok "Đã là bản mới nhất ($after)."; exit 0; fi

# the local changes: committed by the AI (or the panel), or still uncommitted
patch=""
if [ -n "$(git status --porcelain)" ]; then git add -A && git -c user.name="Bảng điều khiển" -c user.email=panel@localhost commit -q -m "Thay đổi chưa lưu, trước khi cập nhật"; fi
if [ "$(git rev-list --count "$base..HEAD" 2>/dev/null || echo 0)" -gt 0 ]; then
  install -d -m 0700 "$BACKUP_DIR"
  patch="$BACKUP_DIR/thay-doi-$(date +%Y%m%d-%H%M%S).patch"
  git diff --binary "$base" HEAD > "$patch"
  info "$(git rev-list --count "$base..HEAD") thay đổi trên máy này (AI, quản trị) được giữ lại: $patch"
fi
git reset --hard FETCH_HEAD >/dev/null
git config dvtt.base "$(git rev-parse HEAD)"
git log -1 --format='    %h %s (%cd)' --date=format:'%d/%m/%Y %H:%M'
if [ -n "$patch" ] && [ -s "$patch" ]; then
  if git apply --3way --whitespace=nowarn "$patch" 2>/dev/null || git apply --whitespace=nowarn "$patch" 2>/dev/null; then
    git add -A && git -c user.name="AI (giữ lại)" -c user.email=panel@localhost commit -q -m "Giữ các thay đổi trên máy này qua bản cập nhật $after" && ok "đã áp lại các thay đổi trên máy này"
  else
    git reset --hard -q FETCH_HEAD
    warn "Không áp lại được các thay đổi trên máy này (bản mới sửa cùng chỗ). Chúng nằm trong $patch: nhờ trợ lý AI áp lại bằng tay."
  fi
fi

bash "$(dirname "$0")/app.sh"
ok "Đã cập nhật $before → $after."
if systemctl list-unit-files dvtt-panel.service >/dev/null 2>&1; then
  info "bảng điều khiển sẽ chạy lại sau 3 giây (tải lại trang nếu mất kết nối)"
  systemd-run --on-active=3 --unit="dvtt-panel-restart-$(date +%s)" /bin/systemctl restart dvtt-panel >/dev/null 2>&1 || true
fi
