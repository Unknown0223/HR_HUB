'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewDynamicFieldRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/dynamic-fields?create=1');
  }, [router]);
  return null;
}
