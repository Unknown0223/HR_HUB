const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');
  const emp = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!emp) throw new Error('no emp');
  let locType = await prisma.locationType.findFirst({
    where: { tenantId: tenant.id, code: 'OFFICE' },
  });
  if (!locType) {
    locType = await prisma.locationType.create({
      data: { tenantId: tenant.id, code: 'OFFICE', name: 'Офис' },
    });
  }
  const defs = [
    ['AND1', 'Andijon 1', 'Andijon'],
    ['AND2', 'Andijon 2', 'Andijon'],
    ['BUX1', 'Buxoro 1', 'Buxoro'],
    ['BUX2', 'Buxoro 2 (Zarafshan)', 'Buxoro'],
    ['NAV1', 'Navoiy 1', 'Navoiy'],
    ['SAM1', 'Samarqand 1', 'Samarqand'],
    ['FER1', 'Fargona 1', 'Fargona'],
    ['NAM1', 'Namangan 1', 'Namangan'],
    ['QAR1', 'Qarshi 1', 'Qarshi'],
    ['NUK1', 'Nukus 1', 'Nukus'],
    ['JIZ1', 'Jizzax 1', 'Jizzax'],
    ['TER1', 'Termiz 1', 'Termiz'],
  ];
  const locs = [];
  for (const [code, name, address] of defs) {
    locs.push(
      await prisma.location.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        update: {
          name,
          address,
          locationTypeId: locType.id,
          isActive: true,
        },
        create: {
          tenantId: tenant.id,
          code,
          name,
          address,
          locationTypeId: locType.id,
        },
      }),
    );
  }
  for (const l of locs.slice(0, 8)) {
    const g = await prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId: tenant.id,
        employeeId: emp.id,
        accessType: 'location',
        resource: l.id,
      },
    });
    if (g) {
      await prisma.employeeAccessGrant.update({
        where: { id: g.id },
        data: { isActive: true, note: 'auto' },
      });
    } else {
      await prisma.employeeAccessGrant.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          accessType: 'location',
          resource: l.id,
          isActive: true,
          note: 'auto',
        },
      });
    }
  }
  console.log('ok locs', locs.length, 'attached 8 emp', emp.id);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
