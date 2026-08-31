/**
 * Wipe all attendance marks + days for demo tenant.
 * Keeps employees / devices / org structure. Fresh start for punches.
 *
 * Usage: node apps/api/scripts/purge-attendance.js
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

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant yo‘q');

  const beforeMarks = await prisma.attendanceMark.count({ where: { tenantId: tenant.id } });
  const beforeDays = await prisma.attendanceDay.count({ where: { tenantId: tenant.id } });
  const employees = await prisma.employee.count({ where: { tenantId: tenant.id } });

  const daysGone = await prisma.attendanceDay.deleteMany({ where: { tenantId: tenant.id } });
  const marksGone = await prisma.attendanceMark.deleteMany({ where: { tenantId: tenant.id } });

  console.log(
    JSON.stringify(
      {
        tenant: tenant.code,
        employeesKept: employees,
        attendanceDaysDeleted: daysGone.count,
        attendanceMarksDeleted: marksGone.count,
        before: { marks: beforeMarks, days: beforeDays },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
