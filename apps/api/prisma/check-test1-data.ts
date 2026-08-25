import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function count(sql: string, id: string) {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ c: number }>>(sql, id);
    return Number(r[0]?.c ?? 0);
  } catch (e) {
    return `ERR: ${e instanceof Error ? e.message : e}`;
  }
}

async function main() {
  const emp = await prisma.$queryRawUnsafe<Array<{ id: string; tab_number: string }>>(
    `SELECT id, tab_number FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  if (!emp[0]) {
    console.log('test1 not found');
    return;
  }
  const id = emp[0].id;
  console.log('employee', emp[0].tab_number, id);
  const tables: [string, string][] = [
    ['relatives', `SELECT count(*)::int as c FROM employee_relatives WHERE employee_id = $1::uuid`],
    ['certificates', `SELECT count(*)::int as c FROM employee_certificates WHERE employee_id = $1::uuid`],
    ['tenures', `SELECT count(*)::int as c FROM employee_tenures WHERE employee_id = $1::uuid`],
    ['workplaces', `SELECT count(*)::int as c FROM employee_workplaces WHERE employee_id = $1::uuid`],
    ['awards', `SELECT count(*)::int as c FROM employee_awards WHERE employee_id = $1::uuid`],
    ['files', `SELECT count(*)::int as c FROM employee_files WHERE employee_id = $1::uuid`],
    ['inventory', `SELECT count(*)::int as c FROM employee_inventory WHERE employee_id = $1::uuid`],
  ];
  for (const [name, sql] of tables) {
    console.log(name, await count(sql, id));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
