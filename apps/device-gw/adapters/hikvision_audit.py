"""Pure helpers for auditing a local admin session on a Hikvision terminal.

The terminal journal (AcsEvent major=3) records only a few menu actions, so the
session report combines it with a before/after diff of the device configuration.
"""

from __future__ import annotations

import re
from typing import Any, Optional

MAJOR_OPERATION = 3

# AcsEvent major=3 minors (HCNetSDK MINOR_* for access control terminals).
OPERATION_LABELS: dict[int, str] = {
    0x50: "Вход в меню терминала (пароль администратора)",
    0x51: "Выход из меню терминала",
    0x5A: "Обновление прошивки с терминала",
    0x70: "Удалённый вход",
    0x71: "Удалённый выход",
    0x79: "Удалённая постановка на охрану",
    0x7A: "Удалённое снятие с охраны",
    0x7B: "Удалённая перезагрузка",
    0x7E: "Удалённое обновление прошивки",
    0x86: "Экспорт конфигурации",
    0x87: "Импорт конфигурации",
    0x400: "Удалённое открытие двери",
    0x401: "Удалённое закрытие двери",
    0x402: "Дверь: всегда открыта (удалённо)",
    0x403: "Дверь: всегда закрыта (удалённо)",
    0x404: "Удалённая синхронизация времени",
    0x405: "Синхронизация времени по NTP",
    0x406: "Удалённая очистка карт",
    0x407: "Удалённый сброс настроек",
    0x408: "Постановка входа тревоги на охрану",
    0x409: "Снятие входа тревоги с охраны",
    0x40A: "Сброс настроек на терминале",
    0x40B: "Удалённый снимок камеры",
    0x40C: "Изменение настроек сетевой отчётности",
    0x40F: "Открытие двери паролем разблокировки",
    0x410: "Автоперенумерация",
    0x412: "Импорт файла конфигурации",
    0x413: "Экспорт файла конфигурации",
    0x414: "Импорт прав карт",
    0x415: "Экспорт прав карт",
    0x416: "Обновление прошивки с USB",
}

# Codes performed at the terminal itself (not over the network).
LOCAL_OPERATION_MINORS = {0x50, 0x51, 0x5A, 0x40A, 0x416}

MAX_OPERATIONS = 200
MAX_LIST_ITEMS = 50

# Values that change on their own or that Worklyn toggles itself during the lock.
VOLATILE_KEYS: dict[str, set[str]] = {
    "time": {"localTime"},
    "cardReader": {"enable"},
}


def operation_label(minor: int) -> str:
    return OPERATION_LABELS.get(minor) or f"Операция терминала (код 0x{minor:X})"


def operation_entry(item: dict[str, Any]) -> dict[str, Any]:
    minor = int(item.get("minor") or 0)
    entry: dict[str, Any] = {
        "serial": int(item.get("serialNo") or 0),
        "time": str(item.get("time") or ""),
        "minor": minor,
        "code": f"0x{minor:X}",
        "label": operation_label(minor),
        "local": minor in LOCAL_OPERATION_MINORS,
    }
    for src, dst in (
        ("name", "name"),
        ("employeeNoString", "employeeNo"),
        ("employeeNo", "employeeNo"),
        ("netUser", "netUser"),
        ("remoteHostAddr", "remoteHost"),
    ):
        value = item.get(src)
        if value not in (None, "") and dst not in entry:
            entry[dst] = str(value)
    return entry


def build_operation_log(
    items: list[dict[str, Any]], from_serial: int = 0
) -> list[dict[str, Any]]:
    """Dedupe by serial, keep the session's events (serials are monotonic)."""
    seen: set[int] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        entry = operation_entry(item)
        serial = entry["serial"]
        if serial and serial in seen:
            continue
        if from_serial and serial and serial < from_serial:
            continue
        if serial:
            seen.add(serial)
        out.append(entry)
    out.sort(key=lambda e: (e["serial"] or 0, e["time"]))
    return out[-MAX_OPERATIONS:]


_XML_LEAF = re.compile(r"<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)</\1>")


def flatten_xml(text: str, keys: Optional[set[str]] = None) -> dict[str, str]:
    """Leaf elements as flat key/value; repeated tags get a [n] suffix."""
    out: dict[str, str] = {}
    counts: dict[str, int] = {}
    for tag, value in _XML_LEAF.findall(text or ""):
        if keys is not None and tag not in keys:
            continue
        counts[tag] = counts.get(tag, 0) + 1
        key = tag if counts[tag] == 1 else f"{tag}[{counts[tag]}]"
        out[key] = value.strip()
    return out


def flatten_json(value: Any, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(value, dict):
        for k, v in value.items():
            out.update(flatten_json(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(value, list):
        for i, v in enumerate(value[:MAX_LIST_ITEMS]):
            out.update(flatten_json(v, f"{prefix}[{i}]"))
    elif value is not None:
        out[prefix] = str(value).lower() if isinstance(value, bool) else str(value)
    return out


def person_entry(user: dict[str, Any]) -> dict[str, Any]:
    entry: dict[str, Any] = {"name": str(user.get("name") or "")}
    for key in ("userType", "localUIRight", "numOfFace", "numOfCard"):
        if key in user and user[key] is not None:
            entry[key] = user[key]
    return entry


def _person_name(p: Optional[dict[str, Any]]) -> str:
    return str((p or {}).get("name") or "")


def diff_persons(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
    by_server: set[str],
) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for emp in sorted(set(before) | set(after)):
        b, a = before.get(emp), after.get(emp)
        if b == a:
            continue
        base: dict[str, Any] = {"section": "persons", "employeeNo": emp}
        if emp in by_server:
            base["byServer"] = True
        if b is None:
            changes.append({**base, "kind": "added", "name": _person_name(a), "after": a})
            continue
        if a is None:
            changes.append({**base, "kind": "removed", "name": _person_name(b), "before": b})
            continue
        for key in sorted(set(b) | set(a)):
            if b.get(key) == a.get(key):
                continue
            changes.append(
                {
                    **base,
                    "kind": "changed",
                    "name": _person_name(a) or _person_name(b),
                    "key": key,
                    "before": b.get(key),
                    "after": a.get(key),
                }
            )
    return changes


def diff_config(
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    by_server: Optional[set[str]] = None,
) -> list[dict[str, Any]]:
    """Field-level differences; sections unreadable on either side are skipped."""
    if not before or not after:
        return []
    changes: list[dict[str, Any]] = []
    for section in sorted(set(before) | set(after)):
        b, a = before.get(section), after.get(section)
        if not isinstance(b, dict) or not isinstance(a, dict):
            continue
        if section == "persons":
            changes.extend(diff_persons(b, a, by_server or set()))
            continue
        skip = VOLATILE_KEYS.get(section, set())
        for key in sorted(set(b) | set(a)):
            if key in skip or b.get(key) == a.get(key):
                continue
            changes.append(
                {
                    "section": section,
                    "kind": "changed",
                    "key": key,
                    "before": b.get(key),
                    "after": a.get(key),
                }
            )
    return changes
