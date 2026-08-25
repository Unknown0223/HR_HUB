'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { QUICKSTART_STEPS, type QuickstartState } from '@/lib/quickstart';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import ui from './page.module.css';

export function QuickstartPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [state, setState] = useState<QuickstartState | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setState(await apiFetch<QuickstartState>('/api/settings/quickstart'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const doneByKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of state?.steps || []) map[s.key] = s.done;
    return map;
  }, [state]);

  async function toggle(key: string, next: boolean) {
    setBusyKey(key);
    setError('');
    try {
      setState(
        await apiFetch<QuickstartState>('/api/settings/quickstart', {
          method: 'PATCH',
          body: JSON.stringify({ checked: { [key]: next } }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusyKey(null);
    }
  }

  const doneCount = state?.doneCount ?? 0;
  const total = state?.total ?? QUICKSTART_STEPS.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Инструкция для быстрого запуска', siblings: [] }} />
      <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
        <button type="button" className={formStyles.btnClose} onClick={() => router.push('/settings?tab=admin')}>
          Закрыть
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && !state ? <p className={styles.empty}>Загрузка…</p> : null}
      <div className={ui.card}>
        <div className={ui.head}>
          <button type="button" className={ui.headBtn} onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'} #qs:ht:verifix
          </button>
          <div className={ui.progressWrap}>
            <div className={ui.bar} aria-hidden>
              <div className={ui.barFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={ui.progressText}>
              Выполнено {doneCount} из {total}
            </span>
          </div>
        </div>
        {open
          ? QUICKSTART_STEPS.map((step, i) => {
              const done = Boolean(doneByKey[step.key]);
              return (
                <div className={ui.row} key={step.key}>
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={busyKey === step.key}
                    onChange={() => void toggle(step.key, !done)}
                    aria-label={step.label}
                  />
                  <span className={ui.num}>{i + 1}.</span>
                  <div>
                    <span className={ui.tag}>{step.tag}</span>
                    <Link className={ui.link} href={step.href}>
                      {step.label}
                    </Link>
                  </div>
                  <Link className={ui.ext} href={step.href} aria-label={step.label} title={step.label}>
                    ↗
                  </Link>
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}
