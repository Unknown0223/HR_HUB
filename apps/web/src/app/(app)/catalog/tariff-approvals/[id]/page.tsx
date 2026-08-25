'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { TariffApprovalForm } from '../TariffApprovalForm';

export default function TariffApprovalDetailPage() {
  const params = useParams();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TariffApprovalForm mode="view" approvalId={String(params.id || '')} />
    </Suspense>
  );
}
