// The MCP protocol over HTTP for the game's tools (./tools.mjs): JSON-RPC 2.0 posted to /mcp (the Streamable HTTP
// transport, answered with plain JSON: these tools need no server-sent stream). The dashboard (deploy/panel/server.mjs)
// checks the bearer token before handing a request here.
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = `This server runs the owner's game "Đa Vũ Trụ Tu Tiên" (a Vietnamese xianxia side-view web MMO). Call game_overview first.
Data changes (monsters, items, drops, numbers, placed monsters, bosses called, gifts) apply live and are checked like the admin site's.
New art is pixel art made with the pixelfx library (pixelfx_guide: read "game" then "skill"): render_effect after every change and look at it.
A new character or boss needs register_character / register_boss, which restart the game. Names players see are Vietnamese.
Ask the owner before anything that takes from players or affects everyone (removing things, mass gifts, restarts at busy times).`;

/** Answer one HTTP request: body is the parsed JSON (a message or a batch). Returns [status, json | null]. */
export async function handleMcp(tools, body) {
  const one = async (m) => {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return m?.id !== undefined ? err(m.id, -32600, "Invalid Request") : null;
    const isNote = m.id === undefined || m.id === null;
    try {
      switch (m.method) {
        case "initialize": {
          const want = m.params?.protocolVersion;
          return ok(m.id, {
            protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "dvtt-game", title: "Đa Vũ Trụ Tu Tiên: công cụ AI", version: "1.0.0" },
            instructions: INSTRUCTIONS,
          });
        }
        case "ping":
          return isNote ? null : ok(m.id, {});
        case "tools/list":
          return ok(m.id, { tools: tools.list() });
        case "tools/call":
          return ok(m.id, await tools.call(String(m.params?.name ?? ""), m.params?.arguments ?? {}));
        case "resources/list":
          return ok(m.id, { resources: [] });
        case "prompts/list":
          return ok(m.id, { prompts: [] });
        default:
          if (isNote) return null; // notifications/initialized, notifications/cancelled…
          return err(m.id, -32601, `Method not found: ${m.method}`);
      }
    } catch (e) {
      return isNote ? null : err(m.id, -32603, e.message);
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    return out.length ? [200, out] : [202, null];
  }
  const r = await one(body);
  return r ? [200, r] : [202, null];
}
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
