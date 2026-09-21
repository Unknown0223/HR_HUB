-- F12: device passwords live only in device_credential_vault.
-- Backfill runs in prod-migrate / vault:backfill before this migration.
ALTER TABLE "devices" DROP COLUMN IF EXISTS "password_enc";
