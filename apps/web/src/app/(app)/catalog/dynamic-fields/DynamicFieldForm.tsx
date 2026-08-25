'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  DYNAMIC_FIELD_TYPES,
  isReferenceDataType,
  isSelectDataType,
  type DynamicFieldDataType,
} from '@/lib/dynamic-field-types';
import styles from './form.module.css';

type Row = {
  id: string;
  code: string;
  name: string;
  dataType: string;
  referenceSource?: string | null;
  objectCode?: string | null;
  options?: unknown;
  isActive?: boolean;
};

type DictOpt = { code: string; name: string };

export function DynamicFieldForm({ fieldId }: { fieldId?: string }) {
  const router = useRouter();
  const isNew = !fieldId;

  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [dataType, setDataType] = useState<DynamicFieldDataType>('string');
  const [referenceSource, setReferenceSource] = useState('');
  const [objectCode, setObjectCode] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [active, setActive] = useState(true);
  const [dicts, setDicts] = useState<DictOpt[]>([]);
  const [objects, setObjects] = useState<DictOpt[]>([]);

  useEffect(() => {
    apiFetch<{ code: string; name: string; kind?: string }[] | DictOpt[]>(
      '/api/settings/dictionaries',
    )
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setDicts(
          list.map((x) => ({
            code: String((x as { code: string }).code || ''),
            name: String((x as { name: string }).name || ''),
          })).filter((x) => x.code),
        );
      })
      .catch(() => setDicts([]));

    apiFetch<{ code: string; name: string }[] | { items?: { code: string; name: string }[] }>(
      '/api/catalog/dynamic-objects',
    )
      .then((d) => {
        const list = Array.isArray(d)
          ? d
          : Array.isArray((d as { items?: { code: string; name: string }[] }).items)
            ? (d as { items: { code: string; name: string }[] }).items
            : [];
        setObjects(
          list.map((x) => ({
            code: x.code,
            name: x.name,
          })),
        );
      })
      .catch(() => setObjects([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<Row>(`/api/catalog/dynamic-fields/${fieldId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setDataType((row.dataType as DynamicFieldDataType) || 'string');
        setReferenceSource(row.referenceSource || '');
        setObjectCode(row.objectCode || '');
        setActive(row.isActive !== false);
        if (Array.isArray(row.options)) {
          setOptionsText(
            row.options
              .map((o) =>
                typeof o === 'string'
                  ? o
                  : o && typeof o === 'object' && 'name' in o
                    ? String((o as { name: string }).name)
                    : String(o),
              )
              .join('\n'),
          );
        } else {
          setOptionsText('');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [fieldId, isNew]);

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!code.trim()) {
      setError('Укажите код');
      return;
    }
    if (isReferenceDataType(dataType) && !referenceSource.trim()) {
      setError('Укажите reference source');
      return;
    }
    setBusy(true);
    setError('');
    setOk('');
    try {
      const options = isSelectDataType(dataType)
        ? optionsText
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
      const body = {
        name: name.trim(),
        code: code.trim(),
        dataType,
        referenceSource: isReferenceDataType(dataType)
          ? referenceSource.trim()
          : null,
        objectCode: objectCode.trim() || null,
        options,
        isActive: active,
      };
      if (isNew) {
        await apiFetch('/api/catalog/dynamic-fields', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push('/catalog/dynamic-fields');
      } else {
        await apiFetch(`/api/catalog/dynamic-fields/${fieldId}`, {
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

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>
          {isNew ? 'Динамическое поле (создание)' : 'Динамическое поле (изменение)'}
        </h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSave}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <Link href="/catalog/dynamic-fields" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div className={styles.card}>
        <div className={styles.field}>
          <label>
            Название <span className={styles.req}>*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <span className={styles.fieldLabel}>
            Тип данных <span className={styles.req}>*</span>
          </span>
          <div className={styles.typeList} role="radiogroup" aria-label="Тип данных">
            {DYNAMIC_FIELD_TYPES.map((t) => {
              const on = dataType === t.value;
              return (
                <label
                  key={t.value}
                  className={`${styles.typeOption} ${on ? styles.typeOptionOn : ''}`}
                >
                  <input
                    type="radio"
                    name="dataType"
                    checked={on}
                    onChange={() => setDataType(t.value)}
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </div>

        {isReferenceDataType(dataType) ? (
          <div className={styles.field}>
            <label>
              reference source <span className={styles.req}>*</span>
            </label>
            <input
              list="df-ref-sources"
              value={referenceSource}
              placeholder="Поиск..."
              onChange={(e) => setReferenceSource(e.target.value)}
            />
            <datalist id="df-ref-sources">
              {dicts.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </datalist>
          </div>
        ) : null}

        {isSelectDataType(dataType) ? (
          <div className={styles.field}>
            <label>Варианты списка</label>
            <textarea
              className={styles.optionsArea}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Один вариант на строку"
            />
            <p className={styles.optionsHint}>Через новую строку или запятую</p>
          </div>
        ) : null}

        <div className={styles.field}>
          <label>
            Код <span className={styles.req}>*</span>
          </label>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Объект</label>
          <select value={objectCode} onChange={(e) => setObjectCode(e.target.value)}>
            <option value="">— не привязан —</option>
            {objects.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
        </div>

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
    </div>
  );
}
