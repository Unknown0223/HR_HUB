'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewFactTypeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/fact-types?create=1');
  }, [router]);
  return null;
}
