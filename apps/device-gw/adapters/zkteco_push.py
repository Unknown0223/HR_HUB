"""ZKTeco Push protocol adapter (MVP skeleton — adapter #2).

Real devices POST attendance events to /iclock/cdata; this adapter stores
users locally and accepts pushed punches for gateway→NATS relay.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from .base import DeviceAdapter


class ZktecoPushAdapter(DeviceAdapter):
    """Second vendor adapter after Hikvision — Push / ADMS style."""

    def __init__(self, device_serial: str, host: Optional[str] = None):
        self.device_serial = device_serial
        self.host = host
        self._connected = False
        self._users: dict[str, dict[str, Any]] = {}
        self._queue: list[dict[str, Any]] = []

    async def connect(self) -> None:
        self._connected = True

    async def disconnect(self) -> None:
        self._connected = False

    async def heartbeat(self) -> bool:
        return self._connected

    async def upsert_user(self, employee_id: str, name: str) -> bool:
        self._users[employee_id] = {
            "id": employee_id,
            "name": name,
            "face": False,
            "protocol": "zkteco_push",
        }
        return True

    async def enroll_face(
        self,
        employee_id: str,
        face_image_base64: Optional[str] = None,
    ) -> bool:
        if employee_id not in self._users:
            self._users[employee_id] = {
                "id": employee_id,
                "name": employee_id,
                "face": False,
            }
        self._users[employee_id]["face"] = True
        self._users[employee_id]["has_image"] = bool(face_image_base64)
        return True

    async def pull_events(self) -> list[dict[str, Any]]:
        events = list(self._queue)
        self._queue.clear()
        return events

    async def subscribe_events(self) -> None:
        return None

    async def accept_push(
        self,
        employee_external_id: str,
        direction: str = "IN",
        occurred_at: Optional[str] = None,
    ) -> dict[str, Any]:
        event = {
            "employee_external_id": employee_external_id,
            "direction": direction,
            "occurred_at": occurred_at
            or datetime.now(timezone.utc).isoformat(),
            "source": "zkteco",
            "device_serial": self.device_serial,
        }
        self._queue.append(event)
        return event
