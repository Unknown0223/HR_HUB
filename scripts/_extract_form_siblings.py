from pathlib import Path
import re
import json
from collections import OrderedDict, defaultdict

root = Path(r"d:\0223\output\run_20260725_222506\clone\pages")
results = {}

for d in sorted(root.iterdir()):
    if not d.is_dir():
        continue
    html = d / "page.html"
    if not html.exists():
        continue
    t = html.read_text(encoding="utf-8", errors="ignore")
    # Subheader formSiblings block
    m = re.search(
        r"formSiblings\(\).*?<ul class=\"breadcrumb[^>]*>\"?(.*?)</ul>",
        t,
        re.S,
    )
    if not m:
        m = re.search(
            r"<!--begin::Breadcrump-->(.*?)<!--end::Breadcrumb-->",
            t,
            re.S,
        )
    if not m:
        continue
    chunk = m.group(1)
    sibs = re.findall(r'data-doc-subnav="([^"]+)"', chunk)
    if not sibs:
        continue
    # current title from subheader h6
    title_m = re.search(
        r'<h6 class="text-dark[^"]*"[^>]*>.*?</span>\s*([^<]+?)\s*</h6>',
        t,
        re.S,
    )
    title = title_m.group(1).strip() if title_m else d.name
    seen = list(OrderedDict.fromkeys(sibs))
    results[d.name] = {"title": title, "siblings": seen}

# Unique sets keyed by title
by_title = {}
for meta in results.values():
    title = meta["title"]
    sibs = meta["siblings"]
    if title not in by_title or len(sibs) > len(by_title[title]):
        by_title[title] = sibs

out = Path(r"d:\0223\hr-hub\scripts\_verifix_form_siblings.json")
out.write_text(
    json.dumps({"by_folder": results, "by_title": by_title}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print("titles", len(by_title))
for t, s in sorted(by_title.items(), key=lambda x: x[0])[:60]:
    print(f"{t}: {' | '.join(s)}")
