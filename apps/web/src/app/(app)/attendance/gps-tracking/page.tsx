'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from './page.module.css';

type EmpCard = {
  id: string;
  fullName: string;
  code: string;
  phone?: string | null;
  photoUrl?: string | null;
};

type Mark = {
  id: string;
  markType: string;
  markTypeLabel: string;
  occurredAt: string;
};

type Detail = {
  employee: EmpCard;
  date: string;
  marks: Mark[];
  tracks: { id: string; latitude: number; longitude: number; recordedAt: string }[];
  lastPoint: { latitude: number; longitude: number } | null;
};

function GpsTrackingInner() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [emps, setEmps] = useState<EmpCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [leftOpen, setLeftOpen] = useState(true);
  const photos = usePhotoLightbox();
  const [rightOpen, setRightOpen] = useState(true);

  const mapSrc = useMemo(() => {
    const p = detail?.lastPoint || detail?.tracks?.[detail.tracks.length - 1];
    const lat = p?.latitude ?? 41.3111;
    const lon = p?.longitude ?? 69.2797;
    return `https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=14&l=map`;
  }, [detail]);

  async function loadBoard() {
    setError('');
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const data = await apiFetch<EmpCard[]>(`/api/attendance/gps-tracking${qs}`);
      setEmps(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function loadDetail(id: string, d = date) {
    try {
      const data = await apiFetch<Detail>(
        `/api/attendance/gps-tracking/${id}?date=${encodeURIComponent(d)}`,
      );
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, date]);

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" titleOverride="GPS отслеживание" />
      <div className={styles.toolbar}>
        <button type="button" className={styles.btnBlue} onClick={() => void loadBoard()}>
          Обновить
        </button>
        <button type="button" className={styles.btnBlue}>
          Загрузка всех полигонов
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => router.push('/attendance/marks')}
        >
          Закрыть
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div
        className={styles.board}
        style={{
          gridTemplateColumns: `${leftOpen ? '280px' : '0px'} 1fr ${rightOpen ? '280px' : '0px'}`,
        }}
      >
        <aside className={styles.left} hidden={!leftOpen}>
          <div className={styles.searchRow}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadBoard();
              }}
            />
          </div>
          <div className={styles.list}>
            {emps.map((e) => {
              const src = mediaSrc(e.photoUrl);
              const slides = emps
                .map((x) => ({ src: mediaSrc(x.photoUrl) || '', caption: x.fullName }))
                .filter((s) => s.src);
              const idx = src ? slides.findIndex((s) => s.src === src) : -1;
              return (
              <button
                key={e.id}
                type="button"
                className={selectedId === e.id ? styles.cardActive : styles.card}
                onClick={() => setSelectedId(e.id)}
              >
                {src ? (
                  <PhotoThumb
                    src={src}
                    alt=""
                    className={styles.avatar}
                    lightbox={photos}
                    slides={slides}
                    index={idx < 0 ? 0 : idx}
                  />
                ) : (
                  <span className={styles.avatarEmpty} />
                )}
                <span className={styles.cardBody}>
                  <strong>{e.fullName}</strong>
                  <span>{e.code}</span>
                  <span>{e.phone || '—'}</span>
                </span>
              </button>
              );
            })}
          </div>
        </aside>

        <div className={styles.mapPane}>
          <button
            type="button"
            className={styles.collapse}
            style={{ left: 8 }}
            onClick={() => setLeftOpen((v) => !v)}
          >
            {leftOpen ? '‹' : '›'}
          </button>
          <iframe title="gps-map" src={mapSrc} className={styles.map} />
          <button
            type="button"
            className={styles.collapse}
            style={{ right: 8 }}
            onClick={() => setRightOpen((v) => !v)}
          >
            {rightOpen ? '›' : '‹'}
          </button>
        </div>

        <aside className={styles.right} hidden={!rightOpen}>
          <label className={styles.dateField}>
            <span>Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className={styles.timeline}>
            {!detail?.marks?.length ? (
              <p className={styles.empty}>Нет данных</p>
            ) : (
              detail.marks.map((m) => {
                const time = new Date(m.occurredAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const tone =
                  m.markType === 'in'
                    ? styles.tlIn
                    : m.markType === 'out'
                      ? styles.tlOut
                      : styles.tlMark;
                return (
                  <div key={m.id} className={styles.tlItem}>
                    <span className={tone} />
                    <div>
                      <strong>{time}</strong>
                      <div>{m.markTypeLabel}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
      {photos.node}
    </div>
  );
}

export default function GpsTrackingPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <GpsTrackingInner />
    </Suspense>
  );
}
