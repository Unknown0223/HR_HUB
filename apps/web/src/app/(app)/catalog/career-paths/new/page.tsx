'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewCareerPathRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/career-paths?create=1');
  }, [router]);
  return null;
}
