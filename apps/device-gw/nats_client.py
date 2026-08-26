from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from adapters.base import PunchEvent

logger = logging.getLogger("nats-publisher")


class PunchPublisher:
    """Publish punches via NATS and/or HTTP ingest to the Nest API."""

    def __init__(
        self,
        url: str,
        subject: str,
        *,
        api_url: Optional[str] = None,
        punch_key: Optional[str] = None,
    ):
        self.url = url
        self.subject = subject
        self.api_url = (api_url or "").rstrip("/") or None
        self.punch_key = (punch_key or "").strip()
        self._nc: Any = None
        # connected | http | unavailable | disconnected
        self.status: str = "disconnected"

    @property
    def server_ready(self) -> bool:
        return self.status in ("connected", "http")

    async def connect(self) -> None:
        try:
            import nats

            self._nc = await nats.connect(self.url, connect_timeout=2)
            self.status = "connected"
            logger.info("NATS connected: %s subject=%s", self.url, self.subject)
        except Exception as exc:  # noqa: BLE001
            self._nc = None
            self.status = "unavailable"
            logger.warning(
                "NATS unavailable (%s) — will use HTTP ingest if configured",
                exc,
            )

        if self.api_url:
            if self.status != "connected":
                self.status = "http"
            logger.info(
                "HTTP punch ingest enabled: %s/api/attendance/punches/ingest",
                self.api_url,
            )
        elif self.status != "connected":
            logger.warning(
                "No NATS and no DEVICE_GW_API_URL — punches will be logged only",
            )

    def _punch_payload(self, punch: PunchEvent) -> dict[str, Any]:
        # Dual-shape payload: camelCase for Nest + snake_case for legacy
        payload: dict[str, Any] = {
            "tenantId": punch.tenant_id,
            "deviceId": punch.device_id,
            "gatewayRef": punch.device_id,
            "employeeExternalId": punch.employee_external_id,
            "employeeId": punch.employee_id,
            "direction": punch.direction,
            "occurredAt": punch.occurred_at,
            "source": punch.source,
            "raw": punch.raw,
            "tenant_id": punch.tenant_id,
            "device_id": punch.device_id,
            "employee_external_id": punch.employee_external_id,
            "occurred_at": punch.occurred_at,
        }
        if punch.photo_base64:
            payload["photoBase64"] = punch.photo_base64
            payload["photo_base64"] = punch.photo_base64
        return payload

    def _safe_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            k: v
            for k, v in payload.items()
            if k not in ("photoBase64", "photo_base64", "raw")
        }

    async def _publish_http(self, payload: dict[str, Any]) -> bool:
        if not self.api_url:
            return False
        body = {
            "tenantId": payload["tenantId"],
            "deviceId": payload.get("deviceId"),
            "gatewayRef": payload.get("gatewayRef") or payload.get("deviceId"),
            "employeeExternalId": payload.get("employeeExternalId"),
            "employeeId": payload.get("employeeId"),
            "direction": payload["direction"],
            "occurredAt": payload["occurredAt"],
            "source": payload.get("source") or "device-gw",
            "raw": payload.get("raw")
            if isinstance(payload.get("raw"), dict)
            else None,
        }
        if payload.get("photoBase64"):
            body["photoBase64"] = payload["photoBase64"]
        headers = {"Content-Type": "application/json"}
        if self.punch_key:
            headers["X-Punch-Key"] = self.punch_key
        url = f"{self.api_url}/api/attendance/punches/ingest"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(url, json=body, headers=headers)
                if res.status_code >= 400:
                    logger.warning(
                        "HTTP punch ingest failed %s: %s %s",
                        res.status_code,
                        url,
                        res.text[:300],
                    )
                    return False
                logger.info("HTTP punch ingest OK → %s", url)
                return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("HTTP punch ingest error: %s", exc)
            return False

    async def publish(self, punch: PunchEvent) -> None:
        payload = self._punch_payload(punch)
        data = json.dumps(payload).encode("utf-8")
        nats_ok = False
        if self._nc is not None:
            try:
                await self._nc.publish(self.subject, data)
                logger.info("Published punch to NATS %s", self.subject)
                nats_ok = True
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "NATS publish failed: %s — %s",
                    exc,
                    self._safe_log(payload),
                )

        http_ok = await self._publish_http(payload)
        if not nats_ok and not http_ok:
            logger.info(
                "PUNCH (no transport) %s %s",
                self.subject,
                self._safe_log(payload),
            )

    async def _publish_heartbeat_http(self, payload: dict[str, Any]) -> bool:
        if not self.api_url:
            return False
        body = {
            "tenantId": payload.get("tenantId") or payload.get("tenant_id"),
            "deviceId": payload.get("deviceId") or payload.get("device_id"),
            "deviceNow": payload.get("deviceNow") or payload.get("device_now"),
            "clockDriftSeconds": payload.get("clockDriftSeconds")
            or payload.get("clock_drift_seconds"),
            "punchLocked": payload.get("punchLocked")
            if "punchLocked" in payload
            else payload.get("punch_locked"),
            "adminLoginDetected": payload.get("adminLoginDetected")
            if "adminLoginDetected" in payload
            else payload.get("admin_login_detected"),
            "adminLoginAt": payload.get("adminLoginAt") or payload.get("admin_login_at"),
            "adminLoginSerial": payload.get("adminLoginSerial")
            or payload.get("admin_login_serial"),
            "authFailed": payload.get("authFailed")
            if "authFailed" in payload
            else payload.get("auth_failed"),
        }
        headers = {"Content-Type": "application/json"}
        if self.punch_key:
            headers["X-Punch-Key"] = self.punch_key
        url = f"{self.api_url}/api/attendance/heartbeats/ingest"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=body, headers=headers)
                if res.status_code >= 400:
                    logger.warning(
                        "HTTP heartbeat ingest failed %s: %s %s",
                        res.status_code,
                        url,
                        res.text[:200],
                    )
                    return False
                return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("HTTP heartbeat ingest error: %s", exc)
            return False

    async def publish_heartbeat(self, payload: dict[str, Any]) -> None:
        # Always try HTTP when configured (Railway has no shared NATS with LAN GW).
        await self._publish_heartbeat_http(payload)
        if self._nc is None:
            return
        data = json.dumps(payload).encode("utf-8")
        try:
            await self._nc.publish(self.subject, data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("NATS heartbeat failed: %s", exc)

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.drain()
            self._nc = None
            self.status = "disconnected"
