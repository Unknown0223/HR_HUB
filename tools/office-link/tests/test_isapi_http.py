"""Tests for hardened LAN ISAPI HTTP helpers."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from _pathsetup import *  # noqa: F401,F403

import isapi_http as ih


class IsapiHttpTests(unittest.TestCase):
    def test_transient_disconnect_message(self) -> None:
        self.assertTrue(
            ih.is_transient_error(
                RuntimeError("Server disconnected without sending a response.")
            )
        )
        self.assertTrue(ih.is_transient_error(ConnectionResetError("reset")))
        self.assertTrue(ih.is_transient_http(0, "network reset"))
        self.assertTrue(ih.is_transient_http(503, "busy"))
        self.assertFalse(ih.is_transient_http(401, "digest"))
        self.assertFalse(ih.is_transient_error(ValueError("bad json")))

    def test_http_raw_retries_connection_reset(self) -> None:
        calls = {"n": 0}

        class FakeResp:
            status = 200

            def read(self, _n: int = -1) -> bytes:
                return b"ok"

            def getheaders(self):
                return [("Content-Type", "text/plain")]

        class FakeConn:
            def __init__(self, *_a, **_k):
                pass

            def request(self, *_a, **_k):
                calls["n"] += 1
                if calls["n"] < 3:
                    raise ConnectionResetError("forcibly closed")

            def getresponse(self):
                return FakeResp()

            def close(self):
                return None

        with patch.object(ih.http.client, "HTTPConnection", FakeConn):
            with patch.object(ih, "backoff_sleep", return_value=None):
                status, _h, body = ih.http_raw(
                    "127.0.0.1", 9, "GET", "/x", timeout=1.0, retries=4
                )
        self.assertEqual(status, 200)
        self.assertEqual(body, b"ok")
        self.assertEqual(calls["n"], 3)


if __name__ == "__main__":
    unittest.main()
