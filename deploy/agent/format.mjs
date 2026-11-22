// An agent's stream-json output, as lines a person can follow in the dashboard's task window: what it says, each tool it
// uses (and a line of what came back), the end and its cost. Two dialects:
//   Claude Code  (claude -p --output-format stream-json --verbose): assistant/user messages with content blocks
//   Hermes Agent (hermes chat --oneshot --format stream-json): text deltas, tool_use, tool_result, result
// A line that is not JSON (an error before the agent starts, Hermes' session line) is shown as it is.
import readline from "node:readline";

const short = (s, n = 160) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const brief = (name, input = {}) => {
  input = input ?? {};
  if (name.startsWith("mcp__dvtt__")) return `${name.slice(11)} ${short(JSON.stringify(input).replace(/"image_base64":"[^"]+"/, '"image_base64":"…"'), 140)}`;
  if (input.file_path || input.path) return `${name} ${String(input.file_path || input.path).replace(process.cwd() + "/", "")}`;
  if (input.command) return `${name}: ${short(input.command, 140)}`;
  if (input.pattern) return `${name} ${input.pattern}`;
  return `${name} ${short(JSON.stringify(input), 120)}`;
};
const rl = readline.createInterface({ input: process.stdin });
let turns = 0, said = "", spoke = false, tools = 0, mcpTools = 0;
// Hermes streams what it says in pieces: shown as one line when it stops talking
const flush = () => {
  if (said.trim()) console.log(`💬 ${said.trim().replace(/\n/g, "\n   ")}`);
  said = "";
};
rl.on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    if (line.trim() && !/^(session_id|Session): /.test(line)) console.log(`    ${line}`);
    return;
  }
  if (m.type === "text") return void ((said += m.text ?? ""), (spoke = true));
  if (m.type === "tool_use" && !m.message) {
    flush();
    spoke = false;
    tools++;
    if (String(m.name).startsWith("mcp__dvtt__")) mcpTools++;
    return void console.log(`🔧 ${brief(String(m.name ?? "?"), m.input)}`);
  }
  if (m.type === "tool_result" && !m.message) return void console.log(`   ${m.is_error ? "✖" : "↳"} ${short(m.output, 200)}`);
  if (m.type === "result" && "exit_code" in m) {
    flush();
    const tok = m.tokens?.total ? ` · ${m.tokens.total.toLocaleString("vi-VN")} token` : "";
    const secs = m.duration_ms ? ` · ${Math.round(m.duration_ms / 1000)} giây` : "";
    if (m.exit_code === 0) console.log(`\n✔  Trợ lý xong (${tools} lần dùng công cụ${secs}${tok}).`);
    else {
      console.log(`\n!!  Trợ lý dừng (mã ${m.exit_code})${m.error ? `: ${short(m.error, 300)}` : ""}${secs}${tok}.`);
      const e = `${m.error ?? ""} ${m.text ?? ""}`;
      if (/\b40[13]\b|api key|unauthori[sz]ed|invalid.*key|user not found/i.test(e)) console.log("!!  Khoá API bị từ chối: nhập lại khoá ở bảng điều khiển → Trợ lý AI (đúng nơi cung cấp model).");
      else if (/\b402\b|credit|insufficient|balance|quota|billing/i.test(e)) console.log("!!  Tài khoản model hết tiền hoặc hết hạn mức: nạp thêm ở nơi cung cấp model.");
      else if (/\b429\b|rate.?limit/i.test(e)) console.log("!!  Bị giới hạn tốc độ: đợi một lúc rồi giao lại.");
      else if (/\b404\b|model.*not.*(found|exist)|no such model/i.test(e)) console.log("!!  Không có model này ở nơi cung cấp: kiểm tra tên model.");
    }
    if (!mcpTools && m.exit_code === 0) console.log("!!  Trợ lý không gọi công cụ MCP nào của game: kiểm tra model có hỗ trợ gọi công cụ (tool calling) không.");
    // the reply, when it did not come streamed (or the run failed after it)
    if (m.text && (!spoke || m.exit_code !== 0)) console.log(`\n${m.text}`);
    return;
  }
  if (m.type === "system" && m.subtype === "init" && !m.mcp_servers) return void console.log(`    model ${m.model || "?"}`);
  if (m.type === "system" && m.subtype === "init") {
    const mcp = (m.mcp_servers ?? []).map((s) => `${s.name}: ${s.status}`).join(", ");
    console.log(`    model ${m.model ?? "?"}${mcp ? ` · MCP ${mcp}` : ""}`);
    if (!(m.mcp_servers ?? []).some((s) => s.name === "dvtt" && s.status === "connected")) console.log("!!  MCP của game chưa kết nối được: trợ lý sẽ không làm được gì với dữ liệu game.");
  } else if (m.type === "assistant") {
    turns++;
    for (const c of m.message?.content ?? []) {
      if (c.type === "text" && c.text.trim()) console.log(`💬 ${c.text.trim().replace(/\n/g, "\n   ")}`);
      if (c.type === "tool_use") console.log(`🔧 ${brief(c.name, c.input)}`);
    }
  } else if (m.type === "user") {
    for (const c of m.message?.content ?? []) {
      if (c.type !== "tool_result") continue;
      const t = Array.isArray(c.content) ? c.content.map((x) => (x.type === "text" ? x.text : `[${x.type}]`)).join(" ") : c.content;
      console.log(`   ${c.is_error ? "✖" : "↳"} ${short(t, 200)}`);
    }
  } else if (m.type === "result") {
    const cost = m.total_cost_usd !== undefined ? ` · $${Number(m.total_cost_usd).toFixed(3)}` : "";
    const secs = m.duration_ms ? ` · ${Math.round(m.duration_ms / 1000)} giây` : "";
    if (m.subtype === "success") console.log(`\n✔  Trợ lý xong (${m.num_turns ?? turns} lượt${secs}${cost}).`);
    else console.log(`\n!!  Trợ lý dừng: ${m.subtype}${m.subtype === "error_max_turns" ? " (quá nhiều bước; chia việc nhỏ hơn)" : ""} (${m.num_turns ?? turns} lượt${cost}).`);
    if (m.result) console.log(`\n${m.result}`);
  }
});
