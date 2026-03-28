#!/bin/bash
set -e

echo "========================================="
echo "  Limited.Ink — VPS Setup"
echo "========================================="
echo ""

if ! command -v docker &> /dev/null; then
    echo "[1/4] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. You may need to re-login for group changes."
else
    echo "[1/4] Docker already installed."
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[2/4] Installing Docker Compose..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
else
    echo "[2/4] Docker Compose already installed."
fi

echo "[3/4] Checking .env file..."
if [ ! -f deploy/.env ]; then
    cp deploy/.env.example deploy/.env

    JWT_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)

    sed -i "s|your_random_jwt_secret_here|$JWT_SECRET|" deploy/.env
    sed -i "s|your_random_session_secret_here|$SESSION_SECRET|" deploy/.env
    sed -i "s|your_strong_database_password_here|$DB_PASSWORD|" deploy/.env

    echo ""
    echo "  .env file created with auto-generated secrets."
    echo "  IMPORTANT: Edit deploy/.env and add your:"
    echo "    - TELEGRAM_BOT_TOKEN"
    echo "    - OPENAI_API_KEY (optional, for AI features)"
    echo ""
else
    echo "  .env file already exists, skipping."
fi

echo "[4/4] Building and starting..."
cd deploy
docker compose --env-file .env up -d --build

echo ""
echo "========================================="
echo "  Done! App is running on port 3000"
echo "========================================="
echo ""
echo "  Open: http://YOUR_SERVER_IP:3000"
echo ""
echo "  Initialize database:"
echo "    docker compose exec app npx drizzle-kit push --config lib/db/drizzle.config.ts"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f app     # View logs"
echo "    docker compose restart app     # Restart"
echo "    docker compose down            # Stop"
echo "    docker compose up -d --build   # Rebuild & restart"
echo ""
