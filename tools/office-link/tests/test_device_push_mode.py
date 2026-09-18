"""HttpHost punch mode: direct HTTPS preferred (no Link required)."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import _pathsetup  # noqa: F401

from device_push import apply_hik_push_prefer_lan


class HikPushModeTests(unittest.TestCase):
    def setUp(self):
        self.hik = {
            "urlPath": "/api/attendance/hikvision/events/tok",
            "hostName": "hr-hubapi-production.up.railway.app",
            "portNo": 443,
            "protocolType": "HTTPS",
            "addressingFormatType": "hostname",
        }

    def test_default_uses_direct_when_ok(self):
        with patch.dict(os.environ, {"OFFICE_LINK_PUNCH_MODE": "direct"}, clear=False):
            with patch(
                "device_push.apply_hik_push_from_api_response",
                return_value={"ok": True, "status": 200},
            ) as mock_apply:
                res = apply_hik_push_prefer_lan(
                    "192.168.0.10", 80, "admin", "pass", self.hik, api_base="https://x"
                )
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("mode"), "direct_https")
        self.assertEqual(mock_apply.call_count, 1)
        cfg = mock_apply.call_args[0][4]
        self.assertEqual(cfg.get("protocolType"), "HTTPS")

    def test_lan_mode_configures_proxy_ip(self):
        with patch.dict(os.environ, {"OFFICE_LINK_PUNCH_MODE": "lan"}, clear=False):
            with patch("punch_proxy.ensure_punch_proxy"):
                with patch("punch_proxy.lan_ipv4_for_device", return_value="192.168.0.194"):
                    with patch(
                        "device_push.apply_hik_push_from_api_response",
                        return_value={"ok": True, "status": 200},
                    ) as mock_apply:
                        res = apply_hik_push_prefer_lan(
                            "192.168.0.10",
                            80,
                            "admin",
                            "pass",
                            self.hik,
                            api_base="https://x",
                        )
        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("mode"), "lan_proxy")
        cfg = mock_apply.call_args[0][4]
        self.assertEqual(cfg.get("protocolType"), "HTTP")
        self.assertEqual(cfg.get("ipAddress"), "192.168.0.194")


if __name__ == "__main__":
    unittest.main()
