'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import shared from '../../../page-shared.module.css';

type Division = { id: string; name: string; code?: string };
type Position = { id: string; name: string; code?: string };
type DocType = {
  id: string;
  code: string;
  name: string;
  meta?: { isHireDocument?: boolean } | null;
  isActive?: boolean;
};

type ExceptionRow = {
  id: string;
  divisionId: string;
  positionId: string;
  documentTypeIds: string[];
  division?: Division;
  position?: Position;
};

type Mode = 'list' | 'create' | 'edit';

function HireDocExceptionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [hireDocs, setHireDocs] = useState<DocType[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);

  const [mode, setMode] = useState<Mode>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [docIds, setDocIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.division?.name, r.position?.name].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [ex, divs, poss, dicts] = await Promise.all([
        apiFetch<ExceptionRow[]>('/api/hire-document-exceptions'),
        apiFetch<Division[] | { items: Division[] }>('/api/organization/divisions'),
        apiFetch<Position[] | { items: Position[] }>('/api/organization/positions'),
        apiFetch<
          Array<{ code: string; items?: DocType[] }>
        >('/api/settings/dictionaries?kind=core'),
      ]);
      setRows(Array.isArray(ex) ? ex : []);
      setDivisions(Array.isArray(divs) ? divs : divs.items || []);
      setPositions(Array.isArray(poss) ? poss : poss.items || []);
      const docDict = (dicts || []).find((d) => d.code === 'doc_types');
      const docs = (docDict?.items || []).filter(
        (d) => d.isActive !== false && d.meta?.isHireDocument,
      );
      // fallback: show all active doc types if none marked hire
      setHireDocs(
        docs.length
          ? docs
          : (docDict?.items || []).filter((d) => d.isActive !== false),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditId(null);
    setDivisionId('');
    setPositionId('');
    setDocIds(new Set());
    setMode('create');
    setError('');
  }

  function openEdit(row: ExceptionRow) {
    setEditId(row.id);
    setDivisionId(row.divisionId);
    setPositionId(row.positionId);
    setDocIds(new Set(row.documentTypeIds || []));
    setMode('edit');
    setError('');
  }

  async function save() {
    if (!divisionId || !positionId) {
      setError('Укажите подразделение и должность');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        divisionId,
        positionId,
        documentTypeIds: [...docIds],
      };
      if (editId) {
        await apiFetch(`/api/hire-document-exceptions/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/hire-document-exceptions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(row: ExceptionRow) {
    if (!(await confirm('Удалить исключение?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/hire-document-exceptions/${row.id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(
      qs
        ? `/catalog/hire-document-exceptions?${qs}`
        : '/catalog/hire-document-exceptions',
      { scroll: false },
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Исключения по документам при приеме',
          siblings: [
            { label: 'Типы документов', href: '/catalog/document-types' },
          ],
        }}
      />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-file-signature" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Исключения по документам при приеме</h1>
          <p className={shared.pageSubtitle}>
            Исключения обязательных документов по подразделению и должности
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
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
            aria-label="Поиск"
          />
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((r) => r.id)));
                  }}
                />
              </th>
              <th>Подразделение</th>
              <th>Должность</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = focusId === row.id;
              return (
                <tr
                  key={row.id}
                  className={open ? styles.rowSelected : undefined}
                  onClick={() => setFocusId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                      }}
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
                  <td>{row.position?.name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode === 'create' || mode === 'edit'}
        title={
          mode === 'edit'
            ? 'Исключение по документам при приеме (изменение)'
            : 'Исключение по документам при приеме (создание)'
        }
        width="lg"
        onClose={() => {
          setMode('list');
          setError('');
        }}
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => {
                setMode('list');
                setError('');
              }}
            >
              Закрыть
            </button>
          </>
        }
      >
        {error ? <p className={modal.error}>{error}</p> : null}
        <div className={modal.row2}>
          <div className={modal.field}>
            <label>
              Подразделение <span className={modal.req}>*</span>
            </label>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">Поиск...</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className={modal.field}>
            <label>
              Должность <span className={modal.req}>*</span>
            </label>
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
            >
              <option value="">Поиск...</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={modal.field}>
          <span>Типы документов при приеме</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {hireDocs.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#6b7280' }}>
                Нет типов с флагом «Документ при приеме». Отметьте их в «Типы
                документов».
              </p>
            ) : (
              hireDocs.map((d) => (
                <label key={d.id} className={modal.radio}>
                  <input
                    type="checkbox"
                    checked={docIds.has(d.id)}
                    onChange={(e) => {
                      setDocIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      });
                    }}
                  />
                  {d.name}
                </label>
              ))
            )}
          </div>
        </div>
      </FormModal>
    </div>
  );
}

export default function HireDocumentExceptionsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <HireDocExceptionsInner />
    </Suspense>
  );
}
