'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  PassportScanModal,
  type PassportScanResult,
} from '@/components/PassportScanModal';
import modal from '@/components/form-modal.module.css';

export type EmployeeCreateWizardProps = {
  divisions: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
  saving: boolean;
  error?: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void> | void;
  onCancel: () => void;
  formId?: string;
};

const STEPS = [
  { id: 'passport', title: '1. Pasport / ID' },
  { id: 'personal', title: '2. Shaxsiy' },
  { id: 'org', title: '3. Tashkilot' },
] as const;

/**
 * Multi-step create: passport scan first, then contacts (Telegram), then org.
 */
export function EmployeeCreateWizard({
  divisions,
  positions,
  saving,
  error,
  onSubmit,
  onCancel,
  formId = 'emp-create-form',
}: EmployeeCreateWizardProps) {
  const [step, setStep] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [passportScan, setPassportScan] = useState<PassportScanResult | null>(
    null,
  );
  const [draft, setDraft] = useState({
    tabNumber: '',
    lastName: '',
    firstName: '',
    middleName: '',
    email: '',
    phone: '',
    telegramUsername: '',
    divisionId: '',
    positionId: '',
    hiredAt: '',
  });

  const stepId = STEPS[step]?.id ?? 'passport';

  const canNext = useMemo(() => {
    if (stepId === 'personal') {
      return Boolean(draft.lastName.trim() && draft.firstName.trim());
    }
    if (stepId === 'org') {
      return Boolean(draft.tabNumber.trim());
    }
    return true;
  }, [stepId, draft]);

  function applyScan(result: PassportScanResult) {
    setPassportScan(result);
    setDraft((d) => ({
      ...d,
      lastName: result.lastName || d.lastName,
      firstName: result.firstName || d.firstName,
      middleName: result.middleName || d.middleName,
    }));
    setStep(1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      if (!canNext) return;
      setStep((s) => s + 1);
      return;
    }
    const scan = passportScan;
    await onSubmit({
      tabNumber: draft.tabNumber.trim(),
      lastName: draft.lastName.trim(),
      firstName: draft.firstName.trim(),
      middleName: draft.middleName.trim() || undefined,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      telegramUsername: draft.telegramUsername.replace(/^@/, '').trim() || undefined,
      divisionId: draft.divisionId || undefined,
      positionId: draft.positionId || undefined,
      hiredAt: draft.hiredAt || undefined,
      pinfl: scan?.pinfl || undefined,
      birthDate: scan?.birthDate || undefined,
      gender: scan?.gender || undefined,
      nationality: scan?.nationality || undefined,
      passportSeries: scan?.series || undefined,
      passportNumber: scan?.docNumber || undefined,
      passportDocType: scan?.docType || undefined,
      passportIssuer: scan?.issuer || undefined,
      passportIssuedAt: scan?.issuedAt || undefined,
      passportExpiresAt: scan?.expiresAt || undefined,
    });
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={i === step ? modal.btnPrimary : modal.btnGhost}
            onClick={() => setStep(i)}
            style={{ fontSize: '0.85rem' }}
          >
            {s.title}
          </button>
        ))}
      </div>

      {error ? <p className={modal.error}>{error}</p> : null}

      <form id={formId} className={modal.fields} onSubmit={(e) => void handleSubmit(e)}>
        {stepId === 'passport' ? (
          <>
            <p style={{ margin: 0, color: '#605e5c', fontSize: '0.9rem' }}>
              Avval pasport yoki ID-kartani skanerlang — FIO/PINFL avtomatik
              to‘ldiriladi. Keyin shaxsiy va tashkilot qadamlariga o‘ting.
            </p>
            <button
              type="button"
              className={modal.btnPrimary}
              onClick={() => setScanOpen(true)}
            >
              Pasport / ID skanerlash
            </button>
            {passportScan ? (
              <p style={{ margin: 0, color: '#0f766e', fontSize: '0.9rem' }}>
                Skan:{' '}
                {[passportScan.series, passportScan.docNumber]
                  .filter(Boolean)
                  .join(' ') ||
                  passportScan.pinfl ||
                  'FIO'}{' '}
                ({passportScan.docType === 'ID_CARD' ? 'ID-karta' : 'pasport'})
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#9a6700' }}>
                Skan ixtiyoriy — «Keyingi» bilan qo‘lda ham davom ettirish mumkin.
              </p>
            )}
          </>
        ) : null}

        {stepId === 'personal' ? (
          <>
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>
                  Familiya <em className={modal.req}>*</em>
                </span>
                <input
                  required
                  value={draft.lastName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, lastName: e.target.value }))
                  }
                />
              </label>
              <label className={modal.field}>
                <span>
                  Ism <em className={modal.req}>*</em>
                </span>
                <input
                  required
                  value={draft.firstName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, firstName: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className={modal.field}>
              <span>Sharif</span>
              <input
                value={draft.middleName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, middleName: e.target.value }))
                }
              />
            </label>
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>Telefon</span>
                <input
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, phone: e.target.value }))
                  }
                  placeholder="+998…"
                />
              </label>
              <label className={modal.field}>
                <span>Telegram</span>
                <input
                  value={draft.telegramUsername}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, telegramUsername: e.target.value }))
                  }
                  placeholder="@username"
                />
              </label>
            </div>
            <label className={modal.field}>
              <span>Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
              />
            </label>
            {passportScan ? (
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>Hujjat</span>
                  <input
                    readOnly
                    value={[passportScan.series, passportScan.docNumber]
                      .filter(Boolean)
                      .join(' ')}
                  />
                </label>
                <label className={modal.field}>
                  <span>PINFL</span>
                  <input readOnly value={passportScan.pinfl || '—'} />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {stepId === 'org' ? (
          <>
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>
                  Tab. № <em className={modal.req}>*</em>
                </span>
                <input
                  required
                  value={draft.tabNumber}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, tabNumber: e.target.value }))
                  }
                  autoFocus
                />
              </label>
              <label className={modal.field}>
                <span>Ishga qabul</span>
                <input
                  type="date"
                  value={draft.hiredAt}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hiredAt: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>Bo‘lim</span>
                <select
                  value={draft.divisionId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, divisionId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={modal.field}>
                <span>Lavozim</span>
                <select
                  value={draft.positionId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, positionId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '0.5rem',
          }}
        >
          <button type="button" className={modal.btnGhost} onClick={onCancel}>
            Bekor
          </button>
          {step > 0 ? (
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Orqaga
            </button>
          ) : null}
          <button
            type="submit"
            className={modal.btnPrimary}
            disabled={saving || (stepId !== 'passport' && !canNext)}
          >
            {saving
              ? 'Saqlash…'
              : step < STEPS.length - 1
                ? 'Keyingi'
                : 'Xodimni yaratish'}
          </button>
        </div>
      </form>

      <PassportScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onConfirm={(result) => {
          applyScan(result);
          setScanOpen(false);
        }}
      />
    </>
  );
}
