'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewIncidentPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/incidents?create=1');
  }, [router]);
  return null;
}
