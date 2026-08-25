'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getSession } from '@/lib/api';
import styles from '../../page-shared.module.css';

type Tenant = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export default function TenantsPage() {
  const [rows, setRows] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (session?.user.role !== 'platform_admin') {
      setError(
        'Доступ только для platform_admin. Логин: platform@hrhub.local',
      );
      setLoading(false);
      return;
    }
    apiFetch<Tenant[]>('/api/tenants')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.h1}>Tenants</h1>
        <p className={styles.lead}>Список компаний (уровень платформы).</p>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : !error ? (
        <div className={styles.panel}>
          <table>
            <thead>
              <tr>
                <th>Код</th>
                <th>Наименование</th>
                <th>Активен</th>
                <th>Создан</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.code}</td>
                  <td>{t.name}</td>
                  <td>{t.isActive ? 'да' : 'нет'}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
