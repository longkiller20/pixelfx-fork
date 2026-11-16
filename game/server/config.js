// Settings from the environment, with a .env file next to package.json read first if there is one.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = (k, d) => process.env[k] ?? d;
export const config = {
  port: Number(env("PORT", 5886)),
  host: env("HOST", "0.0.0.0"),
  db: {
    host: env("DB_HOST", "127.0.0.1"),
    port: Number(env("DB_PORT", 3306)),
    user: env("DB_USER", "dvtt"),
    password: env("DB_PASS", ""),
    database: env("DB_NAME", "dvtt"),
    connectionLimit: Number(env("DB_POOL", 10)),
  },
  // behind nginx or another proxy: set TRUST_PROXY=1 so rate limits see the real client address
  trustProxy: env("TRUST_PROXY", "0") === "1",
  // extra origins allowed to open the WebSocket, comma separated (the page's own origin is always allowed)
  allowedOrigins: env("ALLOWED_ORIGINS", "").split(",").map((s) => s.trim()).filter(Boolean),
  sessionDays: Number(env("SESSION_DAYS", 7)),
};
