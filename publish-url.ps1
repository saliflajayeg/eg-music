# Publishes the current Cloudflare tunnel address to the EG Music Worker, so
# every installed app finds the backend without a rebuild or reinstall.
# Called automatically by start-online.bat once the tunnel is up.
param([string]$Url)

$ErrorActionPreference = 'Stop'
$worker = Join-Path $PSScriptRoot 'worker'

if (-not $Url) {
    $log = Join-Path $PSScriptRoot 'tunnel.log'
    if (-not (Test-Path $log)) { Write-Host '  [publicar] no hay tunnel.log todavia'; exit 1 }
    $Url = (Select-String -Path $log -Pattern 'https://[a-z0-9-]*\.trycloudflare\.com' -AllMatches).Matches.Value |
           Select-Object -Last 1
}
if (-not $Url) { Write-Host '  [publicar] no se encontro la direccion del tunel'; exit 1 }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Push-Location $worker
try {
    cmd /c "npx wrangler kv key put --binding=CONFIG backend_url `"$Url`" > `"$env:TEMP\egm_kv.txt`" 2>&1"
    $ok = ($LASTEXITCODE -eq 0)
    cmd /c "npx wrangler kv key put --binding=CONFIG updated_at `"$stamp`" >> `"$env:TEMP\egm_kv.txt`" 2>&1"
    if ($ok -and $LASTEXITCODE -eq 0) {
        Write-Host "  [publicar] OK - la app ya apunta a: $Url"
    } else {
        Write-Host '  [publicar] ERROR al publicar. Detalles:'
        Get-Content "$env:TEMP\egm_kv.txt" -ErrorAction SilentlyContinue | Select-Object -Last 6
        Write-Host '  (si dice "not authenticated": ejecuta  npx wrangler login  en la carpeta worker)'
    }
} finally { Pop-Location }
