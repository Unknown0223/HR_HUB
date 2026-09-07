'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewSheetRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const kind = searchParams.get('kind');
    router.replace(
      kind ? `/payroll/vedomost?create=1&kind=${kind}` : '/payroll/vedomost?create=1',
    );
  }, [router, searchParams]);
  return null;
}

export default function NewSheetPage() {
  return (
    <Suspense fallback={null}>
      <NewSheetRedirect />
    </Suspense>
  );
}
