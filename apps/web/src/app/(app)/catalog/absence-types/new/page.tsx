'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewAbsenceTypeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/absence-types?create=1');
  }, [router]);
  return null;
}
