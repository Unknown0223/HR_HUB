'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  PHOTO_TEMPLATES,
  type PhotoImportResult,
  type PhotoImportRow,
  type PhotoImportStatus,
} from '@/lib/photo-upload';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import ui from './page.module.css';

const PAGE_SIZE = 50;
const TAB_LABEL: Record<PhotoImportStatus, string> = {
  success: 'Успешно',
  warning: 'Предупреждение',
  not_found: 'Не найдено',
};

export function PhotosPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState('');
  const [templateError, setTemplateError] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [folderLabel, setFolderLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PhotoImportResult | null>(null);
  const [tab, setTab] = useState<PhotoImportStatus>('success');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const counts = result?.counts ?? { success: 0, warning: 0, not_found: 0 };

  const rows = useMemo(() => {
    const list = (result?.items || []).filter((r) => r.status === tab);
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((r) => {
      const names = r.employees.map((e) => `${e.fullName} ${e.tabNumber}`).join(' ');
      return r.file.toLowerCase().includes(qq) || names.toLowerCase().includes(qq);
    });
  }, [result, tab, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
  const pageSafe = Math.min(page, totalPages);
  const slice = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function onPick(list: FileList | null) {
    const next = Array.from(list || []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    setFiles(next);
    const rel = next[0] && 'webkitRelativePath' in next[0] ? String(next[0].webkitRelativePath || '') : '';
    const folder = rel.split('/')[0] || (next.length ? `${next.length} файл(ов)` : '');
    setFolderLabel(folder);
  }

  async function upload() {
    setError('');
    if (!template) {
      setTemplateError(true);
      return;
    }
    setTemplateError(false);
    if (!files.length) {
      setError('Выберите папку с фотографиями');
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('template', template);
      for (const f of files) body.append('files', f);
      const res = await apiFetch<PhotoImportResult>('/api/storage/photos/import', {
        method: 'POST',
        body,
      });
      setResult(res);
      const nextTab: PhotoImportStatus =
        res.counts.success > 0 ? 'success' : res.counts.warning > 0 ? 'warning' : 'not_found';
      setTab(nextTab);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }

  function exportRows(list: PhotoImportRow[]) {
    downloadCsv(
      `photos-${tab}`,
      list.map((r) => ({
        file: r.file,
        employees: r.employees.map((e) => `${e.fullName} (${e.tabNumber})`).join('; ') || '—',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Загрузка фотографий сотрудников', siblings: [] }} />
      <div className={formStyles.actions} style={{ marginBottom: '0.65rem' }}>
        <button type="button" className={formStyles.btnClose} onClick={() => router.push('/settings?tab=admin')}>
          Закрыть
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={ui.fields}>
        <label className={`${ui.field} ${templateError ? ui.invalid : ''}`}>
          <span>
            Шаблон <span className={ui.req}>*</span>
          </span>
          <SearchLookup
            value={template}
            options={PHOTO_TEMPLATES.map((t) => ({ id: t.id, label: t.label }))}
            onChange={(id) => {
              setTemplate(id);
              setTemplateError(false);
            }}
            allowClear
          />
        </label>
        <label className={ui.field}>
          Папка
          <button
            type="button"
            className={`${ui.folderBtn} ${folderLabel ? '' : ui.folderBtnEmpty}`}
            onClick={() => fileRef.current?.click()}
          >
            {folderLabel || 'Поиск...'}
          </button>
          <input
            ref={fileRef}
            className={ui.hidden}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onPick(e.target.files)}
            {...{ webkitdirectory: '', directory: '' }}
          />
        </label>
      </div>

      <div className={ui.uploadRow}>
        <button type="button" className={ui.uploadBtn} disabled={busy} onClick={() => void upload()}>
          {busy ? 'Загрузка…' : 'Загрузить'}
        </button>
        <span
          className={ui.hint}
          title="Имя файла должно совпадать с выбранным шаблоном, например «Ali Karimov.jpg» или «Ali Karimov #0001.jpg»."
        >
          ?
        </span>
      </div>

      <div className={ui.tabs}>
        {(['success', 'warning', 'not_found'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={tab === k ? ui.tabOn : ui.tab}
            onClick={() => {
              setTab(k);
              setPage(1);
            }}
          >
            {TAB_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      <div className={ui.toolbar}>
        <input
          className={styles.search}
          placeholder="Поиск..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <button type="button" className={styles.toolBtn} onClick={() => exportRows(rows)} disabled={!rows.length}>
          ↓
        </button>
        <span className={styles.pagerMeta}>
          {rows.length ? `${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, rows.length)}` : '0'} / {rows.length}
        </span>
        <button type="button" className={styles.pagerBtn} disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹
        </button>
        <span className={styles.pagerMeta}>{pageSafe}</span>
        <button
          type="button"
          className={styles.pagerBtn}
          disabled={pageSafe >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Файл</th>
              <th>Имена сотрудников</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={2}>
                  нет данных
                </td>
              </tr>
            ) : (
              slice.map((r, i) => (
                <tr key={`${r.file}-${i}`}>
                  <td>{r.file.replace(/\\/g, '/').split('/').pop()}</td>
                  <td>
                    {r.employees.length
                      ? r.employees.map((e) => e.fullName || e.tabNumber).join(', ')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
