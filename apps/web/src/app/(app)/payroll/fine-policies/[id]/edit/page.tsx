'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { FinePolicyForm } from '../../FinePolicyForm';

export default function EditFinePolicyPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <FinePolicyForm policyId={id} />
    </Suspense>
  );
}
