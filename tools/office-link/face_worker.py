"""Lightweight loop: LAN face agent + auto-resume (no GW/tunnel)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from face_agent import tick_once  # noqa: E402
from paths import find_root, load_config, load_service_config, user_data_root  # noqa: E402
from tunnel_watch import write_status  # noqa: E402


def run_forever(poll_sec: float = 20.0) -> int:
    root = find_root()
    user_root = user_data_root()
    if (user_root / "data" / "link.key").is_file() or (
        user_root / "data" / "device-credential.json"
    ).is_file():
        root = user_root

    cfg = load_config(root)
    svc = load_service_config(root) or {}
    api_url = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    last_reconcile = 0.0
    reconcile_every = 90.0

    while True:
        try:
            now = time.monotonic()
            if api_url and now - last_reconcile >= reconcile_every:
                last_reconcile = now
                try:
                    from auto_resume import reconcile_link

                    rec = reconcile_link(root, api_url, tenant)
                    write_status(
                        root,
                        {
                            "ok": True,
                            "state": "face_agent",
                            "faceAgent": True,
                            "autoResume": True,
                            "autoHeal": True,
                            "lastReconcile": rec,
                            "deviceOnline": rec.get("deviceOnline"),
                            "message": (
                                "Qurilma online — davom etmoqda"
                                if rec.get("deviceOnline")
                                else "Qurilma offline — kutilyapti"
                            ),
                        },
                    )
                except Exception as exc:  # noqa: BLE001
                    write_status(
                        root,
                        {
                            "ok": True,
                            "state": "face_agent",
                            "faceAgent": True,
                            "message": f"reconcile: {exc}"[:200],
                        },
                    )

            result = tick_once(root)
            write_status(
                root,
                {
                    "ok": True,
                    "state": "face_agent",
                    "faceAgent": True,
                    "autoResume": True,
                    "faceLast": result,
                    "message": result.get("message") or "face agent",
                },
            )
        except Exception as exc:  # noqa: BLE001
            write_status(
                root,
                {
                    "ok": False,
                    "state": "face_agent_error",
                    "faceAgent": True,
                    "message": str(exc)[:240],
                },
            )
        time.sleep(poll_sec)


if __name__ == "__main__":
    try:
        raise SystemExit(run_forever())
    except KeyboardInterrupt:
        raise SystemExit(0)
