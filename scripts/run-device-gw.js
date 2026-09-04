const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const gwDir = path.join(root, "apps", "device-gw");
const winPy = path.join(gwDir, ".venv", "Scripts", "python.exe");
const unixPy = path.join(gwDir, ".venv", "bin", "python");

function pythonWorks(exe) {
  if (!exe || !fs.existsSync(exe)) return false;
  try {
    const r = spawnSync(exe, ["--version"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function launcherWorks(cmd, args = ["-3", "--version"]) {
  try {
    const r = spawnSync(cmd, args, {
      encoding: "utf8",
      timeout: 8000,
      shell: false,
      windowsHide: true,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Resolve a working Python for device-gw (venv preferred). */
function resolvePython() {
  if (pythonWorks(winPy)) return { exe: winPy, args: [] };
  if (pythonWorks(unixPy)) return { exe: unixPy, args: [] };

  if (process.platform === "win32") {
    if (launcherWorks("py", ["-3", "--version"])) {
      return { exe: "py", args: ["-3"] };
    }
    if (launcherWorks("python", ["--version"])) {
      return { exe: "python", args: [] };
    }
  } else {
    for (const cmd of ["python3", "python"]) {
      if (launcherWorks(cmd, ["--version"])) {
        return { exe: cmd, args: [] };
      }
    }
  }

  return null;
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

const resolved = resolvePython();
if (!resolved) {
  console.warn(
    "[device-gw] Python topilmadi — gateway o‘tkazib yuborildi (Face ID terminal sync: cd apps/device-gw && py -3 -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt)",
  );
  process.exit(0);
}

if (!pythonWorks(winPy) && !pythonWorks(unixPy)) {
  console.warn(
    "[device-gw] .venv buzilgan yoki yo‘q — tizim Python ishlatiladi. Doimiy yechim: cd apps/device-gw && py -3 -m venv --clear .venv && .venv\\Scripts\\pip install -r requirements.txt",
  );
}

const port = readGwPort();
const uvicornArgs = [
  ...resolved.args,
  "-m",
  "uvicorn",
  "main:app",
  "--port",
  String(port),
  "--reload",
];

const child = spawn(resolved.exe, uvicornArgs, {
  cwd: gwDir,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
