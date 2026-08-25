# HR HUB — Flutter mobile

Brand: **HR HUB**. API: Nest `:3001`.

## Tezkor ishga tushirish (Android)

```bat
:: 1) API
cd D:\0223\hr-hub
npm run dev:api

:: 2) Emulyator (PC = 10.0.2.2)
cd D:\0223\hr-hub\apps\mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001/api

:: 3) Haqiqiy telefon (LAN IP misol)
flutter run --dart-define=API_BASE_URL=http://192.168.100.89:3001/api
```

Login ekranida **Server manzil** ni ham o‘zgartirish mumkin.

**Demo:** `admin@demo.local` / `Demo1234!`  
**Tabel / Face punch:** `employee@demo.local` / `Demo1234!`

## Ruxsatlar

- CAMERA — Face ID + QR  
- LOCATION — GPS belgi  
- BIOMETRIC / FINGERPRINT — kirish va belgi tasdiqi  

Batafsil: `D:\0223\docs\MOBILE_CONNECTION.md`
