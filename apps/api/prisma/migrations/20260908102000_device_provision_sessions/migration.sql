-- Office-link pairing / provision sessions + credential vault (Faza 1–2)

CREATE TABLE IF NOT EXISTS "device_provision_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by_id" UUID,
    "status" TEXT NOT NULL,
    "step" TEXT,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "host" TEXT,
    "serial" TEXT,
    "device_id" UUID,
    "pairing_token_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_provision_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "device_provision_sessions_tenant_id_status_idx"
  ON "device_provision_sessions"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "device_provision_sessions_pairing_token_hash_idx"
  ON "device_provision_sessions"("pairing_token_hash");

DO $$ BEGIN
  ALTER TABLE "device_provision_sessions"
    ADD CONSTRAINT "device_provision_sessions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "device_credential_vault" (
    "device_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_credential_vault_pkey" PRIMARY KEY ("device_id")
);

CREATE INDEX IF NOT EXISTS "device_credential_vault_tenant_id_idx"
  ON "device_credential_vault"("tenant_id");

DO $$ BEGIN
  ALTER TABLE "device_credential_vault"
    ADD CONSTRAINT "device_credential_vault_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "device_credential_vault"
    ADD CONSTRAINT "device_credential_vault_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "device_credential_audits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_credential_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "device_credential_audits_tenant_id_device_id_created_at_idx"
  ON "device_credential_audits"("tenant_id", "device_id", "created_at");
CREATE INDEX IF NOT EXISTS "device_credential_audits_device_id_created_at_idx"
  ON "device_credential_audits"("device_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "device_credential_audits"
    ADD CONSTRAINT "device_credential_audits_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "device_credential_audits"
    ADD CONSTRAINT "device_credential_audits_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
