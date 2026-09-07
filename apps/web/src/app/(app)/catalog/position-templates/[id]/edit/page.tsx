'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /[id]/edit → list with edit modal */
export default function EditPositionTemplateRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/catalog/position-templates?edit=${encodeURIComponent(id)}`);
  }, [router, id]);
  return null;
}
