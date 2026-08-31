from pathlib import Path
import re
import urllib.request

OUT = Path(__file__).resolve().parents[1] / "data" / "verifix-dump"
OUT.mkdir(parents=True, exist_ok=True)
ua = {"User-Agent": "Mozilla/5.0"}
req = urllib.request.Request("https://app2.verifix.com/login.html", headers=ua)
html = urllib.request.urlopen(req, timeout=20).read()
(OUT / "login.html").write_bytes(html)
text = html.decode("utf-8", "replace")
srcs = re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", text)
(OUT / "login-assets.txt").write_text("\n".join(srcs), encoding="utf-8")
print("html_len", len(text))
print("assets", len(srcs))
for s in srcs:
    print(s)
