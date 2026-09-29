import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, Role } from '@prisma/client';

export type EmployeeScope = { locationIds: string[]; employeeIds: string[] };

type Store = { scope: EmployeeScope | null; bypass: boolean };

const storage = new AsyncLocalStorage<Store>();

export const SCOPED_ROLES: ReadonlySet<Role> = new Set<Role>(['hr', 'manager']);

export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({ scope: null, bypass: false }, fn);
}

export function setRequestScope(scope: EmployeeScope | null) {
  const store = storage.getStore();
  if (store) store.scope = scope;
}

export function currentEmployeeScope(): EmployeeScope | null {
  const store = storage.getStore();
  if (!store || store.bypass) return null;
  return store.scope;
}

/** Runs `fn` without the caller's employee scope — for tenant-wide uniqueness checks. */
export function runUnscoped<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return Promise.resolve(fn());
  // Prisma queries are lazy thenables: subscribe inside the context so the query runs unscoped.
  return storage.run({ ...store, bypass: true }, () => Promise.resolve(fn()).then((v) => v));
}

export function scopedEmployeeWhere(scope: EmployeeScope): Prisma.EmployeeWhereInput {
  const { locationIds, employeeIds } = scope;
  if (!locationIds.length) return { id: { in: [] } };
  const inLocations: Prisma.EmployeeWhereInput = {
    OR: [
      { division: { locationId: { in: locationIds } } },
      {
        accessGrants: {
          some: {
            accessType: 'location',
            resource: { in: locationIds },
            isActive: true,
            // One-off visits to another branch do not make it the employee's branch.
            OR: [{ note: null }, { note: { not: 'visit' } }],
          },
        },
      },
    ],
  };
  if (!employeeIds.length) return inLocations;
  return { AND: [inLocations, { id: { in: employeeIds } }] };
}
