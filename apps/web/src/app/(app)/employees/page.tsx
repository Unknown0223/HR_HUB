'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ImportPanel } from '@/components/ImportPanel';
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
import {
  PassportScanModal,
  type PassportScanResult,
} from '@/components/PassportScanModal';
import { TelegramJoinPanel } from '@/components/employees/TelegramJoinPanel';
import modal from '@/components/form-modal.module.css';
import { useUrlParam } from '@/lib/use-url-state';
import styles from '../../page-shared.module.css';

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
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(q || divisionId || positionId),
  );
  const hasActiveFilters = Boolean(q.trim() || divisionId || positionId);
  const [exportBusy, setExportBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flagBusyId, setFlagBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [passportScan, setPassportScan] = useState<PassportScanResult | null>(null);
  const photos = usePhotoLightbox();
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

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
      setError(e instanceof Error ? e.message : 'Error');
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
      setError(err instanceof Error ? err.message : 'Bulk dismiss failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    try {
      const scan = passportScan;
      await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          tabNumber: fd.get('tabNumber'),
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          middleName: fd.get('middleName') || undefined,
          email: fd.get('email') || undefined,
          divisionId: fd.get('divisionId') || undefined,
          positionId: fd.get('positionId') || undefined,
          employmentType: fd.get('employmentType') || 'staff',
          externalId: fd.get('externalId') || undefined,
          hiredAt: fd.get('hiredAt') || undefined,
          pinfl: scan?.pinfl || undefined,
          birthDate: scan?.birthDate || undefined,
          gender: scan?.gender || undefined,
          nationality: scan?.nationality || undefined,
          passportSeries: scan?.series || undefined,
          passportNumber: scan?.docNumber || undefined,
          passportDocType: scan?.docType || undefined,
          passportIssuer: scan?.issuer || undefined,
          passportIssuedAt: scan?.issuedAt || undefined,
          passportExpiresAt: scan?.expiresAt || undefined,
        }),
      });
      form.reset();
      setPassportScan(null);
      setPanel('none');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
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
      setError(err instanceof Error ? err.message : 'Attach failed');
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
    <div className={styles.wrap}>
      <PageSubnav groupKey={subnavKey} />
      <TablePrefsModals prefs={prefs} />

      <div className={styles.pageHeader}>
        <div className={`${styles.pageIconBadge} ${styles.pageIconBadgeHr}`}>
          <i className="fas fa-users" aria-hidden />
        </div>
        <div className={styles.pageHeaderText}>
          <h1 className={styles.pageTitle}>Сотрудники</h1>
          <p className={styles.pageSubtitle}>Управление кадровым составом организации</p>
        </div>
        <div className={styles.pageHeaderActions}>
          <div className={styles.splitBtn} ref={menuRef}>
            <button
              type="button"
              className={`${styles.btnSuccess} ${styles.splitBtnMain}`}
              onClick={() => {
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
              className={`${styles.btnSuccess} ${styles.splitBtnCaret}`}
              aria-label="Дополнительно"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ▾
            </button>
            {menuOpen ? (
              <div className={styles.splitMenu} role="menu">
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
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={exportBusy}
            onClick={() => void exportCsv()}
          >
            CSV
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={exportBusy}
            onClick={() => void exportXlsx()}
          >
            Excel
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
            aria-pressed={filtersOpen}
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
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

      <FilterPanel
        open={filtersOpen}
        onToggle={() => setFiltersOpen((v) => !v)}
        fields={[
          { type: 'search' },
          {
            type: 'divisionId',
            options: divisions.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            type: 'positionId',
            options: positions.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
      />

      {panel === 'import' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <div className={styles.rowActions} style={{ marginBottom: '0.65rem' }}>
            <strong>Импорт сотрудников</strong>
            <button
              type="button"
              className={styles.btnGhost}
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
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <div className={styles.rowActions} style={{ marginBottom: '0.65rem' }}>
            <strong>Telegram</strong>
            <div className={styles.rowActions}>
              <Link href="/settings/telegram" className={styles.btnSecondary}>
                Настройки бота
              </Link>
              <button
                type="button"
                className={styles.btnGhost}
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
        <div className={styles.rowActions} style={{ marginBottom: '0.85rem' }}>
          <span className={styles.muted}>{selectedIds.length} выбрано</span>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={bulkBusy}
            onClick={bulkDismiss}
          >
            {bulkBusy ? '…' : 'Массовое увольнение'}
          </button>
        </div>
      ) : null}

      {error && panel === 'none' ? <p className={styles.error}>{error}</p> : null}

      <FormModal
        open={panel === 'create'}
        title="Создать сотрудника"
        onClose={() => {
          setPanel('none');
          setPassportScan(null);
        }}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="emp-create-form"
              className={modal.btnPrimary}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => {
                setPanel('none');
                setPassportScan(null);
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
                defaultValue={passportScan?.lastName || ''}
                key={`ln-${passportScan?.docNumber || 'x'}-${passportScan?.lastName || ''}`}
              />
            </label>
            <label className={modal.field}>
              <span>
                Имя <em className={modal.req}>*</em>
              </span>
              <input
                name="firstName"
                required
                defaultValue={passportScan?.firstName || ''}
                key={`fn-${passportScan?.docNumber || 'x'}-${passportScan?.firstName || ''}`}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>Отчество</span>
            <input
              name="middleName"
              defaultValue={passportScan?.middleName || ''}
              key={`mn-${passportScan?.docNumber || 'x'}-${passportScan?.middleName || ''}`}
            />
          </label>
          {passportScan ? (
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>Паспорт серия / рақам</span>
                <input
                  readOnly
                  value={[passportScan.series, passportScan.docNumber].filter(Boolean).join(' ')}
                />
              </label>
              <label className={modal.field}>
                <span>ПИНФЛ</span>
                <input readOnly value={passportScan.pinfl || '—'} />
              </label>
            </div>
          ) : null}
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
            <span>Face / external ID</span>
            <input name="externalId" placeholder="face-0003" />
          </label>
        </form>
      </FormModal>

      <PassportScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onConfirm={(result) => {
          setPassportScan(result);
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
        <p className={styles.hint} style={{ marginTop: 0 }}>
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
          <p className={styles.muted}>
            Нет свободных физлиц.{' '}
            <Link className={styles.link} href="/catalog/persons">
              Создать в «Физические лица»
            </Link>
          </p>
        ) : null}
      </FormModal>

      <div className={styles.panelTable} ref={tableRef}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
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
                        ? `${styles.rowSelected} ${styles.rowActive}`
                        : undefined
                    }
                    onClick={() => toggleExpand(e.id)}
                    aria-expanded={expanded}
                  >
                    <td
                      className={styles.checkCol}
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
                              className={styles.link}
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
                              className={styles.fioCell}
                              href={`/employees/${e.id}`}
                            >
                              {photo ? (
                                <PhotoThumb
                                  className={styles.avatar}
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
                                <span className={styles.avatarFallback}>
                                  {initials(e.lastName, e.firstName)}
                                </span>
                              )}
                              <span className={styles.fioUpper}>{fio}</span>
                              {(flags.excludeFromStats ||
                                flags.marksBlocked ||
                                flags.systemAccessClosed) && (
                                <span
                                  className={styles.flagDots}
                                  title="Ограничения"
                                >
                                  {flags.excludeFromStats ? (
                                    <span
                                      className={`${styles.flagDot} ${styles.flagDotMuted}`}
                                      title="Исключён из статистики"
                                    />
                                  ) : null}
                                  {flags.marksBlocked ? (
                                    <span
                                      className={`${styles.flagDot} ${styles.flagDotWarn}`}
                                      title="Отметки заблокированы"
                                    />
                                  ) : null}
                                  {flags.systemAccessClosed ? (
                                    <span
                                      className={`${styles.flagDot} ${styles.flagDotDanger}`}
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
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.rowExpandToggle}
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
                    <tr className={styles.rowExpand}>
                      <td colSpan={colSpan}>
                        <div
                          className={styles.rowExpandInner}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-eye ${styles.rowActionIcon}`} aria-hidden />
                            Просмотреть
                          </Link>
                          <button
                            type="button"
                            className={
                              !flags.excludeFromStats
                                ? `${styles.rowActionBtn} ${styles.rowActionBtnOn}`
                                : styles.rowActionBtn
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
                              className={`fas fa-check-circle ${styles.rowActionIcon}`}
                              aria-hidden
                            />
                            Включить в статистику
                          </button>
                          <button
                            type="button"
                            className={
                              flags.marksBlocked
                                ? `${styles.rowActionBtn} ${styles.rowActionBtnOn}`
                                : styles.rowActionBtn
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
                              className={`fas fa-ban ${styles.rowActionIcon}`}
                              aria-hidden
                            />
                            Блокировать отметки
                          </button>
                          <button
                            type="button"
                            className={
                              flags.systemAccessClosed
                                ? `${styles.rowActionBtn} ${styles.rowActionBtnOn}`
                                : styles.rowActionBtn
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
                              className={`fas fa-key ${styles.rowActionIcon}`}
                              aria-hidden
                            />
                            Закрыть доступ
                          </button>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-file-alt ${styles.rowActionIcon}`} aria-hidden />
                            Отчет по посещениям
                          </Link>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance?view=settings`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i className={`fas fa-cog ${styles.rowActionIcon}`} aria-hidden />
                            Настройки отчета
                          </Link>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/discipline`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <i
                              className={`fas fa-file-medical ${styles.rowActionIcon}`}
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
                  <div className={styles.empty}>
                    {hasActiveFilters
                      ? 'По выбранным фильтрам ничего не найдено — измените условия или нажмите «Сбросить».'
                      : 'Сотрудники не найдены — нажмите «Создать» или «Прикрепить».'}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </button>
          <span className={styles.pagerMeta}>
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
            className={styles.pagerBtn}
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
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <EmployeesPageInner />
    </Suspense>
  );
}
