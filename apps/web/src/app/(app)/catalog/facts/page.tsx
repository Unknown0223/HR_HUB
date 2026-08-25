'use client';

import { confirm } from '@/lib/dialogs';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';
import form from './facts.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
};

type Division = { id: string; code: string; name: string };
type FactType = { id: string; code: string; name: string };

type FactRow = {
  id: string;
  value: string;
  factDate: string;
  employmentSource?: string | null;
  status: string;
  employee?: Emp | null;
  division?: Division | null;
  factType?: FactType | null;
};

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return String(iso);
  }
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function FactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<FactRow[]>([]);
  const [types, setTypes] = useState<FactType[]>([]);
  const [employees, setEmployees] = useState<(Emp & { divisionId?: string })[]>(
    [],
  );
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [factDate, setFactDate] = useState(todayInput());
  const [employeeId, setEmployeeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [factTypeId, setFactTypeId] = useState('');
  const [value, setValue] = useState('');

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [
        empName(r.employee),
        r.division?.name,
        r.factType?.name,
        r.value,
        r.employmentSource,
        r.status,
        fmtDate(r.factDate),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [facts, ft, emps, divs] = await Promise.all([
        apiFetch<FactRow[] | { items: FactRow[] }>('/api/catalog/facts'),
        apiFetch<FactType[] | { items: FactType[] }>('/api/catalog/fact-types'),
        apiFetch<{ items?: Emp[] } | Emp[]>(
          '/api/employees?status=active&limit=500',
        ),
        apiFetch<Division[] | { items?: Division[] }>('/api/catalog/divisions'),
      ]);
      setRows(Array.isArray(facts) ? facts : facts.items || []);
      setTypes(Array.isArray(ft) ? ft : ft.items || []);
      const el = Array.isArray(emps)
        ? emps
        : Array.isArray((emps as { items?: Emp[] }).items)
          ? (emps as { items: Emp[] }).items
          : [];
      setEmployees(el as (Emp & { divisionId?: string })[]);
      setDivisions(Array.isArray(divs) ? divs : divs.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/facts?${qs}` : '/catalog/facts', {
      scroll: false,
    });
  }

  function openCreate() {
    setFactDate(todayInput());
    setEmployeeId('');
    setDivisionId('');
    setFactTypeId('');
    setValue('');
    setModal(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!employeeId || !factTypeId || !value.trim() || !factDate) {
      setError('Заполните обязательные поля');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let div = divisionId;
      if (!div) {
        const emp = employees.find((x) => x.id === employeeId);
        if (emp?.divisionId) div = emp.divisionId;
      }
      await apiFetch('/api/catalog/facts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          divisionId: div || null,
          factTypeId,
          value: value.trim(),
          factDate,
          status: 'active',
        }),
      });
      setModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(ids: string[]) {
    if (!ids.length) return;
    if (!(await confirm(`Удалить факты (${ids.length})?`))) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await apiFetch(`/api/catalog/facts/${id}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `facts-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Сотрудник: empName(r.employee),
        Подразделение: r.division?.name || '',
        Тип: r.factType?.name || '',
        'Значение факта': r.value,
        Дата: fmtDate(r.factDate),
        'Источник занятости': r.employmentSource || '',
        Статус: r.status === 'active' ? 'Активный' : r.status,
      })),
    );
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="facts" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            style={{ background: '#3699ff' }}
            onClick={openCreate}
          >
            Создать
          </button>
          <Link
            href="/catalog/facts/import"
            className={styles.exportBtn}
            style={{
              background: '#1bc5bd',
              color: '#fff',
              border: 'none',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Импорт
          </Link>
          <button
            type="button"
            className={styles.exportBtn}
            style={{ background: '#1bc5bd', color: '#fff', border: 'none' }}
            onClick={() => router.push('/catalog/facts/import')}
          >
            Загрузить
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              style={{
                background: '#f64e60',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontWeight: 700,
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                padding: '0.5rem 0.9rem',
                cursor: 'pointer',
              }}
              disabled={busy}
              onClick={() => void runDelete([...selected])}
            >
              Удалить {selected.size}
            </button>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '2rem' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => {
                    if (allChecked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((r) => r.id)));
                  }}
                />
              </th>
              <th>Сотрудник</th>
              <th>Подразделение</th>
              <th>Тип</th>
              <th>Значение факта</th>
              <th>Дата</th>
              <th>Источник занятости</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => {
                      setSelected((prev) => {
                        const n = new Set(prev);
                        if (n.has(row.id)) n.delete(row.id);
                        else n.add(row.id);
                        return n;
                      });
                    }}
                  />
                </td>
                <td>{empName(row.employee)}</td>
                <td>{row.division?.name || ''}</td>
                <td>{row.factType?.name || ''}</td>
                <td>{row.value}</td>
                <td>{fmtDate(row.factDate)}</td>
                <td>{row.employmentSource || ''}</td>
                <td>
                  <span className={styles.statusActive}>
                    {row.status === 'active' ? 'Активный' : row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className={form.overlay} onClick={() => setModal(false)}>
          <div className={form.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={form.modalTitle}>Добавить факт</h2>
            <form className={form.modalBody} onSubmit={onSave}>
              <label>
                Дата <span className={form.req}>*</span>
                <input
                  type="date"
                  required
                  value={factDate}
                  onChange={(e) => setFactDate(e.target.value)}
                />
              </label>
              <label>
                Сотрудник <span className={form.req}>*</span>
                <select
                  required
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    const emp = employees.find((x) => x.id === e.target.value);
                    if (emp?.divisionId) setDivisionId(emp.divisionId);
                  }}
                >
                  <option value="">Поиск...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {empName(e)}
                      {e.tabNumber ? ` (${e.tabNumber})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Подразделение
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Тип факта <span className={form.req}>*</span>
                <select
                  required
                  value={factTypeId}
                  onChange={(e) => setFactTypeId(e.target.value)}
                >
                  <option value="">Поиск...</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Значение факта <span className={form.req}>*</span>
                <input
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <div className={form.modalFooter}>
                <button type="submit" className={form.btnSave} disabled={saving}>
                  {saving ? '…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className={form.btnClose}
                  onClick={() => setModal(false)}
                >
                  Закрыть
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function FactsPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <FactsPageInner />
    </Suspense>
  );
}
