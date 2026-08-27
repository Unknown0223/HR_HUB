'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiDownload, apiFetch, PageResult } from '@/lib/api';
import { downloadXlsxViaApi } from '@/lib/excel';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { useUrlParam } from '@/lib/use-url-state';
import styles from '../../page-shared.module.css';

type Emp = {
  id: string;
  tabNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string | null;
  status: string;
  employmentType: string;
  externalId?: string | null;
  division?: { name: string } | null;
  position?: { name: string } | null;
  region?: { name: string } | null;
  person?: { gender?: string | null } | null;
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

function EmployeesPageInner() {
  const [tab] = useUrlParam('tab', 'active', TABS);
  const filters = useFilterFromUrl(FILTER_KEYS);
  const q = filters.q;
  const divisionId = filters.divisionId;
  const positionId = filters.positionId;
  const [rows, setRows] = useState<Emp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalPages, setTotalPages] = useState(1);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [persons, setPersons] = useState<PersonOpt[]>([]);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'none' | 'create' | 'attach' | 'import'>('none');
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
  const photos = usePhotoLightbox();
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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

  async function exportCsv() {
    setExportBusy(true);
    try {
      const qs = exportQuery ? `?${exportQuery}` : '';
      await apiDownload(`/api/employees/export.csv${qs}`, 'employees.csv');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  async function exportXlsx() {
    setExportBusy(true);
    try {
      const qs = exportQuery ? `?${exportQuery}` : '';
      await downloadXlsxViaApi(`/api/employees/export.xlsx${qs}`, 'employees.xlsx');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const e of rows) next[e.id] = true;
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
      await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          tabNumber: fd.get('tabNumber'),
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          email: fd.get('email') || undefined,
          divisionId: fd.get('divisionId') || undefined,
          positionId: fd.get('positionId') || undefined,
          employmentType: fd.get('employmentType') || 'staff',
          externalId: fd.get('externalId') || undefined,
          hiredAt: fd.get('hiredAt') || undefined,
        }),
      });
      form.reset();
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

      <header className={styles.header}>
        <div className={styles.rowActions}>
          <div className={styles.splitBtn} ref={menuRef}>
            <button
              type="button"
              className={`${styles.btnSuccess} ${styles.splitBtnMain}`}
              onClick={() => {
                setPanel((p) => (p === 'create' ? 'none' : 'create'));
                setMenuOpen(false);
              }}
            >
              {panel === 'create' ? 'Закрыть' : 'Создать'}
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
        </div>
      </header>

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

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel === 'create' ? (
        <div className={styles.formPanel}>
          <form className={styles.form} onSubmit={onCreate}>
            <label>
              Таб. номер <span className={styles.req}>*</span>
              <input name="tabNumber" required />
            </label>
            <label>
              Фамилия <span className={styles.req}>*</span>
              <input name="lastName" required />
            </label>
            <label>
              Имя <span className={styles.req}>*</span>
              <input name="firstName" required />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <label>
              Подразделение
              <select name="divisionId">
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Должность
              <select name="positionId">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="employmentType" defaultValue="staff">
                <option value="staff">Штат</option>
                <option value="gph">ГПХ</option>
              </select>
            </label>
            <label>
              Face / external ID
              <input name="externalId" placeholder="face-0003" />
            </label>
            <label>
              Дата приёма
              <input name="hiredAt" type="date" />
            </label>
            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setPanel('none')}
              >
                Отмена
              </button>
              <button className={styles.btn} type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {panel === 'attach' ? (
        <div className={styles.formPanel}>
          <p className={styles.hint}>
            Прикрепить существующее физическое лицо как сотрудника (таб. номер +
            орг. данные).
          </p>
          <form className={styles.form} onSubmit={onAttach}>
            <label>
              Физическое лицо <span className={styles.req}>*</span>
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
            <label>
              Таб. номер <span className={styles.req}>*</span>
              <input name="tabNumber" required placeholder="0000000100" />
            </label>
            <label>
              Подразделение
              <select name="divisionId">
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Должность
              <select name="positionId">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="employmentType" defaultValue="staff">
                <option value="staff">Штат</option>
                <option value="gph">ГПХ</option>
              </select>
            </label>
            <label>
              Дата приёма
              <input name="hiredAt" type="date" />
            </label>
            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setPanel('none')}
              >
                Отмена
              </button>
              <button
                className={styles.btn}
                type="submit"
                disabled={saving || persons.length === 0}
              >
                {saving ? 'Сохранение…' : 'Прикрепить'}
              </button>
            </div>
          </form>
          {persons.length === 0 ? (
            <p className={styles.muted}>
              Нет свободных физлиц.{' '}
              <Link className={styles.link} href="/catalog/persons">
                Создать в «Физические лица»
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.panelTable} ref={tableRef}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedIds.length === rows.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Таб. №</th>
              <th>ФИО</th>
              <th>Регион</th>
              <th>Подразделение</th>
              <th>Должность</th>
              <th>Пол</th>
              <th aria-label="Раскрыть" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const photo = mediaSrc(e.faceProfile?.photoUrl);
              const fio = `${e.lastName} ${e.firstName}${e.middleName ? ` ${e.middleName}` : ''}`;
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
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <Link className={styles.link} href={`/employees/${e.id}`}>
                        {e.tabNumber}
                      </Link>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <Link className={styles.fioCell} href={`/employees/${e.id}`}>
                        {photo ? (
                          <PhotoThumb
                            className={styles.avatar}
                            src={photo}
                            alt=""
                            width={36}
                            height={36}
                            lightbox={photos}
                            slides={rows
                              .map((x) => ({
                                src: mediaSrc(x.faceProfile?.photoUrl) || '',
                                caption: `${x.lastName} ${x.firstName}`,
                              }))
                              .filter((s) => s.src)}
                            index={Math.max(
                              0,
                              rows
                                .map((x) => mediaSrc(x.faceProfile?.photoUrl) || '')
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
                          <span className={styles.flagDots} title="Ограничения">
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
                    <td>{e.region?.name ?? '—'}</td>
                    <td>{e.division?.name ?? '—'}</td>
                    <td>{e.position?.name ?? '—'}</td>
                    <td>{genderLabel(e.person?.gender)}</td>
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
                        {expanded ? '▴' : '▾'}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={styles.rowExpand}>
                      <td colSpan={8}>
                        <div
                          className={styles.rowExpandInner}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Просмотреть
                          </Link>
                          <button
                            type="button"
                            className={styles.rowActionBtn}
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                excludeFromStats: !flags.excludeFromStats,
                              });
                            }}
                          >
                            <span className={styles.rowActionCheck}>
                              {!flags.excludeFromStats ? '✓' : ''}
                            </span>
                            Включить в статистику
                          </button>
                          <button
                            type="button"
                            className={styles.rowActionBtn}
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                marksBlocked: !flags.marksBlocked,
                              });
                            }}
                          >
                            <span className={styles.rowActionCheck}>
                              {flags.marksBlocked ? '✓' : ''}
                            </span>
                            Блокировать отметки
                          </button>
                          <button
                            type="button"
                            className={styles.rowActionBtn}
                            disabled={busy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void patchFlags(e.id, {
                                systemAccessClosed: !flags.systemAccessClosed,
                              });
                            }}
                          >
                            <span className={styles.rowActionCheck}>
                              {flags.systemAccessClosed ? '✓' : ''}
                            </span>
                            Закрыть доступ
                          </button>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Отчет по посещениям
                          </Link>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/attendance?view=settings`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Настройки отчёта
                          </Link>
                          <Link
                            className={styles.rowActionBtn}
                            href={`/employees/${e.id}/reports/discipline`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Отчет по дисциплине
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
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
