'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewGradePromotionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/grade-history?create=1');
  }, [router]);
  return null;
}
