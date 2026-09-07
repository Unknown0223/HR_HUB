'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function NewTimesheetRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/payroll/timesheets?create=1');
  }, [router]);
  return null;
}

export default function NewTimesheetPage() {
  return (
    <Suspense fallback={null}>
      <NewTimesheetRedirect />
    </Suspense>
  );
}
