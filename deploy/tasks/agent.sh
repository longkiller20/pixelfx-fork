#!/usr/bin/env bash
# Cài trợ lý AI trên VPS: Claude Code (npm @anthropic-ai/claude-code). Nó chạy bằng người dùng của game (dvtt), không
# phải root, trong thư mục mã nguồn, với các công cụ MCP của game (deploy/mcp) và skill pixelfx của repo. Cần máy đủ
# mạnh: từ 2 GB RAM (dưới 1 GB không cài). Khoá API (hoặc token của gói Claude) nhập ở bảng điều khiển.
. "$(dirname "$0")/lib.sh"

step "Máy này"
mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo); swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo); cpus=$(nproc)
info "RAM ${mem} MB, swap ${swap} MB, ${cpus} nhân CPU"
[ "$mem" -ge 900 ] || die "Máy chỉ có ${mem} MB RAM: không đủ chạy trợ lý AI cùng game. Dùng MCP từ máy của bạn (Claude Desktop, Claude Code…) thay vì cài trên VPS."
if [ "$mem" -lt 1900 ] || [ "$cpus" -lt 2 ]; then warn "Khuyên dùng từ 2 GB RAM và 2 nhân: máy này vẫn cài được nhưng lúc AI làm việc game có thể chậm."; else ok "đủ mạnh"; fi
[ "$(node_major)" -ge 18 ] || die "Cần Node 18 trở lên (chạy bước \"Cài gói cần thiết\")."

step "Claude Code"
export npm_config_cache=/root/.npm
if have claude; then info "đã có $(claude --version 2>/dev/null | head -1), cập nhật"; fi
npm install -g @anthropic-ai/claude-code --no-audit --no-fund --loglevel=error 2>&1 | tail -3 | sed 's/^/    /'
have claude || die "Không cài được Claude Code."
ok "Claude Code $(claude --version 2>/dev/null | head -1)"

step "Chỗ làm việc của trợ lý"
id "$GAME_USER" >/dev/null 2>&1 || die "Chưa có người dùng $GAME_USER (cài game trước)."
install -d -o "$GAME_USER" -g "$GAME_USER" -m 0700 /var/lib/dvtt-ai
# the AI edits the repository (src/fx, game/…) as the game's user; git's own folder stays root's (the dashboard commits)
find "$DVTT_DIR" -path "$DVTT_DIR/.git" -prune -o -exec chown "$GAME_USER:$GAME_USER" {} + 2>/dev/null || true
install -d -o "$GAME_USER" -g "$GAME_USER" "$DVTT_DIR/records"
ok "/var/lib/dvtt-ai (nhà của trợ lý), mã nguồn thuộc $GAME_USER"

step "Kiểm tra"
HOME=/var/lib/dvtt-ai runuser -p -u "$GAME_USER" -- claude --version >/dev/null 2>&1 && ok "trợ lý chạy được bằng $GAME_USER" || warn "trợ lý chưa chạy được bằng $GAME_USER"
for a in codex gemini opencode; do have "$a" && info "cũng có $a trên máy: dùng nó với MCP của game (xem Trợ lý AI → Kết nối)"; done
ok "Xong. Nhập khoá API Anthropic (hoặc token từ \"claude setup-token\") ở bảng điều khiển → Trợ lý AI, rồi giao việc."
