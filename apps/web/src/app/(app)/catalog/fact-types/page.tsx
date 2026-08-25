'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';
import formStyles from '../report-templates/form.module.css';

type FactTypeRow = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  parentId?: string | null;
  accrualName?: string | null;
  registry?: RegistryLine[] | null;
  isActive?: boolean;
  parent?: { id: string; name: string } | null;
};

type RegistryLine = {
  id?: string;
  startDate?: string;
  endDate?: string;
  cycleTime?: string;
  price?: string;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

function FactTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<FactTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  // form
  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Количество');
  const [parentId, setParentId] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // registry modal
  const [registryFor, setRegistryFor] = useState<FactTypeRow | null>(null);
  const [registryLines, setRegistryLines] = useState<RegistryLine[]>([]);
  const [regSaving, setRegSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.unit, r.parent?.name]
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
      const data = await apiFetch<FactTypeRow[] | { items: FactTypeRow[] }>(
        '/api/catalog/fact-types',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditId(null);
    setName('');
    setCode('');
    setUnit('Количество');
    setParentId('');
    setAccrualName('');
    setActive(true);
    setMode('create');
  }

  function openEdit(row: FactTypeRow) {
    setEditId(row.id);
    setName(row.name);
    setCode(row.code);
    setUnit(row.unit || 'Количество');
    setParentId(row.parentId || '');
    setAccrualName(row.accrualName || '');
    setActive(row.isActive !== false);
    setMode('edit');
  }

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!unit.trim()) {
      setError('Укажите единицу измерения');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code:
          code.trim() ||
          name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
            .slice(0, 32),
        unit: unit.trim(),
        parentId: parentId || null,
        accrualName: accrualName.trim() || null,
        isActive: active,
      };
      if (editId) {
        await apiFetch(`/api/catalog/fact-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/fact-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMode('none');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(row: FactTypeRow) {
    if (!(await confirm(`Удалить тип «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/fact-types/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function openRegistry(row: FactTypeRow) {
    const lines = Array.isArray(row.registry) ? row.registry : [];
    setRegistryFor(row);
    setRegistryLines(
      lines.length
        ? lines.map((l) => ({ ...l, id: l.id || uid() }))
        : [{ id: uid(), startDate: '', endDate: '', cycleTime: '', price: '' }],
    );
  }

  async function saveRegistry() {
    if (!registryFor) return;
    setRegSaving(true);
    setError('');
    try {
      const registry = registryLines
        .filter((l) => l.startDate || l.endDate || l.cycleTime || l.price)
        .map(({ startDate, endDate, cycleTime, price }) => ({
          startDate: startDate || null,
          endDate: endDate || null,
          cycleTime: cycleTime || null,
          price: price || null,
        }));
      await apiFetch(`/api/catalog/fact-types/${registryFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ registry }),
      });
      setRegistryFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRegSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="fact-types" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const params = new URLSearchParams();
                if (searchDraft.trim()) params.set('q', searchDraft.trim());
                const qs = params.toString();
                router.replace(
                  qs ? `/catalog/fact-types?${qs}` : '/catalog/fact-types',
                  { scroll: false },
                );
              }
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {mode !== 'none' ? (
        <div className={formStyles.page}>
          <div className={formStyles.topBar}>
            <h1 className={formStyles.title}>
              {mode === 'edit' ? 'Тип факта (изменение)' : 'Тип факта (создание)'}
            </h1>
            <div className={formStyles.actions}>
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
                onClick={() => setMode('none')}
              >
                Закрыть
              </button>
            </div>
          </div>
          <div className={formStyles.card} style={{ maxWidth: 900 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.75rem',
              }}
            >
              <div className={formStyles.field}>
                <label>
                  Название <span className={formStyles.req}>*</span>
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className={formStyles.field}>
                <label>Код</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className={formStyles.field}>
                <label>
                  Единица измерения <span className={formStyles.req}>*</span>
                </label>
                <input
                  list="units"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Поиск..."
                />
                <datalist id="units">
                  <option value="Количество" />
                  <option value="Сумма" />
                  <option value="Часы" />
                  <option value="%" />
                </datalist>
              </div>
              <div className={formStyles.field}>
                <label>Родитель</label>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">Поиск...</option>
                  {rows
                    .filter((r) => r.id !== editId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className={formStyles.field}>
                <label>Начисление</label>
                <input
                  value={accrualName}
                  onChange={(e) => setAccrualName(e.target.value)}
                  placeholder="Поиск..."
                />
              </div>
              <div className={formStyles.statusBlock}>
                <span className={formStyles.fieldLabel}>Статус</span>
                <label className={formStyles.toggleRow}>
                  <button
                    type="button"
                    className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                    onClick={() => setActive((v) => !v)}
                  />
                  <span>Активный</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Название типа родителя</th>
              <th>Единица измерения</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = focusId === row.id;
              return (
                <tr
                  key={row.id}
                  className={open ? styles.rowSelected : undefined}
                  onClick={() => setFocusId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={styles.nameCell}>
                    <span className={styles.nameText}>{row.name}</span>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button type="button" onClick={() => openRegistry(row)}>
                          Реестр
                        </button>
                        <button type="button" onClick={() => openEdit(row)}>
                          Изменить
                        </button>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => void runDelete(row)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.parent?.name || ''}</td>
                  <td>{row.unit || 'Количество'}</td>
                  <td>
                    <span
                      className={
                        row.isActive === false ? styles.statusMuted : styles.statusActive
                      }
                    >
                      {row.isActive === false ? 'Неактивный' : 'Активный'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {registryFor ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem',
          }}
          onClick={() => setRegistryFor(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              width: 'min(720px,100%)',
              padding: '1rem 1.1rem',
              boxShadow: '0 16px 48px rgba(15,23,42,.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
              Реестр — {registryFor.name}
            </h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата начала</th>
                  <th>Дата окончания</th>
                  <th>Время цикла</th>
                  <th>Цена</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registryLines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <input
                        type="date"
                        value={line.startDate || ''}
                        onChange={(e) =>
                          setRegistryLines((prev) =>
                            prev.map((x) =>
                              x.id === line.id
                                ? { ...x, startDate: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={line.endDate || ''}
                        onChange={(e) =>
                          setRegistryLines((prev) =>
                            prev.map((x) =>
                              x.id === line.id
                                ? { ...x, endDate: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={line.cycleTime || ''}
                        onChange={(e) =>
                          setRegistryLines((prev) =>
                            prev.map((x) =>
                              x.id === line.id
                                ? { ...x, cycleTime: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={line.price || ''}
                        onChange={(e) =>
                          setRegistryLines((prev) =>
                            prev.map((x) =>
                              x.id === line.id
                                ? { ...x, price: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() =>
                          setRegistryLines((prev) =>
                            prev.filter((x) => x.id !== line.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              style={{
                marginTop: 8,
                border: 'none',
                background: 'transparent',
                color: '#3699ff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() =>
                setRegistryLines((prev) => [
                  ...prev,
                  { id: uid(), startDate: '', endDate: '', cycleTime: '', price: '' },
                ])
              }
            >
              +
            </button>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                className={styles.createBtn}
                style={{ background: '#3699ff' }}
                disabled={regSaving}
                onClick={() => void saveRegistry()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={() => setRegistryFor(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function FactTypesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <FactTypesPageInner />
    </Suspense>
  );
}
