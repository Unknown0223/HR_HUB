"""
Gather real Verifix Excel/CSV exports (Downloads) into data/verifix-dump/.
Source files are Verifix reports dated 21.08.2026.
"""
from __future__ import annotations

import csv
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump"

SOURCES = {
    "employees": "Отчет-по-сотрудникам(21.08.2026+15_16_17).csv",
    "grades": "Отчет-по-разрядам(21.08.2026+15_57_49).csv",
    "tenure": "Отчет-по-стажам(21.08.2026+15_34_30).csv",
    "occupancy": "Отчет-по-занятости(21.08.2026+14_50_42).csv",
    "vacancies": "Отчет-по-вакантным-позициям(21.08.2026+14_28_23).csv",
    "candidates": "Отчет-по-кандидатам(21.08.2026+13_58_47).csv",
    "schedules": "Отчет-по-плану-графиков(21.08.2026+14_42_00).csv",
}

STAFF_RE = re.compile(r"\((\d+)\)")


def read_csv(path: Path) -> list[list[str]]:
    raw = path.read_bytes()
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise RuntimeError(f"Cannot decode {path}")
    return list(csv.reader(text.splitlines(), delimiter=";"))


def cell(row: list[str], i: int) -> str:
    return (row[i] if i < len(row) else "").strip()


def staff_code(title: str) -> str | None:
    m = STAFF_RE.search(title or "")
    return m.group(1) if m else None


def parse_salary(s: str):
    s = (s or "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def gather_employees(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows[4:]:
        fio = cell(row, 1)
        if not fio:
            continue
        title = cell(row, 7)
        out.append(
            {
                "n": cell(row, 0),
                "fullName": fio,
                "hiredAt": cell(row, 2),
                "code": cell(row, 3),
                "divisionGroup": cell(row, 4),
                "division": cell(row, 5),
                "position": cell(row, 6),
                "staffPosition": title,
                "staffCode": staff_code(title) or cell(row, 3) or None,
                "salary": parse_salary(cell(row, 8)),
                "grade": cell(row, 9),
                "gender": cell(row, 10),
                "region": cell(row, 11),
                "inps": cell(row, 12),
                "pinfl": cell(row, 13),
                "birthDate": cell(row, 14),
                "address": cell(row, 15),
                "phone": cell(row, 16),
                "schedule": cell(row, 17),
                "passport": cell(row, 18),
                "passportIssuer": cell(row, 19),
                "educationType": cell(row, 20),
                "educationInstitution": cell(row, 21),
                "educationSpecialty": cell(row, 22),
                "educationCourse": cell(row, 23),
                "familyRelation": cell(row, 24),
                "familyName": cell(row, 25),
            }
        )
    return out


def gather_vacancies(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows[4:]:
        code = cell(row, 1)
        if not code:
            continue
        title = cell(row, 8)
        out.append(
            {
                "code": code,
                "divGroup": cell(row, 2),
                "division": cell(row, 3),
                "dept": cell(row, 4),
                "posGroup": cell(row, 5),
                "position": cell(row, 6),
                "staffGroup": cell(row, 7),
                "title": title,
                "vacantFrom": cell(row, 9),
            }
        )
    return out


def gather_candidates(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows[3:]:
        fio = cell(row, 2)
        if not fio:
            continue
        out.append(
            {
                "introducedAt": cell(row, 1),
                "fullName": fio,
                "category": cell(row, 3),
                "education": cell(row, 4),
                "employmentSource": cell(row, 5),
                "birthDate": cell(row, 6),
                "gender": cell(row, 7),
                "languages": cell(row, 8),
                "positionName": cell(row, 9),
                "phone": cell(row, 10),
            }
        )
    return out


def gather_occupancy(rows: list[list[str]]) -> dict:
    header = [c.strip() for c in rows[3]]
    divisions = [h for h in header[1:] if h and h not in ("Итого", "Другие подразделения*")]
    cells = []
    positions = []
    for row in rows[4:]:
        pos = cell(row, 0)
        if not pos or pos.lower().startswith("итого"):
            continue
        positions.append(pos)
        for i, div in enumerate(divisions, start=1):
            raw = cell(row, i)
            if not raw:
                continue
            try:
                count = int(float(raw.replace(",", ".")))
            except ValueError:
                continue
            if count:
                cells.append({"position": pos, "division": div, "count": count})
    return {"columns": divisions, "positions": positions, "cells": cells}


def gather_schedules(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows[4:]:
        fio = cell(row, 1)
        if not fio:
            continue
        days = {}
        for d in range(1, 32):
            val = cell(row, 6 + d)  # col 7 = day 1
            if val:
                days[str(d)] = val
        out.append(
            {
                "fullName": fio,
                "division": cell(row, 2),
                "position": cell(row, 3),
                "code": cell(row, 4),
                "grade": cell(row, 5),
                "state": cell(row, 6),
                "days": days,
                "offDays": parse_salary(cell(row, 38)) or 0,
            }
        )
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    copied = {}
    missing = []
    for key, name in SOURCES.items():
        src = DOWNLOADS / name
        if not src.exists():
            missing.append(name)
            continue
        dest = OUT / f"{key}.csv"
        text = None
        for enc in ("utf-8-sig", "utf-8", "cp1251"):
            try:
                text = src.read_text(encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            shutil.copy2(src, dest)
        else:
            dest.write_text(text, encoding="utf-8")
        copied[key] = {"file": name, "bytes": src.stat().st_size}

    if missing:
        print("MISSING", *missing, sep="\n  ")
        return 1

    employees = gather_employees(read_csv(OUT / "employees.csv"))
    vacancies = gather_vacancies(read_csv(OUT / "vacancies.csv"))
    candidates = gather_candidates(read_csv(OUT / "candidates.csv"))
    occupancy = gather_occupancy(read_csv(OUT / "occupancy.csv"))
    schedules = gather_schedules(read_csv(OUT / "schedules.csv"))

    (OUT / "employees.json").write_text(json.dumps(employees, ensure_ascii=False), encoding="utf-8")
    (OUT / "vacancies.json").write_text(json.dumps(vacancies, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "occupancy.json").write_text(json.dumps(occupancy, ensure_ascii=False), encoding="utf-8")
    (OUT / "schedules.json").write_text(json.dumps(schedules, ensure_ascii=False), encoding="utf-8")

    divisions = sorted({e["division"] for e in employees if e["division"]})
    positions = sorted({e["position"] for e in employees if e["position"]})
    sched_names = sorted({e["schedule"] for e in employees if e["schedule"]})
    manifest = {
        "gatheredAt": datetime.now(timezone.utc).isoformat(),
        "source": "Verifix reports 21.08.2026 (Downloads)",
        "copied": copied,
        "counts": {
            "employees": len(employees),
            "vacancies": len(vacancies),
            "candidates": len(candidates),
            "occupancyCells": len(occupancy["cells"]),
            "occupancyDivisions": len(occupancy["columns"]),
            "schedulePlan": len(schedules),
            "divisions": len(divisions),
            "positions": len(positions),
            "workSchedules": len(sched_names),
            "withSalary": sum(1 for e in employees if e["salary"] is not None),
            "withPinfl": sum(1 for e in employees if e["pinfl"]),
        },
        "divisions": divisions,
        "positions": positions,
        "workSchedules": sched_names,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False, indent=2))
    print("OK", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
