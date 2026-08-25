'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type EmpRow = {
  id: string;
  assignmentId?: string;
  employeeId: string;
  tabNumber: string;
  fullName: string;
  hiredAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  accrued: number;
  used: number;
  remaining: number;
  accrualKind: string;
  attached: boolean;
};

type Payload = {
  absenceType: {
    id: string;
    code: string;
    name: string;
    calcKind: string;
    daysPerYear?: number | null;
    limitDays?: number | null;
  };
  scope: string;
  accrualKind: string;
  items: EmpRow[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function EmployeesInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeId = String(params?.id || '');
  const scope = searchParams.get('scope') === 'available' ? 'available' : 'attached';
  const accrualKind =
    searchParams.get('accrualKind') === 'carryover' ? 'carryover' : 'planned';

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  async function load() {
    if (!typeId) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('scope', scope);
      qs.set('accrualKind', accrualKind);
      if (search.trim()) qs.set('q', search.trim());
      const res = await apiFetch<Payload>(
        `/api/hr/absence-types/${typeId}/employees?${qs}`,
      );
      setData(res);
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, scope, accrualKind]);

  const items = data?.items || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.tabNumber, r.fullName].join(' ').toLowerCase().includes(q),
    );
  }, [items, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.employeeId));
  const someChecked = filtered.some((r) => checked.has(r.employeeId));
  const selectedIds = useMemo(() => [...checked], [checked]);

  function setQuery(next: { scope?: string; accrualKind?: string }) {
    const p = new URLSearchParams(searchParams.toString());
    if (next.scope === 'available') p.set('scope', 'available');
    else if (next.scope === 'attached') p.delete('scope');
    if (next.accrualKind === 'carryover') p.set('accrualKind', 'carryover');
    else if (next.accrualKind === 'planned') p.delete('accrualKind');
    const qs = p.toString();
    router.replace(
      qs
        ? `/catalog/absence-types/${typeId}/employees?${qs}`
        : `/catalog/absence-types/${typeId}/employees`,
    );
  }

  function toggleAll() {
    if (allChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.employeeId));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.employeeId));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: 'attach' | 'detach') {
    if (!selectedIds.length) return;
    const label = action === 'attach' ? 'Прикрепить' : 'Открепить';
    if (!(await confirm(`${label} выбранных сотрудников (${selectedIds.length})?`))) {
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiFetch(`/api/hr/absence-types/${typeId}/employees/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          employeeIds: selectedIds,
          accrualKind,
        }),
      });
      setInfo(`${label}: ${selectedIds.length}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const typeName = data?.absenceType?.name || '…';

  return (
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Вид отсутствия (сотрудники)',
          siblings: [
            { label: 'Виды отсутствий', href: '/catalog/absence-types' },
            {
              label: 'Карточка вида',
              href: `/catalog/absence-types/${typeId}`,
            },
          ],
        }}
        titleOverride={`Вид отсутствия (сотрудники)${typeName !== '…' ? `: ${typeName}` : ''}`}
      />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.scopeTabs}>
            <button
              type="button"
              className={scope === 'attached' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setQuery({ scope: 'attached' })}
            >
              Прикрепленные
            </button>
            <button
              type="button"
              className={scope === 'available' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setQuery({ scope: 'available' })}
            >
              Доступные
            </button>
          </div>
          <Link href="/catalog/absence-types" className={styles.closeBtn}>
            Закрыть
          </Link>
          {selectedIds.length > 0 ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>Выбрано: {selectedIds.length}</span>
              {scope === 'available' ? (
                <button
                  type="button"
                  className={styles.bulkOk}
                  disabled={busy}
                  onClick={() => void runBulk('attach')}
                >
                  Прикрепить
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.bulkDanger}
                  disabled={busy}
                  onClick={() => void runBulk('detach')}
                >
                  Открепить
                </button>
              )}
              <button
                type="button"
                className={styles.bulkClear}
                onClick={() => setChecked(new Set())}
              >
                Снять
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.rightTools}>
          <label className={styles.accrualLabel}>
            Вид начисления
            <select
              className={styles.accrualSelect}
              value={accrualKind}
              onChange={(e) =>
                setQuery({
                  accrualKind: e.target.value === 'carryover' ? 'carryover' : 'planned',
                })
              }
            >
              <option value="planned">Плановое</option>
              <option value="carryover">Перенос</option>
            </select>
          </label>
          <div className={styles.radioRow}>
            <label>
              <input
                type="radio"
                name="accrual"
                checked={accrualKind === 'planned'}
                onChange={() => setQuery({ accrualKind: 'planned' })}
              />{' '}
              Плановое
            </label>
            <label>
              <input
                type="radio"
                name="accrual"
                checked={accrualKind === 'carryover'}
                onChange={() => setQuery({ accrualKind: 'carryover' })}
              />{' '}
              Перенос
            </label>
          </div>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            ↻
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length}/{items.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={toggleAll}
                  disabled={!filtered.length}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Табельный номер</th>
              <th>ФИО</th>
              <th>Дата приема на работу</th>
              <th>Начало</th>
              <th>Конец</th>
              <th>Начислено</th>
              <th>Использовано</th>
              <th>Осталось</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const isChecked = checked.has(row.employeeId);
              return (
                <tr
                  key={row.assignmentId || row.employeeId}
                  className={isChecked ? styles.rowSelected : undefined}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(row.employeeId)}
                    />
                  </td>
                  <td>{row.tabNumber}</td>
                  <td>{row.fullName}</td>
                  <td>{fmtDate(row.hiredAt)}</td>
                  <td>{fmtDate(row.periodStart)}</td>
                  <td>{fmtDate(row.periodEnd)}</td>
                  <td>{row.accrued}</td>
                  <td>{row.used}</td>
                  <td>{row.remaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AbsenceTypeEmployeesPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <EmployeesInner />
    </Suspense>
  );
}
