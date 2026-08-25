-- CreateEnum
CREATE TYPE "HrChangeKind" AS ENUM ('open_position', 'hire', 'transfer', 'transfer_batch', 'dismiss');

-- DropForeignKey
ALTER TABLE "persons" DROP CONSTRAINT IF EXISTS "persons_region_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "persons_tenant_id_code_key";
DROP INDEX IF EXISTS "persons_tenant_id_pinfl_idx";

-- AlterTable attendance_days (hours / correction)
ALTER TABLE "attendance_days"
  ADD COLUMN IF NOT EXISTS "planned_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "on_time_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "outside_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "worked_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "overtime_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "before_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "after_hours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "correction_id" UUID;

-- AlterTable absence_types
ALTER TABLE "absence_types"
  ADD COLUMN IF NOT EXISTS "accrual_name" TEXT,
  ADD COLUMN IF NOT EXISTS "calc_kind" TEXT NOT NULL DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "time_type_id" UUID;

-- AlterTable gph_contracts status -> DocumentLifecycle
ALTER TABLE "gph_contracts" DROP COLUMN IF EXISTS "status";
ALTER TABLE "gph_contracts" ADD COLUMN "status" "DocumentLifecycle" NOT NULL DEFAULT 'draft';
ALTER TABLE "gph_contracts" ALTER COLUMN "posted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable persons (align with current Person model)
ALTER TABLE "persons"
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "inn",
  DROP COLUMN IF EXISTS "inps",
  DROP COLUMN IF EXISTS "is_active",
  DROP COLUMN IF EXISTS "is_key_person",
  DROP COLUMN IF EXISTS "region_id";

-- CreateTable hr_change_requests
CREATE TABLE IF NOT EXISTS "hr_change_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "HrChangeKind" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'draft',
    "number" TEXT,
    "request_date" DATE NOT NULL,
    "title" TEXT,
    "division_id" UUID,
    "position_id" UUID,
    "staff_position_id" UUID,
    "employee_id" UUID,
    "effective_date" DATE,
    "quantity" INTEGER,
    "employment_type" TEXT,
    "dismissal_reason_id" UUID,
    "note" TEXT,
    "candidate_gender" TEXT,
    "candidate_first_name" TEXT,
    "candidate_last_name" TEXT,
    "candidate_middle_name" TEXT,
    "created_by_user_id" UUID,
    "created_by_label" TEXT,
    "reviewed_by" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hr_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hr_change_request_lines" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "employee_id" UUID NOT NULL,
    "effective_date" DATE,
    "staff_position_id" UUID,
    "division_id" UUID,
    "position_id" UUID,
    "employment_type" TEXT,
    "note" TEXT,
    CONSTRAINT "hr_change_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "timesheet_corrections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" "DocumentLifecycle" NOT NULL DEFAULT 'draft',
    "document_date" DATE NOT NULL,
    "number" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Корректировка табеля',
    "division_id" UUID,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "meta" JSONB,
    "posted_at" TIMESTAMP(3),
    "posted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timesheet_corrections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "timesheet_correction_lines" (
    "id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "planned_hours" DECIMAL(8,2),
    "on_time_hours" DECIMAL(8,2),
    "outside_hours" DECIMAL(8,2),
    "worked_hours" DECIMAL(8,2),
    "overtime_hours" DECIMAL(8,2),
    "before_hours" DECIMAL(8,2),
    "after_hours" DECIMAL(8,2),
    "note" TEXT,
    CONSTRAINT "timesheet_correction_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hr_change_requests_tenant_id_status_idx" ON "hr_change_requests"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "hr_change_requests_tenant_id_kind_idx" ON "hr_change_requests"("tenant_id", "kind");
CREATE INDEX IF NOT EXISTS "hr_change_requests_tenant_id_request_date_idx" ON "hr_change_requests"("tenant_id", "request_date");
CREATE INDEX IF NOT EXISTS "hr_change_request_lines_request_id_idx" ON "hr_change_request_lines"("request_id");
CREATE INDEX IF NOT EXISTS "hr_change_request_lines_employee_id_idx" ON "hr_change_request_lines"("employee_id");
CREATE INDEX IF NOT EXISTS "timesheet_corrections_tenant_id_status_idx" ON "timesheet_corrections"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "timesheet_corrections_tenant_id_document_date_idx" ON "timesheet_corrections"("tenant_id", "document_date");
CREATE INDEX IF NOT EXISTS "timesheet_correction_lines_correction_id_idx" ON "timesheet_correction_lines"("correction_id");
CREATE INDEX IF NOT EXISTS "timesheet_correction_lines_employee_id_idx" ON "timesheet_correction_lines"("employee_id");
CREATE INDEX IF NOT EXISTS "absence_types_tenant_id_idx" ON "absence_types"("tenant_id");
CREATE INDEX IF NOT EXISTS "absence_types_time_type_id_idx" ON "absence_types"("time_type_id");
CREATE INDEX IF NOT EXISTS "gph_contracts_tenant_id_status_idx" ON "gph_contracts"("tenant_id", "status");

DO $$ BEGIN
  ALTER TABLE "divisions" ADD CONSTRAINT "divisions_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_time_type_id_fkey" FOREIGN KEY ("time_type_id") REFERENCES "time_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_staff_position_id_fkey" FOREIGN KEY ("staff_position_id") REFERENCES "staff_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_requests" ADD CONSTRAINT "hr_change_requests_dismissal_reason_id_fkey" FOREIGN KEY ("dismissal_reason_id") REFERENCES "dismissal_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "hr_change_request_lines" ADD CONSTRAINT "hr_change_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "hr_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_request_lines" ADD CONSTRAINT "hr_change_request_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hr_change_request_lines" ADD CONSTRAINT "hr_change_request_lines_staff_position_id_fkey" FOREIGN KEY ("staff_position_id") REFERENCES "staff_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "gph_contracts" ADD CONSTRAINT "gph_contracts_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "gph_contracts" ADD CONSTRAINT "gph_contracts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "timesheet_correction_lines" ADD CONSTRAINT "timesheet_correction_lines_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "timesheet_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "timesheet_correction_lines" ADD CONSTRAINT "timesheet_correction_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
