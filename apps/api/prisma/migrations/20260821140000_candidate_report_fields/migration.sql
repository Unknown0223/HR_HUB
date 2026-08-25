ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "introduced_at" DATE;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "education" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "employment_source" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "birth_date" DATE;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "languages" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "position_name" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "person_type" TEXT;

UPDATE "candidates"
SET "introduced_at" = ("created_at")::date
WHERE "introduced_at" IS NULL;
