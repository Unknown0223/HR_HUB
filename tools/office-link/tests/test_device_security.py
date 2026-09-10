"""Unit tests for Hikvision live-detection helpers."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

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
        resp = MagicMock(status_code=200)
        resp.json.return_value = payload
        client = MagicMock()
        client.get.return_value = resp
        client.__enter__.return_value = client
        client.__exit__.return_value = False
        with patch("device_security.httpx.Client", return_value=client):
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
        resp = MagicMock(status_code=200)
        resp.json.return_value = payload
        client = MagicMock()
        client.get.return_value = resp
        client.__enter__.return_value = client
        client.__exit__.return_value = False
        with patch("device_security.httpx.Client", return_value=client):
            out = ensure_live_detection("1.2.3.4", "admin", "x")
        self.assertTrue(out["ok"])
        self.assertFalse(out["changed"])
        client.put.assert_not_called()


if __name__ == "__main__":
    unittest.main()
