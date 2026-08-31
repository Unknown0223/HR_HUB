#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import urllib.parse

os.chdir("/mnt/d/hr-hub")
raw = subprocess.check_output(
    [
        "bash",
        "-lc",
        'source "$HOME/.railway/env"; railway variables --service "@hr-hub/api" --json',
    ],
    text=True,
)
vars_ = json.loads(raw)
url = vars_.get("DATABASE_PUBLIC_URL") or vars_.get("DATABASE_URL") or ""
print(
    "has_public",
    bool(vars_.get("DATABASE_PUBLIC_URL")),
    "has_db",
    bool(vars_.get("DATABASE_URL")),
    "keys",
    sorted(k for k in vars_ if "DATABASE" in k or "POSTGRES" in k),
)
parsed = urllib.parse.urlparse(url)
print("url_host", parsed.hostname, "url_len", len(url))
open("/tmp/hrhub_db_url", "w").write(url)
