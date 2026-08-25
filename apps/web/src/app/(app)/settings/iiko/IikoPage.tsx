'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { MultiLookup } from '@/app/(app)/catalog/cashboxes/MultiLookup';
import {
  DEFAULT_IIKO,
  asIikoConfig,
  newIikoId,
  type IikoConfig,
  type IikoDivision,
  type IikoError,
  type IikoPosition,
  type IikoUser,
} from '@/lib/iiko';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import extra from '../artix/page.module.css';
import local from './page.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  webhookUrl?: string | null;
  config?: IikoConfig | null;
};

type Opt = { id: string; label: string };

export type IikoSection = 'settings' | 'users' | 'positions' | 'divisions' | 'errors';

const FILTER_KEYS = [
  'q',
  'name',
  'employee',
  'position',
  'department',
  'mapped',
  'message',
  'from',
  'to',
] as const;

const NAV: { id: IikoSection; href: string; label: string }[] = [
  { id: 'settings', href: '/settings/iiko', label: 'Настройки' },
  { id: 'users', href: '/settings/iiko/users', label: 'Пользователи' },
  { id: 'positions', href: '/settings/iiko/positions', label: 'Должности' },
  { id: 'divisions', href: '/settings/iiko/divisions', label: 'Подразделения' },
  { id: 'errors', href: '/settings/iiko/errors', label: 'Журнал ошибок' },
];

function mergeCfg(raw: IikoConfig): IikoConfig {
  return { ...DEFAULT_IIKO, ...raw, sys: 'iiko' };
}

export function IikoPage({ section }: { section: IikoSection }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <IikoInner section={section} />
    </Suspense>
  );
}

function IikoInner({ section }: { section: IikoSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [row, setRow] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<IikoConfig>(DEFAULT_IIKO);
  const [enabled, setEnabled] = useState(false);
  const [lookups, setLookups] = useState<{
    employees: Opt[];
    divisions: Opt[];
    positions: Opt[];
    schedules: Opt[];
  }>({ employees: [], divisions: [], positions: [], schedules: [] });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const users = cfg.users || [];
  const positions = cfg.positions || [];
  const divisions = cfg.divisions || [];
  const errorsList = cfg.errors || [];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lu] = await Promise.all([
        apiFetch<Integration[]>('/api/settings/integrations'),
        apiFetch<{
          employees?: Opt[];
          divisions?: Opt[];
          positions?: Opt[];
          schedules?: Opt[];
        }>('/api/catalog/lookups'),
      ]);
      const found =
        (list || []).find((i) => asIikoConfig(i.config).sys === 'iiko') ||
        (list || []).find((i) => i.name.toLowerCase().includes('iiko') && !i.name.toLowerCase().includes('продаж'));
      if (!found) {
        setError('Интеграция IIKO не найдена');
        setRow(null);
        return;
      }
      setRow(found);
      setCfg(mergeCfg(asIikoConfig(found.config)));
      setEnabled(found.isActive);
      setDirty(false);
      setLookups({
        employees: lu.employees || [],
        divisions: lu.divisions || [],
        positions: lu.positions || [],
        schedules: lu.schedules || [],
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

  async function persist(patch: {
    isActive?: boolean;
    webhookUrl?: string | null;
    config?: IikoConfig;
  }) {
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
      setCfg(mergeCfg(asIikoConfig(updated.config)));
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
      webhookUrl: cfg.url || null,
      config: {
        sys: 'iiko',
        url: cfg.url,
        login: cfg.login,
        password: cfg.password,
        olapKind: cfg.olapKind || 'dishes',
        linkAllDivisions: Boolean(cfg.linkAllDivisions),
        getIdEnabled: Boolean(cfg.getIdEnabled),
        getIdUrl: cfg.getIdUrl,
        syncShifts: Boolean(cfg.syncShifts),
        syncDays: Number(cfg.syncDays) || 7,
        syncExpenses: Boolean(cfg.syncExpenses),
        expenseShiftTypeId: cfg.expenseShiftTypeId,
        excludePositionIds: cfg.excludePositionIds || [],
        timeFrom: cfg.timeFrom || '23:00',
        timeTo: cfg.timeTo || '06:00',
        syncLateAccrual: Boolean(cfg.syncLateAccrual),
        lateShiftGroupId: cfg.lateShiftGroupId,
        lateIikoShiftTypeId: cfg.lateIikoShiftTypeId,
        syncAppearances: Boolean(cfg.syncAppearances),
        appearanceDays: Number(cfg.appearanceDays) || 7,
        sendPin: Boolean(cfg.sendPin),
        users: cfg.users,
        positions: cfg.positions,
        divisions: cfg.divisions,
        errors: cfg.errors,
      },
    });
  }

  function applySearch(path: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return users.filter((u) => {
      if (filters.name && !u.iikoName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.employee && u.employeeId !== filters.employee) return false;
      if (
        filters.position &&
        !(u.iikoPosition || '').toLowerCase().includes(filters.position.toLowerCase())
      )
        return false;
      if (
        filters.department &&
        !(u.iikoDepartment || '').toLowerCase().includes(filters.department.toLowerCase())
      )
        return false;
      if (filters.mapped === '1' && !u.employeeId) return false;
      if (filters.mapped === '0' && u.employeeId) return false;
      if (!qq) return true;
      return [u.iikoName, u.employeeName, u.iikoPosition, u.iikoDepartment]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [users, q, filters]);

  const filteredPositions = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return positions.filter((p) => {
      if (filters.name && !p.iikoName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.mapped === '1' && !p.positionId) return false;
      if (filters.mapped === '0' && p.positionId) return false;
      if (!qq) return true;
      return `${p.iikoName} ${p.positionName || ''}`.toLowerCase().includes(qq);
    });
  }, [positions, q, filters.name, filters.mapped]);

  const filteredDivs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return divisions.filter((d) => {
      if (filters.name && !d.iikoName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.mapped === '1' && !d.divisionId) return false;
      if (filters.mapped === '0' && d.divisionId) return false;
      if (!qq) return true;
      return `${d.iikoName} ${d.divisionName || ''}`.toLowerCase().includes(qq);
    });
  }, [divisions, q, filters.name, filters.mapped]);

  const filteredErrors = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return errorsList.filter((e) => {
      if (filters.message && !e.message.toLowerCase().includes(filters.message.toLowerCase()))
        return false;
      if (filters.from && e.createdAt.slice(0, 10) < filters.from) return false;
      if (filters.to && e.createdAt.slice(0, 10) > filters.to) return false;
      if (!qq) return true;
      return `${e.id} ${e.message} ${e.createdAt}`.toLowerCase().includes(qq);
    });
  }, [errorsList, q, filters.message, filters.from, filters.to]);

  async function pull(kind: 'users' | 'positions' | 'divisions') {
    if (!row) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      try {
        await apiFetch(`/api/settings/integrations/${row.id}/sync`, {
          method: 'POST',
        });
      } catch {
        /* live IIKO may be unreachable; still fill mapping tables from catalog */
      }
      if (kind === 'users') {
        const have = new Set(users.map((u) => u.iikoName.toLowerCase()));
        const added: IikoUser[] = lookups.employees
          .filter((e) => !have.has(e.label.toLowerCase()))
          .map((e) => ({
            id: newIikoId(),
            iikoName: e.label,
            iikoPosition: '',
            iikoDepartment: '',
          }));
        await persist({ config: { users: [...users, ...added] } });
        setOk(added.length ? `Загружено пользователей: ${added.length}` : 'Новых пользователей нет');
      } else if (kind === 'positions') {
        const have = new Set(positions.map((p) => p.iikoName.toLowerCase()));
        const added: IikoPosition[] = lookups.positions
          .filter((p) => !have.has(p.label.toLowerCase()))
          .map((p) => ({ id: newIikoId(), iikoName: p.label }));
        await persist({ config: { positions: [...positions, ...added] } });
        setOk(added.length ? `Загружено должностей: ${added.length}` : 'Новых должностей нет');
      } else {
        const have = new Set(divisions.map((d) => d.iikoName.toLowerCase()));
        const added: IikoDivision[] = lookups.divisions
          .filter((d) => !have.has(d.label.toLowerCase()))
          .map((d) => ({ id: newIikoId(), iikoName: d.label }));
        await persist({ config: { divisions: [...divisions, ...added] } });
        setOk(added.length ? `Загружено подразделений: ${added.length}` : 'Новых подразделений нет');
      }
    } catch (e) {
      const err: IikoError = {
        id: newIikoId(),
        message: e instanceof Error ? e.message : 'Ошибка загрузки',
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      setError(err.message);
      await persist({ config: { errors: [...errorsList, err] } }).catch(() => null);
    } finally {
      setSaving(false);
    }
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
            if (e.key === 'Enter') applySearch(path);
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

  function mappedFields(nameLabel: string) {
    return [
      { type: 'text' as const, key: 'name', label: nameLabel, placeholder: 'Поиск...' },
      {
        type: 'select' as const,
        key: 'mapped',
        label: 'Сопоставлено',
        options: [
          { value: '1', label: 'Да' },
          { value: '0', label: 'Нет' },
        ],
      },
    ];
  }

  function shell(children: ReactNode) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: 'Настройки IIKO',
            siblings: [{ label: 'Продажи IIKO', href: '/settings/iiko-sales' }],
          }}
        />
        <div className={local.topActions}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving || !dirty}
            onClick={() => void saveAll()}
          >
            Сохранить
          </button>
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

  function patchCfg(next: Partial<IikoConfig>) {
    setCfg((c) => ({ ...c, ...next }));
    setDirty(true);
  }

  if (loading && !row) {
    return shell(<p className={styles.empty}>Загрузка…</p>);
  }

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
                  URL адрес <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={cfg.url || ''}
                  onChange={(e) => patchCfg({ url: e.target.value })}
                />
              </div>
              <div className={local.twoCol}>
                <div className={formStyles.field}>
                  <label>
                    Логин <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    value={cfg.login || ''}
                    onChange={(e) => patchCfg({ login: e.target.value })}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Пароль <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    type="password"
                    value={cfg.password || ''}
                    onChange={(e) => patchCfg({ password: e.target.value })}
                  />
                </div>
              </div>
              <div className={formStyles.field}>
                <label>Сбор отчетов OLAP</label>
                <div className={formStyles.radioRow}>
                  <label className={formStyles.radio}>
                    <input
                      type="radio"
                      name="olap"
                      checked={(cfg.olapKind || 'dishes') === 'dishes'}
                      onChange={() => patchCfg({ olapKind: 'dishes' })}
                    />
                    По блюдам
                  </label>
                  <label className={formStyles.radio}>
                    <input
                      type="radio"
                      name="olap"
                      checked={cfg.olapKind === 'orders'}
                      onChange={() => patchCfg({ olapKind: 'orders' })}
                    />
                    По заказам
                  </label>
                </div>
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.linkAllDivisions)}
                  onChange={(e) => patchCfg({ linkAllDivisions: e.target.checked })}
                />
                Привязать все подразделения
              </label>
              <div className={formStyles.statusBlock}>
                <label className={formStyles.toggleRow}>
                  <button
                    type="button"
                    className={`${formStyles.toggle} ${cfg.getIdEnabled ? formStyles.toggleOn : ''}`}
                    onClick={() => patchCfg({ getIdEnabled: !cfg.getIdEnabled })}
                    aria-pressed={Boolean(cfg.getIdEnabled)}
                  />
                  <span>
                    {cfg.getIdEnabled
                      ? 'Интеграция с GetId включена'
                      : 'Интеграция с GetId включена'}
                  </span>
                </label>
              </div>
              <div className={formStyles.field}>
                <label>
                  Base URL от GetId <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={cfg.getIdUrl || ''}
                  onChange={(e) => patchCfg({ getIdUrl: e.target.value })}
                />
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.syncShifts)}
                  onChange={(e) => patchCfg({ syncShifts: e.target.checked })}
                />
                Периодически синхронизировать смены
              </label>
              <div className={formStyles.field}>
                <label>
                  Синхронизировать последние N дней <span className={formStyles.req}>*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={cfg.syncDays ?? 7}
                  onChange={(e) => patchCfg({ syncDays: Number(e.target.value) || 7 })}
                />
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.syncExpenses)}
                  onChange={(e) => patchCfg({ syncExpenses: e.target.checked })}
                />
                Синхронизировать расходы на смены
              </label>
              <div className={formStyles.field}>
                <label>
                  Тип смены с наличием расхода <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={cfg.expenseShiftTypeId || ''}
                  options={lookups.schedules}
                  allowClear
                  onChange={(id) => patchCfg({ expenseShiftTypeId: id })}
                />
              </div>
              <div className={formStyles.field}>
                <label>Исключения по должности</label>
                <MultiLookup
                  value={cfg.excludePositionIds || []}
                  options={lookups.positions}
                  onChange={(ids) => patchCfg({ excludePositionIds: ids })}
                />
              </div>
              <div className={local.twoCol}>
                <div className={formStyles.field}>
                  <label>
                    Время начала <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    type="time"
                    value={cfg.timeFrom || '23:00'}
                    onChange={(e) => patchCfg({ timeFrom: e.target.value })}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Время конца <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    type="time"
                    value={cfg.timeTo || '06:00'}
                    onChange={(e) => patchCfg({ timeTo: e.target.value })}
                  />
                </div>
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.syncLateAccrual)}
                  onChange={(e) => patchCfg({ syncLateAccrual: e.target.checked })}
                />
                Синхронизировать начисления за поздние смены
              </label>
              <div className={formStyles.field}>
                <label>
                  Группы смен для начисления за поздние смены{' '}
                  <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={cfg.lateShiftGroupId || ''}
                  options={lookups.schedules}
                  allowClear
                  onChange={(id) => patchCfg({ lateShiftGroupId: id })}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Тип смены IIKO <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={cfg.lateIikoShiftTypeId || ''}
                  options={lookups.schedules}
                  allowClear
                  onChange={(id) => patchCfg({ lateIikoShiftTypeId: id })}
                />
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.syncAppearances)}
                  onChange={(e) => patchCfg({ syncAppearances: e.target.checked })}
                />
                Периодическая синхронизация явок сотрудников
              </label>
              <div className={formStyles.field}>
                <label>
                  Синхронизировать последние N дней <span className={formStyles.req}>*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={cfg.appearanceDays ?? 7}
                  onChange={(e) => patchCfg({ appearanceDays: Number(e.target.value) || 7 })}
                />
              </div>
              <label className={formStyles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.sendPin)}
                  onChange={(e) => patchCfg({ sendPin: e.target.checked })}
                />
                Отправлять ПИН сотрудника в Verifix, как пин-код сотрудника в IIKO
              </label>
            </>
          ) : null}
        </div>
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
              onClick={() => void pull('users')}
            >
              Загрузить
            </button>
          </div>
          {listTools(
            '/settings/iiko/users',
            filteredUsers.length,
            users.length,
            () =>
              downloadCsv(
                'iiko-users.csv',
                filteredUsers.map((u) => ({
                  'Имя пользователя': u.iikoName,
                  Сотрудник: u.employeeName || '',
                  'Должность IIKO': u.iikoPosition || '',
                  'Департамент IIKO': u.iikoDepartment || '',
                  'Сопоставлен с сотрудником': u.employeeId ? 'Да' : 'Нет',
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
              { type: 'text', key: 'position', label: 'Должность IIKO', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'department',
                label: 'Департамент IIKO',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'mapped',
                label: 'Сопоставлен с сотрудником',
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
                <th>Должность IIKO</th>
                <th>Департамент IIKO</th>
                <th>Сопоставлен с сотрудником</th>
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
                    <td>{u.iikoName}</td>
                    <td className={local.cellLookup}>
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
                                  }
                                : x,
                            ),
                          }));
                          setDirty(true);
                        }}
                      />
                    </td>
                    <td>{u.iikoPosition || '—'}</td>
                    <td>{u.iikoDepartment || '—'}</td>
                    <td>
                      <span className={u.employeeId ? local.mappedYes : local.mappedNo}>
                        {u.employeeId ? 'Да' : 'Нет'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>,
    );
  }

  if (section === 'positions') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void pull('positions')}
            >
              Загрузить должности
            </button>
          </div>
          {listTools(
            '/settings/iiko/positions',
            filteredPositions.length,
            positions.length,
            () =>
              downloadCsv(
                'iiko-positions.csv',
                filteredPositions.map((p) => ({
                  Должность: p.iikoName,
                  'Должность Verifix': p.positionName || '',
                  'Сопоставлено с должностью': p.positionId ? 'Да' : 'Нет',
                })),
              ),
            mappedFields('Должность'),
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
                      filteredPositions.length > 0 &&
                      filteredPositions.every((p) => selected.has(p.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filteredPositions.map((p) => p.id))
                          : new Set(),
                      )
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Должность</th>
                <th>Должность Verifix</th>
                <th>Сопоставлено с должностью</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredPositions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{p.iikoName}</td>
                    <td className={local.cellLookup}>
                      <SearchLookup
                        value={p.positionId || ''}
                        options={lookups.positions}
                        allowClear
                        onChange={(id) => {
                          const pos = lookups.positions.find((x) => x.id === id);
                          setCfg((c) => ({
                            ...c,
                            positions: (c.positions || []).map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    positionId: id || undefined,
                                    positionName: pos?.label,
                                  }
                                : x,
                            ),
                          }));
                          setDirty(true);
                        }}
                      />
                    </td>
                    <td>
                      <span className={p.positionId ? local.mappedYes : local.mappedNo}>
                        {p.positionId ? 'Да' : 'Нет'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              onClick={() => void pull('divisions')}
            >
              Загрузить подразделения
            </button>
          </div>
          {listTools(
            '/settings/iiko/divisions',
            filteredDivs.length,
            divisions.length,
            () =>
              downloadCsv(
                'iiko-divisions.csv',
                filteredDivs.map((d) => ({
                  Подразделение: d.iikoName,
                  'Подразделение Verifix': d.divisionName || '',
                  'Сопоставлено с подразделением': d.divisionId ? 'Да' : 'Нет',
                })),
              ),
            mappedFields('Подразделение'),
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
                <th>Подразделение</th>
                <th>Подразделение Verifix</th>
                <th>Сопоставлено с подразделением</th>
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
                    <td>{d.iikoName}</td>
                    <td className={local.cellLookup}>
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
                      <span className={d.divisionId ? local.mappedYes : local.mappedNo}>
                        {d.divisionId ? 'Да' : 'Нет'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>,
    );
  }

  return shell(
    <div className={extra.card}>
      <div className={styles.toolbar}>
        <h2 className={extra.cardTitle} style={{ margin: 0 }}>
          Журнал ошибок
        </h2>
        {listTools(
          '/settings/iiko/errors',
          filteredErrors.length,
          errorsList.length,
          () =>
            downloadCsv(
              'iiko-errors.csv',
              filteredErrors.map((e) => ({
                ИД: e.id,
                'Сообщение об ошибке': e.message,
                'Дата создания': e.createdAt,
              })),
            ),
          [
            { type: 'text', key: 'message', label: 'Сообщение об ошибке', placeholder: 'Поиск...' },
            { type: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Дата создания' },
          ],
        )}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ИД</th>
              <th>Сообщение об ошибке</th>
              <th>Дата создания</th>
            </tr>
          </thead>
          <tbody>
            {filteredErrors.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              filteredErrors.map((e: IikoError) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{e.message}</td>
                  <td>{e.createdAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>,
  );
}
