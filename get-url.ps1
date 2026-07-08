if (Test-Path "tunnel.log") {
    (Select-String -Path "tunnel.log" -Pattern 'https://[a-z0-9-]*\.trycloudflare\.com' -AllMatches).Matches.Value | Select-Object -Last 1
}
