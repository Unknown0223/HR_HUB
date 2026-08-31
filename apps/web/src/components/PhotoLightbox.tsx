'use client';

import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { mediaSrc } from '@/lib/media';
import styles from './PhotoLightbox.module.css';

export type PhotoSlide = {
  src: string;
  caption?: string;
};

export function usePhotoLightbox() {
  const [state, setState] = useState<{ slides: PhotoSlide[]; index: number } | null>(
    null,
  );

  const open = useCallback((slides: PhotoSlide[], index = 0) => {
    const valid = slides
      .map((s) => ({ ...s, src: mediaSrc(s.src) || '' }))
      .filter((s) => s.src);
    if (!valid.length) return;
    const i = Math.min(Math.max(0, index), valid.length - 1);
    setState({ slides: valid, index: i });
  }, []);

  const close = useCallback(() => setState(null), []);

  return {
    open,
    close,
    node: state ? (
      <PhotoLightbox
        slides={state.slides}
        index={state.index}
        onClose={close}
        onIndex={(index) =>
          setState((cur) => (cur ? { ...cur, index } : cur))
        }
      />
    ) : null,
  };
}

export type PhotoLightboxApi = ReturnType<typeof usePhotoLightbox>;

export function PhotoThumb({
  src,
  className,
  alt = '',
  slides,
  index = 0,
  lightbox,
  width,
  height,
}: {
  src: string;
  className?: string;
  alt?: string;
  slides: PhotoSlide[];
  index?: number;
  lightbox: PhotoLightboxApi;
  width?: number;
  height?: number;
}) {
  const resolved = mediaSrc(src) || src;
  const open = (e: MouseEvent | ReactKeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    lightbox.open(slides.length ? slides : [{ src: resolved, caption: alt }], index);
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') open(e);
      }}
    />
  );
}

export function PhotoLightbox({
  slides,
  index,
  onClose,
  onIndex,
}: {
  slides: PhotoSlide[];
  index: number;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const total = slides.length;
  const current = slides[index] || slides[0];
  const hasMany = total > 1;

  const go = useCallback(
    (dir: -1 | 1) => {
      if (!hasMany) return;
      onIndex((index + dir + total) % total);
    },
    [hasMany, index, onIndex, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  useEffect(() => {
    let startX = 0;
    const el = document.getElementById('photo-lightbox-stage');
    if (!el) return undefined;
    const down = (e: TouchEvent) => {
      startX = e.changedTouches[0]?.clientX ?? 0;
    };
    const up = (e: TouchEvent) => {
      const x = e.changedTouches[0]?.clientX ?? 0;
      const dx = x - startX;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', up);
    };
  }, [go]);

  if (!current?.src) return null;

  return (
    <ModalPortal>
      <div className={styles.overlay} onClick={onClose} role="presentation">
        <div
          className={styles.box}
          id="photo-lightbox-stage"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || 'Фото'}
        >
          {hasMany ? (
            <button
              type="button"
              className={`${styles.nav} ${styles.prev}`}
              onClick={() => go(-1)}
              aria-label="Предыдущее фото"
            >
              ‹
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.img} src={current.src} alt={current.caption || ''} />
          {hasMany ? (
            <button
              type="button"
              className={`${styles.nav} ${styles.next}`}
              onClick={() => go(1)}
              aria-label="Следующее фото"
            >
              ›
            </button>
          ) : null}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
          <div className={styles.meta}>
            {hasMany ? (
              <span className={styles.count}>
                {index + 1} / {total}
              </span>
            ) : null}
            {current.caption ? <span className={styles.caption}>{current.caption}</span> : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
