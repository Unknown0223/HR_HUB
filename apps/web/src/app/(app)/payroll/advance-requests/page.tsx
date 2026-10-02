'use client';

import { Suspense } from 'react';
import { AdvanceRequestsPage } from './AdvanceRequestsPage';

export default function AdvanceRequestsRoute() {
  return (
    <Suspense fallback={null}>
      <AdvanceRequestsPage />
    </Suspense>
  );
}
