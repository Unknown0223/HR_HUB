'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ManualForm } from '../../ManualForm';

export default function ManualEditPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ManualForm docId={id} />
    </Suspense>
  );
}
