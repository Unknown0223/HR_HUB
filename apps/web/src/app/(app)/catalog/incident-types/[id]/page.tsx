'use client';

import { use } from 'react';
import { IncidentTypeForm } from '../IncidentTypeForm';

export default function EditIncidentTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <IncidentTypeForm mode="edit" typeId={id} />;
}
