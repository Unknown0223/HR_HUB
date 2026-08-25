/**
 * Seed user settings for test1 (Настройки пользователя).
 * Run: npx ts-node prisma/seed-settings-test1.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
    `SELECT id, tenant_id FROM employees WHERE lower(tab_number) = 'test1' LIMIT 1`,
  );
  if (!emp[0]) throw new Error('Employee test1 not found');

  const existing = await prisma.hrDocument.findFirst({
    where: {
      tenantId: emp[0].tenant_id,
      employeeId: emp[0].id,
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

  const userSettings = {
    login: 'test1',
    roles: ['Сотрудник'],
    systemAccess: true,
    accessAllEmployees: true,
    accessAllOrgEmployees: false,
    fullEfficiencyAccess: true,
    marksEnabled: true,
    marks: {
      autoDetectType: true,
      arrival: true,
      departure: true,
      mark: true,
      breakStart: true,
      breakEnd: true,
      stageGps: true,
      stageFace: true,
      emotionEyes: true,
      emotionSmile: true,
    },
    gpsEnabled: true,
    gps: {
      trackLocation: true,
      autoLeaveByGps: false,
      trackByArrivalDeparture: false,
      quality: 'high',
    },
    photoUploadEnabled: true,
    photoUpload: { allowUpload: false },
    absenceReqEnabled: true,
    absenceReq: { allow: true, changeStateOnConfirm: false },
    scheduleChangeEnabled: true,
    scheduleChange: {
      allow: true,
      allowDayExchange: true,
      changeStateOnConfirm: false,
    },
    markReqEnabled: true,
    markReq: { allow: true },
    dismissReqEnabled: true,
    dismissReq: { allow: true },
    locationReqEnabled: true,
    locationReq: { allow: true },
    overtimeReqEnabled: true,
    overtimeReq: { allow: true },
    vacationReqEnabled: true,
    vacationReq: { allow: true },
    scheduleLimitEnabled: true,
    scheduleLimit: { timeLimit: false, monthlyLimit: false },
    salaryShowEnabled: true,
    salaryShow: { show: true },
    markLimitEnabled: true,
    markLimit: { monthlyLimit: false },
  };

  const next = {
    ...prev,
    kind: 'profile_extras',
    userSettings,
  };

  if (existing) {
    await prisma.hrDocument.update({
      where: { id: existing.id },
      data: { payload: next },
    });
  } else {
    await prisma.hrDocument.create({
      data: {
        tenantId: emp[0].tenant_id,
        employeeId: emp[0].id,
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

  console.log('User settings seeded for test1:', emp[0].id);
  console.log(
    'Open: /employees/' + emp[0].id + ' → Дополнительно → Настройки',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
