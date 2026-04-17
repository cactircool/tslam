#!/usr/bin/env bash
set -e

echo "=== Production Setup (HTTPS enabled) ==="

read -p "Domain: " DOMAIN
read -p "Email: " EMAIL

SERVICE_NAME="tslam"
SCRIPT_DIR=$(dirname "$0")

# --- Ensure base setup exists ---
bash ./$SCRIPT_DIR/local-setup.sh

# --- Update ORIGIN ---
if grep -q "^ORIGIN=" .env; then
  sed -i "s|^ORIGIN=.*|ORIGIN=\"https://$DOMAIN\"|" .env
else
  echo "ORIGIN=\"https://$DOMAIN\"" >> .env
fi

sudo systemctl restart $SERVICE_NAME

# --- Install Certbot ---
sudo apt install -y certbot python3-certbot-nginx

NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

# --- Upgrade nginx config to domain (safe overwrite) ---
sudo tee $NGINX_CONF > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo nginx -t
sudo systemctl restart nginx

# --- SSL ---
if ! sudo certbot certificates | grep -q "$DOMAIN"; then
  sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
else
  echo "Certificate already exists"
fi

echo "=== Done ==="
echo "🌍 https://$DOMAIN"
