'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AccrualForm } from '../../AccrualForm';

export default function EditAccrualPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AccrualForm docId={id} />
    </Suspense>
  );
}
