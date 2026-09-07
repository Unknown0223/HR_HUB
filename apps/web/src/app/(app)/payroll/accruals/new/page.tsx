'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewAccrualRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const kind = searchParams.get('kind');
    router.replace(
      kind ? `/payroll/accruals?create=1&createKind=${kind}` : '/payroll/accruals?create=1',
    );
  }, [router, searchParams]);
  return null;
}

export default function NewAccrualPage() {
  return (
    <Suspense fallback={null}>
      <NewAccrualRedirect />
    </Suspense>
  );
}
