const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function at(day, hh, mm) {
  const d = new Date(day);
  d.setHours(hh, mm, 0, 0);
  return d;
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');
  const emp = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!emp) throw new Error('no emp 0001');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let n = 0;

  for (let i = 0; i < 20; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dow = day.getDay(); // 0 Sun
    if (dow === 0) {
      await prisma.attendanceDay.upsert({
        where: {
          tenantId_employeeId_workDate: {
            tenantId: tenant.id,
            employeeId: emp.id,
            workDate: day,
          },
        },
        update: {
          status: 'day_off',
          firstInAt: null,
          lastOutAt: null,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
        },
        create: {
          tenantId: tenant.id,
          employeeId: emp.id,
          workDate: day,
          status: 'day_off',
        },
      });
      n += 1;
      continue;
    }

    // Patterns: complete / no-out / short day / late
    const mode = i % 5;
    let status = 'on_time';
    let firstInAt = at(day, 8, 42 + (i % 8));
    let lastOutAt = at(day, 18, 5 + (i % 10));
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;

    if (mode === 1) {
      // Нет ухода
      lastOutAt = null;
      status = 'late';
      lateMinutes = 0;
    } else if (mode === 2) {
      // Short day → deficit
      lastOutAt = at(day, 13, 37);
      earlyLeaveMinutes = 4 * 60;
      status = 'on_time';
    } else if (mode === 3) {
      firstInAt = at(day, 9, 25);
      lateMinutes = 25;
      status = 'late';
    } else if (mode === 4 && dow === 6) {
      // Saturday short if 6/1 schedule treats Sat as work - still seed fact
      lastOutAt = at(day, 14, 0);
      earlyLeaveMinutes = 240;
    }

    await prisma.attendanceDay.upsert({
      where: {
        tenantId_employeeId_workDate: {
          tenantId: tenant.id,
          employeeId: emp.id,
          workDate: day,
        },
      },
      update: {
        status,
        firstInAt,
        lastOutAt,
        lateMinutes,
        earlyLeaveMinutes,
      },
      create: {
        tenantId: tenant.id,
        employeeId: emp.id,
        workDate: day,
        status,
        firstInAt,
        lastOutAt,
        lateMinutes,
        earlyLeaveMinutes,
      },
    });
    n += 1;
  }

  console.log(JSON.stringify({ empId: emp.id, days: n }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
