'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { API_URL, apiFetch, setSession } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { initials } from '../_lib/mobile';

type Profile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenant: { id: string; code: string; name: string } | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    tabNumber: string;
    phone?: string | null;
    division?: { name: string } | null;
    position?: { name: string } | null;
    schedule?: { name: string } | null;
  } | null;
};

export default function MobileProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setProfile(await apiFetch<Profile>('/api/mobile/v1/profile'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function logout() {
    setSession(null);
    router.replace('/m/login');
  }

  const rows: { label: string; value: string }[] = profile
    ? [
        { label: 'Email', value: profile.email },
        { label: 'Rol', value: profile.role },
        { label: 'Tashkilot', value: profile.tenant?.name ?? '—' },
        { label: 'Tabel raqami', value: profile.employee?.tabNumber ?? '—' },
        { label: "Bo'lim", value: profile.employee?.division?.name ?? '—' },
        { label: 'Lavozim', value: profile.employee?.position?.name ?? '—' },
        { label: 'Jadval', value: profile.employee?.schedule?.name ?? '—' },
        { label: 'Telefon', value: profile.employee?.phone ?? '—' },
        { label: 'Server', value: API_URL },
      ]
    : [];

  return (
    <MobileFrame title="Profil" subtitle="HR HUB">
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.profileHead}>
        <span className={styles.avatar}>{initials(profile?.fullName)}</span>
        <span className={styles.profileMeta}>
          <strong>{profile?.fullName ?? '—'}</strong>
          <small>{profile?.tenant?.name ?? 'HR HUB'}</small>
        </span>
      </div>

      <section className={styles.card}>
        <ul className={styles.rowList}>
          {rows.map((r) => (
            <li key={r.label}>
              <div className={styles.row}>
                <span className={styles.rowMain}>
                  <strong>{r.label}</strong>
                </span>
                <span className={styles.rowValue}>{r.value}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/dashboard" className={styles.secondaryBtn}>
        Veb versiya (to‘liq)
      </Link>

      <button type="button" className={styles.dangerBtn} onClick={logout}>
        Chiqish
      </button>
    </MobileFrame>
  );
}
