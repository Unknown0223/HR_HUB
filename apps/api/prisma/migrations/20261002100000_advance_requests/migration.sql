-- CreateEnum
CREATE TYPE "AdvanceRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "advance_limits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "max_amount" DECIMAL(14,2) NOT NULL,
    "roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "employee_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advance_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "comment" TEXT,
    "limit_amount" DECIMAL(14,2),
    "limit_id" UUID,
    "over_limit" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdvanceRequestStatus" NOT NULL DEFAULT 'pending',
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "advance_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advance_limits_tenant_id_idx" ON "advance_limits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "advance_requests_advance_id_key" ON "advance_requests"("advance_id");

-- CreateIndex
CREATE INDEX "advance_requests_tenant_id_status_idx" ON "advance_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "advance_requests_tenant_id_employee_id_idx" ON "advance_requests"("tenant_id", "employee_id");

-- AddForeignKey
ALTER TABLE "advance_limits" ADD CONSTRAINT "advance_limits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "payroll_advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
