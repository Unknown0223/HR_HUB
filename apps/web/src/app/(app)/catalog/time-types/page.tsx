'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

type ParentRef = { id: string; name: string; code: string };

type TimeTypeRow = {
  id: string;
  code: string;
  name: string;
  letterCode?: string | null;
  digitalCode?: string | null;
  planLoad?: string | null;
  color?: string | null;
  parentId?: string | null;
  isPaid?: boolean;
  isActive?: boolean;
  parent?: ParentRef | null;
};

const PLAN_LOADS: { value: string; label: string }[] = [
  { value: 'partial', label: 'Частичная' },
  { value: 'full', label: 'Полная' },
  { value: 'unplanned', label: 'Внеплановая' },
];

function planLoadLabel(v?: string | null) {
  return PLAN_LOADS.find((p) => p.value === v)?.label || v || '—';
}

function letterOf(row: TimeTypeRow) {
  if (row.letterCode && String(row.letterCode).trim()) return String(row.letterCode).trim();
  const c = (row.code || '').trim();
  if (c && c.length <= 3) return c;
  return c ? c.slice(0, 1) : '';
}

function TimeTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<TimeTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [
        r.name,
        r.code,
        r.letterCode,
        r.digitalCode,
        r.parent?.name,
        planLoadLabel(r.planLoad),
        r.color,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TimeTypeRow[] | { items: TimeTypeRow[] }>(
        '/api/catalog/time-types',
      );
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { items?: TimeTypeRow[] }).items)
          ? (data as { items: TimeTypeRow[] }).items
          : [];
      setRows(list);
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/time-types?${qs}` : '/catalog/time-types', {
      scroll: false,
    });
  }

  function openCreate() {
    router.push('/catalog/time-types/new');
  }

  function openEdit(row: TimeTypeRow) {
    router.push(`/catalog/time-types/${row.id}/edit`);
  }

  async function runDelete(row: TimeTypeRow) {
    const ok = await confirm(`Удалить вид «${row.name}»?`);
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/time-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `time-types-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        Родитель: r.parent?.name || '',
        'Буквенный код': letterOf(r),
        'Цифровой код': r.digitalCode || '',
        'Нагрузка на план': planLoadLabel(r.planLoad),
        Цвет: r.color || '',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="time-types" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <Link href="/catalog/absence-types" className={styles.exportBtn}>
            Закрыть
          </Link>
        </div>

        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Родитель</th>
              <th>Буквенный код</th>
              <th>Цифровой код</th>
              <th>Нагрузка на план</th>
              <th>Цвет</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const hex = row.color || '';
              return (
                <tr
                  key={row.id}
                  className={open ? styles.rowSelected : undefined}
                  onClick={() => setSelectedId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={styles.nameCell}>
                    <label className={styles.nameWithCheck}>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className={styles.nameText}>
                        {row.name}
                        {row.isActive === false ? ' (неакт.)' : ''}
                      </span>
                    </label>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button type="button" onClick={() => openEdit(row)}>
                          Изменить
                        </button>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => void runDelete(row)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.parent?.name || ''}</td>
                  <td>{letterOf(row)}</td>
                  <td>{row.digitalCode || ''}</td>
                  <td>{planLoadLabel(row.planLoad)}</td>
                  <td>
                    {hex ? (
                      <span className={styles.colorSwatch}>
                        <span className={styles.colorBox} style={{ background: hex }} />
                        <span className={styles.colorHex}>{hex}</span>
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TimeTypesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <TimeTypesPageInner />
    </Suspense>
  );
}
