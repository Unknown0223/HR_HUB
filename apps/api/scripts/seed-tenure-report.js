const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const EXTRA = [
  { code: 'PIECE', name: 'Сдельная оплата труда (за отработанные часы)', shortName: 'Сдельная', sortOrder: 25, purpose: 'Оклад' },
  { code: 'MONTHLY_H', name: 'Месячная оплата труда (по часам)', shortName: 'Мес. по часам', sortOrder: 65, purpose: 'Оклад' },
  { code: 'TIMEPAY', name: 'Повременная оплата труда', shortName: 'Повременная', sortOrder: 85, purpose: 'Оклад' },
  { code: 'TRIP_ONE', name: 'Командировка', shortName: 'Командировка', sortOrder: 51, purpose: 'Командировка' },
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  for (const it of EXTRA) {
    await prisma.accrualType.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: it.code } },
      update: { name: it.name, shortName: it.shortName, sortOrder: it.sortOrder, purpose: it.purpose, isActive: true },
      create: {
        tenantId: tenant.id,
        code: it.code,
        name: it.name,
        shortName: it.shortName,
        sortOrder: it.sortOrder,
        purpose: it.purpose,
        periodCalc: 'period',
        resultMode: 'formula',
        taxNdfl: true,
        isActive: true,
      },
    });
  }

  const occupied = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id, status: 'occupied', isActive: true },
    select: { id: true, accruals: true },
    take: 40,
  });
  let n = 0;
  for (const sp of occupied) {
    const raw = Array.isArray(sp.accruals) ? sp.accruals : [];
    if (raw.length) continue;
    await prisma.staffPosition.update({
      where: { id: sp.id },
      data: { accruals: [{ name: 'Месячная оплата труда', indicators: '' }] },
    });
    n += 1;
  }

  console.log(`accrual types upserted, staff positions with monthly pay: ${n}`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
