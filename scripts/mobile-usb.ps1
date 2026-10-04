# HR HUB mobil ilova (apps/mobile) - USB orqali ulangan telefonda ishga tushirish
# Ishlatish:  npm run mobile:usb
#             npm run mobile:usb -- -Serial fuduae8hu4x44995
#             npm run mobile:usb -- -Debug     (hot reload kerak bo'lsa; telefonda ancha sekin ishlaydi)
# Telefonda: Dasturchi sozlamalari -> USB debugging (Xiaomi: yana "Install via USB")
# Toxtatish: flutter oynasida q

param(
  [string]$Serial,
  [int]$Port = 3001,
  [switch]$NoRun,
  [switch]$Debug
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"

function Write-Step {
  param([string]$n, [string]$msg)
  Write-Host ""
  Write-Host "[$n] $msg" -ForegroundColor Cyan
}

function Invoke-Adb {
  $ErrorActionPreference = "Continue"
  & $adb @args 2>$null
}

if (-not (Test-Path $adb)) { throw "adb topilmadi: $adb" }

Write-Step 1 "Backend (web :$Port -> API :3002)"
try {
  $null = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "  OK"
} catch {
  Write-Host "  Backend ishlamayapti - boshqa terminalda: npm run dev" -ForegroundColor Yellow
}

Write-Step 2 "Telefon (USB)"
Invoke-Adb start-server | Out-Null
$lines = Invoke-Adb devices
$unauthorized = $lines | Where-Object { $_ -match '^\S+\s+unauthorized' }
$phones = @($lines | Where-Object { $_ -match '^(\S+)\s+device$' -and $_ -notmatch '^emulator-' } |
  ForEach-Object { ($_ -split '\s+')[0] })

if (-not $Serial) {
  if ($phones.Count -eq 0) {
    if ($unauthorized) { throw "Telefon ruxsat bermagan: telefonda 'Allow USB debugging' oynasini tasdiqlang" }
    throw "USB orqali telefon topilmadi: kabelni, USB debugging va 'File transfer' rejimini tekshiring"
  }
  if ($phones.Count -gt 1) { throw "Bir nechta telefon ulangan, tanlang: -Serial $($phones -join ' | -Serial ')" }
  $Serial = $phones[0]
}
$model = (Invoke-Adb -s $Serial shell getprop ro.product.model | Select-Object -First 1)
Write-Host "  $Serial ($("$model".Trim()))"

# The phone reaches the PC's dev server through the USB cable, so no Wi-Fi/LAN IP or firewall rule is needed.
# Photo links from the API point at http://localhost:3002 (storage proxy), so that port is forwarded too.
Write-Step 3 "adb reverse tcp:$Port, tcp:3002"
Invoke-Adb -s $Serial reverse "tcp:$Port" "tcp:$Port" | Out-Null
Invoke-Adb -s $Serial reverse "tcp:3002" "tcp:3002" | Out-Null
Invoke-Adb -s $Serial reverse --list

if ($NoRun) { return }

# A debug build runs Dart in JIT mode: on a real phone the camera, liveness and photo
# composition stutter badly. Profile is AOT-compiled like release but keeps logs.
$mode = if ($Debug) { "--debug" } else { "--profile" }
Write-Step 4 "Flutter ilova ($($mode.TrimStart('-')))"
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
$studioJbr = "C:\Program Files\Android\Android Studio\jbr"
if (-not $env:JAVA_HOME -and (Test-Path $studioJbr)) { $env:JAVA_HOME = $studioJbr }
Set-Location (Join-Path $root "apps\mobile")
flutter pub get
flutter run $mode -d $Serial --dart-define=API_BASE_URL=http://127.0.0.1:$Port/api
