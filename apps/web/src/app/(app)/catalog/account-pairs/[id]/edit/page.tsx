'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy /edit → list with edit modal */
export default function EditAccountPairRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    if (id) router.replace(`/catalog/account-pairs?edit=${encodeURIComponent(id)}`);
    else router.replace('/catalog/account-pairs');
  }, [router, id]);
  return null;
}
