# Архитектура Monitor (микросервисы)

## Принципы

1. **Один сервис — одна ответственность.** Авторизация, push-уведомления, мониторинг URL, интеграции Google/Firebase — разные сервисы.
2. **Учётные записи только в PostgreSQL** сервиса `monitor-postgres`. Не хранить пароли в Next.js, env без хеша, iron-session для пользователей.
3. **Изоляция от fuji-crm:** отдельный Docker Compose (`/opt/monitor`), своя сеть, свои порты. **Не трогать** `/opt/fuji-crm`, контейнеры `crm-*`, nginx `courier.franchise-fuji.ru`.
4. **Контракты в `packages/contracts`** — общие типы и OpenAPI-описания между сервисами.
5. **Web (Next.js)** — только UI и BFF-прокси; бизнес-логика и персистентность — в backend-сервисах.

## Текущая схема

```
                    https://it.franchise-fuji.ru
                              │
                         nginx (vhost it.*)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    /api/auth/*          /api/push/*          /* (pages)
         │                    │                    │
  auth-service:3101   push-notification:3103   web:3080
         │                    │              (Next.js BFF)
         ▼                    ▼                    │
  monitor_auth          monitor_core ◄─────────────┘
  (users)               (push_subscriptions,      internal API
                          push_alert_dedup,       /api/internal/*
                          appeals, performance)
```

Web проксирует `/api/push/*` и `/firebase-messaging-sw.js` в `push-notification-service`.  
Метрики производительности для алертов push-сервис забирает через internal API web:  
`GET /api/internal/performance/report` (с `x-monitor-import-secret`).

## Сервисы

| Сервис | Порт | БД | Назначение |
|--------|------|-----|------------|
| `web` | 3080 | — | Дашборд, SSR, BFF-прокси |
| `auth-service` | 3101 | `monitor_auth` | Логин, JWT, пользователи |
| `push-notification-service` | 3103 | `monitor_core` | FCM push, подписки, алерты |
| `monitor-api` | 3102 | `monitor_core` (позже) | Health checks, Firebase/Google агрегация |
| `monitor-postgres` | 5433→5432 | — | PostgreSQL 16, volume `monitor_pg_data` |

## push-notification-service

**Отдельный Firebase-проект pushit** — не `fuji-notifications` и не `/opt/fuji-crm`.

### Ответственность

- Web Push (FCM HTTP v1): подписки, service worker, отправка
- Алерты по медленным метрикам для всех источников мониторинга: `site`, `mobile`, `mobile_api`
- Универсальные уведомления по вкладкам дашборда через `POST /push/v1/notify`

### Вкладки дашборда (домены push)

| Домен | URL | Пример алерта |
|-------|-----|---------------|
| `dashboard` | `/dashboard` | Медленные метрики site/mobile/api |
| `appeals` | `/dashboard/appeals` | Новое обращение |
| `appeals_report` | `/dashboard/appeals-report` | Отчёт IT |
| `courier_report` | `/dashboard/courier-report` | Отчёт курьеры |

Подписка на push одна на весь PWA — service worker работает на всех вкладках.

### API (`PUSH_API_PREFIX = /push/v1`)

| Метод | Путь | Auth |
|-------|------|------|
| GET | `/health` | — |
| GET | `/push/v1/config` | — (публичный Firebase Web config) |
| GET | `/push/v1/messaging-sw.js` | — |
| POST | `/push/v1/subscribe` | service secret + `X-Monitor-User-Email` (BFF) |
| POST | `/push/v1/unsubscribe` | service secret |
| POST | `/push/v1/alerts/evaluate-performance` | service secret + report body (from web probe) |
| POST | `/push/v1/alerts/check-slow-metrics` | `PERFORMANCE_IMPORT_SECRET` (fetch report from web) |
| POST | `/push/v1/notify` | `PERFORMANCE_IMPORT_SECRET` |

Контракты: `packages/contracts` (`PushConfigResponse`, `PushNotifyRequest`, …).

### Пороги медленных метрик

| Источник | Порог |
|----------|-------|
| `site` | 1300 мс |
| `mobile` | 1100 мс |
| `mobile_api` | 1100 мс |

Dedup: таблица `push_alert_dedup`, cooldown 60 мин на ключ алерта.

### Таблицы (`monitor_core`)

- `push_subscriptions` — FCM-токены пользователей
- `push_alert_dedup` — антиспам отправок

Миграции: `services/push-notification-service/drizzle/`.

### Env (production)

На сервере в `/opt/monitor/.env` (docker) и `/opt/monitor/.env.local` (web):

```
PUSH_SERVICE_URL=http://127.0.0.1:3103
PUSH_FIREBASE_PROJECT_ID=pushit-...
PUSH_GOOGLE_SERVICE_ACCOUNT_FILE=/opt/monitor/secrets/push-firebase-sa.json
NEXT_PUBLIC_PUSH_FIREBASE_*=...
PERFORMANCE_IMPORT_SECRET=...
```

### Поток алерта «медленная метрика»

```
cron / POST /api/monitoring/probe
    → web: importSyntheticProbes() + readPerformanceHistoryReport()
    → web → push-service: POST /push/v1/alerts/evaluate-performance (report in body)
        → push-service: filter slow (site|mobile|mobile_api)
        → FCM → все push_subscriptions
```

## PostgreSQL

- **Один инстанс**, несколько баз: `monitor_auth`, `monitor_core`.
- Миграции: **только внутри сервиса-владельца** (`services/*/drizzle/`).
- Запрещено: прямые SQL из `web/` для доменных данных push/auth.

## Авторизация

- `auth-service` выдаёт JWT (`Authorization: Bearer`).
- `web` валидирует сессию и проксирует push subscribe с email пользователя.
- Service-to-service: заголовок `x-monitor-import-secret` = `PERFORMANCE_IMPORT_SECRET`.

## Деплой на VM

```bash
/opt/monitor/
  docker-compose.yml           # postgres + auth + push
  apps/web/                    # Next standalone (pm2)
  secrets/push-firebase-sa.json
```

```bash
# Infra (postgres, auth, push)
bash scripts/server-git-deploy.sh   # web
docker compose up -d --build        # push + auth
```

Nginx (целевой split):

- `/api/auth/` → `127.0.0.1:3101`
- `/api/push/` → `127.0.0.1:3103` (опционально; сейчас BFF через web:3080)
- остальное → `3080`

## Миграция с монолита

1. ✅ Инфра + `auth-service` + Postgres  
2. ✅ `push-notification-service` — FCM, подписки, алерты  
3. Nginx split `/api/auth`, `/api/push`  
4. Web вызывает auth-service вместо NextAuth credentials  
5. Вынести health/firebase в `monitor-api`  
6. Удалить дублирующий auth из `auth.ts` (NextAuth только Google OAuth BFF при необходимости)
