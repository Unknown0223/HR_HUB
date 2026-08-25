'use client';

import { Suspense } from 'react';
import { OneTimeForm } from '../OneTimeForm';

export default function NewOneTimePage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <OneTimeForm />
    </Suspense>
  );
}
