'use client';

import { use } from 'react';
import { IncidentForm } from '../IncidentForm';

export default function EditIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <IncidentForm mode="edit" incidentId={id} />;
}
