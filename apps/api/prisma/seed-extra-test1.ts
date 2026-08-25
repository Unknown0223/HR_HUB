/**
 * Seed extra info + mark blocks for test1.
 * Run: npx ts-node prisma/seed-extra-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
    `SELECT id, tenant_id FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  if (!emp[0]) throw new Error('Employee test1 not found');

  const existing = await prisma.hrDocument.findFirst({
    where: {
      tenantId: emp[0].tenant_id,
      employeeId: emp[0].id,
      type: 'other',
      number: 'PROFILE_EXTRAS',
    },
  });
  const prev =
    existing?.payload &&
    typeof existing.payload === 'object' &&
    !Array.isArray(existing.payload)
      ? { ...(existing.payload as Record<string, unknown>) }
      : { kind: 'profile_extras' };
  const next = {
    ...prev,
    kind: 'profile_extras',
    altFirstName: 'Max',
    altLastName: 'Abdi',
    altMiddleName: 'M.',
    citizenship: 'Узбекистан',
    extraCode: 'EMP-TEST1',
    notKeyEmployee: false,
  };
  if (existing) {
    await prisma.hrDocument.update({
      where: { id: existing.id },
      data: { payload: next },
    });
  } else {
    await prisma.hrDocument.create({
      data: {
        tenantId: emp[0].tenant_id,
        employeeId: emp[0].id,
        type: 'other',
        status: 'posted',
        number: 'PROFILE_EXTRAS',
        title: 'Профиль (доп. поля)',
        documentDate: new Date(),
        payload: next,
        postedAt: new Date(),
      },
    });
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM employee_mark_blocks WHERE tenant_id = $1::uuid AND employee_id = $2::uuid`,
    emp[0].tenant_id,
    emp[0].id,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO employee_mark_blocks (id, tenant_id, employee_id, start_date, end_date, note, created_at, updated_at)
     VALUES
     (gen_random_uuid(), $1::uuid, $2::uuid, '2025-01-10'::date, '2025-01-15'::date, 'Командировка — отметки блокированы', now(), now()),
     (gen_random_uuid(), $1::uuid, $2::uuid, '2025-03-01'::date, '2025-03-03'::date, 'Больничный', now(), now())`,
    emp[0].tenant_id,
    emp[0].id,
  );

  console.log('Extra info + mark blocks seeded for test1:', emp[0].id);
  console.log('Open: /employees/' + emp[0].id + ' → Дополнительно → Дополнительная информация');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
