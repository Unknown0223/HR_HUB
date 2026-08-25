'use client';

import { Suspense } from 'react';
import { SalesAccrualForm } from '../SalesAccrualForm';

export default function NewSalesAccrualPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <SalesAccrualForm />
    </Suspense>
  );
}
