const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const KINSHIP = [
  { code: 'SPOUSE', name: 'Супруг(а)' },
  { code: 'HUSBAND', name: 'Муж' },
  { code: 'WIFE', name: 'Жена' },
  { code: 'FATHER', name: 'Отец' },
  { code: 'MOTHER', name: 'Мать' },
  { code: 'SON', name: 'Сын' },
  { code: 'DAUGHTER', name: 'Дочь' },
  { code: 'BROTHER', name: 'Брат' },
  { code: 'SISTER', name: 'Сестра' },
  { code: 'CHILD', name: 'Ребёнок' },
  { code: 'PARENT', name: 'Родитель' },
];

const DEMO = [
  {
    relation: 'Жена',
    fullName: 'Каримова Малика Азизовна',
    gender: 'Женский',
    birth: '1992-05-01',
    workplace: 'ООО Verifix',
    dependent: true,
  },
  {
    relation: 'Сын',
    fullName: 'Каримов Алишер Баходирович',
    gender: 'Мужской',
    birth: '2016-03-12',
    workplace: '',
    dependent: true,
  },
  {
    relation: 'Дочь',
    fullName: 'Каримова Сабина Баходировна',
    gender: 'Женский',
    birth: '2019-11-08',
    workplace: '',
    dependent: true,
  },
  {
    relation: 'Отец',
    fullName: 'Каримов Баходир Рахимович',
    gender: 'Мужской',
    birth: '1965-02-20',
    workplace: 'Пенсионер',
    dependent: false,
  },
  {
    relation: 'Мать',
    fullName: 'Каримова Дилбар Юсуповна',
    gender: 'Женский',
    birth: '1968-07-14',
    workplace: 'Домохозяйка',
    dependent: false,
  },
  {
    relation: 'Муж',
    fullName: 'Рахимов Жахонгир Одилович',
    gender: 'Мужской',
    birth: '1988-09-03',
    workplace: 'IT Park',
    dependent: false,
  },
  {
    relation: 'Брат',
    fullName: 'Юсупов Шерзод Акмалович',
    gender: 'Мужской',
    birth: '1995-01-22',
    workplace: 'UZAUTO',
    dependent: false,
  },
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const dict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'kinship' } },
    update: { name: 'Степени родства', kind: 'core' },
    create: { tenantId: tenant.id, code: 'kinship', name: 'Степени родства', kind: 'core' },
  });
  for (let i = 0; i < KINSHIP.length; i += 1) {
    await prisma.dictionaryItem.upsert({
      where: { dictionaryId_code: { dictionaryId: dict.id, code: KINSHIP[i].code } },
      update: { name: KINSHIP[i].name, sortOrder: i + 1, isActive: true },
      create: {
        dictionaryId: dict.id,
        code: KINSHIP[i].code,
        name: KINSHIP[i].name,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active' },
    select: { id: true, lastName: true, firstName: true },
    orderBy: { lastName: 'asc' },
    take: 8,
  });
  if (!employees.length) throw new Error('no employees');

  await prisma.employeeRelative.deleteMany({ where: { tenantId: tenant.id } });

  let i = 0;
  for (const emp of employees) {
    const count = emp === employees[0] ? 3 : 1;
    for (let k = 0; k < count; k += 1) {
      const row = DEMO[i % DEMO.length];
      i += 1;
      await prisma.$executeRawUnsafe(
        `INSERT INTO employee_relatives
          (id, tenant_id, employee_id, full_name, relation, birth_date, gender, workplace, dependent, is_hidden, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::date, $6, $7, $8, false, NOW())`,
        tenant.id,
        emp.id,
        row.fullName,
        row.relation,
        row.birth,
        row.gender,
        row.workplace || null,
        row.dependent,
      );
    }
  }

  const n = await prisma.employeeRelative.count({ where: { tenantId: tenant.id } });
  console.log(`relatives seeded: ${n} for ${employees.length} employees`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
