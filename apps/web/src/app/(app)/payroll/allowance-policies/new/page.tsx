'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewAllowancePolicyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('create', '1');
    router.replace(`/payroll/allowance-policies?${params.toString()}`);
  }, [router, searchParams]);
  return null;
}

export default function NewAllowancePolicyPage() {
  return (
    <Suspense fallback={null}>
      <NewAllowancePolicyRedirect />
    </Suspense>
  );
}
