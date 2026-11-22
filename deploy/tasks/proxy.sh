#!/usr/bin/env bash
# Tên miền: một reverse proxy (Caddy hoặc Nginx) nhận cổng 80/443 rồi chuyển vào game, trang admin và bảng điều khiển
# chạy ở 127.0.0.1. HTTPS=1 thì lấy chứng chỉ Let's Encrypt (Caddy tự lấy và tự gia hạn; Nginx dùng certbot, gia hạn
# bằng certbot.timer). WebSocket của game được chuyển tiếp. PROXY=none thì gỡ cấu hình proxy của game.
#   DOMAIN        → game (GAME_PORT)
#   ADMIN_DOMAIN  → trang admin (ADMIN_PORT)       (để trống: không có)
#   PANEL_DOMAIN  → bảng điều khiển (PANEL_PORT)    (để trống: không có)
. "$(dirname "$0")/lib.sh"

CADDYFILE=/etc/caddy/Caddyfile
NGINX_SITE=/etc/nginx/sites-available/dvtt.conf
NGINX_LINK=/etc/nginx/sites-enabled/dvtt.conf
ACME_ROOT=/var/www/letsencrypt
MARK="# dvtt: tạo bởi bảng điều khiển (deploy/tasks/proxy.sh)"

# domain → port, the ones set
sites=()
[ -n "$DOMAIN" ] && sites+=("$DOMAIN $GAME_PORT game")
[ -n "$ADMIN_DOMAIN" ] && sites+=("$ADMIN_DOMAIN $ADMIN_PORT admin")
[ -n "$PANEL_DOMAIN" ] && [ "$PANEL_PORT" != 0 ] && sites+=("$PANEL_DOMAIN $PANEL_PORT panel")

stop_unit() { systemctl list-unit-files "$1.service" >/dev/null 2>&1 && systemctl disable --now "$1" >/dev/null 2>&1 || true; }

remove_caddy() {
  if [ -f "$CADDYFILE" ] && grep -q "^$MARK" "$CADDYFILE" && grep -q reverse_proxy "$CADDYFILE"; then
    info "gỡ cấu hình Caddy của game"
    printf '%s\n# (trống: proxy đã tắt)\n' "$MARK" > "$CADDYFILE"
    stop_unit caddy
  fi
}
remove_nginx() {
  if [ -e "$NGINX_LINK" ] || [ -e "$NGINX_SITE" ]; then
    info "gỡ cấu hình Nginx của game"
    rm -f "$NGINX_LINK" "$NGINX_SITE"
    if have nginx; then
      # nothing else served by it: stop it, so port 80 is free for whatever comes next
      if [ -z "$(ls -A /etc/nginx/sites-enabled 2>/dev/null)" ]; then stop_unit nginx; else nginx -t >/dev/null 2>&1 && systemctl reload nginx || true; fi
    fi
  fi
}

# a domain's A records against this server's address: only a warning (behind Cloudflare they differ and it still works)
check_dns() {
  local d="$1" ips
  ips="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -z "$ips" ]; then
    warn "$d chưa trỏ về đâu (chưa có bản ghi A). Vào trang quản lý tên miền, thêm bản ghi A: $d → ${PUBLIC_IP:-IP của VPS}."
    return 1
  fi
  if [ -n "$PUBLIC_IP" ] && [[ " $ips " != *" $PUBLIC_IP "* ]]; then
    warn "$d đang trỏ về $ips, không phải IP của VPS này ($PUBLIC_IP). Nếu dùng Cloudflare (đám mây cam) thì bỏ qua cảnh báo này."
    return 0
  fi
  ok "$d → $ips"
}

# after the proxy is up: does each domain reach what it should, through it (on this machine)? https where it has (or,
# with Caddy, should get) a certificate, http otherwise
NO_TLS=()
scheme_of() {
  [ "$HTTPS" = 1 ] || { echo http; return; }
  if [ "$PROXY" = nginx ] && [ ! -f "/etc/letsencrypt/live/$1/fullchain.pem" ]; then echo http; else echo https; fi
}
verify() {
  local d p what code sch valid
  for s in "${sites[@]}"; do
    read -r d p what <<<"$s"
    sch="$(scheme_of "$d")"
    if [ "$sch" = https ]; then
      code="$(curl -sk --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$d:443:127.0.0.1" "https://$d/" || true)"
      valid="(chứng chỉ hợp lệ)"
      curl -s --noproxy '*' -o /dev/null --max-time 15 --resolve "$d:443:127.0.0.1" "https://$d/" || { valid="(chứng chỉ CHƯA hợp lệ)"; NO_TLS+=("$d"); }
    else
      code="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$d:80:127.0.0.1" "http://$d/" || true)"
      valid=""
      if [ "$HTTPS" = 1 ]; then valid="(chưa có HTTPS)"; NO_TLS+=("$d"); fi
    fi
    if [[ "$code" =~ ^(2|3|401|404) ]]; then ok "$sch://$d → $what (HTTP $code) $valid"; else warn "$sch://$d → $what: chưa trả lời (HTTP ${code:-000}) $valid"; fi
  done
}

case "$PROXY" in
none)
  step "Tắt reverse proxy"
  remove_caddy
  remove_nginx
  write_game_env
  game_running && systemctl restart dvtt
  ok "Không dùng tên miền: vào game bằng http://IP-VPS:$GAME_PORT"
  exit 0
  ;;
caddy|nginx) ;;
*) die "PROXY phải là none, caddy hoặc nginx." ;;
esac
[ -n "$DOMAIN" ] || die "Cần tên miền cho game (DOMAIN) để dùng reverse proxy."

step "Kiểm tra tên miền"
PUBLIC_IP="$(public_ip)"
info "IP công khai của VPS: ${PUBLIC_IP:-không rõ}"
for s in "${sites[@]}"; do read -r d _ _ <<<"$s"; check_dns "$d" || true; done

if [ "$PROXY" = caddy ]; then
  step "Cài Caddy"
  if ! have caddy; then
    apt_install debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    if curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null \
      && curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list; then
      apt_updated=0
    else
      warn "không lấy được kho Caddy chính thức, dùng bản của hệ điều hành"
      rm -f /etc/apt/sources.list.d/caddy-stable.list
    fi
    apt_install_nostart caddy
  fi
  ok "$(caddy version | head -1)"
  step "Cấu hình Caddy ($CADDYFILE)"
  [ -f "$CADDYFILE" ] && ! grep -q "^$MARK" "$CADDYFILE" && cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)" && info "đã lưu Caddyfile cũ thành $CADDYFILE.bak.*"
  {
    echo "$MARK"
    echo "# Đổi ở bảng điều khiển; sửa tay sẽ bị ghi đè lần sau."
    echo "{"
    [ -n "$EMAIL" ] && echo "	email $EMAIL"
    [ "$HTTPS" = 1 ] || echo "	auto_https off"
    echo "}"
    for s in "${sites[@]}"; do
      read -r d p what <<<"$s"
      echo
      echo "# $what"
      if [ "$HTTPS" = 1 ]; then echo "$d {"; else echo "http://$d {"; fi
      echo "	encode zstd gzip"
      echo "	reverse_proxy 127.0.0.1:$p"
      echo "}"
    done
  } > "$CADDYFILE.new"
  caddy fmt --overwrite "$CADDYFILE.new" >/dev/null 2>&1 || true
  caddy validate --config "$CADDYFILE.new" --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config "$CADDYFILE.new" --adapter caddyfile || true; rm -f "$CADDYFILE.new"; die "Cấu hình Caddy không hợp lệ."; }
  # the new config is good: only now does Nginx (if it served the game) make way for Caddy on ports 80/443
  remove_nginx
  mv "$CADDYFILE.new" "$CADDYFILE"
  sed 's/^/    /' "$CADDYFILE"
  systemctl enable caddy >/dev/null 2>&1
  if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl restart caddy; fi
  ok "Caddy đang chạy"
  if [ "$HTTPS" = 1 ]; then
    info "Caddy đang lấy chứng chỉ (lần đầu mất vài giây tới một phút)…"
    for i in $(seq 1 12); do
      all=1
      for s in "${sites[@]}"; do read -r d _ _ <<<"$s"; curl -s --noproxy '*' -o /dev/null --max-time 5 --resolve "$d:443:127.0.0.1" "https://$d/" || all=0; done
      [ $all = 1 ] && break
      sleep 5
    done
  fi
else
  step "Cài Nginx"
  apt_install_nostart nginx
  [ "$HTTPS" = 1 ] && apt_install certbot
  ok "$(nginx -v 2>&1)"
  install -d -m 0755 "$ACME_ROOT"
  rm -f /etc/nginx/sites-enabled/default

  # a machine with IPv6 switched off: no [::] lines (nginx refuses them there)
  V6=""
  if [ ! -f /proc/net/if_inet6 ] || [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo 0)" = 1 ]; then V6="#"; info "máy không có IPv6: chỉ nghe IPv4"; fi
  # one server block per domain; with a certificate for it, 80 sends to 443
  write_nginx() {
    {
      echo "$MARK"
      echo "# Đổi ở bảng điều khiển; sửa tay sẽ bị ghi đè lần sau."
      echo 'map $http_upgrade $dvtt_connection_upgrade { default upgrade; "" close; }'
      for s in "${sites[@]}"; do
        read -r d p what <<<"$s"
        local cert="/etc/letsencrypt/live/$d/fullchain.pem" key="/etc/letsencrypt/live/$d/privkey.pem" tls=0
        [ "$HTTPS" = 1 ] && [ -f "$cert" ] && tls=1
        cat <<NGX

# $what: $d → 127.0.0.1:$p
server {
    listen 80;
$V6    listen [::]:80;
    server_name $d;
    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
NGX
        if [ $tls = 1 ]; then
          echo '    location / { return 301 https://$host$request_uri; }'
          echo "}"
          cat <<NGX
server {
    listen 443 ssl;
$V6    listen [::]:443 ssl;
    http2 on;
    server_name $d;
    ssl_certificate $cert;
    ssl_certificate_key $key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:dvtt_ssl:10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
NGX
        fi
        cat <<'NGX'
    client_max_body_size 20m;
    location / {
NGX
        echo "        proxy_pass http://127.0.0.1:$p;"
        cat <<'NGX'
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $dvtt_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGX
      done
    } > "$NGINX_SITE"
    # "http2 on" needs nginx 1.25.1; older ones take it on the listen line
    if ! nginx -t >/dev/null 2>&1 && grep -q 'http2 on;' "$NGINX_SITE"; then
      sed -i 's/^    http2 on;$//; s/listen 443 ssl;/listen 443 ssl http2;/; s/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/' "$NGINX_SITE"
    fi
    ln -sf "$NGINX_SITE" "$NGINX_LINK"
    if ! nginx -t >/dev/null 2>&1; then
      nginx -t 2>&1 | sed 's/^/    /' || true
      rm -f "$NGINX_LINK"
      die "Cấu hình Nginx không hợp lệ (xem dòng ở trên). Proxy cũ vẫn giữ nguyên."
    fi
    # the new config is good: only now does Caddy (if it served the game) make way on ports 80/443
    remove_caddy
    systemctl enable nginx >/dev/null 2>&1
    if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl restart nginx; fi
  }
  step "Cấu hình Nginx ($NGINX_SITE)"
  write_nginx
  ok "Nginx đang chạy"
  if [ "$HTTPS" = 1 ]; then
    step "Chứng chỉ Let's Encrypt (certbot)"
    mail=(--register-unsafely-without-email)
    [ -n "$EMAIL" ] && mail=(-m "$EMAIL")
    for s in "${sites[@]}"; do
      read -r d _ _ <<<"$s"
      if certbot certonly --webroot -w "$ACME_ROOT" -d "$d" --cert-name "$d" -n --agree-tos --keep-until-expiring "${mail[@]}" 2>&1 | sed 's/^/    /'; [ -f "/etc/letsencrypt/live/$d/fullchain.pem" ]; then
        ok "có chứng chỉ cho $d"
      else
        warn "chưa lấy được chứng chỉ cho $d: kiểm tra tên miền đã trỏ về VPS và cổng 80 đã mở, rồi chạy lại bước này."
      fi
    done
    install -d /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/dvtt-nginx-reload.sh
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/dvtt-nginx-reload.sh
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
    write_nginx
    info "gia hạn tự động: certbot.timer (2 lần mỗi ngày), Nginx tự nạp lại chứng chỉ mới"
  fi
fi

step "Game đứng sau proxy"
write_game_env
if game_running; then systemctl restart dvtt; wait_port "$GAME_PORT" 40 || warn "game chưa trả lời sau khi chạy lại"; fi

step "Kiểm tra"
verify
echo
for s in "${sites[@]}"; do read -r d _ what <<<"$s"; info "$what: $(scheme_of "$d")://$d"; done
if [ ${#NO_TLS[@]} -gt 0 ]; then
  warn "Chưa có HTTPS cho: ${NO_TLS[*]}. Thường do tên miền chưa trỏ về VPS này, hoặc cổng 80/443 bị chặn ở tường lửa của nhà cung cấp VPS. Sửa xong thì chạy lại bước \"Tên miền\"."
  if [ "$PROXY" = caddy ]; then
    info "Caddy tự thử lấy lại chứng chỉ (vài phút một lần): khi tên miền đã trỏ đúng, HTTPS tự chạy, không cần làm gì thêm."
    info "Muốn chạy tạm bằng HTTP: tắt \"Bật HTTPS\" ở mục Tên miền rồi áp dụng."
    ok "Xong: reverse proxy caddy (đang chờ chứng chỉ)."
  else
    ok "Xong: reverse proxy nginx (một số tên miền tạm chạy HTTP)."
  fi
else
  ok "Xong: reverse proxy $PROXY."
fi
