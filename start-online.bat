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
if exist tunnel.log del tunnel.log
start "EG Music - Tunel publico (no cerrar)" "%CLOUDFLARED%" tunnel --url http://localhost:8001 --logfile tunnel.log

echo         Esperando la direccion publica...
set "URL="
for /l %%i in (1,1,30) do (
    if not defined URL (
        for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File "get-url.ps1"`) do set "URL=%%u"
        if not defined URL timeout /t 1 /nobreak > nul
    )
)

if not defined URL (
    echo.
    echo  [ERROR] No se detecto la direccion publica a tiempo.
    echo          Revisa la ventana "Tunel publico" o el archivo tunnel.log
    pause
    exit /b 1
)

echo|set /p="%URL%" | clip

echo.
echo  ═══════════════════════════════════════════════════════════
echo   EG Music ya esta en linea:
echo.
echo    %URL%
echo.
echo   [Copiada al portapapeles - pega con Ctrl+V para compartirla]
echo  ═══════════════════════════════════════════════════════════
echo.
echo  ⚠ NO cierres las ventanas "Servidor" ni "Tunel publico":
echo    el sitio esta online mientras esten abiertas.
echo  ⚠ Esta direccion CAMBIARA la proxima vez que reinicies.
echo  ℹ ¿La olvidaste? Ejecuta get-online-url.bat en cualquier momento.
echo.
pause
