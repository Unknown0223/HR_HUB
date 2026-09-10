"""Harden Hikvision face anti-spoof / live-body settings via ISAPI."""
from __future__ import annotations

import copy
from typing import Any

import httpx
from httpx import DigestAuth

# DS-K1T343MFWX exposes 3 levels (not marketing "4"): general < enhancive < professional
LIVE_DET_LEVEL_MAX = "professional"


def read_live_detection(
    host: str,
    username: str,
    password: str,
    *,
    timeout: float = 10.0,
) -> dict[str, Any]:
    """Return CardReaderCfg live-detection fields (or error dict)."""
    url = f"http://{host}/ISAPI/AccessControl/CardReaderCfg/1?format=json"
    try:
        with httpx.Client(
            auth=DigestAuth(username, password),
            timeout=timeout,
            verify=False,
        ) as client:
            r = client.get(url)
            if r.status_code >= 400:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            data = r.json()
            cfg = data.get("CardReaderCfg") if isinstance(data, dict) else None
            if not isinstance(cfg, dict):
                return {"ok": False, "error": "no CardReaderCfg"}
            return {
                "ok": True,
                "livingBodyDetect": cfg.get("livingBodyDetect"),
                "liveDetLevelSet": cfg.get("liveDetLevelSet"),
                "enableLiveDetAntiAttack": cfg.get("enableLiveDetAntiAttack"),
                "faceMatchThresholdN": cfg.get("faceMatchThresholdN"),
                "ready": (
                    cfg.get("livingBodyDetect") is True
                    and str(cfg.get("liveDetLevelSet") or "").lower()
                    == LIVE_DET_LEVEL_MAX
                    and cfg.get("enableLiveDetAntiAttack") is True
                ),
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


def ensure_live_detection(
    host: str,
    username: str,
    password: str,
    *,
    level: str = LIVE_DET_LEVEL_MAX,
    timeout: float = 12.0,
) -> dict[str, Any]:
    """
    Enable living-body detect at the strongest supported level.
    Best-effort: returns {ok, changed, ...} without raising.
    """
    url = f"http://{host}/ISAPI/AccessControl/CardReaderCfg/1?format=json"
    want = (level or LIVE_DET_LEVEL_MAX).strip() or LIVE_DET_LEVEL_MAX
    try:
        with httpx.Client(
            auth=DigestAuth(username, password),
            timeout=timeout,
            verify=False,
        ) as client:
            r = client.get(url)
            if r.status_code >= 400:
                return {"ok": False, "error": f"GET HTTP {r.status_code}"}
            data = r.json()
            if not isinstance(data, dict) or "CardReaderCfg" not in data:
                return {"ok": False, "error": "no CardReaderCfg"}
            cfg = data["CardReaderCfg"]
            if not isinstance(cfg, dict):
                return {"ok": False, "error": "bad CardReaderCfg"}

            before = {
                "livingBodyDetect": cfg.get("livingBodyDetect"),
                "liveDetLevelSet": cfg.get("liveDetLevelSet"),
                "enableLiveDetAntiAttack": cfg.get("enableLiveDetAntiAttack"),
            }
            need = (
                before["livingBodyDetect"] is not True
                or str(before["liveDetLevelSet"] or "").lower() != want.lower()
                or before["enableLiveDetAntiAttack"] is not True
            )
            if not need:
                return {"ok": True, "changed": False, **before, "level": want}

            body = copy.deepcopy(data)
            body["CardReaderCfg"]["livingBodyDetect"] = True
            body["CardReaderCfg"]["liveDetLevelSet"] = want
            body["CardReaderCfg"]["enableLiveDetAntiAttack"] = True
            put = client.put(url, json=body)
            if put.status_code >= 400:
                return {
                    "ok": False,
                    "error": f"PUT HTTP {put.status_code}",
                    "before": before,
                }
            after = read_live_detection(host, username, password, timeout=timeout)
            return {
                "ok": bool(after.get("ok")),
                "changed": True,
                "before": before,
                "level": want,
                **{k: after.get(k) for k in (
                    "livingBodyDetect",
                    "liveDetLevelSet",
                    "enableLiveDetAntiAttack",
                    "ready",
                )},
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}
