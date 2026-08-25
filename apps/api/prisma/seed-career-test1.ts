/**
 * Seed career test data for employee "test1".
 * Run: npx ts-node prisma/seed-career-test1.ts
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
    `DELETE FROM employee_tenures WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp.tenant_id,
    emp.id,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_workplaces WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp.tenant_id,
    emp.id,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_awards WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp.tenant_id,
    emp.id,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_tenures (id, tenant_id, employee_id, tenure_type, still_working, counted_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, true, $4::date, now(), now())`,
    emp.tenant_id,
    emp.id,
    'Общий',
    '2025-01-01',
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_workplaces (id, tenant_id, employee_id, organization, position, org_address, start_date, end_date, description, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::date, $7::date, $8, now(), now())`,
    emp.tenant_id,
    emp.id,
    'Demo Company LLC',
    'Junior Developer',
    'Toshkent, Chilonzor tumani',
    '2020-03-01',
    '2024-12-31',
    'Backend development',
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_awards (id, tenant_id, employee_id, award_type, doc_title, doc_number, award_date, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::date, now(), now())`,
    emp.tenant_id,
    emp.id,
    'Почётная грамота',
    'Приказ №45',
    'GR-2024-12',
    '2024-12-20',
  );

  console.log('Career test data added for test1:', emp.id);
  console.log('Open: /employees/' + emp.id + ' → Дополнительно → Трудовая деятельность');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
