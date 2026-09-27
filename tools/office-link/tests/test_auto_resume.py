"""Unit tests for auto-resume helpers (no live device)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import auto_resume


class AutoResumeTests(unittest.TestCase):
    def test_persist_hik_push_merges_service_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "data"
            data.mkdir()
            (data / "service.json").write_text(
                json.dumps(
                    {
                        "enabled": True,
                        "apiUrl": "https://api.example",
                        "tenantCode": "demo",
                        "tunnelMode": "quick",
                        "host": "192.168.1.10",
                        "autoHeal": True,
                    }
                ),
                encoding="utf-8",
            )
            with patch("paths.data_dir", return_value=data):
                from paths import load_service_config

                auto_resume.persist_hik_push_to_service(
                    root,
                    "https://api.example",
                    "demo",
                    {
                        "urlPath": "/api/attendance/hik-push/tok",
                        "hostName": "api.example",
                        "portNo": 443,
                        "protocolType": "HTTPS",
                    },
                    host="192.168.1.20",
                    port=80,
                    device_id="dev-1",
                )
                svc = load_service_config(root) or {}
                self.assertEqual(
                    svc.get("hikPushUrlPath"),
                    "/api/attendance/hik-push/tok",
                )
                self.assertEqual(svc.get("host"), "192.168.1.20")
                self.assertEqual(svc.get("deviceId"), "dev-1")
                self.assertTrue(svc.get("autoHeal"))

    def test_reconcile_offline_device_returns_partial_ok(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "data"
            data.mkdir()
            (data / "service.json").write_text(
                json.dumps(
                    {
                        "enabled": True,
                        "apiUrl": "https://api.example",
                        "tenantCode": "demo",
                        "host": "203.0.113.9",
                        "port": 80,
                    }
                ),
                encoding="utf-8",
            )
            with patch("paths.data_dir", return_value=data), patch(
                "auto_resume._device_reachable", return_value=False
            ), patch(
                "auto_resume._rediscover_host",
                return_value=("203.0.113.9", 80, ""),
            ), patch(
                "auto_resume._load_cred",
                return_value={
                    "host": "203.0.113.9",
                    "port": 80,
                    "username": "admin",
                    "password": "secret",
                },
            ), patch("punch_proxy.ensure_punch_proxy"), patch(
                "punch_proxy.punch_proxy_status",
                return_value={"running": True, "port": 8787},
            ):
                out = auto_resume.reconcile_link(
                    root, "https://api.example", "demo"
                )
                self.assertTrue(out.get("ok"))
                self.assertFalse(out.get("deviceOnline"))
                ids = [s["id"] for s in out.get("steps") or []]
                self.assertIn("device", ids)


if __name__ == "__main__":
    unittest.main()
