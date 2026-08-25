'use client';

import { Suspense } from 'react';
import { ManualForm } from '../ManualForm';

export default function NewManualPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ManualForm />
    </Suspense>
  );
}
