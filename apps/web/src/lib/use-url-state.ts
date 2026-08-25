'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Sync a string query param with React state (mega-nav deep links). */
export function useUrlParam(
  key: string,
  fallback: string,
  allowed?: readonly string[],
): [string, (next: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams?.get(key) ?? '';
  const fromUrl =
    raw && (!allowed || (allowed as readonly string[]).includes(raw)) ? raw : fallback;

  const [value, setValue] = useState(fromUrl);

  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (!next || next === fallback) {
        // keep explicit tab in URL for deep links even when default
        params.set(key, next);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [fallback, key, pathname, router, searchParams],
  );

  return [value, set];
}

/** Multiple query params as a memoized query string builder. */
export function useQueryObject(keys: Record<string, string | undefined>) {
  return useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keys)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [keys]);
}
