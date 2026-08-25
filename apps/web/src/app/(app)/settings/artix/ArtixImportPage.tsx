'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  asArtixConfig,
  artixImport,
  DEFAULT_IMPORT,
  fieldLabel,
  genCode,
  genPassword,
  newId,
  templateHeader,
  type ArtixConfig,
  type ArtixImportSettings,
  type ArtixUser,
} from '@/lib/artix';
import { mapMatrixToObjects, parseXlsxFile } from '@/lib/parse-xlsx';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import abs from '../../catalog/absence-types/page.module.css';
import importCss from '../../attendance/marks/import/page.module.css';
import extra from './page.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  config?: ArtixConfig | null;
};

type PreviewRow = {
  userId: string;
  user: string;
  code: string;
  login: string;
  password: string;
};

function columnMapFromFields(fields: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  fields.forEach((key, i) => {
    map[key] = i + 1;
  });
  return map;
}

function slugLogin(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18);
  return base || `user_${genCode().slice(0, 6)}`;
}

export function ArtixImportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'import' | 'settings'>('import');
  const [row, setRow] = useState<Integration | null>(null);
  const [users, setUsers] = useState<ArtixUser[]>([]);
  const [imp, setImp] = useState<ArtixImportSettings>({
    ...DEFAULT_IMPORT,
    fields: [...DEFAULT_IMPORT.fields],
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [qData, setQData] = useState('');
  const [qErr, setQErr] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await apiFetch<Integration[]>('/api/settings/integrations');
        const found =
          (list || []).find((i) => asArtixConfig(i.config).sys === 'artix') ||
          (list || []).find((i) => i.name.toLowerCase().includes('artix'));
        if (!found) {
          setError('Интеграция ARTIX не найдена');
          return;
        }
        const cfg = asArtixConfig(found.config);
        setRow(found);
        setUsers(cfg.users || []);
        setImp(artixImport(cfg));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    return errors.filter((e) => `${e.row} ${e.message}`.toLowerCase().includes(s));
  }, [errors, qErr]);

  async function persist(patch: ArtixConfig) {
    if (!row) return;
    const updated = await apiFetch<Integration>(
      `/api/settings/integrations/${row.id}`,
      { method: 'PATCH', body: JSON.stringify({ config: patch }) },
    );
    setRow(updated);
    const cfg = asArtixConfig(updated.config);
    setUsers(cfg.users || []);
    setImp(artixImport(cfg));
  }

  async function parseFile(f: File, settings = imp) {
    setFile(f);
    setError('');
    setInfo('');
    const { rows } = await parseXlsxFile(f, ['Пользователи', 'Пользователи ARTIX']);
    const mapped = mapMatrixToObjects(
      rows,
      columnMapFromFields(settings.fields),
      settings.startRow,
    );
    const next: PreviewRow[] = mapped.map((r) => ({
      userId: r.userId || '',
      user: r.user || '',
      code: r.code || '',
      login: r.login || '',
      password: r.password || '',
    }));
    const errs: { row: number; message: string }[] = [];
    next.forEach((item, i) => {
      const excelRow = settings.startRow + i;
      const miss: string[] = [];
      if (!item.user) miss.push('Пользователь');
      if (!item.code) miss.push('Код');
      if (!item.login) miss.push('Логин');
      if (miss.length) {
        errs.push({
          row: excelRow,
          message: `Обязательные поля: ${miss.join(', ')}`,
        });
      }
    });
    setPreview(next);
    setErrors(errs);
    if (!next.length) setError('В файле нет строк данных (проверьте начальную строку)');
  }

  async function onFile(f: File) {
    try {
      await parseFile(f);
    } catch (e) {
      setPreview([]);
      setErrors([]);
      setError(e instanceof Error ? e.message : 'Ошибка чтения файла');
    }
  }

  async function runImport() {
    if (!preview.length) return;
    const blocking = errors.length;
    if (blocking) {
      setError('Исправьте ошибки перед импортом');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const next = [...users];
      let created = 0;
      let updated = 0;
      for (const p of preview) {
        const key =
          imp.idKind === 'user'
            ? p.user.trim().toLowerCase()
            : p.userId.trim().toLowerCase();
        const idx = next.findIndex((u) => {
          if (imp.idKind === 'user') return u.name.trim().toLowerCase() === key;
          return (u.userId || '').trim().toLowerCase() === key && key !== '';
        });
        const payload: ArtixUser = {
          id: idx >= 0 ? next[idx].id : newId(),
          userId: p.userId || (idx >= 0 ? next[idx].userId : ''),
          name: p.user,
          code: p.code || genCode(),
          login: p.login,
          password: p.password || (idx >= 0 ? next[idx].password : genPassword()),
          blocked: idx >= 0 ? next[idx].blocked : false,
          employeeId: idx >= 0 ? next[idx].employeeId : undefined,
          divisionId: idx >= 0 ? next[idx].divisionId : undefined,
          divisionName: idx >= 0 ? next[idx].divisionName : undefined,
          positionId: idx >= 0 ? next[idx].positionId : undefined,
          positionName: idx >= 0 ? next[idx].positionName : undefined,
          roles: idx >= 0 ? next[idx].roles : undefined,
        };
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...payload };
          updated += 1;
        } else {
          next.push(payload);
          created += 1;
        }
      }
      await persist({ users: next, import: imp });
      setInfo(`Импортировано: ${created}, обновлено: ${updated}`);
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
      await persist({ import: imp });
      setInfo('Настройки сохранены');
      setTab('import');
      if (file) await parseFile(file, imp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    void downloadStyledXlsx({
      filename: 'Пользователи-ARTIX-(импорт).xlsx',
      sheetName: 'Пользователи',
      columns: imp.fields.map(templateHeader),
      rows: [],
      colWidths: [22, 28, 22, 22, 18],
    });
  }

  function regen(field: 'code' | 'login' | 'password') {
    setPreview((rows) =>
      rows.map((r) => ({
        ...r,
        [field]:
          field === 'password'
            ? genPassword()
            : field === 'code'
              ? genCode()
              : slugLogin(r.user),
      })),
    );
  }

  return (
    <div className={importCss.wrap}>
      <PageSubnav
        group={{
          title: 'Пользователи ARTIX (импорт)',
          siblings: [{ label: 'Пользователи', href: '/settings/artix/users' }],
        }}
      />
      <div className={importCss.topBar}>
        <h1>Пользователи ARTIX (импорт)</h1>
        <div className={importCss.actions}>
          <button
            type="button"
            className={tab === 'import' ? importCss.btnPrimary : importCss.btnGhost}
            onClick={() => setTab('import')}
          >
            Импорт
          </button>
          <button
            type="button"
            className={tab === 'settings' ? importCss.btnPrimary : importCss.btnGhost}
            onClick={() => setTab('settings')}
          >
            Настройки
          </button>
          {tab === 'import' ? (
            <button
              type="button"
              className={importCss.btnBlue}
              disabled={!preview.length || busy || loading}
              onClick={() => void runImport()}
            >
              Загрузить
            </button>
          ) : (
            <button
              type="button"
              className={importCss.btnBlue}
              disabled={busy || loading}
              onClick={() => void saveSettings()}
            >
              Сохранить
            </button>
          )}
          <button type="button" className={importCss.btnBlue} onClick={downloadTemplate}>
            Шаблон
          </button>
          <button
            type="button"
            className={importCss.btnGhost}
            onClick={() => router.push('/settings/artix/users')}
          >
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={importCss.error}>{error}</p> : null}
      {info ? <p className={importCss.info}>{info}</p> : null}

      {tab === 'settings' ? (
        <div className={importCss.settings}>
          <div>
            {imp.fields.map((key, i) => (
              <div
                key={`${key}-${i}`}
                className={extra.mapRow}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx == null || dragIdx === i) return;
                  setImp((prev) => {
                    const next = [...prev.fields];
                    const [moved] = next.splice(dragIdx, 1);
                    next.splice(i, 0, moved);
                    return { ...prev, fields: next };
                  });
                  setDragIdx(null);
                }}
              >
                <span className={extra.mapHandle} aria-hidden>
                  ⋮⋮
                </span>
                <input className={extra.mapField} readOnly value={fieldLabel(key)} />
              </div>
            ))}
          </div>
          <div>
            <label className={importCss.startRow}>
              <span>Начальная строка</span>
              <input
                type="number"
                min={1}
                value={imp.startRow}
                onChange={(e) =>
                  setImp((p) => ({ ...p, startRow: Number(e.target.value) || 2 }))
                }
              />
            </label>
            <div className={extra.radioList}>
              <span>ИД</span>
              <label className={extra.radio}>
                <input
                  type="radio"
                  name="idKind"
                  checked={imp.idKind === 'user'}
                  onChange={() => setImp((p) => ({ ...p, idKind: 'user' }))}
                />
                Пользователь
              </label>
              <label className={extra.radio}>
                <input
                  type="radio"
                  name="idKind"
                  checked={imp.idKind === 'userId'}
                  onChange={() => setImp((p) => ({ ...p, idKind: 'userId' }))}
                />
                ИД пользователя
              </label>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={extra.importGrid}>
            <section className={importCss.card}>
              <h2>Файл</h2>
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
              <button
                type="button"
                className={drag ? extra.dropOn : extra.drop}
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
                <p className={extra.dropHint}>
                  Перетащите файл сюда или кликните для выбора файла
                </p>
              </button>
            </section>
            <section className={importCss.card}>
              <div className={importCss.cardHead}>
                <h2>Ошибки</h2>
                <input
                  className={importCss.search}
                  placeholder="Поиск..."
                  value={qErr}
                  onChange={(e) => setQErr(e.target.value)}
                />
              </div>
              <div className={importCss.tableScroll}>
                <table className={importCss.table}>
                  <thead>
                    <tr>
                      <th>Строка</th>
                      <th>Ошибки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredErrors.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={importCss.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      filteredErrors.map((e, i) => (
                        <tr key={`${e.row}-${i}`}>
                          <td>{e.row}</td>
                          <td>{e.message}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className={importCss.card}>
            <div className={importCss.cardHead}>
              <h2>Данные</h2>
              <input
                className={importCss.search}
                placeholder="Поиск..."
                value={qData}
                onChange={(e) => setQData(e.target.value)}
              />
            </div>
            <div className={importCss.tableScroll}>
              <table className={importCss.table}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>ИД</th>
                    <th>Пользователь</th>
                    <th>
                      Код{' '}
                      <button
                        type="button"
                        className={abs.toolBtn}
                        onClick={() => regen('code')}
                      >
                        ↻
                      </button>
                    </th>
                    <th>
                      Логин{' '}
                      <button
                        type="button"
                        className={abs.toolBtn}
                        onClick={() => regen('login')}
                      >
                        ↻
                      </button>
                    </th>
                    <th>
                      Пароль{' '}
                      <button
                        type="button"
                        className={abs.toolBtn}
                        onClick={() => regen('password')}
                      >
                        ↻
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={importCss.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredPreview.map((r, i) => (
                      <tr key={`${r.userId}-${r.login}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{r.userId}</td>
                        <td>{r.user}</td>
                        <td>{r.code}</td>
                        <td>{r.login}</td>
                        <td>{r.password}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
