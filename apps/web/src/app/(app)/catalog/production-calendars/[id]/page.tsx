'use client';

import { useParams } from 'next/navigation';
import { ProductionCalendarForm } from '../ProductionCalendarForm';

export default function EditProductionCalendarPage() {
  const { id } = useParams<{ id: string }>();
  return <ProductionCalendarForm calendarId={id} />;
}
