'use client';

import { Suspense } from 'react';
import { AccrualForm } from '../AccrualForm';

export default function NewAccrualPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AccrualForm />
    </Suspense>
  );
}
