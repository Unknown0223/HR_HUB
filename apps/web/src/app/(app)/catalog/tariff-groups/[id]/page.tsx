'use client';

import { useParams } from 'next/navigation';
import { TariffGroupForm } from '../TariffGroupForm';

export default function EditTariffGroupPage() {
  const params = useParams();
  return <TariffGroupForm mode="edit" groupId={String(params.id || '')} />;
}
