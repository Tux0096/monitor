# Ключ Firebase (service account) для дашборда

Дашборд ходит в **конкретный проект Firebase** (`FIREBASE_PROJECT_ID`, по умолчанию `fuji-notifications`) через **сервисный аккаунт** — без входа вашего Google-аккаунта в браузере.

## 1. Получить JSON-ключ в Firebase Console

1. Откройте [Firebase Console](https://console.firebase.google.com/).
2. Выберите проект **fuji-notifications** (или нужный вам).
3. **Project settings** (шестерёнка) → вкладка **Service accounts**.
4. **Generate new private key** → подтвердите → скачается файл `*-firebase-adminsdk-*.json`.

## 2. Положить ключ на сервере (не в git)

```bash
# на VM
sudo mkdir -p /opt/monitor/secrets
sudo chmod 700 /opt/monitor/secrets
# скопируйте JSON вручную, например через scp с вашей машины один раз:
# scp -i vm_deploy_key.pem *-firebase-adminsdk-*.json ubuntu@83.166.238.251:/opt/monitor/secrets/firebase-sa.json
sudo chmod 600 /opt/monitor/secrets/firebase-sa.json
```

## 3. Переменные на сервере

В `/opt/monitor/.env.local` (только на VM, не в репозитории):

```env
FIREBASE_PROJECT_ID=fuji-notifications
GOOGLE_SERVICE_ACCOUNT_FILE=/opt/monitor/secrets/firebase-sa.json
```

Деплой **не перезаписывает** `.env.local` и **не копирует** секреты с локальной машины.

## 4. Деплой

```powershell
cd monitor-dashboard
npm run deploy
```

Дашборд: **https://it.franchise-fuji.ru** (nginx → порт 3080; courier на 80/443 не трогали).

## 5. Проверка

1. Войти паролем дашборда.
2. Открыть `/dashboard` — блок Firebase должен показать приложения и `authSource: service_account`.

Если ошибка 403/permission — в [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam) для e-mail сервисного аккаунта (`...@...iam.gserviceaccount.com`) добавьте роли:
- **Firebase Viewer** или **Firebase Admin**
- при необходимости **Viewer** на проект

## Альтернатива: OAuth пользователя

Можно вместо ключа настроить `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` и вход «Войти через Google» — тогда токен берётся из сессии (`authSource: user_oauth`).
