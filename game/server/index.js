// Đa vũ trụ tu tiên: the server. Express serves the game and its API, ws carries the live world, MariaDB keeps the saves.
import http from "node:http";
import { join } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { config, ROOT } from "./config.js";
import { migrate, pool } from "./db.js";
import { api } from "./api.js";
import { World } from "./world.js";
import { loadConfig, watchConfig } from "./gameconfig.js";
import { adminApp, adminMigrate } from "./admin.js";

await migrate();
// the game's numbers from the database; if they're broken at start, run on the built-in defaults and say why
try {
  await loadConfig();
} catch (e) {
  console.error("config: database có số liệu không hợp lệ, tạm dùng số liệu mặc định:", e.message);
}
await adminMigrate();
const world = new World();
watchConfig(() => world.onConfig());
const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
});

app.use("/api", api(world));
app.get("/health", (req, res) => res.json({ ok: true, online: world.online }));
const statics = { maxAge: "1h", index: false, fallthrough: true };
app.use("/shared", express.static(join(ROOT, "shared"), statics));
// the pixel effects and sprites come straight from the pixelfx library this game lives in
app.use("/pixelfx", express.static(join(ROOT, "..", "src"), statics));
app.use(express.static(join(ROOT, "public"), { ...statics, index: "index.html", maxAge: 0 }));
app.use((req, res) => res.status(404).json({ error: "Không tìm thấy." }));

const server = http.createServer(app);
// only pages served from this host (or listed in ALLOWED_ORIGINS) may open the game socket
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 2048,
  verifyClient: ({ origin, req }) => {
    if (!origin) return true; // not a browser
    try {
      const o = new URL(origin);
      return o.host === req.headers.host || config.allowedOrigins.includes(origin);
    } catch {
      return false;
    }
  },
});
wss.on("connection", (ws) => world.attach(ws));
// drop connections that stopped answering
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 20000).unref();
wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
});

server.listen(config.port, config.host, () => console.log(`Đa vũ trụ tu tiên chạy ở http://${config.host}:${config.port}`));
// the admin site on its own port
const adminServer = http.createServer(adminApp(world));
adminServer.listen(config.adminPort, config.adminHost, () => console.log(`Trang admin chạy ở http://${config.adminHost}:${config.adminPort}`));

let stopping = false;
async function stop(sig) {
  if (stopping) return;
  stopping = true;
  console.log(`${sig}: lưu dữ liệu và tắt máy chủ...`);
  const force = setTimeout(() => process.exit(1), 10000);
  try {
    await world.shutdown();
    wss.close();
    server.close();
    adminServer.close();
    await pool.end();
  } catch (e) {
    console.error(e);
  }
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
