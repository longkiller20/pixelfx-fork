// The game's MCP endpoint, as an MCP client sees it: node deploy/test/mcp.mjs <url …/mcp> <token> [picture.png]
// initialize, tools/list, wrong tokens refused; then a run through what an AI does: the overview, the schema, a monster
// made (its look copied into the game, its drops, placed on a map), seen in list_maps, its row moved and removed, the
// monster deleted; a picture turned into a character (images back), an effect written (checked, rendered); refusals
// with reasons. Leaves the game as it found it (except files under records/ and the figures it made in src/fx, which it
// lists for removal).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const [URL_, TOKEN, PIC] = process.argv.slice(2);
if (!URL_ || !TOKEN) throw new Error("usage: node deploy/test/mcp.mjs <url> <token> [picture.png]");
let id = 0, passed = 0;
const ok = (n) => (passed++, console.log("  ✓", n));
async function rpc(method, params, token = TOKEN) {
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  return { status: r.status, j: await r.json().catch(() => null) };
}
const call = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  assert.equal(r.status, 200);
  const res = r.j.result;
  const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  return { res, text, images: res.content.filter((c) => c.type === "image"), json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

// ---- the protocol
assert.equal((await rpc("tools/list", {}, "sai")).status, 401);
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
assert.equal(init.j.result.protocolVersion, "2025-06-18");
assert.ok(init.j.result.capabilities.tools && init.j.result.instructions.includes("game_overview"));
const note = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
assert.equal(note.status, 202);
const list = (await rpc("tools/list", {})).j.result.tools;
assert.ok(list.length >= 30 && list.every((t) => t.name && t.description && t.inputSchema?.type === "object"));
const pathUrl = URL_.replace(/\/mcp$/, `/mcp/${TOKEN}`);
assert.equal((await fetch(pathUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) })).status, 200);
ok(`protocol: initialize, notifications (202), ${list.length} tools with schemas, token in header or path, wrong token 401`);
assert.equal((await rpc("initialize", { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "t", version: "1" } })).j.result.protocolVersion, "2025-11-25");
ok("an unknown protocol version gets the newest this server speaks (2025-11-25)");

// ---- the older HTTP+SSE transport (clients that predate Streamable HTTP): GET …/sse names where to POST, replies come
// down the stream
async function sse(url, headers = {}) {
  const ac = new AbortController(), r = await fetch(url, { headers: { accept: "text/event-stream", ...headers }, signal: ac.signal });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/event-stream/);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  const next = async () => {
    for (;;) {
      const i = buf.indexOf("\n\n");
      if (i >= 0) {
        const ev = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (ev.startsWith(":")) continue;
        return { event: /^event: (.*)$/m.exec(ev)?.[1], data: /^data: (.*)$/m.exec(ev)?.[1] };
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      buf += dec.decode(value, { stream: true });
    }
  };
  const ep = await next();
  assert.equal(ep.event, "endpoint");
  const post = new URL(ep.data, url).href;
  const ask = async (m) => {
    const p = await fetch(post, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, ...m }) });
    assert.equal(p.status, 202);
    const e = await next();
    assert.equal(e.event, "message");
    return JSON.parse(e.data);
  };
  const res = [await ask({ method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sse", version: "1" } } }), await ask({ method: "tools/list" })];
  ac.abort();
  return { post, res };
}
const s1 = await sse(URL_ + "/sse", { authorization: `Bearer ${TOKEN}` });
assert.equal(s1.res[0].result.protocolVersion, "2024-11-05");
assert.equal(s1.res[1].result.tools.length, list.length);
const s2 = await sse(pathUrl + "/sse");
assert.ok(s2.post.includes(`/mcp/${TOKEN}/messages?sessionId=`) && s2.res[1].result.tools.length === list.length);
assert.equal((await fetch(URL_ + "/sse", { headers: { authorization: "Bearer sai" } })).status, 401);
assert.equal((await fetch(s1.post, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: "{}" })).status, 404);
ok("HTTP+SSE transport: endpoint event, replies on the stream, token in header or path, closed session 404, wrong token 401");

// ---- the game
const ov = await call("game_overview");
assert.ok(ov.json && Array.isArray(ov.json.maps) && ov.json.bosses.length >= 1, ov.text.slice(0, 300));
const sch = await call("get_schema", { table: "monsters" });
assert.ok(sch.json.cols.fx);
ok("game_overview and get_schema answer");

const T = `mcp${Date.now().toString(36).slice(-5)}`;
const made = await call("create_monster", { type: T, name: "Thử Hồ Ly", fx: "critters/frog", hp: 300, atk: 30, def: 10, spd: 60, drops: [{ item: "hoixuan", chance: 5 }], place: { map: "linhthuy", x: 40, n: 2 } });
assert.ok(!made.res.isError, made.text);
assert.ok(made.json.done.some((d) => d.includes("đặt 2 con")), made.text);
const maps = (await call("list_maps")).json, lt = maps.find((m) => m.id === "linhthuy"), row = lt.spawns.find((s) => s.type === T);
assert.ok(row && row.n === 2);
const drops = (await call("list_rows", { table: "monster_drops", filter: T })).json;
assert.equal(drops.total, 1);
ok("create_monster: the monster, its drop and 2 placed on Linh Thủy, all seen by list_maps / list_rows");
assert.ok(!(await call("update_spawn", { id: row.id, x: 60, n: 4 })).res.isError);
const bad = await call("place_monster", { map: "tanthu", type: T, x: 20 });
assert.ok(bad.res.isError && /không đặt yêu thú/.test(bad.text));
const del1 = await call("delete_row", { table: "monsters", key: T });
assert.ok(del1.res.isError && /map_spawns/.test(del1.text), del1.text);
assert.ok(!(await call("remove_spawn", { id: row.id })).res.isError);
assert.ok(!(await call("delete_row", { table: "monster_drops", key: String((await call("list_rows", { table: "monster_drops", filter: T })).json.rows[0].id) })).res.isError);
assert.ok(!(await call("delete_row", { table: "monsters", key: T })).res.isError);
ok("move the row, refused on a safe map, refused to delete while placed, then cleaned up");

const se = await call("search_effects", { query: "frog" });
assert.ok(se.json.effects.some((f) => f.id === "critters/frog"));
const g = await call("pixelfx_guide", { topic: "game" });
assert.ok(g.text.includes("A monster"));
const src = await call("read_effect_source", { id: "nhanvat/_rig" });
assert.ok(src.text.includes("makeFigure"));
ok("search_effects, pixelfx_guide, read_effect_source");

const ren = await call("render_effect", { id: "critters/frog" });
assert.ok(!ren.res.isError && ren.images.length >= 1 && ren.images[0].mimeType === "image/png", ren.text);
ok(`render_effect returns the contact sheet as an image (${Math.round(ren.images[0].data.length / 1024)} KB base64)`);

const FX = `critters/mcp-thu-${Date.now().toString(36).slice(-4)}`;
const code = readFileSync(new URL("../../src/fx/critters/frog.js", import.meta.url), "utf8").replace('name: "Frog"', 'name: "Ếch thử"');
const wr = await call("write_effect", { id: FX, code });
assert.ok(!wr.res.isError && /ok|pass/i.test(wr.text) && wr.images.length === 1, wr.text.slice(0, 600));
ok(`write_effect: ${FX} written, checked, rendered`);
const shared = await call("write_effect", { id: "nhanvat/_rig", code: "x" });
assert.ok(shared.res.isError);
ok("write_effect refuses a shared helper (_rig.js)");

if (PIC) {
  const b64 = readFileSync(PIC).toString("base64");
  const fig = await call("image_to_figure", { kind: "nhanvat", id: "nhanvat/mcp-thu", name: "Thử MCP", image_base64: b64 });
  assert.ok(!fig.res.isError && fig.images.length === 3, fig.text.slice(0, 500));
  ok("image_to_figure: a character from a picture, three images back (idle, walk, parts)");
  const fix = await call("image_to_figure", { kind: "nhanvat", id: "nhanvat/mcp-thu", name: "Thử MCP", image_base64: b64, parts: { boxes: [["a", 30, 30, 43, 55]] } });
  assert.ok(!fix.res.isError && /parts \(.*a/.test(fix.text), fix.text.slice(0, 400));
  ok("image_to_figure again with parts: the front arm boxed in");
}
const unk = await rpc("tools/call", { name: "khong_co", arguments: {} });
assert.ok(unk.j.result.isError);
const miss = await call("spawn_boss", {});
assert.ok(miss.res.isError && /Thiếu key/.test(miss.text));
ok("an unknown tool and a missing argument answer with an error, not a crash");
console.log(`${passed} passed (made: ${FX}${PIC ? ", nhanvat/mcp-thu" : ""})`);
