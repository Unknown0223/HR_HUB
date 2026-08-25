'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from './page.module.css';

type HistoryItem = {
  at?: string;
  by?: string;
  event?: string;
  occurredAt?: string;
  markType?: string;
  markTypeLabel?: string;
  isValid?: boolean;
};

type Mark = {
  id: string;
  occurredAt: string;
  markType: string;
  markTypeLabel: string;
  isValid?: boolean;
  faceRecognized?: boolean;
  photoUrl?: string | null;
  locationName?: string | null;
  deviceSerial?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  identificationType?: string | null;
  bssid?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  createdByLabel?: string | null;
  updatedByLabel?: string | null;
  createdAt?: string | null;
  changeHistory?: HistoryItem[];
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber?: string;
    faceProfile?: { photoUrl?: string | null } | null;
  } | null;
};

function empName(m: Mark) {
  const e = m.employee;
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function MarkDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<'main' | 'history'>('main');
  const [mark, setMark] = useState<Mark | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [histQ, setHistQ] = useState('');
  const [histDetail, setHistDetail] = useState<HistoryItem | null>(null);
  const photos = usePhotoLightbox();

  async function load() {
    setError('');
    try {
      const data = await apiFetch<Mark>(`/api/attendance/marks/${id}`);
      setMark(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const photo = mediaSrc(mark?.photoUrl) || null;
  const face = mediaSrc(mark?.employee?.faceProfile?.photoUrl) || null;
  const name = mark ? empName(mark) : '';
  const slides = [
    photo ? { src: photo, caption: `Отметка · ${name}` } : null,
    face && face !== photo ? { src: face, caption: `Аватар · ${name}` } : null,
  ].filter((s): s is { src: string; caption: string } => Boolean(s));
  const history = useMemo(() => {
    const rows = mark?.changeHistory || [];
    const q = histQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((h) =>
      [h.by, h.event, h.markTypeLabel, h.at].some((x) =>
        String(x || '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [mark, histQ]);

  const mapSrc = useMemo(() => {
    const lat = mark?.latitude ?? 41.3111;
    const lon = mark?.longitude ?? 69.2797;
    return `https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=14&pt=${lon},${lat},pm2blm&l=map`;
  }, [mark]);

  async function toggleValid() {
    if (!mark) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/marks/${mark.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isValid: mark.isValid === false }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!mark && !error) return <p className={styles.loading}>Загрузка…</p>;
  if (!mark) return <p className={styles.error}>{error}</p>;

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <h1>Отметка (просмотр)</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnDanger}
            disabled={busy}
            onClick={() => void toggleValid()}
          >
            {mark.isValid === false ? 'Сделать действ.' : 'Сделать недейств.'}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/attendance/marks')}
          >
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          {photo ? (
            <PhotoThumb
              src={photo}
              alt=""
              className={styles.photo}
              lightbox={photos}
              slides={slides}
              index={0}
            />
          ) : face ? (
            <PhotoThumb
              src={face}
              alt=""
              className={styles.photo}
              lightbox={photos}
              slides={slides}
              index={0}
            />
          ) : (
            <div className={styles.photoEmpty}>Нет фото</div>
          )}
          <div className={styles.sideTitle}>
            Отметка ({empName(mark)}, {fmtDt(mark.occurredAt)})
          </div>
          <div className={styles.badges}>
            {mark.faceRecognized || mark.identificationType?.includes('лиц') ? (
              <span className={styles.badgeInfo}>Лицо распознано</span>
            ) : null}
            <span className={styles.badgeType}>{mark.markTypeLabel}</span>
            <span className={mark.isValid === false ? styles.badgeBad : styles.badgeOk}>
              {mark.isValid === false ? 'Недействительная' : 'Действительная'}
            </span>
          </div>
          <nav className={styles.sideNav}>
            <button
              type="button"
              className={tab === 'main' ? styles.sideActive : styles.sideLink}
              onClick={() => setTab('main')}
            >
              Основная информация
            </button>
            <button
              type="button"
              className={tab === 'history' ? styles.sideActive : styles.sideLink}
              onClick={() => setTab('history')}
            >
              История изменений
            </button>
          </nav>
        </aside>

        <section className={styles.main}>
          {tab === 'main' ? (
            <>
              <div className={styles.fields}>
                <label>
                  <span>Физическое лицо</span>
                  {mark.employee?.id ? (
                    <Link href={`/employees/${mark.employee.id}`}>{empName(mark)}</Link>
                  ) : (
                    <b>{empName(mark)}</b>
                  )}
                </label>
                <label>
                  <span>Время</span>
                  <b>{fmtDt(mark.occurredAt)}</b>
                </label>
                <label>
                  <span>Локация</span>
                  <b>{mark.locationName || '—'}</b>
                </label>
                <label>
                  <span>Серийный номер устройства</span>
                  <b>{mark.deviceSerial || '—'}</b>
                </label>
                <label>
                  <span>Название устройства</span>
                  <b>{mark.deviceName || '—'}</b>
                </label>
                <label>
                  <span>Тип устройства</span>
                  <b>{mark.deviceType || '—'}</b>
                </label>
                <label>
                  <span>Тип идентификации</span>
                  <b>{mark.identificationType || '—'}</b>
                </label>
                <label>
                  <span>BSSID</span>
                  <b>{mark.bssid || '—'}</b>
                </label>
                <label className={styles.full}>
                  <span>Примечание</span>
                  <b>{mark.note || '—'}</b>
                </label>
              </div>
              <div className={styles.mapWrap}>
                <iframe title="mark-map" src={mapSrc} className={styles.map} />
              </div>
              <div className={styles.audit}>
                <div>
                  <span>Создал</span>
                  <b>{mark.createdByLabel || 'System'}</b>
                </div>
                <div>
                  <span>Изменил</span>
                  <b>{mark.updatedByLabel || 'System'}</b>
                </div>
                <div>
                  <span>Время создания</span>
                  <b>{fmtDt(mark.createdAt || mark.occurredAt)}</b>
                </div>
                <div>
                  <span>Дата изменения</span>
                  <b>{fmtDt(mark.createdAt || mark.occurredAt)}</b>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.histToolbar}>
                <h2>История изменений</h2>
                <input
                  placeholder="Поиск..."
                  value={histQ}
                  onChange={(e) => setHistQ(e.target.value)}
                />
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата и время события</th>
                    <th>Пользователь</th>
                    <th>Событие</th>
                    <th>Время</th>
                    <th>Тип отметки</th>
                    <th>Действительна</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    history.map((h, i) => (
                      <tr key={`${h.at}-${i}`}>
                        <td>{fmtDt(h.at)}</td>
                        <td>{h.by || 'System'}</td>
                        <td>{h.event || '—'}</td>
                        <td>{fmtDt(h.occurredAt || mark.occurredAt)}</td>
                        <td>{h.markTypeLabel || h.markType || mark.markTypeLabel}</td>
                        <td>
                          <span
                            className={
                              h.isValid === false ? styles.badgeBad : styles.badgeOk
                            }
                          >
                            {h.isValid === false ? 'Нет' : 'Да'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => setHistDetail(h)}
                          >
                            Детали
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>

      {histDetail ? (
        <div className={styles.modalBackdrop} role="dialog">
          <div className={styles.modal}>
            <h3>Детали истории изменений</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Поле</th>
                  <th>Старое значение</th>
                  <th>Новое значение</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Дата отметки</td>
                  <td />
                  <td>{fmtDt(histDetail.occurredAt || mark.occurredAt).slice(0, 10)}</td>
                </tr>
                <tr>
                  <td>Физическое лицо</td>
                  <td />
                  <td>{empName(mark)}</td>
                </tr>
                <tr>
                  <td>Тип отметки</td>
                  <td />
                  <td>{histDetail.markTypeLabel || mark.markTypeLabel}</td>
                </tr>
                <tr>
                  <td>Тип идентификации</td>
                  <td />
                  <td>{mark.identificationType || '—'}</td>
                </tr>
                <tr>
                  <td>Локация</td>
                  <td />
                  <td>{mark.locationName || '—'}</td>
                </tr>
                <tr>
                  <td>Точность (м)</td>
                  <td />
                  <td>{mark.accuracyM ?? '—'}</td>
                </tr>
              </tbody>
            </table>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setHistDetail(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {photos.node}
    </div>
  );
}

export default function MarkDetailPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <MarkDetailInner />
    </Suspense>
  );
}
