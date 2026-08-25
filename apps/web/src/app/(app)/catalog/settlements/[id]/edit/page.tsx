'use client';

import { useParams } from 'next/navigation';
import { SettlementForm } from '../../SettlementForm';

export default function SettlementEditPage() {
  const { id } = useParams<{ id: string }>();
  return <SettlementForm docId={id} />;
}
