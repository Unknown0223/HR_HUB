from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import _pathsetup  # noqa: F401


class DesktopApiSmokeTests(unittest.TestCase):
    def test_bootstrap_shape(self):
        from desktop_app import LinkApi

        api = LinkApi({"window": None})
        with patch.object(api, "_load_locations_worker", lambda *_a, **_k: None):
            data = api.bootstrap()
        self.assertIn("tenantCode", data)
        self.assertIn("status", data)
        self.assertIn("tunnel", data)
        self.assertTrue(isinstance(data["status"], dict))

    def test_save_token(self):
        from desktop_app import LinkApi

        api = LinkApi({"window": None})
        with patch.object(api.session, "set_pairing_token") as set_tok, patch.object(
            api.session, "has_credentials", return_value=True
        ):
            out = api.save_token("  abc  ")
        set_tok.assert_called_once_with("abc")
        self.assertEqual(out["status"]["kind"], "ok")

    def test_poll_events_queue(self):
        from desktop_app import LinkApi

        api = LinkApi({"window": None})
        api._emit("onScanDone", {"ok": True})
        api._emit("onLocations", {"locations": []})
        batch = api.poll_events()
        self.assertEqual(len(batch), 2)
        self.assertEqual(batch[0]["fn"], "onScanDone")
        self.assertEqual(api.poll_events(), [])

    def test_connect_result_linked(self):
        from desktop_app import LinkApi
        from session import SubmitResult

        api = LinkApi({"window": None})
        with patch.object(api.session, "write_service_handoff"), patch.object(
            api.session, "ensure_tunnel_supervisor"
        ), patch.object(api, "_tunnel_payload", return_value={"state": "ok", "url": "https://x"}):
            out = api._connect_result(
                SubmitResult(
                    kind="linked",
                    message="ok",
                    device={"host": "192.168.1.115", "name": "Gate", "sealed": True},
                ),
                clear_pwd=True,
                linked=True,
            )
        self.assertEqual(out["status"]["kind"], "ok")
        self.assertTrue(out["clearPassword"])


if __name__ == "__main__":
    unittest.main()
