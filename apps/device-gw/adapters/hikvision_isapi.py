"""Hikvision ISAPI adapter — UserInfo, FaceDataRecord, AcsEvent, alertStream.

Reference (Hikvision TPP): Access Control ISAPI for MinMoe terminals
(DS-K1T671M, DS-K1T341, …). Digest/Basic auth via httpx.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from .base import DeviceAdapter

logger = logging.getLogger("hikvision-isapi")

# Ignore small NTP/network jitter; larger skew is treated as clock tampering.
CLOCK_SKEW_SECONDS = 180
# While online, push server time if the terminal drifted more than this.
CLOCK_ALIGN_SECONDS = 15
# Already close enough — do not write time (avoids fighting the RTC).
CLOCK_MATCH_SECONDS = 2
# Re-check periodically; only write if still off by CLOCK_MATCH_SECONDS.
CLOCK_ALIGN_INTERVAL_SECONDS = 5 * 60
# Do not re-enable punches a few seconds after admin login (menu still open).
PUNCH_LOCK_MIN_SECONDS = 120
# Hikvision ACS operation minors (MAJOR_OPERATION = 3).
MINOR_LOCAL_LOGIN = 80  # 0x50 — admin password entered on the terminal
MINOR_LOCAL_LOGOUT = 81


def _xml_text(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _xml_local(tag: str) -> str:
    return tag.split("}")[-1] if tag else ""


def hikvision_password_error(password: str, username: str = "") -> Optional[str]:
    """Hikvision MinMoe (DS-K1T) activation-password rules."""
    pwd = password or ""
    if len(pwd) < 8 or len(pwd) > 16:
        return "Пароль должен быть от 8 до 16 символов"
    user = (username or "").strip()
    if user and user.lower() in pwd.lower():
        return "Пароль не должен содержать имя пользователя"
    classes = 0
    if any(c.islower() for c in pwd):
        classes += 1
    if any(c.isupper() for c in pwd):
        classes += 1
    if any(c.isdigit() for c in pwd):
        classes += 1
    if any(not c.isalnum() for c in pwd):
        classes += 1
    if classes < 2:
        return (
            "Нужны минимум 2 типа символов: заглавные, строчные, цифры или спецсимволы"
        )
    return None


def isapi_status_message(status_code: int, body: str) -> str:
    text = (body or "").strip()
    if not text:
        return f"HTTP {status_code}"
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            msg = (
                data.get("errorMsg")
                or data.get("subStatusCode")
                or data.get("statusString")
            )
            if msg:
                return str(msg)
    except Exception:  # noqa: BLE001
        pass
    try:
        root = ET.fromstring(text)
        found: dict[str, str] = {}
        for el in root.iter():
            loc = _xml_local(el.tag)
            if el.text and el.text.strip():
                found[loc] = el.text.strip()
        msg = (
            found.get("errorMsg")
            or found.get("subStatusCode")
            or found.get("statusString")
        )
        if msg:
            if msg == "loginPassword" or msg == "MessageParametersLack":
                return "Терминал требует текущий пароль (loginPassword)"
            return msg
    except Exception:  # noqa: BLE001
        pass
    return text[:240]


def hikvision_employee_no(employee_id: str) -> str:
    """DS-K1T343 rejects non-numeric employeeNo (errorMsg=employeeNo)."""
    digits = "".join(ch for ch in str(employee_id) if ch.isdigit())
    if not digits:
        return str(employee_id)[:32]
    return str(int(digits))


class HikvisionIsapiAdapter(DeviceAdapter):
    def __init__(
        self,
        host: str,
        port: int = 80,
        username: str = "admin",
        password: str = "",
        model: Optional[str] = None,
        use_https: bool = False,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.model = model
        self.use_https = use_https
        self._client: Optional[httpx.AsyncClient] = None
        self._subscribe_task: Optional[asyncio.Task] = None
        self._event_queue: list[dict[str, Any]] = []
        self._seen_event_keys: set[str] = set()
        self._on_realtime_event: Optional[Any] = None  # async (punch: dict) -> None
        self.realtime_connected: bool = False
        self.last_realtime_at: Optional[datetime] = None
        self.last_drift_seconds: float = 0.0
        self.last_device_now_iso: Optional[str] = None
        self.last_clock_sync_at: Optional[datetime] = None
        self.punch_locked: bool = False
        self.awaiting_sync_unlock: bool = False
        self.admin_login_at: Optional[str] = None
        self.admin_login_serial: int = 0
        self.last_admin_login_serial: int = 0
        self.lock_method: Optional[str] = None
        self.lock_started_at: Optional[datetime] = None
        self.clock_synced_after_lock: bool = False
        self._saved_card_reader: Optional[tuple[str, dict[str, Any]]] = None
        self.saw_local_logout: bool = False
        self._acs_skip_minors: set[int] = set()
        self.auth_failed: bool = False
        self.clock_read_ok: bool = False
        self.auth_lock_until: Optional[datetime] = None

    @property
    def base_url(self) -> str:
        scheme = "https" if self.use_https else "http"
        return f"{scheme}://{self.host}:{self.port}"

    async def connect(self) -> None:
        # Prefer Digest (typical for Hikvision); fall back handled by httpx DigestAuth
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=httpx.DigestAuth(self.username, self.password),
            timeout=httpx.Timeout(8.0, connect=2.0),
            verify=False,
        )
        logger.info(
            "HikvisionIsapiAdapter connected to %s model=%s",
            self.base_url,
            self.model,
        )
        if self.punch_locked:
            try:
                await self.set_punching_enabled(False)
            except Exception as exc:  # noqa: BLE001
                logger.warning("restore punch lock on connect failed: %s", exc)

    async def disconnect(self) -> None:
        if self._subscribe_task and not self._subscribe_task.done():
            self._subscribe_task.cancel()
            try:
                await self._subscribe_task
            except asyncio.CancelledError:
                pass
            self._subscribe_task = None
        if self._client:
            await self._client.aclose()
            self._client = None

    def auth_locked(self) -> bool:
        if not self.auth_lock_until:
            return False
        if datetime.now(timezone.utc) >= self.auth_lock_until:
            self.auth_lock_until = None
            return False
        return True

    def _note_auth_response(self, resp: httpx.Response) -> None:
        """Parse Hikvision 401 lockStatus/unlockTime to avoid hammering lockouts."""
        if resp.status_code != 401:
            return
        self.auth_failed = True
        text = resp.text or ""
        if "<lockStatus>lock</lockStatus>" not in text and "lockStatus>lock" not in text:
            return
        # unlockTime is seconds remaining
        m = re.search(r"<unlockTime>\s*(\d+)\s*</unlockTime>", text)
        secs = int(m.group(1)) if m else 120
        secs = max(30, min(secs + 5, 3600))
        self.auth_lock_until = datetime.now(timezone.utc) + timedelta(seconds=secs)
        logger.warning(
            "device ISAPI locked — backoff %ss until %s",
            secs,
            self.auth_lock_until.isoformat(),
        )

    async def heartbeat(self) -> bool:
        if not self._client:
            return False
        if self.auth_locked():
            return False
        try:
            resp = await self._client.get("/ISAPI/System/deviceInfo")
            if resp.status_code == 401:
                self._note_auth_response(resp)
                return False
            if resp.status_code < 400:
                self.auth_failed = False
                self.auth_lock_until = None
                return True
            resp2 = await self._client.get("/ISAPI/System/deviceInfo?format=json")
            if resp2.status_code == 401:
                self._note_auth_response(resp2)
                return False
            ok = resp2.status_code < 400
            if ok:
                self.auth_failed = False
                self.auth_lock_until = None
            return ok
        except Exception as exc:  # noqa: BLE001
            logger.warning("heartbeat failed: %s", exc)
            return False

    async def _try_requests(
        self,
        attempts: list[tuple[str, str, dict[str, Any]]],
        ok_log: str,
    ) -> bool:
        """Run HTTP attempts; treat 2xx as success. Skip 401 digest handshake noise."""
        assert self._client is not None
        last_status = 0
        last_body = ""
        last_path = ""
        for method, path, kwargs in attempts:
            try:
                resp = await self._client.request(method, path, **kwargs)
            except Exception as exc:  # noqa: BLE001
                logger.warning("%s %s connection error: %s", method, path, exc)
                continue
            last_status, last_body, last_path = resp.status_code, resp.text[:500], path
            if resp.status_code < 400:
                logger.info("%s via %s %s", ok_log, method, path)
                return True
            logger.warning(
                "%s %s -> %s %s", method, path, resp.status_code, resp.text[:400]
            )
        logger.error(
            "%s failed last=%s %s %s",
            ok_log,
            last_path,
            last_status,
            last_body,
        )
        return False

    async def upsert_user(self, employee_id: str, name: str) -> bool:
        """Create/update person: POST Record, then PUT SetUp/Modify (MinMoe ISAPI)."""
        if not self._client:
            raise RuntimeError("Adapter not connected")

        # Device clocks are often unsynced; Hikvision rejects dates after ~2037.
        begin = "2017-08-01T00:00:00"
        end = "2037-12-31T23:59:59"
        emp_no = hikvision_employee_no(employee_id)
        if emp_no != str(employee_id):
            logger.info("employeeNo normalized %s -> %s", employee_id, emp_no)
        safe_name = (name or emp_no)[:32]
        payload = {
            "UserInfo": {
                "employeeNo": emp_no,
                "name": safe_name,
                "userType": "normal",
                "Valid": {
                    "enable": True,
                    "beginTime": begin,
                    "endTime": end,
                    "timeType": "local",
                },
                "doorRight": "1",
                "RightPlan": [{"doorNo": 1, "planTemplateNo": "1"}],
            }
        }
        xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<UserInfo>
  <employeeNo>{emp_no}</employeeNo>
  <name>{safe_name}</name>
  <userType>normal</userType>
  <Valid>
    <enable>true</enable>
    <beginTime>{begin}</beginTime>
    <endTime>{end}</endTime>
    <timeType>local</timeType>
  </Valid>
  <doorRight>1</doorRight>
</UserInfo>"""
        xml_kw = {
            "content": xml_body.encode("utf-8"),
            "headers": {"Content-Type": "application/xml"},
        }
        return await self._try_requests(
            [
                ("POST", "/ISAPI/AccessControl/UserInfo/Record?format=json", {"json": payload}),
                ("PUT", "/ISAPI/AccessControl/UserInfo/SetUp?format=json", {"json": payload}),
                ("PUT", "/ISAPI/AccessControl/UserInfo/Modify?format=json", {"json": payload}),
                ("POST", "/ISAPI/AccessControl/UserInfo/Record", xml_kw),
                ("PUT", "/ISAPI/AccessControl/UserInfo/SetUp", xml_kw),
            ],
            f"UserInfo upsert employeeNo={emp_no}",
        )

    async def enroll_face(
        self,
        employee_id: str,
        face_image_base64: Optional[str] = None,
    ) -> bool:
        """Upload face picture bound to employeeNo (FaceDataRecord)."""
        if not self._client:
            raise RuntimeError("Adapter not connected")
        if not face_image_base64:
            logger.error("enroll_face requires face_image_base64")
            return False

        b64 = face_image_base64
        if "," in b64 and b64.strip().startswith("data:"):
            b64 = b64.split(",", 1)[1]

        emp_no = hikvision_employee_no(employee_id)
        record = {
            "faceLibType": "blackFD",
            "FDID": "1",
            "FPID": emp_no,
            "employeeNo": emp_no,
        }
        try:
            raw = base64.b64decode(b64, validate=False)
        except Exception as exc:  # noqa: BLE001
            logger.error("face image base64 decode failed: %s", exc)
            return False

        json_attempts: list[tuple[str, str, dict[str, Any]]] = [
            (
                "POST",
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                {"json": {**record, "faceData": b64}},
            ),
            (
                "POST",
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                {"json": {"FaceDataRecord": {**record, "faceData": b64}}},
            ),
        ]
        if await self._try_requests(json_attempts, f"Face enroll json employeeNo={emp_no}"):
            return True

        assert self._client is not None
        files = {
            "FaceDataRecord": (
                None,
                json.dumps(record),
                "application/json",
            ),
            "FaceImage": ("face.jpg", raw, "image/jpeg"),
        }
        try:
            resp = await self._client.post(
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                files=files,
            )
            logger.warning(
                "multipart FaceDataRecord -> %s %s",
                resp.status_code,
                resp.text[:400],
            )
            if resp.status_code < 400:
                logger.info("Face enroll multipart ok employeeNo=%s", emp_no)
                return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("multipart FaceDataRecord error: %s", exc)
        return False

    async def sync_clock(self) -> bool:
        """Align terminal clock with the PC (Uzbekistan UTC+5)."""
        if not self._client:
            return False
        now = datetime.now(timezone(timedelta(hours=5)))
        local = now.strftime("%Y-%m-%dT%H:%M:%S")
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Time>"
            "<timeMode>manual</timeMode>"
            f"<localTime>{local}+05:00</localTime>"
            "<timeZone>CST-5:00:00</timeZone>"
            "</Time>"
        )
        try:
            resp = await self._client.put(
                "/ISAPI/System/time",
                content=xml.encode("utf-8"),
                headers={"Content-Type": "application/xml"},
            )
            ok = resp.status_code < 400
            logger.info("sync_clock %s %s", resp.status_code, resp.text[:200])
            if ok:
                self.last_clock_sync_at = datetime.now(timezone.utc)
                device_now, tz = await self._device_local_now()
                self.last_drift_seconds = self._clock_drift_seconds(device_now, tz)
                tzinfo = self._offset_tz(tz)
                aware = (
                    device_now
                    if device_now.tzinfo is not None
                    else device_now.replace(tzinfo=tzinfo)
                )
                self.last_device_now_iso = aware.isoformat()
                if self.punch_locked and abs(self.last_drift_seconds) <= CLOCK_ALIGN_SECONDS:
                    self.clock_synced_after_lock = True
                logger.info(
                    "sync_clock confirmed drift=%.1fs",
                    self.last_drift_seconds,
                )
            return ok
        except Exception as exc:  # noqa: BLE001
            logger.warning("sync_clock failed: %s", exc)
            return False

    async def reboot(self) -> bool:
        if not self._client:
            return False
        return await self._try_requests(
            [
                (
                    "PUT",
                    "/ISAPI/System/reboot",
                    {
                        "content": b"",
                        "headers": {"Content-Type": "application/xml"},
                    },
                ),
                ("PUT", "/ISAPI/System/reboot?format=json", {}),
            ],
            "reboot",
        )

    async def open_door(self) -> bool:
        if not self._client:
            return False
        xml = (
            b'<?xml version="1.0" encoding="UTF-8"?>'
            b"<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>"
        )
        return await self._try_requests(
            [
                (
                    "PUT",
                    "/ISAPI/AccessControl/RemoteControl/door/1",
                    {"content": xml, "headers": {"Content-Type": "application/xml"}},
                ),
                (
                    "PUT",
                    "/ISAPI/AccessControl/RemoteControl/door/1?format=json",
                    {"json": {"RemoteControlDoor": {"cmd": "open"}}},
                ),
            ],
            "open_door",
        )

    async def maybe_align_clock(self, drift: float) -> bool:
        """Keep the terminal on the server clock whenever we can reach it."""
        if not self.clock_read_ok:
            return False
        if abs(drift) <= CLOCK_MATCH_SECONDS:
            self.last_clock_sync_at = self.last_clock_sync_at or datetime.now(timezone.utc)
            if self.punch_locked:
                self.clock_synced_after_lock = True
            return False
        due_periodic = True
        if self.last_clock_sync_at is not None:
            age = (datetime.now(timezone.utc) - self.last_clock_sync_at).total_seconds()
            due_periodic = age >= CLOCK_ALIGN_INTERVAL_SECONDS
        if abs(drift) < CLOCK_ALIGN_SECONDS and not due_periodic:
            return False
        logger.info(
            "align clock to server drift=%.1fs periodic=%s",
            drift,
            due_periodic and abs(drift) < CLOCK_ALIGN_SECONDS,
        )
        return await self.sync_clock()

    async def _stop_alert_stream(self) -> None:
        if self._subscribe_task and not self._subscribe_task.done():
            self._subscribe_task.cancel()
            try:
                await self._subscribe_task
            except asyncio.CancelledError:
                pass
        self._subscribe_task = None

    async def _security_user_id_with(self, client: httpx.AsyncClient) -> str:
        try:
            resp = await client.get("/ISAPI/Security/users")
            if resp.status_code >= 400:
                return "1"
            root = ET.fromstring(resp.text)
            wanted = (self.username or "admin").lower()
            fallback = "1"
            for el in root.iter():
                if _xml_local(el.tag) != "User":
                    continue
                uid = ""
                uname = ""
                for child in el:
                    loc = _xml_local(child.tag)
                    if loc == "id" and child.text:
                        uid = child.text.strip()
                    elif loc == "userName" and child.text:
                        uname = child.text.strip()
                if uid:
                    fallback = uid
                if uname.lower() == wanted and uid:
                    return uid
            return fallback
        except Exception as exc:  # noqa: BLE001
            logger.warning("security users lookup failed: %s", exc)
            return "1"

    async def change_password(self, new_password: str) -> tuple[bool, str]:
        """Change the terminal admin password via ISAPI, then re-auth.

        DS-K1T343 firmware requires <loginPassword> (current password) or
        it returns 400 MessageParametersLack / errorMsg=loginPassword.
        JSON /users?format=json is not supported on this model.

        Uses a dedicated HTTP client so the long-lived alertStream/poll
        connection cannot cancel the PUT.
        """
        if not new_password:
            return False, "Новый пароль пустой"
        if not (self.password or "").strip():
            return False, "Сначала сохраните текущий ISAPI-пароль устройства"
        rule = hikvision_password_error(new_password, self.username or "admin")
        if rule:
            return False, rule
        user = self.username or "admin"
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                auth=httpx.DigestAuth(user, self.password),
                timeout=httpx.Timeout(15.0, connect=3.0),
                verify=False,
            ) as client:
                uid = await self._security_user_id_with(client)
                xml = (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    "<User>"
                    f"<id>{_xml_text(uid)}</id>"
                    f"<userName>{_xml_text(user)}</userName>"
                    f"<password>{_xml_text(new_password)}</password>"
                    f"<loginPassword>{_xml_text(self.password)}</loginPassword>"
                    "<userLevel>Administrator</userLevel>"
                    "</User>"
                )
                resp = await client.put(
                    f"/ISAPI/Security/users/{uid}",
                    content=xml.encode("utf-8"),
                    headers={"Content-Type": "application/xml"},
                )
                if resp.status_code >= 400:
                    err = isapi_status_message(resp.status_code, resp.text)
                    logger.warning(
                        "change_password %s %s", resp.status_code, resp.text[:300]
                    )
                    return False, f"Терминал отклонил пароль: {err}"
            self.password = new_password
            await self._stop_alert_stream()
            await self.disconnect()
            await self.connect()
            logger.info("change_password OK user=%s", user)
            return True, ""
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "change_password failed: %s %r", type(exc).__name__, exc
            )
            detail = str(exc).strip() or repr(exc)
            return False, f"Ошибка смены пароля: {type(exc).__name__}: {detail}"

    def restore_punch_lock(
        self,
        locked: bool,
        last_serial: int,
        login_at: Optional[str] = None,
    ) -> None:
        """Resume lock state after GW restart (watermark from the API)."""
        self.last_admin_login_serial = max(0, int(last_serial or 0))
        if login_at:
            self.admin_login_at = str(login_at)
        if locked:
            self.punch_locked = True
            self.awaiting_sync_unlock = True
            self.admin_login_serial = self.last_admin_login_serial
            self.lock_started_at = datetime.now(timezone.utc)
            self.clock_synced_after_lock = False
            self.saw_local_logout = False

    async def _search_acs(
        self,
        major: int,
        minor: Optional[int],
        start: str,
        end: str,
        page_size: int = 30,
    ) -> list[dict[str, Any]]:
        """Paginate AcsEvent search. Firmware often returns oldest first."""
        if not self._client:
            return []
        if minor is not None and minor in self._acs_skip_minors:
            return []
        items: list[dict[str, Any]] = []
        position = 0
        try:
            for _ in range(20):
                cond: dict[str, Any] = {
                    "searchID": "1",
                    "searchResultPosition": position,
                    "maxResults": page_size,
                    "major": major,
                    "startTime": start,
                    "endTime": end,
                }
                if minor is not None:
                    cond["minor"] = minor
                resp = await self._client.post(
                    "/ISAPI/AccessControl/AcsEvent?format=json",
                    json={"AcsEventCond": cond},
                    timeout=20.0,
                )
                if resp.status_code >= 400:
                    body = resp.text[:200]
                    if minor is not None and "minor" in body.lower():
                        self._acs_skip_minors.add(minor)
                        logger.info(
                            "AcsEvent minor=%s not supported on this firmware — skip",
                            minor,
                        )
                    else:
                        logger.warning(
                            "AcsEvent search major=%s minor=%s -> %s %s",
                            major,
                            minor,
                            resp.status_code,
                            body,
                        )
                    break
                acs = (resp.json() or {}).get("AcsEvent") or {}
                infos = acs.get("InfoList") or acs.get("Info") or []
                if isinstance(infos, dict):
                    infos = [infos]
                if not infos:
                    break
                items.extend(x for x in infos if isinstance(x, dict))
                if acs.get("responseStatusStrg") != "MORE":
                    break
                position += len(infos)
        except Exception as exc:  # noqa: BLE001
            logger.warning("AcsEvent search failed major=%s minor=%s: %s", major, minor, exc)
        return items

    async def detect_new_admin_login(self) -> Optional[dict[str, Any]]:
        """Return the newest local-admin login newer than the persisted watermark."""
        found: list[dict[str, Any]] = []
        device_now, tz = await self._device_local_now()
        for start, end in self._login_search_windows(device_now, tz):
            found.extend(await self._search_acs(3, MINOR_LOCAL_LOGIN, start, end))
            found.extend(await self._search_acs(3, MINOR_LOCAL_LOGOUT, start, end))
            if not found:
                found.extend(
                    item
                    for item in await self._search_acs(3, None, start, end)
                    if self._acs_is_login(item) or self._acs_is_logout(item)
                )

        newest_login: Optional[dict[str, Any]] = None
        newest_login_serial = self.last_admin_login_serial
        newest_logout_serial = 0
        seen: set[int] = set()
        for item in found:
            serial = int(item.get("serialNo") or 0)
            if serial <= 0 or serial in seen:
                continue
            seen.add(serial)
            minor = int(item.get("minor") or 0)
            if minor == MINOR_LOCAL_LOGOUT or self._acs_is_logout(item):
                if serial > newest_logout_serial:
                    newest_logout_serial = serial
                continue
            if not (minor == MINOR_LOCAL_LOGIN or self._acs_is_login(item)):
                continue
            if serial > newest_login_serial:
                newest_login_serial = serial
                newest_login = item

        if (
            self.punch_locked
            and newest_logout_serial > 0
            and newest_logout_serial >= self.admin_login_serial
        ):
            self.saw_local_logout = True

        if self.last_admin_login_serial <= 0 and not self.punch_locked:
            if newest_login_serial > 0:
                self.last_admin_login_serial = newest_login_serial
                logger.info("admin-login watermark serial=%s", newest_login_serial)
            return None
        return newest_login

    def _login_search_windows(self, device_now: datetime, tz: str) -> list[tuple[str, str]]:
        """Search both device-clock and server-clock days so a rollback cannot hide login."""
        windows: list[tuple[str, str]] = []
        for naive, zone in (
            (device_now, tz),
            (datetime.now(self._offset_tz("+05:00")).replace(tzinfo=None), "+05:00"),
        ):
            start = (naive - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00") + zone
            end = (naive + timedelta(days=1)).strftime("%Y-%m-%dT23:59:59") + zone
            windows.append((start, end))
        return windows

    async def lock_punching(self, login: Optional[dict[str, Any]] = None) -> bool:
        """Disable face/card authentication until a confirmed server sync."""
        serial = int((login or {}).get("serialNo") or 0)
        if serial:
            self.last_admin_login_serial = max(self.last_admin_login_serial, serial)
            self.admin_login_serial = serial
        self.admin_login_at = str(
            (login or {}).get("time") or datetime.now(timezone.utc).isoformat()
        )
        self.lock_started_at = datetime.now(timezone.utc)
        self.clock_synced_after_lock = False
        self.saw_local_logout = False
        ok = await self.set_punching_enabled(False)
        self.punch_locked = True
        self.awaiting_sync_unlock = True
        logger.warning(
            "punch LOCKED after local admin login serial=%s time=%s method=%s ok=%s",
            self.admin_login_serial,
            self.admin_login_at,
            self.lock_method,
            ok,
        )
        return ok

    def ready_to_unlock(self) -> str | None:
        """Return a reason to keep the lock, or None if unlock is safe."""
        if not self.punch_locked or not self.awaiting_sync_unlock:
            return "not_locked"
        if self.lock_started_at is None:
            return "no_lock_start"
        held = (datetime.now(timezone.utc) - self.lock_started_at).total_seconds()
        if held < PUNCH_LOCK_MIN_SECONDS and not self.saw_local_logout:
            return f"hold_{int(held)}s"
        if not self.clock_read_ok:
            return "clock_unread"
        if abs(float(self.last_drift_seconds or 0)) > CLOCK_ALIGN_SECONDS:
            return "clock_not_aligned"
        if not self.clock_synced_after_lock:
            return "clock_not_synced_after_lock"
        return None

    async def unlock_punching(self) -> bool:
        """Re-enable authentication after a clean online sync with the server."""
        ok = await self.set_punching_enabled(True)
        if not ok:
            logger.error("punch unlock failed method=%s — keeping lock", self.lock_method)
            return False
        self.punch_locked = False
        self.awaiting_sync_unlock = False
        self.clock_synced_after_lock = False
        self.saw_local_logout = False
        self.lock_started_at = None
        logger.info(
            "punch UNLOCKED after server sync serial=%s",
            self.last_admin_login_serial,
        )
        return True

    async def set_punching_enabled(self, enabled: bool) -> bool:
        """Best-effort: disable/enable terminal authentication via ISAPI."""
        if not self._client:
            return False
        if await self._set_card_reader_enabled(enabled):
            self.lock_method = "CardReaderCfg"
            return True
        if await self._set_face_recognize_enabled(enabled):
            self.lock_method = "FaceRecognizeMode"
            return True
        logger.error("could not %s punching on device ISAPI", "enable" if enabled else "disable")
        return False

    async def _set_card_reader_enabled(self, enabled: bool) -> bool:
        assert self._client is not None
        paths = (
            "/ISAPI/AccessControl/CardReaderCfg/1?format=json",
            "/ISAPI/AccessControl/CardReaderCfg?format=json",
        )
        for path in paths:
            try:
                resp = await self._client.get(path)
                if resp.status_code >= 400:
                    continue
                data = resp.json() if resp.content else {}
                cfg = data.get("CardReaderCfg") if isinstance(data, dict) else None
                if isinstance(cfg, list):
                    cfg = cfg[0] if cfg else {}
                if not isinstance(cfg, dict) or not cfg:
                    continue
                if not enabled:
                    self._saved_card_reader = (path, dict(cfg))
                payload = dict(cfg)
                if enabled and self._saved_card_reader and self._saved_card_reader[0] == path:
                    payload = dict(self._saved_card_reader[1])
                payload["enable"] = bool(enabled)
                put = await self._client.put(path, json={"CardReaderCfg": payload})
                if put.status_code < 400:
                    logger.info("CardReaderCfg enable=%s via %s", enabled, path)
                    return True
                logger.warning(
                    "CardReaderCfg PUT %s -> %s %s",
                    path,
                    put.status_code,
                    put.text[:300],
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("CardReaderCfg %s failed: %s", path, exc)
        return False

    async def _set_face_recognize_enabled(self, enabled: bool) -> bool:
        assert self._client is not None
        path = "/ISAPI/AccessControl/FaceRecognizeMode?format=json"
        try:
            resp = await self._client.get(path)
            mode: dict[str, Any] = {}
            if resp.status_code < 400 and resp.content:
                data = resp.json()
                raw = data.get("FaceRecognizeMode") if isinstance(data, dict) else None
                if isinstance(raw, dict):
                    mode = dict(raw)
            mode["enable"] = bool(enabled)
            mode["mode"] = "enable" if enabled else "disable"
            put = await self._client.put(path, json={"FaceRecognizeMode": mode})
            if put.status_code < 400:
                logger.info("FaceRecognizeMode enable=%s", enabled)
                return True
            logger.warning(
                "FaceRecognizeMode PUT -> %s %s", put.status_code, put.text[:300]
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("FaceRecognizeMode failed: %s", exc)
        return False

    async def _device_local_now(self) -> tuple[datetime, str]:
        """Return (naive local datetime, ISO offset like +05:00).

        DS-K1T343 AcsEvent search is picky: a calendar day without the
        timezone suffix often returns NO MATCH even when events exist.
        """
        fallback_tz = "+05:00"
        self.clock_read_ok = False
        if not self._client:
            return datetime.now(), fallback_tz
        try:
            resp = await self._client.get("/ISAPI/System/time")
            if resp.status_code < 400 and b"<localTime>" in resp.content:
                raw = resp.text
                start = raw.find("<localTime>") + len("<localTime>")
                end = raw.find("</localTime>")
                stamp = raw[start:end].strip()
                tz = fallback_tz
                if len(stamp) >= 25 and stamp[19] in "+-":
                    tz = stamp[19:25]
                naive = datetime.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S")
                self.clock_read_ok = True
                return naive, tz
        except Exception:
            pass
        return datetime.now(), fallback_tz

    @staticmethod
    def _offset_tz(tz: str) -> timezone:
        sign = 1 if str(tz).startswith("+") else -1
        hours = int(str(tz)[1:3] or 0)
        mins = int(str(tz)[4:6] or 0)
        return timezone(sign * timedelta(hours=hours, minutes=mins))

    def _clock_drift_seconds(self, device_now: datetime, tz: str) -> float:
        device_aware = (
            device_now
            if device_now.tzinfo is not None
            else device_now.replace(tzinfo=self._offset_tz(tz))
        )
        server_now = datetime.now(self._offset_tz(tz))
        return (device_aware - server_now).total_seconds()

    def _apply_clock_trust(self, punches: list[dict[str, Any]], drift: float) -> None:
        """Rewrite punch time to server-trusted time if the terminal clock is skewed.

        Fraud: set device clock back, punch late, appear on time.
        true_time = device_event_time - drift, where drift = device_now - server_now.
        """
        for punch in punches:
            punch["clock_drift_seconds"] = int(round(drift))
            if abs(drift) <= CLOCK_SKEW_SECONDS:
                continue
            punch["clock_tamper"] = True
            punch["device_occurred_at"] = punch.get("occurred_at")
            try:
                event_at = datetime.fromisoformat(
                    str(punch.get("occurred_at") or "").replace("Z", "+00:00")
                )
                trusted = event_at - timedelta(seconds=drift)
                punch["occurred_at"] = trusted.isoformat()
            except ValueError:
                punch["occurred_at"] = datetime.now(timezone.utc).isoformat()

    def _punch_from_acs_item(self, item: dict[str, Any]) -> dict[str, Any] | None:
        eid = (
            item.get("employeeNoString")
            or item.get("employeeNo")
            or item.get("cardNo")
        )
        if not eid:
            return None
        key = str(item.get("serialNo") or f"{eid}:{item.get('time')}")
        if key in self._seen_event_keys:
            return None
        self._seen_event_keys.add(key)
        if len(self._seen_event_keys) > 800:
            self._seen_event_keys = set(list(self._seen_event_keys)[-400:])
        punch = {
            "employee_external_id": hikvision_employee_no(str(eid)),
            "direction": self._map_direction(item),
            "occurred_at": item.get("time")
            or datetime.now(timezone.utc).isoformat(),
            "source": "hikvision_isapi",
            "serial_no": item.get("serialNo"),
            "raw": item,
        }
        if self._punch_after_admin_login(str(punch["occurred_at"])):
            punch["admin_login_blocked"] = True
        return punch

    @staticmethod
    def _time_stamp(raw: Any) -> str:
        return str(raw or "").strip()[:19]

    @staticmethod
    def _acs_blob(item: dict[str, Any]) -> str:
        return " ".join(str(v).lower() for v in item.values() if isinstance(v, (str, int)))

    @classmethod
    def _acs_is_login(cls, item: dict[str, Any]) -> bool:
        minor = int(item.get("minor") or 0)
        if minor == MINOR_LOCAL_LOGIN:
            return True
        blob = cls._acs_blob(item)
        return "local login" in blob or "locallogin" in blob

    @classmethod
    def _acs_is_logout(cls, item: dict[str, Any]) -> bool:
        minor = int(item.get("minor") or 0)
        if minor == MINOR_LOCAL_LOGOUT:
            return True
        blob = cls._acs_blob(item)
        return "local logout" in blob or "locallogout" in blob

    def _as_dt(self, raw: str) -> Optional[datetime]:
        s = str(raw or "").strip().replace("Z", "+00:00")
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            try:
                dt = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone(timedelta(hours=5)))
        return dt

    def _punch_after_admin_login(self, occurred_at: str) -> bool:
        """Only marks after the admin login are blocked — never the whole day."""
        if not self.punch_locked:
            return False
        login = self._as_dt(str(self.admin_login_at or ""))
        punch = self._as_dt(occurred_at)
        if not login or not punch:
            return True
        return punch >= login - timedelta(seconds=2)

    async def _fetch_capture_jpeg(self, picture_url: Any) -> Optional[str]:
        """Download the terminal snapshot taken at punch time (digest auth)."""
        if not self._client or not isinstance(picture_url, str) or not picture_url:
            return None
        try:
            resp = await self._client.get(picture_url, timeout=12.0)
            if resp.status_code >= 400 or not resp.content.startswith(b"\xff\xd8"):
                logger.warning(
                    "capture jpeg %s bytes=%s url=%s",
                    resp.status_code,
                    len(resp.content),
                    picture_url[-80:],
                )
                return None
            return base64.b64encode(resp.content).decode("ascii")
        except Exception as exc:  # noqa: BLE001
            logger.warning("capture jpeg failed: %s", exc)
            return None

    async def _attach_capture_photos(self, punches: list[dict[str, Any]]) -> None:
        """Attach snapshot only for punches that survive the 60s ingest dedupe."""
        last_kept: dict[str, datetime] = {}
        attached = 0
        for punch in punches:
            eid = str(punch.get("employee_external_id") or "")
            try:
                occurred = datetime.fromisoformat(
                    str(punch.get("occurred_at") or "").replace("Z", "+00:00")
                )
            except ValueError:
                occurred = datetime.now(timezone.utc)
            prev = last_kept.get(eid)
            if prev is not None and (occurred - prev).total_seconds() < 60:
                continue
            last_kept[eid] = occurred
            item = punch.get("raw") if isinstance(punch.get("raw"), dict) else {}
            b64 = await self._fetch_capture_jpeg(
                item.get("pictureURL") if isinstance(item, dict) else None
            )
            if b64:
                punch["photo_base64"] = b64
                attached += 1
        if attached:
            logger.info("AcsEvent attached %s capture photos", attached)

    async def pull_events(self) -> list[dict[str, Any]]:
        """Search recent successful face events (minor 75) on the device clock."""
        if not self._client:
            return []

        queued = list(self._event_queue)
        self._event_queue.clear()
        for punch in queued:
            if self._punch_after_admin_login(str(punch.get("occurred_at") or "")):
                punch["admin_login_blocked"] = True

        device_now, tz = await self._device_local_now()
        day = device_now.strftime("%Y-%m-%d")
        yesterday = (device_now - timedelta(days=1)).strftime("%Y-%m-%d")
        start = f"{yesterday}T00:00:00{tz}"
        end = f"{day}T23:59:59{tz}"
        punches: list[dict[str, Any]] = list(queued)
        position = 0
        page_size = 30
        try:
            for _ in range(20):
                body = {
                    "AcsEventCond": {
                        "searchID": "1",
                        "searchResultPosition": position,
                        "maxResults": page_size,
                        "major": 5,
                        "minor": 75,
                        "startTime": start,
                        "endTime": end,
                    }
                }
                resp = await self._client.post(
                    "/ISAPI/AccessControl/AcsEvent?format=json",
                    json=body,
                    timeout=20.0,
                )
                if resp.status_code >= 400:
                    logger.warning(
                        "AcsEvent pull %s %s", resp.status_code, resp.text[:200]
                    )
                    break
                data = resp.json()
                acs = data.get("AcsEvent") or {}
                infos = acs.get("InfoList") or acs.get("Info") or []
                if isinstance(infos, dict):
                    infos = [infos]
                strg = acs.get("responseStatusStrg")
                total = acs.get("totalMatches")
                if not infos:
                    if len(punches) == len(queued):
                        logger.info(
                            "AcsEvent empty strg=%s total=%s window=%s..%s",
                            strg,
                            total,
                            start,
                            end,
                        )
                    break
                for item in infos:
                    punch = self._punch_from_acs_item(item)
                    if punch:
                        punches.append(punch)
                if strg != "MORE":
                    break
                position += len(infos)
            if self.clock_read_ok:
                drift = self._clock_drift_seconds(device_now, tz)
                self.last_drift_seconds = drift
                tzinfo = self._offset_tz(tz)
                aware = (
                    device_now
                    if device_now.tzinfo is not None
                    else device_now.replace(tzinfo=tzinfo)
                )
                self.last_device_now_iso = aware.isoformat()
                if punches:
                    await self._attach_capture_photos(punches)
                    self._apply_clock_trust(punches, drift)
                    logger.info(
                        "AcsEvent pulled %s new punches window=%s..%s drift=%ss",
                        len(punches),
                        start,
                        end,
                        int(round(drift)),
                    )
                if abs(drift) > CLOCK_SKEW_SECONDS:
                    logger.warning(
                        "device clock drift %.0fs (threshold %ss) — resync",
                        drift,
                        CLOCK_SKEW_SECONDS,
                    )
                await self.maybe_align_clock(drift)
            else:
                logger.warning("device clock unread — skip trust rewrite/align")
                if punches:
                    await self._attach_capture_photos(punches)
            return punches
        except Exception as exc:  # noqa: BLE001
            logger.warning("AcsEvent pull failed: %s", exc)
            return punches

    async def subscribe_events(self, on_event: Any = None) -> None:
        """Start background alertStream consumer (realtime punches)."""
        if on_event is not None:
            self._on_realtime_event = on_event
        if not self._client:
            return
        if self._subscribe_task and not self._subscribe_task.done():
            return
        self._subscribe_task = asyncio.create_task(self._alert_stream_loop())

    async def _alert_stream_loop(self) -> None:
        """Long-lived multipart alertStream → queue + optional realtime callback."""
        assert self._client is not None
        # Dedicated client so poll/heartbeat timeouts cannot cancel the stream.
        stream_client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=httpx.DigestAuth(self.username, self.password),
            timeout=httpx.Timeout(None, connect=5.0),
            verify=False,
        )
        url = "/ISAPI/Event/notification/alertStream"
        logger.info("Starting alertStream subscribe on %s", self.base_url)
        try:
            while True:
                if self.auth_locked():
                    wait = max(
                        5.0,
                        (self.auth_lock_until - datetime.now(timezone.utc)).total_seconds()
                        if self.auth_lock_until
                        else 5.0,
                    )
                    await asyncio.sleep(min(wait, 600))
                    continue
                try:
                    async with stream_client.stream("GET", url) as resp:
                        if resp.status_code >= 400:
                            self.realtime_connected = False
                            self._note_auth_response(resp)
                            logger.warning(
                                "alertStream %s status %s", url, resp.status_code
                            )
                            wait = 5.0
                            if self.auth_lock_until:
                                wait = max(
                                    5.0,
                                    (
                                        self.auth_lock_until
                                        - datetime.now(timezone.utc)
                                    ).total_seconds(),
                                )
                            await asyncio.sleep(min(wait, 600))
                            continue
                        self.realtime_connected = True
                        logger.info("alertStream connected %s", self.base_url)
                        boundary = b"--MIME_boundary"
                        buffer = b""
                        async for chunk in resp.aiter_bytes():
                            buffer += chunk
                            if len(buffer) > 4_000_000:
                                buffer = buffer[-500_000:]
                            while True:
                                start = buffer.find(boundary)
                                if start < 0:
                                    break
                                nxt = buffer.find(boundary, start + len(boundary))
                                if nxt < 0:
                                    buffer = buffer[start:]
                                    break
                                part = buffer[start:nxt]
                                buffer = buffer[nxt:]
                                await self._handle_alert_mime_part(part)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    self.realtime_connected = False
                    logger.warning("alertStream disconnected: %s — retry in 5s", exc)
                    await asyncio.sleep(5)
        finally:
            self.realtime_connected = False
            await stream_client.aclose()

    async def _handle_alert_mime_part(self, part: bytes) -> None:
        text = part.decode("utf-8", errors="ignore")
        # Skip pure binary image parts without JSON
        if "{" not in text:
            return
        for data in self._extract_json_objects(text):
            punch = self._punch_from_alert_payload(data)
            if not punch:
                continue
            self.last_realtime_at = datetime.now(timezone.utc)
            logger.info(
                "realtime punch emp=%s at=%s",
                punch.get("employee_external_id"),
                punch.get("occurred_at"),
            )
            cb = self._on_realtime_event
            if cb is not None:
                try:
                    result = cb(punch)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as exc:  # noqa: BLE001
                    logger.warning("realtime callback failed: %s", exc)
                    # Fallback: keep for poll publisher
                    self._event_queue.append(punch)
            else:
                self._event_queue.append(punch)

    @staticmethod
    def _extract_json_objects(text: str) -> list[dict[str, Any]]:
        """Extract top-level JSON objects with brace counting (nested-safe)."""
        objs: list[dict[str, Any]] = []
        i = 0
        n = len(text)
        while i < n:
            start = text.find("{", i)
            if start < 0:
                break
            depth = 0
            in_str = False
            esc = False
            end: Optional[int] = None
            for j in range(start, n):
                ch = text[j]
                if in_str:
                    if esc:
                        esc = False
                    elif ch == "\\":
                        esc = True
                    elif ch == '"':
                        in_str = False
                    continue
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = j + 1
                        break
            if end is None:
                break
            try:
                data = json.loads(text[start:end])
                if isinstance(data, dict):
                    objs.append(data)
            except Exception:  # noqa: BLE001
                pass
            i = end
        return objs

    # Face / card / fingerprint success minors on DS-K1T (major=5 access events).
    _AUTH_OK_MINORS = frozenset({1, 38, 39, 75, 76})

    def _punch_from_alert_payload(self, data: dict[str, Any]) -> dict[str, Any] | None:
        event = data.get("AccessControllerEvent")
        if not isinstance(event, dict):
            event = data.get("EventNotificationAlert")
        if not isinstance(event, dict):
            # Some firmwares nest under EventNotificationAlert.AccessControllerEvent
            if isinstance(data.get("EventNotificationAlert"), dict):
                nested = data["EventNotificationAlert"].get("AccessControllerEvent")
                event = nested if isinstance(nested, dict) else None
        if not isinstance(event, dict):
            return None

        minor = int(event.get("subEventType") or event.get("minor") or 0)
        major = int(event.get("majorEventType") or event.get("major") or 0)
        eid = (
            event.get("employeeNoString")
            or event.get("employeeNo")
            or event.get("cardNo")
        )
        if not eid:
            return None
        # Prefer known auth-success minors; still accept if major=5 and name present.
        if major in (0, 5) and minor and minor not in self._AUTH_OK_MINORS:
            if not (event.get("name") or event.get("attendanceStatus")):
                return None

        item = dict(event)
        if not item.get("time"):
            item["time"] = data.get("dateTime") or event.get("dateTime")
        if item.get("minor") is None and minor:
            item["minor"] = minor
        if item.get("major") is None and major:
            item["major"] = major
        punch = self._punch_from_acs_item(item)
        if punch:
            punch["source"] = "hikvision_isapi_realtime"
            raw = punch.get("raw") if isinstance(punch.get("raw"), dict) else {}
            punch["raw"] = {**raw, "realtime": True, "alert": data}
        return punch

    def _try_parse_event_chunk(self, piece: bytes) -> None:
        """Legacy single-chunk parser (kept for tests); prefer MIME path."""
        for data in self._extract_json_objects(piece.decode("utf-8", errors="ignore")):
            punch = self._punch_from_alert_payload(data)
            if punch:
                self._event_queue.append(punch)
        # XML fallback
        try:
            root = ET.fromstring(piece.decode("utf-8", errors="ignore"))
            eid = root.findtext(".//employeeNoString") or root.findtext(".//employeeNo")
            if not eid:
                return
            punch = self._punch_from_acs_item(
                {
                    "employeeNoString": eid,
                    "time": root.findtext(".//dateTime")
                    or datetime.now(timezone.utc).isoformat(),
                    "minor": 75,
                    "major": 5,
                }
            )
            if punch:
                punch["source"] = "hikvision_isapi_realtime"
                self._event_queue.append(punch)
        except Exception:
            return

    @staticmethod
    def _map_direction(item: dict[str, Any]) -> str:
        # attendanceStatus / currentVerifyMode hints; default AUTO
        status = str(item.get("attendanceStatus") or item.get("type") or "").lower()
        if "checkin" in status or status in ("1", "in"):
            return "IN"
        if "checkout" in status or status in ("2", "out"):
            return "OUT"
        return "AUTO"
