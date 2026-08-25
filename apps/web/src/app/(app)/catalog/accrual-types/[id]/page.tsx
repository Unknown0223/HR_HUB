'use client';

import { use } from 'react';
import { AccrualTypeForm } from '../AccrualTypeForm';

export default function ViewAccrualTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AccrualTypeForm mode="view" id={id} />;
}
