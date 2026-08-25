const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo');
  const emp = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!emp) throw new Error('no emp');

  const vac = await prisma.absenceType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'VAC' } },
    update: { name: 'Ежегодный трудовой отпуск' },
    create: {
      tenantId: tenant.id,
      code: 'VAC',
      name: 'Ежегодный трудовой отпуск',
      paid: true,
    },
  });
  const sick = await prisma.absenceType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SICK' } },
    update: { name: 'Больничный лист' },
    create: {
      tenantId: tenant.id,
      code: 'SICK',
      name: 'Больничный лист',
      paid: true,
    },
  });

  // Ensure hire document
  const hire = await prisma.hrDocument.findFirst({
    where: { tenantId: tenant.id, employeeId: emp.id, type: 'hire' },
  });
  if (!hire) {
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp.id,
        type: 'hire',
        title: 'Прием на работу',
        number: emp.tabNumber.padStart(10, '0'),
        documentDate: emp.hiredAt ?? new Date('2024-07-18'),
        status: 'posted',
        postedAt: emp.hiredAt ?? new Date('2024-07-18'),
        payload: { baseSalary: emp.baseSalary },
      },
    });
  }

  // Vacation
  await prisma.absence.deleteMany({
    where: {
      tenantId: tenant.id,
      employeeId: emp.id,
      absenceTypeId: { in: [vac.id, sick.id] },
    },
  });
  await prisma.absence.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp.id,
      absenceTypeId: vac.id,
      startDate: new Date('2025-08-01'),
      endDate: new Date('2025-08-14'),
      status: 'approved',
      note: 'Летний отпуск',
      meta: {
        documentType: 'Приказ на отпуск',
        vacationPay: 2500000,
      },
    },
  });
  await prisma.absence.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp.id,
      absenceTypeId: sick.id,
      startDate: new Date('2025-03-10'),
      endDate: new Date('2025-03-14'),
      status: 'approved',
      note: 'ОРВИ',
      meta: {
        number: 'BL-2025-0142',
        reason: 'ОРВИ',
        coefficient: 1,
      },
    },
  });

  // Business trip
  await prisma.internalTrip.deleteMany({
    where: { tenantId: tenant.id, employeeId: emp.id },
  });
  const loc = await prisma.location.findFirst({
    where: { tenantId: tenant.id, code: 'SAM1' },
  });
  await prisma.internalTrip.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp.id,
      locationId: loc?.id,
      title: 'Встреча с партнёрами',
      startDate: new Date('2025-05-12'),
      endDate: new Date('2025-05-15'),
      status: 'completed',
      note: 'Средства компании',
      meta: {
        organization: loc?.name ?? 'Samarqand 1',
        reason: 'Встреча с партнёрами',
        fundedBy: 'Средства компании',
      },
    },
  });

  console.log('document history seeded for', emp.id);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
