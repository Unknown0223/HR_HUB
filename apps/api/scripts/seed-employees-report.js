const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'employee-report-rows.json'), 'utf8'));

function splitName(s) {
  const p = String(s || '')
    .trim()
    .split(/\s+/);
  return {
    lastName: p[0] || 'X',
    firstName: p[1] || 'X',
    middleName: p.slice(2).join(' ') || null,
  };
}

function slug(name) {
  const s = String(name)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
    .toUpperCase();
  return s || `N${Buffer.from(String(name)).toString('hex').slice(0, 10).toUpperCase()}`;
}

function dmy(s) {
  const [d, m, y] = String(s || '')
    .split('.')
    .map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function spCode(title) {
  const m = String(title || '').match(/\((\d+)\)/);
  return m ? `XLS-${m[1]}` : `XLS-${slug(title || 'SP').slice(0, 12)}`;
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const eduDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'edu' } },
    update: { name: 'Виды образования', kind: 'core' },
    create: { tenantId: tenant.id, code: 'edu', name: 'Виды образования', kind: 'core' },
  });
  const eduItems = [
    { code: 'HIGH', name: 'Высшее' },
    { code: 'UNFIN', name: 'Неоконченное высшее' },
    { code: 'SPEC', name: 'Среднее специальное' },
    { code: 'SEC', name: 'Среднее' },
    { code: 'PROF', name: 'Профессиональное' },
  ];
  for (let i = 0; i < eduItems.length; i += 1) {
    await prisma.dictionaryItem.upsert({
      where: { dictionaryId_code: { dictionaryId: eduDict.id, code: eduItems[i].code } },
      update: { name: eduItems[i].name, sortOrder: i + 1, isActive: true },
      create: {
        dictionaryId: eduDict.id,
        code: eduItems[i].code,
        name: eduItems[i].name,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }

  const kinDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'kinship' } },
    update: { name: 'Степени родства', kind: 'core' },
    create: { tenantId: tenant.id, code: 'kinship', name: 'Степени родства', kind: 'core' },
  });
  for (const [i, it] of [
    { code: 'SPOUSE', name: 'Супруг(а)' },
    { code: 'FATHER', name: 'Отец' },
    { code: 'MOTHER', name: 'Мать' },
    { code: 'SON', name: 'Сын' },
    { code: 'DAUGHTER', name: 'Дочь' },
  ].entries()) {
    await prisma.dictionaryItem.upsert({
      where: { dictionaryId_code: { dictionaryId: kinDict.id, code: it.code } },
      update: { name: it.name, sortOrder: i + 1, isActive: true },
      create: { dictionaryId: kinDict.id, ...it, sortOrder: i + 1, isActive: true },
    });
  }

  const regionsDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'regions' } },
    update: { name: 'Регионы', kind: 'admin' },
    create: { tenantId: tenant.id, code: 'regions', name: 'Регионы', kind: 'admin' },
  });
  const extraRegions = [
    { code: 'AND', name: 'Андижанская область' },
    { code: 'XOR', name: 'Хорезмская область' },
    { code: 'QSH', name: 'Кашкадарьинская область' },
    { code: 'SAM', name: 'Самаркандская область' },
    { code: 'TAS', name: 'г. Ташкент' },
    { code: 'BUX', name: 'Бухарская область' },
    { code: 'FER', name: 'Ферганская область' },
    { code: 'NAM', name: 'Наманганская область' },
    { code: 'NAV', name: 'Навоийская область' },
    { code: 'SUR', name: 'Сурхандарьинская область' },
    { code: 'JIZ', name: 'Джизакская область' },
    { code: 'SYR', name: 'Сырдарьинская область' },
    { code: 'QQR', name: 'Республика Каракалпакстан' },
  ];
  for (let i = 0; i < extraRegions.length; i += 1) {
    await prisma.dictionaryItem.upsert({
      where: { dictionaryId_code: { dictionaryId: regionsDict.id, code: extraRegions[i].code } },
      update: { name: extraRegions[i].name, isActive: true },
      create: {
        dictionaryId: regionsDict.id,
        code: extraRegions[i].code,
        name: extraRegions[i].name,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }
  const regionItems = await prisma.dictionaryItem.findMany({ where: { dictionaryId: regionsDict.id } });
  const regionByName = Object.fromEntries(regionItems.map((r) => [r.name, r]));

  const schedules = [
    { code: 'NEW-61', name: '09:00-18:00 (6/1) (NEW)', start: '09:00', end: '18:00', pat: '6/1' },
    { code: 'NEW-52', name: '09:00-18:00 (5/2) (NEW)', start: '09:00', end: '18:00', pat: '5/2' },
    { code: '10-18-PT', name: '10:00-18:00 (ПН-ПТ)', start: '10:00', end: '18:00', pat: '5/2' },
    { code: '10-18-SB', name: '10:00-18:00 (ПН-СБ)', start: '10:00', end: '18:00', pat: '6/1' },
    { code: '11-18-SB', name: '11:00-18:00 (ПН-СБ)', start: '11:00', end: '18:00', pat: '6/1' },
    { code: '11-20', name: '11:00-20:00', start: '11:00', end: '20:00', pat: '6/1' },
    { code: '13-18-SB', name: '13:00-18:00 (ПН-СБ)', start: '13:00', end: '18:00', pat: '6/1' },
    { code: '14-20-SB', name: '14:00-20:00 (ПН-СБ)', start: '14:00', end: '20:00', pat: '6/1' },
  ];
  const schedByName = {};
  for (const sc of schedules) {
    const row = await prisma.workSchedule.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: sc.code } },
      update: {
        name: sc.name,
        startTime: sc.start,
        endTime: sc.end,
        settings: { weekPattern: sc.pat, dayNormHours: 8 },
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        code: sc.code,
        name: sc.name,
        startTime: sc.start,
        endTime: sc.end,
        settings: { weekPattern: sc.pat, dayNormHours: 8 },
      },
    });
    schedByName[sc.name] = row;
  }

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));
  const hr = divByName.HR;

  async function uniqueDivCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.division.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }
  async function uniquePosCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.position.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }

  for (const name of [...new Set(ROWS.map((r) => r.division).filter(Boolean))]) {
    if (divByName[name]) continue;
    const created = await prisma.division.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueDivCode(slug(name)),
        name,
        parentId: hr?.id || null,
        isActive: true,
      },
    });
    divByName[name] = created;
  }
  for (const name of [...new Set(ROWS.map((r) => r.position).filter(Boolean))]) {
    if (posByName[name]) continue;
    const created = await prisma.position.create({
      data: {
        tenantId: tenant.id,
        code: await uniquePosCode(slug(name)),
        name,
        isActive: true,
      },
    });
    posByName[name] = created;
  }

  let n = 0;
  for (let i = 0; i < ROWS.length; i += 1) {
    const r = ROWS[i];
    const tab = `XLS-${String(i + 1).padStart(4, '0')}`;
    const nm = splitName(r.fullName);
    const gender = String(r.gender || '').toLowerCase().startsWith('жен') ? 'f' : 'm';
    const region = regionByName[r.region] || null;
    const schedule = schedByName[r.schedule] || schedByName['09:00-18:00 (6/1) (NEW)'];
    const division = divByName[r.division];
    const position = posByName[r.position];
    const code = spCode(r.staffPosition);
    const sp = await prisma.staffPosition.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {
        title: r.staffPosition || `${r.position}/${r.division}`,
        divisionId: division?.id || null,
        positionId: position?.id || null,
        status: 'occupied',
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        code,
        title: r.staffPosition || `${r.position}/${r.division}`,
        divisionId: division?.id || undefined,
        positionId: position?.id || undefined,
        status: 'occupied',
        headcount: 1,
        isActive: true,
      },
    });

    const existing = await prisma.employee.findUnique({
      where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: tab } },
    });
    const personFields = {
      firstName: nm.firstName,
      lastName: nm.lastName,
      middleName: nm.middleName,
      birthDate: dmy(r.birthDate),
      gender,
      pinfl: r.pinfl || null,
      passport: r.passport || null,
      inps: r.inps || null,
      phone: r.phone || null,
      regionId: region?.id || null,
      addressResidence: r.address || null,
      isActive: true,
    };
    let person;
    if (existing?.personId) {
      person = await prisma.person.update({ where: { id: existing.personId }, data: personFields });
    } else {
      person = await prisma.person.create({ data: { tenantId: tenant.id, ...personFields } });
    }
    if (r.passport) {
      const hasDoc = await prisma.personDocument.findFirst({
        where: { personId: person.id, docType: 'PASSPORT' },
      });
      if (hasDoc) {
        await prisma.personDocument.update({
          where: { id: hasDoc.id },
          data: { docNumber: r.passport, issuer: r.passportIssuer || null },
        });
      } else {
        await prisma.personDocument.create({
          data: {
            tenantId: tenant.id,
            personId: person.id,
            docType: 'PASSPORT',
            docNumber: r.passport,
            issuer: r.passportIssuer || null,
          },
        });
      }
    }

    const empData = {
      lastName: nm.lastName,
      firstName: nm.firstName,
      middleName: nm.middleName,
      phone: r.phone || null,
      status: 'active',
      employmentType: 'staff',
      hiredAt: dmy(r.hiredAt),
      baseSalary: r.salary != null ? r.salary : null,
      personId: person.id,
      divisionId: division?.id || null,
      positionId: position?.id || null,
      staffPositionId: sp.id,
      scheduleId: schedule?.id || null,
      regionId: region?.id || null,
    };
    let emp;
    if (existing) {
      emp = await prisma.employee.update({
        where: { id: existing.id },
        data: empData,
      });
    } else {
      emp = await prisma.employee.create({
        data: { tenantId: tenant.id, tabNumber: tab, ...empData },
      });
    }

    if (i < 4) {
      const hasEdu = await prisma.hrDocument.findFirst({
        where: { employeeId: emp.id, title: 'Образование: Высшее' },
      });
      if (!hasEdu) {
        await prisma.hrDocument.create({
          data: {
            tenantId: tenant.id,
            employeeId: emp.id,
            type: 'other',
            title: 'Образование: Высшее',
            documentDate: new Date(),
            payload: {
              kind: 'education',
              educationType: 'Высшее',
              institution: 'НУУз',
              specialty: 'Информатика',
              course: '',
            },
          },
        });
      }
    }
    if (i === 0) {
      await prisma.employeeRelative.deleteMany({ where: { employeeId: emp.id } });
      await prisma.employeeRelative.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          fullName: 'XAFIZOVA DILFUZA',
          relation: 'Супруг(а)',
        },
      });
    }
    n += 1;
  }

  console.log(`upserted ${n} employee-report demo employees + education types`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
