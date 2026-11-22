#!/usr/bin/env bash
# Cài bảng điều khiển của game lên một VPS Ubuntu/Debian trắng (chưa có gì). Chạy bằng root:
#
#   curl -fsSL https://raw.githubusercontent.com/longkiller20/pixelfx-fork/main/deploy/install.sh | sudo bash
#   (hoặc: git clone … && sudo bash pixelfx-fork/deploy/install.sh)
#
# Script hỏi cổng cho bảng điều khiển (cổng bất kỳ bạn chọn), tên đăng nhập và mật khẩu; cài curl, git, Node.js; tải
# mã nguồn về /opt/pixelfx-fork; chạy bảng điều khiển bằng systemd (dvtt-panel) rồi in địa chỉ để mở trên trình duyệt.
# Mọi bước còn lại (MariaDB, game, mật khẩu admin, tên miền với Caddy/Nginx, HTTPS, tường lửa, sao lưu) làm ở đó.
#
# Không muốn hỏi (chạy tự động), truyền tham số:
#   --port 8443           cổng bảng điều khiển            --user admin      tên đăng nhập bảng điều khiển
#   --pass '...'          mật khẩu (≥ 10 ký tự; bỏ trống: tạo ngẫu nhiên)
#   --dir /opt/pixelfx-fork  --repo <git url>  --branch main
#   -y                    không hỏi gì, dùng mặc định cho phần không truyền
# Cài luôn cả game, không cần mở bảng điều khiển:
#   --all --admin-pass '...' [--game-port 5886] [--admin-port 5885]
#         [--proxy caddy|nginx --domain game.vd.com [--admin-domain admin.vd.com] [--panel-domain panel.vd.com] [--email a@b.c]]
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8

PORT="" USER_NAME="" PASS="" DIR="" REPO="https://github.com/longkiller20/pixelfx-fork.git" BRANCH="main" YES=0 ALL=0
ADMIN_PASS="" GAME_PORT="" ADMIN_PORT="" PROXY="" DOMAIN="" ADMIN_DOMAIN="" PANEL_DOMAIN="" EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --pass) PASS="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    -y|--yes) YES=1; shift ;;
    --all) ALL=1; shift ;;
    --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
    --game-port) GAME_PORT="$2"; shift 2 ;;
    --admin-port) ADMIN_PORT="$2"; shift 2 ;;
    --proxy) PROXY="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --admin-domain) ADMIN_DOMAIN="$2"; shift 2 ;;
    --panel-domain) PANEL_DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Không hiểu tham số: $1 (xem --help)" >&2; exit 1 ;;
  esac
done

C_B=$'\e[1m' C_G=$'\e[32m' C_Y=$'\e[33m' C_R=$'\e[31m' C_C=$'\e[36m' C_0=$'\e[0m'
[ -t 1 ] || { C_B="" C_G="" C_Y="" C_R="" C_C="" C_0=""; }
step() { printf '\n%s==> %s%s\n' "$C_C$C_B" "$*" "$C_0"; }
ok() { printf '%s✔%s  %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '%s!!%s  %s\n' "$C_Y" "$C_0" "$*"; }
die() { printf '\n%s✖  %s%s\n' "$C_R" "$*" "$C_0" >&2; exit 1; }
trap 'printf "\n%s✖  Lỗi ở dòng %s: %s%s\n" "$C_R" "$LINENO" "$BASH_COMMAND" "$C_0" >&2' ERR

[ "$(id -u)" = 0 ] || die "Hãy chạy bằng root: sudo bash install.sh"
[ -d /run/systemd/system ] || die "Máy này không chạy systemd (cần Ubuntu 20.04+ hoặc Debian 11+ bình thường)."
. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in ubuntu:*|debian:*|*:*debian*) ;; *) die "Script này dành cho Ubuntu/Debian (máy này: ${PRETTY_NAME:-không rõ})." ;; esac

# questions go to the terminal even when the script itself comes through a pipe (curl … | bash)
TTY=""
if [ $YES = 0 ] && { exec 3</dev/tty; } 2>/dev/null; then TTY=1; fi
ask() { # ask "câu hỏi" "mặc định" → REPLY
  local q="$1" d="${2:-}"
  if [ -z "$TTY" ]; then REPLY="$d"; return; fi
  printf '%s%s%s%s: ' "$C_B" "$q" "$C_0" "${d:+ [$d]}"
  IFS= read -r REPLY <&3 || REPLY=""
  [ -n "$REPLY" ] || REPLY="$d"
}
ask_secret() {
  local q="$1"
  if [ -z "$TTY" ]; then REPLY=""; return; fi
  printf '%s%s%s: ' "$C_B" "$q" "$C_0"
  IFS= read -rs REPLY <&3 || REPLY=""
  printf '\n'
}
# the panel's own port (a second run) counts as free: it is the panel that holds it
CUR_PORT="$( { sed -nE 's/.*"port": *([0-9]+).*/\1/p' /etc/dvtt-panel/panel.json 2>/dev/null || true; } | head -1)"
port_free() { [ "$1" = "$CUR_PORT" ] || ! ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ] && ! [[ " 3306 5885 5886 " == *" $1 "* ]]; }
random_port() { local p; for _ in $(seq 1 50); do p=$((20000 + RANDOM % 40000)); port_free "$p" && { echo "$p"; return; }; done; echo 28443; }

cat <<EOF

${C_B}  Đa Vũ Trụ Tu Tiên — cài đặt lên VPS${C_0}
  Bước này cài bảng điều khiển web. Sau đó mở nó trên trình duyệt để cài game, đặt mật khẩu admin,
  trỏ tên miền (Caddy hoặc Nginx), bật HTTPS, tường lửa và sao lưu.

EOF

step "Cổng của bảng điều khiển"
if [ -z "$PORT" ]; then
  suggest="${CUR_PORT:-$(random_port)}"
  while :; do
    ask "Bảng điều khiển chạy ở cổng nào (1024-65535)" "$suggest"
    if ! valid_port "$REPLY"; then warn "Cổng phải là số từ 1024 đến 65535, khác 3306/5885/5886."; [ -z "$TTY" ] && die "Cổng không hợp lệ."; continue; fi
    if ! port_free "$REPLY"; then warn "Cổng $REPLY đang có chương trình khác dùng."; [ -z "$TTY" ] && die "Cổng đang bận."; continue; fi
    PORT="$REPLY"; break
  done
fi
valid_port "$PORT" || die "Cổng \"$PORT\" không hợp lệ (1024-65535, khác 3306/5885/5886)."
port_free "$PORT" || die "Cổng $PORT đang có chương trình khác dùng."
ok "cổng $PORT"

step "Tài khoản đăng nhập bảng điều khiển"
if [ -z "$USER_NAME" ]; then ask "Tên đăng nhập" "admin"; USER_NAME="$REPLY"; fi
[[ "$USER_NAME" =~ ^[A-Za-z0-9_.-]{3,32}$ ]] || die "Tên đăng nhập: 3-32 ký tự chữ, số, dấu . _ -"
GENERATED=0
if [ -z "$PASS" ]; then
  while [ -n "$TTY" ]; do
    ask_secret "Mật khẩu (ít nhất 10 ký tự, Enter để tạo ngẫu nhiên)"
    [ -z "$REPLY" ] && break
    if [ ${#REPLY} -lt 10 ]; then warn "Ít nhất 10 ký tự."; continue; fi
    p1="$REPLY"; ask_secret "Nhập lại mật khẩu"
    [ "$REPLY" = "$p1" ] && { PASS="$p1"; break; }
    warn "Hai lần nhập không giống nhau."
  done
fi
if [ -z "$PASS" ]; then PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"; GENERATED=1; fi
[ ${#PASS} -ge 10 ] || die "Mật khẩu bảng điều khiển: ít nhất 10 ký tự."
ok "tài khoản $USER_NAME"

step "Gói cơ bản (curl, git, Node.js)"
apt-get -o DPkg::Lock::Timeout=600 update -q >/dev/null
apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends ca-certificates curl gnupg git openssl iproute2 >/dev/null
node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 18 ]; then
  echo "    cài Node.js 22 (NodeSource)…"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get -o DPkg::Lock::Timeout=600 update -q >/dev/null
  apt-get -o DPkg::Lock::Timeout=600 install -y -q nodejs >/dev/null
fi
[ "$(node_major)" -ge 18 ] || die "Không cài được Node.js 18 trở lên."
ok "Node $(node -v), git $(git --version | awk '{print $3}')"

step "Mã nguồn"
# run from a checkout (bash deploy/install.sh): use it where it is, unless --dir says otherwise
SELF_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  d="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  [ -f "$d/deploy/panel/server.mjs" ] && [ -f "$d/game/package.json" ] && SELF_DIR="$d"
fi
if [ -z "$DIR" ]; then DIR="${SELF_DIR:-/opt/pixelfx-fork}"; fi
git config --global --add safe.directory "$DIR" 2>/dev/null || true
if [ -f "$DIR/deploy/panel/server.mjs" ] && [ -f "$DIR/game/package.json" ]; then
  ok "dùng mã có sẵn ở $DIR"
else
  [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ] && die "$DIR đã có tệp khác. Chọn thư mục khác bằng --dir."
  echo "    tải $REPO (nhánh $BRANCH) về $DIR…"
  # only what the server needs (game/ and deploy/), at the newest commit: a few tens of MB instead of the whole history
  if ! git clone -q --depth 1 --branch "$BRANCH" --filter=blob:none --sparse "$REPO" "$DIR" 2>/dev/null; then
    rm -rf "$DIR"
    git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$DIR" || die "Không tải được mã nguồn từ $REPO (kho riêng tư? Hãy git clone bằng tay rồi chạy: sudo bash <thư mục>/deploy/install.sh)."
  else
    # everything but the big pictures of the readme (the game, the panel, and the pixelfx library the AI draws with)
    git -C "$DIR" sparse-checkout set --no-cone '/*' '!/docs/readme/'
    # the commit the game came as: what the AI or the owner changed since is kept across updates (tasks/update.sh)
  fi
  git -C "$DIR" config dvtt.base "$(git -C "$DIR" rev-parse HEAD)"
  ok "đã tải về $DIR ($(git -C "$DIR" log -1 --format=%h))"
fi
chmod 755 "$DIR"

step "Bảng điều khiển"
PANEL="$DIR/deploy/panel/server.mjs"
PANEL_PASS="$PASS" node "$PANEL" init --port "$PORT" --user "$USER_NAME" --dir "$DIR" --repo "$REPO" --branch "$BRANCH"
cat > /usr/local/bin/dvtt-panel <<EOF
#!/bin/sh
# lệnh quản lý bảng điều khiển (dvtt-panel --help không có: xem deploy/panel/server.mjs, đầu tệp)
exec "$(command -v node)" "$PANEL" "\$@"
EOF
chmod 755 /usr/local/bin/dvtt-panel
cat > /etc/systemd/system/dvtt-panel.service <<EOF
# Bảng điều khiển cài đặt game (deploy/install.sh). Chạy bằng root vì nó cài gói, sửa proxy, tường lửa, systemd.
[Unit]
Description=Bang dieu khien game Da Vu Tru Tu Tien
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(command -v node) $PANEL
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable dvtt-panel >/dev/null 2>&1
systemctl restart dvtt-panel
for _ in $(seq 1 20); do curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" && break; sleep 0.5; done
curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" || { journalctl -u dvtt-panel -n 30 --no-pager; die "Bảng điều khiển không chạy được."; }
ok "dvtt-panel đang chạy ở cổng $PORT"

# a firewall already on: let the panel's port in (the rest is set from the panel)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow "$PORT/tcp" >/dev/null && ok "tường lửa (ufw): đã mở cổng $PORT"
fi

IP="$(curl -4 -s --max-time 5 https://api.ipify.org || true)"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

if [ $ALL = 1 ]; then
  step "Cài luôn cả game"
  [ -n "$ADMIN_PASS" ] || die "--all cần --admin-pass (mật khẩu trang admin của game, 8-72 ký tự)."
  set_args=()
  [ -n "$GAME_PORT" ] && set_args+=("gamePort=$GAME_PORT")
  [ -n "$ADMIN_PORT" ] && set_args+=("adminPort=$ADMIN_PORT")
  [ -n "$PROXY" ] && set_args+=("proxy=$PROXY")
  [ -n "$DOMAIN" ] && set_args+=("domain=$DOMAIN")
  [ -n "$ADMIN_DOMAIN" ] && set_args+=("adminDomain=$ADMIN_DOMAIN" "adminAccess=domain")
  [ -n "$PANEL_DOMAIN" ] && set_args+=("panelDomain=$PANEL_DOMAIN")
  [ -n "$EMAIL" ] && set_args+=("email=$EMAIL")
  [ ${#set_args[@]} -gt 0 ] && dvtt-panel set "${set_args[@]}"
  ADMIN_PASS="$ADMIN_PASS" dvtt-panel run setup || die "Cài game chưa xong: mở bảng điều khiển để xem và chạy lại từng bước."
fi

cat <<EOF

${C_G}${C_B}  Xong! Mở bảng điều khiển trên trình duyệt:${C_0}

      ${C_B}http://${IP:-IP-CUA-VPS}:${PORT}${C_0}

      Tên đăng nhập:  ${C_B}${USER_NAME}${C_0}
EOF
if [ $GENERATED = 1 ]; then
  printf '      Mật khẩu:       %s%s%s   %s(tạo ngẫu nhiên, hãy lưu lại)%s\n' "$C_B" "$PASS" "$C_0" "$C_Y" "$C_0"
else
  printf '      Mật khẩu:       (mật khẩu bạn vừa nhập)\n'
fi
cat <<EOF

  ${C_Y}Nếu không mở được:${C_0} nhà cung cấp VPS có tường lửa riêng (Security group / Firewall ở trang quản lý VPS)
  thì mở cổng ${PORT}/tcp ở đó, và cả 80, 443 nếu sẽ dùng tên miền.

  Lệnh hữu ích:
    dvtt-panel passwd          đặt lại mật khẩu bảng điều khiển (quên mật khẩu)
    dvtt-panel port <cổng>     đổi cổng bảng điều khiển
    dvtt-panel status          xem cấu hình và các dịch vụ
    journalctl -u dvtt -f      xem log game trực tiếp

EOF
