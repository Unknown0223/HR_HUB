'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { alert } from '@/lib/dialogs';
import { useUrlParam } from '@/lib/use-url-state';
import {
  GRANT_STATUS_LABELS,
  type AccessEmployeeRow,
  type AccessGrant,
  type AccessOptions,
  type AccessSummary,
  type BulkAccessResult,
} from '@/lib/access';
import { AccessGrantModal } from './AccessGrantModal';
import { EmployeeAccessDrawer } from './EmployeeAccessDrawer';
import styles from '../access.module.css';

type Option = { id: string; label: string };
type Lookups = { divisions?: Option[]; positions?: Option[]; locations?: Option[] };
type ListResponse = { items: AccessEmployeeRow[]; total: number; page: number; totalPages: number };
type ModalState = { action: 'grant' | 'revoke'; employees: { id: string; fullName: string }[] } | null;

const GRANT_STATUSES = ['active', 'expiring', 'expired', 'revoked', 'none'] as const;
const EMPLOYEE_STATUSES = ['active', 'leave', 'dismissed', 'all'] as const;
const PAGE_SIZE = 50;

function chipClass(g: AccessGrant) {
  if (g.readOnly) return styles.chip_readonly;
  return g.status === 'active' ? styles.chip : styles[`chip_${g.status}`];
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function EmployeeAccessPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q] = useUrlParam('q', '');
  const [grantStatus] = useUrlParam('grantStatus', '', GRANT_STATUSES);
  const [accessType] = useUrlParam('accessType', '');
  const [status] = useUrlParam('status', 'active', EMPLOYEE_STATUSES);
  const [divisionId] = useUrlParam('divisionId', '');
  const [positionId] = useUrlParam('positionId', '');
  const [locationId] = useUrlParam('locationId', '');
  const [pageParam, setPageParam] = useUrlParam('page', '1');
  const [openEmployee, setOpenEmployee] = useUrlParam('employee', '');

  /** Several keys in one navigation — separate setters would each start from the stale URL. */
  const patchParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounced(search, 350);
  const [options, setOptions] = useState<AccessOptions | null>(null);
  const [summary, setSummary] = useState<AccessSummary | null>(null);
  const [lookups, setLookups] = useState<Lookups>({});
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [modal, setModal] = useState<ModalState>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const page = Math.max(1, Number(pageParam) || 1);

  useEffect(() => {
    if (debouncedSearch !== q) patchParams({ q: debouncedSearch, page: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    apiFetch<AccessOptions>('/api/access/options')
      .then(setOptions)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    apiFetch<Lookups>('/api/catalog/lookups')
      .then(setLookups)
      .catch(() => setLookups({}));
  }, []);

  useEffect(() => {
    apiFetch<AccessSummary>('/api/access/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [reloadKey]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const filters = { q, grantStatus, accessType, status, divisionId, positionId, locationId };
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<ListResponse>(`/api/access/employees?${params}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, grantStatus, accessType, status, divisionId, positionId, locationId, page, reloadKey]);

  const setFilter = useCallback(
    (key: string) => (v: string) => patchParams({ [key]: v, page: '' }),
    [patchParams],
  );

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const closeDrawer = useCallback(() => setOpenEmployee(''), [setOpenEmployee]);

  const rows = data?.items ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const typeLabel = useMemo(
    () => new Map((options?.types ?? []).map((t) => [t.id, t.label])),
    [options],
  );

  function toggleRow(row: AccessEmployeeRow, on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(row.id, row.fullName);
      else next.delete(row.id);
      return next;
    });
  }

  function togglePage(on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (on) next.set(r.id, r.fullName);
        else next.delete(r.id);
      }
      return next;
    });
  }

  async function onModalDone(result: BulkAccessResult | null) {
    setModal(null);
    refresh();
    if (!result) return;
    const failed = result.results.filter((r) => !r.ok);
    const names = new Map(selected);
    setSelected(new Map(failed.map((f) => [f.employeeId, names.get(f.employeeId) ?? f.employeeId])));
    await alert({
      title: 'Результат групповой операции',
      variant: failed.length ? 'default' : 'success',
      message: [
        `Успешно: ${result.succeeded}. Ошибок: ${result.failed}.`,
        ...failed.slice(0, 10).map((f) => `• ${names.get(f.employeeId) ?? f.employeeId}: ${f.error}`),
        failed.length > 10 ? `…и ещё ${failed.length - 10}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  const statCards: { key: string; label: string; value: number | undefined }[] = [
    { key: 'active', label: 'Активные доступы', value: summary?.active },
    { key: 'expiring', label: `Истекают (≤ ${options?.expiringDays ?? 14} дн.)`, value: summary?.expiring },
    { key: 'expired', label: 'Истёкшие', value: summary?.expired },
    { key: 'revoked', label: 'Отозванные', value: summary?.revoked },
  ];

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <Link href="/access" className={styles.back}>
            ← Доступы
          </Link>
          <h1 className={styles.title}>Доступы сотрудников</h1>
          <p className={styles.subtitle}>
            Доступ к оргструктуре и КПЭ, ограничения профиля. Сотрудников с доступами:{' '}
            {summary?.employeesWithAccess ?? '—'}
          </p>
        </div>
        <Link href="/catalog/reports/access" className={styles.btn}>
          <i className="fas fa-file-alt" aria-hidden /> Отчёт по доступам
        </Link>
      </header>

      <div className={styles.stats} role="group" aria-label="Сводка по доступам">
        {statCards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={grantStatus === c.key ? styles.statActive : styles.stat}
            aria-pressed={grantStatus === c.key}
            onClick={() => setFilter('grantStatus')(grantStatus === c.key ? '' : c.key)}
          >
            <span className={styles.statValue}>{c.value ?? '—'}</span>
            <span className={styles.statLabel}>{c.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.filters}>
        <label className={styles.field}>
          Поиск
          <input
            type="search"
            className={styles.input}
            value={search}
            placeholder="ФИО, табельный номер, телефон…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Тип доступа
          <select className={styles.select} value={accessType} onChange={(e) => setFilter('accessType')(e.target.value)}>
            <option value="">Все управляемые</option>
            {(options?.types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Статус доступа
          <select className={styles.select} value={grantStatus} onChange={(e) => setFilter('grantStatus')(e.target.value)}>
            <option value="">Любой</option>
            {(['active', 'expiring', 'expired', 'revoked'] as const).map((s) => (
              <option key={s} value={s}>
                {GRANT_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="none">Без доступа</option>
          </select>
        </label>
        <label className={styles.field}>
          Сотрудники
          <select className={styles.select} value={status} onChange={(e) => setFilter('status')(e.target.value)}>
            <option value="active">Работающие</option>
            <option value="leave">В отпуске</option>
            <option value="dismissed">Уволенные</option>
            <option value="all">Все</option>
          </select>
        </label>
        <label className={styles.field}>
          Подразделение
          <select className={styles.select} value={divisionId} onChange={(e) => setFilter('divisionId')(e.target.value)}>
            <option value="">Все</option>
            {(lookups.divisions ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Должность
          <select className={styles.select} value={positionId} onChange={(e) => setFilter('positionId')(e.target.value)}>
            <option value="">Все</option>
            {(lookups.positions ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Локация
          <select className={styles.select} value={locationId} onChange={(e) => setFilter('locationId')(e.target.value)}>
            <option value="">Все</option>
            {(lookups.locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {options?.canGrant && selected.size > 0 ? (
        <div className={styles.bulkBar} role="toolbar" aria-label="Групповые действия">
          <span className={styles.bulkCount}>Выбрано: {selected.size}</span>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              setModal({ action: 'grant', employees: [...selected].map(([id, fullName]) => ({ id, fullName })) })
            }
          >
            Выдать доступ
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() =>
              setModal({ action: 'revoke', employees: [...selected].map(([id, fullName]) => ({ id, fullName })) })
            }
          >
            Отозвать доступ
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Map())}>
            Снять выбор
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {options?.canGrant ? (
                <th className={styles.checkCell}>
                  <input
                    type="checkbox"
                    aria-label="Выбрать всех на странице"
                    checked={allOnPage}
                    onChange={(e) => togglePage(e.target.checked)}
                  />
                </th>
              ) : null}
              <th>Сотрудник</th>
              <th>Подразделение / должность</th>
              <th>Доступы</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const shown = r.grants.filter(
                (g) => (!g.readOnly || g.accessType === accessType) && g.status !== 'revoked',
              );
              return (
                <tr key={r.id}>
                  {options?.canGrant ? (
                    <td className={styles.checkCell}>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${r.fullName}`}
                        checked={selected.has(r.id)}
                        onChange={(e) => toggleRow(r, e.target.checked)}
                      />
                    </td>
                  ) : null}
                  <td>
                    <div className={styles.empName}>{r.fullName}</div>
                    <div className={styles.muted}>
                      Таб. № {r.tabNumber}
                      {r.status === 'dismissed' ? ' · уволен' : r.status === 'leave' ? ' · в отпуске' : ''}
                    </div>
                  </td>
                  <td>
                    <div>{r.division?.name ?? '—'}</div>
                    <div className={styles.muted}>{r.position?.name ?? ''}</div>
                  </td>
                  <td>
                    {shown.length ? (
                      <div className={styles.chips}>
                        {shown.map((g) => (
                          <span
                            key={g.id}
                            className={chipClass(g)}
                            title={`${GRANT_STATUS_LABELS[g.status]}${g.expiresAt ? ` · до ${new Date(g.expiresAt).toLocaleDateString('ru-RU')}` : ''}`}
                          >
                            {typeLabel.get(g.accessType) ?? g.typeLabel}
                            {g.resourceLabel && g.resource !== '*' ? `: ${g.resourceLabel}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.muted}>Нет</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className={styles.linkBtn} onClick={() => setOpenEmployee(r.id)}>
                      Подробнее
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? <p className={styles.tableEmpty}>Сотрудники не найдены</p> : null}
        {loading && !data ? <p className={styles.tableEmpty}>Загрузка…</p> : null}
      </div>

      {data && data.totalPages > 1 ? (
        <nav className={styles.pager} aria-label="Страницы">
          <span>
            Всего: {data.total} · страница {data.page} из {data.totalPages}
          </span>
          <div className={styles.pagerBtns}>
            <button
              type="button"
              className={styles.btn}
              disabled={page <= 1}
              onClick={() => setPageParam(page - 1 > 1 ? String(page - 1) : '')}
            >
              ← Назад
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={page >= data.totalPages}
              onClick={() => setPageParam(String(page + 1))}
            >
              Вперёд →
            </button>
          </div>
        </nav>
      ) : data ? (
        <p className={styles.muted}>Всего: {data.total}</p>
      ) : null}

      {options && openEmployee ? (
        <EmployeeAccessDrawer
          employeeId={openEmployee}
          options={options}
          reloadKey={reloadKey}
          onClose={closeDrawer}
          onChanged={refresh}
          onGrant={(employee) => setModal({ action: 'grant', employees: [employee] })}
        />
      ) : null}

      {options && modal ? (
        <AccessGrantModal
          open
          action={modal.action}
          employees={modal.employees}
          options={options}
          divisions={lookups.divisions ?? []}
          onClose={() => setModal(null)}
          onDone={onModalDone}
        />
      ) : null}
    </div>
  );
}
