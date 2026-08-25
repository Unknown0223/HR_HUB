'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewInternalTripPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/internal-trips?scope=mine&create=1');
  }, [router]);
  return null;
}
