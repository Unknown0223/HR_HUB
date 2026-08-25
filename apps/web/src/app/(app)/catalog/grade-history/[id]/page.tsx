'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { GradePromotionForm } from '../GradePromotionForm';

export default function GradePromotionDetailPage() {
  const params = useParams();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <GradePromotionForm mode="view" promotionId={String(params.id || '')} />
    </Suspense>
  );
}
