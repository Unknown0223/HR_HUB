"""One-off: login to Verifix with env credentials and dump list-form columns.
Credentials via VERIFIX_LOGIN / VERIFIX_PASSWORD only — never hardcode.
Output: data/verifix-dump/live/form_columns_scan.json (+ form HTML)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = "https://app2.verifix.com"
OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
OUT.mkdir(parents=True, exist_ok=True)

LOGIN = os.environ.get("VERIFIX_LOGIN", "")
PASSWORD = os.environ.get("VERIFIX_PASSWORD", "")
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VERIFIX_LOGIN and VERIFIX_PASSWORD")

FORMS = [
    "/vhr/htt/request_list",
    "/vhr/hpd/timeoff_list",
    "/vhr/href/employee/employee_list",
    "/vhr/intro/dashboard",
    "/vhr/htt/track_list",
    "/vhr/htt/location_list",
    "/vhr/htt/device_list",
    "/vhr/htt/schedule_list",
    "/vhr/hrm/division_list",
    "/vhr/hrm/job_list",
    "/vhr/href/person/person_list",
    "/vhr/htt/request_kind_list",
    "/vhr/hpd/application/application_list",
]


def parse_cols(html: str) -> tuple[list[str], dict[str, str]]:
    cols: list[str] = []
    for blob in re.findall(r'(?:required|extra-columns)="([^"]+)"', html):
        for part in re.split(r"[,\s]+", blob):
            if part and re.match(r"^[A-Za-z][A-Za-z0-9_]*$", part) and part not in cols:
                cols.append(part)
    for name in re.findall(r'<b-col[^>]*name="([A-Za-z0-9_]+)"', html):
        if name not in cols:
            cols.append(name)
    labels: dict[str, str] = {}
    for m in re.finditer(
        r'<b-col[^>]*name="([A-Za-z0-9_]+)"[^>]*>(.*?)</b-col>', html, re.S
    ):
        lab = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if lab:
            labels[m.group(1)] = lab
    for m in re.finditer(
        r'<b-col[^>]*name="([A-Za-z0-9_]+)"[^>]*label="([^"]+)"', html
    ):
        labels[m.group(1)] = m.group(2)
    # title attrs / translate keys often in {{ }} — keep raw name if no label
    return cols, labels


def main() -> None:
    cj = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
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
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with opener.open(req, timeout=30) as resp:
        print("login", resp.read().decode()[:240])

    # session with menu
    payload = json.dumps({"with_menu": "Y"}).encode()
    req = urllib.request.Request(
        BASE + "/b/biruni/m:session",
        data=payload,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": BASE + "/",
            "Origin": BASE,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "filial_id": "88862",
        },
    )
    with opener.open(req, timeout=60) as resp:
        sess = json.loads(resp.read().decode("utf-8", "replace"))
    print(
        "session",
        sess.get("company_name"),
        sess.get("user", {}).get("name") if isinstance(sess.get("user"), dict) else None,
    )
    (OUT / "session_menu.json").write_text(
        json.dumps(sess, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    results: dict = {}
    for path in FORMS:
        url = BASE + "/page/form" + path + ".html"
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"}
        )
        try:
            with opener.open(req, timeout=30) as resp:
                html = resp.read().decode("utf-8", "replace")
                code = resp.status
        except urllib.error.HTTPError as e:
            html = e.read().decode("utf-8", "replace")
            code = e.code
        except Exception as e:
            html = str(e)
            code = 0
        (OUT / ("form" + path.replace("/", "_") + ".html")).write_text(
            html, encoding="utf-8"
        )
        cols, labels = parse_cols(html) if code == 200 else ([], {})
        print(path, code, "cols", len(cols), cols[:18])
        results[path] = {"status": code, "columns": cols, "labels": labels}

    (OUT / "form_columns_scan.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("WROTE", OUT / "form_columns_scan.json")


if __name__ == "__main__":
    main()
