import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from adapters.hikvision_audit import (
    build_operation_log,
    diff_config,
    flatten_json,
    flatten_xml,
    operation_label,
)
from adapters.hikvision_isapi import ADMIN_AUDIT_MAX_SESSION, HikvisionIsapiAdapter


def adapter() -> HikvisionIsapiAdapter:
    return HikvisionIsapiAdapter(host="127.0.0.1", username="admin", password="Test1234")


class OperationLogTest(unittest.TestCase):
    def test_keeps_session_events_deduped_and_ordered(self):
        items = [
            {"serialNo": 12, "minor": 0x51, "time": "2026-10-04T10:05:00+05:00"},
            {"serialNo": 9, "minor": 0x50, "time": "2026-10-03T09:00:00+05:00"},
            {"serialNo": 10, "minor": 0x50, "time": "2026-10-04T10:00:00+05:00"},
            {"serialNo": 12, "minor": 0x51, "time": "2026-10-04T10:05:00+05:00"},
            {"serialNo": 11, "minor": 0x40A, "time": "2026-10-04T10:02:00+05:00"},
        ]
        log = build_operation_log(items, from_serial=10)
        self.assertEqual([e["serial"] for e in log], [10, 11, 12])
        self.assertTrue(log[1]["local"])
        self.assertEqual(log[1]["code"], "0x40A")

    def test_unknown_minor_keeps_raw_code(self):
        self.assertIn("0x1F3", operation_label(0x1F3))

    def test_carries_who_fields(self):
        log = build_operation_log(
            [{"serialNo": 5, "minor": 0x50, "name": "Ali", "employeeNoString": "17"}]
        )
        self.assertEqual(log[0]["name"], "Ali")
        self.assertEqual(log[0]["employeeNo"], "17")


class FlattenTest(unittest.TestCase):
    def test_xml_leaves_with_repeats(self):
        xml = (
            '<IPAddress version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
            "<addressingType>static</addressingType><ipAddress>10.0.0.5</ipAddress>"
            "<DefaultGateway><ipAddress>10.0.0.1</ipAddress></DefaultGateway></IPAddress>"
        )
        flat = flatten_xml(xml, {"addressingType", "ipAddress"})
        self.assertEqual(
            flat,
            {"addressingType": "static", "ipAddress": "10.0.0.5", "ipAddress[2]": "10.0.0.1"},
        )

    def test_json_nested(self):
        flat = flatten_json({"a": {"b": True, "c": [1, {"d": "x"}]}, "n": None})
        self.assertEqual(flat, {"a.b": "true", "a.c[0]": "1", "a.c[1].d": "x"})


class DiffTest(unittest.TestCase):
    def test_reports_fields_persons_and_skips_volatile(self):
        before = {
            "time": {"timeMode": "NTP", "localTime": "2026-10-04T10:00:00+05:00"},
            "cardReader": {"enable": "true", "faceRecogizeEnable": "1"},
            "persons": {
                "1": {"name": "Ali"},
                "2": {"name": "Vali"},
                "3": {"name": "Sami", "localUIRight": False},
            },
        }
        after = {
            "time": {"timeMode": "manual", "localTime": "2026-10-03T08:00:00+05:00"},
            "cardReader": {"enable": "false", "faceRecogizeEnable": "1"},
            "persons": {
                "1": {"name": "Ali"},
                "3": {"name": "Sami", "localUIRight": True},
                "9": {"name": "Begona"},
                "4": {"name": "Server"},
            },
        }
        changes = diff_config(before, after, by_server={"4"})
        keyed = {(c["section"], c.get("key") or c.get("employeeNo"), c["kind"]): c for c in changes}
        self.assertIn(("time", "timeMode", "changed"), keyed)
        self.assertNotIn(("time", "localTime", "changed"), keyed)
        self.assertNotIn(("cardReader", "enable", "changed"), keyed)
        self.assertIn(("persons", "2", "removed"), keyed)
        self.assertIn(("persons", "9", "added"), keyed)
        self.assertTrue(keyed[("persons", "4", "added")]["byServer"])
        right = keyed[("persons", "localUIRight", "changed")]
        self.assertEqual((right["before"], right["after"]), (False, True))

    def test_no_diff_without_both_sides(self):
        self.assertEqual(diff_config(None, {"time": {}}), [])
        self.assertEqual(diff_config({"persons": {"1": {}}}, {"time": {}}), [])


class AdminSessionTest(unittest.TestCase):
    def test_lock_opens_session_with_baseline_and_login_person(self):
        a = adapter()
        a._config_baseline = {"time": {"timeMode": "NTP"}}
        a._config_baseline_at = datetime.now(timezone.utc)

        async def _noop(enabled: bool) -> bool:
            return True

        a.set_punching_enabled = _noop  # type: ignore[assignment]
        asyncio.run(
            a.lock_punching(
                {"serialNo": 40, "time": "2026-10-04T10:00:00+05:00", "name": "Ali", "employeeNoString": "7"}
            )
        )
        self.assertEqual(a.admin_audit["serial"], 40)
        self.assertEqual(a.admin_audit["before"], {"time": {"timeMode": "NTP"}})
        self.assertEqual(a.admin_audit["loginBy"], {"name": "Ali", "employeeNo": "7"})
        self.assertIsNone(a.admin_audit_due())

    def test_due_on_logout_unlock_or_timeout(self):
        a = adapter()
        a.punch_locked = True
        a._begin_admin_audit({"serialNo": 1}, None)
        a.saw_local_logout = True
        self.assertEqual(a.admin_audit_due(), "logout")
        a.saw_local_logout = False
        a.admin_audit["startedAt"] -= ADMIN_AUDIT_MAX_SESSION + timedelta(seconds=1)
        self.assertEqual(a.admin_audit_due(), "timeout")
        a.punch_locked = False
        self.assertEqual(a.admin_audit_due(), "unlocked")

    def test_restore_after_restart_has_no_baseline(self):
        a = adapter()
        a._config_baseline = {"time": {"timeMode": "NTP"}}
        a.restore_punch_lock(True, 55, "2026-10-04T10:00:00+05:00")
        self.assertIsNone(a.admin_audit["before"])
        self.assertEqual(a.admin_audit["serial"], 55)

    def test_finish_reports_diff_and_rebases(self):
        a = adapter()
        a.punch_locked = True
        a.admin_login_serial = 40
        a.admin_login_at = "2026-10-04T10:00:00+05:00"
        a._begin_admin_audit({"serialNo": 40}, {"persons": {"1": {"name": "Ali"}}})
        a._own_person_changes = {"2"}
        after = {"persons": {"1": {"name": "Ali"}, "2": {"name": "Sync"}, "3": {"name": "X"}}}

        async def _state():
            return after

        async def _ops(serial, login_at):
            self.assertEqual((serial, login_at), (40, "2026-10-04T10:00:00+05:00"))
            return [{"serial": 41, "minor": 0x51}]

        a.read_config_state = _state  # type: ignore[assignment]
        a.fetch_operation_log = _ops  # type: ignore[assignment]
        report = asyncio.run(a.finish_admin_audit("logout"))
        self.assertIsNone(a.admin_audit)
        self.assertTrue(report["diffAvailable"])
        self.assertEqual(report["endReason"], "logout")
        self.assertEqual(report["adminLoginSerial"], 40)
        by_no = {c["employeeNo"]: c for c in report["changes"]}
        self.assertTrue(by_no["2"].get("byServer"))
        self.assertNotIn("byServer", by_no["3"])
        self.assertEqual(a._config_baseline, after)
        self.assertEqual(a._own_person_changes, set())

    def test_isapi_stamp_keeps_offset(self):
        dt = datetime(2026, 10, 4, 9, 5, 7, tzinfo=timezone(timedelta(hours=5)))
        self.assertEqual(HikvisionIsapiAdapter._isapi_stamp(dt), "2026-10-04T09:05:07+05:00")


if __name__ == "__main__":
    unittest.main()
