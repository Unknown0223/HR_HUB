'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { type AccountPair } from '@/lib/settlements';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

type CoaItem = { id: string; code: string; name: string };

export function AccountPairForm({ pairId }: { pairId?: string }) {
  const router = useRouter();
  const isNew = !pairId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [firstAccount, setFirstAccount] = useState('');
  const [secondAccount, setSecondAccount] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [subcontos, setSubcontos] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState('');
  const [coa, setCoa] = useState<CoaItem[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const dicts = await apiFetch<Array<{ code: string; items?: CoaItem[] }>>('/api/settings/dictionaries').catch(
          () => [],
        );
        const items = dicts.find((d) => d.code === 'coa')?.items || [];
        setCoa(items);
        if (pairId) {
          const row = await apiFetch<AccountPair>(`/api/payroll/account-pairs/${pairId}`);
          setName(row.name);
          setFirstAccount(row.firstAccount || row.debitAccount || '');
          setSecondAccount(row.secondAccount || row.creditAccount || '');
          setSortOrder(row.sortOrder || 1);
          setIsActive(row.isActive);
          setSubcontos(row.subcontos || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [pairId]);

  const visSubs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return subcontos;
    return subcontos.filter((s) => s.toLowerCase().includes(qq));
  }, [subcontos, q]);

  async function save() {
    if (!name.trim() || !firstAccount.trim() || !secondAccount.trim()) {
      setError('Название и оба счёта обязательны');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { name, firstAccount, secondAccount, sortOrder, isActive, subcontos };
      if (isNew) {
        await apiFetch('/api/payroll/account-pairs', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/api/payroll/account-pairs/${pairId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      router.push('/catalog/account-pairs');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;
  const title = `Парные счета (${isNew ? 'создание' : 'изменение'})`;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="account-pairs" titleOverride={title} />
      <div className={form.topBar}>
        <h1 className={form.title}>{title}</h1>
        <div className={form.actions}>
          <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save()}>
            Сохранить
          </button>
          <button type="button" className={form.btnClose} onClick={() => router.push('/catalog/account-pairs')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}
      <div className={form.card} style={{ maxWidth: 720 }}>
        <div className={form.field} style={{ marginBottom: 12 }}>
          <label>
            Название <span className={form.req}>*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={form.field} style={{ marginBottom: 12 }}>
          <label>
            Первый счет <span className={form.req}>*</span>
          </label>
          <input
            list="coa-first"
            value={firstAccount}
            onChange={(e) => setFirstAccount(e.target.value)}
            placeholder="Поиск..."
          />
          <datalist id="coa-first">
            {coa.map((c) => (
              <option key={c.id} value={`${c.code}. ${c.name}`} />
            ))}
          </datalist>
        </div>
        <div className={form.field} style={{ marginBottom: 12 }}>
          <label>
            Второй счет <span className={form.req}>*</span>
          </label>
          <input
            list="coa-second"
            value={secondAccount}
            onChange={(e) => setSecondAccount(e.target.value)}
            placeholder="Поиск..."
          />
          <datalist id="coa-second">
            {coa.map((c) => (
              <option key={c.id} value={`${c.code}. ${c.name}`} />
            ))}
          </datalist>
        </div>
        <div className={form.field} style={{ marginBottom: 12 }}>
          <label>Порядковый номер</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
        </div>
        <div className={form.field} style={{ marginBottom: 16 }}>
          <label>Статус</label>
          <label className={extra.toggle}>
            <span className={`${extra.switch} ${isActive ? extra.switchOn : ''}`}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className={extra.knob} />
            </span>
            {isActive ? 'Активный' : 'Неактивный'}
          </label>
        </div>
        <div className={form.field}>
          <label>Субконто</label>
          <div className={extra.subBar}>
            <button
              type="button"
              className={extra.iconBtn}
              onClick={() => setSubcontos((s) => [...s].reverse())}
              title="Порядок"
            >
              ↕
            </button>
            <button
              type="button"
              className={extra.iconBtn}
              onClick={() => {
                const v = subDraft.trim();
                if (!v) return;
                setSubcontos((s) => [...s, v]);
                setSubDraft('');
              }}
            >
              +
            </button>
            <button
              type="button"
              className={extra.iconBtn}
              onClick={() => setSubcontos((s) => s.slice(0, -1))}
            >
              −
            </button>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <input
            placeholder="Новое субконто"
            value={subDraft}
            onChange={(e) => setSubDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = subDraft.trim();
                if (!v) return;
                setSubcontos((s) => [...s, v]);
                setSubDraft('');
              }
            }}
            style={{ marginBottom: 8 }}
          />
          <div className={extra.subList}>
            {visSubs.length === 0 ? <div className={extra.muted} style={{ padding: 8 }}>Нет данных</div> : null}
            {visSubs.map((s) => (
              <div key={s} className={extra.subRow}>
                <span>{s}</span>
                <button type="button" className={extra.trash} onClick={() => setSubcontos((xs) => xs.filter((x) => x !== s))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
