/**
 * Smoke test for mobile /api/me/* endpoints.
 * Usage: node scripts/smoke-me-api.js
 * Env: API_URL (default http://localhost:3001/api)
 *      EMAIL / PASSWORD (default employee@demo.local / Demo1234!)
 */
const API = process.env.API_URL || 'http://localhost:3001/api';
const EMAIL = process.env.EMAIL || 'employee@demo.local';
const PASSWORD = process.env.PASSWORD || 'Demo1234!';

async function req(method, path, { token, tenantId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('API:', API);
  console.log('Login as', EMAIL);
  const login = await req('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.accessToken;
  const tenantId = login.tenant?.id || login.user?.tenantId;
  console.log('✓ login', login.user?.role, tenantId);

  const me = await req('GET', '/me', { token, tenantId });
  console.log('✓ GET /me', me.employee?.tabNumber, me.employee?.firstName);

  const today = await req('GET', '/me/attendance/today', { token, tenantId });
  console.log('✓ today', today.status, 'next', today.nextDirection);

  const marks = await req('GET', '/me/marks', { token, tenantId });
  console.log('✓ marks', marks.total ?? marks.items?.length);

  const requests = await req('GET', '/me/requests', { token, tenantId });
  console.log(
    '✓ requests absences=',
    requests.absences?.length,
    'hr=',
    requests.requests?.length,
  );

  const types = await req('GET', '/me/absence-types', { token, tenantId });
  console.log('✓ absence-types', Array.isArray(types) ? types.length : types);

  const notes = await req('GET', '/me/notifications', { token, tenantId });
  console.log('✓ notifications', Array.isArray(notes) ? notes.length : notes);

  const payroll = await req('GET', '/me/payroll/summary', { token, tenantId });
  console.log('✓ payroll summary period=', payroll.latestPeriod?.month);

  // Manager inbox (optional second login)
  try {
    const mgr = await req('POST', '/auth/login', {
      body: { email: 'manager@demo.local', password: PASSWORD },
    });
    const mt = mgr.accessToken;
    const mid = mgr.tenant?.id || mgr.user?.tenantId;
    const inbox = await req('GET', '/me/inbox', { token: mt, tenantId: mid });
    console.log(
      '✓ manager inbox absences=',
      inbox.absences?.length,
      'requests=',
      inbox.requests?.length,
    );
    const team = await req('GET', '/me/team/today', { token: mt, tenantId: mid });
    console.log('✓ team today', team.total ?? team.items?.length);
  } catch (e) {
    console.warn('manager checks skipped:', e.message);
  }

  console.log('\nSmoke OK');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
