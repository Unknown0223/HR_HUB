'use client';

import { useParams } from 'next/navigation';
import { StaffPositionForm } from '../../StaffPositionForm';

export default function EditStaffPositionPage() {
  const params = useParams();
  const id = String(params.id || '');
  return <StaffPositionForm mode="edit" staffPositionId={id} />;
}
