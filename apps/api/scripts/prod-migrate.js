/**
 * Production-only Prisma migrate runner.
 * - Never uses `db push`, `migrate reset`, or `migrate dev`.
 * - Never drops/recreates the database.
 * - If the DB already has tables (legacy db push) but no migration history,
 *   records existing migration folders as applied, then runs `migrate deploy`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const apiRoot = path.join(__dirname, '..');
const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');

function migrationNames() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => {
      if (name === 'migration_lock.toml') return false;
      return fs.statSync(path.join(migrationsDir, name)).isDirectory();
    })
    .sort();
}

function runPrisma(args) {
  execSync(`npx prisma ${args}`, {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

async function publicTableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function appliedMigrationCount(prisma) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c FROM "_prisma_migrations"
    `;
    return Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

async function main() {
  if (!(process.env.DATABASE_URL || '').trim()) {
    throw new Error('DATABASE_URL is required for production migrate');
  }

  const names = migrationNames();
  if (!names.length) {
    throw new Error('No Prisma migrations found under prisma/migrations');
  }

  const prisma = new PrismaClient();
  try {
    const hasTenants = await publicTableExists(prisma, 'tenants');
    const applied = await appliedMigrationCount(prisma);

    if (hasTenants && applied === 0) {
      console.log(
        '[prod-migrate] Existing database has no Prisma history (likely db push). Baselining — recording migrations only, no SQL, no data change.',
      );
      for (const name of names) {
        runPrisma(`migrate resolve --applied "${name}"`);
      }
    } else if (!hasTenants) {
      console.log('[prod-migrate] Empty database — applying Prisma migrations.');
    } else {
      console.log(
        `[prod-migrate] Prisma history present (${applied} applied). Deploying pending migrations only.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  runPrisma('migrate deploy');
  console.log('[prod-migrate] Done.');
}

main().catch((err) => {
  console.error('[prod-migrate] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
