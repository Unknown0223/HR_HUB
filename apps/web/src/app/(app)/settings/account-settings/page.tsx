'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type FieldDef = { key: string; label: string };
type AccountOpt = { code: string; name: string };

function formatOpt(o: AccountOpt) {
  return `${o.code}. ${o.name}`;
}

export default function AccountSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, dicts] = await Promise.all([
        apiFetch<{
          accountSettings: Record<string, string>;
          fields: FieldDef[];
        }>('/api/settings/account-settings'),
        apiFetch<
          Array<{
            code: string;
            items?: Array<{ code: string; name: string }>;
          }>
        >('/api/settings/dictionaries?kind=extra'),
      ]);
      setValues(cfg.accountSettings || {});
      setFields(cfg.fields || []);
      const coa = (dicts || []).find((d) => d.code === 'coa');
      setAccounts(
        (coa?.items || []).map((i) => ({ code: i.code, name: i.name })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listId = 'coa-accounts-list';

  const datalistOptions = useMemo(() => {
    if (accounts.length) {
      return accounts.map((a) => ({
        value: formatOpt(a),
        label: formatOpt(a),
      }));
    }
    // fallback from current values
    const uniq = new Set(Object.values(values).filter(Boolean));
    return [...uniq].map((v) => ({ value: v, label: v }));
  }, [accounts, values]);

  async function onSave() {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const res = await apiFetch<{ accountSettings: Record<string, string> }>(
        '/api/settings/account-settings',
        {
          method: 'PATCH',
          body: JSON.stringify({ accountSettings: values }),
        },
      );
      setValues(res.accountSettings || values);
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageSubnav
        group={{
          title: 'Настройки счетов',
          siblings: [
            { label: 'План счетов', href: '/catalog/coa' },
            { label: 'План главных счетов', href: '/catalog/coa-main' },
          ],
        }}
      />

      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.btnSave}
          disabled={saving || loading}
          onClick={() => void onSave()}
        >
          Сохранить
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={styles.grid}>
          <datalist id={listId}>
            {datalistOptions.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </datalist>
          {fields.map((f) => (
            <div key={f.key} className={styles.field}>
              <label>{f.label}</label>
              <div className={styles.inputWrap}>
                <input
                  list={listId}
                  value={values[f.key] || ''}
                  placeholder="Поиск..."
                  autoComplete="off"
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
                {values[f.key] ? (
                  <button
                    type="button"
                    className={styles.clear}
                    title="Очистить"
                    onClick={() =>
                      setValues((prev) => ({ ...prev, [f.key]: '' }))
                    }
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
