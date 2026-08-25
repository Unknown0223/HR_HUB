'use client';

import { Suspense } from 'react';
import { TimesheetForm } from '../TimesheetForm';

export default function NewTimesheetPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TimesheetForm />
    </Suspense>
  );
}
