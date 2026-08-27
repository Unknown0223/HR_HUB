"""Discover Hikvision on LAN and register it on HR HUB. Never prints the link key."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from api_client import announce, ping, register_device
from discovery import find_devices, probe_online, valid_ip, verify_password

try:
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def pick_device(cands: list[dict]) -> dict:
    if len(cands) == 1:
        return cands[0]
    print("Bir nechta qurilma topildi:")
    for i, d in enumerate(cands, 1):
        print(f"  {i}) {d.get('name') or d['host']}  {d['host']}")
    while True:
        raw = input("Raqamni tanlang: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(cands):
            return cands[int(raw) - 1]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--api", required=True)
    p.add_argument("--key-file", required=True)
    p.add_argument("--tenant", default="demo")
    p.add_argument("--tunnel", default="")
    p.add_argument("--host", default="")
    p.add_argument("--user", default="admin")
    args = p.parse_args()

    key_path = Path(args.key_file)
    if not key_path.exists():
        print("Ulanish kaliti yo‘q. Avval ADMIN-PAROL.bat ni ishga tushiring.")
        return 1
    key = key_path.read_text(encoding="utf-8").strip()

    from getpass import getpass

    code, _ping = ping(args.api, key, args.tenant)
    if code != 200:
        print("Platformaga ulanmadi. Internet yoki admin kalitini tekshiring.")
        return 1

    password = getpass("Qurilma paroli (ekranda ko‘rinmaydi): ").strip()
    if not password:
        print("Parol kiritilmadi.")
        return 1

    if args.host:
        if not valid_ip(args.host):
            print("IP manzil noto‘g‘ri.")
            return 1
        online = probe_online(args.host, 80)
        if not online.online:
            print("Bu IP da qurilma ochilmadi.")
            return 1
        verified = verify_password(args.host, 80, args.user, password)
        if verified.kind != "ok":
            print("Qurilma ochilmadi yoki parol noto‘g‘ri.")
            return 1
        chosen = verified.as_device()
    else:
        print("Tarmoqdan qurilma qidirilmoqda...")
        found = find_devices()
        if not found:
            host = input("Qurilma topilmadi. IP manzilni yozing: ").strip()
            if not host or not valid_ip(host):
                print("Qurilma ochilmadi yoki parol noto‘g‘ri.")
                return 1
            online = probe_online(host, 80)
            if not online.online:
                print("Qurilma ochilmadi.")
                return 1
            verified = verify_password(host, 80, args.user, password)
            if verified.kind != "ok":
                print("Qurilma ochilmadi yoki parol noto‘g‘ri.")
                return 1
            chosen = verified.as_device()
        else:
            picked = pick_device(
                [
                    {
                        "host": d.host,
                        "port": d.port,
                        "name": d.hint_name or d.host,
                    }
                    for d in found
                ]
            )
            verified = verify_password(picked["host"], int(picked.get("port") or 80), args.user, password)
            if verified.kind != "ok":
                print("Qurilma ochilmadi yoki parol noto‘g‘ri.")
                return 1
            chosen = verified.as_device()

    if args.tunnel:
        code, _ann = announce(args.api, key, args.tenant, args.tunnel)
        if code != 200:
            print("Tunnel platformaga yozilmadi.")
            return 1

    code, linked = register_device(args.api, key, args.tenant, chosen, args.user, password)
    if code != 200:
        print("Qurilma platformaga yozilmadi.")
        return 1
    dev = linked.get("device") if isinstance(linked, dict) else {}
    print("ULANDI", (dev or {}).get("name"), (dev or {}).get("host"), (dev or {}).get("status"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
