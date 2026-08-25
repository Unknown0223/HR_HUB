'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { BonusAccrualForm } from '../BonusAccrualForm';

export default function ViewBonusAccrualPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <BonusAccrualForm docId={id} viewOnly />
    </Suspense>
  );
}
