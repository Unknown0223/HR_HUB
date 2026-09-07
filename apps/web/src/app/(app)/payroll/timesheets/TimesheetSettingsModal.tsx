'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import {
  DEFAULT_TIMESHEET_SETTINGS,
  TIME_KINDS,
  type TimesheetSettings,
} from '@/lib/timesheets';
import styles from './TimesheetSettingsModal.module.css';

export function TimesheetSettingsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (next: TimesheetSettings) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    setLoading(true);
    void (async () => {
      try {
        const next = await apiFetch<TimesheetSettings>('/api/payroll/timesheets/settings');
        if (!cancelled) setSettings({ ...DEFAULT_TIMESHEET_SETTINGS, ...next });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки настроек');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function toggleTimeKind(key: string, checked: boolean) {
    setSettings((s) => {
      const set = new Set(s.timeTypeIds);
      if (checked) set.add(key);
      else set.delete(key);
      return { ...s, allTimeTypes: false, timeTypeIds: [...set] };
    });
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const next = await apiFetch<TimesheetSettings>('/api/payroll/timesheets/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения настроек');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Настройки табеля"
      onClose={onClose}
      width="md"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <div className={modal.error}>{error}</div> : null}
      {loading ? (
        <p className={styles.hint}>Загрузка…</p>
      ) : (
        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <i className="fas fa-clock" aria-hidden />
              Виды рабочего времени
              <span className={styles.req}>*</span>
            </h3>
            <div className={styles.box}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.allTimeTypes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      allTimeTypes: e.target.checked,
                      timeTypeIds: e.target.checked ? [] : s.timeTypeIds,
                    }))
                  }
                />
                <i className="fas fa-check-double" aria-hidden />
                Все виды рабочего времени
              </label>
              {!settings.allTimeTypes ? (
                <div className={styles.kinds}>
                  {TIME_KINDS.map((k) => (
                    <label key={k.key} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={settings.timeTypeIds.includes(k.key)}
                        onChange={(e) => toggleTimeKind(k.key, e.target.checked)}
                      />
                      {k.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <i className="fas fa-table" aria-hidden />
              Настройки по детали
            </h3>
            <div className={styles.grid}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.showPlannedDays}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, showPlannedDays: e.target.checked }))
                  }
                />
                <i className="fas fa-calendar-day" aria-hidden />
                По плану (дней)
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.showPlannedHours}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, showPlannedHours: e.target.checked }))
                  }
                />
                <i className="fas fa-hourglass-half" aria-hidden />
                По плану (часы)
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.showWorkedDays}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, showWorkedDays: e.target.checked }))
                  }
                />
                <i className="fas fa-user-check" aria-hidden />
                Отработано дней
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={settings.showWorkedHours}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, showWorkedHours: e.target.checked }))
                  }
                />
                <i className="fas fa-stopwatch" aria-hidden />
                Отработано часов
              </label>
            </div>
          </section>
        </div>
      )}
    </FormModal>
  );
}
