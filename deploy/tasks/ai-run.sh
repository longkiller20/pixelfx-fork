#!/usr/bin/env bash
# Trợ lý AI làm một việc chủ server giao (PROMPT): Claude Code chạy bằng người dùng dvtt trong thư mục mã nguồn, với
# các công cụ MCP của game (dữ liệu game, pixelfx, đăng ký nhân vật/boss) và các công cụ sửa tệp. Xong việc: mọi thay
# đổi được commit (tác giả "AI (agent)") để hoàn tác được; nếu nó sửa code của game thì kiểm tra cú pháp và chạy lại game
# (AUTO_RESTART=1); game không chạy lại được thì tự hoàn tác.
. "$(dirname "$0")/lib.sh"
: "${PROMPT:?}" "${DVTT_MCP_URL:?}" "${DVTT_MCP_TOKEN:?}" "${AUTO_RESTART:=1}" "${ALLOW_CODE:=1}"
have claude || die "Chưa cài trợ lý AI (bấm \"Cài trợ lý AI\" ở bảng điều khiển)."
[ -n "${ANTHROPIC_API_KEY:-}${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || die "Chưa nhập khoá API cho trợ lý AI (Trợ lý AI → Khoá)."
AIHOME=/var/lib/dvtt-ai
install -d -o "$GAME_USER" -g "$GAME_USER" -m 0700 "$AIHOME"
cd "$DVTT_DIR" || die "Không vào được $DVTT_DIR."
G() { git -c safe.directory='*' -C "$DVTT_DIR" "$@"; }
# the repository back to the game's user, readable (git and the agent may have left files root's or private)
own() { find "$DVTT_DIR" -path "$DVTT_DIR/.git" -prune -o -exec chown "$GAME_USER:$GAME_USER" {} + 2>/dev/null; find "$DVTT_DIR/game" "$DVTT_DIR/src" -path '*/node_modules' -prune -o ! -name .env -exec chmod u+rwX,go+rX {} + 2>/dev/null; true; }

step "Việc được giao"
printf '%s\n' "$PROMPT" | sed 's/^/    /'
# anything changed by hand since the last commit is kept apart from the AI's work
if [ -n "$(G status --porcelain)" ]; then
  G add -A && G -c user.name="Bảng điều khiển" -c user.email=panel@localhost commit -q -m "Thay đổi chưa lưu, trước khi AI làm việc" && info "đã lưu riêng các thay đổi có sẵn"
fi
BEFORE="$(G rev-parse HEAD)"

# the game's MCP for this run (a token made for it), the house rules, the tools it may use
# (only this file is private: everything else the run touches, the game must read)
(umask 077; printf '{ "mcpServers": { "dvtt": { "type": "http", "url": "%s", "headers": { "Authorization": "Bearer %s" } } } }\n' "$DVTT_MCP_URL" "$DVTT_MCP_TOKEN" > "$AIHOME/mcp.json")
chown "$GAME_USER:$GAME_USER" "$AIHOME/mcp.json"
if [ "$ALLOW_CODE" = 1 ]; then
  TOOLS="Read,Edit,Write,MultiEdit,Glob,Grep,TodoWrite,Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(grep:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),mcp__dvtt"
else
  TOOLS="Read,Glob,Grep,TodoWrite,mcp__dvtt"
fi
MODEL_ARGS=()
[ -n "${DVTT_AI_MODEL:-}" ] && MODEL_ARGS=(--model "$DVTT_AI_MODEL")

step "Trợ lý đang làm việc"
export HOME="$AIHOME" DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
# the game's MCP is on this machine: never through a proxy the VPS may use for the internet
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
set +e
trap - ERR
runuser -p -u "$GAME_USER" -- claude -p "$PROMPT" \
  --output-format stream-json --verbose \
  --mcp-config "$AIHOME/mcp.json" --strict-mcp-config \
  --append-system-prompt "$(cat "$DVTT_DIR/deploy/agent/AGENT.md")" \
  --permission-mode acceptEdits --allowedTools "$TOOLS" --max-turns 120 "${MODEL_ARGS[@]}" \
  < /dev/null 2>&1 | node "$DVTT_DIR/deploy/agent/format.mjs"
code=${PIPESTATUS[0]}
set -e
trap 'printf "\n✖  Lỗi ở dòng %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
rm -f "$AIHOME/mcp.json"
[ "$code" = 0 ] || warn "trợ lý dừng với mã $code (xem dòng 💬 ở trên: khoá sai, hết hạn mức, mạng…)"

step "Thay đổi"
find "$DVTT_DIR" -path "$DVTT_DIR/.git" -prune -o -user root -newer "$DVTT_DIR/.git/HEAD" -exec chown "$GAME_USER:$GAME_USER" {} + 2>/dev/null || true
if [ -n "$(G status --porcelain)" ]; then
  G add -A
  G -c user.name="AI (agent)" -c user.email=ai-agent@localhost commit -q -m "$(printf '%s' "$PROMPT" | tr '\n' ' ' | cut -c1-100)"
fi
AFTER="$(G rev-parse HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  [ "$code" = 0 ] || die "Trợ lý không làm được việc này (mã $code)."
  ok "Không có tệp nào thay đổi."
else
  G log --format='    %h %an: %s' "$BEFORE..$AFTER"
  G diff --stat "$BEFORE" "$AFTER" | tail -15 | sed 's/^/    /'
fi
# code of the game changed by the agent itself (not data, not the figures MCP already put in)
changed="$(G diff --name-only "$BEFORE" "$AFTER" -- game ':!game/public/hieu-ung' ':!game/shared/them.js' | grep -E '\.(m?js)$' || true)"
if [ -n "$changed" ]; then
  step "Kiểm tra code của game"
  bad=0
  for f in $changed; do [ -f "$f" ] || continue; node --check "$f" 2>&1 | sed 's/^/    /' || bad=1; done
  last="$(G log -1 --format=%an)"
  if [ $bad = 1 ]; then
    [[ "$last" == AI* ]] && G -c user.name="Bảng điều khiển" -c user.email=panel@localhost revert --no-edit HEAD >/dev/null && warn "Code có lỗi cú pháp: đã hoàn tác thay đổi của AI."
    die "Thay đổi của AI có lỗi, game giữ nguyên."
  fi
  ok "cú pháp đúng"
  if [ "$AUTO_RESTART" = 1 ]; then
    step "Chạy lại game"
    own
    systemctl restart dvtt
    if wait_port "$GAME_PORT" 60; then ok "game chạy với thay đổi mới"; else
      journalctl -u dvtt -n 30 --no-pager | sed 's/^/    /' || true
      [[ "$last" == AI* ]] && G -c user.name="Bảng điều khiển" -c user.email=panel@localhost revert --no-edit HEAD >/dev/null
      own
      systemctl restart dvtt; wait_port "$GAME_PORT" 60 || true
      die "Game không chạy được với thay đổi của AI: đã hoàn tác và chạy lại bản cũ."
    fi
  else
    warn "Chưa chạy lại game (đã tắt tự chạy lại): bấm \"Chạy lại\" khi muốn áp dụng."
  fi
fi
own
ok "Xong việc."
