from pathlib import Path
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
BASE = "https://app2.verifix.com"
LOGIN = os.environ.get("VF_LOGIN") or os.environ.get("VERIFIX_LOGIN") or ""
PASSWORD = os.environ.get("VF_PASSWORD") or os.environ.get("VERIFIX_PASSWORD") or ""
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VF_LOGIN/VF_PASSWORD (or VERIFIX_LOGIN/VERIFIX_PASSWORD)")
FILES = [
    "/biruni/main.js?_=20260818T122",
    "/page/resource/vhr/module.js?_=20260818T122",
    "/page/resource/vhr/module.css?_=20260818T122",
]


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

    def get(self, path: str):
        req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"})
        with self.opener.open(req, timeout=60) as resp:
            return resp.read()


def main():
    c = Client()
    for path in FILES:
        raw = c.get(path)
        name = path.split("/")[-1].split("?")[0]
        (OUT / name).write_bytes(raw)
        text = raw.decode("utf-8", "replace")
        print(name, len(raw))
        forms = sorted(set(re.findall(r"[a-z0-9_]+(?::[a-z0-9_]+)+", text, flags=re.I)))
        qnames = sorted(set(re.findall(r"(?:q\$|m\$|s\$)[a-z0-9_$:]+", text, flags=re.I)))
        print(" dotted", len(forms), "q$", len(qnames))
        (OUT / f"{name}.forms.txt").write_text("\n".join(forms[:500]), encoding="utf-8")
        (OUT / f"{name}.q.txt").write_text("\n".join(qnames), encoding="utf-8")
        for x in qnames[:40]:
            print(" ", x)
        emp = [f for f in forms if re.search(r"emp|staff|person|divis|org|mark|attend", f, re.I)]
        print(" emp-like", emp[:40])


if __name__ == "__main__":
    main()
