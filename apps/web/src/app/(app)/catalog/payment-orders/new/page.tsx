'use client';

import { Suspense } from 'react';
import { PaymentOrderForm } from '../PaymentOrderForm';

export default function NewPaymentOrderPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <PaymentOrderForm />
    </Suspense>
  );
}
