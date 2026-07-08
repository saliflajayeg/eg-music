@echo off
chcp 65001 > nul
cd /d "%~dp0"

if not exist tunnel.log (
    echo.
    echo  El tunel no parece estar corriendo ^(no existe tunnel.log^).
    echo  Ejecuta start-online.bat primero.
    echo.
    pause
    exit /b 1
)

set "URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File "get-url.ps1"`) do set "URL=%%u"

if not defined URL (
    echo.
    echo  Aun no hay una direccion publica en tunnel.log.
    echo  El tunel puede estar iniciandose todavia, o se cerro.
    echo.
    pause
    exit /b 1
)

echo|set /p="%URL%" | clip

echo.
echo  Direccion publica actual de EG Music:
echo.
echo   %URL%
echo.
echo  (Copiada al portapapeles - pega con Ctrl+V para compartirla)
echo.
pause
