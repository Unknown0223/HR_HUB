from pathlib import Path
import hashlib
import json
import os
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://app2.verifix.com"
LOGIN = os.environ.get("VF_LOGIN") or os.environ.get("VERIFIX_LOGIN") or ""
PASSWORD = os.environ.get("VF_PASSWORD") or os.environ.get("VERIFIX_PASSWORD") or ""
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VF_LOGIN/VF_PASSWORD (or VERIFIX_LOGIN/VERIFIX_PASSWORD)")


class Client:
    def __init__(self):
        self.cj = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))

    def login(self):
        body = urllib.parse.urlencode(
            {
                "login": LOGIN,
                "password": hashlib.sha1(PASSWORD.encode()).hexdigest(),
                "lang_code": "ru",
            }
        ).encode()
        req = urllib.request.Request(
            BASE + "/b/biruni/s$log_in",
            data=body,
            headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"},
        )
        with self.opener.open(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    def get(self, path: str):
        req = urllib.request.Request(
            BASE + path,
            headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"},
        )
        with self.opener.open(req, timeout=30) as resp:
            return resp.status, resp.read()


def main():
    c = Client()
    print("login", c.login())
    st, raw = c.get("/")
    (OUT / "index.html").write_bytes(raw)
    text = raw.decode("utf-8", "replace")
    print("index", st, len(text))
    srcs = re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", text)
    (OUT / "index-assets.txt").write_text("\n".join(srcs), encoding="utf-8")
    for s in srcs:
        print(s)
    # JS mentions of biruni endpoints
    hits = sorted(set(re.findall(r"b/biruni/[a-zA-Z0-9_$:.-]+", text)))
    print("inline biruni", hits[:50], "count", len(hits))


if __name__ == "__main__":
    main()
