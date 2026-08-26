/**
 * Import live Verifix dump (data/verifix-dump/live/*.json) into local HR Hub.
 *
 * Matches Excel-imported employees by staff/robot code (externalId verifix:{robot_id}
 * and padded tab). Adds dismissed staff, devices, locations, and August punches.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
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
  const raw = JSON.parse(fs.readFileSync(path.join(DUMP, name), 'utf8'));
  return Array.isArray(raw) ? raw : raw.rows || [];
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
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

function dmyTime(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

function padTab(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(10, '0');
}

function genderOf(code, name) {
  const c = String(code || '').toUpperCase();
  if (c === 'F') return 'f';
  if (c === 'M') return 'm';
  const v = String(name || '').toLowerCase();
  if (v.startsWith('жен')) return 'f';
  if (v.startsWith('муж')) return 'm';
  return null;
}

function scheduleMeta(name) {
  const n = String(name || '');
  const m = n.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const start = m ? m[1].padStart(5, '0') : '09:00';
  const end = m ? m[2].padStart(5, '0') : '18:00';
  const five = /5\/2|ПН-ПТ|пн-пт/i.test(n);
  return { start, end, pat: five ? '5/2' : '6/1' };
}

function empStatus(row) {
  const s = String(row.status || '');
  if (s === 'D') return 'dismissed';
  if (s === 'U') return 'leave';
  return 'active';
}

function punchDir(row) {
  const t = String(row.modified_track_type || row.original_type || '');
  if (t === 'I') return 'IN';
  if (t === 'O') return 'OUT';
  return 'AUTO';
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
  const employeesDump = readDump('employees.json').sort((a, b) => {
    const rank = (s) => (s === 'W' ? 0 : s === 'U' ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  const robotsDump = readDump('robots.json');
  const schedulesDump = readDump('schedules.json');
  const locationsDump = readDump('locations.json');
  const devicesDump = readDump('devices.json');
  const tracksDump = readDump('tracks.json');

  if (!employeesDump.length) throw new Error('live/employees.json yo‘q yoki bo‘sh');

  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant topilmadi — avval db:seed');

  const hq =
    (await prisma.division.findFirst({ where: { tenantId: tenant.id, code: 'HQ' } })) ||
    (await prisma.division.findFirst({ where: { tenantId: tenant.id, parentId: null } }));

  const scheduleNames = [
    ...new Set(
      [
        ...employeesDump.map((e) => e.schedule_name),
        ...robotsDump.map((r) => r.schedule_name),
        ...schedulesDump.map((s) => s.name),
      ].filter(Boolean),
    ),
  ];
  const schedByName = {};
  const existingSchedCodes = new Set(
    (await prisma.workSchedule.findMany({ where: { tenantId: tenant.id }, select: { code: true } })).map(
      (s) => s.code,
    ),
  );
  for (const name of scheduleNames) {
    const meta = scheduleMeta(name);
    const found = await prisma.workSchedule.findFirst({ where: { tenantId: tenant.id, name } });
    if (found) {
      schedByName[name] = found;
      continue;
    }
    const code = await uniqueCode(existingSchedCodes, slug(name).slice(0, 12) || 'SCH');
    schedByName[name] = await prisma.workSchedule.create({
      data: {
        tenantId: tenant.id,
        code,
        name,
        startTime: meta.start,
        endTime: meta.end,
        settings: { weekPattern: meta.pat, dayNormHours: 8, source: 'verifix-live' },
      },
    });
  }
  console.log('schedules', Object.keys(schedByName).length);

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
  const divCodes = new Set(existingDivs.map((d) => d.code));
  const allDivNames = [
    ...new Set(
      [
        ...employeesDump.map((e) => e.division_name),
        ...robotsDump.map((r) => r.division_name),
      ].filter(Boolean),
    ),
  ];
  for (const name of allDivNames) {
    if (divByName[name]) continue;
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
  console.log('divisions', Object.keys(divByName).length);

  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));
  const posCodes = new Set(existingPos.map((p) => p.code));
  const allPosNames = [
    ...new Set(
      [...employeesDump.map((e) => e.job_name), ...robotsDump.map((r) => r.job_name)].filter(Boolean),
    ),
  ];
  for (const name of allPosNames) {
    if (posByName[name]) continue;
    posByName[name] = await prisma.position.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueCode(posCodes, slug(name)),
        name,
        isActive: true,
      },
    });
  }
  console.log('positions', Object.keys(posByName).length);

  const reasonNames = [
    ...new Set(employeesDump.map((e) => e.dismissal_reason_name).filter(Boolean)),
  ];
  const reasonByName = {};
  const existingReasons = await prisma.dismissalReason.findMany({ where: { tenantId: tenant.id } });
  const reasonCodes = new Set(existingReasons.map((r) => r.code));
  for (const r of existingReasons) reasonByName[r.name] = r;
  for (const name of reasonNames) {
    if (reasonByName[name]) continue;
    reasonByName[name] = await prisma.dismissalReason.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueCode(reasonCodes, slug(name).slice(0, 20) || 'DR'),
        name,
        isActive: true,
      },
    });
  }

  const existingSps = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, code: true },
  });
  const spByCode = new Map(existingSps.map((s) => [s.code, s]));
  for (const r of robotsDump) {
    const code = String(r.robot_id || r.code || '').trim();
    if (!code) continue;
    const occupied = Boolean(String(r.employee_ids || '').trim());
    const spData = {
      title: r.name || `${r.job_name}/${r.division_name}`,
      divisionId: divByName[r.division_name]?.id || null,
      positionId: posByName[r.job_name]?.id || null,
      scheduleId: schedByName[r.schedule_name]?.id || null,
      status: occupied ? 'occupied' : 'vacant',
      isActive: !r.closed_date,
      headcount: 1,
    };
    const sp = spByCode.get(code);
    if (sp) {
      await prisma.staffPosition.update({ where: { id: sp.id }, data: spData });
    } else {
      const created = await prisma.staffPosition.create({
        data: { tenantId: tenant.id, code, ...spData },
      });
      spByCode.set(code, created);
    }
  }
  console.log('robots/staff', robotsDump.length);

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
      externalId: true,
    },
  });
  const empByFio = new Map();
  const empByTab = new Map();
  const empByExt = new Map();
  for (const e of existingEmps) {
    const fio = normName(`${e.lastName} ${e.firstName} ${e.middleName || ''}`);
    if (!empByFio.has(fio)) empByFio.set(fio, e);
    empByTab.set(e.tabNumber, e);
    if (e.externalId) empByExt.set(e.externalId, e);
  }

  function dropEmpIndexes(emp) {
    if (!emp?.id) return;
    for (const [k, v] of empByExt) {
      if (v.id === emp.id) empByExt.delete(k);
    }
    for (const [k, v] of empByTab) {
      if (v.id === emp.id) empByTab.delete(k);
    }
    for (const [k, v] of empByFio) {
      if (v.id === emp.id) empByFio.delete(k);
    }
  }

  function indexEmp(emp, r, _robotId, fio) {
    dropEmpIndexes(emp);
    empByFio.set(fio, emp);
    empByTab.set(emp.tabNumber, emp);
    if (emp.externalId) empByExt.set(emp.externalId, emp);
    if (r?.employee_id) empByExt.set(`verifix:${r.employee_id}`, emp);
  }

  let createdEmps = 0;
  let updatedEmps = 0;

  for (let i = 0; i < employeesDump.length; i += 1) {
    const r = employeesDump[i];
    const nm = {
      lastName: r.last_name || splitName(r.name).lastName,
      firstName: r.first_name || splitName(r.name).firstName,
      middleName: r.middle_name || splitName(r.name).middleName,
    };
    const fio = normName(r.name || `${nm.lastName} ${nm.firstName} ${nm.middleName || ''}`);
    const robotId = String(r.robot_id || '').trim();
    const empNo = padTab(r.employee_number);
    const robotTab = padTab(robotId);
    const division = divByName[r.division_name] || null;
    const position = posByName[r.job_name] || null;
    const schedule = schedByName[r.schedule_name] || null;
    const hiredAt = dmy(r.hiring_date);
    const dismissedAt = dmy(r.dismissal_date);
    const birthDate = dmy(r.birthday);
    const wageRaw = String(r.wage || '').replace(/\s/g, '').replace(',', '.');
    const salary =
      wageRaw && wageRaw !== '-1' && !Number.isNaN(Number(wageRaw))
        ? new Prisma.Decimal(wageRaw)
        : undefined;
    const sp = (robotId && spByCode.get(robotId)) || null;
    const gph = /гпх|gph|граждан/i.test(String(r.employment_type_name || ''));

    let emp = empByExt.get(`verifix:${r.employee_id}`) || null;
    if (emp && emp.externalId && emp.externalId !== `verifix:${r.employee_id}` && r.status !== 'W') {
      emp = null;
    }
    if (!emp && r.status === 'W') {
      emp =
        (robotTab && empByTab.get(robotTab)) ||
        (empNo && empByTab.get(empNo)) ||
        empByFio.get(fio) ||
        null;
    }

    const personFields = {
      firstName: nm.firstName,
      lastName: nm.lastName,
      middleName: nm.middleName,
      birthDate,
      gender: genderOf(r.gender, r.gender_name),
      pinfl: r.npin || null,
      passport: r.passport_info || null,
      inn: r.tin || null,
      phone: r.main_phone || null,
      email: r.email || null,
      addressResidence: r.address || null,
      addressRegistration: r.legal_address || null,
      isActive: r.status !== 'D',
    };

    let personId = emp?.personId || null;
    if (personId) {
      await prisma.person.update({ where: { id: personId }, data: personFields });
    } else {
      const person = await prisma.person.create({ data: { tenantId: tenant.id, ...personFields } });
      personId = person.id;
    }

    if (r.passport_info) {
      const hasDoc = await prisma.personDocument.findFirst({
        where: { personId, docType: 'PASSPORT' },
      });
      if (hasDoc) {
        await prisma.personDocument.update({
          where: { id: hasDoc.id },
          data: { docNumber: r.passport_info },
        });
      } else {
        await prisma.personDocument.create({
          data: {
            tenantId: tenant.id,
            personId,
            docType: 'PASSPORT',
            docNumber: r.passport_info,
          },
        });
      }
    }

    const empData = {
      lastName: nm.lastName,
      firstName: nm.firstName,
      middleName: nm.middleName,
      phone: r.main_phone || null,
      email: r.email || null,
      status: empStatus(r),
      employmentType: gph ? 'gph' : 'staff',
      hiredAt,
      dismissedAt,
      dismissalReasonId: reasonByName[r.dismissal_reason_name]?.id || null,
      ...(salary ? { baseSalary: salary } : {}),
      personId,
      divisionId: division?.id || null,
      positionId: position?.id || null,
      staffPositionId: sp?.id || emp?.staffPositionId || null,
      scheduleId: schedule?.id || null,
      externalId: `verifix:${r.employee_id}`,
    };

    if (emp) {
      emp = await prisma.employee.update({ where: { id: emp.id }, data: empData });
      updatedEmps += 1;
    } else {
      let tab = empNo || robotTab || `VF${r.employee_id}`;
      if (empByTab.has(tab)) tab = `VF${r.employee_id}`;
      emp = await prisma.employee.create({
        data: { tenantId: tenant.id, tabNumber: tab, ...empData },
      });
      createdEmps += 1;
      empByTab.set(tab, emp);
    }
    indexEmp(emp, r, robotId, fio);

    if ((i + 1) % 200 === 0) {
      console.log(`employees ${i + 1}/${employeesDump.length}`);
    }
  }
  console.log('employees updated', updatedEmps, 'created', createdEmps);

  const occupiedSp = new Set();
  const liveEmps = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active', staffPositionId: { not: null } },
    select: { staffPositionId: true },
  });
  for (const e of liveEmps) occupiedSp.add(e.staffPositionId);
  const allSps = await prisma.staffPosition.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  for (const sp of allSps) {
    const next = occupiedSp.has(sp.id) ? 'occupied' : 'vacant';
    if (sp.status !== next) {
      await prisma.staffPosition.update({ where: { id: sp.id }, data: { status: next } });
    }
  }

  const locByName = {};
  const locCodes = new Set(
    (await prisma.location.findMany({ where: { tenantId: tenant.id }, select: { code: true } })).map(
      (l) => l.code,
    ),
  );
  const existingLocs = await prisma.location.findMany({ where: { tenantId: tenant.id } });
  for (const l of existingLocs) locByName[l.name] = l;
  for (const r of locationsDump) {
    const name = r.name || `loc-${r.location_id}`;
    let lat = null;
    let lng = null;
    const ll = String(r.latlng || '').split(',');
    if (ll.length === 2) {
      lat = Number(ll[0]);
      lng = Number(ll[1]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        lat = null;
        lng = null;
      }
    }
    const payload = {
      name,
      address: r.address || null,
      latitude: lat,
      longitude: lng,
      timezone: r.timezone_name || 'Asia/Tashkent',
      isActive: true,
      meta: { verifixLocationId: r.location_id, region: r.region_name, type: r.location_type_name },
    };
    if (locByName[name]) {
      locByName[name] = await prisma.location.update({
        where: { id: locByName[name].id },
        data: payload,
      });
    } else {
      const created = await prisma.location.create({
        data: {
          tenantId: tenant.id,
          code: await uniqueCode(locCodes, (r.code || `L${r.location_id}`).slice(0, 36)),
          ...payload,
        },
      });
      locByName[name] = created;
    }
  }
  console.log('locations', locationsDump.length);

  const deviceBySerial = new Map(
    (
      await prisma.device.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, serialNumber: true, name: true },
      })
    ).map((d) => [d.serialNumber, d]),
  );
  const deviceByVfId = new Map();
  for (const r of devicesDump) {
    const serial = String(r.serial_number || '').trim() || `vf-device-${r.device_id}`;
    const adapterType = /hik/i.test(String(r.device_type_name || '')) ? 'hikvision' : 'mock';
    const payload = {
      name: r.name || serial,
      model: r.device_type_name || null,
      adapterType,
      status: r.status === 'O' || /онлайн|online/i.test(String(r.status_name || '')) ? 'online' : 'offline',
      isActive: r.state !== 'P',
      locationId: locByName[r.location_name]?.id || null,
      meta: {
        verifixDeviceId: r.device_id,
        deviceTypeId: r.device_type_id,
        ready: r.ready,
        statusName: r.status_name,
      },
    };
    let device = deviceBySerial.get(serial);
    if (device) {
      device = await prisma.device.update({ where: { id: device.id }, data: payload });
    } else {
      device = await prisma.device.create({
        data: { tenantId: tenant.id, serialNumber: serial, ...payload },
      });
      deviceBySerial.set(serial, device);
    }
    deviceByVfId.set(String(r.device_id), device);
  }
  console.log('devices', devicesDump.length);

  const empByVfId = new Map();
  for (const [k, e] of empByExt) {
    const m = String(k).match(/^verifix:(\d+)$/);
    if (m) empByVfId.set(m[1], e);
  }
  for (const r of employeesDump) {
    const e = empByExt.get(`verifix:${r.employee_id}`);
    if (e) empByVfId.set(String(r.employee_id), e);
  }

  const existingMarks = await prisma.attendanceMark.findMany({
    where: { tenantId: tenant.id, source: 'verifix' },
    select: { employeeExternalId: true, occurredAt: true },
  });
  const seenMark = new Set(
    existingMarks.map((m) => `${m.employeeExternalId}|${m.occurredAt.toISOString()}`),
  );

  let marksCreated = 0;
  let marksSkip = 0;
  const batch = [];
  async function flushMarks() {
    if (!batch.length) return;
    await prisma.attendanceMark.createMany({ data: batch });
    marksCreated += batch.length;
    batch.length = 0;
  }

  for (const t of tracksDump) {
    const occurredAt = dmyTime(t.track_time);
    if (!occurredAt) {
      marksSkip += 1;
      continue;
    }
    const vfEmp = String(t.person_id || '');
    const key = `verifix:${vfEmp}|${occurredAt.toISOString()}`;
    if (seenMark.has(key)) {
      marksSkip += 1;
      continue;
    }
    seenMark.add(key);
    const emp = empByVfId.get(vfEmp) || empByFio.get(normName(t.person_name));
    const device = deviceByVfId.get(String(t.device_id || '')) || null;
    batch.push({
      tenantId: tenant.id,
      employeeId: emp?.id || null,
      deviceId: device?.id || null,
      employeeExternalId: vfEmp ? `verifix:${vfEmp}` : null,
      direction: punchDir(t),
      occurredAt,
      source: 'verifix',
      rawPayload: {
        trackId: t.track_id,
        trackDate: t.track_date,
        type: t.track_type_name,
        markType: t.mark_type_name,
        location: t.location_name,
        device: t.device_name,
        valid: t.is_valid,
      },
    });
    if (batch.length >= 500) await flushMarks();
  }
  await flushMarks();
  console.log('tracks created', marksCreated, 'skipped', marksSkip);

  const summary = {
    employeesUpdated: updatedEmps,
    employeesCreated: createdEmps,
    employeesTotal: employeesDump.length,
    robots: robotsDump.length,
    locations: locationsDump.length,
    devices: devicesDump.length,
    tracksCreated: marksCreated,
    tracksSkipped: marksSkip,
    tracksDump: tracksDump.length,
  };
  fs.writeFileSync(
    path.join(DUMP, 'import-live-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  );
  console.log('DONE', JSON.stringify(summary));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
