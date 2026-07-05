@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo Iniciando EG Music en http://0.0.0.0:8001 ...
start "" venv\Scripts\pythonw.exe backend\main.py
