# HR HUB mobil ilova (apps/mobile) - emulyatorda ishga tushirish
# Ishlatish:  npm run mobile
#             npm run mobile -- -Avd Pixel_9a
# Toxtatish: flutter oynasida q

param(
  [string]$Avd = "hrhub_pixel7_api34",
  [switch]$NoRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$emulator = Join-Path $sdk "emulator\emulator.exe"
$adb = Join-Path $sdk "platform-tools\adb.exe"
$avdDir = Join-Path $env:USERPROFILE ".android\avd\$Avd.avd"

function Write-Step {
  param([string]$n, [string]$msg)
  Write-Host ""
  Write-Host "[$n] $msg" -ForegroundColor Cyan
}

# Hyper-V / WinNAT reserves TCP ranges that often swallow the default 5554-5585;
# the emulator then aborts with "too many emulator instances".
function Get-ExcludedRanges {
  $ranges = @()
  foreach ($line in (netsh interface ipv4 show excludedportrange protocol=tcp)) {
    if ($line -match '^\s*(\d+)\s+(\d+)') {
      $ranges += , @([int]$Matches[1], [int]$Matches[2])
    }
  }
  return $ranges
}

function Test-PortFree([int]$port, $ranges) {
  foreach ($r in $ranges) {
    if ($port -ge $r[0] -and $port -le $r[1]) { return $false }
    if (($port + 1) -ge $r[0] -and ($port + 1) -le $r[1]) { return $false }
  }
  $busy = Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $port -or $_.LocalPort -eq ($port + 1) }
  return -not $busy
}

# adb writes transient states ("device offline/not found") to stderr while booting.
function Invoke-Adb {
  $ErrorActionPreference = "Continue"
  & $adb @args 2>$null
}

function Get-RunningSerial {
  foreach ($line in (Invoke-Adb devices)) {
    if ($line -match '^(emulator-\d+)\s+(device|offline)') {
      $name = (Invoke-Adb -s $Matches[1] emu avd name | Select-Object -First 1)
      if ("$name".Trim() -eq $Avd) { return $Matches[1] }
    }
  }
  return $null
}

if (-not (Test-Path $emulator)) { throw "Android emulator topilmadi: $emulator" }
if (-not (Test-Path $avdDir)) { throw "AVD topilmadi: $Avd (emulator -list-avds bilan tekshiring)" }

Write-Step 1 "Backend (web :3001 -> API :3002)"
try {
  $null = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "  OK"
} catch {
  Write-Host "  Backend ishlamayapti - boshqa terminalda: npm run dev" -ForegroundColor Yellow
}

Invoke-Adb start-server | Out-Null
$serial = Get-RunningSerial

if (-not $serial) {
  Write-Step 2 "Emulyator: $Avd"
  $ranges = Get-ExcludedRanges
  $port = $null
  foreach ($p in 5554..5682) {
    if ($p % 2 -ne 0) { continue }
    if (Test-PortFree $p $ranges) { $port = $p; break }
  }
  if (-not $port) { throw "5554-5682 oraligida bosh port yoq (netsh excludedportrange)" }

  Get-ChildItem $avdDir -Filter "*.lock" -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "  port $port"
  Start-Process -FilePath $emulator -ArgumentList @("-avd", $Avd, "-port", "$port", "-timezone", "Asia/Tashkent") | Out-Null
  $serial = "emulator-$port"
} else {
  Write-Step 2 "Emulyator allaqachon ishlayapti: $serial"
}

$deadline = (Get-Date).AddMinutes(4)
while ($true) {
  $boot = Invoke-Adb -s $serial shell getprop sys.boot_completed
  if ("$boot".Trim() -eq "1") { break }
  if ((Get-Date) -gt $deadline) { throw "Emulyator 4 daqiqada yuklanmadi ($serial)" }
  Start-Sleep -Seconds 3
}
Write-Host "  $serial tayyor"

if ($NoRun) { return }

Write-Step 3 "Flutter ilova"
# Keep Gradle on the user cache; sandboxed/temp GRADLE_USER_HOME breaks transforms.
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
Set-Location (Join-Path $root "apps\mobile")
flutter pub get
flutter run -d $serial
