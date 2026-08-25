'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

export type ScheduleKind = 'ordinary' | 'hourly' | 'advanced' | 'multi_shift' | 'advanced_multi_shift';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'Почасовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k.label]),
);

type DocRow = {
  id: string;
  status: string;
  kind: ScheduleKind | string;
  documentDate: string;
  number?: string | null;
  month: string;
  divisionId?: string | null;
  note?: string | null;
  verified?: boolean;
  division?: { id: string; name: string; code: string } | null;
  lines?: Array<{ id: string }>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtMonth(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function IndividualSchedulesInner() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<DocRow[]>('/api/catalog/schedule-overrides');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [createOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [
        r.number,
        r.kind,
        KIND_LABEL[r.kind],
        r.division?.name,
        r.note,
        r.status,
        fmtMonth(r.month),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  async function remove(row: DocRow) {
    if (row.status === 'posted') {
      setError('Проведённый документ нельзя удалить');
      return;
    }
    if (!(await confirm('Удалить документ?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/schedule-overrides/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="schedule-overrides" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.createWrap} ref={createRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen((v) => !v)}
            >
              Создать ▾
            </button>
            {createOpen ? (
              <div className={styles.createMenu}>
                {KINDS.map((k) => (
                  <Link
                    key={k.kind}
                    href={`/catalog/schedule-overrides/new?kind=${k.kind}`}
                    onClick={() => setCreateOpen(false)}
                  >
                    {k.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            ↻
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length}/{rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Дата</th>
              <th>Номер</th>
              <th>Месяц</th>
              <th>Тип графика</th>
              <th>Подразделение</th>
              <th>Проверен</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const posted = row.status === 'posted' || row.verified;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open ? styles.selected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{fmtDate(row.documentDate)}</td>
                    <td>{row.number || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{fmtMonth(row.month)}</td>
                    <td>{KIND_LABEL[row.kind] || row.kind}</td>
                    <td>{row.division?.name || '—'}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${posted ? styles.badgePosted : styles.badgeDraft}`}
                      >
                        {posted ? 'Да' : '—'}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div className={styles.rowDetail}>
                          <span className={styles.badge}>
                            {row.status === 'posted'
                              ? 'Проведён'
                              : row.status === 'cancelled'
                                ? 'Отменён'
                                : 'Черновик'}
                          </span>
                          <Link className={styles.linkBtn} href={`/catalog/schedule-overrides/${row.id}`}>
                            Открыть
                          </Link>
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              disabled={busy}
                              onClick={() => void remove(row)}
                            >
                              Удалить
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IndividualSchedulesPage() {
  return (
    <Suspense fallback={<p style={{ padding: '1rem', color: '#94a3b8' }}>Загрузка…</p>}>
      <IndividualSchedulesInner />
    </Suspense>
  );
}
