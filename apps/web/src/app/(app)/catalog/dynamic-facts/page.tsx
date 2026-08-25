'use client';

import { Suspense } from 'react';
import { DynamicObjectsPageInner } from '../dynamic-objects/page';
import shared from '../../../page-shared.module.css';

export default function DynamicFactsPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <DynamicObjectsPageInner kind="fact" />
    </Suspense>
  );
}
