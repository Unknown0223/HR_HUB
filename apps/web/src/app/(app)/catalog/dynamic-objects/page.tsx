'use client';

import { Suspense } from 'react';
import { DynamicObjectsPageInner } from './DynamicObjectsPageInner';
import shared from '../../../page-shared.module.css';

function ObjectsSuspense({ kind }: { kind: 'entity' | 'fact' }) {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <DynamicObjectsPageInner kind={kind} />
    </Suspense>
  );
}

export default function DynamicObjectsPage() {
  return <ObjectsSuspense kind="entity" />;
}
