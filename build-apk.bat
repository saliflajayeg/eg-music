@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  ==========================================
echo   EG Music - Reconstruir y publicar la APK
echo  ==========================================
echo.
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo  [1/5] Compilando la web para Android...
cd frontend
call npm install || goto :error
call npm run build:android || goto :error
echo  [2/5] Copiando la web al proyecto Android...
call npx cap sync android || goto :error
echo  [3/5] Construyendo la APK (puede tardar unos minutos)...
cd android
call gradlew.bat assembleDebug || goto :error
cd ..\..
echo  [4/5] Guardando la APK en dist-apk...
if not exist dist-apk mkdir dist-apk
copy /y frontend\android\app\build\outputs\apk\debug\app-debug.apk dist-apk\EG-Music.apk > nul || goto :error
echo  [5/5] Subiendo la APK a la pagina web...
venv\Scripts\python.exe scripts\upload_apk.py || goto :error
echo.
echo  LISTO: la nueva APK ya se descarga desde la pagina.
echo LISTO > build-apk.log
pause
exit /b 0
:error
echo.
echo  [ERROR] Algo fallo. Mira el mensaje de arriba.
echo ERROR > build-apk.log
pause
exit /b 1
