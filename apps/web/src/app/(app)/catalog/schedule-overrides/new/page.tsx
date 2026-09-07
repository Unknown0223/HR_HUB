'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const KINDS = new Set([
  'ordinary',
  'hourly',
  'advanced',
  'multi_shift',
  'advanced_multi_shift',
]);

function RedirectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get('kind') || 'ordinary';
  const kind = KINDS.has(raw) ? raw : 'ordinary';

  useEffect(() => {
    router.replace(`/catalog/schedule-overrides?create=1&kind=${kind}`);
  }, [router, kind]);

  return <p style={{ padding: '1rem', color: '#94a3b8' }}>Открываем форму создания…</p>;
}

export default function NewIndividualSchedulePage() {
  return (
    <Suspense fallback={<p style={{ padding: '1rem', color: '#94a3b8' }}>Загрузка…</p>}>
      <RedirectInner />
    </Suspense>
  );
}
