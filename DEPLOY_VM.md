# Deploy на Ubuntu VM

Ниже минимальный сценарий публикации на вашей виртуальной машине из панели (как на скриншоте).

## 1) Подготовка VM в панели

1. Назначьте **внешний IP** (у вас сейчас не назначен).
2. В группе безопасности откройте входящие порты:
   - `22/tcp` (SSH)
   - `80/tcp` (HTTP)
   - `443/tcp` (HTTPS, если будете ставить домен и TLS)

## 2) Подключение по SSH

```bash
chmod 600 ~/path/to/your-key.pem
ssh -i ~/path/to/your-key.pem ubuntu@<EXTERNAL_IP>
```

## 3) Установка Node.js 20 + git + pm2

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
node -v
npm -v
```

## 4) Клонирование проекта

```bash
cd /opt
sudo git clone https://github.com/Tux0096/monitor.git
sudo chown -R ubuntu:ubuntu /opt/monitor
cd /opt/monitor
```

## 5) Настройка переменных окружения

```bash
cp .env.example .env.local
nano .env.local
```

Обязательные поля:
- `AUTH_SECRET`
- `AUTH_PASSWORD`
- `FIREBASE_PROJECT_ID`

Для входа через Google OAuth:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Важно: в Google Cloud Console добавьте Redirect URI:
- `http://<EXTERNAL_IP>/api/auth/callback/google`
- если есть домен и HTTPS: `https://<DOMAIN>/api/auth/callback/google`

## 6) Сборка и запуск

```bash
npm ci
npm run build
pm2 start npm --name monitor -- start
pm2 save
pm2 startup
```

Проверка:

```bash
pm2 status
curl -I http://127.0.0.1:3000
```

После этого приложение доступно по:
- `http://<EXTERNAL_IP>:3000`

## 7) Рекомендуется: прокси через Nginx на 80/443

Чтобы открывать без `:3000`, поставьте Nginx:

```bash
sudo apt install -y nginx
sudo tee /etc/nginx/sites-available/monitor >/dev/null <<'EOF'
server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
sudo ln -sf /etc/nginx/sites-available/monitor /etc/nginx/sites-enabled/monitor
sudo nginx -t
sudo systemctl restart nginx
```

Теперь доступ:
- `http://<EXTERNAL_IP>`

## 8) Обновление проекта

```bash
cd /opt/monitor
git pull
npm ci
npm run build
pm2 restart monitor
```
