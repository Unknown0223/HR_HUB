const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const manager = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!manager) throw new Error('no emp 0001');

  const others = await prisma.employee.findMany({
    where: {
      tenantId: tenant.id,
      status: 'active',
      NOT: { id: manager.id },
    },
    take: 3,
    orderBy: { tabNumber: 'asc' },
  });

  for (const sub of others) {
    const existing = await prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId: tenant.id,
        employeeId: sub.id,
        accessType: 'reports_to',
        resource: manager.id,
      },
    });
    if (existing) {
      await prisma.employeeAccessGrant.update({
        where: { id: existing.id },
        data: { isActive: true, note: '[demo] reports_to' },
      });
    } else {
      await prisma.employeeAccessGrant.create({
        data: {
          tenantId: tenant.id,
          employeeId: sub.id,
          accessType: 'reports_to',
          resource: manager.id,
          isActive: true,
          note: '[demo] reports_to',
        },
      });
    }
  }

  // Attendance days for efficiency gauge (last ~8 months sample)
  const statuses = ['on_time', 'on_time', 'on_time', 'late', 'on_time', 'leave', 'absent'];
  let createdDays = 0;
  for (let monthsAgo = 0; monthsAgo < 8; monthsAgo++) {
    for (let day = 1; day <= 10; day++) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - monthsAgo);
      d.setUTCDate(Math.min(day * 2, 28));
      const workDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const status = statuses[(monthsAgo + day) % statuses.length];
      try {
        await prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId: tenant.id,
              employeeId: manager.id,
              workDate,
            },
          },
          update: { status },
          create: {
            tenantId: tenant.id,
            employeeId: manager.id,
            workDate,
            status,
          },
        });
        createdDays += 1;
      } catch {
        /* skip invalid */
      }
    }
  }

  // Education + language as HrDocument payload
  const eduCount = await prisma.hrDocument.count({
    where: {
      tenantId: tenant.id,
      employeeId: manager.id,
      title: { startsWith: '[demo] Образование' },
    },
  });
  if (eduCount === 0) {
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: manager.id,
        type: 'other',
        title: '[demo] Образование: Высшее',
        documentDate: new Date('2018-06-15'),
        status: 'draft',
        payload: {
          kind: 'education',
          educationType: 'Высшее',
          institution: 'НУУз',
          specialty: 'Информатика',
          startDate: '2014-09-01',
          endDate: '2018-06-15',
        },
      },
    });
  }

  const langCount = await prisma.hrDocument.count({
    where: {
      tenantId: tenant.id,
      employeeId: manager.id,
      title: { startsWith: '[demo] Язык' },
    },
  });
  if (langCount === 0) {
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: manager.id,
        type: 'other',
        title: '[demo] Язык: Русский',
        documentDate: new Date(),
        status: 'draft',
        payload: { kind: 'language', name: 'Русский', level: 'Родной' },
      },
    });
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: manager.id,
        type: 'other',
        title: '[demo] Язык: Английский',
        documentDate: new Date(),
        status: 'draft',
        payload: { kind: 'language', name: 'Английский', level: 'Средний' },
      },
    });
  }

  const reqCount = await prisma.hrRequest.count({
    where: {
      tenantId: tenant.id,
      employeeId: manager.id,
      type: 'schedule_change',
      title: { startsWith: '[demo]' },
    },
  });
  if (reqCount === 0) {
    await prisma.hrRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: manager.id,
        type: 'schedule_change',
        title: '[demo] Переход на 10:00-19:00',
        status: 'pending',
        visibility: 'shared',
        payload: { note: 'Семейные обстоятельства' },
      },
    });
  }

  if (manager.baseSalary == null) {
    await prisma.employee.update({
      where: { id: manager.id },
      data: { baseSalary: 6000000 },
    });
  }

  console.log(
    JSON.stringify(
      {
        managerId: manager.id,
        subordinatesLinked: others.length,
        attendanceUpserts: createdDays,
      },
      null,
      2,
    ),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
