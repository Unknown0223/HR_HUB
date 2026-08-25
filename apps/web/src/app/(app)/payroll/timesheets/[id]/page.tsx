'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { TimesheetForm } from '../../TimesheetForm';

export default function ViewTimesheetPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TimesheetForm sheetId={id} />
    </Suspense>
  );
}
