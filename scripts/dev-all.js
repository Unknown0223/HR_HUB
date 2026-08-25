const { spawn, execSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const root = path.join(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function readEnvPort() {
  const envPath = path.join(root, ".env");
  let port = 5430;
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    const m =
      text.match(/^POSTGRES_PORT=(\d+)/m) ||
      text.match(/127\.0\.0\.1:(\d+)/);
    if (m) port = Number(m[1]);
  }
  return port;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 90000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Postgres ${host}:${port} tayyor bo‘lmadi`));
          return;
        }
        setTimeout(tryOnce, 1000);
      });
    };
    tryOnce();
  });
}

function runScript(script) {
  return spawn(npmCmd, ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
}

async function main() {
  console.log("→ Infra (Docker)...");
  execSync(
    "docker compose -f infra/docker-compose.yml --env-file .env up -d",
    { cwd: root, stdio: "inherit", shell: true },
  );

  const pgPort = readEnvPort();
  console.log(`→ Postgres kutilyapti (${pgPort})...`);
  await waitForPort(pgPort);
  console.log("→ API + Web + Device GW...");

  const procs = ["dev:api", "dev:web", "dev:gw"].map(runScript);
  let exiting = false;

  const shutdown = (code = 0) => {
    if (exiting) return;
    exiting = true;
    for (const p of procs) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], {
            stdio: "ignore",
            shell: true,
          });
        } else if (!p.killed) {
          p.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => process.exit(code), 800);
  };

  for (const p of procs) {
    p.on("exit", (code, signal) => {
      if (exiting) return;
      if (signal || (code && code !== 0)) {
        console.error(`Bir servis to‘xtadi (code=${code}). Qolganlari yopilmoqda...`);
        shutdown(code || 1);
      }
    });
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
