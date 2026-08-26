import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "apps/api/.env.railway.db").read_text(encoding="utf-8").strip()
u = urlsplit(raw)
userinfo = u.netloc.split("@")[0]
url = f"postgresql://{userinfo}@caboose.proxy.rlwy.net:55160{u.path}"
env = os.environ.copy()
env["DATABASE_URL"] = url
print("RAILWAY_IMPORT_START", flush=True)
r = subprocess.run(
    ["node", "scripts/import-verifix-dump.js"],
    cwd=str(ROOT / "apps/api"),
    env=env,
)
sys.exit(r.returncode)
