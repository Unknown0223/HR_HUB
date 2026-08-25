'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LoanForm } from '../../LoanForm';

export default function EditLoanPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LoanForm docId={id} />
    </Suspense>
  );
}
