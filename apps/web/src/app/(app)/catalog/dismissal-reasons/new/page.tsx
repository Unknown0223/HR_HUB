'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewDismissalReasonRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/dismissal-reasons?create=1');
  }, [router]);
  return null;
}
