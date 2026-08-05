CREATE TABLE IF NOT EXISTS "rum_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "metric" text NOT NULL,
  "value" double precision NOT NULL,
  "rating" text,
  "path_group" text NOT NULL,
  "platform" text NOT NULL,
  "source" text NOT NULL,
  "connection" text,
  "app_version" text
);

CREATE INDEX IF NOT EXISTS "rum_events_recent_idx"
  ON "rum_events" ("received_at", "metric");

CREATE TABLE IF NOT EXISTS "rum_rollup_hourly" (
  "hour" timestamptz NOT NULL,
  "metric" text NOT NULL,
  "path_group" text NOT NULL,
  "platform" text NOT NULL,
  "source" text NOT NULL,
  "p50" double precision,
  "p75" double precision,
  "p95" double precision,
  "samples" integer NOT NULL,
  CONSTRAINT "rum_rollup_hourly_pk"
    PRIMARY KEY ("hour", "metric", "path_group", "platform", "source")
);

CREATE INDEX IF NOT EXISTS "rum_rollup_hourly_hour_idx"
  ON "rum_rollup_hourly" ("hour" DESC, "metric");
