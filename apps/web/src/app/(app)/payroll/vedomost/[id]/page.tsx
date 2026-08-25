'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SheetForm } from '../SheetForm';

export default function SheetViewPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <SheetForm docId={id} />
    </Suspense>
  );
}
