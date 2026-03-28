# Limited.Ink — Развёртывание на VPS

## Требования
- VPS с Ubuntu 22.04+ (минимум 1 GB RAM, 10 GB диск)
- Доступ по SSH

## Быстрая установка

### 1. Скопируйте проект на сервер

```bash
# На вашем ПК — архивируйте и загрузите
git archive --format=tar.gz HEAD > limitedink.tar.gz
scp limitedink.tar.gz user@YOUR_SERVER_IP:~/

# На сервере
ssh user@YOUR_SERVER_IP
mkdir -p ~/limitedink && cd ~/limitedink
tar -xzf ~/limitedink.tar.gz
```

Или клонируйте через Git если репозиторий подключён:
```bash
git clone YOUR_REPO_URL ~/limitedink
cd ~/limitedink
```

### 2. Запустите установку

```bash
cd ~/limitedink
chmod +x deploy/setup.sh
./deploy/setup.sh
```

Скрипт автоматически:
- Установит Docker и Docker Compose (если нет)
- Создаст `.env` с автосгенерированными секретами
- Соберёт и запустит приложение

### 3. Настройте секреты

Отредактируйте `deploy/.env`:
```bash
nano deploy/.env
```

Обязательно укажите:
- `TELEGRAM_BOT_TOKEN` — токен вашего Telegram бота
- `OPENAI_API_KEY` — ключ OpenAI (если нужны AI-фичи)

После изменений перезапустите:
```bash
cd deploy && docker compose --env-file .env up -d
```

### 4. Инициализируйте базу данных

```bash
cd deploy
docker compose exec app npx drizzle-kit push --config lib/db/drizzle.config.ts
```

### 5. Проверьте

Откройте `http://YOUR_SERVER_IP:3000` в браузере.

---

## Настройка домена (опционально)

### Nginx + SSL (Let's Encrypt)

```bash
sudo apt install nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/limitedink << 'EOF'
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/limitedink /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Замените `your-domain.com` на ваш домен. DNS должен указывать на IP сервера.

---

## Полезные команды

```bash
cd ~/limitedink/deploy

# Логи приложения
docker compose logs -f app

# Логи базы данных
docker compose logs -f db

# Перезапуск
docker compose restart app

# Остановка
docker compose down

# Пересборка после обновления кода
docker compose up -d --build

# Бэкап базы данных
docker compose exec db pg_dump -U limitedink limitedink > backup_$(date +%Y%m%d).sql

# Восстановление из бэкапа
cat backup_20260328.sql | docker compose exec -T db psql -U limitedink limitedink
```

## Обновление

```bash
cd ~/limitedink
git pull  # или загрузите новый архив
cd deploy
docker compose up -d --build
```

## Структура

```
deploy/
  Dockerfile          — образ приложения (Node.js 20 + ffmpeg)
  docker-compose.yml  — приложение + PostgreSQL
  .env.example        — шаблон переменных окружения
  .env                — ваши секреты (не коммитить!)
  setup.sh            — скрипт автоустановки
```
