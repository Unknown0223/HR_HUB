'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { asBankMeta, padMfo, type BankItem, type BankMeta } from '@/lib/banks';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../../catalog/cashboxes/page.module.css';
import shared from '../../../page-shared.module.css';

type Dict = { id: string; code: string; name: string; items?: BankItem[] };

const DICT_CODE = 'banks';
const PATH = '/settings/banks';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'mfo', 'name', 'address', 'isActive'] as const;

function BanksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const menuRef = useRef<HTMLDivElement>(null);

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<BankItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.mfo || filters.name || filters.address || filters.isActive),
  );
  const [statusOpen, setStatusOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [mfo, setMfo] = useState('');
  const [name, setName] = useState('');
  const [swift, setSwift] = useState('');
  const [address, setAddress] = useState('');
  const [active, setActive] = useState(true);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const m = asBankMeta(r.meta);
      if (filters.mfo && !r.code.toLowerCase().includes(filters.mfo.toLowerCase())) return false;
      if (filters.name && !r.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.address && !(m.address || '').toLowerCase().includes(filters.address.toLowerCase()))
        return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      return [r.code, r.name, m.address, m.swift].join(' ').toLowerCase().includes(qq);
    });
  }, [rows, q, filters.mfo, filters.name, filters.address, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filters.mfo, filters.name, filters.address, filters.isActive]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const admin = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin');
      const dict = (admin || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Банки» не найден');
        return;
      }
      setDictId(dict.id);
      setRows([...(dict.items || [])].sort((a, b) => a.code.localeCompare(b.code, 'ru')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setCreateOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function fill(row?: BankItem) {
    const m = asBankMeta(row?.meta);
    setMfo(row?.code || '');
    setName(row?.name || '');
    setSwift(m.swift || '');
    setAddress(m.address || '');
    setActive(row ? row.isActive !== false : true);
  }

  function openCreate() {
    setEditId(null);
    fill();
    setCreateOpen(false);
    setMode('create');
    setError('');
  }

  function openEdit(row: BankItem) {
    setEditId(row.id);
    fill(row);
    setMode('edit');
    setError('');
  }

  function buildMeta(): BankMeta {
    return {
      address: address.trim() || undefined,
      swift: swift.trim() || undefined,
    };
  }

  async function save() {
    if (!dictId) return;
    if (!mfo.trim()) {
      setError('Укажите МФО');
      return;
    }
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!swift.trim()) {
      setError('Укажите Swift');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    setSaving(true);
    setError('');
    try {
      const body = {
        code: padMfo(mfo),
        name: name.trim(),
        isActive: active,
        sortOrder: existing?.sortOrder ?? rows.length + 1,
        meta: buildMeta(),
      };
      if (editId) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items`, {
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

  async function setActiveIds(ids: string[], isActive: boolean) {
    if (!dictId) return;
    setBusy(true);
    setStatusOpen(false);
    try {
      for (const id of ids) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive }),
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения статуса');
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[], label?: string) {
    if (!dictId || !ids.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: label || `Удалить выбранные банки (${ids.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of ids) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}/delete`, {
          method: 'POST',
        });
      }
      setSelected(new Set());
      setFocusId(null);
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="settings-admin" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-university" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Банки</h1>
          <p className={shared.pageSubtitle}>
            Справочник банков и МФО
          </p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={extra.statusWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen((v) => !v)}
              aria-expanded={createOpen}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
              <i className="fas fa-caret-down" aria-hidden />
            </button>
            {createOpen ? (
              <div className={extra.statusMenu}>
                <button type="button" onClick={openCreate}>
                  Банк
                </button>
                <button type="button" onClick={() => router.push(`${PATH}/import`)}>
                  Импорт
                </button>
              </div>
            ) : null}
          </div>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'mfo', label: 'МФО', placeholder: 'Поиск...' },
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'address', label: 'Адрес', placeholder: 'Поиск...' },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          {selected.size > 0 ? (
            <>
              <div className={extra.statusWrap}>
                <button
                  type="button"
                  className={extra.btnStatus}
                  disabled={busy}
                  onClick={() => setStatusOpen((v) => !v)}
                >
                  <i className="fas fa-toggle-on" aria-hidden />
                  Изменить статус
                </button>
                {statusOpen ? (
                  <div className={extra.statusMenu}>
                    <button type="button" onClick={() => void setActiveIds(Array.from(selected), false)}>
                      Неактивный {selected.size}
                    </button>
                    <button type="button" onClick={() => void setActiveIds(Array.from(selected), true)}>
                      Активный {selected.size}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={local.btnDanger}
                disabled={busy}
                onClick={() => void deleteIds(Array.from(selected))}
              >
                <i className="fas fa-trash-alt" aria-hidden />
                Удалить {selected.size}
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
            }}
            aria-label="Поиск"
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                'banks.csv',
                filtered.map((r) => {
                  const m = asBankMeta(r.meta);
                  return {
                    МФО: r.code,
                    Название: r.name,
                    Адрес: m.address || '',
                    Swift: m.swift || '',
                    Статус: r.isActive === false ? 'Неактивный' : 'Активный',
                  };
                }),
              )
            }
            title="Экспорт Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
            Excel
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Предыдущая страница"
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            ›
          </button>
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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th>МФО</th>
              <th>Название</th>
              <th>Адрес</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const open = focusId === row.id;
                const m = asBankMeta(row.meta);
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
                      <span className={styles.nameText}>{row.code}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={() => openEdit(row)}>
                            Изменить
                          </button>
                          <button type="button" disabled={busy} onClick={() => void setActiveIds([row.id], row.isActive === false)}>
                            {row.isActive === false ? 'Активный' : 'Неактивный'}
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() => void deleteIds([row.id], `Удалить «${row.name}»?`)}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{row.name}</td>
                    <td>{m.address || ''}</td>
                    <td>
                      <span className={row.isActive === false ? extra.badgeOff : extra.badge}>
                        {row.isActive === false ? 'Неактивный' : 'Активный'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode === 'create' || mode === 'edit'}
        title={mode === 'edit' ? 'Банк (изменение)' : 'Банк (создание)'}
        width="md"
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
        <div className={modal.field}>
          <label>
            МФО <span className={modal.req}>*</span>
          </label>
          <input value={mfo} onChange={(e) => setMfo(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>
            Название <span className={modal.req}>*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>
            Swift <span className={modal.req}>*</span>
          </label>
          <input value={swift} onChange={(e) => setSwift(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>Адрес</label>
          <textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className={modal.field}>
          <span>Статус</span>
          <label className={formStyles.toggleRow}>
            <button
              type="button"
              className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
              onClick={() => setActive((v) => !v)}
              aria-pressed={active}
            />
            <span>{active ? 'Активный' : 'Неактивный'}</span>
          </label>
        </div>
      </FormModal>
    </div>
  );
}

export function BanksPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <BanksInner />
    </Suspense>
  );
}
