/**
 * Backfill Device.passwordEnc plaintext into DeviceCredentialVault, then null the column.
 * Safe to re-run. Requires DEVICE_CREDENTIAL_VAULT_KEY (or DEVICE_LINK_KEY / PUNCH_INGEST_API_KEY).
 * Run before DROP migration.
 */
const { PrismaClient } = require('@prisma/client');
const {
  createCipheriv,
  createHash,
  randomBytes,
} = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function resolveKey() {
  const raw = (
    process.env.DEVICE_CREDENTIAL_VAULT_KEY ||
    process.env.DEVICE_LINK_KEY ||
    process.env.PUNCH_INGEST_API_KEY ||
    ''
  ).trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const buf = Buffer.from(raw, 'hex');
    if (buf.length === 32) return buf;
  }
  try {
    const fromB64 = Buffer.from(raw, 'base64');
    if (fromB64.length === 32) return fromB64;
  } catch {
    /* fall through */
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function columnExists(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'devices'
      AND column_name = 'password_enc'
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  if (!(process.env.DATABASE_URL || '').trim()) {
    console.log('[vault-backfill] DATABASE_URL unset — skip');
    return;
  }

  const prisma = new PrismaClient();
  try {
    if (!(await columnExists(prisma))) {
      console.log('[vault-backfill] password_enc already dropped — skip');
      return;
    }

    const key = resolveKey();
    const pending = await prisma.$queryRaw`
      SELECT id, tenant_id AS "tenantId", password_enc AS "passwordEnc"
      FROM devices
      WHERE password_enc IS NOT NULL AND TRIM(password_enc) <> ''
    `;

    if (!pending.length) {
      console.log('[vault-backfill] No plaintext passwords to migrate');
      return;
    }

    if (!key) {
      throw new Error(
        `[vault-backfill] ${pending.length} device(s) still have password_enc but vault key is unset. ` +
          'Set DEVICE_CREDENTIAL_VAULT_KEY before migrate deploy.',
      );
    }

    let migrated = 0;
    for (const row of pending) {
      const plain = String(row.passwordEnc || '').trim();
      if (!plain) continue;
      const ciphertext = encrypt(plain, key);
      await prisma.deviceCredentialVault.upsert({
        where: { deviceId: row.id },
        create: {
          deviceId: row.id,
          tenantId: row.tenantId,
          ciphertext,
          keyVersion: 1,
        },
        update: {
          ciphertext,
          tenantId: row.tenantId,
        },
      });
      await prisma.$executeRaw`
        UPDATE devices SET password_enc = NULL WHERE id = ${row.id}::uuid
      `;
      migrated += 1;
    }
    console.log(`[vault-backfill] Migrated ${migrated} device password(s) to vault`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[vault-backfill] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
