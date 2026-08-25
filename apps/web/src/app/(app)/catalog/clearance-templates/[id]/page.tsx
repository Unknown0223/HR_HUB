'use client';

import { use } from 'react';
import { ClearanceTemplateForm } from '../ClearanceTemplateForm';

export default function EditClearanceTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ClearanceTemplateForm mode="edit" templateId={id} />;
}
