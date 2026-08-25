'use client';
import { confirm } from '@/lib/dialogs';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { RESOURCE_META, FieldDef } from '@/lib/catalog-nav';
import { columnsForResource, labelFor, ColumnDef } from '@/lib/catalog-columns';
import { CATALOG_SIBLING_KEY } from '@/lib/form-siblings';
import { downloadCsv, flattenRow } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { FilterPanel, FilterFieldDef, useFilterFromUrl, filterFieldKeys } from '@/components/FilterPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { PrintArea } from '@/components/PrintArea';
import { PrintButton } from '@/components/PrintButton';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '../../../page-shared.module.css';

const LEGACY_ROUTES: Record<string, { list: string; create: string }> = {
  persons: { list: '/api/persons', create: '/api/persons' },
  'hr-documents': { list: '/api/hr/documents', create: '/api/hr/documents' },
  'absence-types': { list: '/api/hr/absence-types', create: '/api/hr/absence-types' },
};

const STATUS_FILTER_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'posted', label: 'Проведён' },
  { value: 'open', label: 'Открыт' },
  { value: 'matched', label: 'Сопоставлен' },
  { value: 'completed', label: 'Завершён' },
  { value: 'pending', label: 'Ожидание' },
  { value: 'approved', label: 'Утверждён' },
  { value: 'sent', label: 'Отправлен' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'rejected', label: 'Отклонён' },
  { value: 'closed', label: 'Закрыт' },
];

const STATUS_RESOURCES = new Set([
  'name-changes',
  'wage-changes',
  'hr-documents',
  'clearance-sheets',
  'tariff-approvals',
  'settlements',
  'sales-accruals',
  'payment-orders',
  'payroll-lines',
]);

const PAYROLL_TYPE_OPTIONS = [
  { value: 'base', label: 'base' },
  { value: 'bonus', label: 'bonus' },
  { value: 'penalty', label: 'penalty' },
  { value: 'deduction', label: 'deduction / удержание' },
  { value: 'overtime', label: 'overtime' },
  { value: 'other', label: 'other / разовые' },
  { value: 'advance', label: 'advance' },
];

type Lookups = Record<string, { id: string; label: string }[]>;

type RowAction = { label: string; endpoint: string };

const LOOKUP_MAP: Record<string, string> = {
  employeeId: 'employees',
  personId: 'persons',
  gradeId: 'grades',
  divisionId: 'divisions',
  positionId: 'positions',
  scheduleId: 'schedules',
  locationId: 'locations',
  incidentTypeId: 'incidentTypes',
  tariffGroupId: 'tariffGroups',
  staffPositionId: 'staffPositions',
  policyId: 'salesPolicies',
  accountPairId: 'accountPairs',
  templateId: 'clearanceTemplates',
  careerPathId: 'careerPaths',
  dismissalReasonId: 'dismissalReasons',
};

function rowStatus(row: Record<string, unknown>): string {
  return String(row.status ?? '').trim().toLowerCase();
}

function rowIsActive(row: Record<string, unknown>): boolean {
  return row.isActive === true || row.isActive === 1 || row.isActive === '1' || row.isActive === 'true';
}

function getRowActions(resource: string, row: Record<string, unknown>): RowAction[] {
  const id = String(row.id);
  const status = rowStatus(row);
  const isActive = rowIsActive(row);

  switch (resource) {
    case 'name-changes':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/catalog/name-changes/${id}/post` },
          { label: 'Отменить', endpoint: `/api/catalog/name-changes/${id}/cancel` },
        ];
      }
      break;
    case 'wage-changes':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/catalog/wage-changes/${id}/post` },
          { label: 'Отменить', endpoint: `/api/catalog/wage-changes/${id}/cancel` },
        ];
      }
      break;
    case 'hr-documents':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/hr/documents/${id}/post` },
          { label: 'Отменить', endpoint: `/api/hr/documents/${id}/cancel` },
        ];
      }
      if (status === 'posted') {
        return [{ label: 'Отменить проведение', endpoint: `/api/hr/documents/${id}/unpost` }];
      }
      break;
    case 'clearance-sheets':
      if (status !== 'completed' && status !== 'cancelled') {
        return [
          { label: 'Завершить', endpoint: `/api/catalog/clearance-sheets/${id}/complete` },
          { label: 'Отменить', endpoint: `/api/catalog/clearance-sheets/${id}/cancel` },
        ];
      }
      break;
    case 'tariff-approvals':
      if (status === 'pending' || status === 'draft') {
        return [
          { label: 'Утвердить', endpoint: `/api/catalog/tariff-approvals/${id}/approve` },
          { label: 'Отклонить', endpoint: `/api/catalog/tariff-approvals/${id}/reject` },
        ];
      }
      break;
    case 'settlements':
      if (status === 'open') {
        return [{ label: 'Провести', endpoint: `/api/catalog/settlements/${id}/post` }];
      }
      if (status === 'matched') {
        return [{ label: 'Закрыть', endpoint: `/api/catalog/settlements/${id}/close` }];
      }
      break;
    case 'sales-accruals':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/catalog/sales-accruals/${id}/post` },
          { label: 'Отменить', endpoint: `/api/catalog/sales-accruals/${id}/cancel` },
        ];
      }
      break;
    case 'payment-orders':
      if (status === 'open' || status === 'new') {
        return [{ label: 'Отправить', endpoint: `/api/catalog/payment-orders/${id}/send` }];
      }
      if (status === 'sent') {
        return [{ label: 'Выплатить', endpoint: `/api/catalog/payment-orders/${id}/pay` }];
      }
      break;
    case 'gph-contracts':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/catalog/gph-contracts/${id}/post` },
          ...(isActive
            ? [{ label: 'Закрыть', endpoint: `/api/catalog/gph-contracts/${id}/close` }]
            : [{ label: 'Активировать', endpoint: `/api/catalog/gph-contracts/${id}/activate` }]),
        ];
      }
      if (status === 'posted') {
        return [
          { label: 'Отменить проведение', endpoint: `/api/catalog/gph-contracts/${id}/unpost` },
          ...(isActive
            ? [{ label: 'Закрыть', endpoint: `/api/catalog/gph-contracts/${id}/close` }]
            : [{ label: 'Активировать', endpoint: `/api/catalog/gph-contracts/${id}/activate` }]),
        ];
      }
      if (!isActive) {
        return [{ label: 'Активировать', endpoint: `/api/catalog/gph-contracts/${id}/activate` }];
      }
      return [{ label: 'Закрыть', endpoint: `/api/catalog/gph-contracts/${id}/close` }];
    case 'payroll-lines':
      if (status === 'draft') {
        return [
          { label: 'Провести', endpoint: `/api/payroll/lines/${id}/post` },
          { label: 'Отменить', endpoint: `/api/payroll/lines/${id}/cancel` },
        ];
      }
      if (status === 'posted') {
        return [{ label: 'Отменить', endpoint: `/api/payroll/lines/${id}/cancel` }];
      }
      break;
  }
  return [];
}

function resourceHasStatus(
  resource: string,
  meta: { fields: FieldDef[] } | undefined,
  rows: Record<string, unknown>[],
): boolean {
  if (STATUS_RESOURCES.has(resource)) return true;
  if (meta?.fields.some((f) => f.name === 'status')) return true;
  return rows.some((r) => r.status != null && r.status !== '');
}

function resourceHasIsActive(
  meta: { fields: FieldDef[] } | undefined,
  rows: Record<string, unknown>[],
): boolean {
  if (meta?.fields.some((f) => f.name === 'isActive')) return true;
  return rows.some((r) => r.isActive != null);
}

function buildFilterFields(
  resource: string,
  meta: { fields: FieldDef[] } | undefined,
  rows: Record<string, unknown>[],
  lookups: Lookups,
): FilterFieldDef[] {
  if (resource === 'name-changes') {
    return [
      {
        type: 'dateRange',
        label: 'Дата',
        fromKey: 'from',
        toKey: 'to',
      },
      {
        type: 'text',
        key: 'number',
        label: 'Номер',
        placeholder: 'Поиск...',
      },
      {
        type: 'select',
        key: 'employeeId',
        label: 'Сотрудники',
        options: (lookups.employees || []).map((e) => ({
          value: e.id,
          label: e.label,
        })),
      },
      {
        type: 'text',
        key: 'oldName',
        label: 'Предыдущие имена',
        placeholder: 'Поиск...',
      },
      {
        type: 'postedChecks',
        key: 'posted',
        label: 'Проведен',
      },
    ];
  }

  if (resource === 'gph-contracts') {
    return [
      {
        type: 'dateRange',
        label: 'Дата',
        fromKey: 'from',
        toKey: 'to',
      },
      {
        type: 'text',
        key: 'number',
        label: 'Номер договора',
        placeholder: 'Поиск...',
      },
      {
        type: 'select',
        key: 'employeeId',
        label: 'Физическое лицо / сотрудник',
        options: (lookups.employees || []).map((e) => ({
          value: e.id,
          label: e.label,
        })),
      },
      {
        type: 'select',
        key: 'divisionId',
        label: 'Подразделение',
        options: (lookups.divisions || []).map((d) => ({
          value: d.id,
          label: d.label,
        })),
      },
      {
        type: 'postedChecks',
        key: 'posted',
        label: 'Проведен',
      },
    ];
  }

  const fields: FilterFieldDef[] = [{ type: 'search' }];
  if (resourceHasStatus(resource, meta, rows)) {
    fields.push({ type: 'status', options: STATUS_FILTER_OPTIONS });
  }
  fields.push(
    { type: 'dateFrom', key: 'from', label: 'Дата с' },
    { type: 'dateTo', key: 'to', label: 'Дата по' },
  );
  if (resourceHasIsActive(meta, rows)) {
    fields.push({ type: 'isActive' });
  }
  if (resource === 'payroll-lines') {
    fields.push({
      type: 'select',
      key: 'type',
      label: 'Тип',
      options: PAYROLL_TYPE_OPTIONS,
    });
  }
  if (resource === 'hr-documents') {
    fields.push({
      type: 'select',
      key: 'type',
      label: 'Тип документа',
      options: [
        { value: 'hire', label: 'Приём' },
        { value: 'transfer', label: 'Перевод' },
        { value: 'dismiss', label: 'Увольнение' },
        { value: 'name_change', label: 'Изменение имени' },
        { value: 'wage_change', label: 'Изменение оплаты' },
        { value: 'other', label: 'Прочее' },
      ],
    });
  }
  const empResources = new Set([
    'hr-documents',
    'staff-positions',
    'grade-history',
    'wage-changes',
    'clearance-sheets',
    'incidents',
    'internal-trips',
    'payroll-lines',
    'sales-accruals',
    'loans',
    'payment-orders',
    'settlements',
    'travel-expenses',
    'schedule-overrides',
    'timesheet-adjustments',
    'relatives',
    'access-grants',
  ]);
  if (empResources.has(resource) && lookups.employees?.length) {
    fields.push({
      type: 'select',
      key: 'employeeId',
      label: 'Сотрудник',
      options: lookups.employees.map((e) => ({ value: e.id, label: e.label })),
    });
  }
  if (['staff-positions', 'hr-documents'].includes(resource)) {
    if (lookups.divisions?.length) {
      fields.push({
        type: 'select',
        key: 'divisionId',
        label: 'Подразделение',
        options: lookups.divisions.map((d) => ({ value: d.id, label: d.label })),
      });
    }
    if (lookups.positions?.length) {
      fields.push({
        type: 'select',
        key: 'positionId',
        label: 'Должность',
        options: lookups.positions.map((p) => ({ value: p.id, label: p.label })),
      });
    }
  }
  if (['staff-positions', 'grade-history'].includes(resource) && lookups.grades?.length) {
    fields.push({
      type: 'select',
      key: 'gradeId',
      label: 'Разряд',
      options: lookups.grades.map((g) => ({ value: g.id, label: g.label })),
    });
  }
  if (
    ['schedule-overrides', 'position-schedules', 'schedule-shifts'].includes(resource) &&
    lookups.schedules?.length
  ) {
    fields.push({
      type: 'select',
      key: 'scheduleId',
      label: 'График',
      options: lookups.schedules.map((s) => ({ value: s.id, label: s.label })),
    });
  }
  if (resource === 'internal-trips' && lookups.locations?.length) {
    fields.push({
      type: 'select',
      key: 'locationId',
      label: 'Локация',
      options: lookups.locations.map((l) => ({ value: l.id, label: l.label })),
    });
  }
  return fields;
}

function buildApiQueryString(opts: {
  urlType?: string;
  status?: string;
  from?: string;
  to?: string;
  isActive?: string;
}): string {
  const qs = new URLSearchParams();
  if (opts.urlType) qs.set('type', opts.urlType);
  if (opts.status) qs.set('status', opts.status);
  if (opts.from) qs.set('from', opts.from);
  if (opts.to) qs.set('to', opts.to);
  if (opts.isActive) qs.set('isActive', opts.isActive);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function applyClientFilters(
  rows: Record<string, unknown>[],
  opts: {
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    isActive?: string;
    type?: string;
  },
): Record<string, unknown>[] {
  let list = rows;
  if (opts.type) {
    list = list.filter((r) => String(r.type) === opts.type);
  }
  if (opts.status) {
    const s = opts.status.toLowerCase();
    list = list.filter((r) => rowStatus(r) === s);
  }
  if (opts.isActive) {
    const wantActive = opts.isActive === '1' || opts.isActive === 'true';
    list = list.filter((r) => rowIsActive(r) === wantActive);
  }
  if (opts.from || opts.to) {
    list = list.filter((r) => {
      const raw =
        r.documentDate ??
        r.effectiveAt ??
        r.startDate ??
        r.createdAt ??
        r.openedAt ??
        r.dueDate;
      if (!raw) return !opts.from && !opts.to;
      const day = String(raw).slice(0, 10);
      if (opts.from && day < opts.from) return false;
      if (opts.to && day > opts.to) return false;
      return true;
    });
  }
  if (opts.q?.trim()) {
    const qq = opts.q.trim().toLowerCase();
    list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
  }
  return list;
}

function renderCellValue(
  col: string,
  row: Record<string, unknown>,
  flat: Record<string, string>,
) {
  if (col === 'status' && row.status != null && row.status !== '') {
    return <StatusBadge status={String(row.status)} />;
  }
  if (col === 'isActive' && row.isActive != null) {
    return <StatusBadge status={rowIsActive(row) ? 'active' : 'closed'} />;
  }
  return flat[col] || '—';
}

export default function CatalogResourcePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const resource = String(params.resource || '');
  const meta = RESOURCE_META[resource];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [filterOpen, setFilterOpen] = useState(false);

  const filterFields = useMemo(
    () => buildFilterFields(resource, meta, rows, lookups),
    [resource, meta, rows, lookups],
  );
  const filterKeys = useMemo(() => filterFieldKeys(filterFields), [filterFields]);
  const urlFilters = useFilterFromUrl(filterKeys);

  useEffect(() => {
    const hasActive = filterKeys.some((k) => (urlFilters[k] ?? '').trim());
    if (hasActive) setFilterOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — open once from URL on mount

  const q = urlFilters.q ?? '';
  const status = urlFilters.status ?? '';
  const from = urlFilters.from ?? '';
  const to = urlFilters.to ?? '';
  const isActive = urlFilters.isActive ?? '';
  const typeFromFilter = urlFilters.type ?? '';
  const employeeIdFilter = urlFilters.employeeId ?? '';
  const divisionIdFilter = urlFilters.divisionId ?? '';
  const positionIdFilter = urlFilters.positionId ?? '';
  const gradeIdFilter = urlFilters.gradeId ?? '';
  const scheduleIdFilter = urlFilters.scheduleId ?? '';
  const locationIdFilter = urlFilters.locationId ?? '';
  const numberFilter = urlFilters.number ?? '';
  const oldNameFilter = urlFilters.oldName ?? '';
  const postedFilter = urlFilters.posted ?? '';

  const title = meta?.title || resource;
  const urlType = searchParams?.get('type') || typeFromFilter;
  const legacy = LEGACY_ROUTES[resource];
  const canExportExcel = !['persons', 'hr-documents'].includes(resource);
  const showPrint = resource === 'hr-documents' || resource === 'clearance-sheets';

  const apiStatus =
    postedFilter === 'yes'
      ? 'posted'
      : postedFilter === 'no'
        ? 'unposted'
        : postedFilter === 'both'
          ? undefined
          : status || undefined;

  const apiQuerySuffix = useMemo(
    () =>
      buildApiQueryString({
        urlType: urlType || undefined,
        status: apiStatus,
        from: from || undefined,
        to: to || undefined,
        isActive: isActive || undefined,
      }),
    [urlType, apiStatus, from, to, isActive],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data: Record<string, unknown>[];
      if (legacy) {
        data = await apiFetch<Record<string, unknown>[]>(legacy.list);
      } else {
        data = await apiFetch<Record<string, unknown>[]>(
          `/api/catalog/${resource}${apiQuerySuffix}`,
        );
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [resource, legacy, apiQuerySuffix]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiFetch<Lookups>('/api/catalog/lookups')
      .then(setLookups)
      .catch(() => setLookups({}));
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (legacy) {
      list = applyClientFilters(rows, {
        q,
        status,
        from,
        to,
        isActive,
        type: urlType || undefined,
      });
    } else if (q.trim()) {
      const qq = q.trim().toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
    }
    if (employeeIdFilter) {
      list = list.filter((r) => String(r.employeeId ?? '') === employeeIdFilter);
    }
    if (divisionIdFilter) {
      list = list.filter(
        (r) =>
          String(r.divisionId ?? '') === divisionIdFilter ||
          String((r.division as { id?: string } | undefined)?.id ?? '') === divisionIdFilter,
      );
    }
    if (positionIdFilter) {
      list = list.filter(
        (r) =>
          String(r.positionId ?? '') === positionIdFilter ||
          String((r.position as { id?: string } | undefined)?.id ?? '') === positionIdFilter,
      );
    }
    if (gradeIdFilter) {
      list = list.filter(
        (r) =>
          String(r.gradeId ?? '') === gradeIdFilter ||
          String((r.grade as { id?: string } | undefined)?.id ?? '') === gradeIdFilter,
      );
    }
    if (scheduleIdFilter) {
      list = list.filter((r) => String(r.scheduleId ?? '') === scheduleIdFilter);
    }
    if (locationIdFilter) {
      list = list.filter((r) => String(r.locationId ?? '') === locationIdFilter);
    }
    if (numberFilter.trim()) {
      const nq = numberFilter.trim().toLowerCase();
      list = list.filter((r) => {
        const num = String(r.documentNumber ?? r.number ?? '').toLowerCase();
        return num.includes(nq);
      });
    }
    if (oldNameFilter.trim()) {
      const oq = oldNameFilter.trim().toLowerCase();
      list = list.filter((r) => {
        const blob = [r.oldLastName, r.oldFirstName, r.oldMiddleName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(oq);
      });
    }
    if (postedFilter === 'yes') {
      list = list.filter((r) => String(r.status) === 'posted');
    } else if (postedFilter === 'no') {
      list = list.filter((r) => String(r.status) !== 'posted');
    }
    return list;
  }, [
    rows,
    q,
    legacy,
    status,
    from,
    to,
    isActive,
    urlType,
    employeeIdFilter,
    divisionIdFilter,
    positionIdFilter,
    gradeIdFilter,
    scheduleIdFilter,
    locationIdFilter,
    numberFilter,
    oldNameFilter,
    postedFilter,
  ]);

  const columns = useMemo((): ColumnDef[] => {
    const predefined = columnsForResource(resource);
    if (predefined?.length) return predefined;
    if (!filtered.length) {
      return (meta?.fields.map((f) => ({ key: f.name, label: f.label })) ?? [
        { key: 'id', label: 'ID' },
      ]) as ColumnDef[];
    }
    const keys = Object.keys(flattenRow(filtered[0])).filter(
      (k) => !k.includes('tenantId') && !k.includes('rawPayload') && k !== 'updatedAt',
    );
    return keys.slice(0, 12).map((k) => ({ key: k, label: labelFor(k) }));
  }, [filtered, meta, resource]);

  async function runLifecycleAction(endpoint: string) {
    setError('');
    try {
      await apiFetch(endpoint, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function exportExcel() {
    setError('');
    try {
      await downloadXlsxViaApi(
        `/api/catalog/${resource}/export.xlsx${apiQuerySuffix}`,
        `${resource}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта Excel');
    }
  }

  function openCreate() {
    setEditId(null);
    setEditDefaults(urlType ? { type: urlType } : {});
    setShowForm(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditId(String(row.id));
    const d: Record<string, string> = {};
    for (const f of meta?.fields ?? []) {
      const v = row[f.name];
      if (v == null) continue;
      if (typeof v === 'object') continue;
      d[f.name] = String(v).slice(0, 32) === String(v) ? String(v) : String(v);
      if (f.type === 'date' && typeof v === 'string') d[f.name] = v.slice(0, 10);
      if (f.type === 'datetime-local' && typeof v === 'string') {
        d[f.name] = v.slice(0, 16);
      }
    }
    for (const f of meta?.fields ?? []) {
      if (f.name.endsWith('Id') && row[f.name]) d[f.name] = String(row[f.name]);
    }
    setEditDefaults(d);
    setShowForm(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) {
      if (v === '') continue;
      const field = meta?.fields.find((f) => f.name === k);
      if (field?.type === 'number') body[k] = Number(v);
      else body[k] = v;
    }
    // HrDocument side-effect fields live in payload JSON
    if (resource === 'hr-documents') {
      const payloadKeys = [
        'divisionId',
        'positionId',
        'baseSalary',
        'dismissalReasonId',
        'newLastName',
        'newFirstName',
        'newMiddleName',
        'newAmount',
      ];
      const payload: Record<string, unknown> = {};
      for (const k of payloadKeys) {
        if (body[k] != null && body[k] !== '') {
          payload[k] = body[k];
          delete body[k];
        }
      }
      if (Object.keys(payload).length) body.payload = payload;
      if (!body.type && urlType) body.type = urlType;
      if (!body.title && body.type) {
        const titles: Record<string, string> = {
          hire: 'Приём на работу',
          transfer: 'Кадровый перевод',
          dismiss: 'Увольнение',
          name_change: 'Изменение имени',
          wage_change: 'Изменение оплаты труда',
          other: 'Кадровый документ',
        };
        body.title = titles[String(body.type)] ?? 'Кадровый документ';
      }
    }
    try {
      if (editId && !legacy) {
        await apiFetch(`/api/catalog/${resource}/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else if (legacy) {
        await apiFetch(legacy.create, { method: 'POST', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/api/catalog/${resource}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowForm(false);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  }

  async function onDelete(id: string) {
    if (!(await confirm('Удалить запись?'))) return;
    try {
      if (legacy) {
        setError('Удаление для этого ресурса недоступно');
        return;
      }
      await apiFetch(`/api/catalog/${resource}/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }

  function renderField(f: FieldDef) {
    const lookupKey = LOOKUP_MAP[f.name];
    const options = lookupKey ? lookups[lookupKey] : undefined;
    const defaultVal = editDefaults[f.name] ?? '';
    if (options?.length) {
      return (
        <label key={f.name}>
          {f.label}
          <select name={f.name} required={f.required} defaultValue={defaultVal}>
            <option value="">— выберите —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={f.name}>
        {f.label}
        <input
          name={f.name}
          type={f.type || 'text'}
          required={f.required}
          defaultValue={defaultVal}
          step={f.type === 'number' ? 'any' : undefined}
        />
      </label>
    );
  }

  const tableContent = (
    <div className={styles.panel}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: 'left',
                  padding: '0.65rem 0.85rem',
                  borderBottom: '1px solid var(--line)',
                  color: 'var(--ink-muted)',
                  fontWeight: 600,
                }}
              >
                {c.label}
              </th>
            ))}
            <th style={{ padding: '0.65rem' }} />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className={styles.empty}>
                Пусто — нажмите «Создать»
              </td>
            </tr>
          ) : (
            filtered.map((row) => {
              const flat = flattenRow(row);
              const actions = getRowActions(resource, row);
              return (
                <tr key={String(row.id)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderBottom: '1px solid var(--line-soft)',
                      }}
                    >
                      {renderCellValue(c.key, row, flat)}
                    </td>
                  ))}
                  <td
                    className="noPrint"
                    style={{ padding: '0.55rem 0.85rem', whiteSpace: 'nowrap' }}
                  >
                    {actions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        className={`${styles.btnGhost} ${styles.btnSm}`}
                        onClick={() => void runLifecycleAction(a.endpoint)}
                      >
                        {a.label}
                      </button>
                    ))}{' '}
                    {typeof row.id === 'string' && !legacy ? (
                      <>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => openEdit(row)}
                        >
                          Изменить
                        </button>{' '}
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => onDelete(row.id as string)}
                        >
                          Удалить
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.wrap}>
      {CATALOG_SIBLING_KEY[resource] ? (
        <PageSubnav
          groupKey={CATALOG_SIBLING_KEY[resource]}
          titleOverride={title}
        />
      ) : null}
      <div className={styles.header}>
        <div>
          {!CATALOG_SIBLING_KEY[resource] ? (
            <h1 className={styles.h1}>{title}</h1>
          ) : null}
          <p className={styles.lead}>
            Каталог · {resource}
            {urlType ? ` · type=${urlType}` : ''} · {filtered.length} строк
          </p>
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => downloadCsv(resource, filtered)}
            disabled={!filtered.length}
          >
            CSV
          </button>
          {canExportExcel ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => void exportExcel()}
              disabled={loading}
            >
              Excel
            </button>
          ) : null}
          {showPrint ? <PrintButton /> : null}
          <button type="button" className={styles.btnSecondary} onClick={() => load()}>
            Обновить
          </button>
          {meta && (
            <button type="button" className={styles.btnSuccess} onClick={openCreate}>
              Создать
            </button>
          )}
          <FilterPanel
            inline
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            fields={filterFields}
            onApply={() => load()}
          />
        </div>
      </div>

      {resource === 'payroll-lines' ? (
        <ImportPanel
          endpoint="/api/payroll/lines/import"
          hint="Столбцы: periodId ИЛИ year,month; employeeTabNumber ИЛИ employeeId; type (по умолчанию other); amount; description?"
          onDone={() => void load()}
        />
      ) : null}

      {error && <p className={styles.error}>{error}</p>}

      {showForm && meta && (
        <div className={styles.formPanel}>
          <form className={styles.form} key={editId || 'new'} onSubmit={onSubmit}>
            <strong>{editId ? 'Редактирование' : 'Новая запись'}</strong>
            {meta.fields.map(renderField)}
            <div className={styles.rowActions}>
              <button type="submit" className={styles.btn}>
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : showPrint ? (
        <PrintArea report={resource === 'hr-documents'}>{tableContent}</PrintArea>
      ) : (
        tableContent
      )}
    </div>
  );
}
