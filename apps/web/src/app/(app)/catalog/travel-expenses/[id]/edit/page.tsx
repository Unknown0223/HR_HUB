'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { TravelExpenseForm } from '../../TravelExpenseForm';

export default function EditTravelExpensePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TravelExpenseForm docId={id} />
    </Suspense>
  );
}
