'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  __bindDialogHost,
  __resolveDialog,
  type AlertOptions,
  type ConfirmOptions,
} from '@/lib/dialogs';
import styles from './dialogs.module.css';

type HostState =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'alert'; options: AlertOptions }
  | null;

function iconFor(
  kind: 'confirm' | 'alert',
  variant?: string,
): { cls: string; glyph: string } {
  if (variant === 'danger') return { cls: styles.iconDanger, glyph: '!' };
  if (variant === 'success') return { cls: styles.iconSuccess, glyph: '✓' };
  if (variant === 'primary') return { cls: styles.iconPrimary, glyph: '?' };
  if (kind === 'alert') return { cls: styles.iconDefault, glyph: 'i' };
  return { cls: styles.iconPrimary, glyph: '?' };
}

function confirmBtnClass(variant?: string) {
  if (variant === 'danger') return styles.btnDanger;
  if (variant === 'success') return styles.btnSuccess;
  return styles.btnPrimary;
}

export function DialogHost() {
  const [pending, setPending] = useState<HostState>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
    __bindDialogHost((p) => {
      if (!p) {
        setPending(null);
        return;
      }
      setPending({ kind: p.kind, options: p.options } as HostState);
    });
    return () => {
      __bindDialogHost(null);
    };
  }, []);

  const close = useCallback((result: boolean | void) => {
    __resolveDialog(result);
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(pending?.kind === 'confirm' ? false : undefined);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        close(pending?.kind === 'confirm' ? true : undefined);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  if (!mounted || !pending) return null;

  const { options, kind } = pending;
  const icon = iconFor(kind, options.variant);

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => close(kind === 'confirm' ? false : undefined)}
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={`${styles.icon} ${icon.cls}`} aria-hidden>
            {icon.glyph}
          </span>
          <h2 id={titleId} className={styles.title}>
            {options.title}
          </h2>
        </div>
        <div className={styles.body}>{options.message}</div>
        <div className={styles.footer}>
          {kind === 'confirm' ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => close(false)}
                autoFocus={false}
              >
                {(options as ConfirmOptions).cancelText || 'Отмена'}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${confirmBtnClass(options.variant)}`}
                onClick={() => close(true)}
                autoFocus
              >
                {(options as ConfirmOptions).confirmText || 'Подтвердить'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${confirmBtnClass(options.variant === 'danger' ? 'danger' : 'primary')}`}
              onClick={() => close()}
              autoFocus
            >
              {(options as AlertOptions).okText || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
