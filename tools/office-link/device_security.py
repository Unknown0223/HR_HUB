"""Harden Hikvision face anti-spoof / live-body settings via ISAPI."""
from __future__ import annotations

import copy
from typing import Any

from isapi_http import digest_httpx

# DS-K1T343MFWX exposes 3 levels (not marketing "4"): general < enhancive < professional
LIVE_DET_LEVEL_MAX = "professional"


def read_live_detection(
    host: str,
    username: str,
    password: str,
    *,
    timeout: float = 10.0,
    port: int = 80,
) -> dict[str, Any]:
    """Return CardReaderCfg live-detection fields (or error dict)."""
    path = "/ISAPI/AccessControl/CardReaderCfg/1?format=json"
    try:
        code, text = digest_httpx(
            host,
            port,
            "GET",
            path,
            username,
            password,
            timeout=(4.0, timeout),
            retries=3,
        )
        if code >= 400:
            return {"ok": False, "error": f"HTTP {code}"}
        import json as _json

        data = _json.loads(text) if text.strip().startswith("{") else {}
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
    port: int = 80,
) -> dict[str, Any]:
    """
    Enable living-body detect at the strongest supported level.
    Best-effort: returns {ok, changed, ...} without raising.
    """
    path = "/ISAPI/AccessControl/CardReaderCfg/1?format=json"
    want = (level or LIVE_DET_LEVEL_MAX).strip() or LIVE_DET_LEVEL_MAX
    try:
        import json as _json

        code, text = digest_httpx(
            host,
            port,
            "GET",
            path,
            username,
            password,
            timeout=(4.0, timeout),
            retries=3,
        )
        if code >= 400:
            return {"ok": False, "error": f"GET HTTP {code}"}
        data = _json.loads(text) if text.strip().startswith("{") else {}
        if not isinstance(data, dict) or "CardReaderCfg" not in data:
            return {"ok": False, "error": "no CardReaderCfg"}
        cfg = data["CardReaderCfg"]
        if not isinstance(cfg, dict):
            return {"ok": False, "error": "bad CardReaderCfg"}

        before = {
            "livingBodyDetect": cfg.get("livingBodyDetect"),
            "liveDetLevelSet": cfg.get("liveDetLevelSet"),
            "enableLiveDetAntiAttack": cfg.get("enableLiveDetAntiAttack"),
            "enable": cfg.get("enable"),
            "faceMatchThresholdN": cfg.get("faceMatchThresholdN"),
        }
        thr_hi = False
        try:
            thr_hi = before["faceMatchThresholdN"] is not None and float(
                before["faceMatchThresholdN"]
            ) > 85
        except (TypeError, ValueError):
            thr_hi = False
        need = (
            before["livingBodyDetect"] is not True
            or str(before["liveDetLevelSet"] or "").lower() != want.lower()
            or before["enableLiveDetAntiAttack"] is not True
            or before["enable"] is False
            or thr_hi
        )
        if not need:
            return {"ok": True, "changed": False, **before, "level": want}

        body = copy.deepcopy(data)
        # Recognition off (punch-lock leftovers) → faces sync but never match.
        if "enable" in body["CardReaderCfg"]:
            body["CardReaderCfg"]["enable"] = True
        body["CardReaderCfg"]["livingBodyDetect"] = True
        body["CardReaderCfg"]["liveDetLevelSet"] = want
        body["CardReaderCfg"]["enableLiveDetAntiAttack"] = True
        # Over-strict match threshold rejects good enrolls at the door.
        thr = body["CardReaderCfg"].get("faceMatchThresholdN")
        try:
            if thr is not None and float(thr) > 85:
                body["CardReaderCfg"]["faceMatchThresholdN"] = 80
        except (TypeError, ValueError):
            pass
        put_code, put_text = digest_httpx(
            host,
            port,
            "PUT",
            path,
            username,
            password,
            json_body=body,
            timeout=(4.0, timeout),
            retries=3,
        )
        if put_code >= 400:
            return {
                "ok": False,
                "error": f"PUT HTTP {put_code}",
                "before": before,
                "detail": (put_text or "")[:120],
            }
        after = read_live_detection(
            host, username, password, timeout=timeout, port=port
        )
        return {
            "ok": bool(after.get("ok")),
            "changed": True,
            "before": before,
            "level": want,
            **{
                k: after.get(k)
                for k in (
                    "livingBodyDetect",
                    "liveDetLevelSet",
                    "enableLiveDetAntiAttack",
                    "ready",
                )
            },
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}
