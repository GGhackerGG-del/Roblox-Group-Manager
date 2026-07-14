@echo off
chcp 65001 > nul
echo =========================================
echo   Limited.Ink — Локальный запуск
echo =========================================
echo.

rem Проверяем Docker
docker --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Docker не установлен!
    echo.
    echo Скачайте и установите Docker Desktop:
    echo https://www.docker.com/products/docker-desktop/
    echo.
    echo После установки перезапустите этот скрипт.
    pause
    exit /b 1
)

docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Docker Desktop не запущен!
    echo Запустите Docker Desktop и повторите попытку.
    pause
    exit /b 1
)

rem Создаём .env если не существует
if not exist "%~dp0.env" (
    echo Создаём файл настроек .env...
    copy "%~dp0.env.example" "%~dp0.env" > nul

    rem Генерируем случайные секреты через PowerShell
    for /f %%i in ('powershell -NoProfile -Command "-join ((1..64) ^| ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })"') do set JWT_SECRET=%%i
    for /f %%i in ('powershell -NoProfile -Command "-join ((1..64) ^| ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })"') do set SESSION_SECRET=%%i
    for /f %%i in ('powershell -NoProfile -Command "-join ((1..32) ^| ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })"') do set DB_PASSWORD=%%i

    powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_random_jwt_secret_here', '%JWT_SECRET%' | Set-Content '%~dp0.env'"
    powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_random_session_secret_here', '%SESSION_SECRET%' | Set-Content '%~dp0.env'"
    powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_strong_database_password_here', '%DB_PASSWORD%' | Set-Content '%~dp0.env'"

    echo.
    echo Файл .env создан. Введите ваш токен Telegram бота:
    set /p BOT_TOKEN=Токен бота (или Enter чтобы пропустить): 
    if not "%BOT_TOKEN%"=="" (
        powershell -NoProfile -Command "(Get-Content '%~dp0.env') -replace 'your_telegram_bot_token', '%BOT_TOKEN%' | Set-Content '%~dp0.env'"
    )
    echo.
)

echo Запускаем приложение...
echo (Первый запуск может занять 3-5 минут — идёт сборка)
echo.

cd /d "%~dp0"
docker compose --env-file .env up -d --build

if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Не удалось запустить. Проверьте логи:
    echo   docker compose logs app
    pause
    exit /b 1
)

echo.
echo Инициализируем базу данных...
timeout /t 5 /nobreak > nul
docker compose exec -T app sh -c "npx drizzle-kit push --config lib/db/drizzle.config.ts" 2> nul

echo.
echo =========================================
echo   Готово! Открываем приложение...
echo =========================================
echo.

rem Ждём пока сервер поднимется (до 60 секунд)
echo Ожидаем запуска сервера...
set /a tries=0

:waitloop
timeout /t 3 /nobreak > nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/healthz 2>nul | findstr "200" > nul
if %errorlevel% equ 0 goto ready
set /a tries+=1
if %tries% lss 20 goto waitloop

:ready
echo Открываем http://localhost:3000 в браузере...
start http://localhost:3000

echo.
echo   Приложение работает на http://localhost:3000
echo   Это окно можно закрыть — приложение продолжит работать в фоне.
echo.
echo   Полезные команды (запускать из папки deploy\):
echo     docker compose logs -f app     — логи
echo     docker compose restart app     — перезапустить
echo     docker compose down            — остановить
echo     docker compose up -d --build   — обновить после изменений
echo.
pause
