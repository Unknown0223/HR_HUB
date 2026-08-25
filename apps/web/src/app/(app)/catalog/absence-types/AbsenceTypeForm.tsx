'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type TimeOpt = { id: string; code: string; name: string };

type AbsenceType = {
  id: string;
  code: string;
  name: string;
  calcKind: string;
  description?: string | null;
  accrualName?: string | null;
  timeTypeId?: string | null;
  paid: boolean;
  isActive: boolean;
  allowEmployeeRequest: boolean;
  trackUnusedTime: boolean;
  requestTimeLimit: boolean;
  providedIn: string;
  isAnnual: boolean;
  daysPerYear?: number | null;
  limitDays?: number | null;
  monthlyQtyLimit: boolean;
  monthlyHourLimit: boolean;
  carryoverPolicy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  timeType?: TimeOpt | null;
};

export function AbsenceTypeForm({
  typeId,
  mode = 'edit',
}: {
  typeId?: string;
  mode?: 'edit' | 'view';
}) {
  const router = useRouter();
  const isNew = !typeId;
  const readOnly = mode === 'view';
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [timeTypes, setTimeTypes] = useState<TimeOpt[]>([]);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [timeTypeId, setTimeTypeId] = useState('');
  const [allowReq, setAllowReq] = useState(true);
  const [trackUnused, setTrackUnused] = useState(false);
  const [reqLimit, setReqLimit] = useState(false);
  const [providedIn, setProvidedIn] = useState('working');
  const [isAnnual, setIsAnnual] = useState(false);
  const [active, setActive] = useState(true);
  const [daysPerYear, setDaysPerYear] = useState('');
  const [limitDays, setLimitDays] = useState('');
  const [monthlyQty, setMonthlyQty] = useState(false);
  const [monthlyHour, setMonthlyHour] = useState(false);
  const [carryover, setCarryover] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    apiFetch<TimeOpt[] | { items?: TimeOpt[] }>('/api/catalog/time-types')
      .then((d) => setTimeTypes(Array.isArray(d) ? d : d.items || []))
      .catch(() => setTimeTypes([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<AbsenceType>(`/api/hr/absence-types/${typeId}`)
      .then((row) => {
        setName(row.name);
        setCode(row.code || '');
        setTimeTypeId(row.timeTypeId || '');
        setAllowReq(row.allowEmployeeRequest !== false);
        setTrackUnused(!!row.trackUnusedTime);
        setReqLimit(!!row.requestTimeLimit);
        setProvidedIn(row.providedIn || 'working');
        setIsAnnual(!!row.isAnnual);
        setActive(row.isActive !== false);
        setDaysPerYear(row.daysPerYear != null ? String(row.daysPerYear) : '');
        setLimitDays(row.limitDays != null ? String(row.limitDays) : '');
        setMonthlyQty(!!row.monthlyQtyLimit);
        setMonthlyHour(!!row.monthlyHourLimit);
        setCarryover(row.carryoverPolicy || '');
        setCreatedAt(row.createdAt || '');
        setUpdatedAt(row.updatedAt || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [typeId, isNew]);

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setBusy(true);
    setError('');
    setOk('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || undefined,
        timeTypeId: timeTypeId || null,
        allowEmployeeRequest: allowReq,
        trackUnusedTime: trackUnused,
        requestTimeLimit: reqLimit,
        providedIn,
        isAnnual,
        isActive: active,
        calcKind: isAnnual ? 'annual' : 'one_time',
        daysPerYear: daysPerYear ? Number(daysPerYear) : null,
        limitDays: limitDays ? Number(limitDays) : null,
        monthlyQtyLimit: monthlyQty,
        monthlyHourLimit: monthlyHour,
        carryoverPolicy: carryover || null,
      };
      if (isNew) {
        const created = await apiFetch<AbsenceType>('/api/hr/absence-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.replace(`/catalog/absence-types/${created.id}`);
      } else {
        await apiFetch(`/api/hr/absence-types/${typeId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setOk('Сохранено');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className={styles.muted}>Загрузка…</p>;

  const title = isNew
    ? 'Вид отсутствия (создание)'
    : readOnly
      ? 'Вид отсутствия (просмотр)'
      : 'Вид отсутствия (изменение)';

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          {readOnly ? (
            <Link href={`/catalog/absence-types/${typeId}/edit`} className={styles.btnSave}>
              Изменить
            </Link>
          ) : (
            <button type="button" className={styles.btnSave} disabled={busy} onClick={() => void save()}>
              Сохранить
            </button>
          )}
          <Link href="/catalog/absence-types" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {readOnly ? (
        <div className={styles.layout}>
          <aside className={styles.side}>
            <h2 className={styles.sideTitle}>
              {name} {code ? `(${code})` : ''}
            </h2>
            <span className={active ? styles.badgeOk : styles.badgeMuted}>
              {active ? 'Активный' : 'Неактивный'}
            </span>
            <nav className={styles.sideNav}>
              <span className={styles.sideLinkActive}>Основная информация</span>
              {typeId ? (
                <Link
                  href={`/catalog/absence-types/${typeId}/employees`}
                  className={styles.sideLink}
                >
                  Сотрудники
                </Link>
              ) : (
                <span className={styles.sideLink}>Сотрудники</span>
              )}
              <span className={styles.sideLink}>История изменений</span>
            </nav>
          </aside>
          <div className={styles.main}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Название</label>
                <div className={styles.fieldValue}>{name}</div>
              </div>
              <div className={styles.field}>
                <label>Вид времени</label>
                <div className={styles.fieldValue}>
                  {timeTypes.find((t) => t.id === timeTypeId)?.name || '—'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Разрешить сотрудникам создавать запрос</label>
                <div className={styles.fieldValue}>{allowReq ? 'Да' : 'Нет'}</div>
              </div>
              <div className={styles.field}>
                <label>Учитывать неиспользованное время</label>
                <div className={styles.fieldValue}>{trackUnused ? 'Да' : 'Нет'}</div>
              </div>
              <div className={styles.field}>
                <label>Количество дней в год</label>
                <div className={styles.fieldValue}>{daysPerYear || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Количество дней ограничения</label>
                <div className={styles.fieldValue}>{limitDays || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Предоставляется</label>
                <div className={styles.fieldValue}>
                  {providedIn === 'calendar'
                    ? 'В календарных днях'
                    : providedIn === 'production'
                      ? 'В производственных днях'
                      : 'В рабочие дни'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Политика переноса</label>
                <div className={styles.fieldValue}>{carryover || '—'}</div>
              </div>
              <div className={styles.field}>
                <label>Дата создания</label>
                <div className={styles.fieldValue}>
                  {createdAt ? new Date(createdAt).toLocaleString('ru-RU') : '—'}
                </div>
              </div>
              <div className={styles.field}>
                <label>Дата изменения</label>
                <div className={styles.fieldValue}>
                  {updatedAt ? new Date(updatedAt).toLocaleString('ru-RU') : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.formLayout}>
          <div className={styles.col}>
            <div className={styles.field}>
              <label>
                Название <span className={styles.req}>*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {!isNew ? (
              <div className={styles.field}>
                <label>Код</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            ) : null}
            <div className={styles.field}>
              <label>
                Вид времени <span className={styles.req}>*</span>
              </label>
              <select value={timeTypeId} onChange={(e) => setTimeTypeId(e.target.value)}>
                <option value="">—</option>
                {timeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={allowReq}
                onChange={(e) => setAllowReq(e.target.checked)}
              />
              Разрешить сотрудникам создавать запрос на данный вид отсутствия
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={trackUnused}
                onChange={(e) => setTrackUnused(e.target.checked)}
              />
              Учитывать неиспользованное время
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={reqLimit}
                onChange={(e) => setReqLimit(e.target.checked)}
              />
              Ограничение времени запроса
            </label>
            <div className={styles.field}>
              <label>Предоставляется</label>
              <div className={styles.radioRow}>
                {(
                  [
                    ['calendar', 'В календарных днях'],
                    ['working', 'В рабочие дни'],
                    ['production', 'В производственных днях'],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className={styles.radio}>
                    <input
                      type="radio"
                      checked={providedIn === v}
                      onChange={() => setProvidedIn(v)}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={isAnnual}
                onChange={(e) => setIsAnnual(e.target.checked)}
              />
              Является ежегодным
            </label>
            <div className={styles.statusBlock}>
              <span className={styles.fieldLabel}>Статус</span>
              <label className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggle} ${active ? styles.toggleOn : ''}`}
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                />
                <span>Активный</span>
              </label>
            </div>
          </div>
          <div className={styles.col}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={monthlyQty}
                onChange={(e) => setMonthlyQty(e.target.checked)}
              />
              Связан с лимитом количества
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={monthlyHour}
                onChange={(e) => setMonthlyHour(e.target.checked)}
              />
              Связан с лимитом часов
            </label>
            <div className={styles.field}>
              <label>Количество дней в год</label>
              <input value={daysPerYear} onChange={(e) => setDaysPerYear(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Количество дней ограничения</label>
              <input value={limitDays} onChange={(e) => setLimitDays(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Политика переноса</label>
              <input value={carryover} onChange={(e) => setCarryover(e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
