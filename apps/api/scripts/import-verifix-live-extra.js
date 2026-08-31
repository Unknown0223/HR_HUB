/**
 * Extra live Verifix import: absence types, dismissal reasons,
 * vacancies from vacant staff. Attendance days are NOT rebuilt from punches.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DUMP = path.join(ROOT, 'data', 'verifix-dump', 'live');

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

function readDump(name) {
  const fp = path.join(DUMP, name);
  if (!fs.existsSync(fp)) return [];
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return Array.isArray(raw) ? raw : raw.rows || [];
}

function slug(name) {
  const s = String(name)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
    .toUpperCase();
  return s || `N${Buffer.from(String(name)).toString('hex').slice(0, 10).toUpperCase()}`;
}

async function uniqueCode(existing, base) {
  let code = (base || 'X').slice(0, 36) || 'X';
  let n = 0;
  while (existing.has(code)) {
    n += 1;
    code = `${base.slice(0, 32)}-${n}`;
  }
  existing.add(code);
  return code;
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant topilmadi');

  const kinds = readDump('request_kinds.json');
  const existingTypes = await prisma.absenceType.findMany({ where: { tenantId: tenant.id } });
  const typeByName = Object.fromEntries(existingTypes.map((t) => [t.name, t]));
  const typeCodes = new Set(existingTypes.map((t) => t.code));
  let typesUpsert = 0;
  for (const k of kinds) {
    const name = k.name;
    if (!name) continue;
    const payload = {
      name,
      isActive: k.state_name !== 'Неактивный',
      allowEmployeeRequest: k.user_permitted === 'Y',
      isAnnual: k.annually_limited === 'Y',
      daysPerYear: k.annual_day_limit ? Number(k.annual_day_limit) || null : null,
      trackUnusedTime: /да/i.test(String(k.allow_unused_time_name || '')),
      description: k.time_kind_name || null,
    };
    if (typeByName[name]) {
      await prisma.absenceType.update({ where: { id: typeByName[name].id }, data: payload });
    } else {
      const created = await prisma.absenceType.create({
        data: {
          tenantId: tenant.id,
          code: await uniqueCode(typeCodes, `VF-${k.request_kind_id}`),
          ...payload,
        },
      });
      typeByName[name] = created;
    }
    typesUpsert += 1;
  }
  console.log('absence types', typesUpsert);

  const reasons = readDump('dismissal_reasons.json');
  const existingReasons = await prisma.dismissalReason.findMany({ where: { tenantId: tenant.id } });
  const reasonByName = Object.fromEntries(existingReasons.map((r) => [r.name, r]));
  const reasonCodes = new Set(existingReasons.map((r) => r.code));
  let reasonsUpsert = 0;
  for (const r of reasons) {
    const name = r.name;
    if (!name) continue;
    const payload = {
      name,
      groupName: r.dismissal_reason_group_name || null,
      basisType: r.reason_type === 'N' ? 'negative' : 'positive',
      isActive: r.state_name !== 'Неактивный',
    };
    if (reasonByName[name]) {
      await prisma.dismissalReason.update({ where: { id: reasonByName[name].id }, data: payload });
    } else {
      reasonByName[name] = await prisma.dismissalReason.create({
        data: {
          tenantId: tenant.id,
          code: await uniqueCode(reasonCodes, `VF-${r.dismissal_reason_id}`),
          ...payload,
        },
      });
    }
    reasonsUpsert += 1;
  }
  console.log('dismissal reasons', reasonsUpsert);

  const timeKinds = readDump('time_kinds.json');
  const existingKinds = await prisma.timeType.findMany({ where: { tenantId: tenant.id } });
  const kindByName = Object.fromEntries(existingKinds.map((t) => [t.name, t]));
  const kindCodes = new Set(existingKinds.map((t) => t.code));
  let kindsUpsert = 0;
  for (const k of timeKinds) {
    const name = k.name;
    if (!name) continue;
    const payload = {
      name,
      letterCode: k.letter || null,
      digitalCode: k.digital_code || k.code || null,
      color: k.color || null,
      isActive: !/неактив/i.test(String(k.state_name || '')),
      sortOrder: Number(k.order_no) || 0,
    };
    if (kindByName[name]) {
      await prisma.timeType.update({ where: { id: kindByName[name].id }, data: payload });
    } else {
      kindByName[name] = await prisma.timeType.create({
        data: {
          tenantId: tenant.id,
          code: await uniqueCode(kindCodes, k.time_kind_id ? `TK-${k.time_kind_id}` : slug(name)),
          ...payload,
        },
      });
    }
    kindsUpsert += 1;
  }
  console.log('time kinds', kindsUpsert);

  const divisionsDump = readDump('divisions.json');
  if (divisionsDump.length) {
    const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
    const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
    const divByCode = Object.fromEntries(existingDivs.map((d) => [d.code, d]));
    const divCodes = new Set(existingDivs.map((d) => d.code));
    const divByVf = {};
    const hq =
      existingDivs.find((d) => d.code === 'HQ') ||
      existingDivs.find((d) => !d.parentId) ||
      null;
    for (const r of divisionsDump) {
      const name = String(r.name || '').trim();
      const vfId = String(r.division_id || '').trim();
      if (!name) continue;
      const code = vfId ? `VF-${vfId}` : null;
      const payload = {
        name,
        isActive: !r.closed_date && !/неактив/i.test(String(r.state_name || '')),
        sortOrder: Number(r.order_no) || 0,
      };
      let found = (code && divByCode[code]) || divByName[name] || null;
      if (found) {
        found = await prisma.division.update({ where: { id: found.id }, data: payload });
      } else {
        found = await prisma.division.create({
          data: {
            tenantId: tenant.id,
            code: await uniqueCode(divCodes, code || slug(name)),
            parentId: hq?.id || null,
            ...payload,
          },
        });
        divCodes.add(found.code);
      }
      divByName[name] = found;
      divByCode[found.code] = found;
      if (vfId) divByVf[vfId] = found;
    }
    for (const r of divisionsDump) {
      const child = divByVf[String(r.division_id || '').trim()];
      const parent = divByVf[String(r.parent_id || '').trim()];
      if (!child) continue;
      const nextParent = parent?.id || hq?.id || null;
      if (child.parentId !== nextParent) {
        await prisma.division.update({
          where: { id: child.id },
          data: { parentId: nextParent },
        });
      }
    }
    console.log('divisions tree', Object.keys(divByVf).length);
  }

  const vacantSps = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id, status: 'vacant', isActive: true },
    include: { position: true, division: true },
  });
  const openVac = await prisma.vacancy.findMany({
    where: { tenantId: tenant.id, status: 'open' },
    select: { staffPositionId: true },
  });
  const hasOpen = new Set(openVac.map((v) => v.staffPositionId));
  let vacCreated = 0;
  for (const sp of vacantSps) {
    if (hasOpen.has(sp.id)) continue;
    await prisma.vacancy.create({
      data: {
        tenantId: tenant.id,
        staffPositionId: sp.id,
        title: sp.position?.name || sp.title,
        status: 'open',
        openedAt: sp.openedAt || new Date(),
        note: 'verifix-live',
      },
    });
    vacCreated += 1;
  }
  const occupiedSps = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id, status: 'occupied' },
    select: { id: true },
  });
  const occIds = occupiedSps.map((s) => s.id);
  const closed = occIds.length
    ? await prisma.vacancy.updateMany({
        where: { tenantId: tenant.id, status: 'open', staffPositionId: { in: occIds } },
        data: { status: 'filled', closedAt: new Date() },
      })
    : { count: 0 };
  console.log('vacancies created', vacCreated, 'filled occupied', closed.count);

  // Attendance days Verifix punchlaridan qurilmaydi — otmetkalar yangidan
  console.log('attendance days skip (fresh start)');

  const summary = {
    absenceTypes: typesUpsert,
    dismissalReasons: reasonsUpsert,
    vacanciesCreated: vacCreated,
    vacanciesFilled: closed.count,
    attendanceDays: 0,
    marksUsed: 0,
    timeKinds: kindsUpsert,
    divisionsTree: readDump('divisions.json').length,
  };
  fs.writeFileSync(path.join(DUMP, 'import-live-extra-summary.json'), JSON.stringify(summary, null, 2));
  console.log('DONE', JSON.stringify(summary));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
