# Инструкции для AI-агентов (Monitor / IT Franchise Fuji)

Читай этот файл **перед** любыми изменениями backend или инфраструктуры.

## Онлайн-режим (обязательно)

- Работать **только онлайн**: SSH → `/opt/monitor/src`, деплой на сервере.
- **Не** править и не деплоить `fuji_stat` / `stat.franchise-fuji.ru` — устаревший MVP.
- **Не** собирать на ПК пользователя, если он явно не попросил.
- GitHub: аккаунт **`Tux0096`**, репозиторий **`Tux0096/monitor`**.
- Прод: **https://it.franchise-fuji.ru/dashboard/appeals**
- Деплой: `bash /opt/monitor/scripts/server-git-deploy.sh`
- MAX webhook: `bash /opt/monitor/scripts/server-max-subscribe.sh`
- Подробно: **`docs/ONLINE_WORKFLOW.md`**

## Обязательно

1. **Микросервисы** — не добавляй бизнес-логику и SQL в `app/` (Next.js). Новый функционал → новый или существующий сервис в `services/`.
2. **PostgreSQL** — учётные записи, сессии, доменные данные только в БД сервиса-владельца. Миграции рядом с сервисом (`drizzle/` или `prisma/`).
3. **Не трогать fuji-crm** — не менять `/opt/fuji-crm`, docker `crm-*`, nginx `courier.franchise-fuji.ru`, порт `8001`.
4. **Изоляция Monitor** — всё наше только в `/opt/monitor`, сеть Docker `monitor-net`, порты `3080`, `3101`, `3102`, Postgres `127.0.0.1:5433`.
5. **Контракты** — общие типы API в `packages/contracts`. Меняешь API → обнови contracts и потребителей.
6. **Секреты** — не коммитить `.env`, `scripts/secrets/`. Production-конфиг **только на сервере**: `/opt/monitor/.env.local`. Деплой не копирует секреты с локальной машины. Пример переменных — `scripts/server.env.production.example`.

## Обращения

- Экран **«Обращения»** (`/dashboard/appeals`) и **«Статистика»** показывают только
  курьерские обращения — `source = 'max'` (константа `COURIER_APPEAL_SOURCE`).
  Операторский канал (`source <> 'max'`) туда не возвращаем.
- Приём из операторских Telegram-чатов отключён: `handleTelegramSupportMessage`
  всегда возвращает `skipped`. Старая реализация сохранена рядом как
  `handleTelegramSupportMessageLegacy` — на случай возврата канала.
- Заявки операторов и менеджеров доставки вносятся вручную на экране
  **«Отчёт IT»** (`/dashboard/appeals-report`, канал `it`). Его данные и ручное
  создание не трогаем.
- Удаление обращений — **мягкое**: `support_appeals.deleted_at`. Любой новый
  запрос к `support_appeals` обязан добавлять `deleted_at IS NULL`, иначе
  удалённые обращения вернутся в отчёты и статистику.
- UI экрана разложен по `components/appeals/*`; данные и мутации — в хуке
  `useAppeals`. Новые действия добавляем туда, а не в компонент страницы.
- Цвета, оси и пустые состояния графиков — только из
  `app/dashboard/statistics/chart-theme.tsx`. Категориальных цветов ровно
  восемь, девятая категория сворачивается в «Прочее» (`foldCategorical`),
  а не получает новый цвет.

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

- **Основной путь — GitHub Actions.** Push в `main` запускает
  `.github/workflows/deploy-prod.yml`: он заходит по SSH и выполняет
  `scripts/server-git-deploy.sh`. Можно запустить вручную кнопкой
  Run workflow. Секреты репозитория: `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, необязательно `DEPLOY_PORT`.
- Вручную на сервере: `bash /opt/monitor/scripts/server-git-deploy.sh`.
- `npm run deploy` — только **web** (standalone + pm2).
- `npm run deploy:infra` — `docker compose` в `/opt/monitor` (postgres, auth).
- После изменений auth — `docker compose up -d --build auth-service`.

## Домен

- Production: **https://it.franchise-fuji.ru**
- `AUTH_URL` / OAuth redirect: `https://it.franchise-fuji.ru/api/auth/callback/google` (если OAuth в web).

## Правила Cursor

Дополнительно см. `.cursor/rules/*.mdc` — они имеют приоритет для соответствующих путей.

## Frontend references

Использовать только при создании новой страницы, когда я говорю, что
что-то выглядит плохо, или когда я называю один из этих сайтов.
Для небольших изменений — просто выполнять задачу.

- **Стиль.** Подобрать DESIGN.md, подходящий продукту, на styles.refero.design
  или в VoltAgent/awesome-design-md на GitHub. Положить в корень проекта и
  добавить @-импорт в CLAUDE.md проекта — дальше следовать его цветам,
  типографике и отступам.
- **Компоненты.** Сначала 21st.dev, вызывать его MCP напрямую, если установлен.
  Там платный лимит: перед вызовом сказать, что именно ищу. Затем
  component.gallery — посмотреть, как тот же компонент решён в зрелых
  дизайн-системах.
- **Анимации.** Брать готовый промпт или React-код с kinetics.colorion.co.
- **Демо-видео.** Референсные ролики выбираются вручную на whatships.com.
  Разложить кадры ролика в одно изображение, чтобы увидеть темп и переходы,
  затем собрать видео через HyperFrames — hyperframes.dev.
- **Если после всего что-то всё ещё выглядит не так** — прогнать результат
  через polish и distill из Impeccable (impeccable.style).

### Правила

1. Существующая дизайн-система и компоненты проекта всегда имеют приоритет.
   Внешние референсы — только там, где решение ещё не принято.
2. Если нужный MCP, навык или CLI не установлен — спросить, ставить ли его,
   и не имитировать его самостоятельно.
3. Если не удаётся прочитать реальное содержимое страницы — остановиться и
   попросить вставить его вручную. Ничего не подставлять по памяти.
4. Каждый раз при использовании внешнего референса — назвать, какой именно
   и что было изменено.
5. Показать, что именно собираешься добавить, и ничего не записывать до
   подтверждения.
