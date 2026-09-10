"""Bound connection.hrhub overrides config.json for multi-web installs."""
from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from paths import bound_web_label, load_config


class BoundConfigTests(unittest.TestCase):
    def test_connection_hrhub_overrides_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "config.json").write_text(
                json.dumps(
                    {
                        "apiUrl": "https://old-api.example",
                        "webUrl": "https://old-web.example",
                        "tenantCode": "old",
                    }
                ),
                encoding="utf-8",
            )
            payload = {
                "payload": {
                    "v": 1,
                    "apiUrl": "https://new-api.example",
                    "webUrl": "https://new-web.example",
                    "tenantCode": "acme",
                    "tenantName": "Acme",
                    "issuedAt": "2026-09-10T00:00:00.000Z",
                },
                "sig": "deadbeef",
            }
            raw = base64.urlsafe_b64encode(
                json.dumps(payload).encode("utf-8")
            ).decode("ascii").rstrip("=")
            (root / "connection.hrhub").write_text(raw + "\n", encoding="utf-8")
            cfg = load_config(root)
            self.assertEqual(cfg["apiUrl"], "https://new-api.example")
            self.assertEqual(cfg["webUrl"], "https://new-web.example")
            self.assertEqual(cfg["tenantCode"], "acme")
            self.assertTrue(cfg.get("bound"))
            label = bound_web_label(cfg, root)
            self.assertIn("new-web.example", label)
            self.assertIn("acme", label)


if __name__ == "__main__":
    unittest.main()
