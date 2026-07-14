#!/bin/bash
set -e

echo "========================================="
echo "  Limited.Ink — Локальный запуск"
echo "========================================="
echo ""

# Проверяем Docker
if ! command -v docker &> /dev/null; then
    echo "[ОШИБКА] Docker не установлен!"
    echo ""
    echo "Установите Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "[ОШИБКА] Docker не запущен. Запустите Docker Desktop."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Создаём .env если не существует
if [ ! -f ".env" ]; then
    cp .env.example .env
    JWT_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    sed -i.bak "s|your_random_jwt_secret_here|$JWT_SECRET|" .env
    sed -i.bak "s|your_random_session_secret_here|$SESSION_SECRET|" .env
    sed -i.bak "s|your_strong_database_password_here|$DB_PASSWORD|" .env
    rm -f .env.bak
    echo "Файл .env создан с автогенерированными секретами."
    echo ""
    echo "Введите токен Telegram бота (или Enter чтобы пропустить):"
    read -r BOT_TOKEN
    if [ -n "$BOT_TOKEN" ]; then
        sed -i.bak "s|your_telegram_bot_token|$BOT_TOKEN|" .env
        rm -f .env.bak
    fi
    echo ""
fi

echo "Запускаем приложение..."
echo "(Первый запуск может занять 3-5 минут — идёт сборка)"
echo ""

docker compose --env-file .env up -d --build

echo ""
echo "Инициализируем базу данных..."
sleep 5
docker compose exec -T app sh -c "npx drizzle-kit push --config lib/db/drizzle.config.ts" || true

echo ""
echo "========================================="
echo "  Готово! Откройте: http://localhost:3000"
echo "========================================="
echo ""
echo "Полезные команды:"
echo "  docker compose logs -f app     — логи"
echo "  docker compose restart app     — перезапустить"
echo "  docker compose down            — остановить"
echo "  docker compose up -d --build   — обновить"
