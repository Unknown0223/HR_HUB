from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel


class PunchEvent(BaseModel):
    tenant_id: str
    device_id: str
    employee_external_id: Optional[str] = None
    employee_id: Optional[str] = None
    direction: str = "AUTO"
    occurred_at: str
    source: str
    raw: Optional[dict[str, Any]] = None
    photo_base64: Optional[str] = None


class DeviceAdapter(ABC):
    """Universal device adapter interface (HR HUB Phase 0)."""

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def heartbeat(self) -> bool: ...

    @abstractmethod
    async def upsert_user(self, employee_id: str, name: str) -> bool: ...

    @abstractmethod
    async def enroll_face(
        self,
        employee_id: str,
        face_image_base64: Optional[str] = None,
    ) -> bool: ...

    @abstractmethod
    async def pull_events(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def subscribe_events(self) -> None:
        """Subscribe to real-time events (alertStream). Stub in Phase 0."""
        ...
