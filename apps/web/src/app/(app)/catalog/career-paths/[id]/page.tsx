'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CareerPathForm } from '../CareerPathForm';

export default function CareerPathDetailPage() {
  const params = useParams();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <CareerPathForm mode="view" pathId={String(params.id || '')} />
    </Suspense>
  );
}
