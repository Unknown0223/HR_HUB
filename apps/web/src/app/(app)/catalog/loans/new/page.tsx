'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewLoanPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/loans?create=1');
  }, [router]);
  return null;
}
