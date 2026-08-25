'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewLocationRequestPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/location-requests?create=1');
  }, [router]);
  return null;
}
