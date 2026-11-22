#!/usr/bin/env bash
# Áp dụng cấu hình đã lưu ở bảng điều khiển: .env của game (cổng, ai được vào) và chạy lại game, reverse proxy, tường
# lửa. APPLY=panel: chỉ những gì theo cổng của bảng điều khiển (tường lửa, tên miền của nó).
. "$(dirname "$0")/lib.sh"
here="$(dirname "$(readlink -f "$0")")"
: "${APPLY:=all}"
ufw_on() { have ufw && ufw status 2>/dev/null | grep -q '^Status: active'; }
ours_proxy() { [ -e /etc/nginx/sites-enabled/dvtt.conf ] || { [ -f /etc/caddy/Caddyfile ] && grep -q '^# dvtt:' /etc/caddy/Caddyfile && grep -q reverse_proxy /etc/caddy/Caddyfile; }; }

if [ "$APPLY" = all ] && [ -f /etc/systemd/system/dvtt.service ]; then
  step "Cấu hình game"
  write_game_env
  systemctl restart dvtt
  if wait_port "$GAME_PORT" 60; then ok "game chạy ở cổng $GAME_PORT"; else journalctl -u dvtt -n 30 --no-pager || true; die "Game không chạy lại được."; fi
fi
if [ "$PROXY" != none ] || ours_proxy; then
  if [ "$APPLY" = all ] || [ -n "$PANEL_DOMAIN" ]; then printf '\n'; bash "$here/proxy.sh"; fi
fi
if [ "$APPLY" = all ] && [ "${FIREWALL:-1}" = 0 ] && ufw_on; then printf '\n'; bash "$here/firewall.sh"
elif [ "${FIREWALL:-1}" = 1 ] && { [ "$APPLY" = all ] || ufw_on; }; then printf '\n'; bash "$here/firewall.sh"
elif ufw_on && [ "$PANEL_PORT" != 0 ]; then ufw allow "$PANEL_PORT/tcp" >/dev/null && info "tường lửa: mở cổng $PANEL_PORT"; fi
printf '\n'
ok "Xong: đã áp dụng cấu hình."
