#!/usr/bin/env node
// Bảng điều khiển cài đặt và vận hành game trên VPS. Node thuần (không cần npm install), chạy bằng root (nó cài gói,
// sửa systemd, tường lửa, proxy) qua dịch vụ systemd "dvtt-panel", ở cổng do người cài chọn.
//
//   dvtt-panel                       chạy bảng điều khiển (systemd gọi)
//   dvtt-panel init --port N --user U [--pass P] [--dir D]   tạo cấu hình lần đầu (install.sh gọi)
//   dvtt-panel passwd [--user U]     đặt lại tên/mật khẩu đăng nhập (quên mật khẩu)
//   dvtt-panel port N                đổi cổng (rồi mở tường lửa, chạy lại)
//   dvtt-panel run <tác vụ>          chạy một tác vụ từ dòng lệnh với cấu hình đã lưu (deps, db, app, setup…)
//   dvtt-panel status                in cấu hình và trạng thái các dịch vụ
//
// Cấu hình: /etc/dvtt-panel/panel.json (cổng, tài khoản, mật khẩu đã băm scrypt) và state.json (cổng game, tên miền,
// proxy…); đổi chỗ bằng biến PANEL_ETC. Nhật ký các tác vụ: /var/log/dvtt-panel.
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import net from "node:net";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, createReadStream, renameSync, statfsSync, appendFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import readline from "node:readline";
import { createAi } from "./ai.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS = join(HERE, "..", "tasks");
const PUBLIC = join(HERE, "public");
const ETC = process.env.PANEL_ETC ?? "/etc/dvtt-panel";
const LOGS = process.env.PANEL_LOGS ?? "/var/log/dvtt-panel";
const PANEL_FILE = join(ETC, "panel.json"), STATE_FILE = join(ETC, "state.json");
const BACKUP_DIR = "/var/backups/dvtt";
const scrypt = promisify(crypto.scrypt);
const run = promisify(execFile);

// ---------------------------------------------------------------- settings
const DEFAULT_STATE = {
  dir: join(HERE, "..", ".."),
  gamePort: 5886,
  adminPort: 5885,
  proxy: "none",
  domain: "",
  adminDomain: "",
  panelDomain: "",
  email: "",
  https: true,
  adminAccess: "port",
  adminIp: "",
  adminUser: "admin",
  panelOpen: true,
  firewall: true,
  backupDaily: true,
  backupKeep: 14,
  repo: "https://github.com/longkiller20/pixelfx-fork.git",
  branch: "main",
  done: {},
};
const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
function writeJson(f, v) {
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  writeFileSync(f + ".tmp", JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
  renameSync(f + ".tmp", f);
}
const loadPanel = () => readJson(PANEL_FILE, null);
const loadState = () => ({ ...DEFAULT_STATE, ...readJson(STATE_FILE, {}) });
const saveState = (s) => writeJson(STATE_FILE, s);

async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function checkPw(pw, stored) {
  const [v, s, k] = String(stored ?? "").split("$");
  if (v !== "s1" || !s || !k) return false;
  const want = Buffer.from(k, "base64"), got = await scrypt(String(pw), Buffer.from(s, "base64"), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}

// ---------------------------------------------------------------- checks of what is typed in
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@"'`$\;<>]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const RESERVED = new Set([22, 25, 53, 80, 443, 3306, 3307]);
class Bad extends Error {}
const bad = (m) => {
  throw new Bad(m);
};
function port(v, what) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) bad(`${what}: phải là số từ 1024 đến 65535.`);
  if (RESERVED.has(n)) bad(`${what}: cổng ${n} dành cho dịch vụ khác.`);
  return n;
}
function domain(v, what) {
  const d = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return "";
  if (!DOMAIN_RE.test(d)) bad(`${what}: "${d}" không phải tên miền hợp lệ (ví dụ game.tenmien.com).`);
  return d;
}
function ipOrCidr(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const [ip, bits, more] = s.split("/");
  const fam = net.isIP(ip);
  if (!fam || more !== undefined || (bits !== undefined && !(/^\d{1,3}$/.test(bits) && Number(bits) <= (fam === 4 ? 32 : 128)))) bad(`IP được vào trang admin: "${s}" không hợp lệ.`);
  return s;
}
/** The deployment's settings from a form, merged over what is saved, every field checked. */
function checkState(input, cur) {
  const s = { ...cur };
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  if (has("gamePort")) s.gamePort = port(input.gamePort, "Cổng game");
  if (has("adminPort")) s.adminPort = port(input.adminPort, "Cổng admin");
  if (has("proxy")) s.proxy = ["none", "caddy", "nginx"].includes(input.proxy) ? input.proxy : bad("Reverse proxy: chọn Không dùng, Caddy hoặc Nginx.");
  if (has("domain")) s.domain = domain(input.domain, "Tên miền game");
  if (has("adminDomain")) s.adminDomain = domain(input.adminDomain, "Tên miền admin");
  if (has("panelDomain")) s.panelDomain = domain(input.panelDomain, "Tên miền bảng điều khiển");
  if (has("email")) {
    s.email = String(input.email ?? "").trim();
    if (s.email && !EMAIL_RE.test(s.email)) bad("Email không hợp lệ.");
  }
  if (has("https")) s.https = !!input.https;
  if (has("adminAccess")) s.adminAccess = ["domain", "port", "local"].includes(input.adminAccess) ? input.adminAccess : bad("Cách vào trang admin không hợp lệ.");
  if (has("adminIp")) s.adminIp = ipOrCidr(input.adminIp);
  if (has("adminUser")) s.adminUser = USER_RE.test(String(input.adminUser ?? "").trim()) ? String(input.adminUser).trim() : bad("Tên admin: 3-32 ký tự chữ, số, dấu . _ -");
  for (const k of ["panelOpen", "firewall", "backupDaily"]) if (has(k)) s[k] = !!input[k];
  if (has("backupKeep")) {
    const n = Number(input.backupKeep);
    s.backupKeep = Number.isInteger(n) && n >= 1 && n <= 365 ? n : bad("Số bản sao lưu giữ lại: 1-365.");
  }
  if (has("repo")) {
    const r = String(input.repo ?? "").trim();
    s.repo = /^(https:\/\/[\w.-]+(:\d+)?\/[\w.\-/~]+|git@[\w.-]+:[\w.\-/~]+)$/.test(r) ? r : bad("Địa chỉ kho git không hợp lệ (https://… hoặc git@…).");
  }
  if (has("branch")) s.branch = /^[\w.\-/]{1,100}$/.test(String(input.branch ?? "")) && !String(input.branch).includes("..") ? String(input.branch) : bad("Tên nhánh không hợp lệ.");
  // the whole, together
  const panel = loadPanel();
  const ports = [["Cổng game", s.gamePort], ["Cổng admin", s.adminPort], ["Cổng bảng điều khiển", panel?.port]].filter(([, p]) => p);
  for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) if (ports[i][1] === ports[j][1]) bad(`${ports[i][0]} và ${ports[j][0]} trùng nhau (${ports[i][1]}).`);
  const doms = [s.domain, s.adminDomain, s.panelDomain].filter(Boolean);
  if (new Set(doms).size !== doms.length) bad("Mỗi tên miền chỉ dùng cho một thứ (game, admin, bảng điều khiển).");
  if (s.proxy !== "none" && !s.domain) bad("Dùng reverse proxy thì cần tên miền cho game.");
  if (s.adminAccess === "domain" && (s.proxy === "none" || !s.adminDomain)) bad("Vào trang admin bằng tên miền: cần chọn reverse proxy và nhập tên miền admin.");
  if (!s.panelOpen && (s.proxy === "none" || !s.panelDomain)) s.panelOpen = true;
  return s;
}

// ports something else on this machine is listening on (not the game, its proxy or this panel)
async function portTaken(p) {
  const out = await sh("ss", ["-ltnpH"]);
  for (const line of out.split("\n")) {
    const cols = line.trim().split(/\s+/), local = cols[3] ?? "";
    if (!local.endsWith(`:${p}`)) continue;
    if (/"(node|caddy|nginx)"/.test(line)) return null;
    return (line.match(/users:\(\("([^"]+)"/) ?? [])[1] ?? "một chương trình khác";
  }
  return null;
}

// ---------------------------------------------------------------- shell helpers
async function sh(cmd, args = [], opts = {}) {
  try {
    const { stdout } = await run(cmd, args, { timeout: 15000, maxBuffer: 8 << 20, ...opts });
    return stdout.toString();
  } catch (e) {
    return opts.withErr ? (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") : e.stdout?.toString() ?? "";
  }
}
const first = (s) => s.split("\n")[0].trim();
/** The environment a task runs with (deploy/tasks/lib.sh says what each means). */
function taskEnv(s, extra = {}) {
  const panel = loadPanel() ?? {};
  return {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: "/root",
    LANG: "C.UTF-8",
    DVTT_DIR: s.dir,
    GAME_PORT: String(s.gamePort),
    ADMIN_PORT: String(s.adminPort),
    PANEL_PORT: String(panel.port ?? 0),
    PROXY: s.proxy,
    HTTPS: s.https ? "1" : "0",
    DOMAIN: s.domain,
    ADMIN_DOMAIN: s.adminDomain,
    PANEL_DOMAIN: s.panelDomain,
    EMAIL: s.email,
    ADMIN_ACCESS: s.adminAccess === "domain" && (s.proxy === "none" || !s.adminDomain) ? "local" : s.adminAccess,
    ADMIN_IP: s.adminIp,
    PANEL_OPEN: s.panelOpen ? "1" : "0",
    FIREWALL: s.firewall ? "1" : "0",
    BACKUP_DAILY: s.backupDaily ? "1" : "0",
    BACKUP_KEEP: String(s.backupKeep),
    REPO: s.repo,
    BRANCH: s.branch,
    // a VPS that reaches the internet through a proxy: the tasks do too
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(https?_proxy|no_proxy|HTTPS?_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS)$/.test(k))),
    ...extra,
  };
}

// ---------------------------------------------------------------- tasks: one at a time, their output kept
const TASK_DEFS = {
  setup: { file: "setup.sh", name: "Cài đặt tất cả", marks: ["deps", "db", "app"] },
  deps: { file: "deps.sh", name: "Cài gói cần thiết (Node.js, MariaDB…)", marks: ["deps"] },
  db: { file: "db.sh", name: "Cơ sở dữ liệu", marks: ["db"] },
  app: { file: "app.sh", name: "Cài và chạy game", marks: ["app"] },
  adminpw: { file: "adminpw.sh", name: "Mật khẩu trang admin", marks: ["adminpw"] },
  proxy: { file: "proxy.sh", name: "Tên miền và reverse proxy", marks: ["proxy"] },
  firewall: { file: "firewall.sh", name: "Tường lửa", marks: ["firewall"] },
  backup: { file: "backup.sh", name: "Sao lưu database" },
  restore: { file: "backup.sh", name: "Khôi phục database" },
  "backup-delete": { file: "backup.sh", name: "Xoá bản sao lưu" },
  "backup-timer": { file: "backup.sh", name: "Sao lưu tự động" },
  update: { file: "update.sh", name: "Cập nhật game" },
  apply: { file: "apply.sh", name: "Áp dụng cấu hình" },
  agent: { file: "agent.sh", name: "Cài trợ lý AI" },
  ai: { file: "ai-run.sh", name: "Trợ lý AI làm việc" },
};
let task = null;
const history = [];
const MAX_LOG = 4 << 20;
function startTask(key, extra = {}, after) {
  const def = TASK_DEFS[key];
  if (!def) bad("Không có tác vụ này.");
  if (task?.running) bad(`Đang chạy "${task.name}". Đợi nó xong đã.`);
  const s = loadState();
  const id = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${key}`;
  mkdirSync(LOGS, { recursive: true, mode: 0o700 });
  const logFile = join(LOGS, `${id}.log`);
  const t = { id, key, name: def.name + (extra.AGENT_KIND ? ` (${extra.AGENT_KIND === "hermes" ? "Hermes Agent" : "Claude Code"})` : ""), started: Date.now(), ended: null, code: null, running: true, log: "", logFile };
  task = t;
  // in a process group of its own, so stopping it stops everything it started (an AI agent and its helpers too)
  const child = spawn("bash", [join(TASKS, def.file)], { env: taskEnv(s, extra), stdio: ["ignore", "pipe", "pipe"], detached: true });
  t.pid = child.pid;
  const add = (b) => {
    const text = b.toString();
    if (t.log.length < MAX_LOG) t.log += text;
    try {
      appendFileSync(logFile, text, { mode: 0o600 });
    } catch {}
  };
  child.stdout.on("data", add);
  child.stderr.on("data", add);
  child.on("error", (e) => add(`\n✖  ${e.message}\n`));
  child.on("close", (code) => {
    t.code = code ?? -1;
    t.ended = Date.now();
    t.running = false;
    if (t.code === 0) {
      const st = loadState();
      st.done = { ...st.done };
      for (const m of def.marks ?? []) st.done[m] = t.ended;
      if (key === "setup") {
        if (extra.ADMIN_PASS) st.done.adminpw = t.ended;
        if (st.proxy !== "none" && st.domain) st.done.proxy = t.ended;
        if (st.firewall) st.done.firewall = t.ended;
      }
      saveState(st);
    }
    const h = { id: t.id, key, name: t.name, started: t.started, ended: t.ended, code: t.code };
    history.unshift(h);
    try {
      writeFileSync(join(LOGS, `${id}.json`), JSON.stringify(h), { mode: 0o600 });
    } catch {}
    history.length = Math.min(history.length, 30);
    after?.(t);
  });
  return t;
}
const taskView = (t, since = 0) => t && { id: t.id, key: t.key, name: t.name, started: t.started, ended: t.ended, code: t.code, running: t.running, size: t.log.length, log: t.log.slice(since) };

// ---------------------------------------------------------------- what the overview shows
let ipCache = { at: 0, ip: "" };
function publicIp() {
  if (Date.now() - ipCache.at < 10 * 60_000) return Promise.resolve(ipCache.ip);
  return new Promise((resolve) => {
    const req = https.get("https://api.ipify.org", { timeout: 4000 }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        ipCache = { at: Date.now(), ip: net.isIP(b.trim()) ? b.trim() : "" };
        resolve(ipCache.ip);
      });
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => req.destroy());
  });
}
function httpGet(port, path = "/", timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path, timeout }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c.length < 4096 ? c : ""));
      res.on("end", () => resolve({ code: res.statusCode, body: b }));
    });
    req.on("error", () => resolve({ code: 0, body: "" }));
    req.on("timeout", () => req.destroy());
  });
}
/** The certificate served for domain d on this machine's 443: who issued it, until when. */
function certOf(d) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: "127.0.0.1", port: 443, servername: d, rejectUnauthorized: false, timeout: 3000 }, () => {
      const c = sock.getPeerCertificate();
      const valid = sock.authorized;
      sock.end();
      resolve(c?.valid_to ? { domain: d, issuer: c.issuer?.O ?? c.issuer?.CN ?? "", to: new Date(c.valid_to).getTime(), trusted: valid, error: sock.authorizationError ? String(sock.authorizationError) : "" } : { domain: d, error: "không có chứng chỉ" });
    });
    sock.on("error", (e) => resolve({ domain: d, error: e.code === "ECONNREFUSED" ? "cổng 443 chưa mở" : e.message }));
    sock.on("timeout", () => (sock.destroy(), resolve({ domain: d, error: "hết thời gian chờ" })));
  });
}
function hostOf(req) {
  const h = String(req?.headers?.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return net.isIP(h) ? h : "";
}
async function unitState(u) {
  const out = await sh("systemctl", ["show", u, "--property=ActiveState,SubState,UnitFileState,LoadState,ActiveEnterTimestamp"]);
  const o = Object.fromEntries(out.trim().split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return { unit: u, installed: o.LoadState === "loaded", active: o.ActiveState ?? "unknown", sub: o.SubState ?? "", enabled: o.UnitFileState ?? "", since: o.ActiveEnterTimestamp ? Date.parse(o.ActiveEnterTimestamp) || null : null };
}
function backups() {
  try {
    return readdirSync(BACKUP_DIR).filter((f) => /^dvtt-\d{8}-\d{6}(-[a-z]+)?\.sql\.gz$/.test(f)).map((f) => {
      const st = statSync(join(BACKUP_DIR, f));
      return { name: f, size: st.size, at: st.mtimeMs };
    }).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}
function urls(s, panelPort, ip) {
  const host = ip || "IP-VPS", sch = s.https ? "https" : "http", prox = s.proxy !== "none";
  return {
    game: prox && s.domain ? `${sch}://${s.domain}` : `http://${host}:${s.gamePort}`,
    admin: s.adminAccess === "domain" && prox && s.adminDomain ? `${sch}://${s.adminDomain}` : s.adminAccess === "port" ? `http://${host}:${s.adminPort}` : `ssh -L ${s.adminPort}:127.0.0.1:${s.adminPort} root@${host}  →  http://127.0.0.1:${s.adminPort}`,
    panel: prox && s.panelDomain ? `${sch}://${s.panelDomain}` : `http://${host}:${panelPort}`,
    panelDirect: `http://${host}:${panelPort}`,
  };
}
async function status(req) {
  const s = loadState(), panel = loadPanel();
  const [ip, game, adminSite, units, ufw, nodeV, mariaV, caddyV, nginxV, gitInfo, osr] = await Promise.all([
    publicIp(),
    httpGet(s.gamePort, "/health"),
    httpGet(s.adminPort, "/"),
    Promise.all(["dvtt", "mariadb", "caddy", "nginx", "dvtt-panel", "dvtt-backup.timer", "certbot.timer"].map(unitState)),
    sh("ufw", ["status"]),
    sh("node", ["-v"]),
    sh("mariadb", ["--version"]),
    sh("caddy", ["version"]),
    sh("nginx", ["-v"], { withErr: true }),
    sh("git", ["-c", "safe.directory=*", "-C", s.dir, "log", "-1", "--format=%h%x09%s%x09%cI"]),
    Promise.resolve(readFileSync("/etc/os-release", "utf8")),
  ]);
  let online = null;
  try {
    online = JSON.parse(game.body).online ?? null;
  } catch {}
  const [h, subj, when] = gitInfo.trim().split("\t");
  let disk = null;
  try {
    const f = statfsSync("/");
    disk = { total: f.blocks * f.bsize, free: f.bavail * f.bsize };
  } catch {}
  const mem = readFileSync("/proc/meminfo", "utf8"), kb = (k) => Number((mem.match(new RegExp(`^${k}:\\s+(\\d+)`, "m")) ?? [])[1] ?? 0) * 1024;
  const doms = [s.domain, s.adminDomain, s.panelDomain].filter(Boolean);
  const certs = s.proxy !== "none" && s.https ? await Promise.all(doms.map(certOf)) : [];
  const cpu = os.cpus();
  return {
    state: { ...s },
    panel: { port: panel?.port, user: panel?.user },
    // no public address found (no internet, a proxy): the one the browser used to reach this page
    urls: urls(s, panel?.port, ip || hostOf(req)),
    ip: ip || hostOf(req),
    system: {
      host: os.hostname(),
      os: (osr.match(/^PRETTY_NAME="?([^"\n]+)/m) ?? [])[1] ?? "Linux",
      kernel: os.release(),
      arch: os.arch(),
      uptime: os.uptime(),
      load: os.loadavg(),
      cpus: cpu.length,
      cpuModel: cpu[0]?.model ?? "",
      mem: { total: kb("MemTotal"), avail: kb("MemAvailable"), swapTotal: kb("SwapTotal"), swapFree: kb("SwapFree") },
      disk,
    },
    versions: {
      node: first(nodeV),
      mariadb: first(mariaV).replace(/^.*?Ver /, "").replace(/,.*$/, ""),
      caddy: first(caddyV).split(" ")[0],
      nginx: first(nginxV).replace(/^nginx version: /, ""),
    },
    game: { up: game.code === 200, code: game.code, online, admin: adminSite.code > 0 },
    units: Object.fromEntries(units.map((u) => [u.unit, u])),
    ufw: first(ufw).replace(/^Status: /, "") || "không có",
    git: h ? { hash: h, subject: subj, at: Date.parse(when) } : null,
    installed: existsSync(join(s.dir, "game", "node_modules")) && existsSync("/etc/systemd/system/dvtt.service"),
    certs,
    backups: backups(),
    task: taskView(task, Infinity),
    history,
  };
}

// ---------------------------------------------------------------- the .env editor (DB_PASS never leaves the machine)
const MASK = "••••••••";
const envPath = () => join(loadState().dir, "game", ".env");
function envRead() {
  const t = existsSync(envPath()) ? readFileSync(envPath(), "utf8") : "";
  return t.replace(/^(\s*DB_PASS\s*=).*$/m, `$1${MASK}`);
}
function envWrite(text) {
  const t = String(text ?? "").replace(/\r\n/g, "\n");
  if (t.length > 20000) bad(".env quá dài.");
  const lines = t.split("\n");
  lines.forEach((l, i) => {
    if (l.trim() && !l.trim().startsWith("#") && !/^\s*[A-Z][A-Z0-9_]*\s*=[^\n]*$/.test(l)) bad(`Dòng ${i + 1} không đúng dạng KHOÁ=giá trị: "${l.slice(0, 60)}"`);
  });
  const old = existsSync(envPath()) ? readFileSync(envPath(), "utf8") : "";
  const oldPass = (old.match(/^\s*DB_PASS\s*=(.*)$/m) ?? [])[1] ?? "";
  const out = lines.map((l) => (/^\s*DB_PASS\s*=/.test(l) && l.includes(MASK) ? `DB_PASS=${oldPass}` : l)).join("\n");
  writeFileSync(envPath(), out.endsWith("\n") ? out : out + "\n", { mode: 0o600 });
}

// ---------------------------------------------------------------- sessions, login limits
const sessions = new Map();
const SESSION_MS = 12 * 3600_000;
const fails = new Map();
function tooMany(ip) {
  const f = fails.get(ip);
  return f && f.n >= 6 && Date.now() - f.at < 10 * 60_000;
}
function failed(ip) {
  const f = fails.get(ip);
  fails.set(ip, f && Date.now() - f.at < 10 * 60_000 ? { n: f.n + 1, at: Date.now() } : { n: 1, at: Date.now() });
}
const cookieOf = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter((p) => p.length === 2));
function sessionOf(req) {
  const t = cookieOf(req).dvttp, s = t && sessions.get(t);
  if (!s || s.exp < Date.now()) return null;
  s.exp = Date.now() + SESSION_MS;
  return s;
}
const fromLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const clientIp = (req) => (fromLocal(req) && req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress);
const isHttps = (req) => fromLocal(req) && req.headers["x-forwarded-proto"] === "https";

// ---------------------------------------------------------------- the web server
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, code, body, headers = {}) {
  const json = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SECURITY, "cache-control": "no-store", "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", ...headers });
  res.end(json ? JSON.stringify(body) : body);
}
function readBody(req, max = 64 << 10) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > max) reject(new Bad("Dữ liệu gửi lên quá lớn.")), req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        reject(new Bad("Dữ liệu không đúng dạng JSON."));
      }
    });
    req.on("error", reject);
  });
}
function serveStatic(req, res, path) {
  const f = path === "/" ? "index.html" : path.slice(1);
  if (!/^[\w.-]+$/.test(f)) return send(res, 404, "Không có");
  const full = join(PUBLIC, f);
  if (!existsSync(full)) return send(res, 404, "Không có");
  res.writeHead(200, { ...SECURITY, "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(full).pipe(res);
}

/** Restart this panel a moment after answering (its port changed, or it was updated). */
function restartSoon() {
  setTimeout(() => {
    execFile("systemd-run", ["--on-active=1", `--unit=dvtt-panel-restart-${Date.now()}`, "/bin/systemctl", "restart", "dvtt-panel"], () => {});
  }, 500);
}

const UNITS = new Set(["dvtt", "mariadb", "caddy", "nginx", "dvtt-panel", "certbot", "dvtt-backup"]);
async function api(req, res, path, url) {
  const ip = clientIp(req);
  if (path === "/api/login" && req.method === "POST") {
    if (tooMany(ip)) return send(res, 429, { error: "Sai quá nhiều lần. Đợi 10 phút rồi thử lại." });
    const b = await readBody(req), panel = loadPanel();
    const okUser = panel && String(b.user ?? "") === panel.user;
    const okPw = await checkPw(String(b.pass ?? ""), okUser ? panel.hash : DUMMY);
    if (!okUser || !okPw) {
      failed(ip);
      await new Promise((r) => setTimeout(r, 400));
      return send(res, 401, { error: "Sai tên đăng nhập hoặc mật khẩu." });
    }
    fails.delete(ip);
    const t = crypto.randomBytes(32).toString("base64url");
    sessions.set(t, { user: panel.user, exp: Date.now() + SESSION_MS, csrf: crypto.randomBytes(16).toString("hex") });
    return send(res, 200, { ok: true, csrf: sessions.get(t).csrf }, { "set-cookie": `dvttp=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? "; Secure" : ""}` });
  }
  const sess = sessionOf(req);
  if (!sess) return send(res, 401, { error: "Chưa đăng nhập." });
  // the page asks for its session's token after a reload (only a page of this origin can read the answer)
  if (path === "/api/session" && req.method === "GET") return send(res, 200, { user: sess.user, csrf: sess.csrf });
  // every call made by the page carries the session's own token: another site can't make one for it
  // (a picture's preview is an <img>, which can't send it: a GET that changes nothing, and the cookie is SameSite=Strict)
  const preview = req.method === "GET" && path === "/api/ai/upload";
  if (req.headers["x-csrf"] !== sess.csrf && !preview) return send(res, 403, { error: "Phiên không hợp lệ, hãy tải lại trang." });
  const M = req.method;
  if (path.startsWith("/api/ai") && (await ai.api(req, res, path, url, M))) return;
  if (path === "/api/logout" && M === "POST") {
    sessions.delete(cookieOf(req).dvttp);
    return send(res, 200, { ok: true }, { "set-cookie": "dvttp=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }
  if (path === "/api/status" && M === "GET") return send(res, 200, await status(req));
  if (path === "/api/state" && M === "POST") {
    const b = await readBody(req), s = checkState(b, loadState());
    for (const [p, what] of [[s.gamePort, "Cổng game"], [s.adminPort, "Cổng admin"]]) {
      const who = await portTaken(p);
      if (who) bad(`${what} ${p} đang được "${who}" dùng. Chọn cổng khác.`);
    }
    saveState(s);
    return send(res, 200, { ok: true, state: s });
  }
  if (path === "/api/task" && M === "GET") {
    const id = url.searchParams.get("id"), since = Number(url.searchParams.get("since") ?? 0) || 0;
    if (id && task?.id !== id) {
      const h = history.find((x) => x.id === id);
      if (!h) return send(res, 404, { error: "Không có" });
      const f = join(LOGS, `${id}.log`);
      return send(res, 200, { ...h, running: false, log: existsSync(f) ? readFileSync(f, "utf8").slice(since) : "" });
    }
    return send(res, 200, { task: taskView(task, since) });
  }
  if (path === "/api/run" && M === "POST") {
    const b = await readBody(req), key = String(b.task ?? "");
    const extra = {};
    if (key === "adminpw" || (key === "setup" && b.adminPass)) {
      const pw = String(b.adminPass ?? "");
      if (pw.length < 8 || pw.length > 72) bad("Mật khẩu admin: 8-72 ký tự.");
      extra.ADMIN_PASS = pw;
      extra.ADMIN_USER = loadState().adminUser;
    }
    if (key === "restore" || key === "backup-delete") {
      const f = String(b.file ?? "");
      if (!backups().some((x) => x.name === f)) bad("Không có bản sao lưu này.");
      extra.BACKUP_FILE = f;
      extra.ACTION = key === "restore" ? "restore" : "delete";
    }
    if (key === "backup") extra.ACTION = "create";
    if (key === "backup-timer") extra.ACTION = "timer";
    if (key === "update" && b.force) extra.FORCE = "1";
    if (key === "ai") {
      const prompt = String(b.prompt ?? "").trim();
      if (prompt.length < 5 || prompt.length > 8000) bad("Yêu cầu cho AI: 5-8000 ký tự.");
      Object.assign(extra, ai.agentTaskEnv(), { PROMPT: prompt, AUTO_RESTART: b.restart === false ? "0" : "1", ALLOW_CODE: b.code === false ? "0" : "1" });
    }
    if (key === "agent") {
      const kind = String(b.agent ?? "claude");
      if (!["claude", "hermes"].includes(kind)) bad("Trợ lý: claude hoặc hermes.");
      extra.AGENT_KIND = kind;
    }
    if (!TASK_DEFS[key]) bad("Không có tác vụ này.");
    const t = startTask(key, extra);
    return send(res, 200, { task: taskView(t) });
  }
  if (path === "/api/task/stop" && M === "POST") {
    if (!task?.running) bad("Không có tác vụ nào đang chạy.");
    // the whole group (the script cleans up on TERM); whatever is still there 20 s later is killed
    const t = task, kill = (sig) => {
      try {
        process.kill(-t.pid, sig);
      } catch {
        try {
          process.kill(t.pid, sig);
        } catch {}
      }
    };
    kill("SIGTERM");
    setTimeout(() => t.running && kill("SIGKILL"), 20000).unref();
    return send(res, 200, { ok: true });
  }
  if (path === "/api/service" && M === "POST") {
    const b = await readBody(req), u = String(b.unit ?? ""), a = String(b.action ?? "");
    if (!["dvtt", "mariadb", "caddy", "nginx"].includes(u) || !["start", "stop", "restart"].includes(a)) bad("Thao tác không hợp lệ.");
    const out = await sh("systemctl", [a, u], { withErr: true, timeout: 60000 });
    return send(res, 200, { ok: true, out, state: await unitState(u) });
  }
  if (path === "/api/logs" && M === "GET") {
    const u = String(url.searchParams.get("unit") ?? "dvtt"), n = Math.min(2000, Math.max(20, Number(url.searchParams.get("n")) || 200));
    if (!UNITS.has(u)) bad("Không có dịch vụ này.");
    const out = await sh("journalctl", ["-u", u, "-n", String(n), "--no-pager", "-o", "short-iso"], { timeout: 15000 });
    return send(res, 200, { unit: u, text: out });
  }
  if (path === "/api/ufw" && M === "GET") return send(res, 200, { text: await sh("ufw", ["status", "verbose"], { withErr: true }) });
  if (path === "/api/env" && M === "GET") return send(res, 200, { text: envRead(), path: envPath() });
  if (path === "/api/env" && M === "POST") {
    const b = await readBody(req);
    envWrite(b.text);
    if (b.restart) await sh("systemctl", ["restart", "dvtt"], { timeout: 60000 });
    return send(res, 200, { ok: true });
  }
  if (path === "/api/backup" && M === "GET") {
    const f = String(url.searchParams.get("file") ?? "");
    if (!backups().some((x) => x.name === f)) return send(res, 404, { error: "Không có" });
    res.writeHead(200, { ...SECURITY, "content-type": "application/gzip", "content-disposition": `attachment; filename="${f}"`, "content-length": statSync(join(BACKUP_DIR, f)).size });
    return createReadStream(join(BACKUP_DIR, f)).pipe(res);
  }
  if (path === "/api/update/check" && M === "GET") {
    const s = loadState();
    const out = await sh("git", ["-c", "safe.directory=*", "ls-remote", s.repo, `refs/heads/${s.branch}`], { timeout: 20000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    const remote = out.split(/\s/)[0] ?? "";
    const local = (await sh("git", ["-c", "safe.directory=*", "-C", s.dir, "rev-parse", "HEAD"])).trim();
    return send(res, 200, { remote: remote.slice(0, 7), local: local.slice(0, 7), behind: !!remote && !!local && remote !== local, ok: !!remote });
  }
  if (path === "/api/panel/password" && M === "POST") {
    const b = await readBody(req), panel = loadPanel();
    if (!(await checkPw(String(b.old ?? ""), panel.hash))) bad("Mật khẩu hiện tại không đúng.");
    const pw = String(b.pass ?? ""), user = String(b.user ?? panel.user).trim();
    if (!USER_RE.test(user)) bad("Tên đăng nhập: 3-32 ký tự chữ, số, dấu . _ -");
    if (pw.length < 10 || pw.length > 128) bad("Mật khẩu bảng điều khiển: 10-128 ký tự.");
    writeJson(PANEL_FILE, { ...panel, user, hash: await hashPw(pw) });
    // everyone else is signed out
    const mine = cookieOf(req).dvttp;
    for (const k of sessions.keys()) if (k !== mine) sessions.delete(k);
    sess.user = user;
    return send(res, 200, { ok: true });
  }
  if (path === "/api/panel/port" && M === "POST") {
    const b = await readBody(req), panel = loadPanel(), s = loadState();
    const p = port(b.port, "Cổng bảng điều khiển");
    if ([s.gamePort, s.adminPort].includes(p)) bad("Cổng này đang dùng cho game hoặc admin.");
    if (p !== panel.port && (await portTaken(p))) bad(`Cổng ${p} đang được dùng.`);
    if (task?.running) bad(`Đang chạy "${task.name}". Đợi nó xong đã.`);
    writeJson(PANEL_FILE, { ...panel, port: p });
    // the firewall (and the panel's domain, if it has one) follow; then this panel moves to the new port
    startTask("apply", { APPLY: "panel" }, () => restartSoon());
    return send(res, 200, { ok: true, port: p });
  }
  return send(res, 404, { error: "Không có" });
}

const DUMMY = await hashPw(crypto.randomBytes(12).toString("hex"));
const ai = createAi({ ETC, loadState, loadPanel, sh, send, readBody, bad, clientIp });

function serve() {
  const panel = loadPanel();
  if (!panel) {
    console.error(`Chưa có ${PANEL_FILE}. Chạy: dvtt-panel init --port <cổng> --user <tên>`);
    process.exit(1);
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) return await ai.mcp(req, res, url);
      if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Không được");
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e instanceof Bad) return send(res, 400, { error: e.message });
      console.error(e);
      return send(res, 500, { error: "Lỗi máy chủ bảng điều khiển: " + e.message });
    }
  });
  server.headersTimeout = 20000;
  server.requestTimeout = 120000;
  server.listen(panel.port, process.env.PANEL_HOST ?? "0.0.0.0", () => console.log(`Bảng điều khiển: http://0.0.0.0:${panel.port}`));
  setInterval(() => {
    for (const [k, s] of sessions) if (s.exp < Date.now()) sessions.delete(k);
  }, 60_000).unref();
  // past tasks' logs, so the list survives a restart
  try {
    for (const f of readdirSync(LOGS).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 30)) history.push(readJson(join(LOGS, f), null));
    history.splice(0, history.length, ...history.filter(Boolean));
  } catch {}
}

// ---------------------------------------------------------------- the command line
const args = process.argv.slice(2);
// `dvtt-panel status | head`: a closed pipe is not an error
process.stdout.on("error", (e) => e.code === "EPIPE" && process.exit(0));
const opt = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? s : "");
    rl.question(q, (a) => (rl.close(), hidden && process.stdout.write("\n"), resolve(a)));
  });
}
async function cli() {
  const cmd = args[0];
  if (!cmd || cmd === "serve") return serve();
  if (cmd === "init") {
    const p = port(opt("port"), "Cổng bảng điều khiển"), user = opt("user") ?? "admin";
    if (!USER_RE.test(user)) bad("Tên đăng nhập: 3-32 ký tự chữ, số, dấu . _ -");
    const pass = opt("pass") ?? process.env.PANEL_PASS;
    if (!pass || pass.length < 10) bad("Mật khẩu bảng điều khiển: ít nhất 10 ký tự.");
    writeJson(PANEL_FILE, { port: p, user, hash: await hashPw(pass), created: Date.now() });
    const s = loadState();
    if (opt("dir")) s.dir = opt("dir");
    if (opt("repo")) s.repo = opt("repo");
    if (opt("branch")) s.branch = opt("branch");
    saveState(s);
    console.log(`✔  Đã lưu cấu hình bảng điều khiển (${PANEL_FILE}): cổng ${p}, tài khoản ${user}.`);
    return;
  }
  if (cmd === "passwd") {
    const panel = loadPanel() ?? bad("Chưa cài bảng điều khiển.");
    const user = opt("user") ?? panel.user;
    if (!USER_RE.test(user)) bad("Tên đăng nhập: 3-32 ký tự chữ, số, dấu . _ -");
    let pass = process.env.PANEL_PASS;
    if (!pass) {
      pass = await ask("Mật khẩu mới (ít nhất 10 ký tự): ", true);
      if ((await ask("Nhập lại: ", true)) !== pass) bad("Hai lần nhập không giống nhau.");
    }
    if (pass.length < 10) bad("Mật khẩu: ít nhất 10 ký tự.");
    writeJson(PANEL_FILE, { ...panel, user, hash: await hashPw(pass) });
    await sh("systemctl", ["restart", "dvtt-panel"]);
    console.log(`✔  Đã đổi: đăng nhập bằng "${user}" và mật khẩu mới (mọi phiên cũ đã bị đăng xuất).`);
    return;
  }
  if (cmd === "port") {
    const panel = loadPanel() ?? bad("Chưa cài bảng điều khiển.");
    const p = port(args[1], "Cổng bảng điều khiển");
    writeJson(PANEL_FILE, { ...panel, port: p });
    await cliTask("apply", { APPLY: "panel" });
    await sh("systemctl", ["restart", "dvtt-panel"]);
    console.log(`✔  Bảng điều khiển giờ ở cổng ${p}.`);
    return;
  }
  if (cmd === "run") {
    const key = args[1];
    if (!TASK_DEFS[key]) bad(`Tác vụ: ${Object.keys(TASK_DEFS).join(", ")}`);
    const extra = {};
    if (key === "adminpw") extra.ADMIN_PASS = process.env.ADMIN_PASS ?? (await ask("Mật khẩu admin game (8-72 ký tự): ", true));
    if (key === "setup" && process.env.ADMIN_PASS) extra.ADMIN_PASS = process.env.ADMIN_PASS;
    if (["adminpw", "setup"].includes(key)) extra.ADMIN_USER = loadState().adminUser;
    if (key === "backup") extra.ACTION = "create";
    if (key === "backup-timer") extra.ACTION = "timer";
    if (key === "restore") Object.assign(extra, { ACTION: "restore", BACKUP_FILE: args[2] ?? "" });
    process.exitCode = await cliTask(key, extra);
    return;
  }
  if (cmd === "set") {
    // dvtt-panel set key=value ... : the same checks as the page
    const input = {};
    for (const a of args.slice(1)) {
      const i = a.indexOf("=");
      if (i < 1) bad(`"${a}": dùng dạng khoá=giá trị`);
      const k = a.slice(0, i), v = a.slice(i + 1);
      input[k] = v === "true" ? true : v === "false" ? false : v;
    }
    const s = checkState(input, loadState());
    saveState(s);
    console.log("✔  Đã lưu. Chạy \"dvtt-panel run apply\" để áp dụng.");
    return;
  }
  if (cmd === "status") {
    const s = loadState(), p = loadPanel();
    console.log(JSON.stringify({ panel: { port: p?.port, user: p?.user }, state: s }, null, 2));
    for (const u of ["dvtt", "mariadb", "caddy", "nginx", "dvtt-panel"]) {
      const st = await unitState(u);
      if (st.installed) console.log(`${u.padEnd(12)} ${st.active}`);
    }
    return;
  }
  bad("Lệnh: serve | init | passwd | port <cổng> | run <tác vụ> | set khoá=giá-trị… | status");
}
/** A task from the command line: its output straight to the terminal. */
function cliTask(key, extra) {
  return new Promise((resolve) => {
    const s = loadState();
    const child = spawn("bash", [join(TASKS, TASK_DEFS[key].file)], { env: taskEnv(s, extra), stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0 && TASK_DEFS[key].marks) {
        const st = loadState();
        st.done = { ...st.done };
        for (const m of TASK_DEFS[key].marks) st.done[m] = Date.now();
        if (key === "setup") {
          if (extra.ADMIN_PASS) st.done.adminpw = Date.now();
          if (st.proxy !== "none" && st.domain) st.done.proxy = Date.now();
          if (st.firewall) st.done.firewall = Date.now();
        }
        saveState(st);
      }
      resolve(code ?? 1);
    });
  });
}

cli().catch((e) => {
  console.error(e instanceof Bad ? `✖  ${e.message}` : e);
  process.exit(1);
});
