# Инструкции для AI-агентов (Monitor / IT Franchise Fuji)

Читай этот файл **перед** любыми изменениями backend или инфраструктуры.

## Обязательно

1. **Микросервисы** — не добавляй бизнес-логику и SQL в `app/` (Next.js). Новый функционал → новый или существующий сервис в `services/`.
2. **PostgreSQL** — учётные записи, сессии, доменные данные только в БД сервиса-владельца. Миграции рядом с сервисом (`drizzle/` или `prisma/`).
3. **Не трогать fuji-crm** — не менять `/opt/fuji-crm`, docker `crm-*`, nginx `courier.franchise-fuji.ru`, порт `8001`.
4. **Изоляция Monitor** — всё наше только в `/opt/monitor`, сеть Docker `monitor-net`, порты `3080`, `3101`, `3102`, Postgres `127.0.0.1:5433`.
5. **Контракты** — общие типы API в `packages/contracts`. Меняешь API → обнови contracts и потребителей.
6. **Секреты** — не коммитить `.env`, `scripts/secrets/`. Production-конфиг **только на сервере**: `/opt/monitor/.env.local`. Деплой не копирует секреты с локальной машины. Пример переменных — `scripts/server.env.production.example`.

## Добавление нового сервиса

1. `services/<name>/` — свой `package.json`, `Dockerfile`, README.
2. Зарегистрировать в `docker-compose.yml` (profile при необходимости).
3. Порт из диапазона **31xx**, не конфликтовать с таблицей в `docs/ARCHITECTURE.md`.
4. Health: `GET /health` → `200 { "status": "ok" }`.
5. Документировать env в `services/<name>/.env.example`.
6. Nginx location — только в `scripts/nginx/it.franchise-fuji.ru.conf`, не в courier.

## Auth

- Все операции с пользователями → **`services/auth-service`**.
- Web: `fetch` к `/api/auth/...` (nginx → auth-service) или server-side с service token.
- Не дублировать таблицу `users` в других сервисах; для связи использовать `user_id` (UUID) из JWT.

## Деплой

- `npm run deploy` — только **web** (standalone + pm2).
- `npm run deploy:infra` — `docker compose` в `/opt/monitor` (postgres, auth).
- После изменений auth — `docker compose up -d --build auth-service`.

## Домен

- Production: **https://it.franchise-fuji.ru**
- `AUTH_URL` / OAuth redirect: `https://it.franchise-fuji.ru/api/auth/callback/google` (если OAuth в web).

## Правила Cursor

Дополнительно см. `.cursor/rules/*.mdc` — они имеют приоритет для соответствующих путей.
