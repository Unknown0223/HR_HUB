/**
 * Seed inventory + refresh related test data for employee test1.
 * Run: npx ts-node prisma/seed-inventory-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.$queryRawUnsafe<
    Array<{ id: string; tenant_id: string; first_name: string; last_name: string }>
  >(
    `SELECT id, tenant_id, first_name, last_name FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  if (!emp[0]) throw new Error('Employee test1 not found');
  const e = emp[0];
  const userName = `${e.last_name} ${e.first_name}`.trim();

  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_inventory WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    e.tenant_id,
    e.id,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_inventory (
       id, tenant_id, employee_id, inventory_type, inventory_number, model, manufacturer,
       operation_at, purchase_date, location_name, user_name, responsible_name, status, note,
       created_at, updated_at
     ) VALUES
     (gen_random_uuid(), $1::uuid, $2::uuid, 'Компьютер', 'INV-1001', 'Latitude 5520', 'Dell',
      now(), '2024-06-15'::date, 'HQ / IT', $3, 'Demo Tenant Admin', 'Получен', 'Рабочий ноутбук',
      now(), now()),
     (gen_random_uuid(), $1::uuid, $2::uuid, 'Телефон', 'INV-1002', 'Galaxy A54', 'Samsung',
      now(), '2025-01-20'::date, 'HQ / IT', $3, 'Demo Tenant Admin', 'Получен', 'Корпоративный телефон',
      now(), now())`,
    e.tenant_id,
    e.id,
    userName,
  );

  console.log('Inventory seeded for test1:', e.id);
  console.log('Items: 2 (Компьютер, Телефон)');
  console.log('Open: /employees/' + e.id + ' → Дополнительно → Инвентарь');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
