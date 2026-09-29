-- AlterTable
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "speed_mps" DOUBLE PRECISION;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "heading_deg" DOUBLE PRECISION;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "altitude_m" DOUBLE PRECISION;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "battery_pct" INTEGER;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "charging" BOOLEAN;
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "device_id" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tracking_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "platform" TEXT,
    "model" TEXT,
    "app_version" TEXT,
    "permissions" JSONB,
    "battery_pct" INTEGER,
    "charging" BOOLEAN,
    "last_lat" DOUBLE PRECISION,
    "last_lng" DOUBLE PRECISION,
    "last_accuracy" DOUBLE PRECISION,
    "last_fix_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "state" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tracking_devices_token_hash_key" ON "tracking_devices"("token_hash");
CREATE INDEX IF NOT EXISTS "tracking_devices_tenant_id_employee_id_idx" ON "tracking_devices"("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "tracking_devices_tenant_id_last_seen_at_idx" ON "tracking_devices"("tenant_id", "last_seen_at");

-- AddForeignKey
ALTER TABLE "tracking_devices" ADD CONSTRAINT "tracking_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tracking_devices" ADD CONSTRAINT "tracking_devices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
