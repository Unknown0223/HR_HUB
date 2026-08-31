"""Dump live Verifix (Biruni) tables for OOO World of Trade / lalaku.

Auth: VERIFIX_LOGIN / VERIFIX_PASSWORD env, or the session defaults used for this dump.
Do not commit credentials. Output is gitignored under data/verifix-dump/.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from http.cookiejar import CookieJar
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump" / "live"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://app2.verifix.com"
FILIAL = "88862"
LOGIN = os.environ.get("VERIFIX_LOGIN", "")
PASSWORD = os.environ.get("VERIFIX_PASSWORD", "")
_cred = OUT / "credentials.json"
if (not LOGIN or not PASSWORD) and _cred.exists():
    _c = json.loads(_cred.read_text(encoding="utf-8"))
    LOGIN = LOGIN or _c.get("login") or ""
    PASSWORD = PASSWORD or _c.get("password") or ""
if not LOGIN or not PASSWORD:
    raise SystemExit("Set VERIFIX_LOGIN/VERIFIX_PASSWORD or data/verifix-dump/live/credentials.json")

EMP_COLS = [
    "employee_id", "name", "staff_id", "employee_number", "last_name", "first_name", "middle_name",
    "gender", "gender_name", "birthday", "main_phone", "email", "npin", "tin", "passport_info",
    "division_id", "division_name", "job_id", "job_name", "schedule_name", "manager_name",
    "hiring_date", "first_hiring_date", "dismissal_date", "dismissal_reason_name", "status", "status_name",
    "wage", "rank_name", "region_name", "address", "legal_address", "login", "pin", "rfid_code",
    "employment_type_name", "org_unit_name", "robot_id", "robot_name", "photo_sha", "note",
    "qr_code", "code", "org_unit_id",
]
DIV_COLS = [
    "division_id", "name", "code", "manager_name", "division_group_name", "opened_date", "closed_date",
    "parent_id", "schedule_names", "order_no", "state_name",
]
JOB_COLS = ["job_id", "name", "code", "job_group_name", "order_no", "division_names"]
ROBOT_COLS = [
    "robot_id", "name", "code", "division_id", "division_name", "job_id", "job_name",
    "rank_name", "employee_names", "employee_ids", "opened_date", "closed_date",
    "schedule_name", "fte", "wage", "org_unit_name",
]
TRACK_COLS = [
    "track_id", "track_date", "person_name", "track_time", "original_type", "modified_track_type",
    "is_valid", "location_name", "device_name", "device_type_name", "track_type_name", "mark_type_name",
    "division_name", "job_name", "note", "person_id", "device_id", "status_name",
]
DEVICE_COLS = [
    "device_id", "name", "serial_number", "device_type_name", "location_name", "state", "status",
    "status_name", "ready", "ready_name", "device_type_id",
]
LOC_COLS = [
    "location_id", "name", "address", "location_type_name", "device_count", "region_name",
    "latlng", "code", "timezone_name",
]
SCHED_COLS = [
    "schedule_id", "name", "pcode", "schedule_kind", "state", "code", "calendar_name",
    "shift_time", "barcode",
]
PERSON_COLS = [
    "person_id", "name", "last_name", "first_name", "middle_name", "gender", "gender_name",
    "birthday", "tin", "npin", "main_phone", "email", "address", "legal_address", "region_name",
    "state", "photo_sha", "code",
]
TIME_KIND_COLS = [
    "time_kind_id", "name", "letter", "code", "digital_code", "color", "plan_load",
    "parent_id", "state", "state_name", "order_no",
]
REQUEST_KIND_COLS = [
    "request_kind_id", "name", "state_name", "user_permitted", "annually_limited",
    "annual_day_limit", "allow_unused_time_name", "time_kind_name",
]
DISMISS_COLS = [
    "dismissal_reason_id", "name", "dismissal_reason_group_name", "reason_type", "state_name",
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
            print("login", resp.read().decode())
        self.user_id = "90339"
        st, data = self.post_json("/b/biruni/m:session", {"with_menu": "N"})
        if st == 200 and isinstance(data, dict):
            self.user_id = str(data.get("user", {}).get("user_id") or self.user_id)
            print("session user", self.user_id, data.get("company_name"))

    def headers(self):
        return {
            "User-Agent": "Mozilla/5.0",
            "Referer": BASE + "/",
            "Origin": BASE,
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "filial_id": FILIAL,
            "lang_code": "ru",
            "project_code": "vhr",
            "project_hash": "1",
            "user_id": self.user_id,
        }

    def post_json(self, path: str, obj, extra_headers=None, timeout=90):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        hdrs = self.headers()
        if extra_headers:
            hdrs.update(extra_headers)
        req = urllib.request.Request(BASE + path, data=body, headers=hdrs)
        try:
            with self.opener.open(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
                try:
                    return resp.status, json.loads(raw)
                except Exception:
                    return resp.status, {"raw": raw[:2000]}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                data = json.loads(raw)
            except Exception:
                data = {"raw": raw[:2000]}
            return e.code, data

    def open_form(self, form_path: str):
        st, data = self.post_json(
            "/b" + form_path + ":model",
            {},
            extra_headers={"formurl": form_path + "?"},
        )
        if st != 200:
            print("  model FAIL", form_path, st, str(data)[:200])
        return st, data

    def query(self, form_path: str, columns: list[str], offset=0, limit=100, filt=None, sort=None, d=None):
        payload = {
            "d": d or {},
            "p": {
                "column": columns,
                "filter": filt or [],
                "sort": sort or [],
                "offset": offset,
                "limit": limit,
            },
        }
        return self.post_json("/b" + form_path + ":table", payload)

    def _rows(self, columns: list[str], chunk):
        out = []
        for rec in chunk or []:
            if isinstance(rec, dict):
                out.append(rec)
            else:
                out.append({columns[i]: rec[i] if i < len(rec) else None for i in range(len(columns))})
        return out

    def resolve_columns(self, form_path: str, columns: list[str], filt=None, sort=None):
        cols = list(columns)
        while cols:
            st, data = self.query(form_path, cols, offset=0, limit=1, filt=filt, sort=sort)
            if st == 200:
                return cols
            raw = str(data)
            m = re.search(r"Field not found \[([^\]]+)\]", raw)
            if m:
                bad = m.group(1)
                print(f"  drop column {bad} from {form_path}")
                cols = [c for c in cols if c != bad]
                continue
            print("  probe FAIL", form_path, st, raw[:300])
            return cols
        return columns

    def dump_all(
        self,
        name: str,
        form_path: str,
        columns: list[str],
        limit=150,
        filt=None,
        sort=None,
        max_rows=200000,
        d=None,
    ):
        print(f"DUMP {name} {form_path}")
        self.open_form(form_path)
        columns = self.resolve_columns(form_path, columns, filt=filt, sort=sort)
        rows = []
        offset = 0
        count = None
        while offset < max_rows:
            st, data = self.query(
                form_path, columns, offset=offset, limit=limit, filt=filt, sort=sort, d=d
            )
            if st != 200:
                print("  FAIL", name, st, str(data)[:400])
                break
            chunk = data.get("data") or []
            count = int(data.get("count") or 0)
            rows.extend(self._rows(columns, chunk))
            print(f"  {name} {len(rows)}/{count}", flush=True)
            if not chunk or len(rows) >= count:
                break
            offset += limit
            time.sleep(0.08)
        out = {"count": count, "columns": columns, "rows": rows}
        (OUT / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return len(rows), count

    def dump_tree(
        self,
        name: str,
        form_path: str,
        columns: list[str],
        id_field: str,
        parent_param="parent_id",
        limit=200,
    ):
        """Walk Biruni parent_id trees (division_list only returns one level per request)."""
        print(f"DUMP TREE {name} {form_path}")
        self.open_form(form_path)
        columns = self.resolve_columns(form_path, columns)
        seen: set[str] = set()
        queue = [""]
        rows = []
        while queue:
            pid = queue.pop(0)
            offset = 0
            while True:
                st, data = self.query(
                    form_path,
                    columns,
                    offset=offset,
                    limit=limit,
                    d={parent_param: pid},
                )
                if st != 200:
                    print("  FAIL", name, "parent", pid or "ROOT", st, str(data)[:300])
                    break
                chunk = self._rows(columns, data.get("data") or [])
                count = int(data.get("count") or 0)
                for row in chunk:
                    rid = str(row.get(id_field) or "").strip()
                    if not rid or rid in seen:
                        continue
                    seen.add(rid)
                    if not str(row.get(parent_param) or "").strip():
                        row[parent_param] = pid
                    rows.append(row)
                    if rid != pid:
                        queue.append(rid)
                print(f"  {name} parent={pid or 'ROOT'} {len(chunk)}/{count} total={len(rows)}")
                if not chunk or offset + limit >= count:
                    break
                offset += limit
                time.sleep(0.06)
        out = {"count": len(rows), "columns": columns, "rows": rows}
        (OUT / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return len(rows), len(rows)


def track_from_date() -> str:
    env = os.environ.get("VERIFIX_TRACKS_FROM", "").strip()
    if env:
        return env
    today = date.today()
    month = today.month - 1
    year = today.year
    if month < 1:
        month = 12
        year -= 1
    return date(year, month, 1).strftime("%d.%m.%Y")


def dump_live(skip_tracks=False):
    c = Client()
    stats = {}
    stats["employees"] = c.dump_all(
        "employees", "/vhr/href/employee/employee_list", EMP_COLS, limit=200
    )
    stats["divisions"] = c.dump_tree(
        "divisions", "/vhr/hrm/division_list", DIV_COLS, "division_id"
    )
    stats["jobs"] = c.dump_all("jobs", "/vhr/hrm/job_list", JOB_COLS, limit=200)
    stats["robots"] = c.dump_all("robots", "/vhr/hrm/robot_list", ROBOT_COLS, limit=200)
    stats["persons"] = c.dump_all(
        "persons", "/vhr/href/person/person_list", PERSON_COLS, limit=200
    )
    stats["schedules"] = c.dump_all(
        "schedules", "/vhr/htt/schedule_list", SCHED_COLS, limit=200
    )
    stats["locations"] = c.dump_all(
        "locations", "/vhr/htt/location_list", LOC_COLS, limit=200
    )
    stats["devices"] = c.dump_all(
        "devices", "/vhr/htt/device_list", DEVICE_COLS, limit=200
    )
    stats["time_kinds"] = c.dump_all(
        "time_kinds", "/vhr/htt/time_kind_list", TIME_KIND_COLS, limit=200
    )
    stats["request_kinds"] = c.dump_all(
        "request_kinds", "/vhr/htt/request_kind_list", REQUEST_KIND_COLS, limit=200
    )
    stats["dismissal_reasons"] = c.dump_all(
        "dismissal_reasons",
        "/vhr/href/dismissal_reason_list",
        DISMISS_COLS,
        limit=200,
    )
    for name, path, cols in [
        (
            "applications",
            "/vhr/hpd/application/application_list",
            ["application_id", "name", "document_number", "document_date", "status_name"],
        ),
        (
            "timeoff",
            "/vhr/hpd/timeoff_list",
            ["timeoff_id", "name", "document_number", "document_date", "status_name"],
        ),
        (
            "timetable",
            "/vhr/htt/time_table_list",
            ["time_table_id", "name", "document_number", "document_date", "month", "schedule_name", "posted"],
        ),
        ("ranks", "/anor/mhr/rank_list", ["rank_id", "name", "code", "state_name"]),
    ]:
        stats[name] = c.dump_all(name, path, cols, limit=200, max_rows=8000)
    if skip_tracks:
        stats["tracks"] = ["skipped", None]
    else:
        frm = track_from_date()
        print("tracks from", frm)
        stats["tracks"] = c.dump_all(
            "tracks",
            "/vhr/htt/track_list",
            TRACK_COLS,
            limit=200,
            filt=["track_time", ">=", frm],
            sort=["-track_time"],
            max_rows=200000,
        )
    (OUT / "dump-stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print("STATS", json.dumps(stats))
    return stats


def main():
    skip_tracks = "--skip-tracks" in sys.argv
    dump_live(skip_tracks=skip_tracks)


if __name__ == "__main__":
    main()
