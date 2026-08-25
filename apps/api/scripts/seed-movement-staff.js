const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROSTER = [
  { tab: '0000000575', div: 'LOG_NUK', day: 1 },
  { tab: '0000004515', div: 'MONNO', day: 2 },
  { tab: '0000001203', div: 'DELUX', day: 3 },
  { tab: '0000000888', div: 'LALAKU', day: 5, rehire: true },
  { tab: '0000002311', div: 'MONNO', day: 6 },
  { tab: '0000003422', div: 'DELUX', day: 7 },
  { tab: '0000004533', div: 'LOG_NUK', day: 8 },
  { tab: '0000005644', div: 'OPS', day: 10, dismiss: true },
  { tab: '0000006755', div: 'HR', day: 12 },
  { tab: '0000007866', div: 'IT', day: 15 },
];
const CITY = {
  AND: 'Андижан',
  FER: 'Фергана',
  SAM: 'Самарканд',
  NAM: 'Наманган',
  NAV: 'Навои',
  TAS: 'Ташкент',
  QQR: 'Нукус',
  BUX: 'Бухара',
};

function d(y, m, day) {
  return new Date(Date.UTC(y, m - 1, day));
}

async function seedMovementStaff(prismaClient, tenantId) {
  const groups = {
    sales: await prismaClient.divisionGroup.upsert({
      where: { tenantId_code: { tenantId, code: 'SALES' } },
      update: { name: 'Продажи' },
      create: { tenantId, code: 'SALES', name: 'Продажи' },
    }),
    log: await prismaClient.divisionGroup.upsert({
      where: { tenantId_code: { tenantId, code: 'LOG' } },
      update: { name: 'Логистика' },
      create: { tenantId, code: 'LOG', name: 'Логистика' },
    }),
    office: await prismaClient.divisionGroup.upsert({
      where: { tenantId_code: { tenantId, code: 'OFFICE' } },
      update: { name: 'Офис' },
      create: { tenantId, code: 'OFFICE', name: 'Офис' },
    }),
  };

  const divisions = await prismaClient.division.findMany({ where: { tenantId } });
  const divByCode = new Map(divisions.map((x) => [x.code, x]));
  const assignGroup = async (code, groupId) => {
    const div = divByCode.get(code);
    if (div) await prismaClient.division.update({ where: { id: div.id }, data: { divisionGroupId: groupId } });
  };
  await assignGroup('DELUX', groups.sales.id);
  await assignGroup('MONNO', groups.sales.id);
  await assignGroup('LALAKU', groups.sales.id);
  await assignGroup('LOG_NUK', groups.log.id);
  await assignGroup('OPS', groups.log.id);
  await assignGroup('IT', groups.office.id);
  await assignGroup('HR', groups.office.id);
  await assignGroup('ADMIN', groups.office.id);

  const reason = await prismaClient.dismissalReason.findFirst({ where: { tenantId, code: 'OWN' } });
  const employees = await prismaClient.employee.findMany({
    where: { tenantId, tabNumber: { in: ROSTER.map((r) => r.tab) }, employmentType: 'staff' },
    include: { division: true, position: true, region: true },
  });
  const byTab = new Map(employees.map((e) => [e.tabNumber, e]));

  const staffByEmp = new Map();
  for (const row of ROSTER) {
    const emp = byTab.get(row.tab);
    if (!emp) continue;
    const home = divByCode.get(row.div);
    const divisionId = home?.id || emp.divisionId;
    if (divisionId && divisionId !== emp.divisionId) {
      await prismaClient.employee.update({ where: { id: emp.id }, data: { divisionId } });
      emp.divisionId = divisionId;
      emp.division = home || emp.division;
    }
    const code = `12${row.tab.slice(-5)}`;
    const city = CITY[emp.region?.code] || emp.region?.name || '';
    const staff = await prismaClient.staffPosition.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {
        title: emp.position?.name || emp.lastName,
        divisionId,
        positionId: emp.positionId,
        groupName: city,
        status: 'occupied',
        isActive: true,
      },
      create: {
        tenantId,
        code,
        title: emp.position?.name || emp.lastName,
        divisionId,
        positionId: emp.positionId,
        groupName: city,
        headcount: 1,
        status: 'occupied',
        isActive: true,
        openedAt: d(2026, 8, 1),
      },
    });
    staffByEmp.set(emp.id, staff);
    await prismaClient.employee.update({
      where: { id: emp.id },
      data: {
        hiredAt: d(2026, 8, row.day),
        staffPositionId: staff.id,
        dismissedAt: row.dismiss ? d(2026, 8, 16) : null,
        status: row.dismiss ? 'dismissed' : 'active',
        dismissalReasonId: row.dismiss ? reason?.id || null : null,
        employmentType: 'staff',
      },
    });
  }

  await prismaClient.hrDocument.deleteMany({
    where: { tenantId, number: { startsWith: 'MOV-STAFF-' } },
  });

  const rehire = byTab.get('0000000888');
  if (rehire) {
    await prismaClient.hrDocument.create({
      data: {
        tenantId,
        employeeId: rehire.id,
        type: 'dismiss',
        title: 'Увольнение',
        number: 'MOV-STAFF-D1',
        documentDate: d(2025, 11, 20),
        status: 'posted',
        postedAt: d(2025, 11, 20),
        postedBy: 'admin@demo.local',
        payload: {},
      },
    });
  }

  const dismissed = byTab.get('0000005644');
  if (dismissed) {
    await prismaClient.hrDocument.create({
      data: {
        tenantId,
        employeeId: dismissed.id,
        type: 'dismiss',
        title: 'Увольнение',
        number: 'MOV-STAFF-D2',
        documentDate: d(2026, 8, 16),
        status: 'posted',
        postedAt: d(2026, 8, 16),
        postedBy: 'admin@demo.local',
        payload: { reasonId: reason?.id },
      },
    });
  }

  const transfers = [
    { tab: '0000000575', date: d(2026, 8, 10), toCode: 'DELUX' },
    { tab: '0000002311', date: d(2026, 8, 12), toCode: 'LALAKU' },
  ];
  let n = 1;
  for (const t of transfers) {
    const emp = byTab.get(t.tab);
    const toDiv = divByCode.get(t.toCode);
    if (!emp || !toDiv || !emp.divisionId) continue;
    const fromStaff = staffByEmp.get(emp.id);
    await prismaClient.hrDocument.create({
      data: {
        tenantId,
        employeeId: emp.id,
        type: 'transfer',
        title: 'Кадровый перевод',
        number: `MOV-STAFF-T${n}`,
        documentDate: t.date,
        status: 'posted',
        postedAt: t.date,
        postedBy: 'admin@demo.local',
        payload: {
          positionHistory: {
            fromDivisionId: emp.divisionId,
            toDivisionId: toDiv.id,
            fromPositionId: emp.positionId,
            toPositionId: emp.positionId,
            fromStaffPositionId: fromStaff?.id,
            toStaffPositionId: fromStaff?.id,
          },
          oldDivisionId: emp.divisionId,
          toDivisionId: toDiv.id,
        },
      },
    });
    n += 1;
  }

  return { employees: employees.length };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');
  const out = await seedMovementStaff(prisma, tenant.id);
  console.log('movement-staff demo seeded', out);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedMovementStaff };
