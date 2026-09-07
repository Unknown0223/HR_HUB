'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewReportTemplateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/report-templates?create=1');
  }, [router]);
  return null;
}
