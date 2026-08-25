#!/usr/bin/env node
/**
 * Smoke: Индивидуальные графики для позиций + Verifix Excel template.
 * Usage: node scripts/smoke-position-schedules.js
 */
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:3001';
const EMAIL = process.env.EMAIL || 'admin@demo.local';
const PASSWORD = process.env.PASSWORD || 'Demo1234!';

let passed = 0;
let failed = 0;

function ok(n, d = '') {
  passed += 1;
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`);
}
function fail(n, e) {
  failed += 1;
  console.error(`  ✗ ${n} — ${e instanceof Error ? e.message : e}`);
}

async function req(p, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${p}`, { ...options, headers });
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${p} → ${res.status}: ${buf.toString('utf8').slice(0, 400)}`);
  }
  if (ct.includes('json') || buf[0] === 0x7b || buf[0] === 0x5b) {
    return JSON.parse(buf.toString('utf8') || 'null');
  }
  return buf;
}

function monthIso(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function main() {
  console.log(`\nPosition schedules + Excel smoke  (${API})\n`);

  try {
    await req('/api/health');
    ok('health');
  } catch (e) {
    fail('health', e);
    process.exit(1);
  }

  let headers;
  try {
    const login = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    headers = {
      Authorization: `Bearer ${login.accessToken}`,
      'X-Tenant-Id': login.tenant?.id || '',
    };
    ok('login');
  } catch (e) {
    fail('login', e);
    process.exit(1);
  }

  try {
    const list = await req('/api/catalog/position-schedules', { headers });
    if (!Array.isArray(list)) throw new Error('not array');
    ok('list', `${list.length} docs`);
  } catch (e) {
    fail('list', e);
  }

  try {
    const fill = await req('/api/catalog/position-schedules/fill', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        month: monthIso(),
        fillOnlyWithEmployees: true,
        dayNorm: 8,
        weekPattern: '5/2',
        kind: 'ordinary',
      }),
    });
    if (!Array.isArray(fill.lines) || !fill.lines.length) {
      throw new Error('fill returned 0 lines (need employees with positions)');
    }
    ok('fill', `${fill.lines.length} lines`);
  } catch (e) {
    fail('fill', e);
  }

  // template download
  let templateBuf;
  try {
    templateBuf = await req(
      `/api/catalog/position-schedules/template.xlsx?month=${monthIso()}`,
      { headers },
    );
    if (!(templateBuf instanceof Buffer) || templateBuf.length < 1000) {
      throw new Error(`bad template size ${templateBuf?.length}`);
    }
    // xlsx magic PK
    if (templateBuf[0] !== 0x50 || templateBuf[1] !== 0x4b) {
      throw new Error('not zip/xlsx');
    }
    ok('template.xlsx download', `${templateBuf.length} bytes`);
  } catch (e) {
    fail('template.xlsx', e);
  }

  // parse user-provided Verifix template if present
  const userTplCandidates = [
    path.join(
      process.env.USERPROFILE || '',
      'Downloads',
      'Индивидуальный-график-(создание)(04.08.2026+12_06_07).xlsx',
    ),
    path.join(
      process.env.USERPROFILE || '',
      'Downloads',
      'Индивидуальный-график-(создание)(04.08.2026+10_36_29).xlsx',
    ),
  ];
  const userTpl = userTplCandidates.find((f) => fs.existsSync(f));
  if (userTpl) {
    try {
      const fd = new FormData();
      const blob = new Blob([fs.readFileSync(userTpl)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fd.append('file', blob, path.basename(userTpl));
      const imp = await req('/api/catalog/position-schedules/import', {
        method: 'POST',
        headers: {
          Authorization: headers.Authorization,
          'X-Tenant-Id': headers['X-Tenant-Id'],
        },
        body: fd,
      });
      ok('import user Verifix xlsx', `imported=${imp.imported} shifts=${imp.shifts?.length || 0}`);
    } catch (e) {
      fail('import user Verifix xlsx', e);
    }
  } else {
    ok('user template skipped', 'file not in Downloads');
  }

  // create + post
  let docId;
  try {
    const fill = await req('/api/catalog/position-schedules/fill', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        month: monthIso(),
        fillOnlyWithEmployees: true,
        dayNorm: 8,
        weekPattern: '5/2',
        kind: 'multi_shift',
        defaultShiftCode: 'Смена 1',
      }),
    });
    const top = (fill.lines || []).slice(0, 3);
    const created = await req('/api/catalog/position-schedules', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'ordinary',
        documentDate: new Date().toISOString().slice(0, 10),
        month: monthIso(),
        number: `PS-SMOKE-${Date.now().toString(36)}`,
        note: 'position schedule smoke',
        settings: {
          fillOnlyWithEmployees: true,
          intervalType: 'first_in_first_out',
          displayMode: 'hours',
          shifts: [
            {
              code: 'Смена 1',
              startTime: '09:00',
              endTime: '18:00',
              breakYn: 'Y',
              breakStart: '13:00',
              breakEnd: '14:00',
              appearance: '08:00',
            },
          ],
        },
        lines: top.map((l, i) => ({
          positionId: l.positionId,
          staffPositionId: l.staffPositionId,
          employeeId: l.employeeId,
          sortOrder: i,
          days: l.days,
          daysCount: l.daysCount,
          hoursTotal: l.hoursTotal,
        })),
      }),
    });
    docId = created.id;
    ok('create draft', created.id.slice(0, 8));

    // re-download template for this document
    const buf = await req(
      `/api/catalog/position-schedules/template.xlsx?documentId=${docId}`,
      { headers },
    );
    if (!(buf instanceof Buffer) || buf.length < 1000) throw new Error('doc template empty');
    ok('template with document rows');

    const posted = await req(`/api/catalog/position-schedules/${docId}/post`, {
      method: 'POST',
      headers,
    });
    if (posted.status !== 'posted' || !posted.verified) throw new Error(JSON.stringify(posted.status));
    ok('post', 'verified');
  } catch (e) {
    fail('create/post flow', e);
  }

  // import generated template
  if (templateBuf) {
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([templateBuf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        'gen.xlsx',
      );
      const imp = await req('/api/catalog/position-schedules/import', {
        method: 'POST',
        headers: {
          Authorization: headers.Authorization,
          'X-Tenant-Id': headers['X-Tenant-Id'],
        },
        body: fd,
      });
      ok('import generated template', `imported=${imp.imported}`);
    } catch (e) {
      fail('import generated template', e);
    }
  }

  // schedule-overrides template still works
  try {
    const b = await req('/api/catalog/schedule-overrides/template.xlsx', { headers });
    if (!(b instanceof Buffer) || b[0] !== 0x50) throw new Error('bad');
    ok('employee schedule template.xlsx');
  } catch (e) {
    fail('employee schedule template.xlsx', e);
  }

  console.log(`\n──── result: ${passed} passed, ${failed} failed ────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
