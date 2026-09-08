from __future__ import annotations

import unittest
import urllib.error
import urllib.request

import _pathsetup  # noqa: F401


class LocalApiGuardTests(unittest.TestCase):
    """If Nest API is on :3001, office-link must reject missing/dummy keys."""

    def _ping(self, headers: dict[str, str] | None) -> int:
        req = urllib.request.Request(
            "http://127.0.0.1:3001/api/attendance/office-link/ping?tenantCode=demo",
            headers=headers or {"Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                return int(resp.status)
        except urllib.error.HTTPError as exc:
            return int(exc.code)
        except OSError:
            self.skipTest("local API is not listening on :3001")
            return 0

    def test_missing_key_is_401(self):
        self.assertEqual(self._ping({}), 401)

    def test_dummy_key_is_401(self):
        self.assertEqual(self._ping({"X-Device-Link-Key": "dummy-not-a-real-key"}), 401)


class ImportSmokeTests(unittest.TestCase):
    def test_import_app_modules(self):
        import api_client
        import auth_lock
        import discovery
        import office_link_app
        import office_link_gui
        import paths
        import runtime_setup
        import session

        self.assertTrue(hasattr(office_link_gui, "run_app"))
        self.assertTrue(hasattr(office_link_app, "main"))
        self.assertTrue(hasattr(auth_lock, "AuthLock"))
        self.assertTrue(hasattr(discovery, "probe_online"))
        self.assertTrue(hasattr(session, "OfficeLinkSession"))
        self.assertTrue(hasattr(paths, "find_root"))
        self.assertTrue(hasattr(runtime_setup, "ensure_runtime"))
        self.assertTrue(hasattr(api_client, "ping"))


if __name__ == "__main__":
    unittest.main()
