'use client';
import { confirm } from '@/lib/dialogs';

import { useRouter } from 'next/navigation';
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiDownload, apiFetch } from '@/lib/api';
import { mapMatrixToObjects, parseXlsxFile } from '@/lib/parse-xlsx';
import shared from '../../../page-shared.module.css';
import styles from './import.module.css';

type View = 'import' | 'settings';

type ColumnKey =
  | 'name'
  | 'code'
  | 'parent'
  | 'group'
  | 'schedule'
  | 'manager'
  | 'openedAt'
  | 'closedAt'
  | 'project';

type ColumnMap = Record<ColumnKey, number>;

type StagingRow = Record<ColumnKey, string> & {
  _id: string;
  _excelRow: number;
};

type RowError = { id: string; excelRow: number; message: string };

type ImportApiResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const SETTINGS_KEY = 'hrhub_division_import_settings';

const FIELD_LABELS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Название подразделения' },
  { key: 'code', label: 'Код' },
  { key: 'parent', label: 'Родитель' },
  { key: 'group', label: 'Группа подразделений' },
  { key: 'schedule', label: 'График работы' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'openedAt', label: 'Дата открытия' },
  { key: 'closedAt', label: 'Дата закрытия' },
  { key: 'project', label: 'Проект' },
];

const EDIT_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Название' },
  { key: 'parent', label: 'Родитель' },
  { key: 'code', label: 'Код' },
  { key: 'group', label: 'Группа подразделений' },
  { key: 'schedule', label: 'График работы' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'openedAt', label: 'Дата открытия' },
  { key: 'closedAt', label: 'Дата закрытия' },
  { key: 'project', label: 'Проект' },
];

const DEFAULT_MAP: ColumnMap = {
  name: 1,
  code: 2,
  parent: 3,
  group: 4,
  schedule: 5,
  manager: 6,
  openedAt: 7,
  closedAt: 8,
  project: 9,
};

function loadSettings(): { map: ColumnMap; startRow: number } {
  if (typeof window === 'undefined') return { map: DEFAULT_MAP, startRow: 2 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { map: { ...DEFAULT_MAP }, startRow: 2 };
    const parsed = JSON.parse(raw) as { map?: Partial<ColumnMap>; startRow?: number };
    return {
      map: { ...DEFAULT_MAP, ...(parsed.map || {}) },
      startRow: Math.max(1, Number(parsed.startRow) || 2),
    };
  } catch {
    return { map: { ...DEFAULT_MAP }, startRow: 2 };
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyRow(excelRow: number): StagingRow {
  return {
    _id: uid(),
    _excelRow: excelRow,
    name: '',
    code: '',
    parent: '',
    group: '',
    schedule: '',
    manager: '',
    openedAt: '',
    closedAt: '',
    project: '',
  };
}

function validateStaging(
  rows: StagingRow[],
  existingCodes: Set<string>,
): RowError[] {
  const errs: RowError[] = [];
  const seenCodes = new Map<string, string>();

  rows.forEach((row) => {
    if (!row.name.trim()) {
      errs.push({
        id: row._id,
        excelRow: row._excelRow,
        message: 'Название подразделения обязательно',
      });
    }
    const code = row.code.trim();
    if (code) {
      const lower = code.toLowerCase();
      if (existingCodes.has(lower)) {
        errs.push({
          id: row._id,
          excelRow: row._excelRow,
          message: `Код «${code}» уже есть в системе`,
        });
      }
      const prev = seenCodes.get(lower);
      if (prev) {
        errs.push({
          id: row._id,
          excelRow: row._excelRow,
          message: `Дубликат кода «${code}» в файле`,
        });
      } else {
        seenCodes.set(lower, row._id);
      }
    }
  });

  return errs;
}

export default function DivisionImportPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('import');
  const [map, setMap] = useState<ColumnMap>(DEFAULT_MAP);
  const [startRow, setStartRow] = useState(2);
  const [file, setFile] = useState<File | null>(null);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [localErrors, setLocalErrors] = useState<RowError[]>([]);
  const [checked, setChecked] = useState(false);
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [apiResult, setApiResult] = useState<ImportApiResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errQ, setErrQ] = useState('');
  const [dataQ, setDataQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const dirty = staging.length > 0;

  useEffect(() => {
    const s = loadSettings();
    setMap(s.map);
    setStartRow(s.startRow);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const divs = await apiFetch<{ code: string }[]>('/api/organization/divisions');
        setExistingCodes(
          new Set(
            (Array.isArray(divs) ? divs : [])
              .map((d) => (d.code || '').trim().toLowerCase())
              .filter(Boolean),
          ),
        );
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const runLocalValidate = useCallback(
    (rows: StagingRow[]) => {
      const errs = validateStaging(rows, existingCodes);
      setLocalErrors(errs);
      setChecked(true);
      return errs;
    },
    [existingCodes],
  );

  const loadFromFile = useCallback(
    async (f: File, columnMap: ColumnMap, start: number) => {
      setError('');
      setApiResult(null);
      setChecked(false);
      try {
        const { rows } = await parseXlsxFile(f);
        const objects = mapMatrixToObjects(rows, columnMap, start);
        const next: StagingRow[] = objects.map((obj, i) => ({
          _id: uid(),
          _excelRow: start + i,
          name: obj.name || '',
          code: obj.code || '',
          parent: obj.parent || '',
          group: obj.group || '',
          schedule: obj.schedule || '',
          manager: obj.manager || '',
          openedAt: obj.openedAt || '',
          closedAt: obj.closedAt || '',
          project: obj.project || '',
        }));
        setStaging(next);
        setLocalErrors(validateStaging(next, existingCodes));
        setChecked(true);
        if (!next.length) {
          setError('В файле нет строк данных (проверьте начальную строку)');
        }
      } catch (e) {
        setStaging([]);
        setLocalErrors([]);
        setError(e instanceof Error ? e.message : 'Ошибка чтения Excel');
      }
    },
    [existingCodes],
  );

  async function onPickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    await loadFromFile(f, map, startRow);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    void onPickFile(f);
    e.target.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    void onPickFile(f);
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ map, startRow }));
    if (file) void loadFromFile(file, map, startRow);
    setView('import');
  }

  async function downloadTemplate() {
    setTplBusy(true);
    setError('');
    try {
      await apiDownload(
        '/api/organization/divisions/import/template.xlsx',
        'import-divisions-template.xlsx',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка скачивания шаблона');
    } finally {
      setTplBusy(false);
    }
  }

  function updateCell(id: string, key: ColumnKey, value: string) {
    setStaging((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [key]: value } : r)),
    );
    setChecked(false);
    setApiResult(null);
  }

  function removeRow(id: string) {
    setStaging((prev) => prev.filter((r) => r._id !== id));
    setLocalErrors((prev) => prev.filter((e) => e.id !== id));
    setChecked(false);
    setApiResult(null);
  }

  function addRow() {
    setStaging((prev) => {
      const maxExcel = prev.reduce((m, r) => Math.max(m, r._excelRow), startRow - 1);
      return [...prev, emptyRow(maxExcel + 1)];
    });
    setChecked(false);
    setApiResult(null);
  }

  async function cancelStaging() {
    if (dirty && !await confirm('Отменить виртуальные данные? Изменения не будут импортированы.')) {
      return;
    }
    setFile(null);
    setStaging([]);
    setLocalErrors([]);
    setChecked(false);
    setApiResult(null);
    setError('');
    setDataQ('');
    setErrQ('');
  }

  function checkData() {
    if (!staging.length) {
      setError('Нет данных для проверки — загрузите файл');
      return;
    }
    setError('');
    setApiResult(null);
    const errs = runLocalValidate(staging);
    if (!errs.length) {
      setError('');
    }
  }

  async function commitImport() {
    if (!staging.length) {
      setError('Нет данных для импорта — загрузите файл');
      return;
    }
    const errs = runLocalValidate(staging);
    const blocking = errs.filter(
      (e) =>
        e.message.includes('обязательно') || e.message.includes('Дубликат кода'),
    );
    if (blocking.length) {
      setError('Исправьте ошибки в таблице, затем повторите импорт');
      return;
    }
    if (
      errs.length &&
      !await confirm(
        `Есть предупреждения (${errs.length}). Всё равно импортировать? Строки с существующими кодами будут пропущены.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setApiResult(null);
    try {
      const rows = staging.map(({ _id, _excelRow, ...rest }) => rest);
      const data = await apiFetch<ImportApiResult>('/api/organization/divisions/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setApiResult(data);
      if (data.errors?.length) {
        setLocalErrors(
          data.errors.map((e, i) => ({
            id: staging[e.row - 1]?._id || `api-${i}`,
            excelRow: staging[e.row - 1]?._excelRow ?? e.row,
            message: e.message,
          })),
        );
      } else {
        setLocalErrors([]);
      }
      if (data.created > 0 && (!data.errors || data.errors.length === 0)) {
        setStaging([]);
        setFile(null);
        setChecked(false);
        // refresh existing codes
        const divs = await apiFetch<{ code: string }[]>('/api/organization/divisions');
        setExistingCodes(
          new Set(
            (Array.isArray(divs) ? divs : [])
              .map((d) => (d.code || '').trim().toLowerCase())
              .filter(Boolean),
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  }

  const errorIds = useMemo(() => new Set(localErrors.map((e) => e.id)), [localErrors]);

  const filteredErrors = useMemo(() => {
    const q = errQ.trim().toLowerCase();
    if (!q) return localErrors;
    return localErrors.filter(
      (e) =>
        String(e.excelRow).includes(q) || e.message.toLowerCase().includes(q),
    );
  }, [localErrors, errQ]);

  const filteredStaging = useMemo(() => {
    const q = dataQ.trim().toLowerCase();
    if (!q) return staging;
    return staging.filter((r) =>
      [r.name, r.code, r.parent, r.group, r.schedule, r.manager, r.project]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [staging, dataQ]);

  const canCommit = staging.length > 0 && !busy;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="divisions-import" />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={view === 'import' ? styles.btnActive : shared.btnGhost}
          onClick={() => setView('import')}
        >
          Импорт
        </button>
        <button
          type="button"
          className={view === 'settings' ? styles.btnActive : shared.btnGhost}
          onClick={() => setView('settings')}
        >
          Настройки
        </button>
        <button
          type="button"
          className={styles.btnBlue}
          disabled={tplBusy}
          onClick={() => void downloadTemplate()}
        >
          {tplBusy ? '…' : 'Шаблон'}
        </button>
        {view === 'import' ? (
          <>
            <button
              type="button"
              className={styles.btnBlue}
              disabled={!staging.length || busy}
              onClick={checkData}
            >
              Проверить
            </button>
            <button
              type="button"
              className={styles.btnActive}
              disabled={!canCommit}
              onClick={() => void commitImport()}
            >
              {busy ? 'Импорт…' : 'Загрузить'}
            </button>
            <button
              type="button"
              className={shared.btnGhost}
              disabled={!dirty || busy}
              onClick={cancelStaging}
            >
              Отмена
            </button>
          </>
        ) : (
          <button type="button" className={styles.btnBlue} onClick={saveSettings}>
            Сохранить
          </button>
        )}
        <button
          type="button"
          className={shared.btnGhost}
          onClick={async () => {
            if (dirty && !await confirm('Есть несохранённые виртуальные данные. Закрыть?')) {
              return;
            }
            router.push('/divisions?tab=divisions');
          }}
        >
          Закрыть
        </button>
      </div>

      {view === 'import' && dirty ? (
        <div className={styles.stagingHint}>
          Виртуальный черновик: {staging.length} строк(и). Правьте таблицу, нажмите
          «Проверить», затем «Загрузить» — только тогда данные попадут в базу. «Отмена»
          сбрасывает черновик.
          {checked ? (
            <span>
              {' '}
              · Проверка: {localErrors.length ? `${localErrors.length} замечаний` : 'ошибок нет'}
            </span>
          ) : (
            <span> · Изменения не проверены</span>
          )}
        </div>
      ) : null}

      {error ? <p className={shared.error}>{error}</p> : null}
      {apiResult ? (
        <div className={apiResult.errors?.length ? styles.resultErr : styles.resultOk}>
          Создано: {apiResult.created}, пропущено: {apiResult.skipped}
          {apiResult.errors?.length ? `, ошибок: ${apiResult.errors.length}` : ''}
          {apiResult.created > 0 && !apiResult.errors?.length
            ? ' — импорт завершён'
            : ''}
        </div>
      ) : null}

      {view === 'settings' ? (
        <div className={styles.settingsLayout}>
          <table className={styles.mapTable}>
            <thead>
              <tr>
                <th>Поле</th>
                <th>Номер столбца</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_LABELS.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={map[f.key]}
                      onChange={(e) =>
                        setMap((m) => ({
                          ...m,
                          [f.key]: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.startField}>
            <label htmlFor="startRow">Начальная строка</label>
            <input
              id="startRow"
              type="number"
              min={1}
              value={startRow}
              onChange={(e) => setStartRow(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.topGrid}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Файл</h2>
              <div
                className={[styles.drop, dragOver ? styles.dropActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                }}
              >
                Перетащите файл сюда или кликните для выбора файла
              </div>
              <input
                ref={inputRef}
                className={styles.fileInput}
                type="file"
                accept=".xlsx,.xls"
                onChange={onInputChange}
              />
              {file ? <div className={styles.fileName}>{file.name}</div> : null}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Ошибки / замечания</h2>
              <div className={styles.searchRow}>
                <input
                  placeholder="Поиск..."
                  value={errQ}
                  onChange={(e) => setErrQ(e.target.value)}
                />
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Строка</th>
                      <th>Ошибки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredErrors.length ? (
                      filteredErrors.map((e, i) => (
                        <tr key={`${e.id}-${i}`}>
                          <td>{e.excelRow}</td>
                          <td>{e.message}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className={styles.emptyCell}>
                          Нет данных
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.dataHeader}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                Данные (виртуальная таблица)
              </h2>
              <div className={styles.dataActions}>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={busy}
                  onClick={addRow}
                >
                  + Строка
                </button>
              </div>
            </div>
            <div className={styles.searchRow}>
              <input
                placeholder="Поиск..."
                value={dataQ}
                onChange={(e) => setDataQ(e.target.value)}
              />
            </div>
            <div className={styles.tableWrap} style={{ maxHeight: 420 }}>
              <table className={styles.editTable}>
                <thead>
                  <tr>
                    <th>№</th>
                    {EDIT_COLUMNS.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredStaging.length ? (
                    filteredStaging.map((r, i) => {
                      const hasErr = errorIds.has(r._id);
                      return (
                        <tr
                          key={r._id}
                          className={hasErr ? styles.rowError : undefined}
                        >
                          <td className={styles.numCell}>{i + 1}</td>
                          {EDIT_COLUMNS.map((c) => (
                            <td key={c.key}>
                              <input
                                className={styles.cellInput}
                                value={r[c.key]}
                                onChange={(e) =>
                                  updateCell(r._id, c.key, e.target.value)
                                }
                                placeholder="—"
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className={styles.rowDel}
                              title="Удалить строку"
                              onClick={() => removeRow(r._id)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={EDIT_COLUMNS.length + 2}
                        className={styles.emptyCell}
                      >
                        Нет данных — загрузите Excel, чтобы увидеть виртуальную таблицу
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
