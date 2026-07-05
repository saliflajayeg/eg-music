@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: Localiza cloudflared
set CLOUDFLARED=cloudflared
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if exist "C:\Program Files\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files\cloudflared\cloudflared.exe"

echo.
echo  ═══════════════════════════════════════════════════════════
echo   EG Music — Publicar en internet desde este PC
echo  ═══════════════════════════════════════════════════════════
echo.
echo  [1/2] Iniciando el servidor local...
start "EG Music - Servidor (no cerrar)" venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --app-dir backend
timeout /t 4 /nobreak > nul

echo  [2/2] Creando el tunel publico de Cloudflare...
echo.
echo  ┌─────────────────────────────────────────────────────────┐
echo  │  Busca abajo una direccion como:                        │
echo  │      https://algo-algo-algo.trycloudflare.com           │
echo  │                                                         │
echo  │  ESA es la direccion publica de EG Music.               │
echo  │  Compartela para que la gente entre, se registre        │
echo  │  y suba su musica.                                      │
echo  │                                                         │
echo  │  ⚠ NO cierres esta ventana ni la del servidor:          │
echo  │    el sitio esta online mientras esten abiertas.        │
echo  │  ⚠ La direccion CAMBIA cada vez que ejecutes esto.      │
echo  └─────────────────────────────────────────────────────────┘
echo.
"%CLOUDFLARED%" tunnel --url http://localhost:8001

echo.
echo  El tunel se ha cerrado. El sitio ya no es accesible desde internet.
pause
