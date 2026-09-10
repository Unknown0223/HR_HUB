-- Telegram employee join + telegram username on employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "telegram_username" TEXT;

CREATE TABLE IF NOT EXISTS "employee_join_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invite_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "telegram_user_id" TEXT,
  "telegram_username" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "middle_name" TEXT,
  "phone" TEXT,
  "pinfl" TEXT,
  "passport_series" TEXT,
  "passport_number" TEXT,
  "birth_date" DATE,
  "gender" TEXT,
  "photo_url" TEXT,
  "note" TEXT,
  "employee_id" UUID,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "employee_join_requests_tenant_id_status_idx"
  ON "employee_join_requests"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "employee_join_requests_tenant_id_invite_code_idx"
  ON "employee_join_requests"("tenant_id", "invite_code");
CREATE INDEX IF NOT EXISTS "employee_join_requests_telegram_user_id_idx"
  ON "employee_join_requests"("telegram_user_id");
