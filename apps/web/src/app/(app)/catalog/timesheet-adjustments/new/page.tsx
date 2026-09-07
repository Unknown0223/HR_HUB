'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batch = searchParams.get('batch') === '1';
  useEffect(() => {
    router.replace(
      batch
        ? '/catalog/timesheet-adjustments?create=1&batch=1'
        : '/catalog/timesheet-adjustments?create=1',
    );
  }, [router, batch]);
  return null;
}

export default function NewTimesheetCorrectionPage() {
  return (
    <Suspense fallback={null}>
      <NewRedirect />
    </Suspense>
  );
}
