'use client';

import { useParams } from 'next/navigation';
import { TimesheetCorrectionForm } from '../TimesheetCorrectionForm';

export default function EditTimesheetCorrectionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <p>Загрузка…</p>;
  return <TimesheetCorrectionForm mode="edit" correctionId={id} />;
}
