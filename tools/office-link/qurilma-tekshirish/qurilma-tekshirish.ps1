param([string]$Ip = '192.168.1.90')

$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.Generic.List[string]
function Say([string]$s) { Write-Host $s; $out.Add($s) }

Say "=== HR HUB: Hikvision qurilma tekshiruvi ==="
Say ("Sana: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "   Qurilma IP: $Ip")
Say ""

# 1) Kompyuter tarmog'i
Say "--- 1. Kompyuter IP manzillari ---"
$pcIps = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'
  })
$sameNet = $false
$ipBytes = ([System.Net.IPAddress]::Parse($Ip)).GetAddressBytes()
foreach ($a in $pcIps) {
  $bits = [int]$a.PrefixLength
  $pcBytes = ([System.Net.IPAddress]::Parse($a.IPAddress)).GetAddressBytes()
  $match = $true
  for ($i = 0; $i -lt 4; $i++) {
    $take = [Math]::Max(0, [Math]::Min(8, $bits - 8 * $i))
    $mask = if ($take -eq 0) { 0 } else { (0xFF -shl (8 - $take)) -band 0xFF }
    if (($pcBytes[$i] -band $mask) -ne ($ipBytes[$i] -band $mask)) { $match = $false }
  }
  if ($match) { $sameNet = $true }
  $flag = if ($match) { '  <- qurilma bilan BIR tarmoqda' } else { '' }
  Say ("  {0}/{1}  ({2}){3}" -f $a.IPAddress, $a.PrefixLength, $a.InterfaceAlias, $flag)
}
$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop
Say "  Asosiy shlyuz (router): $gw"
Say ""

# 2) Ping
Say "--- 2. Ping $Ip ---"
$ping = Test-Connection -ComputerName $Ip -Count 2 -Quiet
Say ("  Ping: " + $(if ($ping) { 'JAVOB BOR' } else { 'javob yo''q' }))
Say ""

# 3) Portlar
Say "--- 3. Portlar ---"
$ports = [ordered]@{ 80 = 'HTTP / ISAPI (Link shuni ishlatadi)'; 443 = 'HTTPS'; 8000 = 'Hikvision SDK (iVMS-4200)'; 8443 = 'HTTPS alt' }
$open = @{}
foreach ($e in $ports.GetEnumerator()) {
  $p = [int]$e.Key
  $c = New-Object System.Net.Sockets.TcpClient
  $ok = $false
  try { $ok = $c.ConnectAsync($Ip, $p).Wait(1500) -and $c.Connected } catch {}
  $c.Close()
  $open[$p] = $ok
  Say ("  {0,-5} {1,-7} {2}" -f $p, $(if ($ok) { 'OCHIQ' } else { 'yopiq' }), $e.Value)
}
Say ""

# 4) ISAPI
$isapi = 'none'
if ($open[80]) {
  Say "--- 4. ISAPI: GET /ISAPI/System/deviceInfo ---"
  try {
    $r = Invoke-WebRequest -Uri "http://$Ip/ISAPI/System/deviceInfo" -UseBasicParsing -TimeoutSec 5
    Say ("  HTTP {0} (parolsiz ochildi)" -f [int]$r.StatusCode)
    $isapi = 'open'
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $www = $resp.Headers['WWW-Authenticate']
      $srv = $resp.Headers['Server']
      Say "  HTTP $code   Server: $srv"
      Say "  WWW-Authenticate: $www"
      if ($code -eq 401 -and $www -match 'Digest') { $isapi = 'digest' }
      elseif ($code -eq 404) { $isapi = 'notfound' }
      else { $isapi = "http$code" }
    } else {
      Say ("  Xato: " + $_.Exception.Message)
      $isapi = 'error'
    }
  }
  Say ""
}

# 5) SADP (Hikvision qurilmalarni tarmoq segmentidan qat'i nazar topadi)
Say "--- 5. SADP qidiruv (UDP 37020) ---"
$found = @()
try {
  $group = [System.Net.IPAddress]::Parse('239.255.255.250')
  $udp = New-Object System.Net.Sockets.UdpClient
  $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
  $udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 37020)))
  $udp.JoinMulticastGroup($group)
  $udp.Client.ReceiveTimeout = 800
  $uuid = [guid]::NewGuid().ToString().ToUpper()
  $probe = "<?xml version=`"1.0`" encoding=`"utf-8`"?><Probe><Uuid>$uuid</Uuid><Types>inquiry</Types></Probe>"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($probe)
  $ep = New-Object System.Net.IPEndPoint($group, 37020)
  [void]$udp.Send($bytes, $bytes.Length, $ep)
  Start-Sleep -Milliseconds 300
  [void]$udp.Send($bytes, $bytes.Length, $ep)
  $deadline = (Get-Date).AddSeconds(4)
  $seen = @{}
  while ((Get-Date) -lt $deadline) {
    try {
      $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
      $data = $udp.Receive([ref]$remote)
      $txt = [System.Text.Encoding]::UTF8.GetString($data)
      if ($txt -notmatch '<ProbeMatch') { continue }
      [xml]$x = $txt
      $m = $x.ProbeMatch
      $key = "$($m.MAC)"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = $true
      $found += $m
    } catch {}
  }
  $udp.Close()
} catch {
  Say ("  SADP ishga tushmadi: " + $_.Exception.Message)
}
if ($found.Count -eq 0) {
  Say "  Hech qanday Hikvision qurilma javob bermadi."
} else {
  foreach ($m in $found) {
    Say ("  * {0}  model: {1}" -f $m.IPv4Address, $m.DeviceDescription)
    Say ("      SN: {0}   MAC: {1}" -f $m.DeviceSN, $m.MAC)
    Say ("      Proshivka: {0} {1}" -f $m.SoftwareVersion, $m.DSPVersion)
    Say ("      Mask: {0}   Shlyuz: {1}   DHCP: {2}" -f $m.IPv4SubnetMask, $m.IPv4Gateway, $m.DHCP)
    Say ("      HTTP port: {0}   SDK port: {1}   Aktivlashgan: {2}" -f $m.HttpPort, $m.CommandPort, $m.Activated)
  }
}
Say ""

# 6) Xulosa
Say "=== XULOSA ==="
$sadpHit = $found | Where-Object { $_.IPv4Address -eq $Ip } | Select-Object -First 1
if (-not $sameNet) {
  Say "! Kompyuter va qurilma BOSHQA tarmoqda. Link faqat o'z tarmog'ini qidiradi."
  Say "  Yechim: qurilmada IP ni kompyuter tarmog'iga moslang (masalan shlyuz $gw bo'lsa, shu tarmoqdan bo'sh IP)."
}
if ($sadpHit -and $sadpHit.Activated -eq 'false') {
  Say "! Qurilma AKTIVLASHMAGAN. Avval SADP yoki ekran orqali admin parol o'rnating."
}
if ($open[80] -and $isapi -eq 'digest') {
  Say "OK: ISAPI ishlayapti (80-port, Digest). Link'da IP ni qo'lda kiriting: $Ip"
} elseif ($open[80] -and $isapi -eq 'open') {
  Say "OK: ISAPI parolsiz ochiq (aktivlash kerak bo'lishi mumkin). Link'da IP ni qo'lda kiriting."
} elseif ($open[80]) {
  Say "! 80-port ochiq, lekin ISAPI javobi odatiy emas ($isapi). Proshivka ISAPI'ni qo'llamasligi mumkin."
} elseif ($open[8000]) {
  Say "! Faqat 8000 (SDK) ochiq, 80 (ISAPI) yopiq. Eski proshivka: Link ISAPI orqali ulana olmaydi."
  Say "  Yechim: proshivkani yangilash (USB orqali digicap.dav) yoki qurilmada HTTP portni yoqish."
} elseif ($ping) {
  Say "! Ping bor, lekin 80 va 8000 yopiq. Qurilmada port sozlamalarini tekshiring."
} else {
  Say "! Qurilma umuman javob bermadi: kabel, switch yoki IP/tarmoq noto'g'ri."
}

$file = Join-Path ([Environment]::GetFolderPath('Desktop')) 'qurilma-tekshiruv-natija.txt'
$out | Set-Content -Path $file -Encoding UTF8
Write-Host ""
Write-Host "Natija saqlandi: $file  (shu faylni yuboring)"
