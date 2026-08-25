'use client';

import { useParams } from 'next/navigation';
import { DynamicFieldForm } from '../../DynamicFieldForm';

export default function EditDynamicFieldPage() {
  const { id } = useParams<{ id: string }>();
  return <DynamicFieldForm fieldId={id} />;
}
