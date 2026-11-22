// The dashboard's AI side: the game's MCP endpoint (/mcp, tools in deploy/mcp), its tokens and its own game admin
// account, the pictures the owner uploads for the AI to turn into figures, the AI agent on this VPS (Claude Code: its
// key, its runs are tasks), and what the AI changed (local git commits by "AI …", each one can be undone).
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import http from "node:http";
import { createTools } from "../mcp/tools.mjs";
import { handleMcp } from "../mcp/http.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const UPLOADS = process.env.DVTT_UPLOADS ?? "/var/lib/dvtt-panel/uploads";
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** helpers: { ETC, loadState, loadPanel, sh, send, readBody, bad, startTask, fromLocal, clientIp } */
export function createAi(h) {
  const MCP_FILE = join(h.ETC, "mcp.json"), AGENT_ENV = join(h.ETC, "agent.env");
  const cfg = () => {
    try {
      return { tokens: [], enabled: false, allowCode: false, ...JSON.parse(readFileSync(MCP_FILE, "utf8")) };
    } catch {
      return { tokens: [], enabled: false, allowCode: false };
    }
  };
  const saveCfg = (c) => {
    mkdirSync(h.ETC, { recursive: true, mode: 0o700 });
    writeFileSync(MCP_FILE + ".tmp", JSON.stringify(c, null, 2), { mode: 0o600 });
    writeFileSync(MCP_FILE, readFileSync(MCP_FILE + ".tmp"), { mode: 0o600 });
    unlinkSync(MCP_FILE + ".tmp");
  };
  const isRoot = process.getuid?.() === 0;
  const hasUser = (u) => {
    try {
      return readFileSync("/etc/passwd", "utf8").split("\n").some((l) => l.startsWith(u + ":"));
    } catch {
      return false;
    }
  };
  /** A command, as the game's user (dvtt) when this runs as root and that user exists; output and exit code. */
  const run = (args, { cwd, timeout = 120000, env = {}, asGame = true } = {}) =>
    new Promise((resolve) => {
      const sudo = asGame && isRoot && hasUser("dvtt");
      const cmd = sudo ? "runuser" : args[0];
      const a = sudo ? ["-u", "dvtt", "--", "env", `HOME=${cwd ?? "/tmp"}`, ...Object.entries(env).map(([k, v]) => `${k}=${v}`), ...args] : args.slice(1);
      const p = spawn(cmd, a, { cwd, env: { ...process.env, ...env, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" } });
      let out = "";
      const add = (b) => (out.length < 2_000_000 ? (out += b) : null);
      p.stdout.on("data", add);
      p.stderr.on("data", add);
      const t = setTimeout(() => p.kill("SIGKILL"), timeout);
      p.on("close", (code) => (clearTimeout(t), resolve({ code, out })));
      p.on("error", (e) => (clearTimeout(t), resolve({ code: -1, out: e.message })));
    });
  const health = (port) =>
    new Promise((ok) => {
      const r = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 2000 }, (res) => (res.resume(), ok(res.statusCode === 200)));
      r.on("error", () => ok(false));
      r.on("timeout", () => (r.destroy(), ok(false)));
    });
  async function restartGame() {
    const s = h.loadState();
    const r = await run(["systemctl", "restart", "dvtt"], { asGame: false, timeout: 60000 });
    if (r.code !== 0) return `Không chạy lại được game: ${r.out.trim()}`;
    for (let i = 0; i < 40; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      if (await health(s.gamePort)) return "Game đã chạy lại.";
    }
    return "Game chưa trả lời sau 40 giây: xem game_logs.";
  }
  const tools = createTools({
    state: h.loadState,
    mcp: () => {
      const c = cfg();
      return { adminUser: c.adminUser, adminPass: c.adminPass, allowCode: !!c.allowCode };
    },
    runAs: (args, opts) => run(args, { ...opts, asGame: true }),
    runRoot: (args, opts) => run(args, { ...opts, asGame: false }),
    restartGame,
    logs: async (n) => (await h.sh("journalctl", ["-u", "dvtt", "-n", String(n), "--no-pager", "-o", "short-iso"], { timeout: 15000 })) || "(không đọc được log)",
  });

  // ---------------------------------------------------------------- /mcp: a bearer token (header, or /mcp/<token>)
  const tokenOk = (t) => {
    if (!t) return null;
    const hh = sha(t);
    return cfg().tokens.find((x) => x.hash.length === hh.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(hh))) ?? null;
  };
  const bad401 = new Map();
  async function mcp(req, res, url) {
    const ip = h.clientIp(req), b = bad401.get(ip);
    if (b && b.n >= 10 && Date.now() - b.at < 10 * 60_000) return h.send(res, 429, { error: "Quá nhiều lần sai token." });
    const c = cfg();
    const fromPath = url.pathname.startsWith("/mcp/") ? decodeURIComponent(url.pathname.slice(5)) : null;
    const tok = fromPath ?? (/^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "") ?? [])[1];
    const who = c.enabled ? tokenOk(tok) : null;
    if (!who) {
      bad401.set(ip, { n: (b && Date.now() - b.at < 10 * 60_000 ? b.n : 0) + 1, at: Date.now() });
      return h.send(res, c.enabled ? 401 : 403, { error: c.enabled ? "Sai hoặc thiếu token MCP." : "MCP đang tắt (Bảng điều khiển → Trợ lý AI)." }, { "www-authenticate": "Bearer" });
    }
    if (req.method === "GET") return h.send(res, 405, { error: "Dùng POST (JSON-RPC)." }, { allow: "POST" });
    if (req.method === "DELETE") return h.send(res, 200, { ok: true });
    if (req.method !== "POST") return h.send(res, 405, { error: "POST" });
    let body;
    try {
      body = await h.readBody(req, 24 << 20);
    } catch (e) {
      return h.send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: e.message } });
    }
    who.used = Date.now();
    const [code, out] = await handleMcp(tools, body);
    if (code === 202) {
      res.writeHead(202);
      return res.end();
    }
    return h.send(res, code, out);
  }

  // ---------------------------------------------------------------- the dashboard's AI tab
  const agentEnv = () => {
    try {
      return Object.fromEntries(readFileSync(AGENT_ENV, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    } catch {
      return {};
    }
  };
  async function aiStatus(req) {
    const c = cfg(), s = h.loadState(), p = h.loadPanel();
    const claude = (await run(["bash", "-lc", "command -v claude && claude --version 2>/dev/null | head -1"], { asGame: false, timeout: 15000 })).out.trim().split("\n");
    const others = {};
    for (const a of ["codex", "gemini", "opencode", "cursor-agent", "aider"]) others[a] = (await run(["bash", "-lc", `command -v ${a}`], { asGame: false, timeout: 5000 })).code === 0;
    const log = await run(["git", "-c", "safe.directory=*", "-C", s.dir, "log", "-n", "30", "--author=AI", "--format=%h%x09%an%x09%cI%x09%s"], { asGame: false });
    const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
    const sch = s.proxy !== "none" && s.https ? "https" : "http";
    const ram = os.totalmem(), cpus = os.cpus().length;
    return {
      mcp: {
        enabled: !!c.enabled, allowCode: !!c.allowCode, adminUser: c.adminUser ?? null,
        tokens: c.tokens.map((t) => ({ name: t.name, created: t.created, used: t.used ?? null })),
        url: s.proxy !== "none" && s.panelDomain ? `${sch}://${s.panelDomain}/mcp` : `http://${host || "IP-VPS"}:${p?.port}/mcp`,
        localUrl: `http://127.0.0.1:${p?.port}/mcp`,
        tools: tools.list().map((t) => t.name),
      },
      agent: {
        claude: claude[0]?.startsWith("/") ? { path: claude[0], version: claude[1] ?? "" } : null,
        others,
        key: agentEnv().ANTHROPIC_API_KEY ? "api" : agentEnv().CLAUDE_CODE_OAUTH_TOKEN ? "oauth" : null,
        model: agentEnv().DVTT_AI_MODEL ?? "",
      },
      machine: { ram, cpus, strong: ram >= 1.9 * 1024 ** 3 && cpus >= 2, enough: ram >= 0.9 * 1024 ** 3 },
      uploads: uploads(),
      changes: log.out.trim().split("\n").filter(Boolean).map((l) => {
        const [hash, author, at, subject] = l.split("\t");
        return { hash, author, at: Date.parse(at), subject };
      }),
    };
  }
  const uploads = () => {
    try {
      return readdirSync(UPLOADS).filter((f) => /\.png$/i.test(f)).map((f) => ({ name: f, size: statSync(join(UPLOADS, f)).size, at: statSync(join(UPLOADS, f)).mtimeMs })).sort((a, b) => b.at - a.at);
    } catch {
      return [];
    }
  };
  const newToken = () => `dvtt_${crypto.randomBytes(24).toString("base64url")}`;

  /** Turn MCP on: its own game admin account (ai-mcp, random password), and a first token if there is none. */
  async function enable(c) {
    const s = h.loadState();
    if (!c.adminUser || !c.adminPass) {
      const pass = crypto.randomBytes(18).toString("base64url");
      const r = await run(["node", join(HERE, "..", "tasks", "admin-password.mjs")], { cwd: join(s.dir, "game"), env: { ADMIN_USER: "ai-mcp", ADMIN_PASS: pass, KEEP_DEFAULT: "1" }, timeout: 60000 });
      if (r.code !== 0) h.bad(`Không tạo được tài khoản admin game cho AI (game đã cài chưa?): ${r.out.trim().slice(-300)}`);
      c.adminUser = "ai-mcp";
      c.adminPass = pass;
    }
    c.enabled = true;
  }

  async function api(req, res, path, url, M) {
    if (path === "/api/ai" && M === "GET") return h.send(res, 200, await aiStatus(req)), true;
    if (path === "/api/ai/mcp" && M === "POST") {
      const b = await h.readBody(req), c = cfg();
      let token = null;
      if (b.enabled === true) await enable(c);
      if (b.enabled === false) c.enabled = false;
      if (typeof b.allowCode === "boolean") c.allowCode = b.allowCode;
      if (b.newToken) {
        const name = String(b.newToken).trim().slice(0, 40) || "token";
        if (!c.enabled) await enable(c);
        token = newToken();
        c.tokens = c.tokens.filter((t) => t.name !== name).concat({ name, hash: sha(token), created: Date.now() });
      }
      if (b.revoke) c.tokens = c.tokens.filter((t) => t.name !== String(b.revoke));
      saveCfg(c);
      return h.send(res, 200, { ok: true, token }), true;
    }
    if (path === "/api/ai/upload" && M === "POST") {
      const name = String(url.searchParams.get("name") ?? "").toLowerCase().replace(/\.png$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (!name) h.bad("Tên ảnh: chữ thường không dấu, số, dấu -.");
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 15 << 20) h.bad("Ảnh tối đa 15 MB.");
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) h.bad("Chỉ nhận ảnh PNG (nền trong suốt).");
      mkdirSync(UPLOADS, { recursive: true, mode: 0o755 });
      chmodSync(UPLOADS, 0o755);
      writeFileSync(join(UPLOADS, `${name}.png`), buf, { mode: 0o644 });
      return h.send(res, 200, { ok: true, name: `${name}.png` }), true;
    }
    if (path === "/api/ai/upload" && (M === "GET" || M === "DELETE")) {
      const f = basename(String(url.searchParams.get("name") ?? ""));
      if (!uploads().some((u) => u.name === f)) return h.send(res, 404, { error: "Không có ảnh này." }), true;
      if (M === "DELETE") return unlinkSync(join(UPLOADS, f)), h.send(res, 200, { ok: true }), true;
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(readFileSync(join(UPLOADS, f)));
      return true;
    }
    if (path === "/api/ai/key" && M === "POST") {
      const b = await h.readBody(req), env = agentEnv();
      const key = String(b.key ?? "").trim();
      // only when a key is sent ("" removes it); a model alone keeps the key there is
      if ("key" in b) delete env.ANTHROPIC_API_KEY, delete env.CLAUDE_CODE_OAUTH_TOKEN;
      if (key) {
        if (!/^[A-Za-z0-9_\-.]{20,300}$/.test(key)) h.bad("Khoá không đúng dạng.");
        env[key.startsWith("sk-ant-oat") ? "CLAUDE_CODE_OAUTH_TOKEN" : "ANTHROPIC_API_KEY"] = key;
      }
      if (typeof b.model === "string") {
        if (b.model && !/^[a-z0-9.\-[\]]{2,60}$/i.test(b.model)) h.bad("Tên model không hợp lệ.");
        if (b.model) env.DVTT_AI_MODEL = b.model;
        else delete env.DVTT_AI_MODEL;
      }
      mkdirSync(h.ETC, { recursive: true, mode: 0o700 });
      writeFileSync(AGENT_ENV, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
      return h.send(res, 200, { ok: true }), true;
    }
    if (path === "/api/ai/undo" && M === "POST") {
      const b = await h.readBody(req), s = h.loadState(), hash = String(b.hash ?? "");
      if (!/^[0-9a-f]{7,40}$/.test(hash)) h.bad("Mã commit không hợp lệ.");
      const g = (a) => run(["git", "-c", "safe.directory=*", "-C", s.dir, ...a], { asGame: false });
      const who = (await g(["log", "-1", "--format=%an", hash])).out.trim();
      if (!who.startsWith("AI")) h.bad("Chỉ hoàn tác được thay đổi của AI.");
      const r = await g(["-c", "user.name=Bảng điều khiển", "-c", "user.email=panel@localhost", "revert", "--no-edit", hash]);
      if (r.code !== 0) {
        await g(["revert", "--abort"]);
        h.bad(`Không hoàn tác được (có thay đổi sau đè lên nó: hoàn tác cái mới hơn trước): ${r.out.trim().slice(-300)}`);
      }
      await run(["bash", "-c", `find '${s.dir}' -path '${s.dir}/.git' -prune -o -exec chown dvtt:dvtt {} +`], { asGame: false });
      const msg = await restartGame();
      return h.send(res, 200, { ok: true, restart: msg }), true;
    }
    return false;
  }

  /** The extra environment of the agent's tasks: its key, its model, a local MCP token (made once, kept hashed). */
  function agentTaskEnv() {
    const c = cfg(), env = agentEnv(), p = h.loadPanel();
    if (!c.enabled) h.bad("Bật MCP trước (để AI làm việc với game).");
    // a fresh local token for each run of the agent: only this machine's agent knows it, and the last one replaces it
    const token = newToken();
    c.tokens = c.tokens.filter((t) => t.name !== "agent-vps").concat({ name: "agent-vps", hash: sha(token), created: Date.now() });
    saveCfg(c);
    return { ...env, DVTT_MCP_URL: `http://127.0.0.1:${p.port}/mcp`, DVTT_MCP_TOKEN: token };
  }

  return { mcp, api, agentTaskEnv, cfg };
}
