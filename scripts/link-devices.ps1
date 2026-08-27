# HR HUB - bitta buyruq: lokal qurilmalar <-> Railway
# Ishlatish:  npm run devices:up
# Toxtatish: Ctrl+C

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$webUrl = "https://hr-hubweb-production.up.railway.app"
$apiUrl = "https://hr-hubapi-production.up.railway.app"
$gwPort = 8800
$cf = Join-Path $root "tools\cloudflared.exe"
$gwEnv = Join-Path $root "apps\device-gw\.env"

function Write-Step {
  param([string]$n, [string]$msg)
  Write-Host ""
  Write-Host "[$n] $msg" -ForegroundColor Cyan
}

function Test-Gw {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$gwPort/health" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Ensure-GwEnv {
  if (-not (Test-Path $gwEnv)) {
    $lines = @(
      "DEVICE_GW_PORT=$gwPort",
      "DEVICE_GW_HOST=0.0.0.0",
      "DEVICE_GW_API_URL=$apiUrl",
      "DEVICE_GW_PUNCH_KEY=",
      "DEVICE_GW_NATS_URL=nats://127.0.0.1:4222",
      "DEVICE_GW_NATS_SUBJECT=hrhub.punch.raw",
      "DEFAULT_ADAPTER=hikvision_isapi"
    )
    $lines | Set-Content -Path $gwEnv -Encoding UTF8
    Write-Host "  Yaratildi: apps/device-gw/.env - DEVICE_GW_PUNCH_KEY ni Railway PUNCH_INGEST_API_KEY bilan toldiring." -ForegroundColor Yellow
  } else {
    $txt = Get-Content $gwEnv -Raw
    $escaped = [regex]::Escape($apiUrl)
    if ($txt -notmatch "DEVICE_GW_API_URL=$escaped") {
      if ($txt -match "DEVICE_GW_API_URL=") {
        $txt = $txt -replace "DEVICE_GW_API_URL=.*", "DEVICE_GW_API_URL=$apiUrl"
      } else {
        $txt = $txt.TrimEnd() + "`r`nDEVICE_GW_API_URL=$apiUrl`r`n"
      }
      Set-Content -Path $gwEnv -Value $txt -Encoding UTF8
    }
  }
}

function Set-RailwayGwUrl {
  param([string]$url)
  $cmd = "source `$HOME/.railway/env; cd /mnt/d/hr-hub; railway variable set --service '@hr-hub/api' DEVICE_GW_URL=$url"
  & wsl -e bash -lc $cmd
}

Write-Host ""
Write-Host "  HR HUB qurilma ulanishi (Railway)" -ForegroundColor Green
Write-Host "  Platforma: $webUrl"
Write-Host ""

Ensure-GwEnv

if (-not (Test-Path $cf)) {
  Write-Host "cloudflared yoq. Yuklanmoqda..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path (Join-Path $root "tools") | Out-Null
  & wsl -e bash -lc "curl -fsSL -L 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -o /mnt/d/hr-hub/tools/cloudflared.exe"
  if (-not (Test-Path $cf)) {
    throw "cloudflared yuklab bolmadi"
  }
}

Write-Step "1/3" "Device Gateway ($gwPort)"
$gwProc = $null
# Always restart GW so latest unlock/heartbeat code is loaded (stale process was a common failure mode).
Get-NetTCPConnection -LocalPort $gwPort -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -match 'uvicorn.*main:app|run-device-gw|dev:gw') } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
Start-Sleep -Seconds 1
$gwProc = Start-Process -FilePath "powershell" -ArgumentList @(
  "-NoProfile", "-WindowStyle", "Minimized", "-Command",
  "Set-Location `"$root`"; npm run dev:gw"
) -PassThru
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Gw) {
    $ok = $true
    break
  }
}
if (-not $ok) {
  throw "Gateway 8800 da ochilmadi. apps/device-gw/.venv ni tekshiring."
}
Write-Host "  Gateway qayta ishga tushdi."

Write-Step "2/3" "Internet tunnel (Cloudflare)"

# Oldingi cloudflared / band loglarni tozalash
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}
Start-Sleep -Milliseconds 800

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logOut = Join-Path $env:TEMP "hrhub-cloudflared-$stamp.out.log"
$logErr = Join-Path $env:TEMP "hrhub-cloudflared-$stamp.err.log"
foreach ($f in @($logOut, $logErr)) {
  if (Test-Path $f) {
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
}
$cfProc = Start-Process -FilePath $cf -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$gwPort") `
  -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -NoNewWindow

$tunnelUrl = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $content = ""
  foreach ($f in @($logOut, $logErr)) {
    if (Test-Path $f) {
      $content += (Get-Content $f -Raw -ErrorAction SilentlyContinue)
    }
  }
  if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
    $tunnelUrl = $Matches[0]
    break
  }
  if ($cfProc.HasExited) {
    throw "cloudflared toxtadi. Log: $logErr"
  }
}
if (-not $tunnelUrl) {
  throw "Tunnel URL topilmadi. Log: $logErr"
}
Write-Host "  Tunnel: $tunnelUrl"

Write-Step "3/3" "Railway ga ulash (DEVICE_GW_URL)"
try {
  Set-RailwayGwUrl -url $tunnelUrl
  Write-Host "  Railway yangilandi. API ~30-60s ichida qayta start boladi."
} catch {
  Write-Host "  Avtomatik yozilmadi. Qolda: Railway -> @hr-hub/api -> DEVICE_GW_URL = $tunnelUrl" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  TAYYOR - qurilmalar platformaga ulanishi mumkin"
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Brauzer:  $webUrl"
Write-Host "     Login:    admin@demo.local / Demo1234!"
Write-Host ""
Write-Host "  2. Katalog -> Ustroystva -> har bir terminalni qoshhing:"
Write-Host "     - Host = terminal IP (masalan 192.168.0.107)"
Write-Host "     - User = admin"
Write-Host "     - Parol = terminal ISAPI paroli"
Write-Host "     - Register / Heartbeat -> Online"
Write-Host ""
Write-Host "  3. Shu PC LAN dagi BARCHA Hikvisionlar shu gateway orqali"
Write-Host "     Railway ga punch yuboradi."
Write-Host ""
Write-Host "  Toxtatish: Ctrl+C"
Write-Host ""

try {
  while ($true) {
    if ($cfProc.HasExited) {
      Write-Host "Tunnel yopildi." -ForegroundColor Red
      break
    }
    Start-Sleep -Seconds 5
  }
} finally {
  if ($cfProc -and -not $cfProc.HasExited) {
    Stop-Process -Id $cfProc.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Tunnel toxtatildi. Gateway ishlashda davom etishi mumkin (port $gwPort)."
}
