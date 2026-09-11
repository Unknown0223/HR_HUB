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
    mode = "named" if resolve_tunnel_token(cfg, root) else "quick"
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
    tun_http = probe_tunnel_url(url) if url else None

    if gw_http and (tun_http is True or (tun_http is None and tun_proc)):
        ok = True
        message = "GW + tunnel ishlayapti"
    elif not gw_http:
        ok = False
        message = "Lokal gateway (8800) javob bermayapti"
    elif tun_http is False:
        ok = False
        message = "Tunnel URL o‘lik — qayta ochish kerak"
    elif not tun_proc:
        ok = False
        message = "cloudflared jarayoni yo‘q"
    else:
        ok = False
        message = "Tunnel holati noma’lum"

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


def announce_best_effort(root: Path, api_url: str, tenant: str, tunnel_url: str) -> bool:
    key = read_link_key(root)
    if not key or not tunnel_url:
        return False
    try:
        import api_client

        code, _ = api_client.announce(api_url, key, tenant, tunnel_url)
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
    """Restart GW + tunnel, announce new URL, persist handoff files."""
    root = root or find_root()
    cfg = load_config(root)
    svc = load_service_config(root)
    api_url = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    key = read_link_key(root)
    if not api_url:
        raise RuntimeError("apiUrl yo‘q (config / service.json)")
    if not key:
        raise RuntimeError("data/link.key yo‘q — avval Ulash / pairing")

    def emit(msg: str) -> None:
        if on_status:
            on_status(msg)

    emit("Runtime tekshirilmoqda…")
    ensure_runtime(root, on_status)

    if bundle is None:
        bundle = ServiceBundle()
        bundle.root = root
    else:
        emit("Eski GW/tunnel to‘xtatilmoqda…")
        bundle.stop()

    emit("Gateway yoqilmoqda…")
    bundle.gw = start_gateway(api_url, key, root, on_status)
    emit("Tunnel ochilmoqda…")
    proc, url = start_tunnel(root, on_status)
    bundle.tunnel = proc
    bundle.tunnel_url = url
    if not url:
        raise RuntimeError("Tunnel URL olinmadi")

    write_tunnel_url(url, root)
    emit("Platformaga announce…")
    ok = announce_best_effort(root, api_url, tenant, url)
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
            "announced": ok,
            "message": "Tunnel tiklandi" if ok else "Tunnel ochildi (announce xato — qayta uriniladi)",
        },
    )
    if not keep_bundle:
        # Caller owns lifecycle elsewhere (e.g. detached worker).
        pass
    return bundle, url


def spawn_detached_worker(root: Path | None = None) -> bool:
    """Start service_worker.py in background if local GW is not already up."""
    root = root or find_root()
    if probe_local_gw():
        # Someone (GUI / prior worker) already owns :8800 — do not start a second GW.
        return False

    worker = root / "service_worker.py"
    if not worker.is_file():
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
            [py, str(worker)],
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
