'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import {
  bulkAccess,
  grantAccess,
  type AccessOptions,
  type BulkAccessResult,
  type GrantPayload,
} from '@/lib/access';
import styles from '../access.module.css';

type Option = { id: string; label: string };

const SENSITIVE_FLAGS = new Set(['system_access_closed', 'marks_blocked']);

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59`).toISOString();
}

export function AccessGrantModal({
  open,
  action,
  employees,
  options,
  divisions,
  onClose,
  onDone,
}: {
  open: boolean;
  action: 'grant' | 'revoke';
  employees: { id: string; fullName: string }[];
  options: AccessOptions;
  divisions: Option[];
  onClose: () => void;
  onDone: (result: BulkAccessResult | null) => void;
}) {
  const types = useMemo(() => options.types.filter((t) => t.canGrant), [options.types]);
  const [accessType, setAccessType] = useState('');
  const [resource, setResource] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccessType(types[0]?.id ?? '');
    setResource('');
    setExpiresOn('');
    setReason('');
    setStep('form');
    setError(null);
  }, [open, types]);

  const type = types.find((t) => t.id === accessType);
  const resourceOptions: Option[] =
    type?.resource === 'division' ? divisions : type?.resource === 'flag' ? options.flags : [];
  const resourceLabel = type?.resource === 'all'
    ? 'Вся организация'
    : resourceOptions.find((o) => o.id === resource)?.label ?? '';
  const sensitive = !!type && (type.global || (type.resource === 'flag' && SENSITIVE_FLAGS.has(resource)));
  const today = new Date().toISOString().slice(0, 10);

  function validate(): string | null {
    if (!type) return 'Выберите тип доступа';
    if (resourceOptions.length && !resource) return 'Выберите значение доступа';
    if (expiresOn && expiresOn < today) return 'Дата окончания должна быть в будущем';
    if (reason.trim().length < 3) return 'Укажите причину (не менее 3 символов)';
    return null;
  }

  function next() {
    const err = validate();
    setError(err);
    if (!err) setStep('confirm');
  }

  async function submit() {
    if (!type) return;
    const payload: GrantPayload = {
      accessType: type.id,
      resource: type.resource === 'all' ? undefined : resource,
      expiresAt: action === 'grant' && expiresOn ? endOfDayIso(expiresOn) : undefined,
      reason: reason.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      if (employees.length === 1 && action === 'grant') {
        await grantAccess(employees[0].id, payload);
        onDone(null);
      } else {
        onDone(await bulkAccess(action, employees.map((e) => e.id), payload));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setStep('form');
    } finally {
      setBusy(false);
    }
  }

  const verb = action === 'grant' ? 'Выдать' : 'Отозвать';
  const target =
    employees.length === 1 ? employees[0].fullName : `${employees.length} сотрудникам`;

  return (
    <FormModal
      open={open}
      title={action === 'grant' ? 'Выдача доступа' : 'Отзыв доступа'}
      onClose={busy ? () => undefined : onClose}
      width="md"
      footer={
        step === 'form' ? (
          <>
            <button type="button" className={styles.btn} onClick={onClose}>
              Отмена
            </button>
            <button type="button" className={styles.btnPrimary} onClick={next} disabled={!types.length}>
              Далее
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.btn} onClick={() => setStep('form')} disabled={busy}>
              Назад
            </button>
            <button
              type="button"
              className={action === 'revoke' || sensitive ? styles.btnDanger : styles.btnPrimary}
              onClick={submit}
              disabled={busy}
            >
              {busy ? 'Сохранение…' : `${verb} доступ`}
            </button>
          </>
        )
      }
    >
      {!types.length ? (
        <p className={styles.empty}>У вашей роли нет прав на изменение доступов.</p>
      ) : step === 'form' ? (
        <div className={styles.modalBody}>
          <p className={styles.muted}>
            {action === 'grant' ? 'Кому' : 'У кого'}: {target}
          </p>
          <label className={styles.field}>
            Тип доступа
            <select
              className={styles.select}
              value={accessType}
              onChange={(e) => {
                setAccessType(e.target.value);
                setResource('');
                setExpiresOn('');
              }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {resourceOptions.length ? (
            <label className={styles.field}>
              {type?.resource === 'division' ? 'Подразделение' : 'Ограничение'}
              <select className={styles.select} value={resource} onChange={(e) => setResource(e.target.value)}>
                <option value="">— выберите —</option>
                {resourceOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action === 'grant' && type?.allowExpiry ? (
            <label className={styles.field}>
              Действует до (необязательно)
              <input
                type="date"
                className={styles.input}
                min={today}
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </label>
          ) : null}
          <label className={styles.field}>
            Причина
            <textarea
              className={styles.textarea}
              value={reason}
              maxLength={500}
              placeholder="Например: приказ №12 от 01.10.2026"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={styles.modalBody}>
          <dl className={styles.preview}>
            <dt>Действие</dt>
            <dd>{verb} доступ</dd>
            <dt>Сотрудники</dt>
            <dd>{target}</dd>
            <dt>Тип</dt>
            <dd>{type?.label}</dd>
            {resourceLabel ? (
              <>
                <dt>Значение</dt>
                <dd>{resourceLabel}</dd>
              </>
            ) : null}
            {action === 'grant' ? (
              <>
                <dt>Срок</dt>
                <dd>{expiresOn ? `до ${new Date(`${expiresOn}T00:00:00`).toLocaleDateString('ru-RU')}` : 'Бессрочно'}</dd>
              </>
            ) : null}
            <dt>Причина</dt>
            <dd>{reason.trim()}</dd>
          </dl>
          {sensitive ? (
            <p className={styles.warning} role="note">
              {type?.global
                ? 'Это доступ ко всей организации. Убедитесь, что он действительно нужен.'
                : 'Это ограничение повлияет на вход в систему или отметки сотрудника.'}
            </p>
          ) : null}
          <p className={styles.muted}>Изменение будет записано в журнал аудита.</p>
        </div>
      )}
    </FormModal>
  );
}
