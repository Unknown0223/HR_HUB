'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { OneTimeForm } from '../OneTimeForm';

export default function ViewOneTimePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <OneTimeForm docId={id} viewOnly />
    </Suspense>
  );
}
