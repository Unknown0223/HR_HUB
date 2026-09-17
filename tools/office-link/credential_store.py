"""Persist last platform-owned terminal password so it is never lost.

Written immediately after a successful password rotate on the device,
before (and after) the API register call. Recoverable via Admin menu /
ADMIN recovery file even if the network or GUI fails afterward.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from paths import data_dir, find_root


def credential_file(root: Path | None = None) -> Path:
    return data_dir(root) / "device-credential.json"


def save_device_credential(
    *,
    host: str,
    password: str,
    username: str = "admin",
    port: int = 80,
    serial: str = "",
    location_id: str = "",
    phase: str = "rotated",
    device_id: str = "",
    root: Path | None = None,
) -> Path:
    """Overwrite recovery record. Password must never be empty."""
    pwd = (password or "").strip()
    if not pwd:
        raise ValueError("password required for recovery save")
    host = (host or "").strip()
    payload: dict[str, Any] = {
        "host": host,
        "port": int(port or 80),
        "username": (username or "admin").strip() or "admin",
        "password": pwd,
        "serialNumber": (serial or "").strip(),
        "locationId": (location_id or "").strip(),
        "deviceId": (device_id or "").strip(),
        "phase": phase,
        "savedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": (
            "HR HUB Link recovery — новый admin-пароль. "
            "Если Web vault не работает — восстановите из этого файла. "
            "Меню Admin: «Показать сохранённый пароль»."
        ),
    }
    path = credential_file(root)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return path


def read_device_credential(root: Path | None = None) -> dict[str, Any] | None:
    path = credential_file(root)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    pwd = str(data.get("password") or "").strip()
    if not pwd:
        return None
    return data


def peek_device_host(root: Path | None = None) -> dict[str, Any]:
    """Host/port/deviceId even when password is missing (tunnel restore hint)."""
    path = credential_file(root)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    host = str(data.get("host") or "").strip()
    if not host:
        return {}
    return {
        "host": host,
        "port": int(data.get("port") or 80),
        "deviceId": str(data.get("deviceId") or "").strip(),
        "username": str(data.get("username") or "admin").strip() or "admin",
    }


def format_credential_for_display(data: dict[str, Any] | None) -> str:
    path = credential_file(find_root())
    if not data:
        return (
            "Сохранённый пароль отсутствует.\n\n"
            "Причина: подключение ещё не завершено успешно или файл не записан.\n"
            "После подключения файл появится здесь:\n"
            f"{path}\n\n"
            "Примечание: если нельзя писать в Program Files, файл будет в "
            "%LOCALAPPDATA%\\HRHUB-Link\\data\\."
        )
    return (
        f"Host: {data.get('host') or '—'}\n"
        f"Port: {data.get('port') or 80}\n"
        f"Login: {data.get('username') or 'admin'}\n"
        f"Пароль: {data.get('password')}\n"
        f"Serial: {data.get('serialNumber') or '—'}\n"
        f"Этап: {data.get('phase') or '—'}\n"
        f"Сохранено: {data.get('savedAt') or '—'}\n"
        f"Файл: {path}"
    )
