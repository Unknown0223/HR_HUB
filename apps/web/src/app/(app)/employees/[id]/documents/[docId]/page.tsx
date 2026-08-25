'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type HireView = {
  id: string;
  synthetic?: boolean;
  type: string;
  status: string;
  number?: string | null;
  title: string;
  documentDate: string;
  createdAt: string;
  updatedAt: string;
  postedAt?: string | null;
  postedBy?: string | null;
  employee: {
    id: string;
    tabNumber: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    fullName: string;
    hiredAt?: string | null;
    baseSalary?: string | number | null;
    employmentType: string;
    division?: { id?: string; name: string; code?: string } | null;
    position?: { id?: string; name: string; code?: string } | null;
    grade?: { name: string } | null;
    schedule?: { name: string; startTime: string; endTime: string } | null;
  };
  tabs: {
    main: {
      hireDate?: string | null;
      probation?: string | null;
      schedule?: { name: string; startTime: string; endTime: string } | null;
      division?: { name: string } | null;
      position?: { name: string; code?: string } | null;
      grade?: { name: string } | null;
      employmentKind: string;
      source?: string | null;
      documentName?: string | null;
      staffPositionLabel?: string;
    };
    payroll: {
      baseSalary?: string | number | null;
      paymentType?: string | null;
    };
    vacationLimit: {
      period: string;
      vacationType: string;
      limitDays: number;
      usedDays: number;
      remainingDays: number;
    }[];
    contract: {
      number?: string | null;
      date?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    };
    files: DocFile[];
  };
};

type DocFile = {
  id: string;
  name: string;
  key?: string;
  contentType?: string;
  size?: number;
  url?: string;
  uploadedAt?: string;
  uploadedBy?: string | null;
};

type HistoryBundle = {
  document: HistoryRow[];
  page: HistoryRow[];
  hire: HistoryRow[];
  positions: HistoryRow[];
  contracts: HistoryRow[];
  schedules: HistoryRow[];
  accruals: HistoryRow[];
  indicators: HistoryRow[];
};

type HistoryRow = {
  occurredAt: string;
  userName: string;
  event: string;
  documentType?: string;
  posted?: boolean;
  employeeName?: string;
  hireDate?: string;
  probation?: string;
  employmentKind?: string;
  positionLabel?: string;
  schedule?: string;
  contractDate?: string;
  startDate?: string;
  endDate?: string;
  contractNumber?: string;
  accrual?: string;
  value?: string;
  indicator?: string;
  [key: string]: unknown;
};

type DocTab = 'main' | 'payroll' | 'vacation' | 'contract' | 'files';
type HistTab =
  | 'document'
  | 'page'
  | 'hire'
  | 'positions'
  | 'contracts'
  | 'schedules'
  | 'accruals'
  | 'indicators';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat('ru-RU').format(n);
}

function statusRu(s: string) {
  if (s === 'posted') return 'Проведен';
  if (s === 'draft') return 'Черновик';
  if (s === 'cancelled') return 'Отменён';
  return s;
}

function toInputDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function EmployeeDocumentViewInner() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editing = searchParams.get('mode') === 'edit';
  const openHistory = searchParams.get('side') === 'history';

  const [data, setData] = useState<HireView | null>(null);
  const [history, setHistory] = useState<HistoryBundle | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DocTab>('main');
  const [side, setSide] = useState<'main' | 'history'>(
    openHistory ? 'history' : 'main',
  );
  const [histTab, setHistTab] = useState<HistTab>('document');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [divisions, setDivisions] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [positions, setPositions] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [employmentSources, setEmploymentSources] = useState<
    { id: string; label: string; sourceType?: string }[]
  >([]);
  const [files, setFiles] = useState<DocFile[]>([]);
  const [vacRows, setVacRows] = useState<
    HireView['tabs']['vacationLimit']
  >([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      if (docId === 'hire') {
        const view = await apiFetch<HireView>(
          `/api/employees/${id}/hire-document`,
        );
        setData(view);
        setVacRows(view.tabs.vacationLimit || []);
        if (!view.synthetic) {
          try {
            const fl = await apiFetch<DocFile[]>(
              `/api/hr/documents/${view.id}/files`,
            );
            setFiles(fl);
          } catch {
            setFiles(
              Array.isArray(view.tabs.files)
                ? (view.tabs.files as DocFile[])
                : [],
            );
          }
        } else {
          setFiles([]);
        }
      } else {
        const doc = await apiFetch<{
          id: string;
          type: string;
          status: string;
          number?: string | null;
          title: string;
          documentDate: string;
          createdAt: string;
          updatedAt: string;
          postedAt?: string | null;
          postedBy?: string | null;
          employee: HireView['employee'];
          tabs?: HireView['tabs'];
        }>(`/api/hr/documents/${docId}`);
        if (doc.type === 'hire') {
          const view = await apiFetch<HireView>(
            `/api/employees/${id}/hire-document`,
          );
          setData({
            ...view,
            id: doc.id,
            synthetic: false,
            status: doc.status,
          });
          setVacRows(view.tabs.vacationLimit || []);
          const fl = await apiFetch<DocFile[]>(
            `/api/hr/documents/${doc.id}/files`,
          ).catch(() => (view.tabs.files as DocFile[]) || []);
          setFiles(fl);
        } else {
          const tabs = doc.tabs || {
            main: {
              hireDate: doc.employee.hiredAt,
              schedule: doc.employee.schedule,
              division: doc.employee.division,
              position: doc.employee.position,
              grade: doc.employee.grade,
              employmentKind: 'Основное место работы',
              documentName: doc.title,
            },
            payroll: { baseSalary: doc.employee.baseSalary },
            vacationLimit: [],
            contract: { number: doc.number, date: doc.documentDate },
            files: [],
          };
          setData({
            id: doc.id,
            type: doc.type,
            status: doc.status,
            number: doc.number,
            title: doc.title,
            documentDate: doc.documentDate,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            postedAt: doc.postedAt,
            postedBy: doc.postedBy,
            employee: {
              ...doc.employee,
              fullName: [
                doc.employee.lastName,
                doc.employee.firstName,
                doc.employee.middleName,
              ]
                .filter(Boolean)
                .join(' '),
            },
            tabs,
          });
          setVacRows(tabs.vacationLimit || []);
          const fl = await apiFetch<DocFile[]>(
            `/api/hr/documents/${doc.id}/files`,
          ).catch(() => (tabs.files as DocFile[]) || []);
          setFiles(fl);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }, [id, docId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSide(openHistory ? 'history' : 'main');
  }, [openHistory]);

  useEffect(() => {
    if (side !== 'history' || !data || data.synthetic) return;
    apiFetch<HistoryBundle>(`/api/hr/documents/${data.id}/history`)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [side, data]);

  useEffect(() => {
    if (!editing) return;
    apiFetch<{
      divisions?: { id: string; label: string }[];
      positions?: { id: string; label: string }[];
      employmentSources?: { id: string; label: string; sourceType?: string }[];
    }>('/api/catalog/lookups')
      .then((l) => {
        setDivisions(l.divisions || []);
        setPositions(l.positions || []);
        setEmploymentSources(
          (l.employmentSources || []).filter(
            (s) => s.sourceType !== 'dismissal',
          ),
        );
      })
      .catch(() => undefined);
  }, [editing]);

  async function cancelDoc() {
    if (!data || data.synthetic) return;
    setBusy(true);
    try {
      await apiFetch(`/api/hr/documents/${data.id}/cancel`, { method: 'POST' });
      setConfirmCancel(false);
      router.push('/catalog/hr-documents');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function postDoc() {
    if (!data || data.synthetic) return;
    setBusy(true);
    try {
      await apiFetch(`/api/hr/documents/${data.id}/post`, { method: 'POST' });
      await load();
      router.replace(`/employees/${id}/documents/${docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data || data.synthetic || data.status !== 'draft') return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const vacationLimit = vacRows.map((row, idx) => {
        const limitDays = Number(fd.get(`vac_limit_${idx}`) ?? row.limitDays);
        const usedDays = Number(fd.get(`vac_used_${idx}`) ?? row.usedDays);
        return {
          period: String(fd.get(`vac_period_${idx}`) ?? row.period),
          vacationType: String(fd.get(`vac_type_${idx}`) ?? row.vacationType),
          limitDays,
          usedDays,
          remainingDays: Math.max(0, limitDays - usedDays),
        };
      });
      const payload: Record<string, unknown> = {
        divisionId: fd.get('divisionId') || undefined,
        positionId: fd.get('positionId') || undefined,
        probation: fd.get('probation') || undefined,
        source: fd.get('source') || undefined,
        employmentKind: fd.get('employmentKind') || undefined,
        baseSalary: fd.get('baseSalary')
          ? Number(fd.get('baseSalary'))
          : undefined,
        paymentType: fd.get('paymentType') || undefined,
        contract: {
          number: fd.get('contractNumber') || undefined,
          date: fd.get('contractDate') || undefined,
          startDate: fd.get('contractStart') || undefined,
          endDate: fd.get('contractEnd') || undefined,
        },
        vacationLimit,
      };
      await apiFetch(`/api/hr/documents/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: fd.get('title') || data.title,
          number: fd.get('number') || undefined,
          documentDate: fd.get('documentDate'),
          payload,
        }),
      });
      await load();
      router.replace(`/employees/${id}/documents/${docId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFile(fileList: FileList | null) {
    if (!data || data.synthetic || !fileList?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        await apiFetch(`/api/hr/documents/${data.id}/files`, {
          method: 'POST',
          body: fd,
        });
      }
      const fl = await apiFetch<DocFile[]>(
        `/api/hr/documents/${data.id}/files`,
      );
      setFiles(fl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteFile(fileId: string) {
    if (!data || data.synthetic) return;
    if (!(await confirm('Удалить файл?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/hr/documents/${data.id}/files/${fileId}`, {
        method: 'DELETE',
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function addVacRow() {
    const year = new Date().getFullYear();
    setVacRows((prev) => [
      ...prev,
      {
        period: String(year),
        vacationType: 'Основной',
        limitDays: 24,
        usedDays: 0,
        remainingDays: 24,
      },
    ]);
  }

  if (!data && !error) return <p className={styles.muted}>Загрузка…</p>;
  if (error && !data) return <p className={styles.error}>{error}</p>;
  if (!data) return null;

  const modeLabel = editing ? 'изменение' : 'просмотр';
  const title =
    data.type === 'hire'
      ? `Прием на работу (${modeLabel})`
      : `${data.title} (${modeLabel})`;

  const histRows =
    history?.[histTab] ||
    (histTab === 'document' || histTab === 'page' ? [] : []);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          {editing && data.status === 'draft' && !data.synthetic ? (
            <>
              <button
                type="submit"
                form="doc-edit-form"
                className={styles.btnPrimary}
                disabled={busy}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnInfo}
                disabled={busy}
                onClick={postDoc}
              >
                Провести
              </button>
            </>
          ) : null}
          {!editing && data.status === 'draft' && !data.synthetic ? (
            <Link
              className={styles.btn}
              href={`/employees/${id}/documents/${docId}?mode=edit`}
            >
              Изменить
            </Link>
          ) : null}
          {!data.synthetic && data.status !== 'cancelled' ? (
            <button
              type="button"
              className={styles.btnDanger}
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Отменить
            </button>
          ) : null}
          <Link className={styles.btnGhost} href="/catalog/hr-documents">
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <p className={styles.docMeta}>{data.number || data.id.slice(0, 10)}</p>
          <p className={styles.docDate}>{fmtDate(data.documentDate)}</p>
          <div className={styles.status}>{statusRu(data.status)}</div>
          <div className={styles.sideNav}>
            <button
              type="button"
              className={`${styles.sideLink} ${
                side === 'main' ? styles.sideLinkActive : ''
              }`}
              onClick={() => setSide('main')}
            >
              Основная информация
            </button>
            <button
              type="button"
              className={`${styles.sideLink} ${
                side === 'history' ? styles.sideLinkActive : ''
              }`}
              onClick={() => setSide('history')}
            >
              История изменений
            </button>
          </div>
        </aside>

        <section className={styles.main}>
          {side === 'history' ? (
            <>
              <div className={styles.historyTop}>
                <h2 className={styles.mainTitle}>История изменений</h2>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setSide('main')}
                >
                  Закрыть
                </button>
              </div>
              <div className={styles.tabs}>
                {(
                  [
                    ['document', 'Документ'],
                    ['page', 'История изменений страницы'],
                    ['hire', 'Прием на работу'],
                    ['positions', 'Позиции'],
                    ['contracts', 'Договоры'],
                    ['schedules', 'Рабочие графики'],
                    ['accruals', 'Начисления'],
                    ['indicators', 'Показатели'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.tab} ${
                      histTab === k ? styles.tabActive : ''
                    }`}
                    onClick={() => setHistTab(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Дата события</th>
                      <th>Пользователь</th>
                      <th>Событие</th>
                      {histTab === 'document' || histTab === 'page' ? (
                        <>
                          <th>Тип документа</th>
                          <th>Проведен</th>
                        </>
                      ) : null}
                      {histTab === 'hire' ? (
                        <>
                          <th>Дата приема</th>
                          <th>Испыт. срок</th>
                        </>
                      ) : null}
                      {histTab === 'positions' ? (
                        <>
                          <th>Вид занятости</th>
                          <th>Позиция</th>
                        </>
                      ) : null}
                      {histTab === 'schedules' ? <th>График работы</th> : null}
                      {histTab === 'contracts' ? (
                        <>
                          <th>Дата договора</th>
                          <th>Дата начала</th>
                          <th>Дата истечения</th>
                          <th>Номер договора</th>
                        </>
                      ) : null}
                      {histTab === 'accruals' ? <th>Начисление</th> : null}
                      {histTab === 'indicators' ? (
                        <>
                          <th>Показатель</th>
                          <th>Значение</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {histRows.length === 0 ? (
                      <tr>
                        <td className={styles.empty} colSpan={8}>
                          нет данных
                        </td>
                      </tr>
                    ) : (
                      histRows.map((row, idx) => (
                        <tr key={`${row.occurredAt}-${idx}`}>
                          <td>{fmtDateTime(row.occurredAt)}</td>
                          <td>{row.userName}</td>
                          <td>{row.event}</td>
                          {histTab === 'document' || histTab === 'page' ? (
                            <>
                              <td>{row.documentType || '—'}</td>
                              <td>
                                {row.posted ? (
                                  <span className={styles.badgeYes}>Да</span>
                                ) : (
                                  <span className={styles.badgeNo}>Нет</span>
                                )}
                              </td>
                            </>
                          ) : null}
                          {histTab === 'hire' ? (
                            <>
                              <td>{fmtDate(row.hireDate)}</td>
                              <td>{row.probation ?? '—'}</td>
                            </>
                          ) : null}
                          {histTab === 'positions' ? (
                            <>
                              <td>{row.employmentKind || '—'}</td>
                              <td>{row.positionLabel || '—'}</td>
                            </>
                          ) : null}
                          {histTab === 'schedules' ? (
                            <td>{row.schedule || '—'}</td>
                          ) : null}
                          {histTab === 'contracts' ? (
                            <>
                              <td>{fmtDate(row.contractDate)}</td>
                              <td>{fmtDate(row.startDate)}</td>
                              <td>{fmtDate(row.endDate)}</td>
                              <td>{row.contractNumber || '—'}</td>
                            </>
                          ) : null}
                          {histTab === 'accruals' ? (
                            <td>
                              {row.accrual || '—'}
                              {row.value ? `: ${row.value}` : ''}
                            </td>
                          ) : null}
                          {histTab === 'indicators' ? (
                            <>
                              <td>{row.indicator || '—'}</td>
                              <td>{row.value || '—'}</td>
                            </>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : editing && data.status === 'draft' && !data.synthetic ? (
            <form id="doc-edit-form" onSubmit={onSave}>
              <h2 className={styles.mainTitle}>Основная информация</h2>
              <div className={styles.metaGrid}>
                <div className={styles.field}>
                  <label>Дата *</label>
                  <input
                    name="documentDate"
                    type="date"
                    required
                    defaultValue={toInputDate(data.documentDate)}
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label>Номер *</label>
                  <input
                    name="number"
                    defaultValue={data.number || ''}
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label>Сотрудник</label>
                  <div className={styles.fieldValue}>
                    {data.employee.fullName}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Табельный номер</label>
                  <div className={styles.fieldValue}>
                    {data.employee.tabNumber}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Название документа</label>
                  <input
                    name="title"
                    defaultValue={data.title}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.tabs}>
                {(
                  [
                    ['main', 'Главное'],
                    ['payroll', 'Оплата труда'],
                    ['vacation', 'Лимит отпуска'],
                    ['contract', 'Трудовой договор'],
                    ['files', 'Файлы'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.tab} ${
                      tab === k ? styles.tabActive : ''
                    }`}
                    onClick={() => setTab(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'main' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Дата приема на работу</label>
                    <div className={styles.fieldValue}>
                      {fmtDate(data.tabs.main.hireDate)}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Испыт. срок</label>
                    <input
                      name="probation"
                      defaultValue={data.tabs.main.probation || ''}
                      className={styles.input}
                      placeholder="месяц"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Подразделение</label>
                    <select
                      name="divisionId"
                      className={styles.input}
                      defaultValue={data.employee.division?.id || ''}
                    >
                      <option value="">—</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Должность</label>
                    <select
                      name="positionId"
                      className={styles.input}
                      defaultValue={data.employee.position?.id || ''}
                    >
                      <option value="">—</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Откуда пришел</label>
                    <select
                      name="source"
                      className={styles.input}
                      defaultValue={data.tabs.main.source || ''}
                    >
                      <option value="">—</option>
                      {employmentSources.map((s) => (
                        <option key={s.id} value={s.label}>
                          {s.label}
                        </option>
                      ))}
                      {data.tabs.main.source &&
                      !employmentSources.some(
                        (s) => s.label === data.tabs.main.source,
                      ) ? (
                        <option value={data.tabs.main.source}>
                          {data.tabs.main.source}
                        </option>
                      ) : null}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Вид занятости *</label>
                    <select
                      name="employmentKind"
                      className={styles.input}
                      defaultValue={
                        data.tabs.main.employmentKind ||
                        'Основное место работы'
                      }
                    >
                      <option>Основное место работы</option>
                      <option>Внутреннее совместительство</option>
                      <option>Внешнее совместительство</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {tab === 'payroll' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Оклад</label>
                    <input
                      name="baseSalary"
                      type="number"
                      step="0.01"
                      className={styles.input}
                      defaultValue={
                        data.tabs.payroll.baseSalary != null
                          ? String(data.tabs.payroll.baseSalary)
                          : ''
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Тип оплаты</label>
                    <input
                      name="paymentType"
                      className={styles.input}
                      defaultValue={data.tabs.payroll.paymentType || ''}
                    />
                  </div>
                </div>
              ) : null}

              {tab === 'vacation' ? (
                <div className={styles.tableWrap}>
                  <div className={styles.historyTop}>
                    <span />
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={addVacRow}
                    >
                      + Строка
                    </button>
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Период</th>
                        <th>Тип отпуска</th>
                        <th>Лимит дней</th>
                        <th>Использовано</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {vacRows.length === 0 ? (
                        <tr>
                          <td className={styles.empty} colSpan={5}>
                            нет данных — добавьте строку
                          </td>
                        </tr>
                      ) : (
                        vacRows.map((v, idx) => (
                          <tr key={`vac-edit-${idx}`}>
                            <td>
                              <input
                                name={`vac_period_${idx}`}
                                className={styles.input}
                                defaultValue={v.period}
                              />
                            </td>
                            <td>
                              <input
                                name={`vac_type_${idx}`}
                                className={styles.input}
                                defaultValue={v.vacationType}
                              />
                            </td>
                            <td>
                              <input
                                name={`vac_limit_${idx}`}
                                type="number"
                                className={styles.input}
                                defaultValue={v.limitDays}
                              />
                            </td>
                            <td>
                              <input
                                name={`vac_used_${idx}`}
                                type="number"
                                className={styles.input}
                                defaultValue={v.usedDays}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={() =>
                                  setVacRows((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'contract' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Номер договора</label>
                    <input
                      name="contractNumber"
                      className={styles.input}
                      defaultValue={data.tabs.contract.number || ''}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Дата договора</label>
                    <input
                      name="contractDate"
                      type="date"
                      className={styles.input}
                      defaultValue={toInputDate(data.tabs.contract.date)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Дата начала</label>
                    <input
                      name="contractStart"
                      type="date"
                      className={styles.input}
                      defaultValue={toInputDate(data.tabs.contract.startDate)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Дата истечения</label>
                    <input
                      name="contractEnd"
                      type="date"
                      className={styles.input}
                      defaultValue={toInputDate(data.tabs.contract.endDate)}
                    />
                  </div>
                </div>
              ) : null}

              {tab === 'files' ? (
                <div>
                  <div className={styles.historyTop}>
                    <label className={styles.btnGhost} style={{ cursor: 'pointer' }}>
                      {uploading ? 'Загрузка…' : 'Прикрепить файл'}
                      <input
                        type="file"
                        hidden
                        multiple
                        disabled={uploading || busy}
                        onChange={(e) => {
                          void onUploadFile(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Имя</th>
                          <th>Размер</th>
                          <th>Загружен</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {files.length === 0 ? (
                          <tr>
                            <td className={styles.empty} colSpan={4}>
                              Файлы не прикреплены
                            </td>
                          </tr>
                        ) : (
                          files.map((f) => (
                            <tr key={f.id}>
                              <td>
                                {f.url ? (
                                  <a href={f.url} target="_blank" rel="noreferrer">
                                    {f.name}
                                  </a>
                                ) : (
                                  f.name
                                )}
                              </td>
                              <td>
                                {f.size
                                  ? `${Math.round(f.size / 1024)} КБ`
                                  : '—'}
                              </td>
                              <td>{fmtDateTime(f.uploadedAt)}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  disabled={busy}
                                  onClick={() => onDeleteFile(f.id)}
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
                </div>
              ) : null}
            </form>
          ) : (
            <>
              <h2 className={styles.mainTitle}>Основная информация</h2>
              <div className={styles.metaGrid}>
                <div className={styles.field}>
                  <label>Дата</label>
                  <div className={styles.fieldValue}>
                    {fmtDate(data.documentDate)}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Номер</label>
                  <div className={styles.fieldValue}>{data.number || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Создал</label>
                  <div className={styles.fieldValue}>
                    {data.postedBy || '—'}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Изменил</label>
                  <div className={styles.fieldValue}>
                    {data.postedBy || '—'}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Сотрудник</label>
                  <div className={styles.fieldValue}>
                    {data.employee.fullName}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Табельный номер</label>
                  <div className={styles.fieldValue}>
                    {data.employee.tabNumber}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Дата создания</label>
                  <div className={styles.fieldValue}>
                    {fmtDateTime(data.createdAt)}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Дата изменения</label>
                  <div className={styles.fieldValue}>
                    {fmtDateTime(data.updatedAt)}
                  </div>
                </div>
              </div>

              <div className={styles.tabs}>
                {(
                  [
                    ['main', 'Основная информация'],
                    ['payroll', 'Оплата труда'],
                    ['vacation', 'Лимит отпуска'],
                    ['contract', 'Трудовой договор'],
                    ['files', 'Файлы'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.tab} ${
                      tab === k ? styles.tabActive : ''
                    }`}
                    onClick={() => setTab(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'main' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Дата приема на работу</label>
                    <div className={styles.fieldValue}>
                      {fmtDate(data.tabs.main.hireDate)}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Испыт. срок</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.probation || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>График работы</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.schedule
                        ? `${data.tabs.main.schedule.startTime}-${data.tabs.main.schedule.endTime} · ${data.tabs.main.schedule.name}`
                        : '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Подразделение</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.division?.name || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Должность</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.position?.name || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Откуда пришел</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.source || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Позиция</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.staffPositionLabel || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Вид занятости</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.employmentKind}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Название документа</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.documentName || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Разряд</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.main.grade?.name || '—'}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'payroll' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Оклад</label>
                    <div className={styles.fieldValue}>
                      {fmtMoney(data.tabs.payroll.baseSalary)}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип оплаты</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.payroll.paymentType || '—'}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'vacation' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Период</th>
                        <th>Тип отпуска</th>
                        <th>Лимит дней</th>
                        <th>Использовано дней</th>
                        <th>Осталось дней</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tabs.vacationLimit.length === 0 ? (
                        <tr>
                          <td className={styles.empty} colSpan={5}>
                            нет данных
                          </td>
                        </tr>
                      ) : (
                        data.tabs.vacationLimit.map((v) => (
                          <tr key={`${v.period}-${v.vacationType}`}>
                            <td>{v.period}</td>
                            <td>{v.vacationType}</td>
                            <td>{v.limitDays}</td>
                            <td>{v.usedDays}</td>
                            <td>{v.remainingDays}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === 'contract' ? (
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Номер договора</label>
                    <div className={styles.fieldValue}>
                      {data.tabs.contract.number || '—'}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата</label>
                    <div className={styles.fieldValue}>
                      {fmtDate(data.tabs.contract.date)}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата начала</label>
                    <div className={styles.fieldValue}>
                      {fmtDate(data.tabs.contract.startDate)}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Дата истечения</label>
                    <div className={styles.fieldValue}>
                      {fmtDate(data.tabs.contract.endDate)}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === 'files' ? (
                <div>
                  {!data.synthetic && data.status !== 'cancelled' ? (
                    <div className={styles.historyTop}>
                      <label
                        className={styles.btnGhost}
                        style={{ cursor: 'pointer' }}
                      >
                        {uploading ? 'Загрузка…' : 'Прикрепить файл'}
                        <input
                          type="file"
                          hidden
                          multiple
                          disabled={uploading || busy}
                          onChange={(e) => {
                            void onUploadFile(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Имя</th>
                          <th>Размер</th>
                          <th>Загружен</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {files.length === 0 ? (
                          <tr>
                            <td className={styles.empty} colSpan={4}>
                              Файлы не прикреплены
                            </td>
                          </tr>
                        ) : (
                          files.map((f) => (
                            <tr key={f.id}>
                              <td>
                                {f.url ? (
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {f.name}
                                  </a>
                                ) : (
                                  f.name
                                )}
                              </td>
                              <td>
                                {f.size
                                  ? `${Math.round(f.size / 1024)} КБ`
                                  : '—'}
                              </td>
                              <td>{fmtDateTime(f.uploadedAt)}</td>
                              <td>
                                {!data.synthetic &&
                                data.status !== 'cancelled' ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    disabled={busy}
                                    onClick={() => onDeleteFile(f.id)}
                                  >
                                    Удалить
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {confirmCancel ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal} role="dialog" aria-modal="true">
            <p>
              Отменить документ № {data.number || '—'} от{' '}
              {fmtDate(data.documentDate)}?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalYes}
                disabled={busy}
                onClick={cancelDoc}
              >
                Да
              </button>
              <button
                type="button"
                className={styles.modalNo}
                disabled={busy}
                onClick={() => setConfirmCancel(false)}
              >
                Нет
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EmployeeDocumentViewPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Загрузка…</p>}>
      <EmployeeDocumentViewInner />
    </Suspense>
  );
}
