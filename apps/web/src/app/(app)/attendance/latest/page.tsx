'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from './page.module.css';

type Mark = {
  id: string;
  occurredAt: string;
  markType: string;
  markTypeLabel: string;
  photoUrl?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    position?: { name: string } | null;
    person?: { photoUrl?: string | null } | null;
    faceProfile?: { photoUrl?: string | null } | null;
  } | null;
};

function LatestInner() {
  const router = useRouter();
  const [rows, setRows] = useState<Mark[]>([]);
  const [error, setError] = useState('');
  const photos = usePhotoLightbox();

  async function load() {
    setError('');
    try {
      const data = await apiFetch<Mark[]>('/api/attendance/marks/latest?limit=12');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" titleOverride="Отображение последних отметок" />
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => router.push('/attendance/marks')}
        >
          Закрыть
        </button>
        <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
          Настройки
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.grid}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Нет данных</p>
        ) : (
          rows.map((m) => {
            const e = m.employee;
            const name = e
              ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
              : '—';
            const photo = mediaSrc(
              m.photoUrl || e?.faceProfile?.photoUrl || e?.person?.photoUrl,
            );
            const slides = rows
              .flatMap((x) => {
                const pe = x.employee;
                const nm = pe
                  ? [pe.lastName, pe.firstName, pe.middleName].filter(Boolean).join(' ')
                  : '—';
                const markSrc = mediaSrc(x.photoUrl);
                const faceSrc = mediaSrc(pe?.faceProfile?.photoUrl || pe?.person?.photoUrl);
                const items: { src: string; caption: string }[] = [];
                if (markSrc) items.push({ src: markSrc, caption: `${nm} · отметка` });
                if (faceSrc && faceSrc !== markSrc) {
                  items.push({ src: faceSrc, caption: nm });
                }
                return items;
              });
            const idx = photo ? slides.findIndex((s) => s.src === photo) : -1;
            const badge =
              m.markType === 'in'
                ? styles.badgeIn
                : m.markType === 'out'
                  ? styles.badgeOut
                  : styles.badgeMark;
            return (
              <article key={m.id} className={styles.card}>
                {photo ? (
                  <PhotoThumb
                    src={photo}
                    alt=""
                    className={styles.photo}
                    lightbox={photos}
                    slides={slides}
                    index={idx < 0 ? 0 : idx}
                  />
                ) : (
                  <span className={styles.photoEmpty} />
                )}
                <h3>
                  {e?.id ? (
                    <Link href={`/employees/${e.id}?tab=attendance`}>{name}</Link>
                  ) : (
                    name
                  )}
                </h3>
                <p className={styles.pos}>{e?.position?.name || '—'}</p>
                <span className={badge}>{m.markTypeLabel}</span>
                <time>
                  {new Date(m.occurredAt)
                    .toISOString()
                    .slice(0, 19)
                    .replace('T', ' ')}
                </time>
              </article>
            );
          })
        )}
      </div>
      {photos.node}
    </div>
  );
}

export default function LatestMarksPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LatestInner />
    </Suspense>
  );
}
