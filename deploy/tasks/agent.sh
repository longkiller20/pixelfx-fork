#!/usr/bin/env bash
# Cài trợ lý AI trên VPS. AGENT_KIND chọn loại:
#   claude  Claude Code (npm @anthropic-ai/claude-code): khoá Anthropic hoặc token gói Claude.
#   hermes  Hermes Agent (Nous Research, mã nguồn mở): dùng được nhiều nơi cung cấp model (OpenRouter, OpenAI, Anthropic,
#           Gemini, DeepSeek, xAI, GLM, Kimi, Nous, hoặc máy chủ tương thích OpenAI riêng: Ollama, vLLM, LM Studio…).
# Trợ lý chạy bằng người dùng của game (dvtt), không phải root, trong thư mục mã nguồn, với các công cụ MCP của game
# (deploy/mcp) và skill pixelfx của repo. Cần máy đủ mạnh: từ 2 GB RAM (dưới 1 GB không cài). Khoá nhập ở bảng điều khiển.
. "$(dirname "$0")/lib.sh"
: "${AGENT_KIND:=claude}"
AIHOME=/var/lib/dvtt-ai

step "Máy này"
mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo); swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo); cpus=$(nproc)
disk=$(df -Pm /var/lib | awk 'NR==2 {print $4}')
info "RAM ${mem} MB, swap ${swap} MB, ${cpus} nhân CPU, còn ${disk} MB đĩa"
[ "$mem" -ge 900 ] || die "Máy chỉ có ${mem} MB RAM: không đủ chạy trợ lý AI cùng game. Dùng MCP từ máy của bạn (Claude, Hermes, Ekko Studio, Cursor…) thay vì cài trên VPS."
if [ "$mem" -lt 1900 ] || [ "$cpus" -lt 2 ]; then warn "Khuyên dùng từ 2 GB RAM và 2 nhân: máy này vẫn cài được nhưng lúc AI làm việc game có thể chậm."; else ok "đủ mạnh"; fi
id "$GAME_USER" >/dev/null 2>&1 || die "Chưa có người dùng $GAME_USER (cài game trước)."

step "Chỗ làm việc của trợ lý"
install -d -o "$GAME_USER" -g "$GAME_USER" -m 0700 "$AIHOME"
# the AI edits the repository (src/fx, game/…) as the game's user; git's own folder stays root's (the dashboard commits)
find "$DVTT_DIR" -path "$DVTT_DIR/.git" -prune -o -exec chown "$GAME_USER:$GAME_USER" {} + 2>/dev/null || true
install -d -o "$GAME_USER" -g "$GAME_USER" "$DVTT_DIR/records"
ok "$AIHOME (nhà của trợ lý), mã nguồn thuộc $GAME_USER"

# runs as the game's user in the assistant's home, with this task's network settings (a proxy, if the VPS has one)
as_ai() { runuser -u "$GAME_USER" -- env HOME="$AIHOME" PATH="$AIHOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  ${https_proxy:+https_proxy=$https_proxy HTTPS_PROXY=$https_proxy} ${http_proxy:+http_proxy=$http_proxy HTTP_PROXY=$http_proxy} \
  ${NODE_EXTRA_CA_CERTS:+NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS} SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
  NO_PROXY=127.0.0.1,localhost "$@"; }

case "$AGENT_KIND" in
claude)
  [ "$(node_major)" -ge 18 ] || die "Cần Node 18 trở lên (chạy bước \"Cài gói cần thiết\")."
  step "Claude Code"
  export npm_config_cache=/root/.npm
  if have claude; then info "đã có $(claude --version 2>/dev/null | head -1), cập nhật"; fi
  npm install -g @anthropic-ai/claude-code --no-audit --no-fund --loglevel=error 2>&1 | tail -3 | sed 's/^/    /'
  have claude || die "Không cài được Claude Code."
  ok "Claude Code $(claude --version 2>/dev/null | head -1)"
  step "Kiểm tra"
  HOME="$AIHOME" runuser -p -u "$GAME_USER" -- claude --version >/dev/null 2>&1 && ok "trợ lý chạy được bằng $GAME_USER" || warn "trợ lý chưa chạy được bằng $GAME_USER"
  ok "Xong. Nhập khoá API Anthropic (hoặc token từ \"claude setup-token\") ở bảng điều khiển → Trợ lý AI, rồi giao việc."
  ;;
hermes)
  [ "${disk:-0}" -ge 2500 ] || warn "Hermes cần khoảng 2 GB đĩa (Python, thư viện): máy còn ${disk} MB."
  step "Gói cần cho Hermes"
  apt_install git curl ca-certificates xz-utils libatomic1 >/dev/null
  ok "git, curl, libatomic1"
  step "Hermes Agent"
  HB="$AIHOME/.local/bin/hermes"
  if [ -x "$HB" ]; then
    info "đã có $(as_ai "$HB" --version 2>/dev/null | head -1), cập nhật"
    as_ai "$HB" update --yes 2>&1 | tail -5 | sed 's/^/    /' || warn "không cập nhật được, dùng bản đang có"
  else
    # the official installer (git checkout + uv + its own Python under ~/.hermes), as the game's user, no questions
    as_ai bash -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --non-interactive --skip-browser --skip-computer-use' 2>&1 \
      | grep -v -e '^\s*$' -e 'MiB /' | tail -25 | sed 's/^/    /' || true
  fi
  [ -x "$HB" ] || die "Không cài được Hermes Agent (xem các dòng trên)."
  ok "$(as_ai "$HB" --version 2>/dev/null | head -1)"
  # everyone on the machine (the dashboard runs as root) finds it by name
  ln -sf "$HB" /usr/local/bin/hermes
  step "Kiểm tra"
  as_ai "$HB" --version >/dev/null 2>&1 && ok "trợ lý chạy được bằng $GAME_USER" || warn "trợ lý chưa chạy được bằng $GAME_USER"
  ok "Xong. Chọn nơi cung cấp model, nhập khoá và tên model ở bảng điều khiển → Trợ lý AI, rồi giao việc."
  ;;
*) die "Không biết trợ lý \"$AGENT_KIND\" (claude hoặc hermes)." ;;
esac
for a in codex gemini opencode; do have "$a" && info "cũng có $a trên máy: dùng nó với MCP của game (xem Trợ lý AI → Kết nối)"; done
true
