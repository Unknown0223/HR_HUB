"""Unit tests for Hikvision live-detection helpers."""
from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from _pathsetup import *  # noqa: F401,F403

from device_security import ensure_live_detection, read_live_detection


class DeviceSecurityTests(unittest.TestCase):
    def test_read_ready_when_professional(self) -> None:
        payload = {
            "CardReaderCfg": {
                "livingBodyDetect": True,
                "liveDetLevelSet": "professional",
                "enableLiveDetAntiAttack": True,
                "faceMatchThresholdN": 92,
            }
        }
        with patch(
            "device_security.digest_httpx",
            return_value=(200, json.dumps(payload)),
        ):
            out = read_live_detection("1.2.3.4", "admin", "x")
        self.assertTrue(out["ok"])
        self.assertTrue(out["ready"])

    def test_ensure_skips_put_when_already_ready(self) -> None:
        payload = {
            "CardReaderCfg": {
                "livingBodyDetect": True,
                "liveDetLevelSet": "professional",
                "enableLiveDetAntiAttack": True,
            }
        }
        with patch(
            "device_security.digest_httpx",
            return_value=(200, json.dumps(payload)),
        ) as mocked:
            out = ensure_live_detection("1.2.3.4", "admin", "x")
        self.assertTrue(out["ok"])
        self.assertFalse(out["changed"])
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(mocked.call_args.args[2], "GET")


if __name__ == "__main__":
    unittest.main()
