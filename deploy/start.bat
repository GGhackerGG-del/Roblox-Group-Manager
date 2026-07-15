@echo off
chcp 65001 > nul

echo =========================================
echo   Limited.Ink - Lokalnyi zapusk
echo =========================================
echo.

rem --- Check Docker is installed ---
docker --version > nul 2>&1
if errorlevel 1 goto nodocker
goto checkrunning

:nodocker
echo [OSHIBKA] Docker ne ustanovlen!
echo.
echo Skachaite i ustanovite Docker Desktop:
echo https://www.docker.com/products/docker-desktop/
echo.
echo Posle ustanovki perezapustite etot skript.
pause
exit /b 1

:checkrunning
docker info > nul 2>&1
if errorlevel 1 goto notrunning
goto envsetup

:notrunning
echo [OSHIBKA] Docker Desktop ne zapushchen!
echo Zapustite Docker Desktop i povtorite popytku.
pause
exit /b 1

:envsetup
if exist "%~dp0.env" goto startapp

echo Sozdaem fail nastroek .env...
copy "%~dp0.env.example" "%~dp0.env" > nul

for /f %%i in ('powershell -NoProfile -Command "-join ((1..64) ^| ForEach-Object { \"{0:x}\" -f (Get-Random -Maximum 16) })"') do set JWT_SECRET=%%i
for /f %%i in ('powershell -NoProfile -Command "-join ((1..64) ^| ForEach-Object { \"{0:x}\" -f (Get-Random -Maximum 16) })"') do set SESSION_SECRET=%%i
for /f %%i in ('powershell -NoProfile -Command "-join ((1..32) ^| ForEach-Object { \"{0:x}\" -f (Get-Random -Maximum 16) })"') do set DB_PASSWORD=%%i

powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_random_jwt_secret_here', '%JWT_SECRET%' | Set-Content '%~dp0.env'"
powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_random_session_secret_here', '%SESSION_SECRET%' | Set-Content '%~dp0.env'"
powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_strong_database_password_here', '%DB_PASSWORD%' | Set-Content '%~dp0.env'"

echo.
echo Fail .env sozdan. Vvedite vash token Telegram bota:
set /p BOT_TOKEN=Token bota (ili Enter chtoby propustit): 
if "%BOT_TOKEN%"=="" goto startapp
powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_telegram_bot_token', '%BOT_TOKEN%' | Set-Content '%~dp0.env'"

:startapp
echo.
echo Zapuskaem prilozhenie...
echo (Pervyi zapusk mozhet zaniat 3-5 minut - idet sborka)
echo.

cd /d "%~dp0"
docker compose --env-file .env up -d --build
if errorlevel 1 goto builderror
goto initdb

:builderror
echo.
echo [OSHIBKA] Ne udalos zapustit. Proverte logi:
echo   docker compose logs app
pause
exit /b 1

:initdb
echo.
echo Initsializiruem bazu dannykh...
timeout /t 5 /nobreak > nul
docker compose exec -T app pnpm --filter @workspace/db run push-force
if errorlevel 1 goto dbretry
goto dbdone

:dbretry
echo.
echo [OSHIBKA] Ne udalos initsializirovat bazu dannykh, povtoriaem popytku...
timeout /t 5 /nobreak > nul
docker compose exec -T app pnpm --filter @workspace/db run push-force
if errorlevel 1 goto dberror
goto dbdone

:dberror
echo.
echo [OSHIBKA] Ne udalos sozdat tablitsy v baze dannykh avtomaticheski.
echo Kogda prilozhenie zapustitsia, vypolnite vruchnuiu v etoi papke:
echo   docker compose exec app pnpm --filter @workspace/db run push-force
echo.
pause

:dbdone
echo.
echo =========================================
echo   Gotovo! Otkryvaem prilozhenie...
echo =========================================
echo.

echo Ozhidaem zapuska servera...
set /a tries=0

:waitloop
timeout /t 3 /nobreak > nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/healthz 2>nul | findstr "200" > nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% lss 20 goto waitloop

:ready
echo Otkryvaem http://localhost:3000 v brauzere...
start http://localhost:3000

echo.
echo   Prilozhenie rabotaet na http://localhost:3000
echo   Eto okno mozhno zakryt - prilozhenie prodolzhit rabotat v fone.
echo.
echo   Poleznye komandy (zapuskat iz papki deploy\):
echo     docker compose logs -f app     - logi
echo     docker compose restart app     - perezapustit
echo     docker compose down            - ostanovit
echo     docker compose up -d --build   - obnovit posle izmenenii
echo.
pause
