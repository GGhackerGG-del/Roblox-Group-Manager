@echo off
chcp 65001 > nul
echo =========================================
echo   Limited.Ink — Локальный запуск
echo =========================================
echo.

:: Проверяем Docker
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

:: Создаём .env если не существует
if not exist "%~dp0.env" (
    echo Создаём файл настроек .env...
    copy "%~dp0.env.example" "%~dp0.env" > nul

    :: Генерируем случайные секреты через node
    for /f %%i in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set JWT_SECRET=%%i
    for /f %%i in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set SESSION_SECRET=%%i
    for /f %%i in ('node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"') do set DB_PASSWORD=%%i

    powershell -Command "(Get-Content '%~dp0.env') -replace 'your_random_jwt_secret_here', '%JWT_SECRET%' | Set-Content '%~dp0.env'"
    powershell -Command "(Get-Content '%~dp0.env') -replace 'your_random_session_secret_here', '%SESSION_SECRET%' | Set-Content '%~dp0.env'"
    powershell -Command "(Get-Content '%~dp0.env') -replace 'your_strong_database_password_here', '%DB_PASSWORD%' | Set-Content '%~dp0.env'"

    echo.
    echo Файл .env создан. Введите ваш токен Telegram бота:
    set /p BOT_TOKEN=Токен бота (или Enter чтобы пропустить): 
    if not "%BOT_TOKEN%"=="" (
        powershell -Command "(Get-Content '%~dp0.env') -replace 'your_telegram_bot_token', '%BOT_TOKEN%' | Set-Content '%~dp0.env'"
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
docker compose exec app node -e "const { execSync } = require('child_process'); execSync('node_modules/.bin/drizzle-kit push --config lib/db/drizzle.config.ts', { stdio: 'inherit' });" 2> nul || (
    docker compose exec -T app sh -c "cd /app && npx drizzle-kit push --config lib/db/drizzle.config.ts" 2> nul
)

echo.
echo =========================================
echo   Готово! Приложение запущено.
echo =========================================
echo.
echo   Откройте в браузере: http://localhost:3000
echo.
echo   Полезные команды:
echo     docker compose logs -f app     — логи приложения
echo     docker compose restart app     — перезапустить
echo     docker compose down            — остановить
echo     docker compose up -d --build   — обновить и перезапустить
echo.
pause
