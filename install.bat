@echo off
chcp 65001 > nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║      Instalando EG Music              ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"

python -m venv venv
venv\Scripts\pip install --upgrade pip --quiet
venv\Scripts\pip install -r backend\requirements.txt

cd frontend
call npm install
call npm run build
cd ..

echo.
echo  ╔══════════════════════════════════════╗
echo  ║  ✓ Instalación completada            ║
echo  ║    Ejecuta start.bat para iniciar    ║
echo  ╚══════════════════════════════════════╝
pause
