# HR HUB ofis skripti — boshqa PCda Node/Git shart emas.
# Admin:  ADMIN-PAROL.bat  (parolni bir marta o‘rnatadi, joyidagi odam ko‘rmaydi)
# Joyida: BOSHLASH.bat     (faqat qurilma paroli so‘raladi)
param(
  [ValidateSet("admin", "field", "bootstrap")]
  [string]$Mode = "field"
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$dataDir = Join-Path $here "data"
$runtimeDir = Join-Path $here "runtime"
$gwDir = Join-Path $here "gw"
$keyFile = Join-Path $dataDir "link.key"
$configFile = Join-Path $here "config.json"
$pyEmbed = Join-Path $runtimeDir "python\python.exe"
$cfExe = Join-Path $runtimeDir "cloudflared.exe"
$gwPort = 8800

New-Item -ItemType Directory -Force -Path $dataDir, $runtimeDir | Out-Null

function Write-Info([string]$msg) {
  Write-Host $msg -ForegroundColor Cyan
}

function Read-Config {
  if (-not (Test-Path $configFile)) {
    throw "config.json yo‘q"
  }
  return Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
}

function New-LinkPassword {
  $bytes = New-Object byte[] 18
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $chars = foreach ($b in $bytes) { $alphabet[$b % $alphabet.Length] }
  return -join $chars
}

function Save-LinkKey([string]$value) {
  Set-Content -Path $keyFile -Value $value -Encoding ASCII -NoNewline
  attrib +h $keyFile | Out-Null
}

function Copy-GwSources {
  $src = $null
  foreach ($cand in @(
    (Join-Path (Split-Path -Parent (Split-Path -Parent $here)) "apps\device-gw"),
    (Join-Path (Split-Path -Parent $here) "apps\device-gw")
  )) {
    if (Test-Path (Join-Path $cand "main.py")) {
      $src = $cand
      break
    }
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $gwDir "adapters") | Out-Null
  if ($src) {
    Copy-Item (Join-Path $src "main.py") $gwDir -Force
    Copy-Item (Join-Path $src "nats_client.py") $gwDir -Force
    Copy-Item (Join-Path $src "requirements.txt") $gwDir -Force
    Copy-Item (Join-Path $src "adapters\*.py") (Join-Path $gwDir "adapters") -Force
  }
  if (-not (Test-Path (Join-Path $gwDir "main.py"))) {
    throw "Gateway kodlari yo‘q. Avval ADMIN-PAROL.bat ni HR HUB kompyuterida ishga tushiring, keyin shu papkani to‘liq nusxalang."
  }
}

function Install-PortablePython {
  if (Test-Path $pyEmbed) { return }
  Write-Info "Python yuklanmoqda (shu papkaga, tizimga o‘rnatilmaydi)..."
  $zip = Join-Path $runtimeDir "python-embed.zip"
  $url = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  $pyDir = Join-Path $runtimeDir "python"
  New-Item -ItemType Directory -Force -Path $pyDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $pyDir -Force
  Remove-Item $zip -Force
  $pth = Get-ChildItem $pyDir -Filter "python*._pth" | Select-Object -First 1
  if ($pth) {
    @(
      "python312.zip",
      ".",
      "Lib\site-packages",
      "import site"
    ) | Set-Content -Path $pth.FullName -Encoding ASCII
  }
  $getPip = Join-Path $runtimeDir "get-pip.py"
  Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
  & $pyEmbed $getPip --no-warn-script-location
  Remove-Item $getPip -Force -ErrorAction SilentlyContinue
}

function Install-Cloudflared {
  if (Test-Path $cfExe) { return }
  Write-Info "Tunnel dasturi yuklanmoqda..."
  $nearby = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) "tools\cloudflared.exe"
  if (Test-Path $nearby) {
    Copy-Item $nearby $cfExe -Force
    return
  }
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
}

function Install-GwDeps {
  Write-Info "Kerakli kutubxonalar o‘rnatilmoqda..."
  & $pyEmbed -m pip install --disable-pip-version-check -q -r (Join-Path $gwDir "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "Kutubxona o‘rnatilmadi (internet kerak)." }
}

function Start-Gateway([string]$apiUrl, [string]$punchKey) {
  $env:DEVICE_GW_PORT = "$gwPort"
  $env:DEVICE_GW_HOST = "127.0.0.1"
  $env:DEVICE_GW_API_URL = $apiUrl
  $env:DEVICE_GW_PUNCH_KEY = $punchKey
  $env:DEVICE_GW_NATS_URL = "nats://127.0.0.1:1"
  $env:DEFAULT_ADAPTER = "hikvision_isapi"
  $proc = Start-Process -FilePath $pyEmbed -ArgumentList @(
    "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "$gwPort"
  ) -WorkingDirectory $gwDir -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 400
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$gwPort/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return $proc }
    } catch {}
  }
  throw "Gateway ochilmadi."
}

function Start-Tunnel {
  Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  $logErr = Join-Path $env:TEMP "hrhub-office-link.err.log"
  $logOut = Join-Path $env:TEMP "hrhub-office-link.out.log"
  Remove-Item $logErr, $logOut -Force -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $cfExe -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$gwPort") `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -WindowStyle Hidden
  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $content = ""
    foreach ($f in @($logOut, $logErr)) {
      if (Test-Path $f) { $content += Get-Content $f -Raw -ErrorAction SilentlyContinue }
    }
    if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
      $url = $Matches[0]
      break
    }
    if ($proc.HasExited) { throw "Tunnel ochilmadi." }
  }
  if (-not $url) { throw "Tunnel URL topilmadi." }
  return @{ Proc = $proc; Url = $url }
}

function Invoke-Admin {
  Copy-GwSources
  $exists = Test-Path $keyFile
  if ($exists) {
    Write-Host ""
    Write-Host "Ulanish paroli ALLAQACHON o‘rnatilgan." -ForegroundColor Yellow
    Write-Host "Joyidagi odamga ko‘rsatilmaydi. Yangilash uchun: ADMIN-PAROL.bat ni o‘chirib qayta yarating (data papkasidagi yashirin fayl)."
    Write-Host "Bu papkani USB / AnyDesk orqali ofis PCga to‘liq nusxalang, keyin BOSHLASH.bat."
    return
  }
  $pwd = New-LinkPassword
  Save-LinkKey $pwd
  $cfg = Read-Config
  Write-Host ""
  Write-Host "==============================================" -ForegroundColor Green
  Write-Host "  ADMIN ULANISH PAROLI (faqat sizga)" -ForegroundColor Green
  Write-Host "==============================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "  $pwd" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Shu parolni Railway → API → Variables ga yozing:"
  Write-Host "    DEVICE_LINK_KEY       = (yuqoridagi)"
  Write-Host "    PUNCH_INGEST_API_KEY  = (xuddi shu)"
  Write-Host ""
  Write-Host "  Keyin papkani ofis PCga nusxalang va BOSHLASH.bat ni ishlatilsin."
  Write-Host "  Joyidagi odam bu parolni KO‘RMAYDI — undan faqat qurilma paroli so‘raladi."
  Write-Host ""
  try {
    $cmd = "source `$HOME/.railway/env; cd /mnt/d/hr-hub; railway variable set --service '@hr-hub/api' DEVICE_LINK_KEY=$pwd; railway variable set --service '@hr-hub/api' PUNCH_INGEST_API_KEY=$pwd"
    & wsl -e bash -lc $cmd 2>$null | Out-Null
    Write-Host "  Railway o‘zgaruvchilari yangilanishga urindi." -ForegroundColor DarkGray
  } catch {
    Write-Host "  Railway avtomatik yozilmadi — Variables ni qo‘lda qo‘ying." -ForegroundColor DarkGray
  }
}

function Invoke-Bootstrap {
  Copy-GwSources
  Install-PortablePython
  Install-Cloudflared
  Install-GwDeps
}

function Start-Gui {
  $exe = Join-Path $here "dist\HRHUB-Qurilma\HRHUB-Qurilma.exe"
  if (Test-Path $exe) {
    Start-Process -FilePath $exe -WorkingDirectory $here
    return
  }
  $gui = Join-Path $here "office_link_app.py"
  $pythonw = Get-Command pythonw -ErrorAction SilentlyContinue
  if ($pythonw) {
    Start-Process -FilePath $pythonw.Source -ArgumentList $gui -WorkingDirectory $here
    return
  }
  throw "pythonw yoki HRHUB-Qurilma.exe yo‘q. BOSHLASH.bat ni tekshiring."
}

function Invoke-Field {
  try { Copy-GwSources } catch { }
  Start-Gui
}

if ($Mode -eq "admin") { Invoke-Admin }
elseif ($Mode -eq "bootstrap") { Invoke-Bootstrap }
else { Invoke-Field }
