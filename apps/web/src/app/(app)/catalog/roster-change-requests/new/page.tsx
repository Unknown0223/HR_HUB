'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewRosterChangeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/roster-change-requests?create=1');
  }, [router]);
  return null;
}
