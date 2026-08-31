"""Login to live Verifix (Biruni) and probe session. Credentials via env, never printed."""
from __future__ import annotations

import hashlib
import json
import os
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://app2.verifix.com"
LOGIN = os.environ.get("VF_LOGIN") or os.environ.get("VERIFIX_LOGIN") or ""
PASSWORD = os.environ.get("VF_PASSWORD") or os.environ.get("VERIFIX_PASSWORD") or ""
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VF_LOGIN/VF_PASSWORD (or VERIFIX_LOGIN/VERIFIX_PASSWORD)")


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class Client:
    def __init__(self):
        self.cj = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))

    def request(self, method: str, path: str, data=None, headers=None, json_body=None):
        url = path if path.startswith("http") else BASE + path
        hdrs = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            "Origin": BASE,
            "Referer": BASE + "/login.html",
        }
        if headers:
            hdrs.update(headers)
        body = None
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            hdrs["Content-Type"] = "application/json"
        elif data is not None:
            body = urllib.parse.urlencode(data).encode("utf-8")
            hdrs["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with self.opener.open(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, dict(resp.headers), raw
        except urllib.error.HTTPError as e:
            raw = e.read()
            return e.code, dict(e.headers), raw


def main():
    c = Client()
    st, hdrs, raw = c.request("GET", "/auth_bundle")
    print("auth_bundle", st, raw[:400])
    (OUT / "auth_bundle.txt").write_bytes(raw)

    pwd_hash = sha1(PASSWORD)
    print("sha1_len", len(pwd_hash))
    st, hdrs, raw = c.request(
        "POST",
        "/b/biruni/s$log_in",
        data={"login": LOGIN, "password": pwd_hash, "lang_code": "ru"},
    )
    print("login", st, "ctype", hdrs.get("Content-Type"), "len", len(raw))
    print("login_body", raw[:1500].decode("utf-8", "replace"))
    (OUT / "login.json").write_bytes(raw)
    cookies = {ck.name: ck.value for ck in c.cj}
    print("cookies", list(cookies.keys()))
    (OUT / "cookies.json").write_text(json.dumps(cookies, indent=2), encoding="utf-8")

    for path in [
        "/b/biruni/m:home_page_url",
        "/b/session",
        "/index.html",
        "/main.html",
        "/b/biruni/s$session",
        "/b/biruni/q$session",
    ]:
        st, hdrs, raw = c.request("GET", path)
        print("GET", path, st, len(raw), raw[:120].decode("utf-8", "replace").replace("\n", " "))


if __name__ == "__main__":
    main()
