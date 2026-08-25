'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../division-form.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
  position?: { name: string; code?: string } | null;
};

type DivisionView = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  openedAt?: string | null;
  closedAt?: string | null;
  legalEntity?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByLabel?: string | null;
  updatedByLabel?: string | null;
  manager?: Emp | null;
  divisionGroup?: { id: string; name: string; code: string } | null;
  location?: { id: string; name: string; code: string } | null;
  schedule?: { id: string; name: string; code: string } | null;
  parent?: { id: string; name: string; code: string } | null;
  staffPositions?: {
    id: string;
    code: string;
    title?: string;
    position?: { name: string; code: string } | null;
  }[];
  children?: { id: string; code: string; name: string; isActive: boolean }[];
  _count?: { children: number; employees: number; staffPositions: number };
};

type Panel = 'main' | 'positions' | 'history';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

function empLabel(e?: Emp | null) {
  if (!e) return '—';
  const name = [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
  const pos = e.position?.code || e.position?.name;
  const tab = e.tabNumber;
  return [name, pos, tab ? `(${tab})` : null].filter(Boolean).join(' ');
}

function DivisionViewInner({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panel = (searchParams.get('panel') as Panel) || 'main';
  const [row, setRow] = useState<DivisionView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<DivisionView>(`/api/organization/divisions/${id}`);
        if (!cancelled) setRow(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function setPanel(p: Panel) {
    const q = new URLSearchParams(searchParams.toString());
    if (p === 'main') q.delete('panel');
    else q.set('panel', p);
    const qs = q.toString();
    router.replace(qs ? `/divisions/${id}?${qs}` : `/divisions/${id}`, { scroll: false });
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="divisions" />
        <p>Загрузка…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="divisions" />
        <p className={styles.error}>{error || 'Не найдено'}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="divisions" titleOverride="Подразделение (просмотр)" />

      <div className={styles.actions}>
        <Link href={`/divisions/${id}/edit`} className={styles.teal}>
          Изменить
        </Link>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => router.push('/divisions?tab=divisions')}
        >
          Закрыть
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.viewLayout}>
        <aside className={styles.side}>
          <h2 className={styles.sideTitle}>
            {row.name} {row.code ? `(${row.code})` : ''}
          </h2>
          <div className={row.isActive ? styles.badge : `${styles.badge} ${styles.badgeOff}`}>
            {row.isActive ? 'Активный' : 'Неактивный'}
          </div>
          <nav className={styles.sideNav}>
            <button
              type="button"
              className={panel === 'main' ? styles.sideLinkActive : styles.sideLink}
              onClick={() => setPanel('main')}
            >
              Основная информация
            </button>
            <button
              type="button"
              className={panel === 'positions' ? styles.sideLinkActive : styles.sideLink}
              onClick={() => setPanel('positions')}
            >
              Позиции ({row._count?.staffPositions ?? row.staffPositions?.length ?? 0})
            </button>
            <button
              type="button"
              className={panel === 'history' ? styles.sideLinkActive : styles.sideLink}
              onClick={() => setPanel('history')}
            >
              История изменений
            </button>
          </nav>
        </aside>

        <section className={styles.mainCard}>
          {panel === 'main' ? (
            <>
              <h3 className={styles.mainTitle}>Основная информация</h3>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <span>Код</span>
                  <strong>{row.code || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Порядковый номер</span>
                  <strong>{row.sortOrder ?? 0}</strong>
                </div>
                <div className={styles.field}>
                  <span>Руководитель</span>
                  <strong>{empLabel(row.manager)}</strong>
                </div>
                <div className={styles.field}>
                  <span>Название</span>
                  <strong>{row.name}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата открытия</span>
                  <strong>{fmtDate(row.openedAt || row.createdAt)}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата закрытия</span>
                  <strong>{fmtDate(row.closedAt)}</strong>
                </div>
                <div className={styles.field}>
                  <span>Группа подразделений</span>
                  <strong>{row.divisionGroup?.name || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Основная локация</span>
                  <strong>{row.location?.name || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Режим работы</span>
                  <strong>{row.schedule?.name || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Родитель</span>
                  <strong>
                    {row.parent ? `${row.parent.name} (${row.parent.code})` : '—'}
                  </strong>
                </div>
                <div className={styles.field}>
                  <span>Юридическое лицо</span>
                  <strong>{row.legalEntity || '—'}</strong>
                </div>
              </div>
              <div className={styles.audit}>
                <div className={styles.field}>
                  <span>Создал</span>
                  <strong>{row.createdByLabel || 'Admin'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Изменил</span>
                  <strong>{row.updatedByLabel || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата создания</span>
                  <strong>{fmtDateTime(row.createdAt)}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата изменения</span>
                  <strong>{fmtDateTime(row.updatedAt)}</strong>
                </div>
              </div>
            </>
          ) : null}

          {panel === 'positions' ? (
            <>
              <h3 className={styles.mainTitle}>Позиции</h3>
              {(row.staffPositions || []).length === 0 ? (
                <p style={{ color: '#6b7280' }}>Нет данных</p>
              ) : (
                <ul>
                  {(row.staffPositions || []).map((sp) => (
                    <li key={sp.id}>
                      {sp.code} — {sp.position?.name || sp.title || '—'}
                    </li>
                  ))}
                </ul>
              )}
              {(row.children || []).length > 0 ? (
                <>
                  <h3 className={styles.mainTitle} style={{ marginTop: '1rem' }}>
                    Дочерние подразделения
                  </h3>
                  <ul>
                    {row.children!.map((c) => (
                      <li key={c.id}>
                        <Link href={`/divisions/${c.id}`}>
                          {c.code} — {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}

          {panel === 'history' ? (
            <>
              <h3 className={styles.mainTitle}>История изменений</h3>
              <div className={styles.audit}>
                <div className={styles.field}>
                  <span>Создал</span>
                  <strong>{row.createdByLabel || 'Admin'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата создания</span>
                  <strong>{fmtDateTime(row.createdAt)}</strong>
                </div>
                <div className={styles.field}>
                  <span>Изменил</span>
                  <strong>{row.updatedByLabel || '—'}</strong>
                </div>
                <div className={styles.field}>
                  <span>Дата изменения</span>
                  <strong>{fmtDateTime(row.updatedAt)}</strong>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function DivisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <DivisionViewInner id={id} />
    </Suspense>
  );
}
