'use client';

import { useParams } from 'next/navigation';
import { PositionForm } from '../../PositionForm';

export default function EditPositionPage() {
  const params = useParams();
  const id = String(params.id || '');
  return <PositionForm mode="edit" positionId={id} />;
}
