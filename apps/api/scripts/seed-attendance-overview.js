const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function at(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh, mm, 0);
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active' },
    select: { id: true, lastName: true, firstName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  if (!employees.length) throw new Error('no employees');

  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 22);
  let created = 0;
  for (const emp of employees) {
    for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
      const y = t.getFullYear();
      const m = t.getMonth() + 1;
      const d = t.getDate();
      const workDate = new Date(y, m - 1, d);
      const dow = workDate.getDay();
      const key = { tenantId_employeeId_workDate: { tenantId: tenant.id, employeeId: emp.id, workDate } };
      if (dow === 0) {
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'day_off',
            firstInAt: null,
            lastOutAt: null,
            workedHours: 0,
            onTimeHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'day_off',
            workedHours: 0,
            onTimeHours: 0,
          },
        });
        created += 1;
        continue;
      }
      const mix = (emp.id.charCodeAt(0) + d) % 11;
      if (mix === 0) {
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'absent',
            firstInAt: null,
            lastOutAt: null,
            workedHours: 0,
            onTimeHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'absent',
            workedHours: 0,
            onTimeHours: 0,
          },
        });
      } else if (mix === 1) {
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'late',
            firstInAt: at(y, m, d, 8, 40),
            lastOutAt: at(y, m, d, 18, 0),
            workedHours: 8,
            onTimeHours: 8,
            lateMinutes: 10,
            earlyLeaveMinutes: 0,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'late',
            firstInAt: at(y, m, d, 8, 40),
            lastOutAt: at(y, m, d, 18, 0),
            workedHours: 8,
            onTimeHours: 8,
            lateMinutes: 10,
          },
        });
      } else if (mix === 2 || mix === 3) {
        const early = 45 + ((d * 7 + mix) % 180);
        const leaveH = 18 - Math.floor(early / 60);
        const leaveM = (60 - (early % 60)) % 60;
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'on_time',
            firstInAt: at(y, m, d, 8, 30),
            lastOutAt: at(y, m, d, leaveH, leaveM),
            workedHours: Math.round(((8 * 60 - early) / 60) * 100) / 100,
            onTimeHours: Math.round(((8 * 60 - early) / 60) * 100) / 100,
            lateMinutes: 0,
            earlyLeaveMinutes: early,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'on_time',
            firstInAt: at(y, m, d, 8, 30),
            lastOutAt: at(y, m, d, leaveH, leaveM),
            workedHours: Math.round(((8 * 60 - early) / 60) * 100) / 100,
            onTimeHours: Math.round(((8 * 60 - early) / 60) * 100) / 100,
            earlyLeaveMinutes: early,
          },
        });
      } else if (mix === 4) {
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'not_started',
            firstInAt: at(y, m, d, 8, 29),
            lastOutAt: null,
            workedHours: 0,
            onTimeHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'not_started',
            firstInAt: at(y, m, d, 8, 29),
            workedHours: 0,
            onTimeHours: 0,
          },
        });
      } else {
        const inM = 25 + (d % 8);
        const outM = 2 + (d % 6);
        await prisma.attendanceDay.upsert({
          where: key,
          update: {
            status: 'on_time',
            firstInAt: at(y, m, d, 8, inM),
            lastOutAt: at(y, m, d, 18, outM),
            workedHours: 8,
            onTimeHours: 8,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
          },
          create: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate,
            status: 'on_time',
            firstInAt: at(y, m, d, 8, inM),
            lastOutAt: at(y, m, d, 18, outM),
            workedHours: 8,
            onTimeHours: 8,
          },
        });
      }
      created += 1;
    }
  }

  console.log(JSON.stringify({ employees: employees.length, days: created, from: '2026-08-01', to: '2026-08-22' }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
