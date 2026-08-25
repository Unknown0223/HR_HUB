'use client';

import { Suspense } from 'react';
import { TariffApprovalForm } from '../TariffApprovalForm';

export default function NewTariffApprovalPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TariffApprovalForm mode="create" />
    </Suspense>
  );
}
