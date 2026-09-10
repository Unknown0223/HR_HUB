# Office-link base portable package

`HRHUB-Link-portable.zip` — generic Windows package (EXE + scripts).

API `GET /api/attendance/office-link/download-bound` injects tenant-bound
`config.json` + `connection.hrhub` into a copy of this zip.

Rebuild:
```
tools\office-link\BUILD-EXE.bat
set NOPAUSE=1 && tools\office-link\pack-release.bat
copy tools\office-link\release\HRHUB-Link-portable.zip apps\api\assets\office-link\
```
