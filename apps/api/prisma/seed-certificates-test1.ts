/**
 * Seed certificate test data for employee "test1".
 * Run: npx ts-node prisma/seed-certificates-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { tabNumber: { equals: 'test1', mode: 'insensitive' } },
    select: { id: true, tenantId: true, tabNumber: true, firstName: true, lastName: true },
  });
  if (!emp) {
    throw new Error('Employee test1 not found. Run seed-family-test1.ts first.');
  }

  await prisma.employeeCertificate.deleteMany({
    where: { tenantId: emp.tenantId, employeeId: emp.id },
  });

  const items = [
    {
      certType: 'С места работы',
      certNumber: 'SPR-2025-001',
      certDate: new Date('2025-03-10'),
      validFrom: new Date('2025-03-10'),
      validUntil: new Date('2025-06-10'),
      title: 'Справка для банка (ипотека)',
    },
    {
      certType: 'О зарплате',
      certNumber: 'SPR-2025-014',
      certDate: new Date('2025-08-01'),
      validFrom: new Date('2025-08-01'),
      validUntil: new Date('2025-11-01'),
      title: 'Справка о доходах за 6 месяцев',
    },
  ];

  for (const item of items) {
    await prisma.employeeCertificate.create({
      data: { tenantId: emp.tenantId, employeeId: emp.id, ...item },
    });
  }

  console.log('Certificate test data added for test1:', emp.id);
  console.log('Records:', items.length);
  console.log('Open: /employees/' + emp.id + ' → Дополнительно → Справки');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
