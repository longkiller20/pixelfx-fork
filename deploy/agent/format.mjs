// Claude Code's stream-json output (claude -p --output-format stream-json --verbose), as lines a person can follow in
// the dashboard's task window: what it says, each tool it uses (and a line of what came back), the end and its cost.
import readline from "node:readline";

const short = (s, n = 160) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const brief = (name, input = {}) => {
  if (name.startsWith("mcp__dvtt__")) return `${name.slice(11)} ${short(JSON.stringify(input).replace(/"image_base64":"[^"]+"/, '"image_base64":"…"'), 140)}`;
  if (input.file_path) return `${name} ${input.file_path.replace(process.cwd() + "/", "")}`;
  if (input.command) return `${name}: ${short(input.command, 140)}`;
  if (input.pattern) return `${name} ${input.pattern}`;
  return `${name} ${short(JSON.stringify(input), 120)}`;
};
const rl = readline.createInterface({ input: process.stdin });
let turns = 0;
rl.on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    if (line.trim()) console.log(`    ${line}`);
    return;
  }
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
