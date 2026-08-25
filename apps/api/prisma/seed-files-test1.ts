/**
 * Seed file test data for employee "test1".
 * Run: npx ts-node prisma/seed-files-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
    `SELECT id, tenant_id FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  const emp = rows[0];
  if (!emp) throw new Error('Employee test1 not found.');

  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_files WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp.tenant_id,
    emp.id,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_files (id, tenant_id, employee_id, name, note, file_name, file_key, file_url, content_type, file_size, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, NULL, NULL, $6, $7, now(), now())`,
    emp.tenant_id,
    emp.id,
    'Трудовой договор (скан)',
    'Подписанный экземпляр от 01.01.2025',
    'dogovor-test1.pdf',
    'application/pdf',
    245760,
  );

  console.log('File test data added for test1:', emp.id);
  console.log('Open: /employees/' + emp.id + ' → Дополнительно → Файлы');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
