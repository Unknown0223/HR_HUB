'use client';

import { confirm } from '@/lib/dialogs';
import {
  ChangeEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, PageResult } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { downloadCsv } from '@/lib/csv';
import listStyles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import styles from './page.module.css';

type Region = { id: string; code: string; name: string };

type PersonRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  pinfl?: string | null;
  phone?: string | null;
  email?: string | null;
  code?: string | null;
  inn?: string | null;
  inps?: string | null;
  nationality?: string | null;
  regionId?: string | null;
  region?: Region | null;
  addressResidence?: string | null;
  addressRegistration?: string | null;
  photoUrl?: string | null;
  useForFaceRecognition?: boolean;
  isKeyPerson?: boolean;
  accessAllEmployees?: boolean;
  isBlacklisted?: boolean;
  isActive?: boolean;
  isPinned?: boolean;
};

type Mode = 'list' | 'create' | 'edit' | 'attach';

const FILTER_KEYS = [
  'q',
  'fio',
  'gender',
  'birthFrom',
  'birthTo',
  'regionId',
  'phone',
  'blacklisted',
  'isActive',
] as const;

function fio(p: PersonRow) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
}

function initials(p: PersonRow) {
  return `${(p.lastName || '?')[0] ?? ''}${(p.firstName || '?')[0] ?? ''}`.toUpperCase();
}

function emptyForm() {
  return {
    lastName: '',
    firstName: '',
    middleName: '',
    isKeyPerson: false,
    accessAllEmployees: false,
    birthDate: '',
    nationality: '',
    gender: 'M',
    inn: '',
    inps: '',
    pinfl: '',
    photoUrl: '',
    useForFaceRecognition: true,
    phone: '',
    email: '',
    regionId: '',
    addressResidence: '',
    addressRegistration: '',
    code: '',
    isActive: true,
    isBlacklisted: false,
  };
}

function PersonsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const attachMode = searchParams?.get('mode') === 'attach';

  const [mode, setMode] = useState<Mode>(attachMode ? 'attach' : 'list');
  const photos = usePhotoLightbox();
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [regions, setRegions] = useState<Region[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [statusMenu, setStatusMenu] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.q || '');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [extraOpen, setExtraOpen] = useState(true);

  const filterQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(pageSize));
    for (const k of FILTER_KEYS) {
      const v = filters[k];
      if (v) p.set(k === 'fio' ? 'fio' : k, v);
    }
    if (!filters.isActive) p.set('isActive', '1');
    return p.toString();
  }, [filters, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<PageResult<PersonRow> | PersonRow[]>(
        `/api/persons?${filterQs}`,
      );
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setRows(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterQs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const dicts = await apiFetch<
          Array<{ code: string; items?: Region[] }>
        >('/api/settings/dictionaries?kind=admin');
        const reg = (dicts || []).find((d) => d.code === 'regions');
        setRegions(reg?.items || []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    setMode(attachMode ? 'attach' : mode === 'attach' ? 'list' : mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachMode]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setMode('create');
    setError('');
  }

  function openEdit(row: PersonRow) {
    setEditId(row.id);
    setForm({
      lastName: row.lastName || '',
      firstName: row.firstName || '',
      middleName: row.middleName || '',
      isKeyPerson: Boolean(row.isKeyPerson),
      accessAllEmployees: Boolean(row.accessAllEmployees),
      birthDate: row.birthDate ? String(row.birthDate).slice(0, 10) : '',
      nationality: row.nationality || '',
      gender: row.gender === 'F' || row.gender === 'Женский' ? 'F' : 'M',
      inn: row.inn || '',
      inps: row.inps || '',
      pinfl: row.pinfl || '',
      photoUrl: row.photoUrl || '',
      useForFaceRecognition: row.useForFaceRecognition !== false,
      phone: row.phone || '',
      email: row.email || '',
      regionId: row.regionId || row.region?.id || '',
      addressResidence: row.addressResidence || '',
      addressRegistration: row.addressRegistration || '',
      code: row.code || '',
      isActive: row.isActive !== false,
      isBlacklisted: Boolean(row.isBlacklisted),
    });
    setMode('edit');
    setError('');
  }

  async function save() {
    if (!form.firstName.trim()) {
      setError('Укажите имя');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        birthDate: form.birthDate || undefined,
        nationality: form.nationality.trim() || null,
        gender: form.gender,
        inn: form.inn.trim() || null,
        inps: form.inps.trim() || null,
        pinfl: form.pinfl.trim() || null,
        photoUrl: form.photoUrl || null,
        useForFaceRecognition: form.useForFaceRecognition,
        isKeyPerson: form.isKeyPerson,
        accessAllEmployees: form.accessAllEmployees,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        regionId: form.regionId || null,
        addressResidence: form.addressResidence.trim() || null,
        addressRegistration: form.addressRegistration.trim() || null,
        code: form.code.trim() || null,
        isActive: form.isActive,
        isBlacklisted: form.isBlacklisted,
      };
      if (editId) {
        await apiFetch(`/api/persons/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/persons', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMode(attachMode ? 'attach' : 'list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function bulkStatus(isActive: boolean) {
    if (!selectedIds.length) return;
    setBusy(true);
    setStatusMenu(false);
    try {
      await apiFetch('/api/persons/bulk/status', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, isActive }),
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkPin(isPinned: boolean) {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      await apiFetch('/api/persons/bulk/pin', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, isPinned }),
      });
      setSelected(new Set());
      if (attachMode && isPinned) {
        router.push('/catalog/persons');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (!selectedIds.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные записи (${selectedIds.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/persons/bulk/delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(row: PersonRow) {
    if (!(await confirm(`Удалить «${fio(row)}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/persons/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function setActiveOne(row: PersonRow, isActive: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/api/persons/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, photoUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    params.delete('page');
    setPage(1);
    const qs = params.toString();
    router.replace(qs ? `/catalog/persons?${qs}` : '/catalog/persons', {
      scroll: false,
    });
  }

  function exportCsv() {
    downloadCsv(
      `persons-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        ФИО: fio(r),
        ИНН: r.inn || '',
        Код: r.code || '',
        Телефон: r.phone || '',
        'В черном списке': r.isBlacklisted ? 'Да' : 'Нет',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const pageTitle =
    mode === 'create'
      ? 'Физическое лицо (создание)'
      : mode === 'edit'
        ? 'Физическое лицо (изменение)'
        : mode === 'attach'
          ? 'Физические лица (прикрепление)'
          : 'Физические лица';

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className={listStyles.wrap}>
        <PageSubnav
          group={{
            title: pageTitle,
            siblings: [{ label: 'Физические лица', href: '/catalog/persons' }],
          }}
        />
        <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={formStyles.btnClose}
            onClick={() => setMode(attachMode ? 'attach' : 'list')}
          >
            Закрыть
          </button>
        </div>
        {error ? <p className={listStyles.error}>{error}</p> : null}

        <div className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Основная информация</h2>
          <div className={styles.mainGrid}>
            <div className={styles.fieldsCol}>
              <div className={styles.nameRow}>
                <div className={formStyles.field}>
                  <label>Фамилия</label>
                  <input
                    value={form.lastName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                  />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Имя <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                  />
                </div>
                <div className={formStyles.field}>
                  <label>Отчество</label>
                  <input
                    value={form.middleName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, middleName: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.checkRow}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.isKeyPerson}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isKeyPerson: e.target.checked }))
                    }
                  />
                  Ключевое лицо
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.accessAllEmployees}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        accessAllEmployees: e.target.checked,
                      }))
                    }
                  />
                  Доступ ко всем сотрудникам
                </label>
              </div>
              <div className={styles.twoCol}>
                <div>
                  <div className={formStyles.field}>
                    <label>Дата рождения</label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, birthDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className={formStyles.field}>
                    <label>Национальность</label>
                    <input
                      value={form.nationality}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nationality: e.target.value }))
                      }
                      placeholder="Поиск..."
                    />
                  </div>
                  <div className={formStyles.field}>
                    <label>Пол</label>
                    <div className={styles.radioRow}>
                      <label className={styles.check}>
                        <input
                          type="radio"
                          name="gender"
                          checked={form.gender === 'M'}
                          onChange={() => setForm((f) => ({ ...f, gender: 'M' }))}
                        />
                        Мужской
                      </label>
                      <label className={styles.check}>
                        <input
                          type="radio"
                          name="gender"
                          checked={form.gender === 'F'}
                          onChange={() => setForm((f) => ({ ...f, gender: 'F' }))}
                        />
                        Женский
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <div className={formStyles.field}>
                    <label>ИНН</label>
                    <input
                      value={form.inn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, inn: e.target.value }))
                      }
                    />
                  </div>
                  <div className={formStyles.field}>
                    <label>ИНПС</label>
                    <input
                      value={form.inps}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, inps: e.target.value }))
                      }
                    />
                  </div>
                  <div className={formStyles.field}>
                    <label>ПИНФЛ</label>
                    <input
                      value={form.pinfl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, pinfl: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.photoCol}>
              <label className={styles.photoBox}>
                {form.photoUrl ? (
                  <PhotoThumb
                    src={mediaSrc(form.photoUrl) || form.photoUrl}
                    alt=""
                    lightbox={photos}
                    slides={[{ src: form.photoUrl, caption: 'Фото' }]}
                  />
                ) : (
                  <span className={styles.photoPlaceholder}>Фото</span>
                )}
                <input type="file" accept="image/*" onChange={onPhoto} hidden />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.useForFaceRecognition}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      useForFaceRecognition: e.target.checked,
                    }))
                  }
                />
                Использовать для распознавания лица
              </label>
            </div>
          </div>

          <h2 className={styles.sectionTitle}>Контакты и адреса</h2>
          <div className={styles.twoCol}>
            <div>
              <div className={formStyles.field}>
                <label>Номер телефона</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className={formStyles.field}>
                <label>E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <div className={formStyles.field}>
                <label>Регион</label>
                <select
                  value={form.regionId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, regionId: e.target.value }))
                  }
                >
                  <option value="">Поиск...</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={formStyles.field}>
                <label>Адрес места проживания</label>
                <textarea
                  rows={2}
                  value={form.addressResidence}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      addressResidence: e.target.value,
                    }))
                  }
                />
              </div>
              <div className={formStyles.field}>
                <label>Адрес по прописке</label>
                <textarea
                  rows={2}
                  value={form.addressRegistration}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      addressRegistration: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.accordion}
            onClick={() => setExtraOpen((v) => !v)}
          >
            Дополнительная информация {extraOpen ? '▾' : '▸'}
          </button>
          {extraOpen ? (
            <div className={styles.extraBlock}>
              <div className={formStyles.field}>
                <label>Код</label>
                <input
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
              </div>
              <div className={formStyles.statusBlock}>
                <span className={formStyles.fieldLabel}>Статус</span>
                <label className={formStyles.toggleRow}>
                  <button
                    type="button"
                    className={`${formStyles.toggle} ${form.isActive ? formStyles.toggleOn : ''}`}
                    onClick={() =>
                      setForm((f) => ({ ...f, isActive: !f.isActive }))
                    }
                  />
                  <span>Активный</span>
                </label>
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.isBlacklisted}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      isBlacklisted: e.target.checked,
                    }))
                  }
                />
                В черном списке
              </label>
            </div>
          ) : null}
        </div>
        {photos.node}
      </div>
    );
  }

  return (
    <div className={`${listStyles.wrap} ${styles.layout}`}>
      <PageSubnav group={{ title: pageTitle, siblings: [] }} />

      <div className={listStyles.toolbar}>
        <div className={listStyles.leftActions}>
          {mode === 'attach' ? (
            <>
              <button
                type="button"
                className={styles.btnAttach}
                disabled={!selectedIds.length || busy}
                onClick={() => void bulkPin(true)}
              >
                Прикрепить {selectedIds.length || ''}
              </button>
              <button
                type="button"
                className={listStyles.toolBtn}
                onClick={() => router.push('/catalog/persons')}
              >
                Закрыть
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={listStyles.createBtn}
                onClick={openCreate}
              >
                Создать
              </button>
              <div className={styles.menuWrap}>
                <button
                  type="button"
                  className={styles.btnStatus}
                  disabled={!selectedIds.length || busy}
                  onClick={() => setStatusMenu((v) => !v)}
                >
                  Изменить статус
                </button>
                {statusMenu ? (
                  <div className={styles.menu}>
                    <button
                      type="button"
                      onClick={() => void bulkStatus(false)}
                    >
                      Деактивировать {selectedIds.length}
                    </button>
                    <button type="button" onClick={() => void bulkStatus(true)}>
                      Активировать {selectedIds.length}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.btnUnpin}
                disabled={!selectedIds.length || busy}
                onClick={() => void bulkPin(false)}
              >
                Открепить {selectedIds.length || ''}
              </button>
              {selectedIds.length ? (
                <button
                  type="button"
                  className={styles.btnDanger}
                  disabled={busy}
                  onClick={() => void bulkDelete()}
                >
                  Удалить {selectedIds.length}
                </button>
              ) : null}
              <button
                type="button"
                className={listStyles.toolBtn}
                onClick={() => router.push('/catalog/persons?mode=attach')}
              >
                Прикрепление
              </button>
            </>
          )}
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            onApply={() => {
              setPage(1);
              void load();
            }}
            fields={[
              {
                type: 'text',
                key: 'fio',
                label: 'ФИО',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'gender',
                label: 'Пол',
                options: [
                  { value: 'M', label: 'Мужской' },
                  { value: 'F', label: 'Женский' },
                ],
              },
              {
                type: 'dateRange',
                fromKey: 'birthFrom',
                toKey: 'birthTo',
                label: 'Дата рождения',
              },
              {
                type: 'select',
                key: 'regionId',
                label: 'Регион',
                options: regions.map((r) => ({ value: r.id, label: r.name })),
              },
              {
                type: 'text',
                key: 'phone',
                label: 'Телефон',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'blacklisted',
                label: 'В черном списке',
                options: [
                  { value: '1', label: 'Да' },
                  { value: '0', label: 'Нет' },
                ],
              },
              {
                type: 'select',
                key: 'isActive',
                label: 'Статус',
                options: [
                  { value: '1', label: 'Активный' },
                  { value: '0', label: 'Неактивный' },
                ],
              },
            ]}
          />
        </div>
        <div className={listStyles.rightTools}>
          <input
            className={listStyles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={listStyles.exportBtn} onClick={exportCsv}>
            Excel
          </button>
          <span className={listStyles.pagerMeta}>
            {rows.length} / {total}
          </span>
          <button
            type="button"
            className={listStyles.pagerBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className={listStyles.pagerMeta}>{page}</span>
          <button
            type="button"
            className={listStyles.pagerBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className={listStyles.toolBtn}
            onClick={() => void load()}
          >
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={listStyles.error}>{error}</p> : null}

      <div className={listStyles.tableWrap}>
        <table className={listStyles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    rows.length > 0 && rows.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th style={{ width: 48 }} />
              <th>ФИО</th>
              <th>ИНН</th>
              <th>Код</th>
              <th>В черном списке</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={listStyles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={listStyles.empty}>
                  нет данных
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const open = focusId === row.id;
              return (
                <tr
                  key={row.id}
                  className={open ? listStyles.rowSelected : undefined}
                  onClick={() => setFocusId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    {row.photoUrl ? (
                      <PhotoThumb
                        className={styles.avatar}
                        src={mediaSrc(row.photoUrl) || row.photoUrl}
                        alt=""
                        lightbox={photos}
                        slides={rows
                          .map((x) => ({
                            src: mediaSrc(x.photoUrl) || '',
                            caption: fio(x),
                          }))
                          .filter((s) => s.src)}
                        index={Math.max(
                          0,
                          rows
                            .map((x) => mediaSrc(x.photoUrl) || '')
                            .filter(Boolean)
                            .findIndex((s) => s === (mediaSrc(row.photoUrl) || '')),
                        )}
                      />
                    ) : (
                      <span className={styles.avatarFallback}>
                        {initials(row)}
                      </span>
                    )}
                  </td>
                  <td className={listStyles.nameCell}>
                    <span className={listStyles.nameText}>{fio(row)}</span>
                    {open ? (
                      <div
                        className={`${listStyles.inlineActions} ${listStyles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mode === 'attach' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(new Set([row.id]));
                              void bulkPin(true);
                            }}
                          >
                            Прикрепить
                          </button>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEdit(row)}>
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void setActiveOne(row, row.isActive === false)
                              }
                            >
                              {row.isActive === false
                                ? 'Активировать'
                                : 'Деактивировать'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void apiFetch(`/api/persons/${row.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    isPinned: !row.isPinned,
                                  }),
                                }).then(() => load())
                              }
                            >
                              {row.isPinned ? 'Открепить' : 'Прикрепить'}
                            </button>
                            <button
                              type="button"
                              className={listStyles.danger}
                              disabled={busy}
                              onClick={() => void runDelete(row)}
                            >
                              Удалить
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td>{row.inn || ''}</td>
                  <td>{row.code || ''}</td>
                  <td>{row.isBlacklisted ? 'Да' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {photos.node}
    </div>
  );
}

export default function PersonsPage() {
  return (
    <Suspense fallback={<div className={listStyles.wrap}>Загрузка…</div>}>
      <PersonsPageInner />
    </Suspense>
  );
}
