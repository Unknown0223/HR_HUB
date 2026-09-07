'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewClearanceTemplateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/clearance-templates?create=1');
  }, [router]);
  return null;
}
