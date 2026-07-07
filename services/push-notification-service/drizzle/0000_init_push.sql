CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_email" text NOT NULL,
  "fcm_token" text NOT NULL,
  "user_agent" text,
  "platform" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "push_subscriptions_fcm_token_unique" UNIQUE("fcm_token")
);

CREATE TABLE IF NOT EXISTS "push_alert_dedup" (
  "alert_key" text PRIMARY KEY NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
