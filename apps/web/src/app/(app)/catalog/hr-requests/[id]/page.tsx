'use client';

import { useParams } from 'next/navigation';
import { HrChangeRequestForm } from '../HrChangeRequestForm';

export default function EditHrRequestPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <p>Загрузка…</p>;
  return <HrChangeRequestForm mode="edit" requestId={id} />;
}
