const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TYPES = [
  { code: 'SICK', name: 'Больничный', paid: true },
  { code: 'TRIP', name: 'Командировка', paid: true },
  { code: 'VAC_BAL', name: 'Остаток отпуска', paid: true },
  { code: 'OTGUL', name: 'Отгул', paid: false },
  { code: 'VAC', name: 'Отпуск', paid: true },
  { code: 'MEET', name: 'Рабочая встреча', paid: true },
  { code: 'REMOTE', name: 'Удаленная работа', paid: true },
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');
  const emp = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!emp) throw new Error('no emp 0001');

  const typeMap = {};
  for (const t of TYPES) {
    const row = await prisma.absenceType.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
      update: { name: t.name, paid: t.paid, isActive: true },
      create: {
        tenantId: tenant.id,
        code: t.code,
        name: t.name,
        paid: t.paid,
      },
    });
    typeMap[t.code] = row.id;
  }

  // Clear only demo tag absences so re-run is idempotent
  await prisma.absence.deleteMany({
    where: {
      tenantId: tenant.id,
      employeeId: emp.id,
      note: { startsWith: '[demo]' },
    },
  });

  const samples = [
    {
      code: 'SICK',
      status: 'pending',
      start: '2026-08-04',
      end: '2026-08-05',
      note: '[demo] Температура',
      requestKind: 'multi_day',
    },
    {
      code: 'OTGUL',
      status: 'pending',
      start: '2026-08-10',
      end: '2026-08-10',
      note: '[demo] Семейные дела',
      requestKind: 'part_day',
    },
    {
      code: 'REMOTE',
      status: 'pending',
      start: '2026-08-18',
      end: '2026-08-18',
      note: '[demo] Домашний офис',
      requestKind: 'full_day',
    },
    {
      code: 'VAC',
      status: 'approved',
      start: '2026-09-01',
      end: '2026-09-14',
      note: '[demo] Плановый отпуск',
      requestKind: 'multi_day',
      reviewNote: 'Согласовано',
    },
    {
      code: 'MEET',
      status: 'rejected',
      start: '2026-07-01',
      end: '2026-07-01',
      note: '[demo] Внешняя встреча',
      requestKind: 'full_day',
      reviewNote: 'Пересекается с сменой',
    },
    {
      code: 'VAC',
      status: 'approved',
      start: '2025-03-01',
      end: '2025-03-10',
      note: '[demo] Использованный отпуск',
      requestKind: 'multi_day',
      reviewNote: 'Завершен',
    },
  ];

  for (const s of samples) {
    await prisma.absence.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp.id,
        absenceTypeId: typeMap[s.code],
        startDate: new Date(s.start),
        endDate: new Date(s.end),
        status: s.status,
        note: s.note,
        meta: {
          requestKind: s.requestKind,
          requestDate: new Date().toISOString(),
          ...(s.reviewNote ? { reviewNote: s.reviewNote } : {}),
        },
      },
    });
  }

  console.log('Seeded absence types + demo requests for', emp.tabNumber);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
