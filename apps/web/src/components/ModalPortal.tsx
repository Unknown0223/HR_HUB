'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renders modals on document.body so fixed centering is never offset by parent transform/overflow. */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('form-modal-open');
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.classList.remove('form-modal-open');
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
