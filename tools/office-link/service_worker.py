"""Headless supervisor: keep device-gw + cloudflared running (Windows Service).

Reads data/service.json written by GUI after successful «Ulash».
Writes data/service_status.json and data/tunnel_url.txt for operators.
Autonomously restarts when local GW or Cloudflare tunnel dies.
"""
from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from paths import (  # noqa: E402
    find_root,
    load_config,
    load_service_config,
    read_link_key,
    read_tunnel_url,
    resolve_named_tunnel_url,
    resolve_tunnel_token,
)
from runtime_setup import ServiceBundle, ensure_runtime  # noqa: E402
from tunnel_watch import (  # noqa: E402
    announce_best_effort,
    probe_local_gw,
    probe_tunnel_url,
    restore_tunnel,
    write_status,
)


def _alive(proc) -> bool:
    return proc is not None and proc.poll() is None


def run_forever(poll_sec: float = 8.0) -> int:
    root = find_root()
    cfg = load_config(root)
    svc = load_service_config(root)
    if svc and svc.get("enabled") is False:
        write_status(root, {"ok": False, "state": "disabled", "message": "service.json enabled=false"})
        return 0

    api_url = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    key = read_link_key(root)
    if not api_url:
        write_status(root, {"ok": False, "state": "error", "message": "apiUrl yo‘q"})
        return 1
    if not key:
        write_status(
            root,
            {
                "ok": False,
                "state": "waiting_key",
                "message": "data/link.key yo‘q — avval GUI Ulash yoki pairing",
            },
        )
        while True:
            time.sleep(30)
            key = read_link_key(root)
            if key:
                break
            write_status(
                root,
                {
                    "ok": False,
                    "state": "waiting_key",
                    "message": "data/link.key yo‘q — avval GUI Ulash yoki pairing",
                },
            )

    write_status(root, {"ok": False, "state": "starting", "message": "Runtime tayyorlanmoqda"})
    try:
        ensure_runtime(root)
    except Exception as exc:
        write_status(root, {"ok": False, "state": "error", "message": f"runtime: {exc}"[:240]})
        return 1

    bundle = ServiceBundle()
    bundle.root = root
    mode = "named" if resolve_tunnel_token(cfg, root) else "quick"
    fail_streak = 0

    def restart() -> str:
        nonlocal bundle
        bundle, url = restore_tunnel(root=root, bundle=bundle, keep_bundle=True)
        return url

    try:
        url = restart()
    except Exception as exc:
        write_status(root, {"ok": False, "state": "error", "message": str(exc)[:240]})
        traceback.print_exc()
        return 1

    write_status(
        root,
        {
            "ok": True,
            "state": "running",
            "tunnelMode": mode,
            "tunnelUrl": url or read_tunnel_url(root) or resolve_named_tunnel_url(cfg, root),
            "apiUrl": api_url,
            "tenantCode": tenant,
            "message": "GW + tunnel ishlayapti (auto-heal)",
            "autoHeal": True,
        },
    )

    announce_every = 45.0
    health_every = 20.0
    last_announce = time.monotonic()
    last_health = time.monotonic()

    while True:
        time.sleep(poll_sec)
        gw_ok = _alive(bundle.gw) and probe_local_gw()
        tun_proc = _alive(bundle.tunnel)
        current = (
            bundle.tunnel_url
            or read_tunnel_url(root)
            or resolve_named_tunnel_url(cfg, root)
        )
        need_restart = not gw_ok or not tun_proc

        now = time.monotonic()
        if not need_restart and now - last_health >= health_every:
            last_health = now
            edge = probe_tunnel_url(current) if current else None
            # Quick tunnels: if edge explicitly fails, recreate (new URL + announce).
            if edge is False and mode == "quick":
                need_restart = True
            elif edge is False and mode == "named":
                # Named hostname stable — restart process only.
                need_restart = True

        if not need_restart:
            fail_streak = 0
            if now - last_announce >= announce_every and current:
                announce_best_effort(root, api_url, tenant, current)
                last_announce = now
            write_status(
                root,
                {
                    "ok": True,
                    "state": "running",
                    "tunnelMode": mode,
                    "tunnelUrl": current,
                    "apiUrl": api_url,
                    "tenantCode": tenant,
                    "message": "GW + tunnel ishlayapti (auto-heal)",
                    "autoHeal": True,
                    "gwHttp": True,
                    "tunnelProcess": tun_proc,
                },
            )
            continue

        fail_streak += 1
        write_status(
            root,
            {
                "ok": False,
                "state": "restarting",
                "message": f"auto-heal gw={gw_ok} tunnel_proc={tun_proc} streak={fail_streak}",
                "autoHeal": True,
            },
        )
        try:
            url = restart()
            last_announce = time.monotonic()
            last_health = time.monotonic()
            fail_streak = 0
            write_status(
                root,
                {
                    "ok": True,
                    "state": "running",
                    "tunnelMode": mode,
                    "tunnelUrl": url or read_tunnel_url(root),
                    "apiUrl": api_url,
                    "tenantCode": tenant,
                    "message": "Avtomatik qayta ishga tushirildi",
                    "autoHeal": True,
                },
            )
        except Exception as exc:
            write_status(
                root,
                {
                    "ok": False,
                    "state": "error",
                    "message": f"restart: {exc}"[:240],
                    "autoHeal": True,
                },
            )
            # Exponential-ish backoff, capped.
            time.sleep(min(60, 10 + fail_streak * 5))


if __name__ == "__main__":
    try:
        raise SystemExit(run_forever())
    except KeyboardInterrupt:
        raise SystemExit(0)
