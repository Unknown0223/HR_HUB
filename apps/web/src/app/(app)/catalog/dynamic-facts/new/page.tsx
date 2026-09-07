'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewDynamicFactRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/dynamic-facts?create=1');
  }, [router]);
  return null;
}
