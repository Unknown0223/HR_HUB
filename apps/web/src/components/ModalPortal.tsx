'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  children: ReactNode;
  /** When false, portal is not rendered and body scroll lock is released. Default true. */
  open?: boolean;
};

/**
 * Renders modals on document.body so fixed centering is never offset by
 * parent transform/overflow. `open` defaults to true for call-sites that
 * already gate children with `if (!open) return null`.
 */
export function ModalPortal({ children, open = true }: Props) {
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setBody(document.body);
  }, []);

  useEffect(() => {
    if (!body || !open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.documentElement.style.getPropertyValue(
      '--form-modal-scrollbar',
    );
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sb > 0) {
      document.documentElement.style.setProperty(
        '--form-modal-scrollbar',
        `${sb}px`,
      );
    }
    document.documentElement.classList.add('form-modal-open');
    return () => {
      document.body.style.overflow = prevOverflow;
      if (prevPad) {
        document.documentElement.style.setProperty(
          '--form-modal-scrollbar',
          prevPad,
        );
      } else {
        document.documentElement.style.removeProperty('--form-modal-scrollbar');
      }
      document.documentElement.classList.remove('form-modal-open');
    };
  }, [body, open]);

  if (!body || !open) return null;
  return createPortal(children, body);
}
