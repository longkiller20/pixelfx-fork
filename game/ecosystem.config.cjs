// pm2 start ecosystem.config.cjs
// One instance only: the game world lives in this process's memory (see README, "Mở rộng").
module.exports = {
  apps: [{
    name: "dvtt",
    script: "server/index.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "512M",
    kill_timeout: 12000,
    env: { NODE_ENV: "production" },
  }],
};
