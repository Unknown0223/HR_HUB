const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const IN_TIMES = [
  [8, 34, 'on_time'],
  [8, 33, 'on_time'],
  [8, 19, 'on_time'],
  [9, 1, 'late'],
  [8, 51, 'on_time'],
  [7, 35, 'on_time'],
  [8, 45, 'on_time'],
  [8, 47, 'on_time'],
  [8, 27, 'on_time'],
  [9, 12, 'late'],
  [8, 54, 'on_time'],
  [8, 11, 'on_time'],
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const now = new Date();
  const workDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active', employmentType: 'staff' },
    include: { person: true, position: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  let n = 0;
  for (let i = 0; i < employees.length; i += 1) {
    const emp = employees[i];
    const spec = IN_TIMES[i];
    if (!spec) {
      await prisma.attendanceDay.upsert({
        where: {
          tenantId_employeeId_workDate: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
          },
        },
        update: { status: 'absent', firstInAt: null, lastOutAt: null, lateMinutes: 0 },
        create: {
          tenantId: tenant.id,
          employeeId: emp.id,
          workDate,
          status: 'absent',
        },
      });
      n += 1;
      continue;
    }
    const [h, m, status] = spec;
    const firstInAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    await prisma.attendanceDay.upsert({
      where: {
        tenantId_employeeId_workDate: {
          tenantId: tenant.id,
          employeeId: emp.id,
          workDate,
        },
      },
      update: {
        status,
        firstInAt,
        lastOutAt: null,
        lateMinutes: status === 'late' ? m : 0,
      },
      create: {
        tenantId: tenant.id,
        employeeId: emp.id,
        workDate,
        status,
        firstInAt,
        lateMinutes: status === 'late' ? m : 0,
      },
    });
    n += 1;
  }

  const bdays = [0, 0, 1, 2, 3];
  let b = 0;
  for (const emp of employees) {
    const personId = emp.personId || emp.person?.id;
    if (!personId || b >= bdays.length) continue;
    const d = new Date(Date.UTC(1991, now.getMonth(), now.getDate() + bdays[b]));
    await prisma.person.update({
      where: { id: personId },
      data: { birthDate: d },
    });
    b += 1;
  }

  console.log(JSON.stringify({ days: n, employees: employees.length, birthdays: b, workDate }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
