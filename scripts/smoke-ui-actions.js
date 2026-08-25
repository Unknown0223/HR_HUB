/**
 * Smoke: UI-gap actions (import, export, tariff approve, payment-order chain, unpost).
 * Usage: node scripts/smoke-ui-actions.js
 * Requires API on :3001 and seeded demo tenant.
 * Login: admin@demo.local / Demo1234!
 */
const BASE = process.env.API_URL || 'http://127.0.0.1:3001/api';

async function req(path, { method = 'GET', token, tenantId, body, raw } = {}) {
  const headers = {};
  if (!raw) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body == null ? undefined : raw ? body : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let data;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json') || ct.includes('text/json')) {
    try {
      data = JSON.parse(buf.toString('utf8') || 'null');
    } catch {
      data = buf.toString('utf8');
    }
  } else {
    data = buf;
  }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const checks = [];
  const pass = (name) => {
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  };
  const fail = (name, err) => {
    checks.push({ name, ok: false, err: String(err) });
    console.error(`✗ ${name}: ${err}`);
  };

  const login = await req('/auth/login', {
    method: 'POST',
    body: { email: 'admin@demo.local', password: 'Demo1234!' },
  });
  assert(login.ok, `login failed ${login.status}`);
  const token = login.data.accessToken;
  const tenantId = login.data.tenant?.id || login.data.user?.tenantId;
  assert(token && tenantId, 'missing token/tenantId');
  pass('login');
  const auth = { token, tenantId };

  // 1) Employees import (create unique tabNumber, then skip duplicate)
  try {
    const tab = `SMK-${Date.now().toString(36).toUpperCase()}`;
    const first = await req('/employees/import', {
      ...auth,
      method: 'POST',
      body: {
        rows: [
          {
            tabNumber: tab,
            firstName: 'Smoke',
            lastName: 'Import',
            employmentType: 'staff',
          },
        ],
      },
    });
    assert(first.ok, `import ${first.status} ${JSON.stringify(first.data)}`);
    assert(first.data.created >= 1, `expected created>=1 got ${JSON.stringify(first.data)}`);
    const dup = await req('/employees/import', {
      ...auth,
      method: 'POST',
      body: {
        rows: [{ tabNumber: tab, firstName: 'Smoke', lastName: 'Import' }],
      },
    });
    assert(dup.ok, `reimport ${dup.status}`);
    assert(dup.data.skipped >= 1, 'expected skip on duplicate tabNumber');
    pass('employees import created+skipped');
  } catch (e) {
    fail('employees import created+skipped', e.message || e);
  }

  // 2) Excel export endpoints
  try {
    const empX = await req('/employees/export.xlsx', auth);
    assert(empX.ok, `employees xlsx ${empX.status}`);
    assert(Buffer.isBuffer(empX.data) && empX.data.length > 100, 'employees xlsx too small');
    const catX = await req('/catalog/name-changes/export.xlsx', auth);
    assert(catX.ok, `catalog xlsx ${catX.status}`);
    assert(Buffer.isBuffer(catX.data) && catX.data.length > 100, 'catalog xlsx too small');
    const advX = await req('/payroll/advances/export.xlsx', auth);
    assert(advX.ok, `advances xlsx ${advX.status}`);
    pass('export xlsx (employees + catalog + advances)');
  } catch (e) {
    fail('export xlsx (employees + catalog + advances)', e.message || e);
  }

  // 3) Tariff approval approve
  try {
    const list = await req('/catalog/tariff-approvals', auth);
    assert(list.ok && Array.isArray(list.data), 'list tariff-approvals');
    let row =
      (list.data || []).find((r) => r.status === 'pending' || r.status === 'draft') ||
      null;
    if (!row) {
      const groups = await req('/catalog/tariff-groups', auth);
      assert(groups.ok && groups.data?.length, 'need tariff group');
      const created = await req('/catalog/tariff-approvals', {
        ...auth,
        method: 'POST',
        body: { tariffGroupId: groups.data[0].id, status: 'pending', note: 'smoke' },
      });
      assert(created.ok, `create approval ${created.status} ${JSON.stringify(created.data)}`);
      row = created.data;
    }
    const appr = await req(`/catalog/tariff-approvals/${row.id}/approve`, {
      ...auth,
      method: 'POST',
    });
    assert(appr.ok, `approve ${appr.status} ${JSON.stringify(appr.data)}`);
    assert(appr.data.status === 'approved', 'not approved');
    pass('tariff approval approve');
  } catch (e) {
    fail('tariff approval approve', e.message || e);
  }

  // 4) Payment order open → sent → paid
  try {
    const list = await req('/catalog/payment-orders', auth);
    assert(list.ok, 'list payment-orders');
    let order = (list.data || []).find((o) => String(o.status) === 'open');
    if (!order) {
      const emps = await req('/employees?status=active&limit=1', auth);
      const empId = emps.data?.items?.[0]?.id;
      const created = await req('/catalog/payment-orders', {
        ...auth,
        method: 'POST',
        body: {
          number: `PO-SMK-${Date.now()}`,
          title: 'Smoke payment order',
          amount: 1000,
          employeeId: empId,
          status: 'open',
        },
      });
      assert(created.ok, `create PO ${created.status} ${JSON.stringify(created.data)}`);
      order = created.data;
    }
    const sent = await req(`/catalog/payment-orders/${order.id}/send`, {
      ...auth,
      method: 'POST',
    });
    assert(sent.ok && sent.data.status === 'sent', `send ${sent.status} ${JSON.stringify(sent.data)}`);
    const paid = await req(`/catalog/payment-orders/${order.id}/pay`, {
      ...auth,
      method: 'POST',
    });
    assert(paid.ok && paid.data.status === 'paid', `pay ${paid.status} ${JSON.stringify(paid.data)}`);
    pass('payment order open→sent→paid');
  } catch (e) {
    fail('payment order open→sent→paid', e.message || e);
  }

  // 5) HR document unpost (prefer other/name_change/wage_change posted)
  try {
    const docs = await req('/hr/documents', auth);
    assert(docs.ok, 'list hr docs');
    let posted = (docs.data || []).find(
      (d) =>
        d.status === 'posted' &&
        ['other', 'name_change', 'wage_change'].includes(d.type),
    );
    if (!posted) {
      const emps = await req('/employees?status=active&limit=1', auth);
      const empId = emps.data?.items?.[0]?.id;
      assert(empId, 'need employee');
      const created = await req('/hr/documents', {
        ...auth,
        method: 'POST',
        body: {
          employeeId: empId,
          type: 'other',
          title: 'Smoke unpost doc',
          documentDate: new Date().toISOString().slice(0, 10),
          note: 'smoke',
        },
      });
      assert(created.ok, `create doc ${created.status}`);
      const post = await req(`/hr/documents/${created.data.id}/post`, {
        ...auth,
        method: 'POST',
      });
      assert(post.ok, `post doc ${post.status} ${JSON.stringify(post.data)}`);
      posted = post.data;
    }
    const unpost = await req(`/hr/documents/${posted.id}/unpost`, {
      ...auth,
      method: 'POST',
    });
    assert(unpost.ok, `unpost ${unpost.status} ${JSON.stringify(unpost.data)}`);
    assert(unpost.data.status === 'draft', 'expected draft after unpost');
    pass('hr document unpost');
  } catch (e) {
    fail('hr document unpost', e.message || e);
  }

  // 6) GPH activate/close + settlement post (extra coverage)
  try {
    const gph = await req('/catalog/gph-contracts', auth);
    assert(gph.ok && gph.data?.length, 'gph list');
    const row = gph.data[0];
    if (row.isActive) {
      const closed = await req(`/catalog/gph-contracts/${row.id}/close`, {
        ...auth,
        method: 'POST',
      });
      assert(closed.ok && closed.data.isActive === false, 'close gph');
      const act = await req(`/catalog/gph-contracts/${row.id}/activate`, {
        ...auth,
        method: 'POST',
      });
      assert(act.ok && act.data.isActive === true, 'activate gph');
    } else {
      const act = await req(`/catalog/gph-contracts/${row.id}/activate`, {
        ...auth,
        method: 'POST',
      });
      assert(act.ok && act.data.isActive === true, 'activate gph');
    }
    pass('gph activate/close');
  } catch (e) {
    fail('gph activate/close', e.message || e);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
