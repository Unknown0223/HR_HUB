"""Headless supervisor: face agent (+ optional GW/tunnel).

Primary job: pull Web face queue and apply on LAN terminal (no tunnel required).
Optional: keep device-gw + Cloudflare tunnel for remote ISAPI / legacy GW path.

Reads data/service.json written by GUI after successful «Ulash».
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
    tunnel_cooldown_remaining,
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


def _face_tick(root: Path) -> dict:
    try:
        from face_agent import tick_once

        return tick_once(root)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"face_agent: {exc}"[:200]}


def run_forever(poll_sec: float = 8.0) -> int:
    # Prefer the live AppData install when developing from the repo tree,
    # otherwise GUI and worker write different service_status.json files.
    from paths import user_data_root

    root = find_root()
    user_root = user_data_root()
    if (user_root / "data" / "link.key").is_file() or (
        user_root / "data" / "device-credential.json"
    ).is_file():
        root = user_root
    cfg = load_config(root)
    svc = load_service_config(root)
    if svc and svc.get("enabled") is False:
        write_status(root, {"ok": False, "state": "disabled", "message": "service.json enabled=false"})
        return 0

    api_url = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    key = read_link_key(root)
    from paths import read_pairing_token

    pairing = read_pairing_token(root)
    if not api_url:
        write_status(root, {"ok": False, "state": "error", "message": "apiUrl отсутствует"})
        return 1
    if not key and not pairing:
        write_status(
            root,
            {
                "ok": False,
                "state": "waiting_key",
                "message": "Нет data/link.key / pairing.token — сначала подключение в GUI или pairing",
            },
        )
        while True:
            time.sleep(30)
            key = read_link_key(root)
            pairing = read_pairing_token(root)
            if key or pairing:
                break
            write_status(
                root,
                {
                    "ok": False,
                    "state": "waiting_key",
                    "message": "Нет data/link.key / pairing.token — сначала подключение в GUI или pairing",
                },
            )

    write_status(root, {"ok": False, "state": "starting", "message": "Подготовка runtime"})
    try:
        ensure_runtime(root)
    except Exception as exc:
        write_status(root, {"ok": False, "state": "error", "message": f"runtime: {exc}"[:240]})
        return 1

    bundle = ServiceBundle()
    bundle.root = root
    mode = "named" if resolve_tunnel_token(cfg, root) else "quick"
    fail_streak = 0
    tunnel_ok = False
    url = ""

    def restart() -> str:
        nonlocal bundle
        bundle, tun = restore_tunnel(root=root, bundle=bundle, keep_bundle=True)
        return tun

    # Do not poke Cloudflare at all while rate-limited.
    cool0 = tunnel_cooldown_remaining(root)
    if cool0 > 0:
        mins = max(1, (cool0 + 59) // 60)
        write_status(
            root,
            {
                "ok": True,
                "state": "face_agent",
                "tunnelMode": "off",
                "message": (
                    f"Tunnel kutilyapti (Cloudflare limithi ~{mins} daqiqa). "
                    "Avtomatik urinish o‘chirilgan — faqat LAN."
                ),
                "faceAgent": True,
                "autoHeal": False,
            },
        )
    else:
        try:
            url = restart()
            tunnel_ok = bool(url)
        except Exception as exc:
            # Face agent still works on LAN without Cloudflare.
            tunnel_ok = False
            write_status(
                root,
                {
                    "ok": True,
                    "state": "face_agent",
                    "message": f"Tunnel yo‘q — faqat face agent: {exc}"[:240],
                    "faceAgent": True,
                    "autoHeal": False,
                },
            )
            traceback.print_exc()

        if tunnel_ok:
            write_status(
                root,
                {
                    "ok": True,
                    "state": "running",
                    "tunnelMode": mode,
                    "tunnelUrl": url or read_tunnel_url(root) or resolve_named_tunnel_url(cfg, root),
                    "apiUrl": api_url,
                    "tenantCode": tenant,
                    "message": "Face agent + GW/tunnel",
                    "faceAgent": True,
                    "autoHeal": False,
                },
            )

    announce_every = 45.0
    health_every = 20.0
    face_every = 20.0
    last_announce = time.monotonic()
    last_health = time.monotonic()
    last_face = 0.0

    while True:
        time.sleep(poll_sec)
        now = time.monotonic()

        if now - last_face >= face_every:
            last_face = now
            fr = _face_tick(root)
            write_status(
                root,
                {
                    "ok": True,
                    "state": "face_agent" if not tunnel_ok else "running",
                    "tunnelMode": mode if tunnel_ok else "off",
                    "tunnelUrl": url if tunnel_ok else "",
                    "apiUrl": api_url,
                    "tenantCode": tenant,
                    "faceAgent": True,
                    "faceLast": fr,
                    "message": fr.get("message") or "face agent tick",
                    "autoHeal": False,
                },
            )

        # Never spam Cloudflare while rate-limited — face agent keeps working on LAN.
        cool_left = tunnel_cooldown_remaining(root)
        if cool_left > 0:
            mins = max(1, (cool_left + 59) // 60)
            write_status(
                root,
                {
                    "ok": True,
                    "state": "face_agent",
                    "tunnelMode": "off",
                    "tunnelUrl": "",
                    "apiUrl": api_url,
                    "tenantCode": tenant,
                    "faceAgent": True,
                    "autoHeal": False,
                    "message": (
                        f"Tunnel kutilyapti (Cloudflare limithi ~{mins} daqiqa). "
                        "Faqat LAN face sync — avtomatik qayta urinish o‘chirilgan."
                    ),
                },
            )
            time.sleep(min(60, max(5, cool_left)))
            continue

        if not tunnel_ok:
            # Rare manual-style retry only after cooldown, at most 2 times / 5 min.
            if fail_streak < 2 and now - last_health >= 300:
                last_health = now
                try:
                    url = restart()
                    tunnel_ok = bool(url)
                    fail_streak = 0
                except Exception:
                    fail_streak += 1
            continue

        gw_ok = bundle.gw is None or (_alive(bundle.gw) and probe_local_gw())
        tun_proc = _alive(bundle.tunnel)
        current = (
            bundle.tunnel_url
            or read_tunnel_url(root)
            or resolve_named_tunnel_url(cfg, root)
        )
        need_restart = not tun_proc or (bundle.gw is not None and not gw_ok)

        if not need_restart and now - last_health >= health_every:
            last_health = now
            edge = probe_tunnel_url(current) if current else None
            if edge is False:
                need_restart = True

        if not need_restart:
            fail_streak = 0
            if now - last_announce >= announce_every and current:
                announce_best_effort(root, api_url, tenant, current)
                last_announce = now
            continue

        fail_streak += 1
        try:
            url = restart()
            last_announce = time.monotonic()
            last_health = time.monotonic()
            fail_streak = 0
            tunnel_ok = bool(url)
        except Exception as exc:
            tunnel_ok = False
            write_status(
                root,
                {
                    "ok": True,
                    "state": "face_agent",
                    "message": f"tunnel restart fail — face agent: {exc}"[:240],
                    "faceAgent": True,
                    "autoHeal": False,
                },
            )
            time.sleep(min(120, 30 + fail_streak * 15))


if __name__ == "__main__":
    try:
        raise SystemExit(run_forever())
    except KeyboardInterrupt:
        raise SystemExit(0)
