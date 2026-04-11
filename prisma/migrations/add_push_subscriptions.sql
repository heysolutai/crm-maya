-- Tabela de inscricoes Web Push (PWA notifications).
-- Cada usuario pode ter multiplas inscricoes (uma por dispositivo/browser).

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key"
  ON "push_subscriptions" ("endpoint");

CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user"
  ON "push_subscriptions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_company"
  ON "push_subscriptions" ("company_id");
