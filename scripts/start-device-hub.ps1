# HR HUB — lokal qurilma gateway + Railway tunnel
# Har safar terminal bilan ishlashdan OLDIN shu skriptni ishga tushiring.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== 1) Device GW (8800) ==" -ForegroundColor Cyan
$gwUp = $false
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:8800/health" -UseBasicParsing -TimeoutSec 2
  $gwUp = $r.StatusCode -eq 200
} catch {}

if (-not $gwUp) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; npm run dev:gw"
  Write-Host "GW yangi oynada ishga tushdi. 5 soniya kutamiz..."
  Start-Sleep -Seconds 5
} else {
  Write-Host "GW allaqachon ishlayapti."
}

$cf = Join-Path $root "tools\cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "cloudflared topilmadi: $cf" -ForegroundColor Red
  Write-Host "Yuklab oling: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
  exit 1
}

Write-Host "== 2) Cloudflare tunnel ==" -ForegroundColor Cyan
Write-Host "Yangi oynada tunnel ochiladi. Chiqgan https://....trycloudflare.com URL ni nusxalang."
Write-Host "Keyin Railway → @hr-hub/api → Variables → DEVICE_GW_URL = shu URL"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& `"$cf`" tunnel --url http://127.0.0.1:8800"

Write-Host ""
Write-Host "== Keyingi qadamlar (brauzer) ==" -ForegroundColor Yellow
Write-Host "1. https://hr-hubweb-production.up.railway.app  (admin@demo.local / Demo1234!)"
Write-Host "2. Katalog → Устройства → qurilma qo'shing:"
Write-Host "   Host: 192.168.0.107  User: admin  Parol: terminaldagi ISAPI parol"
Write-Host "3. Register / Heartbeat → Online"
Write-Host "4. Синхронизировать часы"
Write-Host ""
Write-Host "Muhim: tunnel URL har safar o'zgaradi (quick tunnel). Yangi URL ni Railway ga yozing."
