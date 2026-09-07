'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /[id] → list with edit modal */
export default function EditIncidentTypeRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/catalog/incident-types?edit=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}
