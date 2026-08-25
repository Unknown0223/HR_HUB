'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AllowancePolicyForm } from '../../AllowancePolicyForm';

export default function EditAllowancePolicyPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AllowancePolicyForm policyId={id} />
    </Suspense>
  );
}
