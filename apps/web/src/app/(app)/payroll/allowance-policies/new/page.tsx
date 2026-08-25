'use client';

import { Suspense } from 'react';
import { AllowancePolicyForm } from '../AllowancePolicyForm';

export default function NewAllowancePolicyPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AllowancePolicyForm />
    </Suspense>
  );
}
