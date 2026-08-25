'use client';

import { useParams } from 'next/navigation';
import { PositionTemplateForm } from '../../PositionTemplateForm';

export default function EditPositionTemplatePage() {
  const { id } = useParams<{ id: string }>();
  return <PositionTemplateForm templateId={id} />;
}
