'use client';

import { use } from 'react';
import { DeductionTypeForm } from '../../DeductionTypeForm';

export default function ViewDeductionTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DeductionTypeForm mode="view" id={id} />;
}
