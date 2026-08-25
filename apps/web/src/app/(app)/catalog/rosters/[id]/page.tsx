'use client';

import { useParams } from 'next/navigation';
import { RosterForm } from '../RosterForm';

export default function EditRosterPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return <p>Загрузка…</p>;
  return <RosterForm mode="edit" rosterId={params.id} />;
}
