'use client';

import { useParams } from 'next/navigation';
import { AccrualEntries } from '../../AccrualEntries';

export default function AccrualEntriesPage() {
  const { id } = useParams<{ id: string }>();
  return <AccrualEntries id={id} />;
}
