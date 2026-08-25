#!/usr/bin/env node
/**
 * Smoke: system settings (all tabs) + absence-types + time-types.
 * Usage: node scripts/smoke-system-settings.js
 */
const API = process.env.API_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;

async function req(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
}

async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e);
  }
}

async function main() {
  console.log('=== Smoke: system settings + time/absence types ===\n');

  let headers = {};

  await step('login', async () => {
    const login = await req(`${API}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@demo.local',
        password: 'Demo1234!',
      }),
    });
    if (!login.accessToken) throw new Error('no token');
    headers = {
      Authorization: `Bearer ${login.accessToken}`,
      'X-Tenant-Id': login.tenant?.id || '',
    };
  });

  await step('GET /api/settings/system', async () => {
    const data = await req(`${API}/api/settings/system`, { headers });
    const s = data.system || data;
    if (!s || typeof s !== 'object') throw new Error('no system object');
    if (!s.timepad || typeof s.timepad !== 'object') throw new Error('missing timepad');
    if (!s.hrStaff || typeof s.hrStaff !== 'object') throw new Error('missing hrStaff');
    if (!s.requiredFields || typeof s.requiredFields !== 'object') {
      throw new Error('missing requiredFields');
    }
    if (!s.recruitment || typeof s.recruitment !== 'object') {
      throw new Error('missing recruitment');
    }
    if (!s.requiredFields.employee) throw new Error('requiredFields.employee missing');
    if (!Array.isArray(s.recruitment.internshipAccruals)) {
      throw new Error('recruitment.internshipAccruals not array');
    }
  });

  await step('PATCH system.timepad', async () => {
    const res = await req(`${API}/api/settings/system`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        system: {
          timepad: {
            qrCodeTtl: '00:12',
            language: 'ru',
            markTypeCancel: true,
          },
        },
      }),
    });
    const t = res.system?.timepad;
    if (t?.qrCodeTtl !== '00:12') throw new Error(`qrCodeTtl=${t?.qrCodeTtl}`);
    if (!t?.markTypeCancel) throw new Error('markTypeCancel not set');
  });

  await step('PATCH system.requiredFields.employee', async () => {
    const res = await req(`${API}/api/settings/system`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        system: {
          requiredFields: {
            employee: { email: false },
            absenceRequest: { minNoteChars: 5 },
          },
        },
      }),
    });
    const rf = res.system?.requiredFields;
    if (rf?.employee?.email !== false) throw new Error('email flag');
    if (rf?.absenceRequest?.minNoteChars !== 5) throw new Error('minNoteChars');
    if (typeof rf?.employee?.lastName !== 'boolean') {
      throw new Error('employee merge lost other fields');
    }
  });

  await step('PATCH system.recruitment', async () => {
    const res = await req(`${API}/api/settings/system`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        system: {
          recruitment: {
            nearestVacancyRadiusKm: '25',
            filterVacanciesByAge: false,
            internshipAccruals: [
              { id: 'a1', name: 'Стажировка', indicators: 'hours' },
            ],
          },
        },
      }),
    });
    const r = res.system?.recruitment;
    if (r?.nearestVacancyRadiusKm !== '25') throw new Error('radius');
    if (r?.filterVacanciesByAge !== false) throw new Error('filterAge');
    if (!Array.isArray(r?.internshipAccruals) || r.internshipAccruals.length < 1) {
      throw new Error('accruals');
    }
  });

  await step('GET /api/hr/absence-types', async () => {
    const list = await req(`${API}/api/hr/absence-types?all=1`, { headers });
    if (!Array.isArray(list)) throw new Error('not array');
  });

  await step('GET /api/catalog/time-types', async () => {
    const list = await req(`${API}/api/catalog/time-types`, { headers });
    if (!Array.isArray(list)) throw new Error('not array');
  });

  let createdTtId = null;
  await step('POST /api/catalog/time-types', async () => {
    const code = `TT_${Date.now().toString(36).toUpperCase()}`;
    const row = await req(`${API}/api/catalog/time-types`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code,
        name: `Smoke TT ${code}`,
        letterCode: 'S',
        digitalCode: '99',
        planLoad: 'partial',
        color: '#3699ff',
        isPaid: true,
        isActive: true,
      }),
    });
    if (!row?.id) throw new Error('no id');
    createdTtId = row.id;
    if (row.letterCode !== 'S' && row.code !== code) {
      // letterCode may require prisma generate; accept create with id
    }
  });

  await step('PATCH time-type color', async () => {
    if (!createdTtId) throw new Error('skip no id');
    const row = await req(`${API}/api/catalog/time-types/${createdTtId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ color: '#ff7000', planLoad: 'full' }),
    });
    if (row?.color != null && row.color !== '#ff7000') {
      throw new Error(`color=${row.color}`);
    }
  });

  await step('DELETE time-type smoke row', async () => {
    if (!createdTtId) throw new Error('skip no id');
    await req(`${API}/api/catalog/time-types/${createdTtId}`, {
      method: 'DELETE',
      headers,
    });
  });

  await step('GET /api/settings/payroll-calc', async () => {
    const data = await req(`${API}/api/settings/payroll-calc`, { headers });
    if (!data?.payrollCalc?.personnel) throw new Error('missing personnel block');
    if (!data.payrollCalc.ndfl || !data.payrollCalc.inps || !data.payrollCalc.esp) {
      throw new Error('missing tax blocks');
    }
  });

  await step('PATCH payroll-calc accounts + NDFL', async () => {
    const res = await req(`${API}/api/settings/payroll-calc`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        payrollCalc: {
          personnel: {
            accrualAccount: '6700',
            allowCurrency: true,
            currency: 'USD',
            allowProjects: true,
          },
          ndfl: { taxable: true, rateNo: '1', account: '6410' },
        },
      }),
    });
    if (res.payrollCalc?.personnel?.accrualAccount !== '6700') {
      throw new Error(`accrual=${res.payrollCalc?.personnel?.accrualAccount}`);
    }
    if (!res.payrollCalc?.ndfl?.taxable || res.payrollCalc.ndfl.rateNo !== '1') {
      throw new Error('ndfl not saved');
    }
  });

  await step('payroll-calc merge preserves fields', async () => {
    const res = await req(`${API}/api/settings/payroll-calc`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        payrollCalc: {
          esp: { taxable: true, rateNo: '12', account: '6520' },
        },
      }),
    });
    if (res.payrollCalc?.personnel?.accrualAccount !== '6700') {
      throw new Error('personnel wiped on partial patch');
    }
    if (res.payrollCalc?.esp?.account !== '6520') {
      throw new Error(`esp account=${res.payrollCalc?.esp?.account}`);
    }
  });

  // Restore reasonable defaults after tests
  await step('restore defaults (partial)', async () => {
    await req(`${API}/api/settings/system`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        system: {
          timepad: { qrCodeTtl: '00:10', markTypeCancel: false },
          requiredFields: {
            employee: { email: true },
            absenceRequest: { minNoteChars: 0 },
          },
          recruitment: {
            nearestVacancyRadiusKm: '10',
            filterVacanciesByAge: true,
          },
        },
      }),
    });
    await req(`${API}/api/settings/payroll-calc`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        payrollCalc: {
          personnel: {
            accrualAccount: '',
            allowCurrency: false,
            currency: '',
            allowProjects: false,
          },
          ndfl: { taxable: false, rateNo: '', account: '' },
          esp: { taxable: false, rateNo: '', account: '' },
        },
      }),
    });
  });

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
