'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy /new → list with create modal */
export default function NewRosterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/catalog/rosters?create=1');
  }, [router]);
  return <p style={{ padding: '1rem', color: '#94a3b8' }}>Открываем форму создания…</p>;
}
