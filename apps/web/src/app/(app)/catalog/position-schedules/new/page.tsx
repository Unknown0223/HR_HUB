'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PositionScheduleForm } from '../PositionScheduleForm';
import type { ScheduleKind } from '../page';

const KINDS = new Set(['ordinary', 'hourly', 'advanced', 'multi_shift', 'advanced_multi_shift']);

function NewInner() {
  const sp = useSearchParams();
  const raw = sp.get('kind') || 'ordinary';
  const kind = (KINDS.has(raw) ? raw : 'ordinary') as ScheduleKind;
  return <PositionScheduleForm mode="create" initialKind={kind} />;
}

export default function NewPositionSchedulePage() {
  return (
    <Suspense fallback={<p style={{ padding: '1rem', color: '#94a3b8' }}>Загрузка…</p>}>
      <NewInner />
    </Suspense>
  );
}
