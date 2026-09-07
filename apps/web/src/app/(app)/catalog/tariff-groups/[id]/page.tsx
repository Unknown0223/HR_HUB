'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /[id] → list with edit modal */
export default function EditTariffGroupRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/catalog/tariff-groups?edit=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}
