'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewTariffGroupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/tariff-groups?create=1');
  }, [router]);
  return null;
}
