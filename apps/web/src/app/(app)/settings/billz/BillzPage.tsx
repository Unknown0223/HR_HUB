'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDate, todayISO } from '@/lib/currencies';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import {
  API_METHODS,
  TIME_GROUPS,
  asBillzConfig,
  fmtMoney,
  newBillzId,
  type BillzConfig,
  type BillzDivision,
  type BillzMapping,
  type BillzSale,
  type BillzUser,
} from '@/lib/billz';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import danger from '../../catalog/document-types/page.module.css';
import extra from '../artix/page.module.css';
import iikoLocal from '../iiko/page.module.css';
import salesCss from '../iiko-sales/page.module.css';
import local from './page.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  config?: BillzConfig | null;
};

type EmpOpt = { id: string; label: string; phone?: string; divisionId?: string };
type Opt = { id: string; label: string };

export type BillzSection = 'settings' | 'users' | 'divisions' | 'sales';

const FILTER_KEYS = [
  'q',
  'name',
  'employee',
  'division',
  'phone',
  'attached',
  'mapped',
  'hasNames',
  'from',
  'to',
  'seller',
  'store',
  'timeGroup',
] as const;

const NAV: { id: BillzSection; href: string; label: string }[] = [
  { id: 'settings', href: '/settings/billz', label: 'Настройки' },
  { id: 'users', href: '/settings/billz/users', label: 'Пользователи' },
  { id: 'divisions', href: '/settings/billz/divisions', label: 'Подразделения' },
  { id: 'sales', href: '/settings/billz/sales', label: 'Продажи по сотрудникам' },
];

const TIME_OPTS = TIME_GROUPS.map((g) => ({ id: g.id, label: g.label }));
const METHOD_OPTS = API_METHODS.map((m) => ({ id: m.id, label: m.label }));

export function BillzPage({ section }: { section: BillzSection }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <BillzInner section={section} />
    </Suspense>
  );
}

function BillzInner({ section }: { section: BillzSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [row, setRow] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<BillzConfig>({});
  const [enabled, setEnabled] = useState(false);
  const [lookups, setLookups] = useState<{
    employees: EmpOpt[];
    divisions: Opt[];
    locations: Opt[];
  }>({ employees: [], divisions: [], locations: [] });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [mapTime, setMapTime] = useState('day');
  const [mapMethod, setMapMethod] = useState('seller.sales');

  const mappings = cfg.mappings || [];
  const users = cfg.users || [];
  const divisions = cfg.divisions || [];
  const sales = cfg.sales || [];

  const from = filters.from || todayISO();
  const to = filters.to || todayISO();
  const groupFilter = filters.timeGroup || 'day';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lu] = await Promise.all([
        apiFetch<Integration[]>('/api/settings/integrations'),
        apiFetch<{ employees?: EmpOpt[]; divisions?: Opt[]; locations?: Opt[] }>(
          '/api/catalog/lookups',
        ),
      ]);
      const found =
        (list || []).find((i) => asBillzConfig(i.config).sys === 'billz2') ||
        (list || []).find((i) => {
          const n = i.name.toLowerCase();
          return n.includes('billz') && n.includes('2');
        });
      if (!found) {
        setError('Интеграция Billz 2.0 не найдена');
        setRow(null);
        return;
      }
      setRow(found);
      setCfg({ ...asBillzConfig(found.config), sys: 'billz2' });
      setEnabled(found.isActive);
      setDirty(false);
      setLookups({
        employees: lu.employees || [],
        divisions: lu.divisions || [],
        locations: lu.locations || [],
      });
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
    if (section !== 'sales') return;
    if (searchParams.get('from') && searchParams.get('to')) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!params.get('from')) params.set('from', todayISO());
    if (!params.get('to')) params.set('to', todayISO());
    if (!params.get('timeGroup')) params.set('timeGroup', 'day');
    router.replace(`/settings/billz/sales?${params.toString()}`, { scroll: false });
  }, [section, router, searchParams]);

  async function persist(patch: { isActive?: boolean; config?: BillzConfig }) {
    if (!row) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const updated = await apiFetch<Integration>(
        `/api/settings/integrations/${row.id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      setRow(updated);
      setCfg({ ...asBillzConfig(updated.config), sys: 'billz2' });
      setEnabled(updated.isActive);
      setDirty(false);
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    await persist({
      isActive: enabled,
      config: {
        sys: 'billz2',
        secretToken: cfg.secretToken,
        mappings: cfg.mappings,
        users: cfg.users,
        divisions: cfg.divisions,
        sales: cfg.sales,
      },
    });
  }

  function patchUrl(path: string, patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const filteredMaps = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return mappings.filter((m) => {
      if (filters.name && !m.timeGroupName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (!qq) return true;
      return `${m.timeGroupName} ${m.apiMethodName}`.toLowerCase().includes(qq);
    });
  }, [mappings, q, filters.name]);

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return users.filter((u) => {
      if (filters.name && !u.billzName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.employee && u.employeeId !== filters.employee) return false;
      if (
        filters.division &&
        !(u.billzDivision || '').toLowerCase().includes(filters.division.toLowerCase())
      )
        return false;
      if (filters.phone && !(u.phone || '').includes(filters.phone)) return false;
      if (filters.attached === '1' && !u.employeeId) return false;
      if (filters.attached === '0' && u.employeeId) return false;
      if (!qq) return true;
      return [u.billzName, u.employeeName, u.billzDivision, u.phone]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [users, q, filters]);

  const filteredDivs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return divisions.filter((d) => {
      if (filters.name && !d.billzName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.hasNames === '1' && !d.divisionId) return false;
      if (filters.hasNames === '0' && d.divisionId) return false;
      if (!qq) return true;
      return `${d.billzName} ${d.divisionName || ''}`.toLowerCase().includes(qq);
    });
  }, [divisions, q, filters.name, filters.hasNames]);

  const filteredSales = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const gLabel = TIME_GROUPS.find((g) => g.id === groupFilter)?.label;
    return sales.filter((s) => {
      if (from && s.saleDate < from) return false;
      if (to && s.saleDate > to) return false;
      if (gLabel && s.timeGroup && s.timeGroup !== gLabel) return false;
      if (filters.seller && !s.sellerName.toLowerCase().includes(filters.seller.toLowerCase()))
        return false;
      if (filters.store && !s.store.toLowerCase().includes(filters.store.toLowerCase()))
        return false;
      if (!qq) return true;
      return [s.saleDate, s.sellerName, s.store, s.timeGroup].join(' ').toLowerCase().includes(qq);
    });
  }, [sales, q, from, to, groupFilter, filters.seller, filters.store]);

  async function pullUsers() {
    const have = new Set(users.map((u) => u.billzName.toLowerCase()));
    const added: BillzUser[] = lookups.employees
      .filter((e) => !have.has(e.label.toLowerCase()))
      .map((e) => ({
        id: newBillzId(),
        billzName: e.label,
        phone: e.phone || '',
        billzDivision: lookups.divisions.find((d) => d.id === e.divisionId)?.label || '',
      }));
    await persist({ config: { users: [...users, ...added] } });
    setOk(added.length ? `Загружено пользователей: ${added.length}` : 'Новых пользователей нет');
  }

  async function pullDivisions() {
    const have = new Set(divisions.map((d) => d.billzName.toLowerCase()));
    const added: BillzDivision[] = lookups.divisions
      .filter((d) => !have.has(d.label.toLowerCase()))
      .map((d) => ({ id: newBillzId(), billzName: d.label }));
    await persist({ config: { divisions: [...divisions, ...added] } });
    setOk(added.length ? `Загружено подразделений: ${added.length}` : 'Новых подразделений нет');
  }

  async function pullSales() {
    if (!row) return;
    try {
      await apiFetch(`/api/settings/integrations/${row.id}/sync`, { method: 'POST' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка синхронизации Billz');
    }
    const inRange = sales.filter((s) => s.saleDate >= from && s.saleDate <= to).length;
    setOk(`Продажи за ${fmtDate(from)} — ${fmtDate(to)}: записей ${inRange}`);
  }

  function listTools(
    path: string,
    shown: number,
    total: number,
    onExcel: () => void,
    fields: Parameters<typeof FilterPanel>[0]['fields'],
  ) {
    return (
      <div className={styles.rightTools}>
        <input
          className={styles.search}
          placeholder="Поиск..."
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') patchUrl(path, { q: searchDraft.trim() || null });
          }}
        />
        <FilterPanel
          inline
          urlSync
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          fields={fields}
        />
        <button type="button" className={styles.exportBtn} onClick={onExcel}>
          Excel
        </button>
        <span className={styles.pagerMeta}>
          {shown} / {total}
        </span>
        <button type="button" className={styles.toolBtn} onClick={() => void load()}>
          ↻
        </button>
      </div>
    );
  }

  function shell(children: ReactNode) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: 'Настройки Billz 2.0',
            siblings: [{ label: 'Продажи Billz 1.0', href: '/settings/billz-sales' }],
          }}
        />
        <div className={iikoLocal.topActions}>
          <button
            type="button"
            className={formStyles.btnClose}
            onClick={() => router.push('/settings?tab=integrations')}
          >
            Закрыть
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {ok ? <p className={formStyles.ok}>{ok}</p> : null}
        <div className={extra.layout}>
          <aside className={extra.side}>
            {NAV.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={section === n.id ? extra.sideOn : extra.sideLink}
              >
                {n.label}
              </Link>
            ))}
          </aside>
          {children}
        </div>
      </div>
    );
  }

  if (loading && !row) return shell(<p className={styles.empty}>Загрузка…</p>);

  if (section === 'settings') {
    return shell(
      <div className={extra.card}>
        <div className={extra.cardHead}>
          <h2 className={extra.cardTitle}>Настройки</h2>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving || !dirty}
            onClick={() => void saveAll()}
          >
            Сохранить
          </button>
        </div>
        <div className={extra.fields} style={{ maxWidth: 640 }}>
          <div className={formStyles.statusBlock}>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${enabled ? formStyles.toggleOn : ''}`}
                onClick={() => {
                  setEnabled((v) => !v);
                  setDirty(true);
                }}
                aria-pressed={enabled}
              />
              <span>{enabled ? 'Интеграция включена' : 'Интеграция отключена'}</span>
            </label>
          </div>
          {enabled ? (
            <>
              <div className={formStyles.field}>
                <label>
                  Секретный токен <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={cfg.secretToken || ''}
                  onChange={(e) => {
                    setCfg((c) => ({ ...c, secretToken: e.target.value }));
                    setDirty(true);
                  }}
                />
              </div>
              <div>
                <button
                  type="button"
                  className={formStyles.btnSave}
                  onClick={() => {
                    setMapTime('day');
                    setMapMethod('seller.sales');
                    setModal(true);
                  }}
                >
                  Добавить
                </button>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    className={danger.btnDanger}
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      void confirm({
                        message: `Удалить выбранные (${selected.size})?`,
                        variant: 'danger',
                        confirmText: 'Удалить',
                      }).then((okDel) => {
                        if (!okDel) return;
                        setCfg((c) => ({
                          ...c,
                          mappings: (c.mappings || []).filter((m) => !selected.has(m.id)),
                        }));
                        setSelected(new Set());
                        setDirty(true);
                      });
                    }}
                  >
                    Удалить {selected.size}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {enabled ? (
          <>
            <div className={styles.toolbar} style={{ marginTop: '0.85rem' }}>
              <div />
              {listTools(
                '/settings/billz',
                filteredMaps.length,
                mappings.length,
                () =>
                  downloadCsv(
                    'billz-mappings.csv',
                    filteredMaps.map((m) => ({
                      'Группировка по времени': m.timeGroupName,
                      'API метод': m.apiMethodName,
                    })),
                  ),
                [
                  {
                    type: 'text',
                    key: 'name',
                    label: 'Группировка по времени',
                    placeholder: 'Поиск...',
                  },
                ],
              )}
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredMaps.length > 0 &&
                          filteredMaps.every((m) => selected.has(m.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(filteredMaps.map((m) => m.id))
                              : new Set(),
                          )
                        }
                        aria-label="Выбрать все"
                      />
                    </th>
                    <th>Группировка по времени</th>
                    <th>API метод</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaps.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredMaps.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>{m.timeGroupName}</td>
                        <td>{m.apiMethodName}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => {
                              setCfg((c) => ({
                                ...c,
                                mappings: (c.mappings || []).filter((x) => x.id !== m.id),
                              }));
                              setDirty(true);
                            }}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {modal ? (
          <div className={extra.overlay} onClick={() => setModal(false)}>
            <div className={extra.modal} onClick={(e) => e.stopPropagation()}>
              <h3 className={extra.modalTitle}>Загрузка настроек</h3>
              <div className={formStyles.field}>
                <label>
                  Группировка по времени <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup value={mapTime} options={TIME_OPTS} onChange={setMapTime} />
              </div>
              <div className={formStyles.field}>
                <label>
                  API метод <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup value={mapMethod} options={METHOD_OPTS} onChange={setMapMethod} />
              </div>
              <div className={extra.modalFooter}>
                <button
                  type="button"
                  className={formStyles.btnSave}
                  onClick={() => {
                    if (!mapTime || !mapMethod) {
                      setError('Заполните обязательные поля');
                      return;
                    }
                    const payload: BillzMapping = {
                      id: newBillzId(),
                      timeGroupId: mapTime,
                      timeGroupName: TIME_OPTS.find((x) => x.id === mapTime)?.label || mapTime,
                      apiMethodId: mapMethod,
                      apiMethodName:
                        METHOD_OPTS.find((x) => x.id === mapMethod)?.label || mapMethod,
                    };
                    setCfg((c) => ({ ...c, mappings: [...(c.mappings || []), payload] }));
                    setDirty(true);
                    setModal(false);
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className={formStyles.btnClose}
                  onClick={() => setModal(false)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>,
    );
  }

  if (section === 'users') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void pullUsers()}
            >
              Загрузить
            </button>
          </div>
          {listTools(
            '/settings/billz/users',
            filteredUsers.length,
            users.length,
            () =>
              downloadCsv(
                'billz-users.csv',
                filteredUsers.map((u) => ({
                  'Имя пользователя': u.billzName,
                  Сотрудник: u.employeeName || '',
                  'Название подразделения в Billz': u.billzDivision || '',
                  'Номер телефона': u.phone || '',
                  'Прикреплен сотрудник': u.employeeId ? 'Да' : 'Нет',
                })),
              ),
            [
              { type: 'text', key: 'name', label: 'Имя пользователя', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'employee',
                label: 'Сотрудник',
                options: lookups.employees.map((e) => ({ value: e.id, label: e.label })),
              },
              {
                type: 'text',
                key: 'division',
                label: 'Название подразделения в Billz',
                placeholder: 'Поиск...',
              },
              { type: 'text', key: 'phone', label: 'Номер телефона', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'attached',
                label: 'Прикреплен сотрудник',
                options: [
                  { value: '1', label: 'Да' },
                  { value: '0', label: 'Нет' },
                ],
              },
            ],
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredUsers.length > 0 &&
                      filteredUsers.every((u) => selected.has(u.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filteredUsers.map((u) => u.id))
                          : new Set(),
                      )
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Имя пользователя</th>
                <th>Сотрудник</th>
                <th>Название подразделения в Billz</th>
                <th>Номер телефона</th>
                <th>Прикреплен сотрудник</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(u.id);
                            else next.delete(u.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{u.billzName}</td>
                    <td className={iikoLocal.cellLookup}>
                      <SearchLookup
                        value={u.employeeId || ''}
                        options={lookups.employees}
                        allowClear
                        onChange={(id) => {
                          const emp = lookups.employees.find((x) => x.id === id);
                          setCfg((c) => ({
                            ...c,
                            users: (c.users || []).map((x) =>
                              x.id === u.id
                                ? {
                                    ...x,
                                    employeeId: id || undefined,
                                    employeeName: emp?.label,
                                    phone: x.phone || emp?.phone,
                                  }
                                : x,
                            ),
                          }));
                          setDirty(true);
                        }}
                      />
                    </td>
                    <td>{u.billzDivision || '—'}</td>
                    <td>{u.phone || '—'}</td>
                    <td>
                      <span className={u.employeeId ? iikoLocal.mappedYes : iikoLocal.mappedNo}>
                        {u.employeeId ? 'Да' : 'Нет'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {dirty ? (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void saveAll()}
            >
              Сохранить
            </button>
          </div>
        ) : null}
      </div>,
    );
  }

  if (section === 'divisions') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void pullDivisions()}
            >
              Загрузить подразделения
            </button>
          </div>
          {listTools(
            '/settings/billz/divisions',
            filteredDivs.length,
            divisions.length,
            () =>
              downloadCsv(
                'billz-divisions.csv',
                filteredDivs.map((d) => ({
                  'Название подразделения в Billz': d.billzName,
                  'Подразделение Verifix': d.divisionName || '',
                  'Имеет наименования': d.divisionId ? 'Да' : 'Нет',
                })),
              ),
            [
              {
                type: 'text',
                key: 'name',
                label: 'Название подразделения в Billz',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'hasNames',
                label: 'Имеет наименования',
                options: [
                  { value: '1', label: 'Да' },
                  { value: '0', label: 'Нет' },
                ],
              },
            ],
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredDivs.length > 0 &&
                      filteredDivs.every((d) => selected.has(d.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filteredDivs.map((d) => d.id))
                          : new Set(),
                      )
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Название подразделения в Billz</th>
                <th>Подразделение Verifix</th>
                <th>Имеет наименования</th>
              </tr>
            </thead>
            <tbody>
              {filteredDivs.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredDivs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(d.id);
                            else next.delete(d.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{d.billzName}</td>
                    <td className={iikoLocal.cellLookup}>
                      <SearchLookup
                        value={d.divisionId || ''}
                        options={lookups.divisions}
                        allowClear
                        onChange={(id) => {
                          const div = lookups.divisions.find((x) => x.id === id);
                          setCfg((c) => ({
                            ...c,
                            divisions: (c.divisions || []).map((x) =>
                              x.id === d.id
                                ? {
                                    ...x,
                                    divisionId: id || undefined,
                                    divisionName: div?.label,
                                  }
                                : x,
                            ),
                          }));
                          setDirty(true);
                        }}
                      />
                    </td>
                    <td>
                      <span className={d.divisionId ? iikoLocal.mappedYes : iikoLocal.mappedNo}>
                        {d.divisionId ? 'Да' : 'Нет'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {dirty ? (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void saveAll()}
            >
              Сохранить
            </button>
          </div>
        ) : null}
      </div>,
    );
  }

  return shell(
    <div className={extra.card}>
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving || !row}
            onClick={() => void pullSales()}
          >
            Загрузить продажи
          </button>
          <div className={salesCss.dates}>
            <input
              type="date"
              value={from}
              onChange={(e) =>
                patchUrl('/settings/billz/sales', { from: e.target.value || null })
              }
              aria-label="Дата с"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => patchUrl('/settings/billz/sales', { to: e.target.value || null })}
              aria-label="Дата по"
            />
          </div>
          <select
            className={local.groupSelect}
            value={groupFilter}
            onChange={(e) => patchUrl('/settings/billz/sales', { timeGroup: e.target.value })}
            aria-label="Группировка по времени"
          >
            {TIME_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        {listTools(
          '/settings/billz/sales',
          filteredSales.length,
          sales.length,
          () =>
            downloadCsv(
              'billz-sales.csv',
              filteredSales.map((s) => ({
                'Дата продажи': fmtDate(s.saleDate),
                'Имя продавца': s.sellerName,
                Магазин: s.store,
                'Группировка по времени': s.timeGroup,
                'Чистая сумма продаж': s.netAmount,
              })),
            ),
          [
            { type: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Дата продажи' },
            { type: 'text', key: 'seller', label: 'Имя продавца', placeholder: 'Поиск...' },
            { type: 'text', key: 'store', label: 'Магазин', placeholder: 'Поиск...' },
          ],
        )}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    filteredSales.length > 0 &&
                    filteredSales.every((s) => selected.has(s.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(filteredSales.map((s) => s.id))
                        : new Set(),
                    )
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th>Дата продажи</th>
              <th>Имя продавца</th>
              <th>Магазин</th>
              <th>Группировка по времени</th>
              <th className={salesCss.num}>Чистая сумма продаж</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              filteredSales.map((s: BillzSale) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td>{fmtDate(s.saleDate)}</td>
                  <td>{s.sellerName}</td>
                  <td>{s.store}</td>
                  <td>{s.timeGroup}</td>
                  <td className={salesCss.num}>{fmtMoney(s.netAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>,
  );
}
