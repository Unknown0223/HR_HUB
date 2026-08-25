'use client';

import { useParams } from 'next/navigation';
import { ReportTemplateForm } from '../../ReportTemplateForm';

export default function EditReportTemplatePage() {
  const { id } = useParams<{ id: string }>();
  return <ReportTemplateForm templateId={id} />;
}
