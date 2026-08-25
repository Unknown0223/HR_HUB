/**
 * Seed family test data for employee "test1" (tab number or name).
 * Run: npx ts-node prisma/seed-family-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findTest1Employee() {
  const rows = await prisma.employee.findMany({
    where: {
      OR: [
        { tabNumber: { equals: 'test1', mode: 'insensitive' } },
        { firstName: { equals: 'test1', mode: 'insensitive' } },
        { lastName: { equals: 'test1', mode: 'insensitive' } },
        { email: { contains: 'test1', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      tabNumber: true,
      firstName: true,
      lastName: true,
    },
    take: 5,
  });
  return rows;
}

async function upsertMaritalStatus(
  tenantId: string,
  employeeId: string,
  maritalStatus: string,
) {
  const existing = await prisma.hrDocument.findFirst({
    where: {
      tenantId,
      employeeId,
      type: 'other',
      number: 'PROFILE_EXTRAS',
    },
  });
  const prev =
    existing?.payload &&
    typeof existing.payload === 'object' &&
    !Array.isArray(existing.payload)
      ? { ...(existing.payload as Record<string, unknown>) }
      : { kind: 'profile_extras' };
  const next = { ...prev, kind: 'profile_extras', maritalStatus };
  if (existing) {
    await prisma.hrDocument.update({
      where: { id: existing.id },
      data: { payload: next },
    });
  } else {
    await prisma.hrDocument.create({
      data: {
        tenantId,
        employeeId,
        type: 'other',
        status: 'posted',
        number: 'PROFILE_EXTRAS',
        title: 'Профиль (доп. поля)',
        documentDate: new Date(),
        payload: next,
        postedAt: new Date(),
      },
    });
  }
}

async function main() {
  let employees = await findTest1Employee();

  if (!employees.length) {
    const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
    if (!tenant) throw new Error('Demo tenant not found. Run prisma seed first.');

    const division = await prisma.division.findFirst({ where: { tenantId: tenant.id } });
    const position = await prisma.position.findFirst({ where: { tenantId: tenant.id } });
    const schedule = await prisma.workSchedule.findFirst({ where: { tenantId: tenant.id } });

    const person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Test',
        lastName: 'One',
        gender: 'M',
      },
    });

    const emp = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        personId: person.id,
        tabNumber: 'test1',
        firstName: 'Test',
        lastName: 'One',
        email: 'test1@demo.local',
        divisionId: division?.id,
        positionId: position?.id,
        scheduleId: schedule?.id,
        hiredAt: new Date('2025-01-01'),
      },
      select: { id: true, tenantId: true, tabNumber: true, firstName: true, lastName: true },
    });
    employees = [emp];
    console.log('Created employee test1:', emp.id);
  } else {
    console.log('Found employee(s):', employees);
  }

  const emp = employees[0];
  const { tenantId, id: employeeId } = emp;

  await prisma.employeeRelative.deleteMany({ where: { tenantId, employeeId } });

  const relatives = [
    {
      fullName: 'KARIMOVA GULNOZA RUSTAMOVNA',
      relation: 'Жена',
      gender: 'Женский',
      phone: '+998901234567',
      birthDate: new Date('1992-05-14'),
      workplace: 'Toshkent shahar, 12-maktab',
      dependent: false,
      isHidden: false,
    },
    {
      fullName: 'KARIMOV ABDULLOH ALI OGLI',
      relation: 'Сын',
      gender: 'Мужской',
      phone: '',
      birthDate: new Date('2015-09-03'),
      workplace: 'Maktab o\'quvchisi',
      dependent: true,
      isHidden: false,
    },
    {
      fullName: 'KARIMOVA MALIKA RUSTAMOVNA',
      relation: 'Дочь',
      gender: 'Женский',
      phone: '',
      birthDate: new Date('2018-11-22'),
      workplace: 'Bolalar bog\'chasi',
      dependent: true,
      isHidden: false,
    },
  ];

  for (const r of relatives) {
    await prisma.employeeRelative.create({
      data: { tenantId, employeeId, ...r },
    });
  }

  await upsertMaritalStatus(tenantId, employeeId, 'Женат/Замужем');

  console.log('\nFamily test data added for:', emp.tabNumber, `${emp.firstName} ${emp.lastName}`);
  console.log('Employee ID:', employeeId);
  console.log('Relatives:', relatives.length);
  console.log('Marital status: Женат/Замужем');
  console.log('\nOpen: /employees/' + employeeId + ' → Дополнительно → Семья');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
