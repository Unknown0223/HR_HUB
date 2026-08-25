import zipfile, xml.etree.ElementTree as ET, os
p = os.path.expanduser(r"C:\Users\UNKNOWN_007\Downloads\Отчет+по+режиму+работы+подразделения.xlsx")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(p) as z:
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = []
    for si in root.findall("m:si", NS):
        strings.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
    print("STRINGS", len(strings))
    for i, s in enumerate(strings[:40]):
        print(i, s)
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = sheet.findall("m:sheetData/m:row", NS)[:6]
    for row in rows:
        vals = []
        for c in row.findall("m:c", NS)[:18]:
            ref = c.get("r")
            t = c.get("t")
            v = c.find("m:v", NS)
            if v is None:
                continue
            val = v.text
            if t == "s" and val is not None:
                val = strings[int(val)]
            vals.append(f"{ref}={val}")
        print("ROW", row.get("r"), vals)
