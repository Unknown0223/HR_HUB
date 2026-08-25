'use client';

import shared from '@/app/page-shared.module.css';

export type PrintButtonProps = {
  label?: string;
  className?: string;
};

export function PrintButton({ label = 'Печать', className }: PrintButtonProps) {
  return (
    <button
      type="button"
      className={[shared.btnSecondary, shared.btnSm, 'noPrint', className]
        .filter(Boolean)
        .join(' ')}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
