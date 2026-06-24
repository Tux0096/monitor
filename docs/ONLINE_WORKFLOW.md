# Онлайн-работа агента и деплой (Monitor)

Документ для AI-агента и оператора. **Всегда работать онлайн** — правки в репозитории на сервере, без локальной сборки на ПК.

## Целевой проект (не путать!)

| Параметр | Значение |
|---|---|
| Репозиторий | https://github.com/Tux0096/monitor |
| GitHub-аккаунт | `Tux0096` |
| Исходники | `/opt/monitor/src` |
| Рантайм | `/opt/monitor` |
| Домен | https://it.franchise-fuji.ru |
| Обращения | https://it.franchise-fuji.ru/dashboard/appeals |
| SSH | `ubuntu@83.166.238.251` |
| Ключ | `ubuntu-STD3-2-2-20GB-MRGxeuAU.pem` (обычно в `~/Downloads`) |
| PM2 | `monitor`, `max-poller` |
| Порт web | `3080` (`MONITOR_PORT` в `/opt/monitor/.env.local`) |
| Postgres | `monitor_core` → `support_appeals`, `support_messages` |

**Устарело (не использовать):** `fuji_stat`, `Tux96/stat`, `stat.franchise-fuji.ru`, `/opt/fuji-stat`.

## Рабочий процесс агента

1. `gh auth switch -u Tux0096`
2. SSH на сервер: `cd /opt/monitor/src`
3. `git fetch origin main && git status`
4. Правки файлов **на сервере** (vim/sed/скрипт через SSH)
5. `npm run lint` и `npm run build` **на сервере** в `/opt/monitor/src`
6. Коммит и push с сервера (или pull после push с другой машины)
7. Деплой → проверка appeals + MAX

Секреты только в `/opt/monitor/.env.local`. Не коммитить, не выводить в чат.

## Деплой на прод (основной)

Сборка на сервере из git:

```bash
cd /opt/monitor
bash scripts/server-git-deploy.sh
```

Что делает скрипт:

1. `git fetch` + `git reset --hard origin/main` в `/opt/monitor/src`
2. `npm ci` + `npm run build`
3. Копирует `.next/standalone` → `/opt/monitor/.next/standalone`
4. Копирует `.env.local` в standalone
5. `pm2 restart monitor` через `start-monitor.sh`
6. Обновляет cron (`server-install-cron.sh`)

Принудительный деплой без новых коммитов:

```bash
FORCE=1 bash /opt/monitor/scripts/server-git-deploy.sh
```

Проверка после деплоя:

```bash
pm2 list
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080
curl -s -o /dev/null -w "%{http_code}\n" https://it.franchise-fuji.ru/dashboard/appeals
```

## MAX webhook

Подписка (после смены URL/секрета или если subscriptions пустой):

```bash
cd /opt/monitor
bash scripts/server-max-subscribe.sh
bash scripts/server-list-subscriptions.sh
```

Webhook: `https://it.franchise-fuji.ru/api/max/webhook`

Диагностика:

```bash
bash scripts/server-debug-appeals.sh
bash scripts/server-diagnose-max.sh
tail -50 /opt/monitor/max-webhook.log
tail -50 /opt/monitor/max-poller.log
```

## Коммит с сервера

```bash
cd /opt/monitor/src
git add -A
git commit -m "описание изменения"
git push origin main
bash /opt/monitor/scripts/server-git-deploy.sh
```

## Запасной деплой (только по явной просьбе)

`scripts/deploy.ps1` — локальная сборка на Windows + `scp` bundle на сервер. **Не использовать по умолчанию.**

## Инфраструктура (при изменении auth/БД)

```bash
cd /opt/monitor
npm run deploy:infra   # docker compose: postgres, auth-service
```
