'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

type ReportTemplateRow = {
  id: string;
  code: string;
  name: string;
  kind?: string | null;
  source?: string | null;
  sourceType?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  templateGroup?: string | null;
  templateType?: string | null;
  createdBy?: string | null;
  isActive?: boolean;
  createdAt?: string;
};

function fmtDate(v?: string | null) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(v);
  }
}

function ReportTemplatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<ReportTemplateRow[]>([]);
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
        r.name,
        r.code,
        r.source,
        r.sourceType,
        r.fileName,
        r.createdBy,
        r.templateType,
        r.templateGroup,
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
      const data = await apiFetch<ReportTemplateRow[] | { items: ReportTemplateRow[] }>(
        '/api/catalog/report-templates',
      );
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { items?: ReportTemplateRow[] }).items)
          ? (data as { items: ReportTemplateRow[] }).items
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
      qs ? `/catalog/report-templates?${qs}` : '/catalog/report-templates',
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
    const label =
      ids.length === 1
        ? `Удалить шаблон «${rows.find((r) => r.id === ids[0])?.name || ''}»?`
        : `Удалить выбранные шаблоны (${ids.length})?`;
    if (!(await confirm(label))) return;
    setBusy(true);
    setError('');
    try {
      for (const id of ids) {
        await apiFetch(`/api/catalog/report-templates/${id}`, { method: 'DELETE' });
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
      `report-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        Источник: r.source || '',
        'Тип источника': r.sourceType || '',
        Файл: r.fileName || '',
        Создал: r.createdBy || '',
        Дата: fmtDate(r.createdAt),
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
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
            onClick={() => router.push('/catalog/report-templates/new')}
          >
            Создать
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              className={styles.dangerBtn || styles.exportBtn}
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
              <th>Название</th>
              <th>Источник</th>
              <th>Тип источника</th>
              <th>Файл</th>
              <th>Создал</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет шаблонов
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
                    <label className={styles.nameWithCheck}>
                      <span className={styles.nameText}>{row.name}</span>
                    </label>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/catalog/report-templates/${row.id}/edit`}>
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
                        <button
                          type="button"
                          title="Скоро"
                          onClick={() =>
                            setError('Прикрепление ролей будет доступно в следующем обновлении')
                          }
                        >
                          Прикрепить роли
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.source || ''}</td>
                  <td>{row.sourceType || ''}</td>
                  <td>{row.fileName || ''}</td>
                  <td>{row.createdBy || 'System'}</td>
                  <td>{fmtDate(row.createdAt)}</td>
                  <td>
                    <span
                      className={
                        row.isActive === false ? styles.statusMuted : styles.statusActive
                      }
                    >
                      {row.isActive === false ? 'Неактивный' : 'Активный'}
                    </span>
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

export default function ReportTemplatesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <ReportTemplatesPageInner />
    </Suspense>
  );
}
