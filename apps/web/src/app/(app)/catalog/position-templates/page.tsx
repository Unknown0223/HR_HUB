'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

type Ref = { id: string; code?: string; name: string };

type PositionTemplateRow = {
  id: string;
  code: string;
  divisionId?: string | null;
  positionId?: string | null;
  gradeId?: string | null;
  scheduleId?: string | null;
  tariffGroupId?: string | null;
  isActive?: boolean;
  division?: Ref | null;
  position?: Ref | null;
  grade?: Ref | null;
  schedule?: Ref | null;
  tariffGroup?: Ref | null;
};

function PositionTemplatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<PositionTemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [
        r.code,
        r.division?.name,
        r.position?.name,
        r.grade?.name,
        r.schedule?.name,
        r.tariffGroup?.name,
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
      const data = await apiFetch<
        PositionTemplateRow[] | { items: PositionTemplateRow[] }
      >('/api/catalog/position-templates');
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { items?: PositionTemplateRow[] }).items)
          ? (data as { items: PositionTemplateRow[] }).items
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
    router.replace(
      qs ? `/catalog/position-templates?${qs}` : '/catalog/position-templates',
      { scroll: false },
    );
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusId(id);
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  async function runDelete(ids: string[]) {
    if (!ids.length) return;
    const ok = await confirm(
      ids.length === 1
        ? 'Удалить шаблон должности?'
        : `Удалить выбранные шаблоны (${ids.length})?`,
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      for (const id of ids) {
        await apiFetch(`/api/catalog/position-templates/${id}`, {
          method: 'DELETE',
        });
      }
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `position-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Подразделение: r.division?.name || '',
        Должность: r.position?.name || '',
        Разряд: r.grade?.name || '',
        'График работы': r.schedule?.name || '',
        'Тарифная группа': r.tariffGroup?.name || '',
      })),
    );
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => router.push('/catalog/position-templates/new')}
          >
            Создать
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              style={{
                background: '#f64e60',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontWeight: 700,
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                padding: '0.5rem 0.9rem',
                cursor: 'pointer',
              }}
              disabled={busy}
              onClick={() => void runDelete([...selected])}
            >
              Удалить {selected.size}
            </button>
          ) : null}
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
              <th style={{ width: '2rem' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Подразделение</th>
              <th>Должность</th>
              <th>Разряд</th>
              <th>График работы</th>
              <th>Тарифная группа</th>
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
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = focusId === row.id;
              const checked = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={open || checked ? styles.rowSelected : undefined}
                  onClick={() => setFocusId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                  <td className={styles.nameCell}>
                    <span className={styles.nameText}>
                      {row.division?.name || '—'}
                    </span>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/catalog/position-templates/${row.id}/edit`}>
                          Изменить
                        </Link>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => void runDelete([row.id])}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.position?.name || '—'}</td>
                  <td>{row.grade?.name || ''}</td>
                  <td>{row.schedule?.name || ''}</td>
                  <td>{row.tariffGroup?.name || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PositionTemplatesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <PositionTemplatesPageInner />
    </Suspense>
  );
}
