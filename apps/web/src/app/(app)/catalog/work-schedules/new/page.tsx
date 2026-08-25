'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScheduleForm } from '../ScheduleForm';
import type { ScheduleKind } from '../page';

const KINDS = new Set([
  'ordinary',
  'hourly',
  'advanced',
  'multi_shift',
  'advanced_multi_shift',
]);

function NewInner() {
  const sp = useSearchParams();
  const raw = sp.get('kind') || 'ordinary';
  const kind = (KINDS.has(raw) ? raw : 'ordinary') as ScheduleKind;
  return <ScheduleForm initialKind={kind} />;
}

export default function NewWorkSchedulePage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <NewInner />
    </Suspense>
  );
}
