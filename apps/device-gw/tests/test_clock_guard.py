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
    def test_keeps_device_time_when_skewed(self):
        a = adapter()
        a.last_device_now_iso = "2026-08-25T10:05:00+05:00"
        drift = -2 * 3600
        punch = {"occurred_at": "2026-08-25T08:00:00+05:00"}
        a._apply_clock_trust([punch], drift)
        self.assertTrue(punch["clock_tamper"])
        self.assertEqual(punch["device_occurred_at"], "2026-08-25T08:00:00+05:00")
        self.assertEqual(punch["occurred_at"], "2026-08-25T08:00:00+05:00")

    def test_small_jitter_not_tamper(self):
        a = adapter()
        punch = {"occurred_at": "2026-08-25T10:00:00+05:00"}
        a._apply_clock_trust([punch], 12)
        self.assertNotIn("clock_tamper", punch)
        self.assertLess(12, CLOCK_SKEW_SECONDS)


class AdminLoginBlockTest(unittest.TestCase):
    def test_blocks_after_login_only_when_time_changed(self):
        a = adapter()
        a.punch_locked = True
        a.time_changed_after_lock = True
        a.admin_login_at = "2026-08-25T05:51:00+00:00"
        self.assertTrue(a._punch_after_admin_login("2026-08-25T10:52:00+05:00"))
        self.assertFalse(a._punch_after_admin_login("2026-08-25T10:40:00+05:00"))

    def test_admin_login_alone_does_not_block(self):
        a = adapter()
        a.punch_locked = True
        a.time_changed_after_lock = False
        a.admin_login_at = "2026-08-25T10:00:00+05:00"
        self.assertFalse(a._punch_after_admin_login("2026-08-25T11:00:00+05:00"))

    def test_blocks_unparseable_while_locked_and_time_changed(self):
        a = adapter()
        a.punch_locked = True
        a.time_changed_after_lock = True
        a.admin_login_at = "2026-08-25T10:00:00+05:00"
        self.assertTrue(a._punch_after_admin_login(""))

    def test_unlocked_never_blocks_new_marks(self):
        a = adapter()
        a.punch_locked = False
        a.time_changed_after_lock = False
        a.admin_login_at = "2026-08-25T10:00:00+05:00"
        a.fraud_window_start = "2026-08-25T10:00:00+05:00"
        a.fraud_window_end = "2026-08-25T10:30:00+05:00"
        # Inside fraud window — still blocked after unlock
        self.assertTrue(a._punch_after_admin_login("2026-08-25T10:15:00+05:00"))
        # After clock sync unlock — new real marks accepted
        self.assertFalse(a._punch_after_admin_login("2026-08-25T11:00:00+05:00"))


class OfflineClockTrustTest(unittest.TestCase):
    def test_historical_offline_not_tampered_when_clock_wrong_now(self):
        a = adapter()
        a.last_device_now_iso = "2026-08-25T18:00:00+05:00"
        punch = {"occurred_at": "2026-08-25T08:00:00+05:00"}
        a._apply_clock_trust([punch], -2 * 3600)
        self.assertNotIn("clock_tamper", punch)
        self.assertEqual(punch["occurred_at"], "2026-08-25T08:00:00+05:00")

    def test_live_skew_still_tampered(self):
        a = adapter()
        a.last_device_now_iso = "2026-08-25T10:05:00+05:00"
        punch = {"occurred_at": "2026-08-25T10:00:00+05:00"}
        a._apply_clock_trust([punch], -2 * 3600)
        self.assertTrue(punch["clock_tamper"])
        self.assertEqual(punch["occurred_at"], "2026-08-25T10:00:00+05:00")


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
