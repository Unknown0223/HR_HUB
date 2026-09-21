"""Wire discovery, auth lock, gateway/tunnel, and API registration."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from auth_lock import CONFIRM, LOCKED, AuthLock
from discovery import (
    ERROR,
    OFFLINE,
    OK,
    TIMEOUT,
    UNAUTHORIZED,
    OnlineInfo,
    VerifyResult,
    find_devices,
    probe_online,
    valid_ip,
    verify_password,
)
from paths import (
    find_root,
    load_config,
    read_link_key,
    read_pairing_token,
    resolve_named_tunnel_url,
    resolve_tunnel_token,
    write_link_key,
    write_pairing_token,
    write_service_config,
    write_tunnel_url,
)
from provision import STATE_NEW, detect_state, state_label_uz

StatusFn = Callable[[str], None]
# step_id, state (pending|active|done|fail|skip), detail message
StepFn = Callable[[str, str, str], None]

RECONNECT_STEPS = ("scan", "web", "match", "auth", "link")


@dataclass
class SubmitResult:
    kind: str
    message: str = ""
    device: dict[str, Any] = field(default_factory=dict)
    remaining: int = 0


@dataclass
class ReconnectMatch:
    """LAN device matched to a web vault row after password verify."""

    lan: OnlineInfo
    web: dict[str, Any]
    password: str
    username: str
    serial: str
    password_source: str
    host_changed: bool


@dataclass
class PasswordProbeResult:
    """One LAN host checked with an admin password."""

    host: str
    port: int = 80
    ok: bool = False
    kind: str = UNAUTHORIZED
    serialNumber: str = ""
    name: str = ""
    model: str = ""
    detail: str = ""

    def label(self) -> str:
        mark = "✓" if self.ok else "✗"
        title = self.name or self.model or "Hikvision"
        sn = f" · S/N {self.serialNumber}" if self.serialNumber else ""
        return f"{mark}  {self.host}  ·  {title}{sn}"


class OfficeLinkSession:
    def __init__(self, root=None) -> None:
        self.root = root or find_root()
        self.cfg = load_config(self.root)
        self.auth = AuthLock()
        self.devices: list[OnlineInfo] = []
        self.chosen: OnlineInfo | None = None
        self.verified: dict[str, Any] | None = None
        self.username = "admin"
        self.services = None
        self.password = ""
        self.location_id: str | None = None
        self.detected_state: dict[str, Any] = {}
        self.provision_session_id: str | None = None

    @property
    def api_url(self) -> str:
        return str(self.cfg.get("apiUrl") or "").rstrip("/")

    @property
    def tenant(self) -> str:
        return str(self.cfg.get("tenantCode") or "demo")

    @property
    def web_url(self) -> str:
        return str(self.cfg.get("webUrl") or "").rstrip("/")

    def has_link_key(self) -> bool:
        return bool(read_link_key(self.root))

    def pairing_token(self) -> str:
        return read_pairing_token(self.root)

    def set_pairing_token(self, token: str | None) -> None:
        write_pairing_token(token or "", self.root)

    def has_credentials(self) -> bool:
        return self.has_link_key() or bool(self.pairing_token())

    def set_location_id(self, location_id: str | None) -> None:
        text = (location_id or "").strip()
        self.location_id = text or None

    def detected_state_label(self) -> str:
        state = str((self.detected_state or {}).get("state") or "")
        return state_label_uz(state) if state else "—"

    def _refresh_detected_state(self) -> None:
        if not self.chosen:
            self.detected_state = {}
            return
        try:
            self.detected_state = detect_state(self.chosen.host, self.chosen.port)
        except Exception:
            self.detected_state = {"state": "unknown", "meta": {"reason": "detect_failed"}}

    def scan(
        self,
        prefixes: list[str] | None = None,
        ip_hint: str | None = None,
    ) -> list[OnlineInfo]:
        hint = (ip_hint or "").strip()
        if hint and valid_ip(hint):
            info = self.choose(hint, 80)
            if info.online and info.likely_hikvision:
                self.devices = [info]
                return self.devices
            # Port closed / not Hikvision — still keep result empty for clear UI.
            self.devices = []
            self.chosen = None
            self.detected_state = None
            return self.devices
        self.devices = find_devices(prefixes)
        # Multiple terminals: do not silently lock onto the first IP —
        # operator (or password probe) must choose.
        if len(self.devices) == 1:
            self.chosen = self.devices[0]
        else:
            self.chosen = None
        self._refresh_detected_state()
        return self.devices

    def choose(self, host: str, port: int = 80) -> OnlineInfo:
        info = probe_online(host, port)
        self.chosen = info
        # Keep in devices list if missing.
        if info.online and info.likely_hikvision:
            if not any(d.host == info.host and int(d.port or 80) == int(info.port or 80) for d in self.devices):
                self.devices = list(self.devices) + [info]
        self._refresh_detected_state()
        return info

    def choose_ip(self, ip: str, port: int = 80) -> OnlineInfo | None:
        ip = (ip or "").strip()
        if not valid_ip(ip):
            return None
        return self.choose(ip, port)

    def select_scanned_host(self, host: str, port: int = 80) -> OnlineInfo | None:
        """Pick an already-scanned LAN device without re-probing when possible."""
        host_n = (host or "").strip()
        port_n = int(port or 80)
        for d in self.devices:
            if d.host == host_n and int(d.port or 80) == port_n:
                self.chosen = d
                self._refresh_detected_state()
                return d
        if host_n and valid_ip(host_n):
            return self.choose(host_n, port_n)
        return None

    def match_password_on_lan(
        self,
        password: str,
        *,
        devices: list[OnlineInfo] | None = None,
        username: str | None = None,
        on_status: StatusFn | None = None,
    ) -> list[PasswordProbeResult]:
        """Try the same admin password against every found Hikvision IP."""
        pwd = (password or "").strip()
        user = (username or self.username or "admin").strip() or "admin"
        targets = list(devices if devices is not None else self.devices)
        if not targets and self.chosen:
            targets = [self.chosen]
        out: list[PasswordProbeResult] = []
        if not pwd:
            for d in targets:
                out.append(
                    PasswordProbeResult(
                        host=d.host,
                        port=int(d.port or 80),
                        ok=False,
                        kind="empty",
                        detail="no password",
                        name=d.hint_name or "",
                    )
                )
            return out
        for d in targets:
            if on_status:
                on_status(f"Parol tekshiruvi: {d.host}…")
            result = verify_password(d.host, int(d.port or 80), user, pwd)
            out.append(
                PasswordProbeResult(
                    host=d.host,
                    port=int(d.port or 80),
                    ok=result.kind == OK,
                    kind=result.kind,
                    serialNumber=str(result.serialNumber or ""),
                    name=str(result.name or d.hint_name or ""),
                    model=str(result.model or ""),
                    detail=str(result.detail or ""),
                )
            )
        return out

    def pick_password_match(
        self,
        password: str,
        *,
        host_hint: str | None = None,
        devices: list[OnlineInfo] | None = None,
        on_status: StatusFn | None = None,
    ) -> tuple[list[PasswordProbeResult], PasswordProbeResult | None, str]:
        """Probe all LAN devices; auto-pick when exactly one password matches.

        Returns (all_results, chosen_match_or_None, reason_code):
          ok | need_pick | none | empty | no_devices
        """
        hint = (host_hint or "").strip()
        targets = list(devices if devices is not None else self.devices)
        if hint and valid_ip(hint):
            # Prefer explicit IP: probe that host first / only if not in list.
            if not any(d.host == hint for d in targets):
                info = probe_online(hint, 80)
                if info.online:
                    targets = [info] + targets
                else:
                    targets = targets  # keep scan results
            # Narrow to hint when present in list
            narrowed = [d for d in targets if d.host == hint]
            if narrowed:
                targets = narrowed
        if not targets:
            return [], None, "no_devices"
        if not (password or "").strip():
            return [], None, "empty"
        results = self.match_password_on_lan(
            password, devices=targets, on_status=on_status
        )
        matched = [r for r in results if r.ok]
        if not matched:
            return results, None, "none"
        if len(matched) == 1:
            m = matched[0]
            self.select_scanned_host(m.host, m.port)
            self.password = (password or "").strip()
            return results, m, "ok"
        # Multiple matches — caller must show picker.
        return results, None, "need_pick"

    def bind_pairing_session(self) -> tuple[bool, str]:
        """Bind office client to platform provision session; may receive link.key."""
        import api_client

        token = self.pairing_token()
        if not token:
            return False, "Pairing-токен отсутствует."
        host = self.chosen.host if self.chosen else None
        serial = (self.verified or {}).get("serialNumber") if self.verified else None
        code, data = api_client.create_pairing_session(
            self.api_url,
            read_link_key(self.root),
            self.tenant,
            pairing_token=token,
            host=host,
            serial=serial,
        )
        if code < 200 or code >= 300 or not isinstance(data, dict):
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("message") or data.get("error") or "")
            return False, msg or f"Ошибка pairing-сессии (HTTP {code})."
        sid = str(data.get("sessionId") or "").strip()
        if sid:
            self.provision_session_id = sid
        link_key = str(data.get("linkKey") or "").strip()
        if link_key:
            write_link_key(link_key, self.root)
        return True, "OK"

    def write_service_handoff(self) -> None:
        """Persist GW/tunnel handoff for Windows Service after GUI closes."""
        token = resolve_tunnel_token(self.cfg, self.root)
        named_url = resolve_named_tunnel_url(self.cfg, self.root)
        mode = "named" if token else "quick"
        tunnel = ""
        if self.services is not None:
            tunnel = str(getattr(self.services, "tunnel_url", "") or "").strip()
        if not tunnel:
            tunnel = named_url
        if tunnel:
            write_tunnel_url(tunnel, self.root)
        from credential_store import peek_device_host, read_device_credential

        local = read_device_credential(self.root) or peek_device_host(self.root) or {}
        host = str(local.get("host") or "")
        port = int(local.get("port") or 80)
        device_id = str(local.get("deviceId") or "")
        if self.chosen is not None:
            host = host or str(getattr(self.chosen, "host", "") or "")
            port = int(getattr(self.chosen, "port", None) or port or 80)
            serial = str(getattr(self.chosen, "serial", "") or "")
            if serial and not device_id:
                device_id = serial
        write_service_config(
            api_url=self.api_url,
            tenant=self.tenant,
            tunnel_mode=mode,
            root=self.root,
            extra={
                "locationId": self.location_id or local.get("locationId") or "",
                "tunnelUrl": tunnel,
                "namedTunnelUrl": named_url,
                "autoHeal": True,
                "faceAgent": True,
                "deviceId": device_id,
                "host": host,
                "port": port,
                "username": str(local.get("username") or "admin"),
                "reachMode": "device" if host else "gw",
            },
        )

    def tunnel_health(self):
        from tunnel_watch import snapshot_health

        return snapshot_health(self.services, self.root)

    def restore_tunnel(self, on_status: StatusFn | None = None) -> SubmitResult:
        """Restart GW + Cloudflare tunnel and re-announce (no device password)."""
        from tunnel_watch import restore_tunnel, spawn_detached_worker

        # Remember LAN host so restore prefers device-direct tunnel (no :8800).
        try:
            self.write_service_handoff()
        except Exception:
            pass
        try:
            bundle, url = restore_tunnel(
                root=self.root,
                bundle=self.services,
                on_status=on_status,
                keep_bundle=True,
            )
            self.services = bundle
            self.write_service_handoff()
            spawn_detached_worker(self.root)
            is_lan = bool(url) and "trycloudflare" not in url.lower() and url.startswith(
                "http://"
            )
            return SubmitResult(
                kind="tunnel_ok",
                message=(
                    f"LAN ulanish: {url} (Cloudflare limithi o‘tkazib yuborildi)"
                    if is_lan
                    else f"Туннель восстановлен: {url}"
                ),
                device={"tunnelUrl": url},
            )
        except Exception as e:
            return SubmitResult(kind="tunnel_error", message=str(e)[:240])

    def ensure_tunnel_supervisor(self) -> bool:
        """Start background tunnel worker + login startup task (no GUI needed later)."""
        from auto_resume import ensure_background_worker
        from paths import load_service_config

        self.write_service_handoff()
        svc = load_service_config(self.root)
        if not svc or svc.get("enabled") is False:
            return False
        # Always ensure worker is alive (health.ok can be GUI-only tunnel).
        return bool(ensure_background_worker(self.root))

    def submit_password(self, password: str) -> SubmitResult:
        password = (password or "").strip()
        if self.auth.is_locked():
            left = self.auth.format_remaining()
            return SubmitResult(
                kind=LOCKED,
                message=(
                    f"Блокировка приложения: {left}. "
                    "Пароль сейчас НЕ проверяется. "
                    "Нажмите «Сбросить блокировку» или подождите."
                ),
                remaining=self.auth.remaining_seconds(),
            )
        if not password:
            return SubmitResult(kind="empty", message="Пароль не введён.")
        if not self.chosen:
            return SubmitResult(kind="no_device", message="Устройство не найдено.")
        online = probe_online(self.chosen.host, self.chosen.port)
        if not online.online:
            self.auth.record_offline()
            return SubmitResult(kind=OFFLINE, message="Устройство не в сети.")
        if online.kind == TIMEOUT:
            self.auth.record_timeout()
            return SubmitResult(
                kind=TIMEOUT,
                message="Таймаут сети. Попытка пароля не засчитана.",
            )
        result = verify_password(
            self.chosen.host,
            self.chosen.port,
            self.username,
            password,
        )
        if result.kind == TIMEOUT:
            self.auth.record_timeout()
            return SubmitResult(
                kind=TIMEOUT,
                message="Таймаут сети. Попытка пароля не засчитана.",
            )
        if result.kind in (OFFLINE, ERROR):
            if result.kind == OFFLINE:
                self.auth.record_offline()
            return SubmitResult(
                kind=result.kind,
                message="Ошибка сети. Попытка пароля не засчитана.",
            )
        if result.kind == UNAUTHORIZED:
            phase = self.auth.record_401()
            left_tries = max(0, self.auth.max_fails - self.auth.fail_count)
            if phase == LOCKED:
                left = self.auth.format_remaining()
                return SubmitResult(
                    kind=LOCKED,
                    message=(
                        f"Неверный пароль администратора терминала. "
                        f"Блокировка {left}. "
                        "Проверьте пароль на самом терминале (веб/iVMS), "
                        "затем «Сбросить блокировку»."
                    ),
                    remaining=self.auth.remaining_seconds(),
                )
            return SubmitResult(
                kind=CONFIRM,
                message=(
                    "Неверный пароль администратора терминала. "
                    f"Осталось попыток: {left_tries}. "
                    "Это пароль терминала Hikvision, не пароль Web."
                ),
            )
        if result.kind == OK:
            self.auth.record_success()
            self.verified = result.as_device()
            self.password = password
            return SubmitResult(kind=OK, message="Online", device=self.verified)
        return SubmitResult(kind=ERROR, message="Не удалось проверить.")

    def link_to_cloud(self, on_status: StatusFn | None = None) -> SubmitResult:
        """Full provision: rotate/register via ProvisionEngine (Faza 1/2)."""
        from provision import ProvisionEngine

        location_id = (self.location_id or "").strip()
        if not location_id:
            return SubmitResult(
                kind="location",
                message="Локация не выбрана. Выберите локацию перед подключением.",
            )
        if not self.has_credentials():
            return SubmitResult(
                kind="no_key",
                message="Требуется pairing-токен или ключ администратора.",
            )

        engine = ProvisionEngine()
        state = str((self.detected_state or {}).get("state") or "")
        if state == STATE_NEW:
            return engine.provision_new(self, self.password or "", location_id, on_status)

        if not self.verified or not self.password:
            return SubmitResult(kind=ERROR, message="Сначала подтвердите пароль.")
        return engine.provision_configured(
            self,
            self.password,
            location_id,
            on_status=on_status,
            rotate_password=True,
        )

    def fetch_web_devices(self) -> tuple[bool, list[dict[str, Any]], str]:
        """List tenant devices with vault passwords (pairing/link-key)."""
        import api_client

        if not self.has_credentials():
            return False, [], "Pairing token yoki admin kaliti kerak."
        code, data = api_client.list_office_link_devices(
            self.api_url,
            read_link_key(self.root),
            self.tenant,
            pairing_token=self.pairing_token() or None,
        )
        if not api_client.is_success(code) or not isinstance(data, dict):
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("message") or data.get("error") or "")
            return False, [], msg or f"Ошибка списка устройств (HTTP {code})."
        raw = data.get("devices")
        devices = [d for d in raw if isinstance(d, dict)] if isinstance(raw, list) else []
        return True, devices, "OK"

    def fetch_provision_status(self) -> tuple[bool, dict[str, Any], str]:
        """Poll Web for admin confirm / sealed after Ulash."""
        import api_client

        sid = (self.provision_session_id or "").strip()
        token = self.pairing_token() or ""
        if not sid:
            return False, {}, "Сессия provision отсутствует."
        if not token:
            return False, {}, "Требуется pairing-токен."
        code, data = api_client.get_provision_session(
            self.api_url,
            read_link_key(self.root),
            session_id=sid,
            pairing_token=token,
        )
        if not api_client.is_success(code) or not isinstance(data, dict):
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("message") or data.get("error") or "")
            return False, {}, msg or f"Ошибка состояния сессии (HTTP {code})."
        return True, data, "OK"

    @staticmethod
    def match_web_device(
        devices: list[dict[str, Any]],
        *,
        serial: str = "",
        host: str = "",
        device_id: str = "",
    ) -> dict[str, Any] | None:
        serial_n = (serial or "").strip().lower()
        host_n = (host or "").strip().lower()
        id_n = (device_id or "").strip().lower()
        if id_n:
            for d in devices:
                if str(d.get("id") or "").strip().lower() == id_n:
                    return d
        if serial_n:
            for d in devices:
                sn = str(d.get("serialNumber") or "").strip().lower()
                if sn and sn == serial_n:
                    return d
        if host_n:
            for d in devices:
                h = str(d.get("host") or "").strip().lower()
                if h and h == host_n:
                    return d
        with_pwd = [
            d
            for d in devices
            if str(d.get("password") or "").strip() and str(d.get("id") or "").strip()
        ]
        if len(with_pwd) == 1:
            return with_pwd[0]
        return None

    def peek_reconnect_password(
        self,
        manual_password: str = "",
    ) -> dict[str, Any]:
        """Resolve password without verifying: local → web → manual."""
        from credential_store import read_device_credential

        manual = (manual_password or "").strip()
        local = read_device_credential(self.root)
        if local and str(local.get("password") or "").strip():
            return {
                "password": str(local.get("password")).strip(),
                "source": "local",
                "device": None,
                "username": str(local.get("username") or "admin").strip() or "admin",
            }

        ok, devices, err = self.fetch_web_devices()
        if ok:
            serial = ""
            host = self.chosen.host if self.chosen else ""
            if local:
                serial = str(local.get("serialNumber") or "")
                if not host:
                    host = str(local.get("host") or "")
            if self.verified:
                serial = str(self.verified.get("serialNumber") or serial)
            matched = self.match_web_device(devices, serial=serial, host=host)
            if matched and str(matched.get("password") or "").strip():
                return {
                    "password": str(matched.get("password")).strip(),
                    "source": "web",
                    "device": matched,
                    "username": str(matched.get("username") or "admin").strip() or "admin",
                }
            # No serial match yet — still expose single-device web password for UI fill.
            with_pwd = [d for d in devices if str(d.get("password") or "").strip()]
            if len(with_pwd) == 1:
                d0 = with_pwd[0]
                return {
                    "password": str(d0.get("password")).strip(),
                    "source": "web",
                    "device": d0,
                    "username": str(d0.get("username") or "admin").strip() or "admin",
                }
            if not devices:
                err = err or "На Web нет активного устройства."
        elif err:
            pass

        if manual:
            return {
                "password": manual,
                "source": "manual",
                "device": None,
                "username": self.username or "admin",
            }
        return {
            "password": "",
            "source": "",
            "device": None,
            "username": self.username or "admin",
            "error": err
            or "Пароль не найден — введите вручную или выполните полное подключение.",
        }

    def _password_candidates(
        self,
        manual_password: str,
        web_devices: list[dict[str, Any]],
        *,
        prefer_web: dict[str, Any] | None = None,
    ) -> list[tuple[str, str, str, dict[str, Any] | None]]:
        """Ordered (password, username, source, web_device|None) — unique passwords."""
        from credential_store import read_device_credential

        out: list[tuple[str, str, str, dict[str, Any] | None]] = []
        seen: set[str] = set()

        def add(
            pwd: str,
            username: str,
            source: str,
            web: dict[str, Any] | None,
        ) -> None:
            p = (pwd or "").strip()
            if not p or p in seen:
                return
            seen.add(p)
            u = (username or "admin").strip() or "admin"
            out.append((p, u, source, web))

        if prefer_web and str(prefer_web.get("password") or "").strip():
            add(
                str(prefer_web.get("password")),
                str(prefer_web.get("username") or "admin"),
                "web",
                prefer_web,
            )

        local = read_device_credential(self.root)
        if local:
            add(
                str(local.get("password") or ""),
                str(local.get("username") or "admin"),
                "local",
                None,
            )

        for d in web_devices:
            add(
                str(d.get("password") or ""),
                str(d.get("username") or "admin"),
                "web",
                d,
            )

        add(manual_password, self.username or "admin", "manual", None)
        return out

    def _priority_hosts(
        self,
        *,
        ip_hint: str,
        web_devices: list[dict[str, Any]],
    ) -> list[str]:
        from credential_store import read_device_credential

        ordered: list[str] = []
        seen: set[str] = set()

        def push(host: str) -> None:
            h = (host or "").strip()
            if not h or not valid_ip(h) or h in seen:
                return
            seen.add(h)
            ordered.append(h)

        push(ip_hint)
        local = read_device_credential(self.root)
        if local:
            push(str(local.get("host") or ""))
        for d in web_devices:
            push(str(d.get("host") or ""))
        return ordered

    def scan_for_reconnect(
        self,
        *,
        ip_hint: str | None = None,
        known_hosts: list[str] | None = None,
        on_status: StatusFn | None = None,
    ) -> list[OnlineInfo]:
        """Probe known IPs first, then full LAN Hikvision scan. Deduped by host."""
        by_host: dict[str, OnlineInfo] = {}

        def take(info: OnlineInfo | None) -> None:
            if not info or not info.online or not info.likely_hikvision:
                return
            by_host[info.host] = info

        hint = (ip_hint or "").strip()
        for host in list(known_hosts or []) + ([hint] if hint else []):
            if on_status:
                on_status(f"Проверка: {host}")
            take(probe_online(host, 80))

        if on_status:
            on_status("Сканирование LAN… поиск Hikvision")
        # Full subnet scan (ignores hint-only empty path in scan()).
        for info in find_devices():
            take(info)

        devices = list(by_host.values())
        # Prefer hint / known hosts order for chosen.
        preferred = None
        for host in list(known_hosts or []) + ([hint] if hint else []):
            if host in by_host:
                preferred = by_host[host]
                break
        self.devices = devices
        self.chosen = preferred or (devices[0] if devices else None)
        self._refresh_detected_state()
        return devices

    def resolve_reconnect_match(
        self,
        lan_devices: list[OnlineInfo],
        web_devices: list[dict[str, Any]],
        manual_password: str = "",
        *,
        on_status: StatusFn | None = None,
    ) -> ReconnectMatch | SubmitResult:
        """Compare LAN probes with web vault rows via serial after password verify."""
        if not lan_devices:
            return SubmitResult(
                kind=OFFLINE,
                message="Hikvision в LAN не найден — укажите IP или проверьте сеть.",
            )
        if not web_devices:
            return SubmitResult(
                kind="api",
                message="На Web нет активного устройства. Сначала выполните полное подключение.",
            )

        from credential_store import read_device_credential

        local = read_device_credential(self.root) or {}
        local_serial = str(local.get("serialNumber") or "").strip()
        local_device_id = str(local.get("deviceId") or "").strip()

        # Order LAN: known serial's previous host → hint hosts already in list order.
        ordered_lan = list(lan_devices)
        prefer_web = self.match_web_device(
            web_devices,
            serial=local_serial,
            device_id=local_device_id,
        )

        candidates = self._password_candidates(
            manual_password, web_devices, prefer_web=prefer_web
        )
        if not candidates:
            return SubmitResult(
                kind="empty",
                message="Пароль не найден — введите вручную или выполните полное подключение.",
            )

        matches: list[ReconnectMatch] = []
        timeouts = 0
        for lan in ordered_lan:
            if on_status:
                on_status(f"Сравнение: {lan.host}…")
            for pwd, username, source, bound_web in candidates:
                result = verify_password(lan.host, int(lan.port or 80), username, pwd)
                if result.kind == TIMEOUT:
                    timeouts += 1
                    break
                if result.kind == UNAUTHORIZED:
                    continue
                if result.kind != OK:
                    continue
                serial = str(result.serialNumber or "").strip()
                web = None
                if bound_web and source == "web":
                    # Password belonged to a specific vault row — confirm serial if possible.
                    web_sn = str(bound_web.get("serialNumber") or "").strip().lower()
                    if not serial or not web_sn or web_sn == serial.lower():
                        web = bound_web
                if web is None:
                    web = self.match_web_device(
                        web_devices,
                        serial=serial,
                        host=lan.host,
                        device_id=local_device_id,
                    )
                if web is None and len(web_devices) == 1:
                    web = web_devices[0]
                if not web or not str(web.get("id") or "").strip():
                    continue
                # If password came from another web row, require serial match.
                if (
                    bound_web
                    and source == "web"
                    and str(bound_web.get("id")) != str(web.get("id"))
                    and serial
                ):
                    web_sn = str(web.get("serialNumber") or "").strip().lower()
                    if web_sn and web_sn != serial.lower():
                        continue
                prev_host = str(web.get("host") or "").strip()
                matches.append(
                    ReconnectMatch(
                        lan=lan,
                        web=web,
                        password=pwd,
                        username=username,
                        serial=serial or str(web.get("serialNumber") or ""),
                        password_source=source,
                        host_changed=bool(prev_host and prev_host != lan.host),
                    )
                )
                break  # next LAN device

        if not matches:
            if timeouts and timeouts >= len(ordered_lan):
                return SubmitResult(
                    kind=TIMEOUT,
                    message="Таймаут сети. Попытка пароля не засчитана.",
                )
            return SubmitResult(
                kind=UNAUTHORIZED,
                message=(
                    "В LAN найдено устройство(а), но пароль/serial с Web не совпали. "
                    "Введите пароль вручную или выполните полное подключение."
                ),
            )

        # Prefer host_changed + serial-known; then local deviceId; then first.
        def score(m: ReconnectMatch) -> tuple[int, int, int]:
            same_id = int(
                bool(
                    local_device_id
                    and str(m.web.get("id") or "").strip() == local_device_id
                )
            )
            same_serial = int(
                bool(
                    local_serial
                    and m.serial
                    and local_serial.lower() == m.serial.lower()
                )
            )
            return (same_id, same_serial, int(m.host_changed))

        matches.sort(key=score, reverse=True)
        best = matches[0]
        # Ambiguity: multiple different web ids with equal top score.
        top = score(best)
        rivals = [m for m in matches if score(m) == top and m.web.get("id") != best.web.get("id")]
        if rivals:
            options = [best] + rivals
            return SubmitResult(
                kind="need_pick",
                message=(
                    f"Mos keladigan {len(options)} ta qurilma topildi. "
                    "Ro‘yxatdan keraklisini tanlang."
                ),
                device={
                    "matches": [
                        {
                            "host": m.lan.host,
                            "port": int(m.lan.port or 80),
                            "name": str(
                                m.web.get("name")
                                or m.lan.hint_name
                                or m.lan.host
                            ),
                            "serialNumber": m.serial,
                            "webId": str(m.web.get("id") or ""),
                            "passwordOk": True,
                        }
                        for m in options
                    ]
                },
            )
        return best

    def auto_reconnect_network(
        self,
        password: str = "",
        on_status: StatusFn | None = None,
        on_step: StepFn | None = None,
        *,
        ip_hint: str | None = None,
    ) -> SubmitResult:
        """Full Wi‑Fi reconnect: scan → web compare → auth → tunnel/host sync."""
        from provision import ProvisionEngine

        def step(sid: str, state: str, detail: str = "") -> None:
            if on_step:
                on_step(sid, state, detail)
            if on_status and detail:
                on_status(detail)

        if not self.has_credentials():
            return SubmitResult(
                kind="no_key",
                message="Требуется pairing-токен или ключ администратора.",
            )

        for sid in RECONNECT_STEPS:
            step(sid, "pending")

        # 1) Web devices first (known hosts help scan priority).
        step("web", "active", "Получение устройств с Web…")
        ok, web_devices, err = self.fetch_web_devices()
        if not ok:
            step("web", "fail", err or "Не удалось прочитать Web")
            return SubmitResult(
                kind="api",
                message=err or "Не удалось получить устройства с Web.",
            )
        step("web", "done", f"Web: {len(web_devices)} устройств")

        # 2) LAN scan
        step("scan", "active", "Сканирование сети…")
        known = self._priority_hosts(
            ip_hint=(ip_hint or "").strip(),
            web_devices=web_devices,
        )
        lan = self.scan_for_reconnect(
            ip_hint=ip_hint,
            known_hosts=known,
            on_status=on_status,
        )
        if not lan:
            step("scan", "fail", "В LAN не найдено")
            return SubmitResult(
                kind=OFFLINE,
                message="Устройство не найдено или не в сети. Укажите IP или выполните поиск.",
            )
        step("scan", "done", f"LAN: {len(lan)} Hikvision")

        # 3) Match
        step("match", "active", "Сравнение с Web…")
        resolved = self.resolve_reconnect_match(
            lan,
            web_devices,
            password,
            on_status=on_status,
        )
        if isinstance(resolved, SubmitResult):
            if resolved.kind in (UNAUTHORIZED, "empty", TIMEOUT):
                step("match", "done", "Сравнение завершено")
                step("auth", "fail", resolved.message)
            else:
                step("match", "fail", resolved.message)
            return resolved

        match = resolved
        self.chosen = match.lan
        self._refresh_detected_state()
        change_note = (
            f"IP изменился: {match.web.get('host')} → {match.lan.host}"
            if match.host_changed
            else f"IP тот же ({match.lan.host}) — обновление tunnel/GW"
        )
        step(
            "match",
            "done",
            f"Mos: {match.web.get('name') or match.web.get('id')} · {change_note}",
        )

        # 4) Auth confirmed (already verified in resolve)
        step(
            "auth",
            "active",
            f"Пароль OK ({match.password_source}) · serial={match.serial or '—'}",
        )
        self.auth.record_success()
        self.verified = {
            "host": match.lan.host,
            "port": int(match.lan.port or 80),
            "serialNumber": match.serial,
            "name": match.web.get("name") or match.lan.hint_name or match.lan.host,
            "model": match.web.get("model") or "Hikvision",
        }
        self.password = match.password
        self.username = match.username
        step("auth", "done", f"Источник пароля: {match.password_source}")

        # 5) Link / provision
        step("link", "active", "Обновление gateway + tunnel + web host…")
        engine = ProvisionEngine()

        def _status(msg: str) -> None:
            if on_status:
                on_status(msg)
            if on_step:
                on_step("link", "active", msg)

        result = engine.provision_network_reconnect(
            self,
            match.password,
            device_id=str(match.web["id"]),
            on_status=_status,
        )
        if result.kind == "reconnected":
            step("link", "done", "Сеть синхронизирована с Web")
            if isinstance(result.device, dict):
                result.device["passwordSource"] = match.password_source
                result.device["hostChanged"] = match.host_changed
                result.device["serialNumber"] = match.serial
            try:
                self.ensure_tunnel_supervisor()
            except Exception:
                pass
            try:
                from auto_resume import reconcile_link

                reconcile_link(
                    self.root,
                    self.api_url,
                    self.tenant,
                    force_httphost=True,
                )
            except Exception:
                pass
        else:
            step("link", "fail", result.message or "Ошибка подключения")
        return result

    def reconnect_network(
        self,
        password: str = "",
        on_status: StatusFn | None = None,
        *,
        ip_hint: str | None = None,
        on_step: StepFn | None = None,
    ) -> SubmitResult:
        """Wi‑Fi change: auto scan, web match, update host/tunnel — no rotate."""
        return self.auto_reconnect_network(
            password,
            on_status=on_status,
            on_step=on_step,
            ip_hint=ip_hint,
        )

    def stop(self, *, kill_tunnel: bool = True) -> None:
        if not kill_tunnel:
            # Leave GW/tunnel running for auto-heal / Windows Service.
            self.services = None
            return
        if self.services is not None:
            self.services.stop()
            self.services = None
