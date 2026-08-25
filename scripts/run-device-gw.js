const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const gwDir = path.join(root, "apps", "device-gw");
const winPy = path.join(gwDir, ".venv", "Scripts", "python.exe");
const unixPy = path.join(gwDir, ".venv", "bin", "python");
const python = fs.existsSync(winPy) ? winPy : unixPy;

if (!fs.existsSync(python)) {
  console.error(
    "Device GW venv topilmadi. Avval: cd apps/device-gw && python -m venv .venv && pip install -r requirements.txt",
  );
  process.exit(1);
}

function readGwPort() {
  if (process.env.DEVICE_GW_PORT) return String(process.env.DEVICE_GW_PORT);
  for (const envPath of [path.join(root, ".env"), path.join(gwDir, ".env")]) {
    if (!fs.existsSync(envPath)) continue;
    const m = fs.readFileSync(envPath, "utf8").match(/^DEVICE_GW_PORT=(\d+)/m);
    if (m) return m[1];
  }
  return "8800";
}

const port = readGwPort();
const child = spawn(
  python,
  ["-m", "uvicorn", "main:app", "--port", String(port), "--reload"],
  { cwd: gwDir, stdio: "inherit", shell: false },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
