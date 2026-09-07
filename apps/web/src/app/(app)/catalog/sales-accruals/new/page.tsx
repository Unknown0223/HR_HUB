'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewSalesAccrualPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/sales-accruals?create=1');
  }, [router]);
  return null;
}
