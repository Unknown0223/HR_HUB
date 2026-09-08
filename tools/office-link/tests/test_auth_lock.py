from __future__ import annotations

import unittest

import _pathsetup  # noqa: F401

from auth_lock import CONFIRM, IDLE, LOCKED, AuthLock


class FakeClock:
    def __init__(self, t: float = 1_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


class AuthLockTests(unittest.TestCase):
    def test_first_401_asks_confirm_not_locked(self):
        lock = AuthLock(lock_seconds=1800, now=FakeClock())
        self.assertEqual(lock.record_401(), CONFIRM)
        self.assertFalse(lock.is_locked())
        self.assertEqual(lock.phase(), CONFIRM)
        self.assertTrue(lock.can_attempt())

    def test_second_401_locks(self):
        clock = FakeClock()
        lock = AuthLock(lock_seconds=1800, now=clock)
        lock.record_401()
        self.assertEqual(lock.record_401(), LOCKED)
        self.assertTrue(lock.is_locked())
        self.assertEqual(lock.remaining_seconds(), 1800)
        self.assertFalse(lock.can_attempt())
        self.assertEqual(lock.format_remaining(), "30:00")

    def test_timeout_not_counted(self):
        lock = AuthLock(now=FakeClock())
        lock.record_timeout()
        lock.record_offline()
        self.assertEqual(lock.fail_count, 0)
        self.assertEqual(lock.phase(), IDLE)
        lock.record_401()
        lock.record_timeout()
        self.assertEqual(lock.fail_count, 1)
        self.assertEqual(lock.phase(), CONFIRM)
        self.assertFalse(lock.is_locked())

    def test_success_resets(self):
        lock = AuthLock(now=FakeClock())
        lock.record_401()
        lock.record_success()
        self.assertEqual(lock.fail_count, 0)
        self.assertEqual(lock.phase(), IDLE)
        self.assertTrue(lock.can_attempt())

    def test_lock_expires_then_can_attempt(self):
        clock = FakeClock(10.0)
        lock = AuthLock(lock_seconds=30, now=clock)
        lock.record_401()
        lock.record_401()
        self.assertTrue(lock.is_locked())
        clock.t = 41.0
        self.assertFalse(lock.is_locked())
        self.assertTrue(lock.can_attempt())
        self.assertEqual(lock.phase(), IDLE)

    def test_401_while_locked_stays_locked(self):
        clock = FakeClock()
        lock = AuthLock(lock_seconds=60, now=clock)
        lock.record_401()
        lock.record_401()
        until = lock.lock_until
        self.assertEqual(lock.record_401(), LOCKED)
        self.assertEqual(lock.lock_until, until)

    def test_success_after_confirm_allows_fresh_fails(self):
        lock = AuthLock(now=FakeClock())
        lock.record_401()
        lock.record_success()
        self.assertEqual(lock.record_401(), CONFIRM)
        self.assertFalse(lock.is_locked())


if __name__ == "__main__":
    unittest.main()
