'use client';

import { useParams } from 'next/navigation';
import { PositionScheduleForm } from '../PositionScheduleForm';

export default function EditPositionSchedulePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <p>Загрузка…</p>;
  return <PositionScheduleForm mode="edit" documentId={id} />;
}
