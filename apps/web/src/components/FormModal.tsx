'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './form-modal.module.css';

export function FormModal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
      document.documentElement.style.setProperty(
        '--form-modal-scrollbar',
        `${scrollbar}px`,
      );
    }
    document.documentElement.classList.add('form-modal-open');

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      document.documentElement.style.removeProperty('--form-modal-scrollbar');
      document.documentElement.classList.remove('form-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={styles.root} role="presentation">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div className={styles.center}>
        <div
          className={`${styles.dialog} ${styles[width]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className={styles.head}>
            <h2 id="form-modal-title" className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.closeX}
              aria-label="Закрыть"
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
