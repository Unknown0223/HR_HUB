'use client';

import { use } from 'react';
import { AccrualTypeForm } from '../../AccrualTypeForm';

export default function EditAccrualTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AccrualTypeForm mode="edit" id={id} />;
}
