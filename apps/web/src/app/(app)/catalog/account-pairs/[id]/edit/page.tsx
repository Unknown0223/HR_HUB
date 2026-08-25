'use client';

import { useParams } from 'next/navigation';
import { AccountPairForm } from '../../AccountPairForm';

export default function EditAccountPairPage() {
  const { id } = useParams<{ id: string }>();
  return <AccountPairForm pairId={id} />;
}
