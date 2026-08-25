const API = process.env.API_URL || 'http://localhost:3001';

async function req(path, { method = 'GET', token, tenantId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  const token = login.accessToken;
  const tenantId = login.tenant?.id || login.user?.tenantId;
  const list = await req('/api/employees?q=0001&limit=5', { token, tenantId });
  const emp = (list.items || list).find((e) => e.tabNumber === '0001') || (list.items || list)[0];
  if (!emp?.id) throw new Error('no employee');

  const detail = await req(`/api/employees/${emp.id}`, { token, tenantId });
  if (!Array.isArray(detail.marks)) throw new Error('marks missing on detail');
  console.log('detail marks:', detail.marks.length, detail.marks[0] || null);

  const page = await req(`/api/attendance/marks?employeeId=${emp.id}&limit=20`, {
    token,
    tenantId,
  });
  console.log('list marks:', page.total, page.items?.[0]?.markTypeLabel);

  const created = await req('/api/attendance/marks', {
    method: 'POST',
    token,
    tenantId,
    body: {
      employeeId: emp.id,
      occurredAt: new Date().toISOString(),
      markType: 'in',
      locationName: 'Test Loc',
      note: '[test] manual mark',
      identificationType: 'Ручной ввод',
      deviceType: 'Ручной',
      isValid: true,
    },
  });
  console.log('created:', created.id, created.markTypeLabel, created.locationName);

  const after = await req(`/api/attendance/marks?employeeId=${emp.id}&limit=5`, {
    token,
    tenantId,
  });
  const found = (after.items || []).some((m) => m.id === created.id);
  if (!found) throw new Error('created mark not listed');
  console.log(JSON.stringify({ ok: true, total: after.total }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
