# Настройка Firebase Performance → дашборд monitor

Проект: **fuji-notifications**  
Аккаунт для OAuth (если выбран путь B): **a.imukov@fuji.ru**

Дашборд читает метрики мобильного приложения из **BigQuery** (`firebase_performance.*`), если включён экспорт Performance в Firebase Console.

---

## Путь A — service account (рекомендуется для cron)

1. [Firebase Console](https://console.firebase.google.com/project/fuji-notifications/settings/serviceaccounts/adminsdk) → **Generate new private key**.
2. На сервере:

```bash
mkdir -p /opt/monitor/secrets && chmod 700 /opt/monitor/secrets
# с вашего ПК:
scp -i ~/Downloads/ubuntu-STD3-2-2-20GB-MRGxeuAU.pem \
  *-firebase-adminsdk-*.json \
  ubuntu@83.166.238.251:/opt/monitor/secrets/firebase-sa.json
ssh ... "chmod 600 /opt/monitor/secrets/firebase-sa.json"
```

3. В `/opt/monitor/.env.local` (уже должно быть):

```env
FIREBASE_PROJECT_ID=fuji-notifications
GOOGLE_SERVICE_ACCOUNT_FILE=/opt/monitor/secrets/firebase-sa.json
BIGQUERY_LOCATION=US
```

4. [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=fuji-notifications) — для `...@...iam.gserviceaccount.com`:
   - **BigQuery Data Viewer**
   - **Firebase Viewer** (или Viewer на проект)

5. Firebase Console → **Performance** → шестерёнка → **BigQuery linking** → включить экспорт (если ещё не включён).

6. Проверка:

```bash
curl -X POST -H "x-monitor-import-secret: <PERFORMANCE_IMPORT_SECRET>" \
  "https://it.franchise-fuji.ru/api/firebase/performance/import?from=2026-06-17&to=2026-06-23&force=1"
```

В ответе `firebaseSkipped` должно быть `false`, `firebase` — массив с днями.

---

## Путь B — OAuth вашего аккаунта (a.imukov@fuji.ru)

### B1. OAuth client в Google Cloud

1. [Credentials](https://console.cloud.google.com/apis/credentials?project=fuji-notifications) → **Create credentials** → **OAuth client ID** → **Web application**.
2. **Authorized redirect URIs:**
   - `https://it.franchise-fuji.ru/api/admin/google-oauth/callback`
3. Скопируйте **Client ID** и **Client secret**.

### B2. Файл на сервере

```bash
cat > /opt/monitor/secrets/google-oauth.json <<'EOF'
{
  "clientId": "ВАШ_CLIENT_ID.apps.googleusercontent.com",
  "clientSecret": "ВАШ_CLIENT_SECRET"
}
EOF
chmod 600 /opt/monitor/secrets/google-oauth.json
```

Или в `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_TOKEN_FILE=/opt/monitor/secrets/google-oauth.json
```

### B3. Выдать refresh token (один раз, от вашего аккаунта)

1. Войти в дашборд: https://it.franchise-fuji.ru/login (admin).
2. Открыть: https://it.franchise-fuji.ru/api/admin/google-oauth/start
3. Войти как **a.imukov@fuji.ru**, разрешить доступ.
4. После редиректа на `/dashboard?firebaseOAuth=connected` на сервере появится refresh token в `google-oauth.json`.

Проверка: `GET /api/admin/google-oauth/status` (под admin-сессией) → `connected: true`.

---

## Что нужно включить в Firebase для мобильных метрик

| Настройка | Где |
|-----------|-----|
| Performance Monitoring SDK в приложении ru.fuji.app | уже должно слать данные |
| **Link to BigQuery** | Firebase → Performance → Settings |
| Dataset `firebase_performance` | появится в BigQuery после линковки |

Без BigQuery export дашборд не получит историю — только синтетические HTTP-пробы.
