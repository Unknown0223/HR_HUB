'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HrChangeRequestForm } from '../HrChangeRequestForm';
import type { HrChangeKind } from '../kinds';

function NewInner() {
  const searchParams = useSearchParams();
  const kind = (searchParams.get('kind') || 'open_position') as HrChangeKind;
  return <HrChangeRequestForm mode="create" kindDefault={kind} />;
}

export default function NewHrRequestPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <NewInner />
    </Suspense>
  );
}
