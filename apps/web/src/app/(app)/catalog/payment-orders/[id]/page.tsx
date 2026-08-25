'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PaymentOrderForm } from '../PaymentOrderForm';

export default function ViewPaymentOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <PaymentOrderForm docId={id} viewOnly />
    </Suspense>
  );
}
