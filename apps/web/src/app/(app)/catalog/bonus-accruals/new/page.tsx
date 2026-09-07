'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const kind = searchParams.get('kind') === 'kpi' ? 'kpi' : 'fact';
    router.replace(`/catalog/bonus-accruals?create=1&kind=${kind}`);
  }, [router, searchParams]);
  return null;
}

/** Legacy /new → list with create modal */
export default function NewBonusAccrualRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
