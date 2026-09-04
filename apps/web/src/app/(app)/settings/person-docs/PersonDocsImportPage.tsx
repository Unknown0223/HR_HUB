'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { parseXlsxFile } from '@/lib/parse-xlsx';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import {
  defaultPersonDocsImport,
  matrixToPersonDocItems,
  normalizePersonDocsImport,
  PERSON_DOC_FIELDS,
  type PersonDocFieldId,
  type PersonDocItem,
  type PersonDocsImportConfig,
  type PersonDocsImportResult,
} from '@/lib/person-docs';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import imp from '../../attendance/marks/import/page.module.css';
import ui from './page.module.css';

const PAGE_SIZE = 50;

function pageSlice<T>(rows: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  return {
    slice: rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    pageSafe,
    totalPages,
    total: rows.length,
  };
}

export function PersonDocsImportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'import' | 'settings'>('import');
  const [cfg, setCfg] = useState<PersonDocsImportConfig>(defaultPersonDocsImport());
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<PersonDocItem[]>([]);
  const [errors, setErrors] = useState<{ line: number; error: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [qData, setQData] = useState('');
  const [qErr, setQErr] = useState('');
  const [pageData, setPageData] = useState(1);
  const [pageErr, setPageErr] = useState(1);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  async function loadCfg() {
    try {
      setCfg(normalizePersonDocsImport(await apiFetch('/api/settings/person-docs-import')));
    } catch {
      setCfg(defaultPersonDocsImport());
    }
  }

  useEffect(() => {
    void loadCfg();
  }, []);

  async function onFile(f: File) {
    setFile(f);
    setError('');
    setInfo('');
    setErrors([]);
    try {
      const { rows } = await parseXlsxFile(f, ['Персональные документы', 'import']);
      const items = matrixToPersonDocItems(rows, cfg.fields, cfg.startRow);
      setPreview(items);
      setPageData(1);
      if (!items.length) setError('В файле нет строк данных (проверьте начальную строку)');
    } catch (e) {
      setPreview([]);
      setError(e instanceof Error ? e.message : 'Ошибка чтения файла');
    }
  }

  async function runImport() {
    if (!preview.length) {
      setError('Выберите файл');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<PersonDocsImportResult>('/api/settings/import-person-docs', {
        method: 'POST',
        body: JSON.stringify({ items: preview, personKey: cfg.personKey }),
      });
      setErrors(res.errors || []);
      setPageErr(1);
      setInfo(`Создано: ${res.created}, обновлено: ${res.updated}, ошибок: ${(res.errors || []).length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setError('');
    try {
      const next = normalizePersonDocsImport(
        await apiFetch('/api/settings/person-docs-import', {
          method: 'PATCH',
          body: JSON.stringify(cfg),
        }),
      );
      setCfg(next);
      setInfo('Настройки сохранены');
      setTab('import');
      if (file) await onFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    await downloadStyledXlsx({
      filename: 'Импорт-персональных-документов.xlsx',
      sheetName: 'Персональные документы',
      columns: PERSON_DOC_FIELDS.map((f) => f.label),
      rows: [
        [
          'Karimov Ali',
          'Паспорт',
          'AA',
          '1234567',
          'ОВД',
          '15.01.2020',
          '15.01.2020',
          '15.01.2030',
          'Да',
          'Новый',
          '',
        ],
      ],
      colWidths: [28, 22, 16, 18, 18, 16, 16, 16, 16, 16, 22],
    });
  }

  const filteredPreview = useMemo(() => {
    const s = qData.trim().toLowerCase();
    if (!s) return preview;
    return preview.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
  }, [preview, qData]);
  const filteredErrors = useMemo(() => {
    const s = qErr.trim().toLowerCase();
    if (!s) return errors;
    return errors.filter((e) => `${e.line} ${e.error}`.toLowerCase().includes(s));
  }, [errors, qErr]);

  const dataPage = pageSlice(filteredPreview, pageData);
  const errPage = pageSlice(filteredErrors, pageErr);

  function moveField(from: number, to: number) {
    if (from === to || to < 0 || to >= cfg.fields.length) return;
    setCfg((c) => {
      const fields = [...c.fields];
      const [x] = fields.splice(from, 1);
      fields.splice(to, 0, x);
      return { ...c, fields };
    });
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Импорт персональных документов', siblings: [] }} />
      <div className={imp.actions} style={{ marginBottom: '0.65rem' }}>
        <button
          type="button"
          className={tab === 'import' ? imp.btnPrimary : imp.btnGhost}
          disabled={busy}
          onClick={() => {
            if (tab !== 'import') {
              setTab('import');
              return;
            }
            void runImport();
          }}
        >
          {busy && tab === 'import' ? 'Импорт…' : 'Импорт'}
        </button>
        <button
          type="button"
          className={tab === 'settings' ? imp.btnPrimary : imp.btnGhost}
          onClick={() => setTab('settings')}
        >
          Настройки
        </button>
        {tab === 'import' ? (
          <button type="button" className={imp.btnBlue} onClick={() => void downloadTemplate()}>
            Шаблон
          </button>
        ) : (
          <button type="button" className={formStyles.btnSave} disabled={busy} onClick={() => void saveSettings()}>
            Сохранить
          </button>
        )}
        <button type="button" className={formStyles.btnClose} onClick={() => router.push('/settings?tab=admin')}>
          Закрыть
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={imp.info}>{info}</p> : null}

      {tab === 'settings' ? (
        <div className={imp.settings} style={{ gridTemplateColumns: 'minmax(280px, 1fr) 280px' }}>
          <div className={imp.mapList}>
            {cfg.fields.map((id, i) => {
              const label = PERSON_DOC_FIELDS.find((f) => f.id === id)?.label || id;
              return (
                <div
                  key={id}
                  className={ui.fieldBlock}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx != null) moveField(dragIdx, i);
                    setDragIdx(null);
                  }}
                >
                  <span>{label}</span>
                  <span className={ui.handle} aria-hidden>
                    ↕
                  </span>
                </div>
              );
            })}
          </div>
          <div className={ui.side}>
            <label className={imp.startRow}>
              Начальная строка
              <input
                type="number"
                min={1}
                value={cfg.startRow}
                onChange={(e) => setCfg((c) => ({ ...c, startRow: Number(e.target.value) || 2 }))}
              />
            </label>
            <div>
              Идентификатор физлица
              <label className={ui.radioRow}>
                <input
                  type="radio"
                  checked={cfg.personKey === 'fio'}
                  onChange={() => setCfg((c) => ({ ...c, personKey: 'fio' }))}
                />
                ФИО
              </label>
              <label className={ui.radioRow}>
                <input
                  type="radio"
                  checked={cfg.personKey === 'code'}
                  onChange={() => setCfg((c) => ({ ...c, personKey: 'code' }))}
                />
                Код
              </label>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={imp.topGrid}>
            <div className={imp.card}>
              <h2>Файл</h2>
              <button
                type="button"
                className={imp.drop}
                style={{
                  borderColor: drag ? '#0a85e2' : undefined,
                  background: drag ? '#eef6ff' : undefined,
                }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void onFile(f);
                }}
              >
                {file ? file.name : 'Перетащите файл сюда или кликните для выбора файла'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className={imp.card}>
              <div className={imp.cardHead}>
                <h2>Ошибки</h2>
                <input
                  placeholder="Поиск..."
                  value={qErr}
                  onChange={(e) => {
                    setQErr(e.target.value);
                    setPageErr(1);
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className={styles.toolBtn}
                  disabled={!filteredErrors.length}
                  onClick={() => downloadCsv('person-docs-errors', filteredErrors)}
                >
                  ↓
                </button>
                <span className={styles.pagerMeta}>
                  {errPage.total ? `${(errPage.pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(errPage.pageSafe * PAGE_SIZE, errPage.total)}` : '0'} / {errPage.total}
                </span>
                <button type="button" className={styles.pagerBtn} disabled={errPage.pageSafe <= 1} onClick={() => setPageErr((p) => p - 1)}>
                  ‹
                </button>
                <span className={styles.pagerMeta}>{errPage.pageSafe}</span>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  disabled={errPage.pageSafe >= errPage.totalPages}
                  onClick={() => setPageErr((p) => p + 1)}
                >
                  ›
                </button>
              </div>
              <div className={imp.tableScroll}>
                <table className={imp.table}>
                  <thead>
                    <tr>
                      <th>Строка</th>
                      <th>Ошибки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errPage.slice.length === 0 ? (
                      <tr>
                        <td className={imp.empty} colSpan={2}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      errPage.slice.map((e, i) => (
                        <tr key={`${e.line}-${i}`}>
                          <td>{e.line}</td>
                          <td>{e.error}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={imp.card}>
            <div className={imp.cardHead}>
              <h2>Данные</h2>
              <input
                placeholder="Поиск..."
                value={qData}
                onChange={(e) => {
                  setQData(e.target.value);
                  setPageData(1);
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className={styles.toolBtn}
                disabled={!filteredPreview.length}
                onClick={() => downloadCsv('person-docs-data', filteredPreview)}
              >
                ↓
              </button>
              <span className={styles.pagerMeta}>
                {dataPage.total ? `${(dataPage.pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(dataPage.pageSafe * PAGE_SIZE, dataPage.total)}` : '0'} / {dataPage.total}
              </span>
              <button type="button" className={styles.pagerBtn} disabled={dataPage.pageSafe <= 1} onClick={() => setPageData((p) => p - 1)}>
                ‹
              </button>
              <span className={styles.pagerMeta}>{dataPage.pageSafe}</span>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={dataPage.pageSafe >= dataPage.totalPages}
                onClick={() => setPageData((p) => p + 1)}
              >
                ›
              </button>
            </div>
            <div className={imp.tableScroll}>
              <table className={imp.table}>
                <thead>
                  <tr>
                    <th>№</th>
                    {cfg.fields.map((id) => (
                      <th key={id}>{PERSON_DOC_FIELDS.find((f) => f.id === id)?.label || id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataPage.slice.length === 0 ? (
                    <tr>
                      <td className={imp.empty} colSpan={cfg.fields.length + 1}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    dataPage.slice.map((r, i) => (
                      <tr key={i}>
                        <td>{(dataPage.pageSafe - 1) * PAGE_SIZE + i + 1}</td>
                        {cfg.fields.map((id) => (
                          <td key={id}>{r[id as PersonDocFieldId] || ''}</td>
                        ))}
                      </tr>
                    ))
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
