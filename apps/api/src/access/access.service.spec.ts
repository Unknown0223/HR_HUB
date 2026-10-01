import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { runWithRequestContext, setRequestScope } from '../common/data-scope';
import { AccessService } from './access.service';

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return (v.in as unknown[]).includes(row[k]);
      return true;
    }
    return row[k] === v;
  });
}

function table(rows: Row[]) {
  return {
    rows,
    findFirst: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)),
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), grantedAt: new Date(), expiresAt: null, note: null, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  };
}

const T1 = randomUUID();
const T2 = randomUUID();
const LOC_A = randomUUID();
const LOC_B = randomUUID();

function setup() {
  const employees = [
    { id: randomUUID(), tenantId: T1, status: 'active', firstName: 'A', lastName: 'A' },
    { id: randomUUID(), tenantId: T1, status: 'active', firstName: 'B', lastName: 'B' },
    { id: randomUUID(), tenantId: T1, status: 'dismissed', firstName: 'C', lastName: 'C' },
    { id: randomUUID(), tenantId: T2, status: 'active', firstName: 'D', lastName: 'D' },
  ];
  const divisions = [
    { id: randomUUID(), tenantId: T1, locationId: LOC_A, name: 'Div A' },
    { id: randomUUID(), tenantId: T1, locationId: LOC_B, name: 'Div B' },
    { id: randomUUID(), tenantId: T2, locationId: null, name: 'Other tenant' },
  ];
  const db = {
    employee: table(employees),
    division: table(divisions),
    location: table([]),
    employeeAccessGrant: table([]),
    auditLog: table([]),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  const service = new AccessService(db as never);
  return { db, service, employees, divisions };
}

const admin = { userId: randomUUID(), role: 'tenant_admin', email: 'admin@test' };
const hr = { userId: randomUUID(), role: 'hr', email: 'hr@test' };

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (err: unknown) => err instanceof HttpException && err.getStatus() === status);
}

describe('AccessService.grant', () => {
  it('grants, writes an audit entry and rejects an active duplicate', async () => {
    const { db, service, employees, divisions } = setup();
    const dto = { employeeId: employees[0].id, accessType: 'org_custom', resource: divisions[0].id, reason: 'project' };
    const g = await service.grant(T1, hr, dto);
    assert.equal(g.status, 'active');
    assert.equal(g.resourceLabel, 'Div A');
    assert.equal(db.auditLog.rows.length, 1);
    assert.equal(db.auditLog.rows[0].action, 'access.grant');
    assert.equal(db.auditLog.rows[0].meta.reason, 'project');
    assert.equal(db.auditLog.rows[0].meta.before, null);
    await rejects(service.grant(T1, hr, dto), 409);
  });

  it('does not reach employees or divisions of another tenant', async () => {
    const { service, employees, divisions } = setup();
    await rejects(
      service.grant(T1, admin, { employeeId: employees[3].id, accessType: 'org_full', reason: 'x-tenant' }),
      404,
    );
    await rejects(
      service.grant(T1, admin, {
        employeeId: employees[0].id,
        accessType: 'org_custom',
        resource: divisions[2].id,
        reason: 'x-tenant',
      }),
      404,
    );
  });

  it('blocks scoped HR from divisions outside their locations', async () => {
    const { service, employees, divisions } = setup();
    await runWithRequestContext(async () => {
      setRequestScope({ locationIds: [LOC_A], employeeIds: [] });
      await rejects(
        service.grant(T1, hr, {
          employeeId: employees[0].id,
          accessType: 'org_custom',
          resource: divisions[1].id,
          reason: 'scope',
        }),
        403,
      );
      const ok = await service.grant(T1, hr, {
        employeeId: employees[0].id,
        accessType: 'org_custom',
        resource: divisions[0].id,
        reason: 'scope',
      });
      assert.equal(ok.status, 'active');
    });
  });

  it('keeps global access for tenant admins and refuses dismissed employees', async () => {
    const { service, employees } = setup();
    await rejects(service.grant(T1, hr, { employeeId: employees[0].id, accessType: 'org_full', reason: 'nope' }), 400);
    await rejects(
      service.grant(T1, admin, { employeeId: employees[2].id, accessType: 'org_full', reason: 'dismissed' }),
      400,
    );
  });

  it('reactivates an expired grant instead of duplicating it', async () => {
    const { db, service, employees } = setup();
    db.employeeAccessGrant.rows.push({
      id: randomUUID(),
      tenantId: T1,
      employeeId: employees[0].id,
      accessType: 'kpe_full',
      resource: '*',
      grantedAt: new Date('2025-01-01'),
      expiresAt: new Date('2025-06-01'),
      isActive: true,
      note: null,
    });
    const g = await service.grant(T1, admin, { employeeId: employees[0].id, accessType: 'kpe_full', reason: 'renew' });
    assert.equal(g.status, 'active');
    assert.equal(g.expiresAt, null);
    assert.equal(db.employeeAccessGrant.rows.length, 1);
    assert.equal(db.auditLog.rows[0].action, 'access.reactivate');
    assert.equal(db.auditLog.rows[0].meta.before.expiresAt, '2025-06-01T00:00:00.000Z');
  });
});

describe('AccessService.revoke', () => {
  it('soft-revokes once and audits before/after', async () => {
    const { db, service, employees } = setup();
    const g = await service.grant(T1, hr, {
      employeeId: employees[0].id,
      accessType: 'profile_flag',
      resource: 'marks_blocked',
      reason: 'audit',
    });
    const r = await service.revoke(T1, hr, g.id, 'done');
    assert.equal(r.status, 'revoked');
    assert.equal(db.employeeAccessGrant.rows.length, 1);
    assert.equal(db.employeeAccessGrant.rows[0].note, 'disabled');
    const log = db.auditLog.rows.at(-1)!;
    assert.equal(log.action, 'access.revoke');
    assert.equal(log.meta.before.isActive, true);
    assert.equal(log.meta.after.isActive, false);
    await rejects(service.revoke(T1, hr, g.id, 'again'), 409);
  });

  it('refuses read-only types and grants of another tenant', async () => {
    const { db, service, employees } = setup();
    const loc = { id: randomUUID(), tenantId: T1, employeeId: employees[0].id, accessType: 'location', resource: LOC_A, isActive: true, expiresAt: null };
    const foreign = { id: randomUUID(), tenantId: T2, employeeId: employees[3].id, accessType: 'org_full', resource: '*', isActive: true, expiresAt: null };
    db.employeeAccessGrant.rows.push(loc, foreign);
    await rejects(service.revoke(T1, admin, loc.id, 'loc'), 400);
    await rejects(service.revoke(T1, admin, foreign.id, 'foreign'), 404);
    assert.equal(foreign.isActive, true);
  });
});

describe('AccessService.bulk', () => {
  it('reports per-employee results on partial failure', async () => {
    const { db, service, employees } = setup();
    const res = await service.bulk(T1, hr, {
      action: 'grant',
      employeeIds: [employees[0].id, employees[2].id, employees[3].id],
      accessType: 'profile_flag',
      resource: 'exclude_from_stats',
      reason: 'bulk test',
    });
    assert.equal(res.succeeded, 1);
    assert.equal(res.failed, 2);
    assert.deepEqual(
      res.results.map((r) => r.ok),
      [true, false, false],
    );
    assert.equal(db.auditLog.rows[0].meta.source, 'access.bulk');

    const revoke = await service.bulk(T1, hr, {
      action: 'revoke',
      employeeIds: [employees[0].id, employees[1].id],
      accessType: 'profile_flag',
      resource: 'exclude_from_stats',
      reason: 'bulk revoke',
    });
    assert.equal(revoke.succeeded, 1);
    assert.equal(revoke.results[1].ok, false);
  });

  it('rejects the whole request when the type is not grantable', async () => {
    const { service, employees } = setup();
    await rejects(
      service.bulk(T1, hr, {
        action: 'grant',
        employeeIds: [employees[0].id],
        accessType: 'org_full',
        reason: 'global',
      }),
      400,
    );
  });
});
