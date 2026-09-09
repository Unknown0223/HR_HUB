'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import {
  parsePassportOcrText,
  type PassportScanFields,
} from '@/lib/passport-ocr';
import styles from './PassportScanModal.module.css';

const EMPTY: PassportScanFields = {
  docKind: 'unknown',
  docType: 'PASSPORT',
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  gender: '',
  nationality: '',
  pinfl: '',
  series: '',
  docNumber: '',
  issuedAt: '',
  expiresAt: '',
  issuer: '',
  mrzRaw: '',
  confidence: 'low',
};

export type PassportScanResult = PassportScanFields & {
  imageDataUrl: string;
};

export function PassportScanModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: PassportScanResult) => void;
}) {
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [fields, setFields] = useState<PassportScanFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!open) {
      setImageDataUrl('');
      setFields(EMPTY);
      setBusy(false);
      setError('');
      setProgress('');
    }
  }, [open]);

  const canConfirm = useMemo(
    () => Boolean(fields.docNumber.trim() || fields.pinfl.trim() || fields.lastName.trim()),
    [fields],
  );

  async function onFile(file: File | null) {
    if (!file) return;
    setError('');
    setBusy(true);
    setProgress('Расм ўқиляпти…');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setProgress('OCR…');
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(['eng', 'rus'], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(`OCR ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      try {
        const { data } = await worker.recognize(dataUrl);
        const parsed = parsePassportOcrText(data.text || '');
        setFields(parsed);
        setProgress(
          parsed.confidence === 'high'
            ? 'MRZ топилди'
            : parsed.confidence === 'medium'
              ? 'Қисман топилди — текширинг'
              : 'Текшириб тўлдиринг',
        );
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сканерлашда хато');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  function setField<K extends keyof PassportScanFields>(key: K, value: PassportScanFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  return (
    <FormModal
      open={open}
      title="Паспорт / ID сканер"
      onClose={onClose}
      width="xl"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || !canConfirm}
            onClick={() =>
              onConfirm({
                ...fields,
                imageDataUrl,
              })
            }
          >
            Қабул қилиш
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose} disabled={busy}>
            Бекор қилиш
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={styles.layout}>
        <div className={styles.left}>
          <label className={styles.upload}>
            <span>Паспорт ёки ID расми</span>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={busy}
              onChange={(e) => void onFile(e.target.files?.[0] || null)}
            />
          </label>
          {progress ? <p className={styles.progress}>{progress}</p> : null}
          <div className={styles.preview}>
            {imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageDataUrl} alt="Passport scan" />
            ) : (
              <span className={styles.previewEmpty}>Расм шу ерда кўринади</span>
            )}
          </div>
          <p className={styles.hint}>
            Эски паспорт китобчаси ва янги ID-карта қўллаб-қувватланади. MRZ қаторини аниқ
            туширинг.
          </p>
        </div>
        <div className={styles.right}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Ҳужжат тури</span>
              <select
                value={fields.docType}
                onChange={(e) =>
                  setField('docType', e.target.value === 'ID_CARD' ? 'ID_CARD' : 'PASSPORT')
                }
              >
                <option value="PASSPORT">Паспорт (китобча)</option>
                <option value="ID_CARD">ID-карта</option>
              </select>
            </label>
            <label className={modal.field}>
              <span>Ишонч</span>
              <input value={fields.confidence} readOnly />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Фамилия</span>
              <input
                value={fields.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Исм</span>
              <input
                value={fields.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>Отасининг исми</span>
            <input
              value={fields.middleName}
              onChange={(e) => setField('middleName', e.target.value)}
            />
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Серия</span>
              <input value={fields.series} onChange={(e) => setField('series', e.target.value)} />
            </label>
            <label className={modal.field}>
              <span>Рақам</span>
              <input
                value={fields.docNumber}
                onChange={(e) => setField('docNumber', e.target.value)}
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>ПИНФЛ</span>
              <input value={fields.pinfl} onChange={(e) => setField('pinfl', e.target.value)} />
            </label>
            <label className={modal.field}>
              <span>Жинс</span>
              <select
                value={fields.gender}
                onChange={(e) => setField('gender', e.target.value)}
              >
                <option value="">—</option>
                <option value="male">Эркак</option>
                <option value="female">Аёл</option>
              </select>
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Туғилган сана</span>
              <input
                type="date"
                value={fields.birthDate}
                onChange={(e) => setField('birthDate', e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Фуқаролик</span>
              <input
                value={fields.nationality}
                onChange={(e) => setField('nationality', e.target.value)}
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Берилган</span>
              <input
                type="date"
                value={fields.issuedAt}
                onChange={(e) => setField('issuedAt', e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Амал қилиш муддати</span>
              <input
                type="date"
                value={fields.expiresAt}
                onChange={(e) => setField('expiresAt', e.target.value)}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>Ким берган</span>
            <input value={fields.issuer} onChange={(e) => setField('issuer', e.target.value)} />
          </label>
        </div>
      </div>
    </FormModal>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Файлни ўқиб бўлмади'));
    reader.readAsDataURL(file);
  });
}
