'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import {
  DYNAMIC_FIELD_TYPES,
  isReferenceDataType,
  isSelectDataType,
  type DynamicFieldDataType,
} from '@/lib/dynamic-field-types';
import styles from './DynamicFieldFormModal.module.css';

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

export function DynamicFieldFormModal({
  open,
  onClose,
  onSaved,
  editId,
  defaultObjectCode,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
  defaultObjectCode?: string;
}) {
  const isEdit = Boolean(editId);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    if (!open) return;
    apiFetch<{ code: string; name: string }[] | DictOpt[]>(
      '/api/settings/dictionaries',
    )
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setDicts(
          list
            .map((x) => ({
              code: String((x as { code: string }).code || ''),
              name: String((x as { name: string }).name || ''),
            }))
            .filter((x) => x.code),
        );
      })
      .catch(() => setDicts([]));

    apiFetch<
      | { code: string; name: string }[]
      | { items?: { code: string; name: string }[] }
    >('/api/catalog/dynamic-objects')
      .then((d) => {
        const list = Array.isArray(d)
          ? d
          : Array.isArray((d as { items?: { code: string; name: string }[] }).items)
            ? (d as { items: { code: string; name: string }[] }).items
            : [];
        setObjects(list.map((x) => ({ code: x.code, name: x.name })));
      })
      .catch(() => setObjects([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setDataType('string');
      setReferenceSource('');
      setObjectCode(defaultObjectCode || '');
      setOptionsText('');
      setActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<Row>(`/api/catalog/dynamic-fields/${editId}`)
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId, defaultObjectCode]);

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
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/dynamic-fields/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<Row>('/api/catalog/dynamic-fields', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        onSaved(created?.id || '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title={
        isEdit
          ? 'Динамическое поле (изменение)'
          : 'Динамическое поле (создание)'
      }
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className={modal.field}>
            <span>
              Тип данных <em className={modal.req}>*</em>
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
            <label className={modal.field}>
              <span>
                reference source <em className={modal.req}>*</em>
              </span>
              <input
                list="df-ref-sources-modal"
                value={referenceSource}
                placeholder="Поиск..."
                onChange={(e) => setReferenceSource(e.target.value)}
              />
              <datalist id="df-ref-sources-modal">
                {dicts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </datalist>
            </label>
          ) : null}

          {isSelectDataType(dataType) ? (
            <label className={modal.field}>
              <span>Варианты списка</span>
              <textarea
                className={styles.optionsArea}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Один вариант на строку"
              />
              <span className={styles.hint}>Через новую строку или запятую</span>
            </label>
          ) : null}

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Код <em className={modal.req}>*</em>
              </span>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className={modal.field}>
              <span>Объект</span>
              <select
                value={objectCode}
                onChange={(e) => setObjectCode(e.target.value)}
              >
                <option value="">— не привязан —</option>
                {objects.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Активный
            </label>
          </div>
        </div>
      )}
    </FormModal>
  );
}
