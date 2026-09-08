const TTL_MS = 120_000;

type CacheEntry = { expiresAt: number; data: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheKey(tenantId: string | null | undefined, path: string) {
  return `${tenantId ?? 'none'}::${path}`;
}

export function invalidateCatalogLookupsCache() {
  cache.clear();
  inflight.clear();
}

export function isCatalogLookupsGet(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  if (m !== 'GET') return false;
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.includes('/api/catalog/lookups');
}

export async function withCatalogLookupsCache<T>(
  path: string,
  tenantId: string | null | undefined,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = cacheKey(tenantId, path.startsWith('/') ? path : `/${path}`);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}
