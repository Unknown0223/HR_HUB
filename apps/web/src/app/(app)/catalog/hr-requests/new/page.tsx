'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { HrChangeKind } from '../kinds';

/** Legacy full-page create route — the list now opens a create modal instead. */
function NewRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind = (searchParams.get('kind') || 'open_position') as HrChangeKind;

  useEffect(() => {
    router.replace(`/catalog/hr-requests?create=1&kind=${kind}`);
  }, [router, kind]);

  return <p>Загрузка…</p>;
}

export default function NewHrRequestPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <NewRedirect />
    </Suspense>
  );
}
