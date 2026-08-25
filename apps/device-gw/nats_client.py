from __future__ import annotations

import json
import logging
from typing import Any, Optional

from adapters.base import PunchEvent

logger = logging.getLogger("nats-publisher")


class PunchPublisher:
    def __init__(self, url: str, subject: str):
        self.url = url
        self.subject = subject
        self._nc: Any = None
        self.status: str = "disconnected"

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
                "NATS unavailable (%s) — punches will be logged only",
                exc,
            )

    async def publish(self, punch: PunchEvent) -> None:
        # Dual-shape payload: camelCase for Nest + snake_case for legacy
        payload = {
            "tenantId": punch.tenant_id,
            "deviceId": punch.device_id,
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
        data = json.dumps(payload).encode("utf-8")
        if self._nc is None:
            logger.info("PUNCH (no NATS) %s %s", self.subject, {k: v for k, v in payload.items() if k not in ("photoBase64", "photo_base64")})
            return
        try:
            await self._nc.publish(self.subject, data)
            logger.info("Published punch to %s", self.subject)
        except Exception as exc:  # noqa: BLE001
            logger.warning("NATS publish failed, logging: %s — %s", exc, {k: v for k, v in payload.items() if k not in ("photoBase64", "photo_base64")})

    async def publish_heartbeat(self, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        if self._nc is None:
            return
        try:
            await self._nc.publish(self.subject, data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("NATS heartbeat failed: %s", exc)

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.drain()
            self._nc = None
            self.status = "disconnected"
