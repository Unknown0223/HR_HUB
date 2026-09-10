# Office-link packages

- `HRHUB-Link-Setup.exe` — **preferred**: single Windows installer (EULA + install path + shortcuts). Built by `tools/office-link/pack-setup.bat`.
- `HRHUB-Link-portable.zip` — fallback onedir zip (many files under `ilova/_internal` — PyInstaller runtime; required next to the EXE, not “extra junk”).
- `LICENSE.txt` — EULA text copied into Setup packs.

Rebuild:

```
tools\office-link\BUILD-EXE.bat
set NOPAUSE=1 && tools\office-link\pack-release.bat
set NOPAUSE=1 && tools\office-link\pack-setup.bat
```

Download API prefers Setup.exe and returns a small zip: Setup + `config.json` + `connection.hrhub` (not the 1000-file tree).
