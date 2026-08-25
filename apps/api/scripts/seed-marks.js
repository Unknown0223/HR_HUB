const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');
  const emp = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: '0001' },
  });
  if (!emp) throw new Error('no emp 0001');

  const loc =
    (await prisma.location.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { name: 'asc' },
    })) || null;

  const device =
    (await prisma.device.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { name: 'asc' },
    })) || null;

  // remove previous demo marks
  await prisma.attendanceMark.deleteMany({
    where: {
      tenantId: tenant.id,
      employeeId: emp.id,
      source: 'manual',
      rawPayload: { path: ['demo'], equals: true },
    },
  });

  const samples = [
    { markType: 'in', direction: 'IN', hoursAgo: 26, idType: 'Распознавание лица', deviceType: 'Hikvision' },
    { markType: 'out', direction: 'OUT', hoursAgo: 18, idType: 'Распознавание лица', deviceType: 'Hikvision' },
    { markType: 'in', direction: 'IN', hoursAgo: 8, idType: 'Распознавание лица', deviceType: 'Hikvision' },
    { markType: 'mark', direction: 'AUTO', hoursAgo: 5, idType: 'Ручной ввод', deviceType: 'Ручной' },
    { markType: 'out', direction: 'OUT', hoursAgo: 1, idType: 'QR-код', deviceType: 'QR' },
  ];

  let n = 0;
  for (const s of samples) {
    const occurredAt = new Date(Date.now() - s.hoursAgo * 3600_000);
    await prisma.attendanceMark.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp.id,
        deviceId: device?.id ?? null,
        direction: s.direction,
        occurredAt,
        source: s.markType === 'mark' ? 'manual' : s.deviceType === 'QR' ? 'qr' : 'hikvision',
        rawPayload: {
          demo: true,
          markType: s.markType,
          locationId: loc?.id ?? null,
          locationName: loc?.name ?? 'Nukus 1',
          identificationType: s.idType,
          deviceType: s.deviceType,
          isValid: true,
        },
      },
    });
    n += 1;
  }

  console.log(JSON.stringify({ empId: emp.id, seeded: n, location: loc?.name, device: device?.name }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
