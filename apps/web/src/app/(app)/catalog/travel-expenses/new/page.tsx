'use client';

import { Suspense } from 'react';
import { TravelExpenseForm } from '../TravelExpenseForm';

export default function NewTravelExpensePage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TravelExpenseForm />
    </Suspense>
  );
}
