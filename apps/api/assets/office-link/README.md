# Office-link packages (Windows + Android)

| File | Purpose |
|------|---------|
| `HRHUB-Link-portable.zip` | Self-contained Windows package (bundled Python + libraries, gw, cloudflared) |
| `HRHUB-Link-Setup.exe` | Windows installer (same package + EULA, Start Menu, Apps list) |
| `HRHUB-Link-Android.apk` | Android office-link app |

API:
- `GET /api/attendance/office-link/download-bound` — tenant-bound Windows zip
- `GET /api/attendance/office-link/download-android` — Android APK

Windows tunnel: GUI «Internet tunnel» card + `service_worker.py` auto-heal
restart cloudflared and re-announce when quick tunnels die.

**Nothing to install on the office PC.** The package ships the python.org
embeddable runtime (`runtime\python`, signed by the Python Software Foundation,
so Smart App Control allows it) with every library preinstalled. `BOSHLASH.bat`
and the installer shortcuts start `runtime\python\pythonw.exe office_link_app.py`.
The UI needs Microsoft Edge WebView2 Runtime (built into Windows 10/11).

**Smart App Control:** the unsigned `HRHUB-Link-Setup.exe` may still be blocked
on PCs with SAC on — use the portable ZIP there (unpack → `BOSHLASH.bat`).

Rebuild Windows:
```
set NOPAUSE=1 && tools\office-link\pack-release.bat
set NOPAUSE=1 && tools\office-link\pack-setup.bat
copy tools\office-link\release\HRHUB-Link-portable.zip apps\api\assets\office-link\
```

Rebuild Android:
```
cd apps\office-link-mobile
flutter build apk --release --no-tree-shake-icons
copy build\app\outputs\flutter-apk\app-release.apk ..\..\apps\api\assets\office-link\HRHUB-Link-Android.apk
```
