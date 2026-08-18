# Точка отката перед работой над личным кабинетом

Снято **18 августа 2026, 19:50 UTC**, метка `20260818-195025`.

## Что сохранено

Всё в `/opt/monitor/backups/` на сервере:

| Файл | Что это |
|---|---|
| `monitor_core-20260818-195025.dump` | 209 КБ, формат custom, 18 таблиц с данными |
| `monitor_auth-20260818-195025.dump` | 4.7 КБ, учётные записи |
| `.env.local-20260818-195025` | конфиг web |
| `.env-20260818-195025` | конфиг docker |
| `docker-compose-20260818-195025.yml` | состав контейнеров |
| `nginx-20260818-195025.conf` | vhost it.franchise-fuji.ru |
| `crontab-20260818-195025.txt` | расписание задач |

Целостность дампа проверена через `pg_restore -l`.

## Состояние на момент снимка

- Коммит: **`4c5e1bb`** (`fix(rum): явное приведение типов в запросах отчёта`)
- Контейнеры: `monitor-postgres`, `monitor-auth-service`, `monitor-push-service`, `monitor-rum-collector`
- pm2: `monitor`, `max-poller`, `telegram-poller`
- Таблицы `monitor_core`: 18

## Откат

### Только код

Авто-деплой раскатывает `origin/main` каждые 2 минуты, поэтому откат кода —
это откат ветки:

```bash
cd "C:\Users\Алексей\OneDrive\Рабочий стол\monitor"
git revert --no-commit <плохой_коммит>..HEAD && git commit -m "revert: откат кабинета"
git push origin main
```

Через 2 минуты прод вернётся. Ждать деплой не обязательно — можно ускорить:

```bash
ssh -i ~/Downloads/ubuntu-*.pem ubuntu@83.166.238.251 \
  "FORCE=1 bash /opt/monitor/scripts/server-git-deploy.sh"
```

### База целиком

Нужен, только если миграции испортили существующие таблицы.
**Останавливает прод на время восстановления.**

```bash
ssh -i ~/Downloads/ubuntu-*.pem ubuntu@83.166.238.251
cd /opt/monitor
pm2 stop monitor telegram-poller max-poller
docker compose stop push-notification-service rum-collector

docker exec -i monitor-postgres pg_restore -U monitor -d monitor_core \
  --clean --if-exists < backups/monitor_core-20260818-195025.dump

pm2 start monitor telegram-poller max-poller
docker compose start push-notification-service rum-collector
```

### Только таблицы кабинета

Обычный случай: код кабинета убрали, надо убрать и его таблицы.
Существующих данных **не касается** — все таблицы кабинета с префиксом `cab_`.

```sql
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname='public' AND tablename LIKE 'cab\_%'
  LOOP EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', t);
  END LOOP;
END $$;
```

### Конфиги

```bash
cd /opt/monitor/backups
cp .env.local-20260818-195025 /opt/monitor/.env.local
cp .env-20260818-195025 /opt/monitor/.env
cp docker-compose-20260818-195025.yml /opt/monitor/docker-compose.yml
sudo cp nginx-20260818-195025.conf /etc/nginx/sites-available/it.franchise-fuji.ru
sudo nginx -t && sudo systemctl reload nginx
crontab crontab-20260818-195025.txt
```

## Что защищает от поломки по построению

- Все таблицы кабинета — с префиксом `cab_`, пересечений с существующими 18 нет
- Кабинет читает CRM (`fuji_new`) только на `SELECT`, как и текущий синк
- Обработчик Telegram-вебхука не меняется: обращения поддержки создаются как раньше
- Кабинет живёт отдельным контейнером — падение не задевает web и pm2
- Вкладка в дашборде добавляется, существующие не трогаются

## Проверка, что ничего не сломалось

```bash
curl -s -o /dev/null -w "%{http_code}\n" -L https://it.franchise-fuji.ru/dashboard/appeals   # 200
ssh ... "pm2 list | grep -E 'monitor |telegram-poller|max-poller'"                           # online
ssh ... "docker exec monitor-postgres psql -U monitor -d monitor_core -tAc \
         \"SELECT count(*) FROM support_appeals;\""                                          # не уменьшилось
```

Обращений на момент снимка: **235**.
