'use client';

import { AccrualView } from '../AccrualView';
import { useParams } from 'next/navigation';

export default function AccrualViewPage() {
  const { id } = useParams<{ id: string }>();
  return <AccrualView id={id} />;
}
