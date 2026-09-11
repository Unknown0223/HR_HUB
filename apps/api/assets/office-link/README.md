# Office-link packages

| File | Purpose |
|------|---------|
| `HRHUB-Link-portable.zip` | Generic Windows package (EXE + scripts) |
| `HRHUB-Link-Setup.exe` | Windows installer |
| `HRHUB-Link-Android.apk` | Android office-link app |

API:
- `GET /api/attendance/office-link/download-bound` — tenant-bound Windows zip
- `GET /api/attendance/office-link/download-android` — Android APK

Rebuild Windows:
```
tools\office-link\BUILD-EXE.bat
set NOPAUSE=1 && tools\office-link\pack-release.bat
copy tools\office-link\release\HRHUB-Link-portable.zip apps\api\assets\office-link\
```

Rebuild Android:
```
cd apps\office-link-mobile
flutter build apk --release --no-tree-shake-icons
copy build\app\outputs\flutter-apk\app-release.apk ..\..\apps\api\assets\office-link\HRHUB-Link-Android.apk
```
