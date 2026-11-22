# Shared by every task (sourced). A task is run by the dashboard (deploy/panel/server.mjs) or by `dvtt-panel run <task>`,
# as root, with the deployment's settings in the environment (see deploy/README.md, "Biến môi trường của tác vụ"):
#   DVTT_DIR       where the repository is checked out (/opt/pixelfx-fork)
#   GAME_PORT      the game's port (5886)            ADMIN_PORT   the game admin site's port (5885)
#   PANEL_PORT     this dashboard's port
#   PROXY          none | caddy | nginx              HTTPS        1: certificates (Let's Encrypt), 0: plain http
#   DOMAIN         the game's domain (empty: none)   ADMIN_DOMAIN the admin site's domain   PANEL_DOMAIN the dashboard's
#   EMAIL          for Let's Encrypt (may be empty)
#   ADMIN_ACCESS   domain | port | local: how the admin site is reached (its domain, its port open, only 127.0.0.1)
#   ADMIN_IP       with ADMIN_ACCESS=port: the only address let in (empty: anyone)
#   PANEL_OPEN     1: the dashboard's port open in the firewall; 0: only through PANEL_DOMAIN
#   REPO BRANCH    where updates come from          BACKUP_KEEP how many backups are kept
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8
: "${DVTT_DIR:=/opt/pixelfx-fork}"
GAME_DIR="$DVTT_DIR/game"
ENV_FILE="$GAME_DIR/.env"
: "${GAME_PORT:=5886}" "${ADMIN_PORT:=5885}" "${PANEL_PORT:=0}" "${PROXY:=none}" "${HTTPS:=1}"
: "${DOMAIN:=}" "${ADMIN_DOMAIN:=}" "${PANEL_DOMAIN:=}" "${EMAIL:=}" "${ADMIN_ACCESS:=local}" "${ADMIN_IP:=}" "${PANEL_OPEN:=1}"
: "${REPO:=https://github.com/longkiller20/pixelfx-fork.git}" "${BRANCH:=main}" "${BACKUP_KEEP:=14}"
GAME_USER=dvtt
BACKUP_DIR=/var/backups/dvtt
DB_NAME=dvtt
DB_USER=dvtt

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*"; }
die() { printf '\n✖  %s\n' "$*" >&2; exit 1; }
ok() { printf '✔  %s\n' "$*"; }
trap 'printf "\n✖  Lỗi ở dòng %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

[ "$(id -u)" = 0 ] || die "Cần chạy bằng root (sudo)."
have() { command -v "$1" >/dev/null 2>&1; }
has_systemd() { [ -d /run/systemd/system ]; }

apt_updated=0
apt_install() {
  local need=()
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || need+=("$p"); done
  [ ${#need[@]} -eq 0 ] && return 0
  if [ $apt_updated = 0 ]; then
    info "apt-get update"
    apt-get "${APT_LOCK[@]}" update -q >/dev/null
    apt_updated=1
  fi
  info "cài: ${need[*]}"
  apt-get "${APT_LOCK[@]}" install -y -q --no-install-recommends "${need[@]}" >/dev/null
}
# install a server without letting the package start it (its port may still be held by the one it replaces)
apt_install_nostart() {
  printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d; chmod +x /usr/sbin/policy-rc.d
  local rc=0
  apt_install "$@" || rc=$?
  rm -f /usr/sbin/policy-rc.d
  return $rc
}
# a fresh VPS often runs unattended-upgrades in its first minutes: wait for the apt lock (up to 10 minutes) instead of failing
APT_LOCK=(-o DPkg::Lock::Timeout=600)

# KEY=VALUE in the game's .env: replaced where it is, added at the end otherwise; the rest of the file kept as it is
env_set() {
  local k="$1" v="$2"
  touch "$ENV_FILE"
  if grep -qE "^\s*$k\s*=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$k" -v v="$v" 'BEGIN{FS="="} $0 ~ "^[ \t]*"k"[ \t]*=" {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
  fi
}
env_get() { [ -f "$ENV_FILE" ] && sed -nE "s/^\s*$1\s*=\s*['\"]?([^'\"]*)['\"]?\s*$/\1/p" "$ENV_FILE" | tail -1 || true; }

# the game's own settings that follow from the deployment's: ports, who may reach each one, the proxy in front
write_game_env() {
  [ -f "$ENV_FILE" ] || { cp "$GAME_DIR/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"; }
  local host=0.0.0.0 ahost=127.0.0.1 trust=0
  if [ "$PROXY" != none ] && [ -n "$DOMAIN" ]; then host=127.0.0.1; trust=1; fi
  [ "$ADMIN_ACCESS" = port ] && ahost=0.0.0.0
  env_set PORT "$GAME_PORT"
  env_set HOST "$host"
  env_set ADMIN_PORT "$ADMIN_PORT"
  env_set ADMIN_HOST "$ahost"
  env_set TRUST_PROXY "$trust"
  chmod 600 "$ENV_FILE"
  id "$GAME_USER" >/dev/null 2>&1 && chown "$GAME_USER:$GAME_USER" "$ENV_FILE"
  info "game .env: PORT=$GAME_PORT HOST=$host ADMIN_PORT=$ADMIN_PORT ADMIN_HOST=$ahost TRUST_PROXY=$trust"
}

node_major() { have node && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# wait until something answers on 127.0.0.1:$1 (up to $2 seconds)
wait_port() {
  local p="$1" n="${2:-40}" i
  for ((i = 0; i < n; i++)); do
    if curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$p/"; then return 0; fi
    sleep 1
  done
  return 1
}

# this server's public IPv4 (for checking a domain points here)
public_ip() {
  curl -4 -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -4 -s --max-time 5 https://ifconfig.me 2>/dev/null || true
}

game_running() { has_systemd && systemctl is-active --quiet dvtt; }
