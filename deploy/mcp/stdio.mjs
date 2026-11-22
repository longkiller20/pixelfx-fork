#!/usr/bin/env node
// A bridge for MCP clients that only start local (stdio) servers: it passes each JSON-RPC line on to the game's MCP
// endpoint over HTTP and prints the answers. Node 18+, no packages.
//   DVTT_MCP_URL=https://vps.example.com/mcp DVTT_MCP_TOKEN=… node stdio.mjs
// (Claude Desktop: "command": "node", "args": ["/path/stdio.mjs"], "env": { "DVTT_MCP_URL": …, "DVTT_MCP_TOKEN": … })
import readline from "node:readline";

const URL_ = process.env.DVTT_MCP_URL, TOKEN = process.env.DVTT_MCP_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("DVTT_MCP_URL and DVTT_MCP_TOKEN are needed");
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin });
let pending = 0, closed = false;
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  pending++;
  try {
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${TOKEN}` }, body: line });
    if (r.status === 202) return;
    const j = await r.json().catch(() => null);
    if (j) for (const m of [].concat(j)) out(m);
    else if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `HTTP ${r.status}` } });
  } catch (e) {
    if (msg.id !== undefined) out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `Không kết nối được ${URL_}: ${e.message}` } });
  } finally {
    if (--pending === 0 && closed) process.exit(0);
  }
});
rl.on("close", () => (closed = true, pending === 0 && process.exit(0)));
