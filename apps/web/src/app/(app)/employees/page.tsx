'use client';
import { confirm } from '@/lib/dialogs';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { employeeListPrefs } from '@/lib/table-field-defs/catalog-lists';
import { apiFetch, PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { FormModal } from '@/components/FormModal';
import type { PassportScanResult } from '@/components/PassportScanModal';
import modal from '@/components/form-modal.module.css';
import { useUrlParam } from '@/lib/use-url-state';
import shared from '../../page-shared.module.css';
import arena from './page.module.css';

const ImportPanel = dynamic(
  () =>
    import('@/components/ImportPanel').then((m) => ({ default: m.ImportPanel })),
  { ssr: false },
);
const PassportScanModal = dynamic(
  () =>
    import('@/components/PassportScanModal').then((m) => ({
      default: m.PassportScanModal,
    })),
  { ssr: false },
);
const TelegramJoinPanel = dynamic(
  () =>
    import('@/components/employees/TelegramJoinPanel').then((m) => ({
      default: m.TelegramJoinPanel,
    })),
  { ssr: false },
);

type Emp = {
  id: string;
  tabNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  employmentType: string;
  hiredAt?: string | null;
  externalId?: string | null;
  code?: string | null;
  division?: { name: string } | null;
  position?: { name: string } | null;
  region?: { name: string } | null;
  grade?: { name: string } | null;
  schedule?: { name: string; startTime?: string; endTime?: string } | null;
  person?: {
    gender?: string | null;
    pinfl?: string | null;
    birthDate?: string | null;
    inn?: string | null;
    inps?: string | null;
    phone?: string | null;
    email?: string | null;
    addressResidence?: string | null;
    addressRegistration?: string | null;
  } | null;
  faceProfile?: { photoUrl?: string | null } | null;
  profileFlags?: {
    excludeFromStats?: boolean;
    systemAccessClosed?: boolean;
    marksBlocked?: boolean;
  };
};

type Division = { id: string; name: string };
type Position = { id: string; name: string };
type PersonOpt = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
};

type FormerMatch = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
  status: string;
  hiredAt: string | null;
  dismissedAt: string | null;
  division: string | null;
  position: string | null;
  pinflMasked: string | null;
  passportMasked: string | null;
  birthDate: string | null;
  matchKind: string;
  matchLabel: string;
  score: number;
};

type Tab = 'active' | 'dismissed' | 'gph' | 'all';

const TABS = ['active', 'dismissed', 'gph', 'all'] as const;
const FILTER_KEYS = ['q', 'divisionId', 'positionId'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

function genderLabel(g?: string | null) {
  if (!g) return '—';
  const u = g.trim().toUpperCase();
  if (u === 'M' || u === 'MALE' || u.startsWith('МУЖ')) return 'Мужской';
  if (u === 'F' || u === 'FEMALE' || u.startsWith('ЖЕН')) return 'Женский';
  return g;
}

function initials(lastName: string, firstName: string) {
  return `${(lastName || '?')[0] ?? ''}${(firstName || '?')[0] ?? ''}`.toUpperCase();
}

function empFio(e: Emp) {
  return `${e.lastName} ${e.firstName}${e.middleName ? ` ${e.middleName}` : ''}`.trim();
}

function statusLabel(status?: string | null) {
  if (!status) return '';
  if (status === 'active') return 'Активен';
  if (status === 'dismissed') return 'Уволен';
  return status;
}

function employmentTypeLabel(t?: string | null) {
  if (!t) return '';
  if (t === 'staff') return 'Штат';
  if (t === 'gph') return 'ГПХ';
  return t;
}

function cellOf(row: Emp, key: string): string {
  switch (key) {
    case 'fullName':
      return empFio(row);
    case 'tabNumber':
      return row.tabNumber || '';
    case 'lastName':
      return row.lastName || '';
    case 'firstName':
      return row.firstName || '';
    case 'middleName':
      return row.middleName || '';
    case 'region':
      return row.region?.name || '';
    case 'division':
      return row.division?.name || '';
    case 'position':
      return row.position?.name || '';
    case 'gender':
      return row.person?.gender ? genderLabel(row.person.gender) : '';
    case 'email':
      return row.email || row.person?.email || '';
    case 'phone':
      return row.phone || row.person?.phone || '';
    case 'pinfl':
      return row.person?.pinfl || '';
    case 'inn':
      return row.person?.inn || '';
    case 'inps':
      return row.person?.inps || '';
    case 'birthDate':
      return row.person?.birthDate
        ? String(row.person.birthDate).slice(0, 10)
        : '';
    case 'employmentType':
      return employmentTypeLabel(row.employmentType);
    case 'status':
    case 'workStatus':
      return statusLabel(row.status);
    case 'hiredAt':
      return row.hiredAt ? String(row.hiredAt).slice(0, 10) : '';
    case 'grade':
      return row.grade?.name || '';
    case 'schedule':
      if (!row.schedule) return '';
      if (row.schedule.name) return row.schedule.name;
      if (row.schedule.startTime && row.schedule.endTime) {
        return `${row.schedule.startTime}-${row.schedule.endTime}`;
      }
      return '';
    case 'id':
      return row.id;
    case 'code':
      return row.code || row.externalId || '';
    case 'addressResidence':
      return row.person?.addressResidence || '';
    case 'addressPostal':
      return row.person?.addressRegistration || '';
    default:
      return '';
  }
}

function EmployeesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab] = useUrlParam('tab', 'active', TABS);
  const filters = useFilterFromUrl(FILTER_KEYS);
  const q = filters.q;
  const divisionId = filters.divisionId;
  const positionId = filters.positionId;
  const prefs = useTablePrefs(employeeListPrefs);
  const [rows, setRows] = useState<Emp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalPages, setTotalPages] = useState(1);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [persons, setPersons] = useState<PersonOpt[]>([]);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<
    'none' | 'create' | 'attach' | 'import' | 'telegram'
  >('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActiveFilters = Boolean(q.trim() || divisionId || positionId);
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);
  const [exportBusy, setExportBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flagBusyId, setFlagBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [passportScan, setPassportScan] = useState<PassportScanResult | null>(null);
  const [createDraft, setCreateDraft] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    pinfl: '',
    passportSeries: '',
    passportNumber: '',
    birthDate: '',
  });
  const [formerMatches, setFormerMatches] = useState<FormerMatch[]>([]);
  const [matchBusy, setMatchBusy] = useState(false);
  const [rehireBusy, setRehireBusy] = useState(false);
  const photos = usePhotoLightbox();
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const matchSeq = useRef(0);

  const resetCreateDraft = useCallback(() => {
    setCreateDraft({
      lastName: '',
      firstName: '',
      middleName: '',
      pinfl: '',
      passportSeries: '',
      passportNumber: '',
      birthDate: '',
    });
    setFormerMatches([]);
    setPassportScan(null);
  }, []);

  const runMatchFormer = useCallback(async (draft: typeof createDraft) => {
    const hasSignal =
      draft.pinfl.replace(/\D/g, '').length >= 10 ||
      (draft.passportSeries.trim() && draft.passportNumber.trim()) ||
      (draft.lastName.trim() && draft.firstName.trim());
    if (!hasSignal) {
      setFormerMatches([]);
      return;
    }
    const seq = ++matchSeq.current;
    setMatchBusy(true);
    try {
      const p = new URLSearchParams();
      if (draft.pinfl.trim()) p.set('pinfl', draft.pinfl.trim());
      if (draft.passportSeries.trim()) p.set('passportSeries', draft.passportSeries.trim());
      if (draft.passportNumber.trim()) p.set('passportNumber', draft.passportNumber.trim());
      if (draft.lastName.trim()) p.set('lastName', draft.lastName.trim());
      if (draft.firstName.trim()) p.set('firstName', draft.firstName.trim());
      if (draft.middleName.trim()) p.set('middleName', draft.middleName.trim());
      if (draft.birthDate.trim()) p.set('birthDate', draft.birthDate.trim());
      const data = await apiFetch<{ matches: FormerMatch[] }>(
        `/api/employees/match-former?${p.toString()}`,
      );
      if (seq !== matchSeq.current) return;
      setFormerMatches(data.matches ?? []);
    } catch {
      if (seq !== matchSeq.current) return;
      setFormerMatches([]);
    } finally {
      if (seq === matchSeq.current) setMatchBusy(false);
    }
  }, []);

  useEffect(() => {
    if (panel !== 'create') return;
    const t = window.setTimeout(() => {
      void runMatchFormer(createDraft);
    }, 400);
    return () => window.clearTimeout(t);
  }, [panel, createDraft, runMatchFormer]);

  function applyPassportScan(scan: PassportScanResult) {
    setPassportScan(scan);
    const pinfl = String(scan.pinfl || '').replace(/\D/g, '').slice(0, 14);
    setCreateDraft((d) => ({
      ...d,
      lastName: scan.lastName || d.lastName,
      firstName: scan.firstName || d.firstName,
      middleName: scan.middleName || d.middleName,
      pinfl: pinfl || d.pinfl,
      passportSeries: scan.series || d.passportSeries,
      passportNumber: scan.docNumber || d.passportNumber,
      birthDate: scan.birthDate || d.birthDate,
    }));
  }

  async function onRehire(match: FormerMatch) {
    setRehireBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${match.employeeId}/rehire`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      resetCreateDraft();
      setPanel('none');
      router.push(`/employees/${match.employeeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось повторно принять');
    } finally {
      setRehireBusy(false);
    }
  }

  const subnavKey =
    tab === 'dismissed'
      ? 'employees-dismissed'
      : tab === 'gph'
        ? 'employees-gph'
        : 'employees';

  const exportQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (tab === 'active') p.set('status', 'active');
    if (tab === 'dismissed') p.set('status', 'dismissed');
    if (tab === 'gph') p.set('employmentType', 'gph');
    if (q.trim()) p.set('q', q.trim());
    if (divisionId) p.set('divisionId', divisionId);
    if (positionId) p.set('positionId', positionId);
    return p.toString();
  }, [tab, q, divisionId, positionId]);

  useEffect(() => {
    if (searchParams.get('panel') === 'telegram') {
      setPanel('telegram');
    }
  }, [searchParams]);

  const createParamHandled = useRef(false);

  function clearCreateParam() {
    if (searchParams.get('create') !== '1') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function closeCreatePanel() {
    setPanel('none');
    resetCreateDraft();
    clearCreateParam();
  }

  useEffect(() => {
    if (searchParams.get('create') !== '1') {
      createParamHandled.current = false;
      return;
    }
    if (createParamHandled.current) return;
    createParamHandled.current = true;
    setPanel('create');
  }, [searchParams]);

  const query = useMemo(() => {
    const p = new URLSearchParams(exportQuery);
    p.set('page', String(page));
    p.set('limit', String(pageSize));
    return `?${p.toString()}`;
  }, [exportQuery, page, pageSize]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : employeeListPrefs.defaultColumns;
  const colSpan = 2 + visibleCols.length;

  const displayed = useMemo(
    () => prefs.applySortToRows(rows, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods stable enough via state
    [rows, prefs.state.columns, prefs.state.sort],
  );

  async function load() {
    try {
      const data = await apiFetch<PageResult<Emp>>(`/api/employees${query}`);
      setRows(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setSelected({});
      setExpandedId(null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function loadUnattachedPersons() {
    try {
      const list = await apiFetch<PersonOpt[]>('/api/persons?unattached=1');
      setPersons(list);
    } catch {
      setPersons([]);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [tab, q, divisionId, positionId, pageSize]);

  useEffect(() => {
    load();
  }, [query]);

  useEffect(() => {
    Promise.all([
      apiFetch<Division[]>('/api/organization/divisions'),
      apiFetch<Position[]>('/api/organization/positions'),
    ]).then(([d, p]) => {
      setDivisions(d);
      setPositions(p);
    });
  }, []);

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
      if (!tableRef.current?.contains(ev.target as Node)) setExpandedId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function patchFlags(
    empId: string,
    patch: {
      excludeFromStats?: boolean;
      systemAccessClosed?: boolean;
      marksBlocked?: boolean;
    },
  ) {
    setFlagBusyId(empId);
    setError('');
    try {
      const updated = await apiFetch<{
        profileFlags?: Emp['profileFlags'];
      }>(`/api/employees/${empId}/flags`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === empId
            ? {
                ...r,
                profileFlags: updated.profileFlags ?? {
                  ...r.profileFlags,
                  ...patch,
                },
              }
            : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка флагов');
    } finally {
      setFlagBusyId(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  async function exportVisible(filename: string) {
    setExportBusy(true);
    try {
      downloadCsv(
        filename,
        displayed.map((r) => {
          const obj: Record<string, unknown> = {};
          for (const k of visibleCols) obj[prefs.labelOf(k)] = cellOf(r, k);
          return obj;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  async function exportCsv() {
    await exportVisible('employees.csv');
  }

  async function exportXlsx() {
    await exportVisible('employees.csv');
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const e of displayed) next[e.id] = true;
    setSelected(next);
  }

  async function bulkDismiss() {
    if (selectedIds.length === 0) return;
    if (
      !(await confirm(
        `${selectedIds.length} сотрудников перевести в статус «уволен»?`,
      ))
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      for (const id of selectedIds) {
        await apiFetch(`/api/employees/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'dismissed' }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Массовое увольнение не выполнено');
    } finally {
      setBulkBusy(false);
    }
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (formerMatches.length > 0) {
      setError(
        'Найден бывший сотрудник. Создать дубликат нельзя — нажмите «Повторно принять».',
      );
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    setError('');
    try {
      const scan = passportScan;
      await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          tabNumber: fd.get('tabNumber'),
          firstName: createDraft.firstName || fd.get('firstName'),
          lastName: createDraft.lastName || fd.get('lastName'),
          middleName: createDraft.middleName || fd.get('middleName') || undefined,
          email: fd.get('email') || undefined,
          divisionId: fd.get('divisionId') || undefined,
          positionId: fd.get('positionId') || undefined,
          employmentType: fd.get('employmentType') || 'staff',
          externalId: fd.get('externalId') || undefined,
          hiredAt: fd.get('hiredAt') || undefined,
          pinfl: createDraft.pinfl || scan?.pinfl || undefined,
          birthDate: createDraft.birthDate || scan?.birthDate || undefined,
          gender: scan?.gender || undefined,
          nationality: scan?.nationality || undefined,
          passportSeries: createDraft.passportSeries || scan?.series || undefined,
          passportNumber: createDraft.passportNumber || scan?.docNumber || undefined,
          passportDocType: scan?.docType || undefined,
          passportIssuer: scan?.issuer || undefined,
          passportIssuedAt: scan?.issuedAt || undefined,
          passportExpiresAt: scan?.expiresAt || undefined,
        }),
      });
      form.reset();
      closeCreatePanel();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setSaving(false);
    }
  }

  async function onAttach(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const personId = String(fd.get('personId') || '');
    const person = persons.find((p) => p.id === personId);
    if (!person) {
      setError('Выберите физическое лицо');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          personId: person.id,
          tabNumber: fd.get('tabNumber'),
          firstName: person.firstName,
          lastName: person.lastName,
          middleName: person.middleName || undefined,
          divisionId: fd.get('divisionId') || undefined,
          positionId: fd.get('positionId') || undefined,
          employmentType: fd.get('employmentType') || 'staff',
          hiredAt: fd.get('hiredAt') || undefined,
        }),
      });
      form.reset();
      setPanel('none');
      await load();
      await loadUnattachedPersons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прикрепить');
    } finally {
      setSaving(false);
    }
  }

  function openAttach() {
    setMenuOpen(false);
    setPanel('attach');
    void loadUnattachedPersons();
  }

  return (
    <div className={arena.wrap}>
      <PageSubnav groupKey={subnavKey} />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-users" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Сотрудники</h1>
          <p className={shared.pageSubtitle}>
            Управление кадровым составом организации
          </p>
        </div>
      </div>

      <div className={arena.toolbar}>
        <div className={arena.leftActions}>
          <div className={shared.splitBtn} ref={menuRef}>
            <button
              type="button"
              className={arena.createBtn}
              onClick={() => {
                resetCreateDraft();
                setPanel('create');
                setMenuOpen(false);
                setError('');
              }}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
            <button
              type="button"
              className={`${shared.btnSuccess} ${shared.splitBtnCaret}`}
              aria-label="Дополнительно"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ▾
            </button>
            {menuOpen ? (
              <div className={shared.splitMenu} role="menu">
                <button type="button" role="menuitem" onClick={openAttach}>
                  Прикрепить
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setPanel('import');
                  }}
                >
                  Импортировать
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setPanel('telegram');
                    setError('');
                  }}
                >
                  Telegram
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push('/settings/google-form');
                  }}
                >
                  Google Form
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={arena.rightTools}>
          <span className={arena.countBadge}>
            {rows.length} / {total}
          </span>
          <button
            type="button"
            className={
              filtersOpen || hasActiveFilters
                ? `${arena.iconBtn} ${arena.iconBtnActive}`
                : arena.iconBtn
            }
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button
            type="button"
            className={arena.toolBtn}
            disabled={exportBusy}
            onClick={() => void exportCsv()}
          >
            CSV
          </button>
          <button
            type="button"
            className={arena.toolBtn}
            disabled={exportBusy}
            onClick={() => void exportXlsx()}
          >
            Excel
          </button>
          <button
            type="button"
            className={arena.iconBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
          <TablePrefsMenuButton
            prefs={prefs}
            onExport={() => void exportVisible('employees.csv')}
          />
        </div>
      </div>

      {filtersOpen ? (
        <div className={arena.filterBand}>
          <FilterPanel
            inline
            fields={[
              { type: 'search', placeholder: 'Поиск…' },
              {
                type: 'divisionId',
                label: 'Подразделение',
                multiple: true,
                searchable: true,
                options: divisions.map((d) => ({ value: d.id, label: d.name })),
              },
              {
                type: 'positionId',
                label: 'Должность',
                multiple: true,
                searchable: true,
                options: positions.map((p) => ({ value: p.id, label: p.name })),
              },
            ]}
          />
        </div>
      ) : null}
      {panel === 'import' ? (
        <div className={shared.panel} style={{ marginBottom: '1rem' }}>
          <div className={shared.rowActions} style={{ marginBottom: '0.65rem' }}>
            <strong>Импорт сотрудников</strong>
            <button
              type="button"
              className={shared.btnGhost}
              onClick={() => setPanel('none')}
            >
              Закрыть
            </button>
          </div>
          <ImportPanel
            endpoint="/api/employees/import"
            hint="Обязательные: tabNumber, firstName, lastName. Опционально: middleName, email, divisionCode, positionCode, baseSalary, employmentType (staff|gph), hireDate. Дубликат tabNumber пропускается."
            templates={[
              {
                href: '/api/employees/import/template.csv',
                label: 'Шаблон CSV',
                filename: 'employees-import-template.csv',
              },
              {
                href: '/api/employees/import/template.xlsx',
                label: 'Шаблон Excel',
                filename: 'employees-import-template.xlsx',
              },
            ]}
            onDone={() => void load()}
          />
        </div>
      ) : null}

      {panel === 'telegram' ? (
        <div className={shared.panel} style={{ marginBottom: '1rem' }}>
          <div className={shared.rowActions} style={{ marginBottom: '0.65rem' }}>
            <strong>Telegram</strong>
            <div className={shared.rowActions}>
              <Link href="/settings/telegram" className={shared.btnSecondary}>
                Настройки бота
              </Link>
              <button
                type="button"
                className={shared.btnGhost}
                onClick={() => setPanel('none')}
              >
                Закрыть
              </button>
            </div>
          </div>
          <TelegramJoinPanel />
        </div>
      ) : null}

      {selectedIds.length > 0 && tab !== 'dismissed' ? (
        <div className={arena.bulkBar}>
          <span className={arena.bulkMeta}>
            Выбрано: <strong>{selectedIds.length}</strong>
          </span>
          <button
            type="button"
            className={`${arena.bulkBtn} ${arena.bulkDanger}`}
            disabled={bulkBusy}
            onClick={bulkDismiss}
          >
            {bulkBusy ? '…' : 'Массовое увольнение'}
          </button>
          <button
            type="button"
            className={arena.bulkGhost}
            onClick={() => setSelected({})}
          >
            Снять выбор
          </button>
        </div>
      ) : null}

      {error && panel === 'none' ? <p className={shared.error}>{error}</p> : null}

      <FormModal
        open={panel === 'create'}
        title="Создать сотрудника"
        onClose={() => {
          closeCreatePanel();
        }}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="emp-create-form"
              className={modal.btnPrimary}
              disabled={saving || formerMatches.length > 0 || rehireBusy}
              title={
                formerMatches.length > 0
                  ? 'Найден бывший сотрудник — используйте повторный приём'
                  : undefined
              }
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => {
                closeCreatePanel();
              }}
            >
              Отмена
            </button>
          </>
        }
      >
        {error && panel === 'create' ? (
          <p className={modal.error}>{error}</p>
        ) : null}
        {formerMatches.length > 0 ? (
          <div
            role="alert"
            style={{
              marginBottom: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: 10,
              border: '1px solid #f0c000',
              background: '#fff8db',
              color: '#7a5b00',
            }}
          >
            <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#f0c000',
                  color: '#3d2e00',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.05rem',
                  lineHeight: 1,
                }}
              >
                !
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  Возможен повторный приём
                </strong>
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.88rem' }}>
                  Найден уволенный сотрудник с совпадающими данными. Новый дубликат создать
                  нельзя — проверьте карточку и нажмите «Повторно принять».
                  {matchBusy ? ' Обновление…' : ''}
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {formerMatches.map((m) => (
                    <li
                      key={m.employeeId}
                      style={{
                        background: '#fff',
                        border: '1px solid #f0d878',
                        borderRadius: 8,
                        padding: '0.65rem 0.75rem',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{m.fullName}</div>
                      <div style={{ fontSize: '0.82rem', marginTop: 2, color: '#5c4a10' }}>
                        Таб. № {m.tabNumber}
                        {m.division ? ` · ${m.division}` : ''}
                        {m.position ? ` · ${m.position}` : ''}
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: 2, color: '#6b5a20' }}>
                        Приём: {m.hiredAt || '—'} · Увольнение: {m.dismissedAt || '—'}
                        {m.birthDate ? ` · ДР: ${m.birthDate}` : ''}
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: 2, color: '#6b5a20' }}>
                        Совпадение: {m.matchLabel}
                        {m.pinflMasked ? ` · ПИНФЛ ${m.pinflMasked}` : ''}
                        {m.passportMasked ? ` · паспорт ${m.passportMasked}` : ''}
                      </div>
                      <button
                        type="button"
                        className={modal.btnPrimary}
                        style={{ marginTop: 8 }}
                        disabled={rehireBusy}
                        onClick={() => void onRehire(m)}
                      >
                        {rehireBusy ? 'Приём…' : 'Повторно принять'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={modal.btnGhost}
            onClick={() => setScanOpen(true)}
          >
            Паспорт / ID дан скан қилиш
          </button>
          {passportScan ? (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#0f766e' }}>
              Скан қабул қилинди:{' '}
              {[passportScan.series, passportScan.docNumber].filter(Boolean).join(' ') ||
                passportScan.pinfl ||
                'FIO'}{' '}
              ({passportScan.docType === 'ID_CARD' ? 'ID-карта' : 'паспорт'})
              {passportScan.pinfl ? ` · ПИНФЛ ${passportScan.pinfl}` : ' · ПИНФЛ топилмади'}
              {passportScan.middleName
                ? ` · ${passportScan.middleName}`
                : ' · отчество MRZда йўқ (қўлда)'}
            </p>
          ) : null}
        </div>
        <form
          id="emp-create-form"
          ref={createFormRef}
          className={modal.fields}
          onSubmit={onCreate}
        >
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Таб. номер <em className={modal.req}>*</em>
              </span>
              <input name="tabNumber" required autoFocus />
            </label>
            <label className={modal.field}>
              <span>Email</span>
              <input name="email" type="email" />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Фамилия <em className={modal.req}>*</em>
              </span>
              <input
                name="lastName"
                required
                value={createDraft.lastName}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, lastName: e.target.value }))
                }
              />
            </label>
            <label className={modal.field}>
              <span>
                Имя <em className={modal.req}>*</em>
              </span>
              <input
                name="firstName"
                required
                value={createDraft.firstName}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, firstName: e.target.value }))
                }
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>Отчество</span>
            <input
              name="middleName"
              value={createDraft.middleName}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, middleName: e.target.value }))
              }
            />
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>ПИНФЛ</span>
              <input
                name="pinfl"
                inputMode="numeric"
                value={createDraft.pinfl}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, pinfl: e.target.value }))
                }
              />
            </label>
            <label className={modal.field}>
              <span>Дата рождения</span>
              <input
                name="birthDate"
                type="date"
                value={createDraft.birthDate}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, birthDate: e.target.value }))
                }
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Паспорт серия</span>
              <input
                name="passportSeries"
                value={createDraft.passportSeries}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, passportSeries: e.target.value }))
                }
              />
            </label>
            <label className={modal.field}>
              <span>Паспорт номер</span>
              <input
                name="passportNumber"
                value={createDraft.passportNumber}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, passportNumber: e.target.value }))
                }
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Подразделение</span>
              <select name="divisionId" defaultValue="">
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={modal.field}>
              <span>Должность</span>
              <select name="positionId" defaultValue="">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Тип</span>
              <select name="employmentType" defaultValue="staff">
                <option value="staff">Штат</option>
                <option value="gph">ГПХ</option>
              </select>
            </label>
            <label className={modal.field}>
              <span>Дата приёма</span>
              <input name="hiredAt" type="date" />
            </label>
          </div>
          <label className={modal.field}>
            <span>Внешний ID (терминал Face ID)</span>
            <input
              name="externalId"
              placeholder="необязательно — номер на терминале"
            />
            <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
              Паспортдан эмас. Face ID терминалдаги ходим рақами (бўш қолдириш мумкин).
            </span>
          </label>
        </form>
      </FormModal>

      <PassportScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onConfirm={(result) => {
          applyPassportScan(result);
          setScanOpen(false);
        }}
      />

      <FormModal
        open={panel === 'attach'}
        title="Прикрепить физическое лицо"
        onClose={() => setPanel('none')}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="emp-attach-form"
              className={modal.btnPrimary}
              disabled={saving || persons.length === 0}
            >
              {saving ? 'Сохранение…' : 'Прикрепить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setPanel('none')}
            >
              Отмена
            </button>
          </>
        }
      >
        {error && panel === 'attach' ? (
          <p className={modal.error}>{error}</p>
        ) : null}
        <p className={shared.hint} style={{ marginTop: 0 }}>
          Прикрепить существующее физическое лицо как сотрудника (таб. номер +
          орг. данные).
        </p>
        <form id="emp-attach-form" className={modal.fields} onSubmit={onAttach}>
          <label className={modal.field}>
            <span>
              Физическое лицо <em className={modal.req}>*</em>
            </span>
            <select name="personId" required defaultValue="">
              <option value="" disabled>
                — выберите —
              </option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName} {p.firstName}
                  {p.middleName ? ` ${p.middleName}` : ''} (
                  {genderLabel(p.gender)})
                </option>
              ))}
            </select>
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Таб. номер <em className={modal.req}>*</em>
              </span>
              <input name="tabNumber" required placeholder="0000000100" />
            </label>
            <label className={modal.field}>
              <span>Тип</span>
              <select name="employmentType" defaultValue="staff">
                <option value="staff">Штат</option>
                <option value="gph">ГПХ</option>
              </select>
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Подразделение</span>
              <select name="divisionId" defaultValue="">
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={modal.field}>
              <span>Должность</span>
              <select name="positionId" defaultValue="">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={modal.field}>
            <span>Дата приёма</span>
            <input name="hiredAt" type="date" />
          </label>
        </form>
        {persons.length === 0 ? (
          <p className={shared.muted}>
            Нет свободных физлиц.{' '}
            <Link className={shared.link} href="/catalog/persons">
              Создать в «Физические лица»
            </Link>
          </p>
        ) : null}
      </FormModal>

      <div className={shared.panelTable} ref={tableRef}>
        <table className={shared.dataTable}>
          <thead>
            <tr>
              <th className={shared.checkCol}>
                <input
                  type="checkbox"
                  checked={
                    displayed.length > 0 && selectedIds.length === displayed.length
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Выбрать все"
                />
              </th>
              {visibleCols.map((key) => (
                <th key={key}>{prefs.labelOf(key)}</th>
              ))}
              <th aria-label="Раскрыть" />
            </tr>
          </thead>
          <tbody>
            {displayed.map((e) => {
              const photo = mediaSrc(e.faceProfile?.photoUrl);
              const fio = empFio(e);
              const flags = e.profileFlags ?? {};
              const busy = flagBusyId === e.id;
              const expanded = expandedId === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    className={
                      expanded
                        ? `${shared.rowSelected} ${shared.rowActive}`
                        : undefined
                    }
                    onClick={() => toggleExpand(e.id)}
                    aria-expanded={expanded}
                  >
                    <td
                      className={shared.checkCol}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selected[e.id])}
                        onChange={(ev) =>
                          setSelected((s) => ({
                            ...s,
                            [e.id]: ev.target.checked,
                          }))
                        }
                        onClick={(ev) => ev.stopPropagation()}
                        aria-label={`Выбрать ${e.tabNumber}`}
                      />
                    </td>
                    {visibleCols.map((key) => {
                      if (key === 'tabNumber') {
                        return (
                          <td key={key} onClick={(ev) => ev.stopPropagation()}>
                            <Link
                              className={shared.link}
                              href={`/employees/${e.id}`}
                            >
                              {e.tabNumber}
                            </Link>
                          </td>
                        );
                      }
                      if (key === 'fullName') {
                        return (
                          <td key={key} onClick={(ev) => ev.stopPropagation()}>
                            <Link
                              className={shared.fioCell}
                              href={`/employees/${e.id}`}
                            >
                              {photo ? (
                                <PhotoThumb
                                  className={shared.avatar}
                                  src={photo}
                                  alt=""
                                  width={36}
                                  height={36}
                                  lightbox={photos}
                                  slides={displayed
                                    .map((x) => ({
                                      src:
                                        mediaSrc(x.faceProfile?.photoUrl) || '',
                                      caption: empFio(x),
                                    }))
                                    .filter((s) => s.src)}
                                  index={Math.max(
                                    0,
                                    displayed
                                      .map(
                                        (x) =>
                                          mediaSrc(x.faceProfile?.photoUrl) ||
                                          '',
                                      )
                                      .filter(Boolean)
                                      .findIndex((s) => s === photo),
                                  )}
                                />
                              ) : (
                                <span className={shared.avatarFallback}>
                                  {initials(e.lastName, e.firstName)}
                                </span>
                              )}
                              <span className={shared.fioUpper}>{fio}</span>
                              {(flags.excludeFromStats ||
                                flags.marksBlocked ||
                                flags.systemAccessClosed) && (
                                <span
                                  className={shared.flagDots}
                                  title="Ограничения"
                                >
                                  {flags.excludeFromStats ? (
                                    <span
                                      className={`${shared.flagDot} ${shared.flagDotMuted}`}
                                      title="Исключён из статистики"
                                    />
                                  ) : null}
                                  {flags.marksBlocked ? (
                                    <span
                                      className={`${shared.flagDot} ${shared.flagDotWarn}`}
                                      title="Отметки заблокированы"
                                    />
                                  ) : null}
                                  {flags.systemAccessClosed ? (
                                    <span
                                      className={`${shared.flagDot} ${shared.flagDotDanger}`}
                                      title="Доступ к системе закрыт"
                                    />
                                  ) : null}
                                </span>
                              )}
                            </Link>
                          </td>
                        );
                      }
                      return (
                        <td key={key}>{cellOf(e, key) || '—'}</td>
                      );
                    })}
                    <td className={shared.actionsCell}>
                      <button
                        type="button"
                        className={shared.rowExpandToggle}
                        aria-label={expanded ? 'Свернуть' : 'Действия'}
                        aria-expanded={expanded}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleExpand(e.id);
                        }}
                      >
                        <i className="fas fa-ellipsis-h" aria-hidden />
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={shared.rowExpand}>
                      <td colSpan={colSpan}>
                        <div
                          className={shared.rowExpandInner}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Link
                            className={shared.rowActionBtn}
                            href={`/employees/${e.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-eye ${shared.rowActionIcon}`} aria-hidden />
                            Просмотреть
                          </Link>
                          <button
                            type="button"
                            className={
                              !flags.excludeFromStats
                                ? `${shared.rowActionBtn} ${shared.rowActionBtnOn}`
                                : shared.rowActionBtn
                            }
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                excludeFromStats: !flags.excludeFromStats,
                              });
                            }}
                          >
                            <i
                              className={`fas fa-check-circle ${shared.rowActionIcon}`}
                              aria-hidden
                            />
                            Включить в статистику
                          </button>
                          <button
                            type="button"
                            className={
                              flags.marksBlocked
                                ? `${shared.rowActionBtn} ${shared.rowActionBtnOn}`
                                : shared.rowActionBtn
                            }
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                marksBlocked: !flags.marksBlocked,
                              });
                            }}
                          >
                            <i
                              className={`fas fa-ban ${shared.rowActionIcon}`}
                              aria-hidden
                            />
                            Блокировать отметки
                          </button>
                          <button
                            type="button"
                            className={
                              flags.systemAccessClosed
                                ? `${shared.rowActionBtn} ${shared.rowActionBtnOn}`
                                : shared.rowActionBtn
                            }
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                systemAccessClosed: !flags.systemAccessClosed,
                              });
                            }}
                          >
                            <i
                              className={`fas fa-key ${shared.rowActionIcon}`}
                              aria-hidden
                            />
                            Закрыть доступ
                          </button>
                          <Link
                            className={shared.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-file-alt ${shared.rowActionIcon}`} aria-hidden />
                            Отчет по посещениям
                          </Link>
                          <Link
                            className={shared.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance?view=settings`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-cog ${shared.rowActionIcon}`} aria-hidden />
                            Настройки отчета
                          </Link>
                          <Link
                            className={shared.rowActionBtn}
                            href={`/employees/${e.id}/reports/discipline`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i
                              className={`fas fa-file-medical ${shared.rowActionIcon}`}
                              aria-hidden
                            />
                            Отчет по дисциплине
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <div className={shared.empty}>
                    {hasActiveFilters
                      ? 'По выбранным фильтрам ничего не найдено — измените условия или нажмите «Сбросить».'
                      : 'Сотрудники не найдены — нажмите «Создать» или «Прикрепить».'}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className={shared.pager}>
          <button
            type="button"
            className={shared.pagerBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </button>
          <span className={shared.pagerMeta}>
            <select
              value={pageSize}
              aria-label="Размер страницы"
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>/ {total}</span>
            <span>
              · стр. {page}/{totalPages}
            </span>
          </span>
          <button
            type="button"
            className={shared.pagerBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      </div>
      {photos.node}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className={arena.wrap}>Загрузка…</div>}>
      <EmployeesPageInner />
    </Suspense>
  );
}
