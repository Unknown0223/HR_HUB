'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TimesheetCorrectionForm } from '../TimesheetCorrectionForm';

function NewInner() {
  const searchParams = useSearchParams();
  const batch = searchParams.get('batch') === '1';
  return <TimesheetCorrectionForm mode="create" batchDefault={batch} />;
}

export default function NewTimesheetCorrectionPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <NewInner />
    </Suspense>
  );
}
