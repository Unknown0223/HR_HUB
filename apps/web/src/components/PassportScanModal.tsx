'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import {
  mergePassportScanFields,
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
  imageDataUrlBack?: string;
};

async function ocrDataUrl(
  dataUrl: string,
  onProgress?: (msg: string) => void,
): Promise<PassportScanFields> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'rus'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(`OCR ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return parsePassportOcrText(data.text || '');
  } finally {
    await worker.terminate();
  }
}

export function PassportScanModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: PassportScanResult) => void;
}) {
  const [imageFront, setImageFront] = useState('');
  const [imageBack, setImageBack] = useState('');
  const [fields, setFields] = useState<PassportScanFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const isIdCard = fields.docType === 'ID_CARD' || fields.docKind === 'id_card';

  useEffect(() => {
    if (!open) {
      setImageFront('');
      setImageBack('');
      setFields(EMPTY);
      setBusy(false);
      setError('');
      setProgress('');
    }
  }, [open]);

  const canConfirm = useMemo(
    () =>
      Boolean(
        fields.docNumber.trim() || fields.pinfl.trim() || fields.lastName.trim(),
      ),
    [fields],
  );

  async function runOcr(front: string, back: string) {
    if (!front && !back) return;
    setBusy(true);
    setError('');
    try {
      const parts: PassportScanFields[] = [];
      if (front) {
        setProgress('Old tomon OCR…');
        parts.push(await ocrDataUrl(front, setProgress));
      }
      if (back) {
        setProgress('Orqa tomon OCR…');
        parts.push(await ocrDataUrl(back, setProgress));
      }
      const parsed = mergePassportScanFields(...parts);
      // Keep user-selected doc type if they already switched
      if (fields.docType === 'ID_CARD' && parsed.docKind === 'unknown') {
        parsed.docType = 'ID_CARD';
        parsed.docKind = 'id_card';
      }
      setFields(parsed);
      setProgress(
        parsed.pinfl
          ? parsed.confidence === 'high'
            ? 'MRZ + ПИНФЛ топилди'
            : 'ПИНФЛ топилди — текширинг'
          : parsed.confidence === 'high'
            ? 'MRZ топилди (ПИНФЛни текширинг)'
            : parsed.confidence === 'medium'
              ? 'Қисман топилди — текширинг'
              : 'Текшириб тўлдиринг',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сканерлашда хато');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  async function onFrontFile(file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setImageFront(dataUrl);
    await runOcr(dataUrl, imageBack);
  }

  async function onBackFile(file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setImageBack(dataUrl);
    await runOcr(imageFront, dataUrl);
  }

  function setField<K extends keyof PassportScanFields>(
    key: K,
    value: PassportScanFields[K],
  ) {
    setFields((f) => {
      const next = { ...f, [key]: value };
      if (key === 'docType') {
        next.docKind = value === 'ID_CARD' ? 'id_card' : 'passport_book';
      }
      return next;
    });
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
                imageDataUrl: imageFront,
                ...(imageBack ? { imageDataUrlBack: imageBack } : {}),
              })
            }
          >
            Қабул қилиш
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            onClick={onClose}
            disabled={busy}
          >
            Бекор қилиш
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={styles.layout}>
        <div className={styles.left}>
          <label className={styles.upload}>
            <span>
              {isIdCard ? 'ID — олд томон' : 'Биометрик паспорт (битта расм)'}
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={busy}
              onChange={(e) => void onFrontFile(e.target.files?.[0] || null)}
            />
          </label>
          {isIdCard ? (
            <label className={styles.upload}>
              <span>ID — орқа томон (MRZ / ПИНФЛ)</span>
              <input
                type="file"
                accept="image/*,.pdf"
                disabled={busy}
                onChange={(e) => void onBackFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : null}
          {progress ? <p className={styles.progress}>{progress}</p> : null}
          <div className={styles.preview}>
            {imageFront ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageFront} alt="Passport / ID front" />
            ) : (
              <span className={styles.previewEmpty}>Расм шу ерда кўринади</span>
            )}
          </div>
          {isIdCard && imageBack ? (
            <div className={styles.preview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageBack} alt="ID back" />
            </div>
          ) : null}
          <p className={styles.hint}>
            Биометрик паспорт китобчаси — 1 расм (MRZ пастки қаторда ПИНФЛ; охирги 2
            текширув рақами олиб ташланади). Янги ID-карта — олд + орқа томон.
          </p>
        </div>
        <div className={styles.right}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Ҳужжат тури</span>
              <select
                value={fields.docType}
                onChange={(e) =>
                  setField(
                    'docType',
                    e.target.value === 'ID_CARD' ? 'ID_CARD' : 'PASSPORT',
                  )
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
              <input
                value={fields.series}
                onChange={(e) => setField('series', e.target.value)}
              />
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
              <span>ПИНФЛ (ЖШШИР)</span>
              <input
                value={fields.pinfl}
                onChange={(e) => setField('pinfl', e.target.value)}
                inputMode="numeric"
                maxLength={14}
                placeholder="14 рақам"
              />
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
            <input
              value={fields.issuer}
              onChange={(e) => setField('issuer', e.target.value)}
            />
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
