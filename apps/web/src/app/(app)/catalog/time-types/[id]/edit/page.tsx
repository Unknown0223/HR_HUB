'use client';

import { useParams } from 'next/navigation';
import { TimeTypeForm } from '../../TimeTypeForm';

export default function EditTimeTypePage() {
  const { id } = useParams<{ id: string }>();
  return <TimeTypeForm typeId={id} />;
}
