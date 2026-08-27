"""Hikvision-style password attempt lock (app-side).

1st 401 → confirm (operator must re-type; no auto-retry).
2nd 401 → lock further ISAPI auth for lock_seconds (default 30 min).
Network timeout / offline is not a password fail.
"""
from __future__ import annotations

from typing import Callable

CONFIRM = "confirm"
LOCKED = "locked"
IDLE = "idle"
SUCCESS = "success"

DEFAULT_LOCK_SECONDS = 30 * 60


class AuthLock:
    def __init__(
        self,
        lock_seconds: int = DEFAULT_LOCK_SECONDS,
        now: Callable[[], float] | None = None,
        max_fails: int = 2,
    ) -> None:
        self.lock_seconds = int(lock_seconds)
        self.max_fails = int(max_fails)
        self._now = now or __import__("time").time
        self.fail_count = 0
        self.lock_until = 0.0

    def _expire_if_due(self) -> None:
        if self.fail_count >= self.max_fails and self._now() >= self.lock_until:
            self.fail_count = 0
            self.lock_until = 0.0

    def is_locked(self) -> bool:
        self._expire_if_due()
        return self.fail_count >= self.max_fails and self._now() < self.lock_until

    def remaining_seconds(self) -> int:
        if not self.is_locked():
            return 0
        return max(0, int(self.lock_until - self._now()))

    def can_attempt(self) -> bool:
        return not self.is_locked()

    def phase(self) -> str:
        if self.is_locked():
            return LOCKED
        if self.fail_count == 1:
            return CONFIRM
        return IDLE

    def record_timeout(self) -> None:
        """Network timeout is NOT a password fail."""
        return None

    def record_offline(self) -> None:
        """Device unreachable is NOT a password fail."""
        return None

    def record_401(self) -> str:
        if self.is_locked():
            return LOCKED
        self.fail_count += 1
        if self.fail_count >= self.max_fails:
            self.lock_until = self._now() + self.lock_seconds
            return LOCKED
        return CONFIRM

    def record_success(self) -> None:
        self.fail_count = 0
        self.lock_until = 0.0

    def format_remaining(self) -> str:
        sec = self.remaining_seconds()
        mins, rem = divmod(sec, 60)
        return f"{mins:02d}:{rem:02d}"
