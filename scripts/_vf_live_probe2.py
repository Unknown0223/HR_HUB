from pathlib import Path
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
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
            print("login", resp.read().decode())

    def call(self, method, path, body=None, headers=None, content_type=None):
        hdrs = {
            "User-Agent": "Mozilla/5.0",
            "Referer": BASE + "/",
            "Origin": BASE,
            "filial_id": "88862",
            "lang_code": "ru",
            "project_code": "vhr",
        }
        if content_type:
            hdrs["Content-Type"] = content_type
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(BASE + path, data=body, headers=hdrs, method=method)
        try:
            with self.opener.open(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, raw
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def show(label, st, raw):
    t = raw.decode("utf-8", "replace")[:350].replace("\n", " | ")
    print(f"{label} {st} {t}")


def main():
    c = Client()
    st, raw = c.call("POST", "/b/biruni/s$check_session", b"", content_type="application/x-www-form-urlencoded")
    show("check_session", st, raw)
    (OUT / "check_session.json").write_bytes(raw)

    cols = ["employee_id", "name", "employee_number", "division_name", "job_name"]
    payload = {"p": {"column": cols, "filter": [], "sort": [], "offset": 0, "limit": 3}}
    j = json.dumps(payload, ensure_ascii=False).encode()
    p_only = json.dumps(payload["p"], ensure_ascii=False)

    attempts = [
        ("json_body", "POST", "/b/vhr/href/employee/employee_list:table", j, "application/json"),
        ("form_p", "POST", "/b/vhr/href/employee/employee_list:table", urllib.parse.urlencode({"p": p_only}).encode(), "application/x-www-form-urlencoded"),
        ("form_data", "POST", "/b/vhr/href/employee/employee_list:table", urllib.parse.urlencode({"data": json.dumps(payload)}).encode(), "application/x-www-form-urlencoded"),
        ("form_param", "POST", "/b/vhr/href/employee/employee_list:table", urllib.parse.urlencode({"param": json.dumps(payload)}).encode(), "application/x-www-form-urlencoded"),
        ("json_p_root", "POST", "/b/vhr/href/employee/employee_list:table", json.dumps(payload["p"]).encode(), "application/json"),
        ("form_empty", "POST", "/b/vhr/href/employee/employee_list:table", b"", "application/x-www-form-urlencoded"),
        ("session_form", "POST", "/b/biruni/m:session", urllib.parse.urlencode({"with_menu": "Y"}).encode(), "application/x-www-form-urlencoded"),
    ]
    for label, method, path, body, ctype in attempts:
        st, raw = c.call(method, path, body=body, content_type=ctype)
        show(label, st, raw)


if __name__ == "__main__":
    main()
