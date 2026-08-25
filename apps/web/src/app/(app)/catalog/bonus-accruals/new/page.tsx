'use client';

import { Suspense } from 'react';
import { BonusAccrualForm } from '../BonusAccrualForm';

export default function NewBonusAccrualPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <BonusAccrualForm />
    </Suspense>
  );
}
