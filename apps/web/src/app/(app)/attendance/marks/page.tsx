'use client';
import { confirm as confirmDialog } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ModalPortal } from '@/components/ModalPortal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, type PageResult } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from './page.module.css';

const FILTER_KEYS = [
  'q',
  'divisionId',
  'locationId',
  'employeeId',
  'markTypes',
  'dateFrom',
  'dateTo',
] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
  faceProfile?: { photoUrl?: string | null } | null;
};

type Mark = {
  id: string;
  occurredAt: string;
  markType: string;
  markTypeLabel: string;
  deviceType?: string | null;
  identificationType?: string | null;
  locationName?: string | null;
  isValid?: boolean;
  clockTamper?: boolean;
  note?: string | null;
  photoUrl?: string | null;
  employee?: Emp | null;
  device?: { id: string; name: string; location?: { name: string } | null } | null;
};

type Named = { id: string; name: string };

const MARK_TYPE_OPTS = [
  { key: 'in', label: 'Приход' },
  { key: 'out', label: 'Уход' },
  { key: 'estimated_out', label: 'Такминий уход' },
  { key: 'mark', label: 'Отметка' },
  { key: 'break_in', label: 'Перерыв приход' },
  { key: 'break_out', label: 'Перерыв уход' },
];

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function typeClass(t: string) {
  if (t === 'in') return styles.dotIn;
  if (t === 'out') return styles.dotOut;
  if (t === 'estimated_out') return styles.dotEst;
  if (t === 'break_in' || t === 'break_out') return styles.dotBreak;
  return styles.dotMark;
}

function markDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MarksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Mark[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState(filters.q || '');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(filters.employeeId || filters.dateFrom || filters.dateTo),
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    action: string;
    markType?: string;
  } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyFrom, setApplyFrom] = useState('');
  const [applyTo, setApplyTo] = useState('');
  const [divisions, setDivisions] = useState<Named[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [employees, setEmployees] = useState<Named[]>([]);
  const photos = usePhotoLightbox();

  const scopeLabel = useMemo(() => {
    const employeeId = (searchParams?.get('employeeId') || filters.employeeId || '').trim();
    const dateFrom = (searchParams?.get('dateFrom') || filters.dateFrom || '').trim();
    const dateTo = (searchParams?.get('dateTo') || filters.dateTo || '').trim();
    if (!employeeId && !dateFrom && !dateTo) return '';
    const emp = employees.find((e) => e.id === employeeId)?.name || '';
    const fmt = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return d && m && y ? `${d}.${m}.${y}` : iso;
    };
    const date =
      dateFrom && dateTo && dateFrom !== dateTo
        ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
        : fmt(dateFrom || dateTo);
    return [emp, date].filter(Boolean).join(' · ');
  }, [employees, filters.dateFrom, filters.dateTo, filters.employeeId, searchParams]);

  const selectedIds = useMemo(() => [...checked], [checked]);
  const selectedValid = selectedIds.filter((id) => {
    const r = rows.find((x) => x.id === id);
    return r && r.isValid !== false;
  }).length;
  const selectedInvalid = selectedIds.length - selectedValid;
  const allSelected = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const focus = rows.find((r) => r.id === focusId) || null;

  function urlFilter(key: string) {
    return (searchParams?.get(key) || filters[key] || '').trim();
  }

  async function load(p = page) {
    setLoading(true);
    setError('');
    try {
      const employeeId = urlFilter('employeeId');
      const dateFrom = urlFilter('dateFrom') || urlFilter('from');
      const dateTo = urlFilter('dateTo') || urlFilter('to');
      const qs = new URLSearchParams();
      qs.set('page', String(p));
      qs.set('limit', '50');
      const q = (urlFilter('q') || search).trim();
      if (q) qs.set('q', q);
      if (urlFilter('divisionId')) qs.set('divisionId', urlFilter('divisionId'));
      if (urlFilter('locationId')) qs.set('locationId', urlFilter('locationId'));
      if (employeeId) qs.set('employeeId', employeeId);
      if (urlFilter('markTypes')) qs.set('markTypes', urlFilter('markTypes'));
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      const data = await apiFetch<PageResult<Mark> | Mark[]>(
        `/api/attendance/marks?${qs.toString()}`,
      );
      const raw = Array.isArray(data) ? data : data.items || [];
      const scoped = raw.filter((m) => {
        if (employeeId && m.employee?.id !== employeeId) return false;
        const day = markDay(m.occurredAt);
        if (dateFrom && day && day < dateFrom) return false;
        if (dateTo && day && day > dateTo) return false;
        return true;
      });
      setRows(scoped);
      setTotal(Array.isArray(data) ? scoped.length : employeeId || dateFrom || dateTo ? scoped.length : data.total || scoped.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q,
    filters.divisionId,
    filters.locationId,
    filters.employeeId,
    filters.markTypes,
    filters.dateFrom,
    filters.dateTo,
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const [divs, locs, emps] = await Promise.all([
          apiFetch<Named[] | PageResult<Named>>('/api/organization/divisions').catch(
            () => [],
          ),
          apiFetch<Named[]>('/api/attendance/locations').catch(() => []),
          apiFetch<
            | { id: string; firstName: string; lastName: string }[]
            | PageResult<{ id: string; firstName: string; lastName: string }>
          >('/api/employees?status=active&limit=300').catch(() => []),
        ]);
        const dItems = Array.isArray(divs) ? divs : divs.items || [];
        setDivisions(dItems.map((d) => ({ id: d.id, name: d.name })));
        setLocations(
          (Array.isArray(locs) ? locs : []).map((l) => ({ id: l.id, name: l.name })),
        );
        const eItems = Array.isArray(emps) ? emps : emps.items || [];
        const mapped = eItems.map((e) => ({
          id: e.id,
          name: `${e.lastName} ${e.firstName}`,
        }));
        const focusedId = (searchParams?.get('employeeId') || '').trim();
        if (focusedId && !mapped.some((e) => e.id === focusedId)) {
          const one = await apiFetch<{
            id: string;
            firstName: string;
            lastName: string;
            middleName?: string | null;
          }>(`/api/employees/${focusedId}`).catch(() => null);
          if (one) {
            mapped.unshift({
              id: one.id,
              name: [one.lastName, one.firstName, one.middleName].filter(Boolean).join(' '),
            });
          }
        }
        setEmployees(mapped);
      } catch {
        /* ignore */
      }
    })();
  }, [searchParams]);

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusId(id);
  }

  function toggleAll() {
    if (allSelected) {
      setChecked(new Set());
      return;
    }
    setChecked(new Set(rows.map((r) => r.id)));
  }

  async function runBulk(action: string, markType?: string) {
    if (!selectedIds.length) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ affected: number }>('/api/attendance/marks/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, action, markType }),
      });
      setInfo(`Готово: ${res.affected}`);
      setChecked(new Set());
      setConfirm(null);
      setTypeOpen(false);
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runOne(id: string, action: string, markType?: string) {
    setBusy(true);
    try {
      if (action === 'delete') {
        await apiFetch(`/api/attendance/marks/${id}`, { method: 'DELETE' });
      } else if (action === 'set_valid' || action === 'set_invalid') {
        await apiFetch(`/api/attendance/marks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isValid: action === 'set_valid' }),
        });
      } else if (action === 'set_type' && markType) {
        await apiFetch(`/api/attendance/marks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ markType }),
        });
      }
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.btnMenu}
              onClick={() => setCreateOpen((v) => !v)}
            >
              Создать ▾
            </button>
            {createOpen ? (
              <div className={styles.menu}>
                <Link href="/attendance/marks/copy" onClick={() => setCreateOpen(false)}>
                  Копирование отметок
                </Link>
                <Link href="/attendance/marks/import" onClick={() => setCreateOpen(false)}>
                  Импорт
                </Link>
              </div>
            ) : null}
          </div>

          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.btnBlue}
              disabled={!selectedIds.length || busy}
              onClick={() => setTypeOpen((v) => !v)}
            >
              Изменить тип отметки
            </button>
            {typeOpen && selectedIds.length ? (
              <div className={styles.menu}>
                {MARK_TYPE_OPTS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() =>
                      setConfirm({
                        title: `Изменить тип на «${t.label}» для ${selectedIds.length}?`,
                        action: 'set_type',
                        markType: t.key,
                      })
                    }
                  >
                    {t.label} {selectedIds.length}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedInvalid > 0 ? (
            <button
              type="button"
              className={styles.btnBlue}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Сделать действительными отметки в количестве ${selectedInvalid}?`,
                  action: 'set_valid',
                })
              }
            >
              Сделать действ. {selectedInvalid}
            </button>
          ) : null}

          {selectedValid > 0 ? (
            <button
              type="button"
              className={styles.btnDanger}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Сделать недействительными отметки в количестве ${selectedValid}?`,
                  action: 'set_invalid',
                })
              }
            >
              Сделать недейств. {selectedValid}
            </button>
          ) : null}

          {selectedIds.length > 0 ? (
            <button
              type="button"
              className={styles.btnPink}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Удалить отметки в количестве ${selectedIds.length}?`,
                  action: 'delete',
                })
              }
            >
              Удалить {selectedIds.length}
            </button>
          ) : null}

          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              setApplyFrom(start.toISOString().slice(0, 10));
              setApplyTo(now.toISOString().slice(0, 10));
              setApplyOpen(true);
            }}
          >
            Применение настроек для отметок
          </button>
        </div>

        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                void load(1);
              }
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateFrom', key: 'dateFrom', label: 'Дата с' },
              { type: 'dateTo', key: 'dateTo', label: 'Дата по' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.name })),
              },
              {
                type: 'select',
                key: 'locationId',
                label: 'Локация',
                options: locations.map((l) => ({ value: l.id, label: l.name })),
              },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Физическое лицо',
                options: employees.map((e) => ({ value: e.id, label: e.name })),
              },
              {
                type: 'select',
                key: 'markTypes',
                label: 'Тип отметки',
                options: MARK_TYPE_OPTS.map((t) => ({ value: t.key, label: t.label })),
              },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
            ]}
          />
          <span className={styles.pagerMeta}>
            {rows.length} / {total}
          </span>
          <div className={styles.pager}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                void load(p);
              }}
            >
              ‹
            </button>
            <button type="button" className={styles.pageBtnActive}>
              {page}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                void load(p);
              }}
            >
              ›
            </button>
          </div>
          <button type="button" className={styles.btnGhost} onClick={() => void load(page)}>
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}
      {scopeLabel ? <p className={styles.scope}>{scopeLabel}</p> : null}

      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Фото</th>
              <th>Физическое лицо</th>
              <th>Локация</th>
              <th>Тип устройства</th>
              <th>Тип отметки</th>
              <th>Тип идентификации</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const photo = mediaSrc(m.photoUrl);
                const slides = rows
                  .map((x) => ({
                    src: mediaSrc(x.photoUrl) || '',
                    caption: `${empName(x.employee)} · ${x.markTypeLabel || x.markType} · ${fmtDt(x.occurredAt)}`,
                  }))
                  .filter((s) => s.src);
                const idx = photo ? slides.findIndex((s) => s.src === photo) : -1;
                return (
                  <Fragment key={m.id}>
                    <tr
                      className={
                        checked.has(m.id) || focusId === m.id ? styles.selected : undefined
                      }
                      onClick={() => setFocusId((id) => (id === m.id ? null : m.id))}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={checked.has(m.id)}
                          onChange={() => toggleOne(m.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        {photo ? (
                          <PhotoThumb
                            src={photo}
                            alt=""
                            className={styles.photo}
                            lightbox={photos}
                            slides={slides}
                            index={idx < 0 ? 0 : idx}
                          />
                        ) : (
                          <span className={styles.photoEmpty} />
                        )}
                      </td>
                      <td className={m.isValid === false ? styles.invalid : undefined}>
                        {empName(m.employee)}
                      </td>
                      <td>{m.locationName || m.device?.location?.name || '—'}</td>
                      <td>{m.deviceType || '—'}</td>
                      <td>
                        <span className={typeClass(m.markType)}>
                          {m.markTypeLabel || m.markType}
                        </span>
                      </td>
                      <td>{m.identificationType || '—'}</td>
                      <td
                        title={m.clockTamper ? m.note || 'Время терминала скорректировано' : undefined}
                      >
                        {fmtDt(m.occurredAt)}
                        {m.clockTamper ? ' ⚠' : ''}
                      </td>
                    </tr>
                    {focus?.id === m.id ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div className={styles.rowActions}>
                            <Link href={`/attendance/marks/${m.id}`}>Просмотреть</Link>
                            <button
                              type="button"
                              onClick={() =>
                                void runOne(
                                  m.id,
                                  m.isValid === false ? 'set_valid' : 'set_invalid',
                                )
                              }
                            >
                              {m.isValid === false
                                ? 'Сделать действ.'
                                : 'Сделать недейств.'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setChecked(new Set([m.id]));
                                setTypeOpen(true);
                              }}
                            >
                              Изменить тип на…
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirmDialog('Удалить отметку?'))
                                  void runOne(m.id, 'delete');
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirm ? (
        <ModalPortal>
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalBody}>
                <h3>{confirm.title}</h3>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnBlue}
                  disabled={busy}
                  onClick={() => void runBulk(confirm.action, confirm.markType)}
                >
                  Да
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setConfirm(null)}
                >
                  Нет
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {applyOpen ? (
        <ModalPortal>
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalBody}>
                <h3>Применение настроек для отметок</h3>
                <label>
                  Дата начала
                  <input
                    type="date"
                    value={applyFrom}
                    onChange={(e) => setApplyFrom(e.target.value)}
                  />
                </label>
                <label>
                  Дата окончания
                  <input
                    type="date"
                    value={applyTo}
                    onChange={(e) => setApplyTo(e.target.value)}
                  />
                </label>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnBlue}
                  onClick={() => {
                    setApplyOpen(false);
                    router.push('/catalog/devices');
                  }}
                >
                  Применить
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setApplyOpen(false)}
                >
                  Отменить
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
      {photos.node}
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <MarksInner />
    </Suspense>
  );
}
