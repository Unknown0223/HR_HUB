'use client';

import { Suspense } from 'react';
import { FinePolicyForm } from '../FinePolicyForm';

export default function NewFinePolicyPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <FinePolicyForm />
    </Suspense>
  );
}
