'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function Redirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const kind = searchParams.get('kind') === 'deduction' ? 'deduction' : 'accrual';
    router.replace(`/catalog/one-time-accruals?kind=${kind}&create=1`);
  }, [router, searchParams]);
  return null;
}

export default function NewOneTimePage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
