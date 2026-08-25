'use client';

import { useParams } from 'next/navigation';
import { SettlementForm } from '../SettlementForm';

export default function SettlementViewPage() {
  const { id } = useParams<{ id: string }>();
  return <SettlementForm docId={id} />;
}
