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


@dataclass
class SubmitResult:
    kind: str
    message: str = ""
    device: dict[str, Any] = field(default_factory=dict)
    remaining: int = 0


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
        self.chosen = self.devices[0] if self.devices else None
        self._refresh_detected_state()
        return self.devices

    def choose(self, host: str, port: int = 80) -> OnlineInfo:
        info = probe_online(host, port)
        self.chosen = info
        self._refresh_detected_state()
        return info

    def choose_ip(self, ip: str, port: int = 80) -> OnlineInfo | None:
        ip = (ip or "").strip()
        if not valid_ip(ip):
            return None
        return self.choose(ip, port)

    def bind_pairing_session(self) -> tuple[bool, str]:
        """Bind office client to platform provision session; may receive link.key."""
        import api_client

        token = self.pairing_token()
        if not token:
            return False, "Pairing token yo‘q."
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
            return False, msg or f"Pairing sessiya xato (HTTP {code})."
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
        write_service_config(
            api_url=self.api_url,
            tenant=self.tenant,
            tunnel_mode=mode,
            root=self.root,
            extra={
                "locationId": self.location_id or "",
                "tunnelUrl": tunnel,
                "namedTunnelUrl": named_url,
            },
        )

    def submit_password(self, password: str) -> SubmitResult:
        password = (password or "").strip()
        if self.auth.is_locked():
            return SubmitResult(
                kind=LOCKED,
                message="Qulflangan",
                remaining=self.auth.remaining_seconds(),
            )
        if not password:
            return SubmitResult(kind="empty", message="Parol kiritilmadi.")
        if not self.chosen:
            return SubmitResult(kind="no_device", message="Qurilma topilmadi.")
        online = probe_online(self.chosen.host, self.chosen.port)
        if not online.online:
            self.auth.record_offline()
            return SubmitResult(kind=OFFLINE, message="Qurilma onlayn emas.")
        if online.kind == TIMEOUT:
            self.auth.record_timeout()
            return SubmitResult(
                kind=TIMEOUT,
                message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.",
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
                message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.",
            )
        if result.kind in (OFFLINE, ERROR):
            if result.kind == OFFLINE:
                self.auth.record_offline()
            return SubmitResult(
                kind=result.kind,
                message="Tarmoq xatosi. Parol urinishi hisoblanmadi.",
            )
        if result.kind == UNAUTHORIZED:
            phase = self.auth.record_401()
            if phase == LOCKED:
                return SubmitResult(
                    kind=LOCKED,
                    message="Parol noto‘g‘ri. Qulflangan",
                    remaining=self.auth.remaining_seconds(),
                )
            return SubmitResult(
                kind=CONFIRM,
                message="Parol noto‘g‘ri. Qayta kiriting.",
            )
        if result.kind == OK:
            self.auth.record_success()
            self.verified = result.as_device()
            self.password = password
            return SubmitResult(kind=OK, message="Online", device=self.verified)
        return SubmitResult(kind=ERROR, message="Tekshirib bo‘lmadi.")

    def link_to_cloud(self, on_status: StatusFn | None = None) -> SubmitResult:
        """Full provision: rotate/register via ProvisionEngine (Faza 1/2)."""
        from provision import ProvisionEngine

        location_id = (self.location_id or "").strip()
        if not location_id:
            return SubmitResult(
                kind="location",
                message="Lokatsiya tanlanmagan. Ulashdan oldin lokatsiyani tanlang.",
            )
        if not self.has_credentials():
            return SubmitResult(
                kind="no_key",
                message="Pairing token yoki admin kaliti kerak.",
            )

        engine = ProvisionEngine()
        state = str((self.detected_state or {}).get("state") or "")
        if state == STATE_NEW:
            return engine.provision_new(self, self.password or "", location_id, on_status)

        if not self.verified or not self.password:
            return SubmitResult(kind=ERROR, message="Avval parolni tasdiqlang.")
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
            return False, [], msg or f"Qurilmalar ro‘yxati xato (HTTP {code})."
        raw = data.get("devices")
        devices = [d for d in raw if isinstance(d, dict)] if isinstance(raw, list) else []
        return True, devices, "OK"

    @staticmethod
    def match_web_device(
        devices: list[dict[str, Any]],
        *,
        serial: str = "",
        host: str = "",
    ) -> dict[str, Any] | None:
        serial_n = (serial or "").strip().lower()
        host_n = (host or "").strip().lower()
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
                err = err or "Webda faol qurilma yo‘q."
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
            or "Parol topilmadi — qo‘lda kiriting yoki to‘liq Ulash.",
        }

    def reconnect_network(
        self,
        password: str = "",
        on_status: StatusFn | None = None,
        *,
        ip_hint: str | None = None,
    ) -> SubmitResult:
        """Wi‑Fi change: verify existing password, update host/tunnel — no rotate."""
        from provision import ProvisionEngine

        if not self.has_credentials():
            return SubmitResult(
                kind="no_key",
                message="Pairing token yoki admin kaliti kerak.",
            )

        hint = (ip_hint or "").strip()
        if hint:
            chosen = self.choose_ip(hint)
            if chosen is None:
                return SubmitResult(kind=ERROR, message="IP manzil noto‘g‘ri.")
            if not chosen.online:
                return SubmitResult(kind=OFFLINE, message="Qurilma onlayn emas.")
        elif not self.chosen:
            self.scan()
        if not self.chosen or not self.chosen.online:
            return SubmitResult(kind=OFFLINE, message="Qurilma topilmadi yoki onlayn emas.")

        peek = self.peek_reconnect_password(password)
        pwd = (peek.get("password") or password or "").strip()
        if not pwd:
            return SubmitResult(
                kind="empty",
                message=str(
                    peek.get("error")
                    or "Parol topilmadi — qo‘lda kiriting yoki to‘liq Ulash."
                ),
            )
        username = str(peek.get("username") or self.username or "admin").strip() or "admin"
        self.username = username

        if on_status:
            on_status("Parol tekshirilmoqda (o‘zgartirilmaydi)...")
        result = verify_password(
            self.chosen.host,
            int(self.chosen.port or 80),
            username,
            pwd,
        )
        if result.kind == TIMEOUT:
            return SubmitResult(
                kind=TIMEOUT,
                message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.",
            )
        if result.kind == UNAUTHORIZED:
            # Try remaining sources if first peek was wrong.
            tried = {pwd}
            ok, devices, _err = self.fetch_web_devices()
            candidates: list[str] = []
            if ok:
                for d in devices:
                    p = str(d.get("password") or "").strip()
                    if p and p not in tried:
                        candidates.append(p)
            manual = (password or "").strip()
            if manual and manual not in tried:
                candidates.append(manual)
            found = None
            for cand in candidates:
                vr = verify_password(
                    self.chosen.host,
                    int(self.chosen.port or 80),
                    username,
                    cand,
                )
                if vr.kind == OK:
                    found = vr
                    pwd = cand
                    break
                if vr.kind == UNAUTHORIZED:
                    tried.add(cand)
                    continue
                if vr.kind == TIMEOUT:
                    return SubmitResult(
                        kind=TIMEOUT,
                        message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.",
                    )
            if not found:
                return SubmitResult(
                    kind=UNAUTHORIZED,
                    message=(
                        "Parol noto‘g‘ri. Webdagi/yoki lokal parol mos kelmadi — "
                        "qo‘lda kiriting yoki to‘liq Ulash."
                    ),
                )
            result = found

        if result.kind != OK:
            return SubmitResult(
                kind=result.kind,
                message="Parolni tekshirib bo‘lmadi.",
            )

        self.auth.record_success()
        self.verified = result.as_device()
        self.password = pwd

        serial = str((self.verified or {}).get("serialNumber") or "")
        ok, devices, err = self.fetch_web_devices()
        if not ok:
            return SubmitResult(
                kind="api",
                message=err or "Webdan qurilmalar o‘qilmadi.",
            )
        matched = peek.get("device") if isinstance(peek.get("device"), dict) else None
        if not matched or str(matched.get("id") or "") == "":
            matched = self.match_web_device(
                devices,
                serial=serial,
                host=self.chosen.host,
            )
        if not matched or not str(matched.get("id") or "").strip():
            return SubmitResult(
                kind="api",
                message=(
                    "Webdagi qurilma topilmadi (serial mos kelmadi). "
                    "Avval to‘liq Ulash qiling."
                ),
            )

        engine = ProvisionEngine()
        return engine.provision_network_reconnect(
            self,
            pwd,
            device_id=str(matched["id"]),
            on_status=on_status,
        )

    def stop(self) -> None:
        if self.services is not None:
            self.services.stop()
            self.services = None
