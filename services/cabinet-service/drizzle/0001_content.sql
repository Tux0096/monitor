-- Контент кабинета: новости, база знаний, бонусы.
-- Всё с префиксом cab_, сносится вместе с остальным кабинетом.

-- ── Новости ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_news" (
  "id" bigserial PRIMARY KEY,
  "title" text NOT NULL,
  "lead" text,
  "body_md" text NOT NULL DEFAULT '',
  "cover_key" text,
  "audience_id" bigint REFERENCES "cab_audience"("id") ON DELETE SET NULL,
  "is_published" boolean NOT NULL DEFAULT false,
  "publish_at" timestamptz,
  "push_sent_at" timestamptz,
  "created_by" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cab_news_feed_idx"
  ON "cab_news" ("publish_at" DESC) WHERE "is_published";

CREATE TABLE IF NOT EXISTS "cab_news_read" (
  "news_id" bigint NOT NULL REFERENCES "cab_news"("id") ON DELETE CASCADE,
  "worker_id" integer NOT NULL,
  "read_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("news_id", "worker_id")
);

-- ── База знаний ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_kb_section" (
  "id" bigserial PRIMARY KEY,
  "parent_id" bigint REFERENCES "cab_kb_section"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "sort" integer NOT NULL DEFAULT 0,
  "audience_id" bigint REFERENCES "cab_audience"("id") ON DELETE SET NULL,
  "is_published" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cab_kb_article" (
  "id" bigserial PRIMARY KEY,
  "section_id" bigint REFERENCES "cab_kb_section"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "body_md" text NOT NULL DEFAULT '',
  "cover_key" text,
  "audience_id" bigint REFERENCES "cab_audience"("id") ON DELETE SET NULL,
  "is_published" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cab_kb_article_section_idx"
  ON "cab_kb_article" ("section_id", "is_published");

-- Поиск по заголовку и телу. Русская конфигурация: без неё
-- «доставка» и «доставки» не совпадут.
CREATE INDEX IF NOT EXISTS "cab_kb_article_search_idx"
  ON "cab_kb_article"
  USING gin (to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(body_md, '')));

CREATE TABLE IF NOT EXISTS "cab_kb_attachment" (
  "id" bigserial PRIMARY KEY,
  "article_id" bigint NOT NULL REFERENCES "cab_kb_article"("id") ON DELETE CASCADE,
  "file_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime" text,
  "size" integer,
  "sort" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "cab_kb_view" (
  "article_id" bigint NOT NULL REFERENCES "cab_kb_article"("id") ON DELETE CASCADE,
  "worker_id" integer NOT NULL,
  "viewed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("article_id", "worker_id")
);

-- ── Бонусы ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cab_benefit" (
  "id" bigserial PRIMARY KEY,
  "title" text NOT NULL,
  "description_md" text NOT NULL DEFAULT '',
  "image_key" text,
  -- shared — общая привилегия с одним кодом на всех
  -- personal — персональный код из пула, один на сотрудника
  "kind" text NOT NULL DEFAULT 'shared',
  "audience_id" bigint REFERENCES "cab_audience"("id") ON DELETE SET NULL,
  "valid_from" timestamptz,
  "valid_to" timestamptz,
  "is_published" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cab_benefit_shared" (
  "benefit_id" bigint PRIMARY KEY REFERENCES "cab_benefit"("id") ON DELETE CASCADE,
  "code" text,
  "terms_md" text
);

CREATE TABLE IF NOT EXISTS "cab_benefit_code" (
  "id" bigserial PRIMARY KEY,
  "benefit_id" bigint NOT NULL REFERENCES "cab_benefit"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "issued_to_worker_id" integer,
  "issued_at" timestamptz,
  "redeemed_at" timestamptz,
  "state" text NOT NULL DEFAULT 'free',
  CONSTRAINT "cab_benefit_code_unique" UNIQUE ("benefit_id", "code")
);

-- Частичный индекс по свободным кодам: выборка следующего свободного
-- под FOR UPDATE SKIP LOCKED идёт по нему, а не по всей таблице.
CREATE INDEX IF NOT EXISTS "cab_benefit_code_free_idx"
  ON "cab_benefit_code" ("benefit_id", "id") WHERE "issued_to_worker_id" IS NULL;

-- Гарантия «один сотрудник — один код»: обеспечивается уникальностью,
-- а не проверкой в коде. Двойной клик упрётся в ограничение базы.
CREATE TABLE IF NOT EXISTS "cab_benefit_issue" (
  "id" bigserial PRIMARY KEY,
  "benefit_id" bigint NOT NULL REFERENCES "cab_benefit"("id") ON DELETE CASCADE,
  "worker_id" integer NOT NULL,
  "code_id" bigint REFERENCES "cab_benefit_code"("id") ON DELETE SET NULL,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cab_benefit_issue_unique" UNIQUE ("benefit_id", "worker_id")
);
