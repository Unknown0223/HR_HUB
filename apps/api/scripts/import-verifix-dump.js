/**
 * Import gathered Verifix dump (data/verifix-dump/*.json) into HR Hub.
 *
 * DATABASE_URL defaults to local docker postgres (root .env). Override to hit Railway.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DUMP = path.join(ROOT, 'data', 'verifix-dump');

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
// Prefer local root .env (docker :5430). apps/api/.env may still point at Railway internal.
loadEnvFile(path.join(ROOT, '.env'));

const prisma = new PrismaClient();

const REGIONS = [
  { code: 'AND', name: 'Андижанская область' },
  { code: 'XOR', name: 'Хорезмская область' },
  { code: 'QSH', name: 'Кашкадарьинская область' },
  { code: 'SAM', name: 'Самаркандская область' },
  { code: 'TAS', name: 'г. Ташкент' },
  { code: 'BUX', name: 'Бухарская область' },
  { code: 'FER', name: 'Ферганская область' },
  { code: 'NAM', name: 'Наманганская область' },
  { code: 'NAV', name: 'Навоийская область' },
  { code: 'SYR', name: 'Сырдарьинская область' },
  { code: 'JIZ', name: 'Джизакская область' },
  { code: 'SUR', name: 'Сурхандарьинская область' },
  { code: 'QQR', name: 'Республика Каракалпакстан' },
  { code: 'TASO', name: 'Ташкентская область' },
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DUMP, name), 'utf8'));
}

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

function normName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ')
    .trim();
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

function tabFromStaff(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(10, '0');
}

function genderOf(s) {
  const v = String(s || '').toLowerCase();
  if (v.startsWith('жен')) return 'f';
  if (v.startsWith('муж')) return 'm';
  return v || null;
}

function scheduleMeta(name) {
  const n = String(name || '');
  const m = n.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const start = m ? m[1].padStart(5, '0') : '09:00';
  const end = m ? m[2].padStart(5, '0') : '18:00';
  const five = /5\/2|ПН-ПТ|пн-пт/i.test(n);
  return { start, end, pat: five ? '5/2' : '6/1' };
}

async function uniqueCode(existing, base) {
  let code = base.slice(0, 36) || 'X';
  let n = 0;
  while (existing.has(code)) {
    n += 1;
    code = `${base.slice(0, 32)}-${n}`;
  }
  existing.add(code);
  return code;
}

(async () => {
  if (!fs.existsSync(path.join(DUMP, 'employees.json'))) {
    throw new Error('Dump yo‘q. Avval: python scripts/verifix-gather.py');
  }

  const employeesDump = readJson('employees.json');
  const vacanciesDump = readJson('vacancies.json');
  const candidatesDump = readJson('candidates.json');
  const occupancy = readJson('occupancy.json');
  const schedulePlan = readJson('schedules.json');

  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant topilmadi — avval db:seed');

  const regionsDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'regions' } },
    update: { name: 'Регионы', kind: 'admin' },
    create: { tenantId: tenant.id, code: 'regions', name: 'Регионы', kind: 'admin' },
  });
  for (let i = 0; i < REGIONS.length; i += 1) {
    await prisma.dictionaryItem.upsert({
      where: { dictionaryId_code: { dictionaryId: regionsDict.id, code: REGIONS[i].code } },
      update: { name: REGIONS[i].name, isActive: true },
      create: {
        dictionaryId: regionsDict.id,
        code: REGIONS[i].code,
        name: REGIONS[i].name,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }
  const regionItems = await prisma.dictionaryItem.findMany({ where: { dictionaryId: regionsDict.id } });
  const regionByName = Object.fromEntries(regionItems.map((r) => [r.name, r]));

  const scheduleNames = [
    ...new Set(employeesDump.map((e) => e.schedule).filter(Boolean)),
  ];
  const schedByName = {};
  const existingSchedCodes = new Set(
    (await prisma.workSchedule.findMany({ where: { tenantId: tenant.id }, select: { code: true } })).map(
      (s) => s.code,
    ),
  );
  for (const name of scheduleNames) {
    const meta = scheduleMeta(name);
    const found = await prisma.workSchedule.findFirst({
      where: { tenantId: tenant.id, name },
    });
    if (found) {
      await prisma.workSchedule.update({
        where: { id: found.id },
        data: {
          startTime: meta.start,
          endTime: meta.end,
          settings: { weekPattern: meta.pat, dayNormHours: 8, source: 'verifix' },
          isActive: true,
        },
      });
      schedByName[name] = found;
      continue;
    }
    const code = await uniqueCode(existingSchedCodes, slug(name).slice(0, 12) || 'SCH');
    const created = await prisma.workSchedule.create({
      data: {
        tenantId: tenant.id,
        code,
        name,
        startTime: meta.start,
        endTime: meta.end,
        settings: { weekPattern: meta.pat, dayNormHours: 8, source: 'verifix' },
      },
    });
    schedByName[name] = created;
  }

  const hq =
    (await prisma.division.findFirst({ where: { tenantId: tenant.id, code: 'HQ' } })) ||
    (await prisma.division.findFirst({ where: { tenantId: tenant.id, parentId: null } }));

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
  const divCodes = new Set(existingDivs.map((d) => d.code));
  const allDivNames = [
    ...new Set([
      ...employeesDump.map((e) => e.division),
      ...vacanciesDump.map((v) => v.division),
      ...schedulePlan.map((s) => s.division),
      ...(occupancy.columns || []),
    ]),
  ].filter(Boolean);
  for (const name of allDivNames) {
    if (divByName[name]) {
      await prisma.division.update({
        where: { id: divByName[name].id },
        data: { isActive: true },
      });
      continue;
    }
    const created = await prisma.division.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueCode(divCodes, slug(name)),
        name,
        parentId: hq?.id || null,
        isActive: true,
      },
    });
    divByName[name] = created;
  }

  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));
  const posCodes = new Set(existingPos.map((p) => p.code));
  const allPosNames = [
    ...new Set([
      ...employeesDump.map((e) => e.position),
      ...vacanciesDump.map((v) => v.position),
      ...schedulePlan.map((s) => s.position),
      ...(occupancy.positions || []),
    ]),
  ].filter(Boolean);
  for (const name of allPosNames) {
    if (posByName[name]) continue;
    const created = await prisma.position.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueCode(posCodes, slug(name)),
        name,
        isActive: true,
      },
    });
    posByName[name] = created;
  }

  const existingEmps = await prisma.employee.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      tabNumber: true,
      firstName: true,
      lastName: true,
      middleName: true,
      personId: true,
      staffPositionId: true,
    },
  });
  const empByFio = new Map();
  const empByTab = new Map();
  for (const e of existingEmps) {
    const fio = normName(`${e.lastName} ${e.firstName} ${e.middleName || ''}`);
    if (!empByFio.has(fio)) empByFio.set(fio, e);
    empByTab.set(e.tabNumber, e);
  }
  const existingSps = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, code: true },
  });
  const spByCode = new Map(existingSps.map((s) => [s.code, s]));

  let createdEmps = 0;
  let updatedEmps = 0;
  let hireDocs = 0;

  for (let i = 0; i < employeesDump.length; i += 1) {
    const r = employeesDump[i];
    const nm = splitName(r.fullName);
    const fio = normName(r.fullName);
    const staffCode = String(r.staffCode || '').trim();
    if (!staffCode) continue;
    const tab = tabFromStaff(staffCode);
    const division = divByName[r.division] || null;
    const position = posByName[r.position] || null;
    const schedule = schedByName[r.schedule] || null;
    const region = regionByName[r.region] || null;
    const gender = genderOf(r.gender);
    const hiredAt = dmy(r.hiredAt);
    const birthDate = dmy(r.birthDate);
    const salary = r.salary != null ? new Prisma.Decimal(r.salary) : null;

    let sp = spByCode.get(staffCode);
    const spData = {
      title: r.staffPosition || `${r.position}/${r.division}`,
      divisionId: division?.id || null,
      positionId: position?.id || null,
      scheduleId: schedule?.id || null,
      status: 'occupied',
      isActive: true,
      headcount: 1,
      groupName: r.staffGroup || undefined,
    };
    if (sp) {
      sp = await prisma.staffPosition.update({ where: { id: sp.id }, data: spData });
    } else {
      sp = await prisma.staffPosition.create({
        data: { tenantId: tenant.id, code: staffCode, ...spData },
      });
      spByCode.set(staffCode, sp);
    }

    const personFields = {
      firstName: nm.firstName,
      lastName: nm.lastName,
      middleName: nm.middleName,
      birthDate,
      gender,
      pinfl: r.pinfl || null,
      passport: r.passport || null,
      inps: r.inps || null,
      phone: r.phone || null,
      regionId: region?.id || null,
      addressResidence: r.address || null,
      isActive: true,
    };

    let emp = empByTab.get(tab) || empByFio.get(fio) || null;
    if (emp?.tabNumber?.startsWith('XLS-') && empByTab.get(tab) && empByTab.get(tab).id !== emp.id) {
      emp = empByTab.get(tab);
    }

    let personId = emp?.personId || null;
    if (personId) {
      await prisma.person.update({ where: { id: personId }, data: personFields });
    } else {
      const person = await prisma.person.create({ data: { tenantId: tenant.id, ...personFields } });
      personId = person.id;
    }

    if (r.passport) {
      const hasDoc = await prisma.personDocument.findFirst({
        where: { personId, docType: 'PASSPORT' },
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
            personId,
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
      hiredAt,
      baseSalary: salary,
      personId,
      divisionId: division?.id || null,
      positionId: position?.id || null,
      staffPositionId: sp.id,
      scheduleId: schedule?.id || null,
      regionId: region?.id || null,
      externalId: `verifix:${staffCode}`,
    };

    if (emp) {
      const patch = { ...empData };
      if (emp.tabNumber !== tab && !empByTab.has(tab)) {
        patch.tabNumber = tab;
      }
      emp = await prisma.employee.update({ where: { id: emp.id }, data: patch });
      updatedEmps += 1;
    } else {
      emp = await prisma.employee.create({
        data: { tenantId: tenant.id, tabNumber: tab, ...empData },
      });
      createdEmps += 1;
    }
    empByFio.set(fio, emp);
    empByTab.set(emp.tabNumber, emp);
    if (tab) empByTab.set(tab, emp);

    if (r.familyName && r.familyRelation) {
      const hasRel = await prisma.employeeRelative.findFirst({
        where: { employeeId: emp.id, fullName: r.familyName },
      });
      if (!hasRel) {
        await prisma.employeeRelative.create({
          data: {
            tenantId: tenant.id,
            employeeId: emp.id,
            fullName: r.familyName,
            relation: r.familyRelation,
          },
        });
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`employees ${i + 1}/${employeesDump.length}`);
    }
  }

  const hired = await prisma.employee.findMany({
    where: { tenantId: tenant.id, externalId: { startsWith: 'verifix:' } },
    select: { id: true, hiredAt: true, divisionId: true, positionId: true, tabNumber: true },
  });
  const existingHires = await prisma.hrDocument.findMany({
    where: { tenantId: tenant.id, type: 'hire', employeeId: { in: hired.map((e) => e.id) } },
    select: { employeeId: true },
  });
  const hiredSet = new Set(existingHires.map((h) => h.employeeId));
  const hireCreates = [];
  for (const emp of hired) {
    if (hiredSet.has(emp.id)) continue;
    hireCreates.push({
      tenantId: tenant.id,
      employeeId: emp.id,
      type: 'hire',
      title: 'Прием на работу',
      number: emp.tabNumber,
      documentDate: emp.hiredAt || new Date('2024-01-01'),
      status: 'posted',
      postedAt: emp.hiredAt || new Date('2024-01-01'),
      postedBy: 'verifix-import',
      payload: { divisionId: emp.divisionId, positionId: emp.positionId, source: 'verifix' },
    });
  }
  if (hireCreates.length) {
    const chunk = 200;
    for (let i = 0; i < hireCreates.length; i += chunk) {
      const part = await prisma.hrDocument.createMany({ data: hireCreates.slice(i, i + chunk) });
      hireDocs += part.count;
    }
  }

  const heldSpIds = new Set(
    (
      await prisma.employee.findMany({
        where: { tenantId: tenant.id, staffPositionId: { not: null } },
        select: { staffPositionId: true },
      })
    ).map((e) => e.staffPositionId),
  );
  let vacantUpserts = 0;
  for (const v of vacanciesDump) {
    const code = String(v.code || '').trim();
    if (!code) continue;
    const division = divByName[v.division] || null;
    const position = posByName[v.position] || null;
    const existingSp = spByCode.get(code);
    const held = !!(existingSp && heldSpIds.has(existingSp.id));
    const data = {
      title: v.title || `${v.position}/${v.division}`,
      divisionId: division?.id || null,
      positionId: position?.id || null,
      groupName: v.staffGroup || null,
      openedAt: dmy(v.vacantFrom),
      isActive: true,
      status: held ? 'occupied' : 'vacant',
      headcount: 1,
    };
    const row = existingSp
      ? await prisma.staffPosition.update({ where: { id: existingSp.id }, data })
      : await prisma.staffPosition.create({
          data: { tenantId: tenant.id, code, ...data },
        });
    spByCode.set(code, row);
    vacantUpserts += 1;
    if (held) continue;
    const existsVac = await prisma.vacancy.findFirst({
      where: { tenantId: tenant.id, staffPositionId: row.id, status: 'open' },
    });
    if (!existsVac) {
      await prisma.vacancy.create({
        data: {
          tenantId: tenant.id,
          staffPositionId: row.id,
          title: v.title || v.position,
          status: 'open',
          openedAt: dmy(v.vacantFrom) || new Date(),
        },
      });
    }
  }

  await prisma.candidate.deleteMany({
    where: { tenantId: tenant.id, note: 'verifix-import' },
  });
  let candN = 0;
  const types = ['A', 'B', 'C'];
  for (const c of candidatesDump) {
    await prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        fullName: c.fullName,
        phone: c.phone || null,
        gender: c.gender || null,
        positionName: c.positionName || null,
        introducedAt: dmy(c.introducedAt),
        birthDate: dmy(c.birthDate),
        education: c.education || null,
        employmentSource: c.employmentSource || null,
        category: c.category || null,
        languages: c.languages || null,
        personType: types[candN % 3],
        status: 'new',
        note: 'verifix-import',
      },
    });
    candN += 1;
  }

  const month = new Date(Date.UTC(2026, 7, 1));
  let schedDoc = await prisma.individualSchedule.findFirst({
    where: { tenantId: tenant.id, month, number: 'VF-PLAN-2026-08' },
  });
  if (schedDoc) {
    await prisma.individualScheduleLine.deleteMany({ where: { documentId: schedDoc.id } });
  } else {
    schedDoc = await prisma.individualSchedule.create({
      data: {
        tenantId: tenant.id,
        status: 'posted',
        kind: 'ordinary',
        documentDate: month,
        month,
        number: 'VF-PLAN-2026-08',
        note: 'Verifix план графиков август 2026',
        verified: true,
        postedAt: new Date(),
        postedBy: 'verifix-import',
        settings: { source: 'verifix', interval: 'month' },
      },
    });
  }

  let schedLines = 0;
  let schedSkip = 0;
  const lineRows = [];
  for (let i = 0; i < schedulePlan.length; i += 1) {
    const s = schedulePlan[i];
    const emp = empByFio.get(normName(s.fullName));
    if (!emp) {
      schedSkip += 1;
      continue;
    }
    lineRows.push({
      documentId: schedDoc.id,
      employeeId: emp.id,
      sortOrder: i + 1,
      days: s.days || {},
      daysCount: Object.values(s.days || {}).filter((v) => v && v !== 'В').length,
    });
  }
  const chunk = 150;
  for (let i = 0; i < lineRows.length; i += chunk) {
    await prisma.individualScheduleLine.createMany({ data: lineRows.slice(i, i + chunk) });
    schedLines += Math.min(chunk, lineRows.length - i);
  }

  const summary = {
    tenant: tenant.code,
    createdEmployees: createdEmps,
    updatedEmployees: updatedEmps,
    hireDocuments: hireDocs,
    vacancies: vacantUpserts,
    candidates: candN,
    scheduleLines: schedLines,
    scheduleUnmatched: schedSkip,
    divisions: allDivNames.length,
    positions: allPosNames.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(DUMP, 'import-summary.json'), JSON.stringify(summary, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
