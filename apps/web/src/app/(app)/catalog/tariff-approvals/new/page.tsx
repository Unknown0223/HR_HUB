'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewTariffApprovalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/tariff-approvals?create=1');
  }, [router]);
  return null;
}
