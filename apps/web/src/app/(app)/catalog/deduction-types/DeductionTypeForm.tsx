'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { DeductionTypeRow } from './page';
import styles from './form.module.css';

const PURPOSES = [
  'Штраф',
  'Алименты',
  'Займ',
  'Подотчёт',
  'Налог',
  'Прочее',
];

const ACCOUNTS = [
  '6710 — Расчёты с персоналом по оплате труда',
  '6520 — Расчёты по социальному страхованию',
  '6410 — Расчёты по налогам',
  '6850 — Прочие обязательства',
];

type Props = {
  mode: 'create' | 'edit' | 'view';
  id?: string;
};

export function DeductionTypeForm({ mode, id }: Props) {
  const router = useRouter();
  const readOnly = mode === 'view';

  const [tab, setTab] = useState<'main' | 'tax' | 'desc'>('main');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode !== 'create');

  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [active, setActive] = useState(true);

  const [purpose, setPurpose] = useState('');
  const [periodCalc, setPeriodCalc] = useState('period');
  const [resultMode, setResultMode] = useState('formula');
  const [formula, setFormula] = useState('');

  const [accountingMode, setAccountingMode] = useState('employee');
  const [account, setAccount] = useState('');

  const [shortName, setShortName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!id || mode === 'create') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<DeductionTypeRow>(
          `/api/catalog/deduction-types/${id}`,
        );
        if (cancelled) return;
        setName(row.name || '');
        setSortOrder(String(row.sortOrder ?? 0));
        setActive(row.isActive !== false);
        setPurpose(row.purpose || '');
        setPeriodCalc(row.periodCalc || 'period');
        setResultMode(row.resultMode || 'formula');
        setFormula(row.formula || '');
        setAccountingMode(row.accountingMode || 'employee');
        setAccount(row.account || '');
        setShortName(row.shortName || '');
        setCode(row.code || '');
        setDescription(row.description || '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (accountingMode === 'operation' && !account.trim()) {
      setError('Укажите счет');
      setTab('tax');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      name: name.trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive: active,
      purpose: purpose.trim() || null,
      periodCalc,
      resultMode,
      formula: resultMode === 'formula' ? formula.trim() || null : null,
      accountingMode,
      account: accountingMode === 'operation' ? account.trim() : null,
      shortName: shortName.trim() || null,
      code: code.trim(),
      description: description.trim() || null,
    };
    try {
      if (mode === 'edit' && id) {
        await apiFetch(`/api/catalog/deduction-types/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/deduction-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      router.push('/catalog/deduction-types');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === 'create'
      ? 'Удержание (создание)'
      : mode === 'edit'
        ? 'Удержание (изменение)'
        : 'Удержание';

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>Загрузка…</p>
      </div>
    );
  }

  return (
    <form className={styles.page} onSubmit={(e) => void onSave(e)}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          {!readOnly ? (
            <button type="submit" className={styles.btnSave} disabled={saving}>
              Сохранить
            </button>
          ) : (
            <Link
              href={`/catalog/deduction-types/${id}/edit`}
              className={styles.btnSave}
            >
              Изменить
            </Link>
          )}
          <Link href="/catalog/deduction-types" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.card}>
        <div className={styles.headRow}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label>
              Название <span className={styles.req}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              required
            />
          </div>
          <div className={styles.statusBlock}>
            <span className={styles.fieldLabel}>Статус</span>
            <label className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggle} ${active ? styles.toggleOn : ''}`}
                disabled={readOnly}
                onClick={() => setActive((v) => !v)}
                aria-pressed={active}
              />
              <span>Активный</span>
            </label>
          </div>
        </div>

        <div className={styles.field} style={{ maxWidth: 220 }}>
          <label>Порядковый номер</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={tab === 'main' ? styles.tabOn : styles.tab}
            onClick={() => setTab('main')}
          >
            Основное
          </button>
          <button
            type="button"
            className={tab === 'tax' ? styles.tabOn : styles.tab}
            onClick={() => setTab('tax')}
          >
            Налоги, взносы, бух.учет
          </button>
          <button
            type="button"
            className={tab === 'desc' ? styles.tabOn : styles.tab}
            onClick={() => setTab('desc')}
          >
            Описание
          </button>
        </div>

        {tab === 'main' ? (
          <div className={styles.mainGrid}>
            <div className={styles.col}>
              <div className={styles.field}>
                <label>Назначение начисления</label>
                <input
                  list="deduction-purposes"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  disabled={readOnly}
                  placeholder="Поиск..."
                />
                <datalist id="deduction-purposes">
                  {PURPOSES.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <fieldset className={styles.fieldset} disabled={readOnly}>
                <legend>Тип расчета за период</legend>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="periodCalc"
                    checked={periodCalc === 'period'}
                    onChange={() => setPeriodCalc('period')}
                  />
                  формула рассчитывается на период
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="periodCalc"
                    checked={periodCalc === 'day'}
                    onChange={() => setPeriodCalc('day')}
                  />
                  формула рассчитывается за каждый день отдельно
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="periodCalc"
                    checked={periodCalc === 'shift'}
                    onChange={() => setPeriodCalc('shift')}
                  />
                  формула рассчитывается за каждую смену отдельно
                </label>
              </fieldset>
            </div>

            <div className={styles.col}>
              <fieldset className={styles.fieldset} disabled={readOnly}>
                <legend>Расчет и показатели</legend>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="resultMode"
                    checked={resultMode === 'formula'}
                    onChange={() => setResultMode('formula')}
                  />
                  Результат рассчитывается по формуле
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="resultMode"
                    checked={resultMode === 'fixed'}
                    onChange={() => setResultMode('fixed')}
                  />
                  Результат вводится фиксированной суммой
                </label>
              </fieldset>

              {resultMode === 'formula' ? (
                <div className={styles.field}>
                  <label>Формула</label>
                  <textarea
                    rows={5}
                    value={formula}
                    onChange={(e) => setFormula(e.target.value)}
                    disabled={readOnly}
                  />
                  {!readOnly ? (
                    <button type="button" className={styles.formulaLink}>
                      ✎ Изменить формулу
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'tax' ? (
          <div className={styles.taxGrid}>
            <div className={styles.col}>
              <fieldset className={styles.fieldset} disabled={readOnly}>
                <legend>Бухгалтерский учет</legend>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="accountingMode"
                    checked={accountingMode === 'employee'}
                    onChange={() => setAccountingMode('employee')}
                  />
                  Как задано для сотрудника
                </label>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="accountingMode"
                    checked={accountingMode === 'operation'}
                    onChange={() => setAccountingMode('operation')}
                  />
                  Как задано для типа операции
                </label>
              </fieldset>

              {accountingMode === 'operation' ? (
                <div className={styles.field}>
                  <label>
                    Счет <span className={styles.req}>*</span>
                  </label>
                  <input
                    list="deduction-accounts"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    disabled={readOnly}
                    placeholder="Поиск..."
                    required
                  />
                  <datalist id="deduction-accounts">
                    {ACCOUNTS.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'desc' ? (
          <div className={styles.reflectGrid}>
            <div className={styles.field}>
              <label>Краткое название</label>
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className={styles.field}>
              <label>Код</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className={`${styles.field} ${styles.full}`}>
              <label>Описание</label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}
