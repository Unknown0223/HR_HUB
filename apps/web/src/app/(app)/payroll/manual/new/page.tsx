'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewManualPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/payroll/manual?create=1');
  }, [router]);
  return null;
}
