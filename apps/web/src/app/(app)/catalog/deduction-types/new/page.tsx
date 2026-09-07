'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewDeductionTypeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/deduction-types?create=1');
  }, [router]);
  return null;
}
