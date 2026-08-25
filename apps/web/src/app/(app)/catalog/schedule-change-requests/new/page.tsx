'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewScheduleChangeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/schedule-change-requests?create=1');
  }, [router]);
  return null;
}
