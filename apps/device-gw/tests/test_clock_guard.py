import unittest
from datetime import datetime, timedelta, timezone

from adapters.hikvision_isapi import (
    CLOCK_SKEW_SECONDS,
    HikvisionIsapiAdapter,
    MINOR_LOCAL_LOGIN,
    MINOR_LOCAL_LOGOUT,
)


def adapter() -> HikvisionIsapiAdapter:
    return HikvisionIsapiAdapter(
        host="127.0.0.1",
        username="admin",
        password="Test1234",
    )


class ClockTrustTest(unittest.TestCase):
    def test_rewrites_skewed_punch_to_server_time(self):
        a = adapter()
        drift = -2 * 3600
        punch = {"occurred_at": "2026-08-25T08:00:00+05:00"}
        a._apply_clock_trust([punch], drift)
        self.assertTrue(punch["clock_tamper"])
        self.assertEqual(punch["device_occurred_at"], "2026-08-25T08:00:00+05:00")
        trusted = datetime.fromisoformat(punch["occurred_at"])
        self.assertEqual(trusted.hour, 10)

    def test_small_jitter_not_tamper(self):
        a = adapter()
        punch = {"occurred_at": "2026-08-25T10:00:00+05:00"}
        a._apply_clock_trust([punch], 12)
        self.assertNotIn("clock_tamper", punch)
        self.assertLess(12, CLOCK_SKEW_SECONDS)


class AdminLoginBlockTest(unittest.TestCase):
    def test_blocks_after_login_across_timezones(self):
        a = adapter()
        a.punch_locked = True
        a.admin_login_at = "2026-08-25T05:51:00+00:00"
        self.assertTrue(a._punch_after_admin_login("2026-08-25T10:52:00+05:00"))
        self.assertFalse(a._punch_after_admin_login("2026-08-25T10:40:00+05:00"))

    def test_blocks_unparseable_while_locked(self):
        a = adapter()
        a.punch_locked = True
        a.admin_login_at = "2026-08-25T10:00:00+05:00"
        self.assertTrue(a._punch_after_admin_login(""))

    def test_unlocked_never_blocks(self):
        a = adapter()
        a.punch_locked = False
        a.admin_login_at = "2026-08-25T10:00:00+05:00"
        self.assertFalse(a._punch_after_admin_login("2026-08-25T11:00:00+05:00"))


class UnlockGuardTest(unittest.TestCase):
    def test_unread_clock_keeps_lock(self):
        a = adapter()
        a.punch_locked = True
        a.awaiting_sync_unlock = True
        a.lock_started_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        a.clock_read_ok = False
        a.clock_synced_after_lock = True
        self.assertEqual(a.ready_to_unlock(), "clock_unread")

    def test_unread_clock_skips_align(self):
        import asyncio

        a = adapter()
        a.clock_read_ok = False
        a.punch_locked = True

        async def run():
            return await a.maybe_align_clock(0)

        self.assertFalse(asyncio.run(run()))
        self.assertFalse(a.clock_synced_after_lock)

    def test_login_logout_classifiers(self):
        self.assertTrue(
            HikvisionIsapiAdapter._acs_is_login({"minor": MINOR_LOCAL_LOGIN, "serialNo": 9})
        )
        self.assertTrue(
            HikvisionIsapiAdapter._acs_is_logout({"minor": MINOR_LOCAL_LOGOUT, "serialNo": 10})
        )
        self.assertTrue(
            HikvisionIsapiAdapter._acs_is_login({"minor": 0, "name": "Local Login"})
        )
        self.assertFalse(
            HikvisionIsapiAdapter._acs_is_login({"minor": 75, "name": "Face"})
        )


if __name__ == "__main__":
    unittest.main()
