'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type TabKey =
  | 'main'
  | 'calendar'
  | 'docs'
  | 'locations'
  | 'absences'
  | 'subordinates'
  | 'payroll'
  | 'efficiency'
  | 'education'
  | 'schedule_req'
  | 'accounts'
  | 'documents'
  | 'family'
  | 'certificates'
  | 'career'
  | 'files'
  | 'inventory'
  | 'car'
  | 'identity'
  | 'extra'
  | 'settings';

type Detail = {
  id: string;
  tabNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  employmentType: string;
  externalId?: string | null;
  hiredAt?: string | null;
  dismissedAt?: string | null;
  baseSalary?: string | number | null;
  division?: { name: string; code?: string } | null;
  position?: { name: string; code?: string } | null;
  region?: { name: string; code?: string } | null;
  grade?: { name: string; code?: string } | null;
  person?: {
    pinfl?: string | null;
    passport?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  schedule?: {
    name: string;
    startTime: string;
    endTime: string;
    shifts?: { weekday: number | null; startTime: string; endTime: string }[];
  } | null;
  faceProfile?: {
    syncStatus: string;
    photoUrl?: string | null;
    lastError?: string | null;
  } | null;
  documents: {
    id: string;
    title: string;
    type: string;
    documentDate: string;
    number?: string | null;
    payload?: Record<string, unknown> | null;
  }[];
  absences: {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    note?: string | null;
    absenceType: { name: string; code?: string };
  }[];
  requests?: {
    id: string;
    type: string;
    status: string;
    title: string;
    reviewNote?: string | null;
    createdAt: string;
  }[];
  relatives?: {
    id: string;
    fullName: string;
    relation: string;
    birthDate?: string | null;
    phone?: string | null;
  }[];
  days?: {
    id: string;
    workDate: string;
    status: string;
    firstInAt?: string | null;
    lastOutAt?: string | null;
    lateMinutes?: number;
  }[];
  marks?: {
    id: string;
    direction: string;
    occurredAt: string;
    source: string;
  }[];
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  } | null;
  attachedLocations?: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    locationType?: { name: string } | null;
  }[];
  locations?: {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    locationType?: { name: string } | null;
  }[];
  profileExtras?: {
    nationality?: string | null;
    paymentType?: string | null;
    registeredAddress?: string | null;
  };
};

const PRIMARY_TABS: { key: TabKey; label: string }[] = [
  { key: 'main', label: 'Основная информация' },
  { key: 'calendar', label: 'Календарь' },
  { key: 'docs', label: 'История документов' },
  { key: 'locations', label: 'Локации' },
  { key: 'absences', label: 'Запросы на отсутствие' },
];

const MORE_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'subordinates', label: 'Подчиненные' },
  { key: 'payroll', label: 'Оплата труда' },
  { key: 'efficiency', label: 'Эффективность' },
  { key: 'education', label: 'Образование' },
  { key: 'schedule_req', label: 'Запросы на изменение графика' },
  { key: 'accounts', label: 'Расчетные счета' },
  { key: 'documents', label: 'Документы' },
  { key: 'family', label: 'Семья' },
  { key: 'certificates', label: 'Справки' },
  { key: 'career', label: 'Трудовая деятельность' },
  { key: 'files', label: 'Файлы' },
  { key: 'inventory', label: 'Инвентарь' },
  { key: 'car', label: 'Автомобиль' },
  { key: 'identity', label: 'Идентификация' },
  { key: 'extra', label: 'Дополнительная информация' },
  { key: 'settings', label: 'Настройки' },
];

const DOC_LABELS: Record<string, string> = {
  hire: 'Приказ о работе',
  transfer: 'Приказ о переводе',
  dismiss: 'Приказ об увольнении',
  name_change: 'Смена ФИО',
  wage_change: 'Изменение оклада',
  other: 'Документ',
};

const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function fullName(parts: {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}) {
  return [parts.lastName, parts.firstName, parts.middleName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function genderRu(g?: string | null) {
  if (!g) return '—';
  const v = g.toLowerCase();
  if (v.startsWith('m') || v === 'male' || v === 'муж') return 'Мужской';
  if (v.startsWith('f') || v === 'female' || v === 'жен') return 'Женский';
  return g;
}

function statusRu(status: string) {
  if (status === 'active') return 'Работает';
  if (status === 'dismissed') return 'Уволен';
  return status;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('ru-RU').format(n);
}

function scheduleLabel(row: Detail) {
  const s = row.schedule;
  if (!s) return '—';
  const base = `${s.startTime}-${s.endTime}`;
  const named = /\d\/\d/.test(s.name) ? s.name : `${base} (5/1)`;
  return named.includes(base) ? `${named} (NEW)` : `${base} · ${named} (NEW)`;
}

function isWeekendPattern(date: Date, scheduleName?: string | null) {
  // JS: 0 Sun .. 6 Sat. Verifix 6/1 → Sunday off; 5/1 → Sat+Sun off.
  const day = date.getUTCDay();
  const sixOne = scheduleName?.includes('6/1');
  if (sixOne) return day === 0;
  return day === 0 || day === 6;
}

function EmptyRow({ cols, text = 'нет данных' }: { cols: number; text?: string }) {
  return (
    <tr>
      <td className={styles.empty} colSpan={cols}>
        {text}
      </td>
    </tr>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const moreRef = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [faceMsg, setFaceMsg] = useState('');
  const [externalIdDraft, setExternalIdDraft] = useState('');
  const [tab, setTab] = useState<TabKey>('main');
  const [moreOpen, setMoreOpen] = useState(false);
  const [docSub, setDocSub] = useState<'hr' | 'vac' | 'trip' | 'sick'>('hr');
  const [locSub, setLocSub] = useState<'attached' | 'available'>('attached');
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  });
  const [marksSub, setMarksSub] = useState<'calendar' | 'marks'>('calendar');

  async function load() {
    try {
      const data = await apiFetch<Detail>(`/api/employees/${id}`);
      setRow(data);
      setExternalIdDraft(data.externalId ?? '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const dayByDate = useMemo(() => {
    const map = new Map<string, NonNullable<Detail['days']>[number]>();
    for (const d of row?.days ?? []) {
      map.set(d.workDate.slice(0, 10), d);
    }
    return map;
  }, [row?.days]);

  const calendarCells = useMemo(() => {
    const y = calMonth.getUTCFullYear();
    const m = calMonth.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const startPad = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(Date.UTC(y, m, 1 - (startPad - i)));
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(Date.UTC(y, m, day)), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({
        date: new Date(
          Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1),
        ),
        inMonth: false,
      });
    }
    return cells;
  }, [calMonth]);

  const pendingAbsences = (row?.absences ?? []).filter((a) =>
    ['pending', 'draft'].includes(a.status),
  );
  const decidedAbsences = (row?.absences ?? []).filter((a) =>
    ['approved', 'rejected', 'cancelled'].includes(a.status),
  );
  const scheduleReqs = (row?.requests ?? []).filter((r) => r.type === 'schedule_change');
  const attached = row?.attachedLocations?.length
    ? row.attachedLocations
    : row?.locations ?? [];
  const available = row?.locations ?? [];

  async function dismiss() {
    if (!confirm('Уволить сотрудника?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function onFaceFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setFaceMsg('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiFetch(`/api/employees/${id}/face`, { method: 'POST', body: fd });
      setFaceMsg('Фото загружено — синхронизация с терминалом…');
      await load();
      try {
        const res = await apiFetch<{
          results: { name: string; ok: boolean; error?: string }[];
        }>(`/api/employees/${id}/face/sync`, { method: 'POST' });
        const ok = res.results.filter((r) => r.ok).length;
        const fail = res.results.filter((r) => !r.ok).length;
        setFaceMsg(`Фото + sync: ${ok} OK, ${fail} ошибок`);
        await load();
      } catch (syncErr) {
        setFaceMsg(
          syncErr instanceof Error
            ? `Фото загружено, ошибка sync: ${syncErr.message}`
            : 'Фото загружено, ошибка sync',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }

  async function saveExternalId() {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ externalId: externalIdDraft || null }),
      });
      await load();
      setFaceMsg('Face ID сохранён');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function syncFace() {
    setBusy(true);
    setFaceMsg('');
    setError('');
    try {
      const res = await apiFetch<{
        results: { name: string; ok: boolean; error?: string }[];
      }>(`/api/employees/${id}/face/sync`, { method: 'POST' });
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.filter((r) => !r.ok).length;
      setFaceMsg(`Sync: ${ok} успешно, ${fail} ошибок`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка sync');
    } finally {
      setBusy(false);
    }
  }

  const moreActive = MORE_ITEMS.some((m) => m.key === tab);
  const moreLabel =
    MORE_ITEMS.find((m) => m.key === tab)?.label ?? 'Дополнительно';

  if (!row && !error) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <Link className={styles.back} href="/employees">
            ←
          </Link>
          <h1 className={styles.title}>Сотрудник</h1>
        </div>
        <div className={styles.sectionActions}>
          {row?.status === 'active' ? (
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={dismiss}>
              Уволить
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              router.refresh();
              load();
            }}
          >
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {row ? (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.avatarWrap}>
              {row.faceProfile?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.avatar}
                  src={row.faceProfile.photoUrl}
                  alt={fullName(row)}
                />
              ) : (
                <div className={`${styles.avatar} ${styles.avatarEmpty}`}>
                  {(row.firstName?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <h2 className={styles.fullName}>{fullName(row)}</h2>
            <p className={styles.roleLine}>
              {[row.position?.code || row.position?.name, row.division?.name]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
            <div className={styles.statusWrap}>
              <span className={styles.statusPill}>{statusRu(row.status)}</span>
            </div>
            <ul className={styles.sideList}>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>🪪</span>
                <div>
                  <span className={styles.sideLabel}>Паспортные данные</span>
                  <span className={styles.sideValue}>
                    {row.person?.passport ?? '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>📞</span>
                <div>
                  <span className={styles.sideLabel}>Номер телефона</span>
                  <span className={styles.sideValue}>
                    {row.phone || row.person?.phone || '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>👤</span>
                <div>
                  <span className={styles.sideLabel}>Руководитель</span>
                  <span className={styles.sideValue}>
                    {row.manager ? fullName(row.manager) : '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>🗓️</span>
                <div>
                  <span className={styles.sideLabel}>График работы</span>
                  <span className={styles.sideValue}>{scheduleLabel(row)}</span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>📍</span>
                <div>
                  <span className={styles.sideLabel}>Локации</span>
                  <span className={styles.sideValue}>
                    {attached.length
                      ? `${attached
                          .slice(0, 3)
                          .map((l) => l.name)
                          .join(', ')}${attached.length > 3 ? '…' : ''}`
                      : '—'}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>💰</span>
                <div>
                  <span className={styles.sideLabel}>Зарплата</span>
                  <span className={styles.sideValue}>
                    {fmtMoney(row.baseSalary)}
                  </span>
                </div>
              </li>
              <li className={styles.sideItem}>
                <span className={styles.sideIcon}>🏷️</span>
                <div>
                  <span className={styles.sideLabel}>Тип оплаты труда</span>
                  <span className={styles.sideValue}>
                    {row.profileExtras?.paymentType ?? '—'}
                  </span>
                </div>
              </li>
            </ul>
          </aside>

          <section className={styles.main}>
            <div className={styles.tabs}>
              {PRIMARY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
                  onClick={() => {
                    setTab(t.key);
                    setMoreOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
              <div className={styles.moreWrap} ref={moreRef}>
                <button
                  type="button"
                  className={`${styles.moreBtn} ${moreActive ? styles.moreBtnActive : ''}`}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  {moreActive ? moreLabel : 'Дополнительно'} ▾
                </button>
                {moreOpen ? (
                  <div className={styles.moreMenu}>
                    {MORE_ITEMS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className={`${styles.moreItem} ${
                          tab === m.key ? styles.moreItemActive : ''
                        }`}
                        onClick={() => {
                          setTab(m.key);
                          setMoreOpen(false);
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.panelBody}>
              {tab === 'main' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Персональные данные</h3>
                      <div className={styles.sectionActions}>
                        <button type="button" className={styles.btnGhost}>
                          История изменений
                        </button>
                        <button type="button" className={styles.btnGhost}>
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGrid}>
                      <div className={styles.field}>
                        <label>Имя</label>
                        <div className={styles.fieldValue}>{row.firstName}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Фамилия</label>
                        <div className={styles.fieldValue}>{row.lastName}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Отчество</label>
                        <div className={styles.fieldValue}>
                          {row.middleName || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Национальность</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.nationality ?? '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Дата рождения</label>
                        <div className={styles.fieldValue}>
                          {fmtDate(row.person?.birthDate)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Пол</label>
                        <div className={styles.fieldValue}>
                          {genderRu(row.person?.gender)}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>ПИНФЛ</label>
                        <div className={styles.fieldValue}>
                          {row.person?.pinfl || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>ИНПС</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                      <div className={styles.field}>
                        <label>ИНН</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Контакты и адреса</h3>
                      <div className={styles.sectionActions}>
                        <button type="button" className={styles.btnGhost}>
                          История изменений
                        </button>
                        <button type="button" className={styles.btnGhost}>
                          Изменить
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGrid}>
                      <div className={styles.field}>
                        <label>Номер телефона</label>
                        <div className={styles.fieldValue}>
                          {row.phone || row.person?.phone || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>E-mail</label>
                        <div className={styles.fieldValue}>
                          {row.email || row.person?.email || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Дополнительный номер телефона</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                      <div className={styles.field}>
                        <label>Корпоративный E-mail</label>
                        <div className={styles.fieldValue}>{row.email || '—'}</div>
                      </div>
                      <div className={styles.field}>
                        <label>Регион</label>
                        <div className={styles.fieldValue}>
                          {row.region?.name || '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Адрес</label>
                        <div className={styles.fieldValue}>
                          {row.profileExtras?.registeredAddress ||
                            row.region?.name ||
                            '—'}
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label>Адрес по прописке</label>
                        <div className={styles.fieldValue}>—</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <div className={styles.statsRow}>
                      <h3 className={styles.sectionTitle}>Статистика посещений</h3>
                      <span className={styles.muted}>Последние 12 месяцев</span>
                    </div>
                    <div className={styles.statsBox}>
                      {(row.days ?? []).length
                        ? `Дней с отметками: ${(row.days ?? []).length} · опозданий: ${(
                            row.days ?? []
                          )
                            .filter((d) => d.status === 'late')
                            .length}`
                        : 'Нет данных за выбранный период'}
                    </div>
                  </div>
                </>
              ) : null}

              {tab === 'calendar' ? (
                <>
                  <div className={styles.subTabs}>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        marksSub === 'calendar' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setMarksSub('calendar')}
                    >
                      Календарь
                    </button>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        marksSub === 'marks' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setMarksSub('marks')}
                    >
                      Отметки
                    </button>
                  </div>

                  {marksSub === 'calendar' ? (
                    <>
                      <div className={styles.calHead}>
                        <div className={styles.calNav}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() =>
                              setCalMonth(
                                new Date(
                                  Date.UTC(
                                    calMonth.getUTCFullYear(),
                                    calMonth.getUTCMonth() - 1,
                                    1,
                                  ),
                                ),
                              )
                            }
                          >
                            ‹
                          </button>
                          <h3 className={styles.calTitle}>
                            {MONTHS_RU[calMonth.getUTCMonth()]}{' '}
                            {calMonth.getUTCFullYear()} г.
                          </h3>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() =>
                              setCalMonth(
                                new Date(
                                  Date.UTC(
                                    calMonth.getUTCFullYear(),
                                    calMonth.getUTCMonth() + 1,
                                    1,
                                  ),
                                ),
                              )
                            }
                          >
                            ›
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={() => {
                            const n = new Date();
                            setCalMonth(
                              new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1)),
                            );
                          }}
                        >
                          Сегодня
                        </button>
                      </div>
                      <div className={styles.calGrid}>
                        {DOW.map((d) => (
                          <div key={d} className={styles.calDow}>
                            {d}
                          </div>
                        ))}
                        {calendarCells.map(({ date, inMonth }) => {
                          const key = date.toISOString().slice(0, 10);
                          const day = dayByDate.get(key);
                          const off = isWeekendPattern(date, row.schedule?.name);
                          let bar: React.ReactNode = null;
                          if (inMonth) {
                            if (day?.status === 'leave' || day?.status === 'day_off' || off) {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calOff}`}>
                                  Выходной
                                </span>
                              );
                            } else if (day?.status === 'leave') {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calLeave}`}>
                                  Отпуск
                                </span>
                              );
                            } else {
                              bar = (
                                <span className={`${styles.calBar} ${styles.calWork}`}>
                                  {row.schedule
                                    ? `${row.schedule.startTime} - ${row.schedule.endTime}`
                                    : '09:00 - 18:00'}
                                </span>
                              );
                            }
                          }
                          return (
                            <div
                              key={key + String(inMonth)}
                              className={`${styles.calCell} ${
                                inMonth ? '' : styles.calCellMuted
                              }`}
                            >
                              <div className={styles.calDayNum}>{date.getUTCDate()}</div>
                              {bar}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Время</th>
                            <th>Направление</th>
                            <th>Источник</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.marks ?? []).length === 0 ? (
                            <EmptyRow cols={3} />
                          ) : (
                            (row.marks ?? []).map((m) => (
                              <tr key={m.id}>
                                <td>{new Date(m.occurredAt).toLocaleString('ru-RU')}</td>
                                <td>{m.direction}</td>
                                <td>
                                  <span className={styles.badge}>{m.source}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}

              {tab === 'docs' ? (
                <>
                  <h3 className={styles.blockTitle}>Основное место работы</h3>
                  <div className={styles.subTabs}>
                    {(
                      [
                        ['hr', 'Кадровые документы'],
                        ['vac', 'Отпуска'],
                        ['trip', 'Командировки'],
                        ['sick', 'Больничные листы'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={`${styles.subTab} ${
                          docSub === k ? styles.subTabActive : ''
                        }`}
                        onClick={() => setDocSub(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Дата начала</th>
                          <th>Дата окончания</th>
                          <th>Позиция</th>
                          <th>Подразделение</th>
                          <th>Должность</th>
                          <th>Разряд</th>
                          <th>График работы</th>
                          <th>Оклад</th>
                          <th>Тип документа</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docSub === 'hr' && row.documents.length === 0 ? (
                          <tr>
                            <td>{fmtDate(row.hiredAt)}</td>
                            <td>—</td>
                            <td>
                              {[row.position?.code, row.division?.name]
                                .filter(Boolean)
                                .join(' / ') || '—'}
                            </td>
                            <td>{row.division?.name ?? '—'}</td>
                            <td>{row.position?.name ?? '—'}</td>
                            <td>{row.grade?.name ?? '—'}</td>
                            <td>{scheduleLabel(row)}</td>
                            <td>{fmtMoney(row.baseSalary)}</td>
                            <td>
                              <span className={styles.badge}>Приказ о работе</span>
                            </td>
                          </tr>
                        ) : null}
                        {docSub === 'hr'
                          ? row.documents.map((d) => (
                              <tr key={d.id}>
                                <td>{fmtDate(d.documentDate)}</td>
                                <td>—</td>
                                <td>
                                  {[row.position?.code, row.division?.name]
                                    .filter(Boolean)
                                    .join(' / ') || '—'}
                                </td>
                                <td>{row.division?.name ?? '—'}</td>
                                <td>{row.position?.name ?? '—'}</td>
                                <td>{row.grade?.name ?? '—'}</td>
                                <td>{scheduleLabel(row)}</td>
                                <td>{fmtMoney(row.baseSalary)}</td>
                                <td>
                                  <span className={styles.badge}>
                                    {DOC_LABELS[d.type] ?? d.title}
                                  </span>
                                </td>
                              </tr>
                            ))
                          : null}
                        {docSub !== 'hr' ? <EmptyRow cols={9} /> : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {tab === 'locations' ? (
                <>
                  <div className={styles.subTabs}>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        locSub === 'attached' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setLocSub('attached')}
                    >
                      Прикрепленные
                    </button>
                    <button
                      type="button"
                      className={`${styles.subTab} ${
                        locSub === 'available' ? styles.subTabActive : ''
                      }`}
                      onClick={() => setLocSub('available')}
                    >
                      Доступные
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Название</th>
                          <th>Регион</th>
                          <th>Тип локации</th>
                          <th>Адрес</th>
                          <th>Тип прикрепления</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(locSub === 'attached' ? attached : available).length ===
                        0 ? (
                          <EmptyRow cols={5} />
                        ) : (
                          (locSub === 'attached' ? attached : available).map((l) => (
                            <tr key={l.id}>
                              <td>{l.name}</td>
                              <td>{row.region?.name ?? '—'}</td>
                              <td>{l.locationType?.name ?? '—'}</td>
                              <td>{l.address || '—'}</td>
                              <td>
                                <span className={`${styles.badge} ${styles.badgeOk}`}>
                                  Авто
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {tab === 'absences' ? (
                <>
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>Не подтвержденные запросы</h3>
                      <button type="button" className={styles.btn}>
                        Добавить
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата запроса</th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителя</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingAbsences.length === 0 ? (
                            <EmptyRow cols={6} />
                          ) : (
                            pendingAbsences.map((a) => (
                              <tr key={a.id}>
                                <td>{fmtDate(a.startDate)}</td>
                                <td>{a.absenceType.name}</td>
                                <td>
                                  {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                </td>
                                <td>{a.note || '—'}</td>
                                <td>—</td>
                                <td>
                                  <span className={`${styles.badge} ${styles.badgeWarn}`}>
                                    {a.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>
                      Подтвержденные и отклоненные запросы
                    </h3>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата запроса</th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителя</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decidedAbsences.length === 0 ? (
                            <EmptyRow cols={6} />
                          ) : (
                            decidedAbsences.map((a) => (
                              <tr key={a.id}>
                                <td>{fmtDate(a.startDate)}</td>
                                <td>{a.absenceType.name}</td>
                                <td>
                                  {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                </td>
                                <td>{a.note || '—'}</td>
                                <td>—</td>
                                <td>
                                  <span className={styles.badge}>{a.status}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>Плановые начисления</h3>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Вид отсутствия</th>
                            <th>Вид начисления</th>
                            <th>Начало</th>
                            <th>Конец</th>
                            <th>Начислено</th>
                            <th>Использовано</th>
                            <th>Осталось</th>
                          </tr>
                        </thead>
                        <tbody>
                          <EmptyRow cols={7} />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}

              {tab === 'family' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Родство</th>
                        <th>Дата рождения</th>
                        <th>Телефон</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(row.relatives ?? []).length === 0 ? (
                        <EmptyRow cols={4} />
                      ) : (
                        (row.relatives ?? []).map((r) => (
                          <tr key={r.id}>
                            <td>{r.fullName}</td>
                            <td>{r.relation}</td>
                            <td>{fmtDate(r.birthDate)}</td>
                            <td>{r.phone || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'schedule_req' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Заголовок</th>
                        <th>Статус</th>
                        <th>Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleReqs.length === 0 ? (
                        <EmptyRow cols={4} />
                      ) : (
                        scheduleReqs.map((r) => (
                          <tr key={r.id}>
                            <td>{fmtDate(r.createdAt)}</td>
                            <td>{r.title}</td>
                            <td>
                              <span className={styles.badge}>{r.status}</span>
                            </td>
                            <td>{r.reviewNote || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'identity' ? (
                <div className={styles.section}>
                  <h3 className={styles.blockTitle}>Идентификация / Face ID</h3>
                  <div className={styles.faceBox}>
                    {row.faceProfile?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.facePreview}
                        src={row.faceProfile.photoUrl}
                        alt="Face"
                      />
                    ) : (
                      <div className={styles.statsBox} style={{ width: 120, minHeight: 120 }}>
                        Нет фото
                      </div>
                    )}
                    <div className={styles.faceActions}>
                      <label className={styles.muted}>
                        Face ID (employeeNo)
                        <input
                          className={styles.fieldValue}
                          value={externalIdDraft}
                          onChange={(e) => setExternalIdDraft(e.target.value)}
                          placeholder="face-0001"
                          style={{ marginTop: 4 }}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        disabled={busy}
                        onClick={saveExternalId}
                      >
                        Сохранить Face ID
                      </button>
                      <label className={styles.muted}>
                        Загрузить фото
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => onFaceFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy || !row.faceProfile?.photoUrl}
                        onClick={syncFace}
                      >
                        Синхронизировать с терминалом
                      </button>
                      <p className={styles.muted}>
                        Sync:{' '}
                        <span className={styles.badge}>
                          {row.faceProfile?.syncStatus ?? 'нет'}
                        </span>
                      </p>
                      {faceMsg ? <p className={styles.muted}>{faceMsg}</p> : null}
                      {row.faceProfile?.lastError ? (
                        <p className={styles.error}>{row.faceProfile.lastError}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'payroll' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Оклад</label>
                    <div className={styles.fieldValue}>{fmtMoney(row.baseSalary)}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип оплаты</label>
                    <div className={styles.fieldValue}>
                      {row.profileExtras?.paymentType ?? '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Разряд</label>
                    <div className={styles.fieldValue}>{row.grade?.name ?? '—'}</div>
                  </div>
                </div>
              ) : null}

              {tab === 'settings' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Табельный номер</label>
                    <div className={styles.fieldValue}>{row.tabNumber}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип занятости</label>
                    <div className={styles.fieldValue}>{row.employmentType}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата приёма</label>
                    <div className={styles.fieldValue}>{fmtDate(row.hiredAt)}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата увольнения</label>
                    <div className={styles.fieldValue}>{fmtDate(row.dismissedAt)}</div>
                  </div>
                </div>
              ) : null}

              {[
                'subordinates',
                'efficiency',
                'education',
                'accounts',
                'documents',
                'certificates',
                'career',
                'files',
                'inventory',
                'car',
                'extra',
              ].includes(tab) ? (
                <div className={styles.statsBox}>
                  Раздел «{MORE_ITEMS.find((m) => m.key === tab)?.label}» — структура
                  готова. Данные появятся после заполнения справочников.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
