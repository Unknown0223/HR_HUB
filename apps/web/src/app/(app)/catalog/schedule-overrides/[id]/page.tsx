'use client';

import { useParams } from 'next/navigation';
import { IndividualScheduleForm } from '../IndividualScheduleForm';

export default function EditIndividualSchedulePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <p>Загрузка…</p>;
  return <IndividualScheduleForm mode="edit" documentId={id} />;
}
