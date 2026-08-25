ALTER TABLE "employee_relatives" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "employee_relatives" ADD COLUMN IF NOT EXISTS "workplace" TEXT;
ALTER TABLE "employee_relatives" ADD COLUMN IF NOT EXISTS "dependent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employee_relatives" ADD COLUMN IF NOT EXISTS "is_hidden" BOOLEAN NOT NULL DEFAULT false;
