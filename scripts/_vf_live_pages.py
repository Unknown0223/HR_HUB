from pathlib import Path
import hashlib
import json
import os
import sys
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
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


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
    for p in [
        "/page/form/vhr/href/employee/employee_list.html",
        "/page/lang/ru/vhr/href/employee/employee_list.json",
        "/page/form/vhr/hrm/division_list.html",
        "/page/form/vhr/hrm/job_list.html",
        "/page/form/vhr/hrm/robot_list.html",
        "/page/form/vhr/htt/track_list.html",
        "/page/form/vhr/htt/device_list.html",
        "/page/form/vhr/htt/location_list.html",
        "/page/form/vhr/htt/schedule_list.html",
        "/page/form/vhr/href/person/person_list.html",
    ]:
        st, raw = c.get(p)
        name = p.replace("/page/", "").replace("/", "_")
        (OUT / name).write_bytes(raw)
        print("GET", p, st, len(raw))

    html = (OUT / "form_vhr_href_employee_employee_list.html").read_text(encoding="utf-8", errors="replace")
    (OUT / "employee_list_snip.txt").write_text(html[:8000], encoding="utf-8")
    print("html_head", html[:500].replace("\n", " "))


if __name__ == "__main__":
    main()
