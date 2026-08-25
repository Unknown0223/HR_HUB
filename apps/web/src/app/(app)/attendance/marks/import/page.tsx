'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiDownload, apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { mapMatrixToObjects, parseXlsxFile } from '@/lib/parse-xlsx';
import styles from './page.module.css';

type PreviewRow = {
  employeeName: string;
  locationName: string;
  occurredAt: string;
  markType: string;
  isValid: string;
  note: string;
  photoUrl: string;
};

type ImportError = { row?: number; message: string };
type ImportResult = {
  created?: number;
  skipped?: number;
  errors?: Array<string | ImportError>;
};

const DEFAULT_MAP = {
  employeeName: 1,
  locationName: 2,
  occurredAt: 3,
  markType: 4,
  isValid: 5,
  note: 6,
  photoUrl: 7,
};

function ImportInner() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'import' | 'settings'>('import');
  const [file, setFile] = useState<File | null>(null);
  const [startRow, setStartRow] = useState(2);
  const [columnMap, setColumnMap] = useState({ ...DEFAULT_MAP });
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [qData, setQData] = useState('');
  const [qErr, setQErr] = useState('');
  const photos = usePhotoLightbox();

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
      const { rows } = await parseXlsxFile(f);
      const mapped = mapMatrixToObjects(rows, columnMap, startRow).map((r) => ({
        employeeName: r.employeeName || '',
        locationName: r.locationName || '',
        occurredAt: r.occurredAt || '',
        markType: r.markType || '',
        isValid: r.isValid || '',
        note: r.note || '',
        photoUrl: r.photoUrl || '',
      }));
      setPreview(mapped);
      if (!mapped.length) setError('В файле нет строк данных (проверьте начальную строку)');
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
      const res = await apiFetch<ImportResult>('/api/attendance/marks/import', {
        method: 'POST',
        body: JSON.stringify({
          rows: preview.map((r) => ({
            'Физическое лицо': r.employeeName,
            Локация: r.locationName,
            'Дата и время отметки (дд.мм.гггг чч:мм)': r.occurredAt,
            'Тип отметки': r.markType,
            'Является ли отметка действительной': r.isValid,
            Примечание: r.note,
            'Фото (URL)': r.photoUrl,
          })),
        }),
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
        <h1>Импорт отметок</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={tab === 'import' ? styles.btnPrimary : styles.btnGhost}
            onClick={() => setTab('import')}
          >
            Импорт
          </button>
          <button
            type="button"
            className={tab === 'settings' ? styles.btnPrimary : styles.btnGhost}
            onClick={() => setTab('settings')}
          >
            Настройки
          </button>
          {tab === 'import' ? (
            <>
              <button
                type="button"
                className={styles.btnBlue}
                disabled={!preview.length || busy}
                onClick={() => void runImport()}
              >
                Загрузить
              </button>
              <button
                type="button"
                className={styles.btnBlue}
                onClick={() =>
                  void apiDownload(
                    '/api/attendance/marks/import/template.xlsx',
                    'import-marks-template.xlsx',
                  )
                }
              >
                Шаблон
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.btnBlue}
              onClick={() => {
                setInfo('Настройки сохранены для этой сессии');
                setTab('import');
                if (file) void onFile(file);
              }}
            >
              Сохранить
            </button>
          )}
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/attendance/marks')}
          >
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      {tab === 'settings' ? (
        <div className={styles.settings}>
          <div className={styles.mapList}>
            {(
              [
                ['employeeName', 'Физическое лицо'],
                ['locationName', 'Локация'],
                ['occurredAt', 'Дата и время отметки (дд.мм.гггг чч:мм)'],
                ['markType', 'Тип отметки'],
                ['isValid', 'Является ли отметка действительной'],
                ['note', 'Примечание'],
                ['photoUrl', 'Фото (URL)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={styles.mapRow}>
                <span>{label}</span>
                <input
                  type="number"
                  min={1}
                  value={columnMap[key]}
                  onChange={(e) =>
                    setColumnMap((m) => ({
                      ...m,
                      [key]: Number(e.target.value) || 1,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <label className={styles.startRow}>
            <span>Начальная строка</span>
            <input
              type="number"
              min={1}
              value={startRow}
              onChange={(e) => setStartRow(Number(e.target.value) || 2)}
            />
          </label>
        </div>
      ) : (
        <>
          <div className={styles.topGrid}>
            <div className={styles.card}>
              <h2>Файл</h2>
              <button
                type="button"
                className={styles.drop}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void onFile(f);
                }}
              >
                {file
                  ? file.name
                  : 'Перетащите файл сюда или кликните для выбора файла'}
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
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Ошибки</h2>
                <input
                  placeholder="Поиск..."
                  value={qErr}
                  onChange={(e) => setQErr(e.target.value)}
                />
              </div>
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
                        Нет данных
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

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Данные</h2>
              <input
                placeholder="Поиск..."
                value={qData}
                onChange={(e) => setQData(e.target.value)}
              />
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Фото</th>
                    <th>Физическое лицо</th>
                    <th>Локация</th>
                    <th>Время</th>
                    <th>Тип отметки</th>
                    <th>Действительна (Y/N)</th>
                    <th>Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredPreview.map((r, i) => (
                      <tr key={`${r.employeeName}-${i}`}>
                        <td>{i + 1}</td>
                        <td>
                          {r.photoUrl ? (
                            <PhotoThumb
                              src={mediaSrc(r.photoUrl) || r.photoUrl}
                              alt=""
                              className={styles.thumb}
                              lightbox={photos}
                              slides={filteredPreview
                                .map((x) => ({
                                  src: mediaSrc(x.photoUrl) || x.photoUrl || '',
                                  caption: x.employeeName,
                                }))
                                .filter((s) => s.src)}
                              index={Math.max(
                                0,
                                filteredPreview
                                  .map((x) => mediaSrc(x.photoUrl) || x.photoUrl || '')
                                  .filter(Boolean)
                                  .findIndex(
                                    (s) =>
                                      s === (mediaSrc(r.photoUrl) || r.photoUrl),
                                  ),
                              )}
                            />
                          ) : (
                            <span className={styles.thumbEmpty} />
                          )}
                        </td>
                        <td>{r.employeeName}</td>
                        <td>{r.locationName}</td>
                        <td>{r.occurredAt}</td>
                        <td>{r.markType}</td>
                        <td>{r.isValid || 'Y'}</td>
                        <td>{r.note}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {photos.node}
    </div>
  );
}

export default function MarksImportPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ImportInner />
    </Suspense>
  );
}
