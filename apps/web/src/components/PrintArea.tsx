import { ReactNode } from 'react';
import shared from '@/app/page-shared.module.css';

export type PrintAreaProps = {
  children: ReactNode;
  /** Screen-only content (hidden when printing) */
  screen?: ReactNode;
  className?: string;
  /** Sets data-print="report" for report-style print tables */
  report?: boolean;
};

/** Wrap printable content; screen chrome uses noPrint, print body uses printArea. */
export function PrintArea({ children, screen, className, report }: PrintAreaProps) {
  return (
    <>
      {screen ? <div className="noPrint">{screen}</div> : null}
      <div
        className={['printArea', shared.printArea, className].filter(Boolean).join(' ')}
        data-print={report ? 'report' : undefined}
      >
        {children}
      </div>
    </>
  );
}
