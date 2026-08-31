from pathlib import Path
import hashlib
import json
import os
import urllib.error
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
            print("login", resp.read()[:60])

    def get(self, path: str):
        req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"})
        try:
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def post_json(self, path: str, obj):
        body = json.dumps(obj).encode()
        req = urllib.request.Request(
            BASE + path,
            data=body,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": BASE + "/",
                "Origin": BASE,
                "Content-Type": "application/json",
            },
        )
        try:
            with self.opener.open(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def main():
    c = Client()
    paths = [
        "/page/vhr/href/employee/employee_list.html",
        "/page/vhr/href/employee/employee_list",
        "/vhr/href/employee/employee_list.html",
        "/page/resource/vhr/href/employee/employee_list.html",
        "/b/vhr/href/employee/employee_list",
    ]
    for p in paths:
        st, raw = c.get(p)
        print("GET", p, st, len(raw), raw[:80].decode("utf-8", "replace").replace("\n", " "))

    payload = {
        "p": {
            "column": ["employee_id", "name", "staff_number", "division_name", "job_name"],
            "filter": [],
            "sort": [],
            "offset": 0,
            "limit": 5,
        }
    }
    for p in [
        "/b/vhr/href/employee/employee_list:table",
        "/b/vhr/href/employee/employee_list:employees",
        "/b/vhr/href/employee/employee_list",
    ]:
        st, raw = c.post_json(p, payload)
        print("POST", p, st, len(raw), raw[:250].decode("utf-8", "replace"))


if __name__ == "__main__":
    main()
