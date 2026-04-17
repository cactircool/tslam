#!/usr/bin/env bash
set -e

echo "=== Local SvelteKit Setup (with Nginx) ==="

APP_DIR=$(pwd)
SERVICE_NAME="tslam"

# --- ENV ---
if [ -f .env ]; then
  echo "Using existing .env"
  source .env
else
  echo "Creating new .env"

  DB_USERNAME="root"
  DB_PASSWORD="mysecretpassword"
  BETTER_AUTH_SECRET=$(openssl rand -base64 32)

  DATABASE_URL="postgres://${DB_USERNAME}:${DB_PASSWORD}@localhost:5432/local"
  ORIGIN="http://localhost"

  cat > .env <<EOF
DATABASE_URL="${DATABASE_URL}"
ORIGIN="${ORIGIN}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
SNAPSHOT_DIR=/etc/tslam/archives
EOF
fi

# --- DEPS ---
sudo apt update
sudo apt install -y curl git docker.io docker-compose build-essential nginx openssl

sudo systemctl enable docker || true
sudo systemctl start docker

sudo systemctl enable nginx || true
sudo systemctl start nginx

# --- NODE ---
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# --- APP ---
npm install

export POSTGRES_PASSWORD=$(echo "$DATABASE_URL" | sed -E 's/.*:(.*)@.*/\1/')
sudo docker compose up -d

npx drizzle-kit push || true
npm run build

ENTRY="$APP_DIR/build/index.js"
[ -f "$ENTRY" ] || { echo "Missing build/index.js"; exit 1; }

# --- SYSTEMD ---
if [ ! -f /etc/systemd/system/$SERVICE_NAME.service ]; then
  sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=SvelteKit App
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
fi

sudo systemctl restart $SERVICE_NAME

# --- NGINX (LOCAL SAFE CONFIG) ---
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

if [ ! -f "$NGINX_CONF" ]; then
  sudo tee $NGINX_CONF > /dev/null <<EOF
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

  sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
fi

sudo nginx -t
sudo systemctl restart nginx

echo "=== Done ==="
echo "🌐 http://localhost"
