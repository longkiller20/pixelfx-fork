#!/usr/bin/env bash
# Sao lưu database của game: ACTION=create (mặc định) | restore BACKUP_FILE=<tên> | delete BACKUP_FILE=<tên>
# | timer BACKUP_DAILY=1|0 (bật/tắt sao lưu tự động mỗi ngày lúc 03:30). Bản sao lưu ở /var/backups/dvtt (*.sql.gz),
# giữ BACKUP_KEEP bản mới nhất. Kèm theo .env của game (chứa mật khẩu database) trong một tệp riêng chỉ root đọc được.
. "$(dirname "$0")/lib.sh"
: "${ACTION:=create}"
install -d -m 0700 "$BACKUP_DIR"
name_ok() { [[ "${BACKUP_FILE:-}" =~ ^dvtt-[0-9]{8}-[0-9]{6}(-[a-z]+)?\.sql\.gz$ ]] && [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; }

create() {
  local tag="${1:-}" f
  f="dvtt-$(date +%Y%m%d-%H%M%S)${tag:+-$tag}.sql.gz"
  step "Sao lưu database $DB_NAME → $BACKUP_DIR/$f"
  mariadb-dump --single-transaction --quick --routines --triggers --default-character-set=utf8mb4 "$DB_NAME" | gzip -6 > "$BACKUP_DIR/$f.part"
  mv "$BACKUP_DIR/$f.part" "$BACKUP_DIR/$f"
  chmod 600 "$BACKUP_DIR/$f"
  [ -f "$ENV_FILE" ] && install -m 600 "$ENV_FILE" "$BACKUP_DIR/env-latest"
  ok "$(du -h "$BACKUP_DIR/$f" | cut -f1)  $f"
  # keep the newest BACKUP_KEEP
  ls -1t "$BACKUP_DIR"/dvtt-*.sql.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do rm -f "$old"; info "xoá bản cũ: $(basename "$old")"; done
}

case "$ACTION" in
create) create ;;
restore)
  name_ok || die "Không có bản sao lưu \"${BACKUP_FILE:-}\"."
  gzip -t "$BACKUP_DIR/$BACKUP_FILE" || die "Tệp sao lưu bị hỏng."
  step "Sao lưu dữ liệu hiện tại trước khi khôi phục (phòng khi cần quay lại)"
  create before
  step "Dừng game"
  was=0; game_running && { was=1; systemctl stop dvtt; }
  step "Khôi phục $BACKUP_FILE"
  if gunzip -c "$BACKUP_DIR/$BACKUP_FILE" | mariadb --default-character-set=utf8mb4 "$DB_NAME"; then ok "đã khôi phục"; else warn "khôi phục lỗi"; fi
  [ $was = 1 ] && { systemctl start dvtt; wait_port "$GAME_PORT" 60 && ok "game chạy lại" || warn "game chưa trả lời"; }
  ;;
delete)
  name_ok || die "Không có bản sao lưu \"${BACKUP_FILE:-}\"."
  rm -f "$BACKUP_DIR/$BACKUP_FILE"
  ok "đã xoá $BACKUP_FILE"
  ;;
timer)
  if [ "${BACKUP_DAILY:-0}" = 1 ]; then
    self="$(readlink -f "$0")"
    cat > /etc/systemd/system/dvtt-backup.service <<UNIT
[Unit]
Description=Sao luu database game dvtt
After=mariadb.service
[Service]
Type=oneshot
Environment=DVTT_DIR=$DVTT_DIR BACKUP_KEEP=$BACKUP_KEEP ACTION=create
ExecStart=/bin/bash $self
UNIT
    cat > /etc/systemd/system/dvtt-backup.timer <<UNIT
[Unit]
Description=Sao luu database game dvtt moi ngay
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=10m
[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now dvtt-backup.timer >/dev/null
    ok "Sao lưu tự động: bật (mỗi ngày 03:30, giữ $BACKUP_KEEP bản)"
    systemctl list-timers dvtt-backup.timer --no-pager | sed 's/^/    /'
  else
    systemctl disable --now dvtt-backup.timer >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/dvtt-backup.timer /etc/systemd/system/dvtt-backup.service
    systemctl daemon-reload
    ok "Sao lưu tự động: tắt"
  fi
  ;;
*) die "ACTION không hợp lệ." ;;
esac
