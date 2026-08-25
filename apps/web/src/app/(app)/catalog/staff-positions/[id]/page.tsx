'use client';

import { useParams } from 'next/navigation';
import { StaffPositionForm } from '../StaffPositionForm';

export default function ViewStaffPositionPage() {
  const params = useParams();
  const id = String(params.id || '');
  return <StaffPositionForm mode="view" staffPositionId={id} />;
}
