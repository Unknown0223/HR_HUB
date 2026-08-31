from pathlib import Path
import urllib.request

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump"
ua = {"User-Agent": "Mozilla/5.0"}
urls = [
    "https://app2.verifix.com/biruni/brand-loader.js?_=20260818T122",
    "https://app2.verifix.com/biruni/login.js",
    "https://app2.verifix.com/biruni/app.js",
    "https://app2.verifix.com/b/session/info",
]
for url in urls:
    name = url.split("/")[-1].split("?")[0]
    try:
        req = urllib.request.Request(url, headers=ua)
        data = urllib.request.urlopen(req, timeout=20).read()
        (OUT / f"probe-{name}").write_bytes(data)
        print("OK", name, len(data), data[:80])
    except Exception as e:
        print("FAIL", name, type(e).__name__, e)
