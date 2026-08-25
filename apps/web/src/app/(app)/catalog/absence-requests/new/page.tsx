'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewAbsenceRequestRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/absence-requests?create=1');
  }, [router]);
  return null;
}
