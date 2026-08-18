-- Личный кабинет сотрудника.
--
-- Все таблицы с префиксом cab_ намеренно: они живут в monitor_core рядом
-- с 18 существующими таблицами продукта, и должны сноситься одним запросом
-- без риска задеть обращения, курьеров или метрики.
--
-- Данные CRM здесь не дублируются. Связь только по worker_id — идентификатору
-- из чужой базы, которую мы читаем и никогда не пишем.

-- ── Пользователи и сессии ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_app_user" (
  "id" bigserial PRIMARY KEY,
  "worker_id" integer NOT NULL,
  "telegram_id" bigint NOT NULL UNIQUE,
  "linked_at" timestamptz NOT NULL DEFAULT now(),
  "linked_by" text,
  "last_seen_at" timestamptz,
  "disabled_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "cab_app_user_worker_idx" ON "cab_app_user" ("worker_id");

CREATE TABLE IF NOT EXISTS "cab_app_session" (
  "id" bigserial PRIMARY KEY,
  "app_user_id" bigint NOT NULL REFERENCES "cab_app_user"("id") ON DELETE CASCADE,
  -- Храним только хеш: утечка таблицы не должна давать доступ к аккаунтам.
  "refresh_hash" text NOT NULL UNIQUE,
  "device" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  -- Ротация: из какой сессии выросла эта. Повторное предъявление
  -- использованного refresh гасит всю цепочку.
  "rotated_from" bigint REFERENCES "cab_app_session"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "cab_app_session_active_idx"
  ON "cab_app_session" ("app_user_id") WHERE "revoked_at" IS NULL;

CREATE TABLE IF NOT EXISTS "cab_link_request" (
  "id" bigserial PRIMARY KEY,
  "telegram_id" bigint NOT NULL,
  "phone" text,
  "tg_first_name" text,
  "tg_username" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "decided_by" text,
  "decided_at" timestamptz,
  "comment" text
);

CREATE INDEX IF NOT EXISTS "cab_link_request_status_idx"
  ON "cab_link_request" ("status", "created_at" DESC);

-- ── Профиль поверх CRM ───────────────────────────────────────────────────

-- Колонки под фото в workers нет, поэтому храним у себя.
CREATE TABLE IF NOT EXISTS "cab_profile_extra" (
  "worker_id" integer PRIMARY KEY,
  "photo_key" text,
  "about" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text
);

-- ── Модель доступа ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_audience" (
  "id" bigserial PRIMARY KEY,
  "name" text NOT NULL,
  "is_everyone" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cab_audience_rule" (
  "id" bigserial PRIMARY KEY,
  "audience_id" bigint NOT NULL REFERENCES "cab_audience"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "cab_audience_rule_post" (
  "rule_id" bigint NOT NULL REFERENCES "cab_audience_rule"("id") ON DELETE CASCADE,
  "post_id" integer NOT NULL,
  PRIMARY KEY ("rule_id", "post_id")
);

CREATE TABLE IF NOT EXISTS "cab_audience_rule_department" (
  "rule_id" bigint NOT NULL REFERENCES "cab_audience_rule"("id") ON DELETE CASCADE,
  "department_id" integer NOT NULL,
  PRIMARY KEY ("rule_id", "department_id")
);

-- ── Справочники, синхронизируемые из CRM ─────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_ref_post" (
  "id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "synced_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cab_ref_department" (
  "id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "company_id" integer,
  "city" text,
  "synced_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cab_ref_company" (
  "id" integer PRIMARY KEY,
  "name" text NOT NULL,
  "synced_at" timestamptz NOT NULL DEFAULT now()
);

-- ── Администраторы кабинета ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_admin_audit" (
  "id" bigserial PRIMARY KEY,
  "admin_email" text NOT NULL,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cab_admin_audit_recent_idx"
  ON "cab_admin_audit" ("created_at" DESC);
