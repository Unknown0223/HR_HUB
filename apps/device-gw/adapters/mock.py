from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from .base import DeviceAdapter


class MockAdapter(DeviceAdapter):
    """Local adapter that stores users in-memory and can emit fake punches."""

    def __init__(self, device_serial: str):
        self.device_serial = device_serial
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
        self._users[employee_id] = {"id": employee_id, "name": name, "face": False}
        return True

    async def enroll_face(
        self,
        employee_id: str,
        face_image_base64: Optional[str] = None,
    ) -> bool:
        if employee_id not in self._users:
            self._users[employee_id] = {"id": employee_id, "name": employee_id, "face": False}
        self._users[employee_id]["face"] = True
        self._users[employee_id]["has_image"] = bool(face_image_base64)
        return True

    async def pull_events(self) -> list[dict[str, Any]]:
        if not self._queue:
            # Auto-generate one punch if users exist
            if self._users:
                eid = next(iter(self._users.keys()))
                await self.emit_punch(eid, "IN")
        events = list(self._queue)
        self._queue.clear()
        return events

    async def subscribe_events(self) -> None:
        # Phase 0: no long-lived stream; use pull_events / emit-mock-punch
        return None

    async def sync_clock(self) -> bool:
        return self._connected

    async def reboot(self) -> bool:
        return self._connected

    async def open_door(self) -> bool:
        return self._connected

    async def emit_punch(
        self,
        employee_external_id: str,
        direction: str = "IN",
    ) -> dict[str, Any]:
        event = {
            "employee_external_id": employee_external_id,
            "direction": direction,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "source": "mock",
            "device_serial": self.device_serial,
        }
        self._queue.append(event)
        return event
