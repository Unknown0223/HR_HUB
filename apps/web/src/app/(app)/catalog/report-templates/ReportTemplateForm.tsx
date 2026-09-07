'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Row = {
  id: string;
  code: string;
  name: string;
  kind?: string | null;
  source?: string | null;
  sourceType?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  templateGroup?: string | null;
  templateType?: string | null;
  sortOrder?: number | null;
  useNameInReport?: boolean | null;
  createdBy?: string | null;
  definition?: { variables?: string[]; [k: string]: unknown } | null;
  isActive?: boolean;
};

const SOURCE_SUGGESTIONS = [
  'Трудовой договор',
  'Приказ об увольнении',
  'Приказ об увольнении списком',
  'Приказ о кадровом переводе',
  'Приказ о кадровом переводе списком',
  'Приказ о приеме на работу',
  'Приказ о приеме на работу списком',
  'Табель учёта',
];

const GROUP_SUGGESTIONS = ['Кадры', 'Посещения', 'Зарплата', 'Отчёты', 'Общие'];

const DEFAULT_VARS = [
  'fullName',
  'tabNumber',
  'position',
  'division',
  'hireDate',
  'salary',
  'orgName',
  'period',
];

export function ReportTemplateFormModal({
  open,
  onClose,
  onSaved,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
}) {
  const isEdit = Boolean(editId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [templateGroup, setTemplateGroup] = useState('');
  const [templateType, setTemplateType] = useState<'excel' | 'word'>('excel');
  const [sortOrder, setSortOrder] = useState('');
  const [useNameInReport, setUseNameInReport] = useState(true);
  const [active, setActive] = useState(true);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [kind, setKind] = useState('document');
  const [variables, setVariables] = useState<string[]>([]);
  const [varQuery, setVarQuery] = useState('');
  const [newVar, setNewVar] = useState('');
  const [sourceType, setSourceType] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setDragOver(false);
    setVarQuery('');
    setNewVar('');
    if (!editId) {
      setSource('');
      setName('');
      setCode('');
      setTemplateGroup('');
      setTemplateType('excel');
      setSortOrder('');
      setUseNameInReport(true);
      setActive(true);
      setFileName('');
      setFileUrl('');
      setKind('document');
      setVariables([]);
      setSourceType('');
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<Row>(`/api/catalog/report-templates/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setSource(row.source || '');
        setSourceType(row.sourceType || '');
        setTemplateGroup(row.templateGroup || '');
        setTemplateType(row.templateType === 'word' ? 'word' : 'excel');
        setSortOrder(
          row.sortOrder != null && row.sortOrder !== 0 ? String(row.sortOrder) : '',
        );
        setUseNameInReport(row.useNameInReport !== false);
        setActive(row.isActive !== false);
        setFileName(row.fileName || '');
        setFileUrl(row.fileUrl || '');
        setKind(row.kind || 'document');
        const vars = row.definition?.variables;
        setVariables(Array.isArray(vars) ? vars.map(String) : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  const filteredVars = useMemo(() => {
    const q = varQuery.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter((v) => v.toLowerCase().includes(q));
  }, [variables, varQuery]);

  const catalogVars = useMemo(() => {
    const q = varQuery.trim().toLowerCase();
    return DEFAULT_VARS.filter(
      (v) => !variables.includes(v) && (!q || v.toLowerCase().includes(q)),
    );
  }, [variables, varQuery]);

  function applyFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) setTemplateType('word');
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) setTemplateType('excel');
    setFileUrl('');
  }

  function addVariable(v: string) {
    const n = v.trim();
    if (!n || variables.includes(n)) return;
    setVariables((prev) => [...prev, n]);
    setNewVar('');
  }

  async function save() {
    if (!source.trim()) {
      setError('Укажите источник');
      return;
    }
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!fileName.trim()) {
      setError('Прикрепите файл шаблона');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const generatedCode =
        code.trim() ||
        name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 32) ||
        `TPL_${Date.now().toString(36).toUpperCase()}`;

      const body = {
        name: name.trim(),
        code: generatedCode,
        kind: kind || 'document',
        source: source.trim(),
        sourceType: sourceType.trim() || null,
        templateGroup: templateGroup.trim() || null,
        templateType,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        useNameInReport,
        isActive: active,
        fileName: fileName.trim(),
        fileUrl: fileUrl || null,
        createdBy: isEdit ? undefined : 'System',
        definition: { variables },
      };

      if (isEdit && editId) {
        await apiFetch(`/api/catalog/report-templates/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<Row>('/api/catalog/report-templates', {
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
      title={isEdit ? 'Шаблон отчета (изменение)' : 'Шаблон отчета (создание)'}
      onClose={onClose}
      width="xl"
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
        <div className={styles.layout}>
          <div className={styles.card}>
            <div className={styles.field}>
              <label>
                Источник <span className={styles.req}>*</span>
              </label>
              <input
                list="rt-sources"
                value={source}
                placeholder="Поиск..."
                onChange={(e) => setSource(e.target.value)}
              />
              <datalist id="rt-sources">
                {SOURCE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className={styles.field}>
              <label>
                Название <span className={styles.req}>*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label>Группа шаблонов</label>
              <input
                list="rt-groups"
                value={templateGroup}
                placeholder="Поиск..."
                onChange={(e) => setTemplateGroup(e.target.value)}
              />
              <datalist id="rt-groups">
                {GROUP_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Тип шаблона</span>
              <div className={styles.typeRow}>
                <button
                  type="button"
                  className={templateType === 'excel' ? styles.typeBtnOn : styles.typeBtn}
                  onClick={() => setTemplateType('excel')}
                >
                  Excel
                </button>
                <button
                  type="button"
                  className={templateType === 'word' ? styles.typeBtnOn : styles.typeBtn}
                  onClick={() => setTemplateType('word')}
                >
                  Word
                </button>
              </div>
            </div>

            <div className={`${styles.field} ${styles.sortField}`}>
              <label>Порядковый номер</label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
              />
            </div>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={useNameInReport}
                onChange={(e) => setUseNameInReport(e.target.checked)}
              />
              Использовать название шаблона в генерируемом отчете
            </label>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Активный
            </label>

            <div className={styles.field}>
              <label>
                Файл шаблона <span className={styles.req}>*</span>
              </label>
              <input
                ref={fileRef}
                className={styles.hiddenFile}
                type="file"
                accept=".xlsx,.xls,.docx,.doc"
                onChange={(e) => applyFile(e.target.files?.[0] || null)}
              />
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  applyFile(e.dataTransfer.files?.[0] || null);
                }}
              >
                {fileName ? (
                  <>
                    <span className={styles.fileName}>{fileName}</span>
                    <span className={styles.dropHint}>
                      Нажмите или перетащите, чтобы заменить
                    </span>
                  </>
                ) : (
                  <>
                    <span>Перетащите файл сюда или кликните для выбора файла</span>
                    <span className={styles.dropHint}>.xlsx / .xls / .docx / .doc</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Переменные</h2>
            <input
              className={styles.varSearch}
              placeholder="Поиск..."
              value={varQuery}
              onChange={(e) => setVarQuery(e.target.value)}
            />

            {filteredVars.length === 0 && catalogVars.length === 0 ? (
              <p className={styles.varEmpty}>
                Нет переменных. Добавьте или выберите из списка.
              </p>
            ) : (
              <ul className={styles.varList}>
                {filteredVars.map((v) => (
                  <li key={v} className={styles.varItem}>
                    <span>{`{{${v}}}`}</span>
                    <button
                      type="button"
                      onClick={() => setVariables((prev) => prev.filter((x) => x !== v))}
                    >
                      Убрать
                    </button>
                  </li>
                ))}
                {catalogVars.map((v) => (
                  <li
                    key={`c-${v}`}
                    className={styles.varItem}
                    style={{ background: '#fff', border: '1px dashed #e5e7eb' }}
                  >
                    <span style={{ color: '#7e8299' }}>{`{{${v}}}`}</span>
                    <button
                      type="button"
                      style={{ color: '#0a85e2' }}
                      onClick={() => addVariable(v)}
                    >
                      Добавить
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.addVar}>
              <input
                placeholder="Новая переменная"
                value={newVar}
                onChange={(e) => setNewVar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addVariable(newVar);
                  }
                }}
              />
              <button type="button" onClick={() => addVariable(newVar)}>
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </FormModal>
  );
}
