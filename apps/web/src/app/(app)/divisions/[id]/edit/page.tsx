'use client';

import { use } from 'react';
import { DivisionForm } from '../../DivisionForm';

export default function EditDivisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DivisionForm mode="edit" divisionId={id} />;
}
