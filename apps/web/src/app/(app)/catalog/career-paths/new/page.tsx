'use client';

import { Suspense } from 'react';
import { CareerPathForm } from '../CareerPathForm';

export default function NewCareerPathPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <CareerPathForm mode="create" />
    </Suspense>
  );
}
