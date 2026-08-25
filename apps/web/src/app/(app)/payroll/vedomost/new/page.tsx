'use client';

import { Suspense } from 'react';
import { SheetForm } from '../SheetForm';

export default function NewSheetPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <SheetForm />
    </Suspense>
  );
}
