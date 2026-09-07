'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewSettlementPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/settlements?create=1');
  }, [router]);
  return null;
}
