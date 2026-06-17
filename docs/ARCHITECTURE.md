# Архитектура Monitor (микросервисы)

## Принципы

1. **Один сервис — одна ответственность.** Авторизация, мониторинг URL, интеграции Google/Firebase — разные сервисы.
2. **Учётные записи только в PostgreSQL** сервиса `monitor-postgres`. Не хранить пароли в Next.js, env без хеша, iron-session для пользователей.
3. **Изоляция от fuji-crm:** отдельный Docker Compose (`/opt/monitor`), своя сеть, свои порты. **Не трогать** `/opt/fuji-crm`, контейнеры `crm-*`, nginx `courier.franchise-fuji.ru`.
4. **Контракты в `packages/contracts`** — общие типы и OpenAPI-описания между сервисами.
5. **Web (Next.js)** — только UI и BFF-прокси; бизнес-логика и персистентность — в backend-сервисах.

## Текущая схема (целевая)

```
                    https://it.franchise-fuji.ru
                              │
                         nginx (vhost it.*)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    /api/auth/*          /api/v1/*            /* (pages)
         │                    │                    │
  auth-service:3101    monitor-api:3102      web:3080
         │                    │              (Next.js)
         ▼                    ▼
  monitor-postgres:5432   (Redis — позже)
  (только auth DB)
```

## Сервисы

| Сервис | Порт (внутри) | БД | Назначение |
|--------|---------------|-----|------------|
| `web` | 3080 | — | Дашборд, SSR, прокси к API |
| `auth-service` | 3101 | `monitor_auth` | Логин, JWT, пользователи, сессии |
| `monitor-api` | 3102 | `monitor_core` (позже) | Health checks, Firebase/Google агрегация |
| `monitor-postgres` | 5432 | — | PostgreSQL 16, volume `monitor_pg_data` |

## PostgreSQL

- **Один инстанс**, несколько баз: `monitor_auth`, `monitor_core` (создаются init-скриптом).
- Миграции: **только внутри сервиса-владельца** (`services/auth-service/drizzle/`).
- Запрещено: прямые SQL из `web/`, общие таблицы между сервисами без API.

## Авторизация

- `auth-service` выдаёт JWT (`Authorization: Bearer`).
- `web` и `monitor-api` **валидируют** токен через `GET /auth/v1/validate` или локально по shared `JWT_SECRET` (только чтение claims).
- Пароль дашборда из `.env` — **временно**; новые пользователи — только через `auth-service` + PostgreSQL.

## Деплой на VM

```bash
/opt/monitor/
  docker-compose.yml      # postgres + auth (+ позже api)
  apps/web/               # Next standalone (pm2 или container)
  secrets/
```

Nginx: `it.franchise-fuji.ru` — `/api/auth/` → `127.0.0.1:3101`, остальное → `3080`.

## Миграция с монолита

1. ✅ Инфра + `auth-service` + Postgres  
2. Nginx split `/api/auth`  
3. Web вызывает auth-service вместо NextAuth credentials  
4. Вынести health/firebase в `monitor-api`  
5. Удалить дублирующий auth из `auth.ts` (NextAuth только Google OAuth BFF при необходимости)
