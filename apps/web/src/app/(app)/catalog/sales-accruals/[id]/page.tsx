'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SalesAccrualForm } from '../SalesAccrualForm';

export default function ViewSalesAccrualPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <SalesAccrualForm docId={id} viewOnly />
    </Suspense>
  );
}
