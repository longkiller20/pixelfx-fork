#!/usr/bin/env bash
# Tường lửa (ufw): chặn mọi cổng vào trừ SSH, bảng điều khiển (PANEL_OPEN=1), 80/443 khi có reverse proxy, cổng game
# khi không có tên miền, cổng admin khi ADMIN_ACCESS=port (chỉ cho ADMIN_IP nếu có). Luôn giữ cổng SSH đang dùng để
# không tự khoá mình ở ngoài.
. "$(dirname "$0")/lib.sh"
have ufw || apt_install ufw
if [ "${FIREWALL:-1}" = 0 ]; then
  step "Tắt tường lửa"
  ufw --force disable >/dev/null 2>&1 || true
  warn "Tường lửa đã tắt: mọi cổng đang mở ra internet."
  exit 0
fi

step "Cổng SSH"
ssh_ports="$( { { sshd -T 2>/dev/null || true; } | awk '$1=="port"{print $2}'; { ss -ltnpH 2>/dev/null || true; } | awk '/sshd/ {n=split($4,a,":"); print a[n]}'; } | sort -un | tr '\n' ' ')"
[ -n "${ssh_ports// /}" ] || ssh_ports=22
info "SSH: $ssh_ports"

step "Quy tắc"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
allow() { ufw allow "$@" >/dev/null && info "mở: $*"; }
for p in $ssh_ports; do allow "$p/tcp" comment SSH; done
if [ "$PANEL_PORT" != 0 ]; then
  if [ "$PANEL_OPEN" = 1 ] || [ -z "$PANEL_DOMAIN" ] || [ "$PROXY" = none ]; then allow "$PANEL_PORT/tcp" comment "bang dieu khien"
  else info "cổng bảng điều khiển $PANEL_PORT đóng (chỉ vào qua https://$PANEL_DOMAIN)"; fi
fi
if [ "$PROXY" != none ] && [ -n "$DOMAIN" ]; then
  allow 80/tcp comment "http"
  allow 443/tcp comment "https"
  allow 443/udp comment "http3"
else
  allow "$GAME_PORT/tcp" comment game
fi
if [ "$ADMIN_ACCESS" = port ]; then
  if [ -n "$ADMIN_IP" ]; then ufw allow from "$ADMIN_IP" to any port "$ADMIN_PORT" proto tcp comment "admin" >/dev/null && info "mở: $ADMIN_PORT/tcp chỉ cho $ADMIN_IP"
  else allow "$ADMIN_PORT/tcp" comment admin; fi
fi

step "Bật tường lửa"
if ufw --force enable >/dev/null 2>&1; then
  ufw status verbose | sed 's/^/    /'
  ok "Xong: tường lửa đã bật."
else
  warn "Máy này không bật được ufw (VPS dạng container/OpenVZ thường không cho). Hãy dùng tường lửa của nhà cung cấp VPS: mở các cổng ở trên."
fi
