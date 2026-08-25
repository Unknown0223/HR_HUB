const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vacancy-report-rows.json'), 'utf8'));

function dmy(s) {
  const [d, m, y] = String(s || '')
    .split('.')
    .map(Number);
  if (!y || !m || !d) return new Date(Date.UTC(2026, 0, 1));
  return new Date(Date.UTC(y, m - 1, d));
}

const SLUG_MAP = {
  Логистика: 'LOGISTIKA',
  Продажи: 'PRODAZHI',
  Офис: 'OFIS',
  Маркетинг: 'MARKETING-G',
  Хозяйство: 'HOZ',
};

function slug(name) {
  if (SLUG_MAP[name]) return SLUG_MAP[name];
  const s = String(name)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
    .toUpperCase();
  return s || `N${Buffer.from(String(name)).toString('hex').slice(0, 10).toUpperCase()}`;
}

const PARENT_OF = {
  AXO: 'ADMIN',
  BUXGALTERIA: 'ADMIN',
  'DEPARTAMENT PRODAJ': 'HR',
  MARKETING: 'HR',
  'OTDEL SVYAZI I KACHESTVA': 'HR',
  IT: 'HR',
  'FINANSOWY OTDEL': 'HR',
};

const POS_GROUP_OF = {
  DOSTAVSHIK: 'Логистика',
  'STARSHIY DOSTAVSHIK': 'Логистика',
  EKSPEDITOR: 'Логистика',
  'SVR LOGISTIKA': 'Логистика',
  KLADOVSHIK: 'Логистика',
  ZAVSKLAD: 'Логистика',
  ANALITIK: 'Офис',
  'FINANSOVIY ANALITIK': 'Офис',
  'BIZNES TRENER': 'Офис',
  AUDITOR: 'Офис',
  SMM: 'Маркетинг',
  MARKETOLOG: 'Маркетинг',
  'REKLAMA MONTAJ': 'Маркетинг',
  FARROSH: 'Хозяйство',
};

const EXTRA_POSITIONS = ['AUDIT OPERATOR', 'BIZNES ANALITIK', 'BUXGALTER', 'CEO'];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  async function ensureDivisionGroup(code, name) {
    return prisma.divisionGroup.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name, isActive: true },
      create: { tenantId: tenant.id, code, name, isActive: true },
    });
  }

  const dgOptom = await ensureDivisionGroup('OPTOM_MIX', 'ОПТОМ MIX');
  await ensureDivisionGroup('TOP', 'TOP');
  await ensureDivisionGroup('TASHKENT', 'Ташкент');

  const pgByName = {};
  for (const name of ['Логистика', 'Продажи', 'Офис', 'Маркетинг', 'Хозяйство']) {
    const code = slug(name);
    pgByName[name] = await prisma.positionGroup.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name, isActive: true },
      create: { tenantId: tenant.id, code, name, isActive: true },
    });
  }

  const extraDivs = ['BUXGALTERIA', 'IT', 'FINANSOWY OTDEL'];
  const names = [...new Set(['HR', 'ADMIN', ...ROWS.map((r) => r.division), ...extraDivs].filter(Boolean))];

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));

  async function uniqueDivCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.division.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }

  for (const name of names) {
    if (divByName[name]) continue;
    const parentName = PARENT_OF[name];
    const parentId = (parentName && divByName[parentName]?.id) || divByName.HR?.id || null;
    const created = await prisma.division.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueDivCode(slug(name)),
        name,
        parentId,
        isActive: true,
        divisionGroupId: name === 'DEPARTAMENT PRODAJ' ? dgOptom.id : undefined,
      },
    });
    divByName[name] = created;
  }

  if (divByName['DEPARTAMENT PRODAJ']) {
    await prisma.division.update({
      where: { id: divByName['DEPARTAMENT PRODAJ'].id },
      data: { divisionGroupId: dgOptom.id },
    });
  }

  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));

  async function uniquePosCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.position.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }

  const posNames = [...new Set([...ROWS.map((r) => r.position), ...EXTRA_POSITIONS].filter(Boolean))];
  for (const name of posNames) {
    const pgName = POS_GROUP_OF[name] || 'Продажи';
    const groupId = pgByName[pgName].id;
    if (posByName[name]) {
      await prisma.position.update({
        where: { id: posByName[name].id },
        data: { positionGroupId: groupId, isActive: true },
      });
      continue;
    }
    const created = await prisma.position.create({
      data: {
        tenantId: tenant.id,
        code: await uniquePosCode(slug(name)),
        name,
        isActive: true,
        positionGroupId: groupId,
      },
    });
    posByName[name] = created;
  }

  let n = 0;
  for (const r of ROWS) {
    const div = divByName[r.division];
    const pos = posByName[r.position];
    if (r.divGroup === 'ОПТОМ MIX' && div && div.divisionGroupId !== dgOptom.id) {
      await prisma.division.update({
        where: { id: div.id },
        data: { divisionGroupId: dgOptom.id },
      });
      div.divisionGroupId = dgOptom.id;
    }
    await prisma.staffPosition.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: String(r.code) } },
      update: {
        title: r.title,
        groupName: r.staffGroup || null,
        status: 'vacant',
        isActive: true,
        closedAt: null,
        openedAt: dmy(r.vacantFrom),
        headcount: 1,
        divisionId: div?.id || null,
        positionId: pos?.id || null,
      },
      create: {
        tenantId: tenant.id,
        code: String(r.code),
        title: r.title,
        groupName: r.staffGroup || null,
        status: 'vacant',
        isActive: true,
        openedAt: dmy(r.vacantFrom),
        headcount: 1,
        divisionId: div?.id || undefined,
        positionId: pos?.id || undefined,
      },
    });
    n += 1;
  }

  console.log(`upserted ${n} vacant staff positions`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
