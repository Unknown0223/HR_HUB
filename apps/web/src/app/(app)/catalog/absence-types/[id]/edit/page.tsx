'use client';

import { useParams } from 'next/navigation';
import { AbsenceTypeForm } from '../../AbsenceTypeForm';

export default function EditAbsenceTypePage() {
  const { id } = useParams<{ id: string }>();
  return <AbsenceTypeForm typeId={id} mode="edit" />;
}
