'use client';

import { useParams } from 'next/navigation';
import { ScheduleForm } from '../ScheduleForm';

export default function EditWorkSchedulePage() {
  const { id } = useParams<{ id: string }>();
  return <ScheduleForm scheduleId={id} />;
}
