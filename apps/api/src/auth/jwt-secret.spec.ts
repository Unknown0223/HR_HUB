import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isProductionEnv, resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret / prod gates', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevJwt = process.env.JWT_SECRET;

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('lab: falls back to dev-secret when JWT unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    assert.equal(resolveJwtSecret(), 'dev-secret');
    assert.equal(isProductionEnv(), false);
  });

  it('lab: uses custom JWT when set', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'my-lab-secret-which-is-long-enough!!';
    assert.equal(resolveJwtSecret(), 'my-lab-secret-which-is-long-enough!!');
  });

  it('prod: rejects missing JWT', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => resolveJwtSecret(), /JWT_SECRET/);
  });

  it('prod: rejects weak / short JWT', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret';
    assert.throws(() => resolveJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = 'short';
    assert.throws(() => resolveJwtSecret(), /JWT_SECRET/);
  });

  it('prod: accepts strong JWT ≥32', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'prod-secret-must-be-at-least-32c!';
    assert.equal(
      resolveJwtSecret(),
      'prod-secret-must-be-at-least-32c!',
    );
    assert.equal(isProductionEnv(), true);
  });
});

/** Mirrors apps/api/src/main.ts production boot checks (non-JWT). */
function assertProdBootEnv(env: Record<string, string | undefined>): void {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProd) return;

  if (!(env.PUNCH_INGEST_API_KEY ?? '').trim()) {
    throw new Error('PUNCH_INGEST_API_KEY is required in production');
  }
  if (!(env.DEVICE_CREDENTIAL_VAULT_KEY ?? '').trim()) {
    throw new Error('DEVICE_CREDENTIAL_VAULT_KEY is required in production');
  }
  const bind = (
    env.OFFICE_LINK_BIND_SECRET ??
    env.JWT_SECRET ??
    ''
  ).trim();
  if (!bind) {
    throw new Error('OFFICE_LINK_BIND_SECRET (or JWT_SECRET) is required');
  }
}

describe('prod boot env gates (main.ts mirror)', () => {
  it('lab: empty punch/vault keys allowed', () => {
    assert.doesNotThrow(() =>
      assertProdBootEnv({
        NODE_ENV: 'development',
        PUNCH_INGEST_API_KEY: '',
        DEVICE_CREDENTIAL_VAULT_KEY: '',
      }),
    );
  });

  it('prod: requires punch + vault + bind', () => {
    assert.throws(
      () =>
        assertProdBootEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'prod-secret-must-be-at-least-32c!',
        }),
      /PUNCH_INGEST/,
    );
    assert.throws(
      () =>
        assertProdBootEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'prod-secret-must-be-at-least-32c!',
          PUNCH_INGEST_API_KEY: 'punch-key',
        }),
      /DEVICE_CREDENTIAL_VAULT/,
    );
    assert.doesNotThrow(() =>
      assertProdBootEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-secret-must-be-at-least-32c!',
        PUNCH_INGEST_API_KEY: 'punch-key',
        DEVICE_CREDENTIAL_VAULT_KEY: 'vault-key',
      }),
    );
  });
});
