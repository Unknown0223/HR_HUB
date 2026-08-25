'use client';

import { Suspense } from 'react';
import { LoanForm } from '../LoanForm';

export default function NewLoanPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LoanForm />
    </Suspense>
  );
}
