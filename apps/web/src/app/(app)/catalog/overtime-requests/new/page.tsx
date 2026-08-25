'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewOvertimeRequestPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/overtime-requests?create=1');
  }, [router]);
  return null;
}
