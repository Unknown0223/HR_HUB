'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { apiDownload, apiFetch } from '@/lib/api';
import { parseCsv } from '@/lib/csv';
import shared from '@/app/page-shared.module.css';
import styles from './import-panel.module.css';

export type ImportResult = {
  created?: number;
  skipped?: number;
  errors?: Array<string | { row?: number; message: string }>;
  message?: string;
};

export type ImportTemplateLink = {
  href: string;
  label: string;
  filename: string;
};

export type ImportPanelProps = {
  endpoint: string;
  hint?: string;
  onDone?: (result: ImportResult) => void;
  /** POST file as multipart/form-data (field name: file) instead of JSON rows */
  multipart?: boolean;
  accept?: string;
  /** Downloadable import templates (CSV / XLSX) */
  templates?: ImportTemplateLink[];
};

const XLSX_RE = /\.(xlsx|xls)$/i;

export function ImportPanel({
  endpoint,
  hint,
  onDone,
  multipart = false,
  accept = '.csv,.xlsx,.xls',
  templates,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isXlsx = file ? XLSX_RE.test(file.name) : false;
  const previewRows = rows.slice(0, 10);
  const headers = previewRows.length ? Object.keys(previewRows[0]) : [];

  async function readFile(f: File) {
    setFile(f);
    setResult(null);
    setError('');
    if (XLSX_RE.test(f.name)) {
      setRows([]);
      return;
    }
    try {
      const text = await f.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      if (!parsed.length) setError('Файл пуст или не распознан');
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Ошибка чтения CSV');
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void readFile(f);
    e.target.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  }

  async function downloadTemplate(tpl: ImportTemplateLink) {
    setTplBusy(true);
    setError('');
    try {
      await apiDownload(tpl.href, tpl.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка скачивания шаблона');
    } finally {
      setTplBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      let data: ImportResult;
      if (multipart) {
        const fd = new FormData();
        fd.append('file', file);
        data = await apiFetch<ImportResult>(endpoint, { method: 'POST', body: fd });
      } else if (isXlsx) {
        setError('XLSX: сохраните как CSV или включите multipart для серверной загрузки');
        return;
      } else {
        data = await apiFetch<ImportResult>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ rows }),
        });
      }
      setResult(data);
      onDone?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setFile(null);
    setRows([]);
    setResult(null);
    setError('');
  }

  return (
    <div className={styles.panel}>
      {hint ? <p className={shared.hint}>{hint}</p> : null}

      {templates && templates.length > 0 ? (
        <div className={styles.templateBar}>
          <span className={styles.meta} style={{ marginTop: 0 }}>
            Скачать шаблон:
          </span>
          {templates.map((tpl) => (
            <button
              key={tpl.href}
              type="button"
              className={shared.btnSecondary}
              disabled={tplBusy || busy}
              onClick={() => void downloadTemplate(tpl)}
            >
              {tplBusy ? '…' : tpl.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={[styles.drop, dragOver ? styles.dropActive : ''].filter(Boolean).join(' ')}
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
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept={accept}
          onChange={onPick}
        />
        {file ? (
          <>
            <strong>{file.name}</strong>
            <div className={styles.meta}>
              {isXlsx ? 'Excel' : `${rows.length} строк`}
            </div>
          </>
        ) : (
          <>
            <strong>Перетащите файл или нажмите для выбора</strong>
            <div className={styles.meta}>CSV, XLSX, XLS</div>
          </>
        )}
      </div>

      {isXlsx && !multipart ? (
        <div className={styles.xlsxHint}>
          XLSX: конвертируйте в CSV для предпросмотра и JSON-импорта, либо включите{' '}
          <code>multipart</code> для загрузки файла на сервер.
        </div>
      ) : null}

      {previewRows.length > 0 ? (
        <>
          <p className={styles.meta}>Предпросмотр (первые {previewRows.length} строк)</p>
          <div className={styles.preview}>
            <table>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td key={h}>{row[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {error ? <p className={shared.error}>{error}</p> : null}

      {result ? (
        <div className={result.errors?.length ? styles.resultErr : styles.resultOk}>
          {result.message ? <div>{result.message}</div> : null}
          <div>
            {result.created != null ? `Создано: ${result.created}. ` : ''}
            {result.skipped != null ? `Пропущено: ${result.skipped}.` : ''}
          </div>
          {result.errors?.length ? (
            <ul>
              {result.errors.slice(0, 20).map((err, i) => (
                <li key={i}>
                  {typeof err === 'string'
                    ? err
                    : `Строка ${err.row ?? '?'}: ${err.message}`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={shared.btn}
          disabled={!file || busy || (isXlsx && !multipart) || (!isXlsx && !rows.length)}
          onClick={() => void handleImport()}
        >
          {busy ? 'Импорт…' : 'Импорт'}
        </button>
        <button type="button" className={shared.btnGhost} disabled={busy} onClick={clearAll}>
          Очистить
        </button>
      </div>
    </div>
  );
}
