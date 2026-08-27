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
from paths import find_root, load_config, read_link_key

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

    def scan(self, prefixes: list[str] | None = None) -> list[OnlineInfo]:
        self.devices = find_devices(prefixes)
        self.chosen = self.devices[0] if len(self.devices) == 1 else None
        if self.devices and self.chosen is None:
            self.chosen = self.devices[0]
        return self.devices

    def choose(self, host: str, port: int = 80) -> OnlineInfo:
        info = probe_online(host, port)
        self.chosen = info
        return info

    def choose_ip(self, ip: str, port: int = 80) -> OnlineInfo | None:
        ip = (ip or "").strip()
        if not valid_ip(ip):
            return None
        return self.choose(ip, port)

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
            return SubmitResult(kind=TIMEOUT, message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.")
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
        import api_client
        import runtime_setup

        if not self.verified or not self.password:
            return SubmitResult(kind=ERROR, message="Avval parolni tasdiqlang.")
        key = read_link_key(self.root)
        if not key:
            return SubmitResult(
                kind="no_key",
                message="Admin avval ADMIN-PAROL.bat ni ishlatishi kerak.",
            )
        runtime_setup.ensure_runtime(self.root, on_status)
        bundle = runtime_setup.ServiceBundle()
        bundle.root = self.root
        try:
            bundle.gw = runtime_setup.start_gateway(
                self.api_url, key, self.root, on_status
            )
            proc, url = runtime_setup.start_tunnel(self.root, on_status)
            bundle.tunnel = proc
            bundle.tunnel_url = url
            if on_status:
                on_status("Platformaga yozilmoqda...")
            code, _ping = api_client.ping(self.api_url, key, self.tenant)
            if code != 200:
                bundle.stop()
                return SubmitResult(
                    kind="api",
                    message="Platformaga ulanmadi. Internet yoki admin kalitini tekshiring.",
                )
            code, _ann = api_client.announce(
                self.api_url, key, self.tenant, url
            )
            if code != 200:
                bundle.stop()
                return SubmitResult(kind="api", message="Tunnel platformaga yozilmadi.")
            code, linked = api_client.register_device(
                self.api_url,
                key,
                self.tenant,
                self.verified,
                self.username,
                self.password,
            )
            if code != 200:
                bundle.stop()
                return SubmitResult(kind="api", message="Qurilma platformaga yozilmadi.")
            self.services = bundle
            dev = linked.get("device") if isinstance(linked, dict) else {}
            name = (dev or {}).get("name") or self.verified.get("name")
            return SubmitResult(
                kind="linked",
                message="Ulandi",
                device={"name": name, "host": self.verified.get("host"), "tunnel": url},
            )
        except Exception as exc:
            bundle.stop()
            return SubmitResult(kind=ERROR, message=str(exc)[:240])

    def stop(self) -> None:
        if self.services is not None:
            self.services.stop()
            self.services = None
