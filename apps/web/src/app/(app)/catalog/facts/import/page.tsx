'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiDownload, apiFetch } from '@/lib/api';
import { mapMatrixToObjects, parseXlsxFile } from '@/lib/parse-xlsx';
import styles from '../../../attendance/marks/import/page.module.css';
import shared from '../../../../page-shared.module.css';

type PreviewRow = {
  person_name: string;
  division_name: string;
  fact_type_name: string;
  fact_value: string;
  fact_date: string;
};

type ImportError = { row?: number; message: string };
type ImportResult = {
  created?: number;
  skipped?: number;
  errors?: Array<string | ImportError>;
};

const DEFAULT_MAP = {
  person_name: 1,
  division_name: 2,
  fact_type_name: 3,
  fact_value: 4,
  fact_date: 5,
};

function FactsImportInner() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [qData, setQData] = useState('');
  const [qErr, setQErr] = useState('');
  const [drag, setDrag] = useState(false);

  const filteredPreview = useMemo(() => {
    const s = qData.trim().toLowerCase();
    if (!s) return preview;
    return preview.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [preview, qData]);

  const filteredErrors = useMemo(() => {
    const s = qErr.trim().toLowerCase();
    if (!s) return errors;
    return errors.filter((e) =>
      `${e.row ?? ''} ${e.message}`.toLowerCase().includes(s),
    );
  }, [errors, qErr]);

  async function onFile(f: File) {
    setFile(f);
    setError('');
    setInfo('');
    setErrors([]);
    try {
      const { rows } = await parseXlsxFile(f, ['Факты', 'Facts', 'facts']);
      // detect header row with person_name
      let startRow = 2;
      const header = (rows[0] || []).map((c) => c.toLowerCase());
      if (
        header.some((h) => h.includes('person') || h.includes('сотрудник'))
      ) {
        startRow = 2;
      }
      // map by header if present
      let map = { ...DEFAULT_MAP };
      if (header.length) {
        const findCol = (...names: string[]) => {
          for (let i = 0; i < header.length; i++) {
            const h = header[i];
            if (names.some((n) => h === n || h.includes(n))) return i + 1;
          }
          return 0;
        };
        const p = findCol('person_name', 'сотрудник', 'person');
        const d = findCol('division_name', 'подразделение', 'division');
        const t = findCol('fact_type_name', 'тип', 'fact_type');
        const v = findCol('fact_value', 'значение', 'value');
        const dt = findCol('fact_date', 'дата', 'date');
        if (p || d || t || v || dt) {
          map = {
            person_name: p || 1,
            division_name: d || 2,
            fact_type_name: t || 3,
            fact_value: v || 4,
            fact_date: dt || 5,
          };
          startRow = 2;
        }
      }
      const mapped = mapMatrixToObjects(rows, map, startRow).map((r) => ({
        person_name: r.person_name || '',
        division_name: r.division_name || '',
        fact_type_name: r.fact_type_name || '',
        fact_value: r.fact_value || '',
        fact_date: r.fact_date || '',
      }));
      setPreview(mapped);
      if (!mapped.length) {
        setError('В файле нет строк данных');
      }
    } catch (e) {
      setPreview([]);
      setError(e instanceof Error ? e.message : 'Ошибка чтения файла');
    }
  }

  async function runImport() {
    if (!preview.length) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<ImportResult>('/api/catalog/facts/import', {
        method: 'POST',
        body: JSON.stringify({ rows: preview }),
      });
      const errs = (res.errors || []).map((e) =>
        typeof e === 'string' ? { message: e } : e,
      );
      setErrors(errs);
      setInfo(`Создано: ${res.created ?? 0}, пропущено: ${res.skipped ?? 0}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <h1>Импорт фактов</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnBlue}
            disabled={!preview.length || busy}
            onClick={() => void runImport()}
          >
            Импорт
          </button>
          <button
            type="button"
            className={styles.btnBlue}
            onClick={() =>
              void apiDownload(
                '/api/catalog/facts/import/template.xlsx',
                'import-facts-template.xlsx',
              )
            }
          >
            Шаблон
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/catalog/facts')}
          >
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      <div className={styles.topGrid}>
        <div className={styles.card}>
          <h2>Файл</h2>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <div
            className={styles.drop}
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
            style={drag ? { borderColor: '#3699ff', background: '#f3f9ff' } : undefined}
          >
            {file ? (
              <strong>{file.name}</strong>
            ) : (
              <>Перетащите файл сюда или кликните для выбора файла</>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <h2>Ошибки</h2>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={qErr}
            onChange={(e) => setQErr(e.target.value)}
          />
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Строка</th>
                  <th>Ошибки</th>
                </tr>
              </thead>
              <tbody>
                {filteredErrors.length === 0 ? (
                  <tr>
                    <td colSpan={2} className={styles.empty}>
                      нет данных
                    </td>
                  </tr>
                ) : (
                  filteredErrors.map((e, i) => (
                    <tr key={`${e.row}-${i}`}>
                      <td>{e.row ?? '—'}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2>Данные</h2>
        <input
          className={styles.search}
          placeholder="Поиск..."
          value={qData}
          onChange={(e) => setQData(e.target.value)}
        />
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>№</th>
                <th>Сотрудник</th>
                <th>Подразделение</th>
                <th>Тип</th>
                <th>Значение факта</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {filteredPreview.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    нет данных
                  </td>
                </tr>
              ) : (
                filteredPreview.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{r.person_name}</td>
                    <td>{r.division_name}</td>
                    <td>{r.fact_type_name}</td>
                    <td>{r.fact_value}</td>
                    <td>{r.fact_date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FactsImportPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <FactsImportInner />
    </Suspense>
  );
}
