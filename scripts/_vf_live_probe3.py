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
AUTH = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
    "Referer": BASE + "/",
    "Origin": BASE,
    "Accept": "application/json, text/plain, */*",
    "filial_id": "88862",
    "lang_code": "ru",
    "project_code": "vhr",
    "project_hash": "1",
    "user_id": "90339",
}


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
            headers={"User-Agent": AUTH["User-Agent"], "Content-Type": "application/x-www-form-urlencoded"},
        )
        with self.opener.open(req, timeout=30) as resp:
            print("login", resp.read().decode())

    def call(self, path, body=None, extra=None, method="POST", ctype="application/json;charset=UTF-8"):
        hdrs = dict(AUTH)
        if ctype:
            hdrs["Content-Type"] = ctype
        if extra:
            hdrs.update(extra)
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(BASE + path, data=body, headers=hdrs, method=method)
        try:
            with self.opener.open(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def show(label, st, raw):
    t = raw.decode("utf-8", "replace")[:400].replace("\n", " | ")
    print(f"{label} {st} {t}")


def main():
    c = Client()
    st, raw = c.call("/b/biruni/m:session", {"with_menu": "N"})
    show("session", st, raw)

    st, raw = c.call("/page/form/vhr/href/employee/employee_list.html", method="GET", ctype=None, body=None)
    show("form_html", st, raw[:80] if False else raw)

    payload = {"p": {"column": ["employee_id", "name"], "filter": [], "sort": [], "offset": 0, "limit": 3}}
    attempts = [
        ("model_empty", "/b/vhr/href/employee/employee_list:model", {}, {"formurl": "/vhr/href/employee/employee_list?"}),
        ("model_d", "/b/vhr/href/employee/employee_list:model", {"d": {}}, {"formurl": "/vhr/href/employee/employee_list?"}),
        ("dollar_model", "/b/vhr/href/employee/employee_list$model", {"d": {}}, {"formurl": "/vhr/href/employee/employee_list?"}),
        ("table_after", "/b/vhr/href/employee/employee_list:table", payload, None),
        ("table_d", "/b/vhr/href/employee/employee_list:table", {"d": {}, "p": payload["p"]}, None),
        ("load_grid", "/b/biruni/m:load_grid_data", {"form": "/vhr/href/employee/employee_list", "query": "table", **payload}, None),
        ("search_form", "/b/biruni/m:search_form_query", {"path": "/vhr/href/employee/employee_list", **payload}, None),
        ("search_q", "/b/biruni/m:search_query", {"path": "/vhr/href/employee/employee_list", **payload}, None),
    ]
    for label, path, body, extra in attempts:
        st, raw = c.call(path, body=body, extra=extra)
        show(label, st, raw)
        (OUT / f"probe_{label}.txt").write_bytes(raw[:4000])


if __name__ == "__main__":
    main()
