"""Unit tests for tunnel health helpers (no real cloudflared)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tunnel_watch as tw  # noqa: E402


class TunnelWatchTests(unittest.TestCase):
    def test_probe_local_gw_false_when_down(self):
        with patch("tunnel_watch.urlopen", side_effect=OSError("down")):
            self.assertFalse(tw.probe_local_gw(timeout=0.1))

    def test_probe_tunnel_dns_failure_returns_none(self):
        from urllib.error import URLError

        with patch(
            "tunnel_watch.urlopen",
            side_effect=URLError("getaddrinfo failed"),
        ):
            self.assertIsNone(
                tw.probe_tunnel_url("https://example.trycloudflare.com", timeout=0.1)
            )

    def test_probe_tunnel_empty(self):
        self.assertIsNone(tw.probe_tunnel_url(""))


if __name__ == "__main__":
    unittest.main()
