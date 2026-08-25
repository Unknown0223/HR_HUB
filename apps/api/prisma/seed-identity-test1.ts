/**
 * Seed identification fields for test1.
 * Run: npx ts-node prisma/seed-identity-test1.ts
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
    pin: '4029',
    pinCode: '1234',
    rfidNumber: 'RFID-77881',
    fingerprints: [3, 6],
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
  console.log('Identity seeded for test1:', emp[0].id);
  console.log('PIN=4029, fingerprints=[3,6] (index left + index right)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
