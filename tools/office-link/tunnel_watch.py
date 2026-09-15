"""Shared GW + Cloudflare tunnel health checks and autonomous restore."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import URLError
from urllib.request import Request, urlopen

from paths import (
    find_root,
    load_config,
    load_service_config,
    read_link_key,
    read_tunnel_url,
    resolve_named_tunnel_url,
    resolve_tunnel_token,
    runtime_dir,
    service_status_file,
    set_tunnel_cooldown,
    tunnel_cooldown_remaining,
    write_service_config,
    write_tunnel_url,
)
from runtime_setup import (
    CREATE_NO_WINDOW,
    GW_PORT,
    ServiceBundle,
    ensure_runtime,
    start_gateway,
    start_tunnel,
)

StatusFn = Callable[[str], None]


@dataclass
class TunnelHealth:
    gw_process: bool
    tunnel_process: bool
    gw_http: bool
    tunnel_http: bool | None  # None = could not probe (DNS / no URL)
    tunnel_url: str
    mode: str
    ok: bool
    message: str


def probe_local_gw(timeout: float = 2.0) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{GW_PORT}/health", timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = resp.read().decode("utf-8", errors="replace")
            data = json.loads(body) if body.strip().startswith("{") else {}
            return data.get("status") == "ok" or "hr-hub-device-gw" in body
    except Exception:
        return False


def probe_tunnel_url(url: str, timeout: float = 8.0) -> bool | None:
    """Return True/False if reachable; None if URL empty or local DNS likely broken."""
    clean = (url or "").strip().rstrip("/")
    if not clean.startswith("http"):
        return None
    try:
        req = Request(f"{clean}/health", method="GET")
        with urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = resp.read().decode("utf-8", errors="replace")
            return "hr-hub-device-gw" in body or '"status":"ok"' in body.replace(" ", "")
    except URLError as e:
        reason = str(getattr(e, "reason", e)).lower()
        # Windows often cannot resolve *.trycloudflare.com via local DNS.
        if "getaddrinfo" in reason or "name or service" in reason or "11001" in reason:
            return None
        return False
    except Exception:
        return False


def _proc_alive(proc) -> bool:
    return proc is not None and getattr(proc, "poll", lambda: 0)() is None


def snapshot_health(
    bundle: ServiceBundle | None = None,
    root: Path | None = None,
) -> TunnelHealth:
    root = root or find_root()
    cfg = load_config(root)
    svc = load_service_config(root)
    mode = "named" if resolve_tunnel_token(cfg, root) else "quick"
    reach_mode = str(svc.get("reachMode") or "").strip().lower()
    # Direct tunnel to the terminal does not use local :8800 gateway.
    device_reach = reach_mode == "device"
    url = ""
    if bundle is not None:
        url = str(getattr(bundle, "tunnel_url", "") or "").strip()
    if not url:
        url = read_tunnel_url(root) or resolve_named_tunnel_url(cfg, root)

    gw_proc = _proc_alive(getattr(bundle, "gw", None)) if bundle else False
    tun_proc = _proc_alive(getattr(bundle, "tunnel", None)) if bundle else False
    # Also treat pid files as hint when GUI detached.
    if not gw_proc:
        gw_proc = _pidfile_alive(runtime_dir(root) / "gw.pid")
    if not tun_proc:
        tun_proc = _pidfile_alive(runtime_dir(root) / "tunnel.pid")

    gw_http = probe_local_gw()
    # /health is device-gw only; direct terminal tunnels won't match that body.
    tun_http = None
    if url and not device_reach:
        tun_http = probe_tunnel_url(url)
    elif url and tun_proc:
        tun_http = True
    elif url:
        tun_http = probe_tunnel_url(url)

    if device_reach:
        if tun_proc and url:
            ok = True
            message = "Туннель -> терминал работает"
        elif tun_proc:
            ok = False
            message = "cloudflared есть, URL туннеля пуст"
        elif url and tun_http is not False:
            ok = False
            message = "Процесс cloudflared отсутствует — откройте туннель снова"
        else:
            ok = False
            message = "Туннель к терминалу не активен"
    elif gw_http and (tun_http is True or (tun_http is None and tun_proc)):
        ok = True
        message = "Шлюз и туннель работают"
    elif not gw_http:
        ok = False
        message = "Локальный шлюз (8800) не отвечает"
    elif tun_http is False:
        ok = False
        message = "URL туннеля мёртв — нужно открыть снова"
    elif not tun_proc:
        ok = False
        message = "Процесс cloudflared отсутствует"
    else:
        ok = False
        message = "Состояние туннеля неизвестно"

    return TunnelHealth(
        gw_process=gw_proc,
        tunnel_process=tun_proc,
        gw_http=gw_http,
        tunnel_http=tun_http,
        tunnel_url=url,
        mode=mode,
        ok=ok,
        message=message,
    )


def _pidfile_alive(path: Path) -> bool:
    try:
        if not path.is_file():
            return False
        pid = int(path.read_text(encoding="utf-8").strip().splitlines()[0])
        if pid <= 0:
            return False
        if sys.platform == "win32":
            import ctypes

            SYNCHRONIZE = 0x00100000
            handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid)
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def write_status(root: Path, payload: dict) -> None:
    path = service_status_file(root)
    body = dict(payload)
    body["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def announce_best_effort(
    root: Path,
    api_url: str,
    tenant: str,
    tunnel_url: str,
    device_id: str | None = None,
) -> bool:
    from paths import read_pairing_token

    key = read_link_key(root)
    pairing = read_pairing_token(root)
    if (not key and not pairing) or not tunnel_url:
        return False
    try:
        import api_client

        code, _ = api_client.announce(
            api_url,
            key or "",
            tenant,
            tunnel_url,
            pairing_token=pairing or None,
            device_id=device_id,
        )
        return 200 <= int(code) < 300
    except Exception:
        return False


def restore_tunnel(
    *,
    root: Path | None = None,
    bundle: ServiceBundle | None = None,
    on_status: StatusFn | None = None,
    keep_bundle: bool = True,
) -> tuple[ServiceBundle, str]:
    """Open Cloudflare tunnel to the terminal (preferred) so Railway can reach it."""
    root = root or find_root()
    cfg = load_config(root)
    svc = load_service_config(root)
    api_url = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    from paths import read_pairing_token

    key = read_link_key(root)
    pairing = read_pairing_token(root)
    if not api_url:
        raise RuntimeError("apiUrl отсутствует (config / service.json)")
    if not key and not pairing:
        raise RuntimeError("Нет data/link.key / pairing.token — сначала подключение / pairing")

    from credential_store import read_device_credential

    cred = read_device_credential(root) or {}
    host = str(cred.get("host") or svc.get("host") or "").strip()
    port = int(cred.get("port") or svc.get("port") or 80)
    device_id = str(cred.get("deviceId") or svc.get("deviceId") or "").strip()

    def emit(msg: str) -> None:
        if on_status:
            on_status(msg)

    emit("Проверка runtime…")
    ensure_runtime(root, on_status)

    left = tunnel_cooldown_remaining(root)
    if left > 0:
        mins = max(1, (left + 59) // 60)
        raise RuntimeError(
            f"Cloudflare limithi hali kuchda. Yana ~{mins} daqiqa kutib, "
            "keyin bir marta «Восстановить» bosing. "
            "LAN face sync ishlashi mumkin — yuzlar lokal yuklanadi."
        )

    if bundle is None:
        bundle = ServiceBundle()
        bundle.root = root
    else:
        emit("Остановка старого GW/tunnel…")
        bundle.stop()

    # Prefer direct tunnel → terminal so API (Railway) can sync faces.
    target = f"http://{host}:{port}" if host else ""
    try:
        if target:
            emit(f"Туннель -> терминал {host}:{port}...")
            proc, url = start_tunnel(root, on_status, target_url=target)
            bundle.tunnel = proc
            bundle.tunnel_url = url
            bundle.gw = None
        else:
            emit("Запуск gateway…")
            bundle.gw = start_gateway(api_url, key, root, on_status)
            emit("Открытие туннеля…")
            proc, url = start_tunnel(root, on_status)
            bundle.tunnel = proc
            bundle.tunnel_url = url
    except Exception as exc:
        msg = str(exc)
        if "429" in msg or "1015" in msg or "limithi" in msg.lower():
            set_tunnel_cooldown(900, reason="cloudflare_429", root=root)
        raise

    if not url:
        raise RuntimeError("URL туннеля не получен")

    write_tunnel_url(url, root)
    emit("Announce на платформу…")
    ok = announce_best_effort(root, api_url, tenant, url, device_id=device_id or None)
    mode = "named" if resolve_tunnel_token(cfg, root) else "quick"
    write_service_config(
        api_url=api_url,
        tenant=tenant,
        tunnel_mode=mode,
        root=root,
        extra={
            "tunnelUrl": url,
            "namedTunnelUrl": resolve_named_tunnel_url(cfg, root),
            "autoHeal": True,
            "faceAgent": True,
            "deviceId": device_id,
            "host": host,
            "port": port,
            "reachMode": "device" if target else "gw",
        },
    )
    write_status(
        root,
        {
            "ok": True,
            "state": "running",
            "tunnelMode": mode,
            "tunnelUrl": url,
            "apiUrl": api_url,
            "tenantCode": tenant,
            "deviceId": device_id,
            "reachTarget": target or f"127.0.0.1:{GW_PORT}",
            "announced": ok,
            "message": (
                "Server->terminal tunnel OK"
                if ok
                else "Туннель открыт (announce хато — qayta uriniladi)"
            ),
        },
    )
    if not keep_bundle:
        pass
    return bundle, url


def install_startup_task(root: Path | None = None) -> bool:
    """Register ONLOGON scheduled task so tunnel stays up without opening the GUI.

    No admin required for current-user tasks. Returns True if created/updated.
    """
    if sys.platform != "win32":
        return False
    root = root or find_root()
    worker = root / "service_worker.py"
    if not worker.is_file():
        worker = root / "face_worker.py"
    if not worker.is_file():
        return False

    py = sys.executable
    portable = runtime_dir(root) / "python" / "pythonw.exe"
    if portable.is_file():
        py = str(portable)
    elif Path(sys.executable).with_name("pythonw.exe").is_file():
        py = str(Path(sys.executable).with_name("pythonw.exe"))

    tr = f'"{py}" "{worker}"'
    cmd = [
        "schtasks",
        "/Create",
        "/TN",
        "HRHUB-OfficeLink",
        "/TR",
        tr,
        "/SC",
        "ONLOGON",
        "/RL",
        "LIMITED",
        "/F",
    ]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
        )
        return proc.returncode == 0
    except Exception:
        return False


def spawn_detached_worker(root: Path | None = None) -> bool:
    """Start background worker: full service_worker, or face_worker if GW already up."""
    root = root or find_root()
    worker = root / "service_worker.py"
    face_only = root / "face_worker.py"
    if probe_local_gw():
        # Avoid second GW on :8800 — still run LAN face puller.
        target = face_only if face_only.is_file() else worker
    else:
        target = worker if worker.is_file() else face_only
    if not target.is_file():
        return False

    py = sys.executable
    portable = runtime_dir(root) / "python" / "pythonw.exe"
    if portable.is_file():
        py = str(portable)
    elif sys.platform == "win32":
        pyw = Path(sys.executable).with_name("pythonw.exe")
        if pyw.is_file():
            py = str(pyw)

    flags = 0
    if sys.platform == "win32":
        flags = (
            subprocess.DETACHED_PROCESS
            | subprocess.CREATE_NEW_PROCESS_GROUP
            | CREATE_NO_WINDOW
        )
    try:
        subprocess.Popen(
            [py, str(target)],
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
        return True
    except Exception:
        return False
