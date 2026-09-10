"""Recovery email helpers for office-link."""
from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from device_email import (
    DEFAULT_RECOVERY_EMAIL,
    is_valid_email,
    normalize_recovery_email,
    set_recovery_email,
)


class TestDeviceEmail(unittest.TestCase):
    def test_default_email(self) -> None:
        self.assertEqual(normalize_recovery_email(""), DEFAULT_RECOVERY_EMAIL)
        self.assertEqual(
            normalize_recovery_email("  botirovanvar96@gmail.com "),
            "botirovanvar96@gmail.com",
        )
        self.assertTrue(is_valid_email(DEFAULT_RECOVERY_EMAIL))
        self.assertFalse(is_valid_email("not-an-email"))

    def test_set_recovery_email_ok(self) -> None:
        with patch("device_email.digest_request") as dig, patch(
            "device_email.get_recovery_email"
        ) as getter:
            dig.return_value = (200, {}, b'{"statusCode":1}')
            getter.return_value = {
                "ok": True,
                "email": "b****@gmail.com",
            }
            res = set_recovery_email(
                "192.168.0.116", 80, "admin", "HrTestPass9", "botirovanvar96@gmail.com"
            )
            self.assertTrue(res.get("ok"))
            self.assertEqual(res.get("email"), "botirovanvar96@gmail.com")
            self.assertTrue(res.get("verified"))
            self.assertEqual(dig.call_args[0][2], "PUT")
            body = dig.call_args[1].get("body") or dig.call_args[0][6]
            payload = json.loads(body.decode("utf-8"))
            self.assertIn("password", payload["SecurityEmail"])



if __name__ == "__main__":
    unittest.main()
