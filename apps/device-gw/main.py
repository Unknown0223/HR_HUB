"""HR HUB Device Gateway — FastAPI + Hikvision / ZKTeco / Mock adapters."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import httpx

from adapters.base import DeviceAdapter, PunchEvent
from adapters.mock import MockAdapter
from adapters.hikvision_isapi import HikvisionIsapiAdapter, hikvision_password_error
from adapters.zkteco_push import ZktecoPushAdapter
from nats_client import PunchPublisher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("device-gw")


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "extra": "ignore"}

    device_gw_host: str = "0.0.0.0"
    device_gw_port: int = 8000
    device_gw_nats_url: str = "nats://localhost:4222"
    device_gw_nats_subject: str = "hrhub.punch.raw"
    default_adapter: str = "mock"


settings = Settings()
app = FastAPI(
    title="HR HUB Device Gateway",
    version="0.2.0",
    description="Hikvision ISAPI + ZKTeco Push + Mock adapters for Face ID punch events",
)

publisher = PunchPublisher(
    url=settings.device_gw_nats_url,
    subject=settings.device_gw_nats_subject,
)


class AdapterType(str, Enum):
    mock = "mock"
    hikvision_isapi = "hikvision_isapi"
    hikvision = "hikvision"  # alias → hikvision_isapi
    zkteco_push = "zkteco_push"
    zkteco = "zkteco"  # alias → zkteco_push


class DeviceRegister(BaseModel):
    id: Optional[str] = Field(default=None, description="Optional stable id (Nest device UUID)")
    tenant_id: str
    name: str
    serial: str
    adapter: AdapterType = AdapterType.mock
    host: Optional[str] = None
    port: Optional[int] = 80
    username: Optional[str] = None
    password: Optional[str] = None
    model: Optional[str] = Field(default=None, description="e.g. DS-K1T671M")
    use_https: bool = False
    punch_locked: bool = False
    last_admin_login_serial: int = 0
    admin_login_at: Optional[str] = None


class DeviceInfo(BaseModel):
    id: str
    tenant_id: str
    name: str
    serial: str
    adapter: AdapterType
    status: str
    last_seen: Optional[str] = None
    model: Optional[str] = None


class SyncFaceRequest(BaseModel):
    employee_external_id: str
    employee_name: str
    face_image_base64: Optional[str] = None


class DeviceRecord:
    def __init__(self, info: DeviceInfo, adapter_impl: DeviceAdapter):
        self.info = info
        self.adapter = adapter_impl


devices: dict[str, DeviceRecord] = {}


def normalize_adapter(adapter: AdapterType) -> AdapterType:
    if adapter in (AdapterType.hikvision, AdapterType.hikvision_isapi):
        return AdapterType.hikvision_isapi
    if adapter in (AdapterType.zkteco, AdapterType.zkteco_push):
        return AdapterType.zkteco_push
    return AdapterType.mock


def make_adapter(dto: DeviceRegister) -> DeviceAdapter:
    kind = normalize_adapter(dto.adapter)
    if kind == AdapterType.mock:
        return MockAdapter(device_serial=dto.serial)
    if kind == AdapterType.zkteco_push:
        return ZktecoPushAdapter(device_serial=dto.serial, host=dto.host)
    return HikvisionIsapiAdapter(
        host=dto.host or "127.0.0.1",
        port=dto.port or 80,
        username=dto.username or "admin",
        password=dto.password or "",
        model=dto.model,
        use_https=dto.use_https,
    )


@app.on_event("startup")
async def startup() -> None:
    await publisher.connect()
    asyncio.create_task(poll_hikvision_events())


@app.on_event("shutdown")
async def shutdown() -> None:
    await publisher.close()


def punch_from_adapter_event(
    device_id: str, rec: DeviceRecord, ev: dict[str, Any]
) -> PunchEvent:
    photo_b64 = ev.get("photo_base64")
    raw = {k: v for k, v in ev.items() if k != "photo_base64"}
    return PunchEvent(
        tenant_id=rec.info.tenant_id,
        device_id=device_id,
        employee_external_id=ev.get("employee_external_id"),
        direction=ev.get("direction", "AUTO"),
        occurred_at=ev.get("occurred_at") or datetime.now(timezone.utc).isoformat(),
        source=ev.get("source", rec.info.adapter.value),
        raw=raw,
        photo_base64=photo_b64 if isinstance(photo_b64, str) else None,
    )


async def publish_adapter_events(device_id: str, rec: DeviceRecord) -> int:
    events = await rec.adapter.pull_events()
    count = 0
    for ev in events:
        punch = punch_from_adapter_event(device_id, rec, ev)
        await publisher.publish(punch)
        count += 1
    return count


async def apply_admin_login_guard(rec: DeviceRecord) -> bool:
    """Lock punching after local admin password; unlock only after a later sync cycle."""
    if not isinstance(rec.adapter, HikvisionIsapiAdapter):
        return False
    adapter = rec.adapter
    login = await adapter.detect_new_admin_login()
    if login:
        await adapter.lock_punching(login)
        return True
    return False


async def maybe_unlock_after_sync(
    rec: DeviceRecord, locked_this_cycle: bool, hb_ok: bool
) -> None:
    if not isinstance(rec.adapter, HikvisionIsapiAdapter):
        return
    adapter = rec.adapter
    if locked_this_cycle:
        return
    if not hb_ok:
        logger.info("punch unlock deferred — device heartbeat failed")
        return
    reason = adapter.ready_to_unlock()
    if reason is not None:
        if adapter.punch_locked:
            logger.info("punch unlock deferred — %s", reason)
        return
    if publisher.status != "connected":
        logger.info("punch unlock deferred — server NATS not connected")
        return
    await adapter.unlock_punching()


async def poll_hikvision_events() -> None:
    await asyncio.sleep(4)
    while True:
        for device_id, rec in list(devices.items()):
            if rec.info.adapter != AdapterType.hikvision_isapi:
                continue
            try:
                locked_this_cycle = await apply_admin_login_guard(rec)
                n = await publish_adapter_events(device_id, rec)
                drift = 0.0
                device_now = None
                punch_locked = False
                admin_login_at = None
                admin_login_serial = 0
                auth_failed = False
                hb_ok = False
                if isinstance(rec.adapter, HikvisionIsapiAdapter):
                    drift = float(rec.adapter.last_drift_seconds or 0)
                    device_now = rec.adapter.last_device_now_iso
                    punch_locked = bool(rec.adapter.punch_locked)
                    admin_login_at = rec.adapter.admin_login_at
                    admin_login_serial = int(rec.adapter.last_admin_login_serial or 0)
                    hb_ok = await rec.adapter.heartbeat()
                    auth_failed = bool(rec.adapter.auth_failed)
                    if auth_failed:
                        rec.info.status = "auth_failed"
                    elif hb_ok:
                        rec.info.status = "online"
                        rec.info.last_seen = datetime.now(timezone.utc).isoformat()
                    else:
                        rec.info.status = "offline"
                else:
                    hb_ok = True
                    rec.info.last_seen = datetime.now(timezone.utc).isoformat()
                    rec.info.status = "online"
                await publisher.publish_heartbeat(
                    {
                        "type": "heartbeat",
                        "source": "device_heartbeat",
                        "tenantId": rec.info.tenant_id,
                        "deviceId": device_id,
                        "tenant_id": rec.info.tenant_id,
                        "device_id": device_id,
                        "deviceNow": device_now,
                        "clockDriftSeconds": int(round(drift)),
                        "punches": n,
                        "punchLocked": punch_locked,
                        "adminLoginDetected": locked_this_cycle,
                        "adminLoginAt": admin_login_at,
                        "adminLoginSerial": admin_login_serial,
                        "authFailed": auth_failed,
                    }
                )
                await maybe_unlock_after_sync(rec, locked_this_cycle, hb_ok)
            except Exception as exc:  # noqa: BLE001
                rec.info.status = "offline"
                auth_failed = isinstance(rec.adapter, HikvisionIsapiAdapter) and rec.adapter.auth_failed
                if auth_failed:
                    rec.info.status = "auth_failed"
                    try:
                        await publisher.publish_heartbeat(
                            {
                                "type": "heartbeat",
                                "source": "device_heartbeat",
                                "tenantId": rec.info.tenant_id,
                                "deviceId": device_id,
                                "tenant_id": rec.info.tenant_id,
                                "device_id": device_id,
                                "authFailed": True,
                                "punchLocked": bool(rec.adapter.punch_locked),
                                "adminLoginSerial": int(rec.adapter.last_admin_login_serial or 0),
                            }
                        )
                    except Exception:  # noqa: BLE001
                        pass
                logger.warning("event poll %s failed: %s", device_id, exc)
        await asyncio.sleep(8)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "hr-hub-device-gw",
        "nats": publisher.status,
        "devices": len(devices),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/adapters")
async def list_adapters() -> list[dict[str, str]]:
    return [
        {
            "id": "mock",
            "name": "MockAdapter",
            "description": "Emits fake punch events for local E2E without hardware",
        },
        {
            "id": "hikvision_isapi",
            "name": "HikvisionIsapiAdapter",
            "description": "ISAPI: UserInfo, FaceDataRecord, AcsEvent, alertStream",
        },
        {
            "id": "zkteco_push",
            "name": "ZktecoPushAdapter",
            "description": "ZKTeco Push/ADMS MVP — accept pushed punches + user sync",
        },
    ]


@app.get("/devices", response_model=list[DeviceInfo])
async def list_devices() -> list[DeviceInfo]:
    return [d.info for d in devices.values()]


@app.post("/devices", response_model=DeviceInfo)
async def register_device(body: DeviceRegister) -> DeviceInfo:
    kind = normalize_adapter(body.adapter)
    device_id = body.id or str(uuid.uuid4())
    if device_id in devices:
        # Re-register / refresh adapter
        old = devices[device_id]
        await old.adapter.disconnect()

    adapter = make_adapter(body)
    if isinstance(adapter, HikvisionIsapiAdapter):
        adapter.restore_punch_lock(
            locked=body.punch_locked,
            last_serial=body.last_admin_login_serial,
            login_at=body.admin_login_at,
        )
    await adapter.connect()
    if kind == AdapterType.hikvision_isapi:
        if isinstance(adapter, HikvisionIsapiAdapter):
            try:
                await adapter.sync_clock()
            except Exception as exc:  # noqa: BLE001
                logger.warning("sync_clock skipped: %s", exc)
        try:
            await adapter.subscribe_events()
        except Exception as exc:  # noqa: BLE001
            logger.warning("subscribe_events skipped: %s", exc)

    ok = await adapter.heartbeat()
    info = DeviceInfo(
        id=device_id,
        tenant_id=body.tenant_id,
        name=body.name,
        serial=body.serial,
        adapter=kind,
        status="online" if ok or kind == AdapterType.mock else "offline",
        last_seen=datetime.now(timezone.utc).isoformat(),
        model=body.model,
    )
    devices[device_id] = DeviceRecord(info, adapter)
    logger.info("Registered device %s (%s) tenant=%s", device_id, kind, body.tenant_id)
    return info


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=16)


class VerifyPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=16)


@app.post("/devices/{device_id}/change-password")
async def change_password(device_id: str, body: ChangePasswordRequest) -> dict[str, Any]:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    if not isinstance(rec.adapter, HikvisionIsapiAdapter):
        raise HTTPException(400, "Password change is only supported for Hikvision")
    rule = hikvision_password_error(body.new_password, rec.adapter.username or "admin")
    if rule:
        raise HTTPException(400, rule)
    ok, err = await rec.adapter.change_password(body.new_password)
    if not ok:
        raise HTTPException(502, err or "Terminal rejected password change")
    try:
        await rec.adapter.subscribe_events()
    except Exception as exc:  # noqa: BLE001
        logger.warning("resubscribe after password change: %s", exc)
    rec.info.status = "online"
    rec.info.last_seen = datetime.now(timezone.utc).isoformat()
    return {"ok": True, "device_id": device_id}


@app.post("/devices/{device_id}/verify-password")
async def verify_password(device_id: str, body: VerifyPasswordRequest) -> dict[str, Any]:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    if not isinstance(rec.adapter, HikvisionIsapiAdapter):
        raise HTTPException(400, "Password verify is only supported for Hikvision")
    adapter = rec.adapter
    rule = hikvision_password_error(body.password, adapter.username or "admin")
    if rule:
        raise HTTPException(400, rule)
    try:
        async with httpx.AsyncClient(
            base_url=adapter.base_url,
            auth=httpx.DigestAuth(adapter.username or "admin", body.password),
            timeout=httpx.Timeout(8.0, connect=3.0),
            verify=False,
        ) as client:
            resp = await client.get("/ISAPI/System/deviceInfo")
            if resp.status_code >= 400:
                raise HTTPException(401, "Пароль терминала не принят")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Не удалось проверить пароль: {exc}") from exc
    adapter.password = body.password
    adapter.auth_failed = False
    try:
        await adapter.disconnect()
        await adapter.connect()
    except Exception as exc:  # noqa: BLE001
        logger.warning("reconnect after verify-password: %s", exc)
    rec.info.status = "online"
    rec.info.last_seen = datetime.now(timezone.utc).isoformat()
    return {"ok": True, "device_id": device_id}


@app.post("/devices/{device_id}/heartbeat", response_model=DeviceInfo)
async def heartbeat(device_id: str) -> DeviceInfo:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    ok = await rec.adapter.heartbeat()
    rec.info.status = "online" if ok else "offline"
    rec.info.last_seen = datetime.now(timezone.utc).isoformat()
    return rec.info


@app.post("/devices/{device_id}/sync-face")
async def sync_face(device_id: str, body: SyncFaceRequest) -> dict[str, Any]:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    try:
        user_ok = await rec.adapter.upsert_user(
            employee_id=body.employee_external_id,
            name=body.employee_name,
        )
        if not user_ok:
            raise HTTPException(502, "Device rejected UserInfo upsert")
        face_ok = await rec.adapter.enroll_face(
            employee_id=body.employee_external_id,
            face_image_base64=body.face_image_base64,
        )
        if not face_ok:
            raise HTTPException(502, "Device rejected face enroll")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("sync-face failed device=%s: %s", device_id, exc)
        raise HTTPException(502, f"Device sync failed: {exc}") from exc
    return {
        "device_id": device_id,
        "employee_external_id": body.employee_external_id,
        "synced": True,
        "face_enrolled": True,
        "adapter": normalize_adapter(rec.info.adapter).value,
    }


class RemoteCommandRequest(BaseModel):
    action: str


@app.post("/devices/{device_id}/remote")
async def remote_command(device_id: str, body: RemoteCommandRequest) -> dict[str, Any]:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    action = (body.action or "").strip().lower()
    if action == "heartbeat":
        ok = await rec.adapter.heartbeat()
        rec.info.status = "online" if ok else "offline"
        rec.info.last_seen = datetime.now(timezone.utc).isoformat()
        return {"ok": ok, "action": action, "status": rec.info.status}
    if action == "sync_clock":
        fn = getattr(rec.adapter, "sync_clock", None)
        if not callable(fn):
            raise HTTPException(400, "Синхронизация часов не поддерживается")
        ok = await fn()
        return {"ok": bool(ok), "action": action}
    if action == "pull_events":
        events = await rec.adapter.pull_events()
        published = 0
        for ev in events:
            punch = punch_from_adapter_event(device_id, rec, ev)
            await publisher.publish(punch)
            published += 1
        return {"ok": True, "action": action, "count": published}
    if action == "open_door":
        fn = getattr(rec.adapter, "open_door", None)
        if not callable(fn):
            raise HTTPException(400, "Открытие двери не поддерживается")
        ok = await fn()
        return {"ok": bool(ok), "action": action}
    if action == "reboot":
        fn = getattr(rec.adapter, "reboot", None)
        if not callable(fn):
            raise HTTPException(400, "Перезагрузка не поддерживается")
        ok = await fn()
        return {"ok": bool(ok), "action": action}
    raise HTTPException(400, f"Unknown action: {action}")


@app.post("/devices/{device_id}/pull-events")
async def pull_events(device_id: str, publish: bool = True) -> dict[str, Any]:
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    events = await rec.adapter.pull_events()
    published: list[dict[str, Any]] = []
    for ev in events:
        punch = punch_from_adapter_event(device_id, rec, ev)
        if publish:
            await publisher.publish(punch)
        dumped = punch.model_dump()
        dumped.pop("photo_base64", None)
        published.append(dumped)
    return {"count": len(published), "events": published}


@app.post("/devices/{device_id}/emit-mock-punch")
async def emit_mock_punch(
    device_id: str,
    employee_external_id: str = "face-0001",
    direction: str = "IN",
) -> dict[str, Any]:
    """Convenience: force a mock punch and publish to NATS."""
    rec = devices.get(device_id)
    if not rec:
        raise HTTPException(404, "Device not found")
    if not isinstance(rec.adapter, MockAdapter):
        raise HTTPException(400, "Only available for MockAdapter devices")
    punch = await rec.adapter.emit_punch(
        employee_external_id=employee_external_id,
        direction=direction,
    )
    event = PunchEvent(
        tenant_id=rec.info.tenant_id,
        device_id=device_id,
        employee_external_id=punch["employee_external_id"],
        direction=punch["direction"],
        occurred_at=punch["occurred_at"],
        source="mock",
        raw=punch,
    )
    await publisher.publish(event)
    return event.model_dump()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.device_gw_host,
        port=settings.device_gw_port,
        reload=True,
    )
