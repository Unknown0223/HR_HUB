const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const t = await p.tenant.findFirst({ where: { code: 'demo' } });
  const byStatus = await p.employee.groupBy({
    by: ['status'],
    where: { tenantId: t.id },
    _count: true,
  });
  const vf = await p.employee.count({
    where: { tenantId: t.id, externalId: { startsWith: 'verifix:' } },
  });
  const activeVf = await p.employee.count({
    where: { tenantId: t.id, status: 'active', externalId: { startsWith: 'verifix:' } },
  });
  const dismissedVf = await p.employee.count({
    where: { tenantId: t.id, status: 'dismissed', externalId: { startsWith: 'verifix:' } },
  });
  const marks = await p.attendanceMark.count({ where: { tenantId: t.id, source: 'verifix' } });
  const marksLinked = await p.attendanceMark.count({
    where: { tenantId: t.id, source: 'verifix', employeeId: { not: null } },
  });
  const devices = await p.device.count({ where: { tenantId: t.id } });
  const locs = await p.location.count({ where: { tenantId: t.id } });
  const sps = await p.staffPosition.groupBy({
    by: ['status'],
    where: { tenantId: t.id },
    _count: true,
  });
  const xaf = await p.employee.findFirst({
    where: { tenantId: t.id, lastName: 'XAFIZOV' },
    select: {
      tabNumber: true,
      status: true,
      externalId: true,
      phone: true,
      hiredAt: true,
      firstName: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        byStatus,
        vf,
        activeVf,
        dismissedVf,
        marks,
        marksLinked,
        devices,
        locs,
        sps,
        xafizov: xaf,
        totalEmp: await p.employee.count({ where: { tenantId: t.id } }),
      },
      null,
      2,
    ),
  );
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
