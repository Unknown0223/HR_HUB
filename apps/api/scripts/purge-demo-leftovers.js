/**
 * Remove seed/demo leftovers. Keep only Verifix-imported employees (externalId verifix:*).
 * Keeps tenant login admin@demo.local.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const prisma = new PrismaClient();

const KEEP_USERS = new Set(['admin@demo.local', 'platform@hrhub.local']);
const SEED_LOCATION_CODES = [
  'AND1',
  'AND2',
  'BUX1',
  'BUX2',
  'FER1',
  'GPS-TEST',
  'JIZ1',
  'NAM1',
  'NAV1',
  'NUK1',
  'OFFICE1',
  'QAR1',
  'SAM1',
  'TER1',
];
const SEED_SCHEDULE_CODES = ['STD', '5-2', 'NIGHT', 'ZZZZ'];
const SEED_DIVISION_CODES = ['IT', 'OPS', 'TMP-UI'];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant yo‘q');

  const demoEmps = await prisma.employee.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'verifix:' } } }],
    },
    select: { id: true, lastName: true, firstName: true, tabNumber: true, externalId: true },
  });
  const demoIds = demoEmps.map((e) => e.id);
  console.log(
    'demo employees',
    demoEmps.length,
    demoEmps.map((e) => `${e.lastName} ${e.firstName} (${e.tabNumber})`).join('; '),
  );

  const marksGone = await prisma.attendanceMark.deleteMany({
    where: { tenantId: tenant.id, NOT: { source: 'verifix' } },
  });
  console.log('non-verifix marks', marksGone.count);

  if (demoIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: demoIds } } });
  }
  console.log('deleted employees', demoIds.length);

  const demoDevices = await prisma.device.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, serialNumber: true, name: true, meta: true },
  });
  const dropDeviceIds = demoDevices
    .filter((d) => !d.meta || d.meta.verifixDeviceId == null)
    .map((d) => d.id);
  if (dropDeviceIds.length) {
    await prisma.device.deleteMany({ where: { id: { in: dropDeviceIds } } });
  }
  console.log('demo devices', dropDeviceIds.length);

  const locGone = await prisma.location.deleteMany({
    where: { tenantId: tenant.id, code: { in: SEED_LOCATION_CODES } },
  });
  console.log('seed locations', locGone.count);

  for (const code of SEED_SCHEDULE_CODES) {
    const sch = await prisma.workSchedule.findFirst({
      where: { tenantId: tenant.id, code },
      select: { id: true, _count: { select: { employees: true } } },
    });
    if (sch && sch._count.employees === 0) {
      await prisma.positionSchedule.deleteMany({ where: { scheduleId: sch.id } });
      await prisma.scheduleShift.deleteMany({ where: { scheduleId: sch.id } }).catch(() => {});
      try {
        await prisma.workSchedule.delete({ where: { id: sch.id } });
        console.log('seed schedule', code);
      } catch (err) {
        console.log('keep schedule', code, err.meta?.constraint || err.message);
      }
    }
  }

  for (const code of SEED_DIVISION_CODES) {
    const div = await prisma.division.findFirst({
      where: { tenantId: tenant.id, code },
      select: { id: true, _count: { select: { employees: true, children: true } } },
    });
    if (div && div._count.employees === 0 && div._count.children === 0) {
      await prisma.division.delete({ where: { id: div.id } });
      console.log('seed division', code);
    }
  }

  const usersGone = await prisma.user.deleteMany({
    where: { email: { notIn: [...KEEP_USERS] } },
  });
  console.log('demo users', usersGone.count);

  const orphans = await prisma.$queryRaw`
    SELECT p.id FROM persons p
    WHERE p.tenant_id = ${tenant.id}::uuid
      AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.person_id = p.id)
  `;
  if (orphans.length) {
    await prisma.person.deleteMany({ where: { id: { in: orphans.map((p) => p.id) } } });
  }
  console.log('orphan persons', orphans.length);

  const left = await prisma.employee.groupBy({
    by: ['status'],
    where: { tenantId: tenant.id },
    _count: true,
  });
  console.log('employees left', left);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
