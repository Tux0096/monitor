# push-notification-service

Web Push (FCM) для Monitor — отдельный Firebase-проект **pushit**, не `fuji-notifications`.

## Ответственность

- FCM-подписки пользователей дашборда
- Service Worker (`/push/v1/messaging-sw.js`)
- Алерты по медленным метрикам (site / mobile / mobile_api)
- Универсальные push по вкладкам дашборда (`POST /push/v1/notify`)

## API

| Метод | Путь | Auth |
|-------|------|------|
| GET | `/health` | — |
| GET | `/push/v1/config` | — |
| GET | `/push/v1/messaging-sw.js` | — |
| POST | `/push/v1/subscribe` | service secret + user email (BFF) |
| POST | `/push/v1/unsubscribe` | service secret |
| POST | `/push/v1/alerts/evaluate-performance` | service secret + report JSON (основной путь из probe) |
| POST | `/push/v1/alerts/check-slow-metrics` | service secret (сам забирает report из web) |
| POST | `/push/v1/notify` | service secret |

Префикс контрактов: `PUSH_API_PREFIX` в `@monitor/contracts`.

## БД

PostgreSQL `monitor_core`: таблицы `push_subscriptions`, `push_alert_dedup`.

## Запуск

```bash
cd services/push-notification-service
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Docker: порт **3103**, см. корневой `docker-compose.yml`.

## Env

См. `.env.example`. Секреты service account — только на сервере `/opt/monitor/secrets/`.
