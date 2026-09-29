-- CreateTable
CREATE TABLE "user_access_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_access_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_access_scopes_tenant_id_user_id_idx" ON "user_access_scopes"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_access_scopes_user_id_kind_resource_id_key" ON "user_access_scopes"("user_id", "kind", "resource_id");

-- AddForeignKey
ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
