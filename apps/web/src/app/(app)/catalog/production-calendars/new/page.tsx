'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewProductionCalendarRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/production-calendars?create=1');
  }, [router]);
  return null;
}
