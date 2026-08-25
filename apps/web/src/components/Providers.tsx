'use client';

import type { ReactNode } from 'react';
import { DialogHost } from '@/components/DialogHost';

/** Global client hosts (dialogs, etc.) outside feature shells. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <DialogHost />
      {children}
    </>
  );
}
