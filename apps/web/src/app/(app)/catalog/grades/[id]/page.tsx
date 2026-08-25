'use client';

import { useParams } from 'next/navigation';
import { GradeForm } from '../GradeForm';

export default function EditGradePage() {
  const params = useParams();
  const id = String(params.id || '');
  return <GradeForm mode="edit" gradeId={id} />;
}
