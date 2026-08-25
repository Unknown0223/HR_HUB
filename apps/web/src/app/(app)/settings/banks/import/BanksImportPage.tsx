'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import { parseXlsxFile } from '@/lib/parse-xlsx';
import {
  BANK_TEMPLATE_LABELS,
  BANK_TEMPLATE_TECH,
  parseBankRows,
} from '@/lib/banks';
import styles from '../../../catalog/absence-types/page.module.css';
import formStyles from '../../../catalog/report-templates/form.module.css';
import imp from '../../../attendance/marks/import/page.module.css';

type Dict = { id: string; code: string };

export function BanksImportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function onFile(f: File) {
    setFile(f);
    setError('');
    setInfo('');
  }

  async function downloadTemplate() {
    await downloadStyledXlsx({
      filename: 'Банки-(импорт).xlsx',
      sheetName: 'Банки-(импорт)',
      columns: BANK_TEMPLATE_TECH,
      rows: [
        BANK_TEMPLATE_LABELS,
        ['', '00001', 'Центр расчетов Центрального банка по г. Ташкенту', '100001, г. Ташкент', 'A'],
      ],
      colWidths: [16, 14, 55, 55, 18],
    });
  }

  async function runImport() {
    if (!file) {
      setError('Выберите файл');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const admin = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin');
      const dict = (admin || []).find((d) => d.code === 'banks');
      if (!dict) throw new Error('Справочник «Банки» не найден');
      const { rows } = await parseXlsxFile(file, ['Банки', 'banks']);
      const parsed = parseBankRows(rows);
      const items = parsed
        .filter((r) => r.mfo && r.name)
        .map((r, i) => ({
          code: r.mfo,
          name: r.name,
          isActive: r.isActive,
          sortOrder: i + 1,
          meta: {
            address: r.address || undefined,
            smartupId: r.smartupId || undefined,
          },
        }));
      if (!items.length) throw new Error('В файле нет строк с МФО и названием');
      const res = await apiFetch<{
        created: number;
        updated: number;
        skipped: number;
      }>(`/api/settings/dictionaries/${dict.id}/items/import`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setInfo(`Импортировано: ${res.created}, обновлено: ${res.updated}, пропущено: ${res.skipped}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Банки (импорт)', siblings: [] }} />
      <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
        <button type="button" className={formStyles.btnSave} disabled={busy} onClick={() => void runImport()}>
          {busy ? 'Импорт…' : 'Импорт'}
        </button>
        <button type="button" className={styles.createBtn} onClick={() => void downloadTemplate()}>
          Шаблон
        </button>
        <button type="button" className={formStyles.btnClose} onClick={() => router.push('/settings/banks')}>
          Закрыть
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={formStyles.ok}>{info}</p> : null}
      <button
        type="button"
        className={imp.drop}
        style={{
          width: '100%',
          borderColor: drag ? '#3699ff' : undefined,
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
  );
}
