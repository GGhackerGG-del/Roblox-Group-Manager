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
if ! docker compose exec -T app pnpm --filter @workspace/db run push-force; then
    echo "[ОШИБКА] Не удалось инициализировать базу, повторяем попытку..."
    sleep 5
    if ! docker compose exec -T app pnpm --filter @workspace/db run push-force; then
        echo ""
        echo "[ОШИБКА] Не удалось создать таблицы в базе данных автоматически."
        echo "Выполните вручную из этой папки:"
        echo "  docker compose exec app pnpm --filter @workspace/db run push-force"
        echo ""
    fi
fi

echo ""
echo "========================================="
echo "  Готово! Открываем приложение..."
echo "========================================="
echo ""

echo "Ожидаем запуска сервера..."
tries=0
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/healthz 2>/dev/null | grep -q "200"; do
    sleep 3
    tries=$((tries+1))
    if [ "$tries" -ge 20 ]; then
        break
    fi
done

echo "Открываем http://localhost:3000 в браузере..."
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000 &> /dev/null &
elif command -v open &> /dev/null; then
    open http://localhost:3000
fi

echo ""
echo "  Приложение работает на http://localhost:3000"
echo "  Это окно можно закрыть — приложение продолжит работать в фоне."
echo ""
echo "Полезные команды:"
echo "  docker compose logs -f app     — логи"
echo "  docker compose restart app     — перезапустить"
echo "  docker compose down            — остановить"
echo "  docker compose up -d --build   — обновить"
