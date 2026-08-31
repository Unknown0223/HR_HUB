from pathlib import Path
import hashlib
import json
import os
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
BASE = "https://app2.verifix.com"
LOGIN = os.environ.get("VF_LOGIN") or os.environ.get("VERIFIX_LOGIN") or ""
PASSWORD = os.environ.get("VF_PASSWORD") or os.environ.get("VERIFIX_PASSWORD") or ""
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VF_LOGIN/VF_PASSWORD (or VERIFIX_LOGIN/VERIFIX_PASSWORD)")


class Client:
    def __init__(self):
        self.cj = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        body = urllib.parse.urlencode(
            {
                "login": LOGIN,
                "password": hashlib.sha1(PASSWORD.encode("utf-8")).hexdigest(),
                "lang_code": "ru",
            }
        ).encode()
        req = urllib.request.Request(
            BASE + "/b/biruni/s$log_in",
            data=body,
            headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"},
        )
        with self.opener.open(req, timeout=30) as resp:
            print("login", resp.read()[:80])

    def post(self, path: str, data=None, json_body=None):
        hdrs = {"User-Agent": "Mozilla/5.0", "Referer": BASE + "/", "Origin": BASE}
        body = None
        if json_body is not None:
            body = json.dumps(json_body).encode()
            hdrs["Content-Type"] = "application/json"
        elif data is not None:
            body = urllib.parse.urlencode(data, doseq=True).encode()
            hdrs["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(BASE + path, data=body or b"", headers=hdrs, method="POST")
        try:
            with self.opener.open(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def main():
    c = Client()
    st, raw = c.post("/b/biruni/m:session")
    print("session", st, len(raw))
    (OUT / "session.json").write_bytes(raw)
    try:
        data = json.loads(raw)
    except Exception:
        print(raw[:500])
        return
    keys = list(data.keys()) if isinstance(data, dict) else type(data)
    print("keys", keys if isinstance(keys, list) else keys)
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, (list, dict)):
                print(k, type(v).__name__, len(v) if hasattr(v, "__len__") else "")
            else:
                print(k, v)


if __name__ == "__main__":
    main()
