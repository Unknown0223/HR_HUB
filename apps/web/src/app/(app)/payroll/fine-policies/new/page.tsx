'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewFinePolicyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('create', '1');
    router.replace(`/payroll/fine-policies?${params.toString()}`);
  }, [router, searchParams]);
  return null;
}

export default function NewFinePolicyPage() {
  return (
    <Suspense fallback={null}>
      <NewFinePolicyRedirect />
    </Suspense>
  );
}
