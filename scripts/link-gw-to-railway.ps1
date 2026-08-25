# Link local device-gw to Railway API (HTTP punch ingest).
# Usage:
#   .\scripts\link-gw-to-railway.ps1 -ApiUrl https://xxx.up.railway.app -PunchKey "your-key"
# Then start: npm run dev:gw

param(
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [Parameter(Mandatory = $true)][string]$PunchKey,
  [int]$Port = 8800
)

$ErrorActionPreference = "Stop"
$gwEnv = Join-Path $PSScriptRoot "..\apps\device-gw\.env"
$ApiUrl = $ApiUrl.TrimEnd("/")

@"
DEVICE_GW_PORT=$Port
DEVICE_GW_HOST=0.0.0.0
DEVICE_GW_API_URL=$ApiUrl
DEVICE_GW_PUNCH_KEY=$PunchKey
DEVICE_GW_NATS_URL=nats://127.0.0.1:4222
DEVICE_GW_NATS_SUBJECT=hrhub.punch.raw
DEFAULT_ADAPTER=hikvision_isapi
"@ | Set-Content -Path $gwEnv -Encoding UTF8

Write-Host "Wrote $gwEnv"
Write-Host "Start gateway: npm run dev:gw"
Write-Host "For Railway device control, expose GW with:"
Write-Host "  cloudflared tunnel --url http://127.0.0.1:$Port"
Write-Host "Then set DEVICE_GW_URL on Railway api to the cloudflared HTTPS URL."
