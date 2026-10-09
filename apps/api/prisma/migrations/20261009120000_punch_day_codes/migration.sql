CREATE TABLE "punch_day_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "punch_day_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "punch_day_codes_tenant_id_employee_id_work_date_key" ON "punch_day_codes"("tenant_id", "employee_id", "work_date");
CREATE UNIQUE INDEX "punch_day_codes_tenant_id_work_date_code_key" ON "punch_day_codes"("tenant_id", "work_date", "code");
CREATE INDEX "punch_day_codes_tenant_id_work_date_idx" ON "punch_day_codes"("tenant_id", "work_date");
