"""Native-feeling Windows desktop shell (WebView2) for HR HUB Link."""
from __future__ import annotations

import json
import sys
import threading
from pathlib import Path
from typing import Any

from discovery import OFFLINE, OK, TIMEOUT, UNAUTHORIZED
from paths import bound_web_label, find_root, load_config, read_pairing_token, read_tunnel_url
from session import OfficeLinkSession, SubmitResult
from auth_lock import CONFIRM, LOCKED

APP_TITLE = "HR HUB Link"
APP_AUMID = "HRHUB.OfficeLink.Desktop"


def _ui_dir() -> Path:
    here = Path(__file__).resolve().parent
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        exe_dir = Path(sys.executable).resolve().parent
        # Prefer on-disk ui next to the exe so CSS/JS patches apply without rebuild.
        candidates = [
            exe_dir / "ui",
            exe_dir / "_internal" / "ui",
            here / "ui",
        ]
        if meipass:
            candidates.append(Path(meipass) / "ui")
        for cand in candidates:
            if (cand / "index.html").is_file():
                return cand
    return here / "ui"


def _set_aumid() -> None:
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_AUMID)
    except Exception:
        pass


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


class LinkApi:
    def __init__(self, window_holder: dict[str, Any]) -> None:
        self._holder = window_holder
        self.session = OfficeLinkSession()
        self._locations: list[dict[str, str]] = []
        self._reconnect_steps: list[dict[str, str]] = []
        self._last_device: dict[str, Any] = {}
        self._events: list[dict[str, Any]] = []
        self._events_lock = threading.Lock()

    def _window(self):
        return self._holder.get("window")

    def _emit(self, fn: str, payload: Any) -> None:
        """Queue UI events — JS polls them (evaluate_js from worker threads is unreliable)."""
        with self._events_lock:
            self._events.append({"fn": fn, "payload": payload})
            # Keep memory bounded if UI stopped polling.
            if len(self._events) > 100:
                self._events = self._events[-50:]

    def poll_events(self) -> list[dict[str, Any]]:
        with self._events_lock:
            batch = list(self._events)
            self._events.clear()
        return batch

    def clipboard_text(self) -> str:
        """Read clipboard without Tk (Tk+WebView2 can deadlock the UI)."""
        if sys.platform != "win32":
            return ""
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32
            CF_UNICODETEXT = 13
            if not user32.OpenClipboard(None):
                return ""
            try:
                handle = user32.GetClipboardData(CF_UNICODETEXT)
                if not handle:
                    return ""
                ptr = kernel32.GlobalLock(handle)
                if not ptr:
                    return ""
                try:
                    return ctypes.wstring_at(ptr)
                finally:
                    kernel32.GlobalUnlock(handle)
            finally:
                user32.CloseClipboard()
        except Exception:
            return ""

    def bootstrap(self) -> dict[str, Any]:
        cfg = load_config(self.session.root)
        token = read_pairing_token(self.session.root)
        bound = ""
        try:
            bound = bound_web_label(cfg, self.session.root) or ""
        except Exception:
            bound = str(cfg.get("webUrl") or "")
        status = {
            "title": "Готово к подключению",
            "sub": "Устройство: —",
            "kind": "accent",
            "badge": "ГОТОВО",
        }
        alert = None
        if not self.session.has_credentials():
            status = {
                "title": "Нужен токен",
                "sub": "Web → Связь с офисом",
                "kind": "warn",
                "badge": "ТОКЕН",
            }
            alert = {
                "text": "Нужен pairing-токен или ключ администратора.",
                "kind": "warn",
            }
        # Kick location load in background (results arrive via poll_events).
        threading.Thread(target=self._load_locations_worker, args=(token,), daemon=True).start()
        return {
            "tenantCode": self.session.tenant,
            "tenantName": str(cfg.get("tenantName") or self.session.tenant),
            "webUrl": self.session.web_url,
            "apiUrl": self.session.api_url,
            "boundWeb": bound,
            "token": token,
            "ip": "",
            "locations": [],
            "locationId": self.session.location_id,
            "status": status,
            "alert": alert,
            "device": {"name": "—", "host": "—", "state": "—", "location": "—"},
            # Light snapshot only — full tunnel probe can hang bootstrap.
            "tunnel": self._tunnel_payload(light=True),
        }

    def save_token(self, token: str) -> dict[str, Any]:
        self.session.set_pairing_token((token or "").strip())
        ok = self.session.has_credentials()
        return {
            "status": {
                "title": "Токен сохранён" if ok else "Токен пуст",
                "sub": "Устройство: —",
                "kind": "ok" if ok else "warn",
                "badge": "ТОКЕН",
            },
            "alert": {
                "text": "Pairing-токен сохранён." if ok else "Вставьте токен из Web.",
                "kind": "ok" if ok else "warn",
            },
        }

    def unlock_auth(self) -> dict[str, Any]:
        """Clear app-side password lock so operator can retry immediately."""
        self.session.auth.reset()
        return {
            "status": {
                "title": "Готово к подключению",
                "sub": "Блокировка снята — введите пароль терминала",
                "kind": "accent",
                "badge": "ГОТОВО",
            },
            "alert": {
                "text": (
                    "Блокировка снята. Нужен текущий пароль администратора "
                    "на терминале Hikvision (не пароль Web HR HUB)."
                ),
                "kind": "ok",
            },
            "locked": False,
        }

    def auth_status(self) -> dict[str, Any]:
        locked = self.session.auth.is_locked()
        return {
            "locked": locked,
            "remaining": self.session.auth.remaining_seconds(),
            "fails": self.session.auth.fail_count,
            "maxFails": self.session.auth.max_fails,
        }

    def set_location(self, location_id: str) -> bool:
        self.session.set_location_id(location_id)
        return True

    def refresh_locations(self, token: str = "") -> bool:
        if token and token.strip() != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(token.strip())
        threading.Thread(
            target=self._load_locations_worker, args=(self.session.pairing_token(),), daemon=True
        ).start()
        return True

    def _load_locations_worker(self, token: str) -> None:
        try:
            import api_client

            from paths import read_link_key, write_pairing_token

            pairing = (token or self.session.pairing_token() or "").strip()
            link_key = read_link_key(self.session.root)
            code, data = api_client.list_locations(
                self.session.api_url,
                link_key,
                self.session.tenant,
                pairing_token=pairing or None,
            )
            # Expired short-lived token must not block long-lived link.key.
            if code == 401 and pairing and link_key:
                msg = ""
                if isinstance(data, dict):
                    msg = str(data.get("message") or data.get("error") or "")
                if "expired" in msg.lower() or "invalid" in msg.lower() or not msg:
                    try:
                        write_pairing_token("", self.session.root)
                    except Exception:
                        pass
                    code, data = api_client.list_locations(
                        self.session.api_url,
                        link_key,
                        self.session.tenant,
                        pairing_token=None,
                    )
        except Exception as exc:
            self._emit(
                "onLocations",
                {
                    "locations": [],
                    "alert": {"text": f"Локации недоступны: {exc}", "kind": "warn"},
                },
            )
            return
        items: list[dict[str, str]] = []
        if code == 200 and isinstance(data, dict):
            raw = data.get("locations") or data.get("items") or data.get("data") or []
            if isinstance(raw, list):
                for row in raw:
                    if not isinstance(row, dict):
                        continue
                    lid = str(row.get("id") or row.get("locationId") or "").strip()
                    name = str(row.get("name") or row.get("title") or lid).strip()
                    if lid:
                        items.append({"id": lid, "label": name})
        self._locations = items
        if items and not self.session.location_id:
            self.session.set_location_id(items[0]["id"])
        alert = None
        if not items:
            detail = ""
            if isinstance(data, dict):
                detail = str(data.get("message") or data.get("error") or "").strip()
            if code == 401:
                alert = {
                    "text": (
                        "Токен устарел или ключ неверный. "
                        "Создайте новый pairing-токен в Web или проверьте link.key. "
                        + (detail[:80] if detail else "")
                    ).strip(),
                    "kind": "warn",
                }
            else:
                alert = {
                    "text": (
                        "Локации не найдены. Проверьте токен и доступ к API."
                        + (f" ({detail})" if detail else f" (HTTP {code})")
                    ),
                    "kind": "warn",
                }
        self._emit(
            "onLocations",
            {
                "locations": items,
                "locationId": self.session.location_id,
                "alert": alert,
            },
        )

    def scan(self, ip: str = "") -> bool:
        threading.Thread(target=self._scan_worker, args=(ip or "",), daemon=True).start()
        return True

    def _scan_worker(self, ip: str) -> None:
        try:
            if ip.strip():
                chosen = self.session.choose_ip(ip.strip())
                if chosen is None:
                    self._emit(
                        "onScanDone",
                        {"ok": False, "message": "Некорректный IP-адрес."},
                    )
                    return
                devices = [chosen] if chosen.online else []
                if not chosen.online:
                    self._emit(
                        "onScanDone",
                        {
                            "ok": False,
                            "message": "Устройство не в сети.",
                            "ip": ip.strip(),
                        },
                    )
                    return
            else:
                devices = self.session.scan()
            if not devices:
                self._emit(
                    "onScanDone",
                    {"ok": False, "message": "Терминал в LAN не найден."},
                )
                return
            if len(devices) == 1:
                pick = devices[0]
                self.session.choose(pick.host, pick.port)
            else:
                pick = self.session.chosen or devices[0]
            state = self.session.detected_state_label() if self.session.chosen else "—"
            self._emit(
                "onScanDone",
                {
                    "ok": True,
                    "ip": (pick.host if pick else ""),
                    "needPick": len(devices) > 1 and self.session.chosen is None,
                    "devices": [
                        {
                            "host": d.host,
                            "port": int(d.port or 80),
                            "name": d.hint_name or "Hikvision",
                        }
                        for d in devices
                    ],
                    "sub": (
                        f"Устройство: {pick.host}"
                        if len(devices) == 1
                        else f"Найдено: {len(devices)} — выберите IP"
                    ),
                    "status": {
                        "title": (
                            "Терминал найден"
                            if len(devices) == 1
                            else f"Найдено: {len(devices)}"
                        ),
                        "sub": (
                            f"Устройство: {pick.host}"
                            if len(devices) == 1
                            else "Выберите терминал или проверьте пароль"
                        ),
                        "kind": "ok" if len(devices) == 1 else "warn",
                        "badge": "ОНЛАЙН" if len(devices) == 1 else "ВЫБОР",
                    },
                    "device": {
                        "name": getattr(pick, "hint_name", "") or "Hikvision",
                        "host": pick.host if pick else "",
                        "state": state,
                        "location": self._location_label(),
                        "apiUrl": self.session.api_url,
                    },
                    "alert": {
                        "text": (
                            "Устройство найдено."
                            if len(devices) == 1
                            else f"LAN da {len(devices)} ta terminal — tanlang yoki parolni tekshiring."
                        ),
                        "kind": "ok" if len(devices) == 1 else "warn",
                    },
                },
            )
        except Exception as exc:
            self._emit("onScanDone", {"ok": False, "message": str(exc)})

    def choose_device(self, host: str, port: int = 80) -> dict[str, Any]:
        info = self.session.select_scanned_host(str(host or "").strip(), int(port or 80))
        if info is None:
            return {
                "ok": False,
                "alert": {"text": "Некорректный IP.", "kind": "warn"},
            }
        return {
            "ok": True,
            "ip": info.host,
            "status": {
                "title": "Выбрано",
                "sub": f"Устройство: {info.host}",
                "kind": "ok",
                "badge": "ONLINE",
            },
            "device": {
                "name": info.hint_name or "Hikvision",
                "host": info.host,
                "state": self.session.detected_state_label(),
                "location": self._location_label(),
                "apiUrl": self.session.api_url,
            },
        }

    def probe_passwords(self, password: str, ip_hint: str = "") -> bool:
        threading.Thread(
            target=self._probe_passwords_worker,
            args=(str(password or ""), str(ip_hint or "").strip()),
            daemon=True,
        ).start()
        return True

    def _probe_passwords_worker(self, password: str, ip_hint: str) -> None:
        try:
            if not self.session.devices:
                self.session.scan(ip_hint=ip_hint or None)
            results, match, reason = self.session.pick_password_match(
                password, host_hint=ip_hint or None
            )
            devices = [
                {
                    "host": r.host,
                    "port": int(r.port or 80),
                    "name": r.name or "Hikvision",
                    "serialNumber": r.serialNumber or "",
                    "ok": bool(r.ok),
                }
                for r in results
            ]
            if reason == "ok" and match is not None:
                self._emit(
                    "onProbeDone",
                    {
                        "reason": "ok",
                        "ip": match.host,
                        "devices": devices,
                        "status": {
                            "title": "Пароль совпал",
                            "sub": f"Устройство: {match.host}",
                            "kind": "ok",
                            "badge": "ПАРОЛЬ OK",
                        },
                        "alert": {
                            "text": f"Parol mos: {match.host}. «Подключить» bilan davom eting.",
                            "kind": "ok",
                        },
                        "device": {
                            "name": match.name or "Hikvision",
                            "host": match.host,
                            "state": self.session.detected_state_label(),
                            "location": self._location_label(),
                            "apiUrl": self.session.api_url,
                        },
                    },
                )
                return
            if reason == "need_pick":
                self._emit(
                    "onProbeDone",
                    {
                        "reason": "need_pick",
                        "needPick": True,
                        "devices": devices,
                        "status": {
                            "title": "Выберите устройство",
                            "sub": "Parol bir nechta IP da mos",
                            "kind": "warn",
                            "badge": "ВЫБОР",
                        },
                        "alert": {
                            "text": "Parol bir nechta terminalga mos. Ro‘yxatdan keraklisini tanlang.",
                            "kind": "warn",
                        },
                    },
                )
                return
            if reason == "none":
                self._emit(
                    "onProbeDone",
                    {
                        "reason": "none",
                        "devices": devices,
                        "status": {
                            "title": "Пароль не подошёл",
                            "kind": "danger",
                            "badge": "ПАРОЛЬ",
                            "sub": "Нет совпадений",
                        },
                        "alert": {
                            "text": "Parol hech qaysi topilgan terminalga mos kelmadi.",
                            "kind": "danger",
                        },
                    },
                )
                return
            self._emit(
                "onProbeDone",
                {
                    "reason": reason,
                    "devices": devices,
                    "alert": {
                        "text": "Avval «Найти» bilan terminallarni qidiring yoki parolni yozing.",
                        "kind": "warn",
                    },
                },
            )
        except Exception as exc:
            self._emit(
                "onProbeDone",
                {"reason": "error", "alert": {"text": str(exc), "kind": "danger"}},
            )

    def confirm_connect(self, ip: str, location_label: str, password: str) -> bool:
        try:
            from device_email import normalize_recovery_email

            recovery = normalize_recovery_email(
                str((self.session.cfg or {}).get("recoveryEmail") or "")
            )
        except Exception:
            recovery = "—"
        msg = (
            "Подтвердите перед подключением.\n\n"
            f"IP: {ip or '—'}\n"
            f"Локация: {location_label or '—'}\n"
            f"Пароль администратора: {password}\n"
            f"Почта восстановления: {recovery}\n\n"
            "Будет установлен новый пароль и выполнена привязка."
        )
        win = self._window()
        if win is None:
            return True
        try:
            return bool(win.create_confirmation_dialog("Подтверждение", msg))
        except Exception:
            # If native dialog fails, proceed — operator already clicked Connect.
            return True

    def connect(self, payload: dict[str, Any] | None = None) -> bool:
        data = payload or {}
        threading.Thread(target=self._connect_worker, args=(data,), daemon=True).start()
        return True

    def _connect_worker(self, data: dict[str, Any]) -> None:
        try:
            self._connect_worker_inner(data)
        except Exception as exc:
            self._emit(
                "onConnectDone",
                {
                    "clearPassword": False,
                    "status": {
                        "title": "Ошибка подключения",
                        "kind": "danger",
                        "badge": "ОШИБКА",
                        "sub": str(exc)[:160],
                    },
                    "alert": {"text": str(exc)[:240], "kind": "danger"},
                },
            )

    def _connect_worker_inner(self, data: dict[str, Any]) -> None:
        token = str(data.get("token") or "").strip()
        ip = str(data.get("ip") or "").strip()
        location_id = str(data.get("locationId") or "").strip()
        password = str(data.get("password") or "")
        if token != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(token)
        self.session.set_location_id(location_id or None)
        if not (self.session.location_id or "").strip():
            self._emit(
                "onConnectDone",
                {
                    "clearPassword": False,
                    "status": {
                        "title": "Локация не выбрана",
                        "kind": "warn",
                        "badge": "ЛОКАЦИЯ",
                        "sub": "Устройство: —",
                    },
                    "alert": {
                        "text": "Перед подключением выберите локацию.",
                        "kind": "warn",
                    },
                },
            )
            return
        if not self.session.has_credentials():
            self._emit(
                "onConnectDone",
                {
                    "clearPassword": False,
                    "status": {
                        "title": "Нужен токен",
                        "kind": "warn",
                        "badge": "ТОКЕН",
                        "sub": "Устройство: —",
                    },
                    "alert": {
                        "text": "Нужен pairing-токен или ключ администратора.",
                        "kind": "warn",
                    },
                },
            )
            return
        if ip:
            chosen = self.session.choose_ip(ip)
            if chosen is None or not chosen.online:
                self._emit(
                    "onConnectDone",
                    {
                        "clearPassword": False,
                        "status": {
                            "title": "Устройство не в сети",
                            "kind": "danger",
                            "badge": "OFFLINE",
                            "sub": f"Устройство: {ip}",
                        },
                        "alert": {"text": "Устройство не в сети.", "kind": "danger"},
                    },
                )
                return
        elif not self.session.chosen:
            # Multi-device / no IP: resolve by password across scanned LAN.
            if not self.session.devices:
                self._emit(
                    "onConnectDone",
                    {
                        "clearPassword": False,
                        "status": {
                            "title": "Устройство не найдено",
                            "kind": "warn",
                            "badge": "ПОИСК",
                            "sub": "Сначала нажмите «Найти»",
                        },
                        "alert": {
                            "text": "Сначала найдите терминал в LAN.",
                            "kind": "warn",
                        },
                    },
                )
                return
            results, match, reason = self.session.pick_password_match(password)
            devices = [
                {
                    "host": r.host,
                    "port": int(r.port or 80),
                    "name": r.name or "Hikvision",
                    "serialNumber": r.serialNumber or "",
                    "ok": bool(r.ok),
                }
                for r in results
            ]
            if reason == "need_pick":
                matched = [d for d in devices if d.get("ok")]
                self._emit(
                    "onConnectDone",
                    {
                        "clearPassword": False,
                        "needPick": True,
                        "matches": matched,
                        "devices": devices,
                        "status": {
                            "title": "Выберите устройство",
                            "kind": "warn",
                            "badge": "ВЫБОР",
                            "sub": f"Parol {len(matched)} ta IP da mos",
                        },
                        "alert": {
                            "text": "Parol bir nechta terminalga mos. Ro‘yxatdan tanlang, keyin yana «Подключить».",
                            "kind": "warn",
                        },
                    },
                )
                return
            if reason != "ok" or match is None:
                self._emit(
                    "onConnectDone",
                    {
                        "clearPassword": False,
                        "devices": devices,
                        "status": {
                            "title": "Пароль не подошёл",
                            "kind": "danger",
                            "badge": "ПАРОЛЬ",
                            "sub": "Нет совпадений",
                        },
                        "alert": {
                            "text": "Parol hech qaysi topilgan terminalga mos kelmadi.",
                            "kind": "danger",
                        },
                    },
                )
                return
        elif len(self.session.devices or []) > 1 and not ip:
            # Chosen set but operator didn't confirm IP field — keep chosen.
            pass

        def progress(msg: str) -> None:
            self._emit(
                "onConnectProgress",
                {
                    "status": {
                        "title": (msg or "Подключение…")[:120],
                        "kind": "accent",
                        "badge": "ПОДКЛЮЧЕНИЕ",
                        "sub": f"Устройство: {self.session.chosen.host if self.session.chosen else '—'}",
                    },
                },
            )

        state = (self.session.detected_state or {}).get("state")
        if state == "new":
            self.session.password = password or self.session.password or ""
            linked = self.session.link_to_cloud(progress)
            self._emit("onConnectDone", self._connect_result(linked, clear_pwd=True, linked=True))
            return
        result = self.session.submit_password(password)
        if result.kind == OK:
            linked = self.session.link_to_cloud(progress)
            self._emit("onConnectDone", self._connect_result(linked, clear_pwd=True, linked=True))
            return
        self._emit(
            "onConnectDone",
            self._connect_result(result, clear_pwd=result.kind in (CONFIRM, LOCKED), linked=False),
        )

    def _connect_result(
        self, result: SubmitResult, *, clear_pwd: bool, linked: bool
    ) -> dict[str, Any]:
        kind = result.kind
        host = ""
        if self.session.chosen:
            host = self.session.chosen.host
        if kind == CONFIRM:
            return {
                "clearPassword": False,
                "status": {
                    "title": "Неверный пароль",
                    "kind": "danger",
                    "badge": "ПАРОЛЬ",
                    "sub": f"Устройство: {host or '—'}",
                },
                "alert": {
                    "text": result.message or "Неверный пароль. Введите снова.",
                    "kind": "danger",
                },
            }
        if kind == LOCKED:
            left = ""
            if result.remaining:
                mins, rem = divmod(int(result.remaining), 60)
                left = f" ({mins:02d}:{rem:02d})"
            return {
                "clearPassword": False,
                "status": {
                    "title": "Заблокировано" + left,
                    "kind": "danger",
                    "badge": "LOCK",
                    "sub": f"Устройство: {host or '—'}",
                },
                "alert": {
                    "text": result.message
                    or "Слишком много неверных попыток. Нажмите «Сбросить блокировку».",
                    "kind": "danger",
                },
                "locked": True,
                "remaining": int(result.remaining or 0),
            }
        if kind in (TIMEOUT, OFFLINE, UNAUTHORIZED, "location", "no_key", "empty"):
            return {
                "clearPassword": clear_pwd,
                "status": {
                    "title": result.message or "Ошибка",
                    "kind": "danger" if kind == OFFLINE else "warn",
                    "badge": str(kind).upper(),
                    "sub": f"Устройство: {host or '—'}",
                },
                "alert": {"text": result.message or "Ошибка подключения", "kind": "warn"},
            }
        if kind == "reconnected":
            host = (result.device or {}).get("host") or host
            self._last_device = dict(result.device or {})
            try:
                self.session.write_service_handoff()
            except Exception:
                pass
            return {
                "clearPassword": False,
                "status": {
                    "title": "Сеть обновлена",
                    "kind": "ok",
                    "badge": "ОБНОВЛЕНО",
                    "sub": f"Устройство: {host or '—'}",
                },
                "alert": {
                    "text": result.message or "Сеть успешно обновлена.",
                    "kind": "ok",
                },
                "device": {
                    "name": (result.device or {}).get("name") or "Hikvision",
                    "host": host,
                    "state": "reconnected",
                    "location": self._location_label(),
                    "apiUrl": self.session.api_url,
                },
                "tunnel": self._tunnel_payload(),
            }
        if kind == "need_pick":
            matches = list((result.device or {}).get("matches") or [])
            return {
                "clearPassword": False,
                "needPick": True,
                "matches": matches,
                "devices": matches,
                "status": {
                    "title": "Выберите устройство",
                    "kind": "warn",
                    "badge": "ВЫБОР",
                    "sub": f"Mos: {len(matches)}",
                },
                "alert": {
                    "text": result.message
                    or "Bir nechta qurilma mos keldi — ro‘yxatdan tanlang.",
                    "kind": "warn",
                },
            }
        if kind == "linked" or linked:
            sealed = bool((result.device or {}).get("sealed"))
            needs_confirm = bool((result.device or {}).get("needsAdminConfirm"))
            self._last_device = dict(result.device or {})
            try:
                self.session.write_service_handoff()
            except Exception:
                pass
            try:
                self.session.ensure_tunnel_supervisor()
            except Exception:
                pass
            title = (
                "Ожидание подтверждения в Web"
                if needs_confirm
                else ("Привязка закреплена" if sealed else "Подключено")
            )
            return {
                "clearPassword": True,
                "status": {
                    "title": title,
                    "kind": "warn" if needs_confirm else "ok",
                    "badge": "ПОДТВЕРЖДЕНИЕ" if needs_confirm else "ОК",
                    "sub": f"Устройство: {(result.device or {}).get('host') or host or '—'}",
                },
                "alert": {
                    "text": (
                        "Пароль установлен. Подтвердите привязку в Web."
                        if needs_confirm
                        else "Настройка завершена — окно можно закрыть. Лица только через Web «Синхронизировать»."
                    ),
                    "kind": "warn" if needs_confirm else "ok",
                },
                "device": {
                    "name": (result.device or {}).get("name") or "Hikvision",
                    "host": (result.device or {}).get("host") or host,
                    "state": "linked",
                    "location": self._location_label(),
                    "apiUrl": self.session.api_url,
                },
                "tunnel": self._tunnel_payload(),
            }
        return {
            "clearPassword": clear_pwd,
            "status": {
                "title": result.message or "Ошибка",
                "kind": "danger",
                "badge": "ОШИБКА",
                "sub": f"Устройство: {host or '—'}",
            },
            "alert": {"text": result.message or "Ошибка", "kind": "danger"},
        }

    def reconnect(self, payload: dict[str, Any] | None = None) -> bool:
        data = payload if isinstance(payload, dict) else {}
        self._reconnect_steps = []
        threading.Thread(
            target=self._reconnect_worker,
            args=(
                str(data.get("password") or ""),
                str(data.get("ip") or "").strip() or None,
            ),
            daemon=True,
        ).start()
        return True

    def _reconnect_worker(
        self, password: str = "", ip_hint: str | None = None
    ) -> None:
        labels = {
            "web": "Веб",
            "scan": "Сканер",
            "match": "Сопоставление",
            "auth": "Пароль",
            "link": "Связь",
        }

        def on_step(step_id: str, state: str, detail: str = "") -> None:
            found = False
            for row in self._reconnect_steps:
                if row["id"] == step_id:
                    row["state"] = state
                    row["detail"] = detail
                    row["label"] = labels.get(step_id, step_id)
                    found = True
                    break
            if not found:
                self._reconnect_steps.append(
                    {
                        "id": step_id,
                        "state": state,
                        "detail": detail,
                        "label": labels.get(step_id, step_id),
                    }
                )
            self._emit("onReconnectProgress", self._reconnect_steps)

        try:
            result = self.session.auto_reconnect_network(
                password,
                on_step=on_step,
                ip_hint=ip_hint,
            )
        except Exception as exc:
            self._emit(
                "onReconnectDone",
                {
                    "status": {
                        "title": "Ошибка восстановления",
                        "kind": "danger",
                        "badge": "ОШИБКА",
                        "sub": str(exc),
                    },
                    "alert": {"text": str(exc), "kind": "danger"},
                    "steps": self._reconnect_steps,
                },
            )
            return
        payload = self._connect_result(
            result,
            clear_pwd=False,
            linked=result.kind in ("linked", "reconnected"),
        )
        payload["steps"] = self._reconnect_steps
        self._emit("onReconnectDone", payload)

    def tunnel_status(self) -> bool:
        threading.Thread(target=self._tunnel_status_worker, daemon=True).start()
        return True

    def restore_tunnel(self) -> bool:
        threading.Thread(target=self._restore_tunnel_worker, daemon=True).start()
        return True

    def _tunnel_payload(self, *, light: bool = False) -> dict[str, str]:
        if light:
            try:
                url = read_tunnel_url(self.session.root) or "—"
            except Exception:
                url = "—"
            return {"state": "не проверено", "url": url or "—"}
        try:
            health = self.session.tunnel_health()
        except Exception:
            return {"state": "нет данных", "url": "—"}
        if health is None:
            return {"state": "нет данных", "url": "—"}
        if isinstance(health, dict):
            return {
                "state": str(health.get("state") or health.get("status") or "—"),
                "url": str(health.get("url") or health.get("publicUrl") or "—"),
            }
        ok = bool(getattr(health, "ok", False))
        url = str(getattr(health, "tunnel_url", "") or getattr(health, "url", "") or "—")
        mode = str(getattr(health, "mode", "") or "")
        message = str(getattr(health, "message", "") or "")
        state = "онлайн" if ok else "офлайн"
        if mode:
            state = f"{state} ({mode})"
        if message and not ok:
            state = message[:80]
        # Soften alarm when LAN face agent is already syncing.
        try:
            from paths import service_status_file, tunnel_cooldown_remaining
            import json

            left = tunnel_cooldown_remaining(self.session.root)
            st_path = service_status_file(self.session.root)
            face_ok = False
            if st_path.is_file():
                st = json.loads(st_path.read_text(encoding="utf-8"))
                face_ok = bool(st.get("faceAgent")) and str(st.get("state") or "") == "face_agent"
            if left > 0 and not ok:
                mins = max(1, (left + 59) // 60)
                state = f"Cloudflare limithi — ~{mins} daqiqa kuting"
            elif face_ok and not ok:
                state = "LAN sync OK (tunnel kutilyapti)"
        except Exception:
            pass
        return {"state": state, "url": url or "—"}

    def _tunnel_status_worker(self) -> None:
        tunnel = self._tunnel_payload()
        self._emit(
            "onTunnelDone",
            {
                "tunnel": tunnel,
                "status": {
                    "title": tunnel.get("state") or "Туннель",
                    "kind": "accent",
                    "badge": "ТУННЕЛЬ",
                    "sub": tunnel.get("url") or "—",
                },
            },
        )

    def _restore_tunnel_worker(self) -> None:
        try:
            result = self.session.restore_tunnel()
        except Exception as exc:
            self._emit(
                "onTunnelDone",
                {
                    "tunnel": self._tunnel_payload(),
                    "alert": {"text": str(exc), "kind": "danger"},
                    "status": {
                        "title": "Ошибка туннеля",
                        "kind": "danger",
                        "badge": "ОШИБКА",
                        "sub": str(exc),
                    },
                },
            )
            return
        tunnel = self._tunnel_payload()
        ok = result.kind == "tunnel_ok"
        self._emit(
            "onTunnelDone",
            {
                "tunnel": tunnel,
                "alert": {
                    "text": result.message or ("Туннель восстановлен" if ok else "Не удалось"),
                    "kind": "ok" if ok else "warn",
                },
                "status": {
                    "title": result.message or tunnel.get("state") or "Туннель",
                    "kind": "ok" if ok else "warn",
                    "badge": "ТУННЕЛЬ",
                    "sub": tunnel.get("url") or "—",
                },
            },
        )

    def _location_label(self) -> str:
        lid = self.session.location_id or ""
        for row in self._locations:
            if row.get("id") == lid:
                return row.get("label") or lid
        return lid or "—"


def run_desktop() -> None:
    _set_aumid()
    try:
        import webview
    except ImportError as exc:
        raise SystemExit(
            "pywebview kerak. pip install pywebview\n" + str(exc)
        ) from exc

    ui = _ui_dir()
    index = ui / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI topilmadi: {index}")

    holder: dict[str, Any] = {"window": None}
    api = LinkApi(holder)
    icon = None
    for cand in (
        Path(sys.executable).resolve().parent / "hrhub-link.ico",
        find_root() / "hrhub-link.ico",
        Path(__file__).resolve().parent / "hrhub-link.ico",
    ):
        if cand.is_file():
            icon = str(cand)
            break

    window = webview.create_window(
        APP_TITLE,
        url=index.as_uri(),
        js_api=api,
        width=980,
        height=720,
        min_size=(820, 600),
        background_color="#0B1220",
        text_select=False,
    )
    holder["window"] = window
    webview.start(gui="edgechromium", icon=icon)


if __name__ == "__main__":
    run_desktop()
