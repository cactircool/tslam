#!/usr/bin/env bash

set -e

echo "=== SvelteKit Production Setup ==="

read -p "Enter your domain (e.g. example.com): " DOMAIN
read -p "Enter your email (for Let's Encrypt): " EMAIL

APP_DIR=$(pwd)
SERVICE_NAME="tslam"

echo "=== Generating secrets ==="

DB_USERNAME="root"
DB_PASSWORD="mysecretpassword"
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

DATABASE_URL="postgres://${DB_USERNAME}:${DB_PASSWORD}@localhost:5432/local"
ORIGIN="https://${DOMAIN}"

echo "=== Writing .env ==="

cat > .env <<EOF
# Drizzle
DATABASE_URL="${DATABASE_URL}"

ORIGIN="${ORIGIN}"

# Better Auth
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}"

# GitHub OAuth
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

SNAPSHOT_DIR=/etc/tsalm/archives
EOF

echo "=== Updating system ==="
sudo apt update && sudo apt upgrade -y

echo "=== Installing dependencies ==="
sudo apt install -y \
  curl \
  git \
  nginx \
  docker.io \
  docker-compose \
  build-essential \
  ufw \
  openssl

echo "=== Enabling Docker ==="
sudo systemctl enable docker
sudo systemctl start docker

echo "=== Installing Node.js (LTS) ==="
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

echo "Node version:"
node -v

echo "=== Installing npm dependencies ==="
npm install

echo "=== Starting Docker (Postgres) ==="
export POSTGRES_PASSWORD=$DB_PASSWORD
sudo docker compose up -d

echo "=== Running Drizzle migrations (if configured) ==="
npx drizzle-kit push || true

echo "=== Building SvelteKit app ==="
npm run build

ENTRY="$APP_DIR/build/index.js"

if [ ! -f "$ENTRY" ]; then
  echo "❌ build/index.js not found."
  echo "👉 Make sure you're using @sveltejs/adapter-node"
  exit 1
fi

echo "=== Creating systemd service (root) ==="

sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Tslam
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $ENTRY
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

echo "=== Configuring Nginx ==="

sudo tee /etc/nginx/sites-available/$SERVICE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

echo "=== Installing Certbot ==="
sudo apt install -y certbot python3-certbot-nginx

echo "=== Obtaining SSL certificate ==="
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

echo "=== Configuring firewall ==="
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo "=== Setup complete ==="
echo "🌍 Your app should be live at: https://$DOMAIN"
