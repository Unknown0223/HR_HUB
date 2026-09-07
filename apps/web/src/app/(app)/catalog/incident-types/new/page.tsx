'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewIncidentTypeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/incident-types?create=1');
  }, [router]);
  return null;
}
