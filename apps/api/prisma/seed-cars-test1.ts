/**
 * Seed cars for employee test1.
 * Run: npx ts-node prisma/seed-cars-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
    `SELECT id, tenant_id FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  if (!emp[0]) throw new Error('Employee test1 not found');

  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_cars WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp[0].tenant_id,
    emp[0].id,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_cars (id, tenant_id, employee_id, name, plate_number, code, is_active, created_at, updated_at)
     VALUES
     (gen_random_uuid(), $1::uuid, $2::uuid, 'Chevrolet Gentra', '01 A 777 AA', 'GNT-2023', true, now(), now()),
     (gen_random_uuid(), $1::uuid, $2::uuid, 'Toyota Camry', '10 B 123 BB', 'V-002', true, now(), now())`,
    emp[0].tenant_id,
    emp[0].id,
  );

  console.log('Cars seeded for test1:', emp[0].id);
  console.log('Open: /employees/' + emp[0].id + ' → Дополнительно → Автомобиль');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
