const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function runScript(script) {
  return spawn(npmCmd, ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
}

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
