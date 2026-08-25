'use client';

import { Suspense } from 'react';
import { GradePromotionForm } from '../GradePromotionForm';

export default function NewGradePromotionPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <GradePromotionForm mode="create" />
    </Suspense>
  );
}
