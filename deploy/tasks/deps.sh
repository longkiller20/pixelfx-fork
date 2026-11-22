#!/usr/bin/env bash
# Cài các thứ game cần trên một Ubuntu/Debian trắng: Node.js 22 (NodeSource, nếu chưa có Node 18 trở lên), MariaDB,
# git, curl, ufw…; bật MariaDB; trên máy ít RAM (dưới 2 GB) mà chưa có swap thì tạo 2 GB swap để npm và game không
# bị hết bộ nhớ.
. "$(dirname "$0")/lib.sh"

step "Hệ điều hành"
. /etc/os-release
info "$PRETTY_NAME ($(uname -m))"
case "${ID:-}:${ID_LIKE:-}" in ubuntu:*|debian:*|*:*debian*) ;; *) warn "Script viết cho Ubuntu/Debian; hệ điều hành này chưa được thử." ;; esac

step "Gói hệ thống"
apt_install ca-certificates curl gnupg git openssl ufw tar gzip lsb-release cron
ok "đã có các gói cơ bản"

step "Node.js"
if [ "$(node_major)" -ge 18 ]; then
  ok "đã có Node $(node -v)"
else
  info "cài Node.js 22 từ NodeSource"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt_updated=0
  apt_install nodejs
  [ "$(node_major)" -ge 18 ] || die "Không cài được Node 18 trở lên."
  ok "Node $(node -v), npm $(npm -v)"
fi

step "MariaDB"
apt_install mariadb-server mariadb-client
if has_systemd; then
  systemctl enable --now mariadb >/dev/null 2>&1 || systemctl enable --now mysql >/dev/null 2>&1 || true
fi
for i in $(seq 1 30); do mariadb -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
mariadb -e "SELECT 1" >/dev/null 2>&1 || die "MariaDB không chạy (xem: journalctl -u mariadb)."
ok "$(mariadb --version | sed 's/,.*//')"

step "Bộ nhớ"
mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
info "RAM ${mem} MB, swap ${swap} MB"
if [ "$mem" -lt 2000 ] && [ "$swap" -lt 512 ] && [ ! -e /swapfile ]; then
  if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
    chmod 600 /swapfile
    if mkswap /swapfile >/dev/null && swapon /swapfile 2>/dev/null; then
      grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
      ok "đã tạo 2 GB swap (/swapfile)"
    else
      rm -f /swapfile; warn "máy này không cho bật swap (bỏ qua)"
    fi
  fi
else
  ok "không cần thêm swap"
fi

step "Giờ hệ thống"
if have timedatectl; then timedatectl set-ntp true >/dev/null 2>&1 || true; info "$(date)"; fi
ok "Xong: các thứ cần thiết đã được cài."
