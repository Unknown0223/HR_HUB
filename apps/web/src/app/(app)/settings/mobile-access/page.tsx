'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import shared from '../../../page-shared.module.css';
import styles from './page.module.css';

type Account = {
  userId: string;
  loginName: string;
  login: string;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
};

type Row = {
  employeeId: string;
  tabNumber: string;
  fullName: string;
  division: string | null;
  position: string | null;
  account: Account | null;
};

type ListResponse = { total: number; withAccount: number; items: Row[] };

type Filter = '' | 'with' | 'without' | 'blocked';

type Issued = { server: string; login: string; password: string; fullName: string };

const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(len = 10) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join('');
}

function suggestLogin(fullName: string) {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
    ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  };
  const latin = fullName
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[ʻʼ'`‘’]/g, '');
  const [last = '', first = ''] = latin.split(/\s+/);
  return [first, last]
    .filter(Boolean)
    .join('.')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

function fmtDate(v: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
}

export default function MobileAccessPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** This site's host: the app's «Server» field takes the same link. */
  const [serverLink, setServerLink] = useState('');

  const [editing, setEditing] = useState<Row | null>(null);
  const [loginDraft, setLoginDraft] = useState('');
  const [passDraft, setPassDraft] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [rowBusy, setRowBusy] = useState('');

  useEffect(() => {
    setServerLink(window.location.host);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (filter) params.set('filter', filter);
      const res = await apiFetch<ListResponse>(
        `/api/mobile-accounts${params.size ? `?${params}` : ''}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function openEditor(row: Row) {
    setEditing(row);
    setLoginDraft(row.account?.loginName || suggestLogin(row.fullName));
    setPassDraft(row.account ? '' : generatePassword());
    setShowPass(!row.account);
    setModalErr('');
  }

  async function saveAccount() {
    if (!editing) return;
    setModalBusy(true);
    setModalErr('');
    try {
      const password = passDraft.trim();
      const res = await apiFetch<{ account: Account | null }>(
        `/api/mobile-accounts/${editing.employeeId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ login: loginDraft, password: password || null }),
        },
      );
      if (password && res.account) {
        setIssued({
          server: serverLink,
          login: res.account.loginName,
          password,
          fullName: editing.fullName,
        });
      }
      setEditing(null);
      setPassDraft('');
      await load();
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setModalBusy(false);
    }
  }

  async function toggleActive(row: Row) {
    if (!row.account) return;
    setRowBusy(row.employeeId);
    try {
      await apiFetch(`/api/mobile-accounts/${row.employeeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.account.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRowBusy('');
    }
  }

  async function removeAccount(row: Row) {
    if (!row.account) return;
    if (!window.confirm(`Удалить аккаунт «${row.account.loginName}» (${row.fullName})?`)) return;
    setRowBusy(row.employeeId);
    try {
      await apiFetch(`/api/mobile-accounts/${row.employeeId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setRowBusy('');
    }
  }

  const issuedText = useMemo(
    () =>
      issued
        ? `HR HUB mobil ilova\nServer: ${issued.server}\nLogin: ${issued.login}\nParol: ${issued.password}`
        : '',
    [issued],
  );

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="settings-users" />

      <header className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${styles.iconBadge}`} aria-hidden="true">
          <i className="fas fa-mobile-alt" />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Мобильное приложение</h1>
          <p className={shared.pageSubtitle}>
            Доступ сотрудников: логины и пароли для входа в приложение
          </p>
        </div>
      </header>

      <section className={styles.howTo}>
        <div className={styles.howToTitle}>Как войти сотруднику</div>
        <ol>
          <li>
            Server: <b>{serverLink || '…'}</b> (ссылка уже указана в приложении по умолчанию)
          </li>
          <li>Логин: выданный HR (например <b>ali.valiyev</b>)</li>
          <li>Пароль: выданный HR — затем сотрудник меняет его в «Sozlamalar → Parolni o‘zgartirish»</li>
        </ol>
        <p className={styles.mutedSmall}>
          Логины уникальны во всей системе: один и тот же логин не может быть у двух компаний,
          поэтому сотрудник всегда попадает только в свою компанию. Пароли хранятся в
          зашифрованном виде: их нельзя посмотреть — только задать новый.
        </p>
      </section>

      {issued ? (
        <section className={styles.issued}>
          <div>
            <div className={styles.issuedTitle}>Данные для входа — {issued.fullName}</div>
            <pre className={styles.issuedPre}>{issuedText}</pre>
            <p className={styles.mutedSmall}>
              Передайте сотруднику. После закрытия пароль больше не будет показан.
            </p>
          </div>
          <div className={styles.issuedActions}>
            <button
              type="button"
              className={shared.btn}
              onClick={() => void navigator.clipboard?.writeText(issuedText)}
            >
              Копировать
            </button>
            <button type="button" className={shared.btnGhost} onClick={() => setIssued(null)}>
              Закрыть
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.toolbar}>
        <input
          className={styles.input}
          placeholder="Поиск по ФИО…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={styles.input}
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="">Все сотрудники</option>
          <option value="with">С аккаунтом</option>
          <option value="without">Без аккаунта</option>
          <option value="blocked">Заблокированные</option>
        </select>
        {data ? (
          <span className={styles.muted}>
            Показано: {data.total} · с аккаунтом: {data.withAccount}
          </span>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Таб. №</th>
              <th>Сотрудник</th>
              <th>Логин</th>
              <th>Статус</th>
              <th>Пароль изменён</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {data && !data.items.length ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  Нет сотрудников
                </td>
              </tr>
            ) : null}
            {data?.items.map((row) => (
              <tr key={row.employeeId}>
                <td>{row.tabNumber}</td>
                <td>
                  <Link href={`/employees/${row.employeeId}`} className={styles.name}>
                    {row.fullName}
                  </Link>
                  <div className={styles.mutedSmall}>
                    {[row.position, row.division].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className={styles.mono}>{row.account?.loginName ?? '—'}</td>
                <td>
                  {!row.account ? (
                    <span className={`${styles.pill} ${styles.pillNone}`}>Нет аккаунта</span>
                  ) : row.account.isActive ? (
                    <span className={`${styles.pill} ${styles.pillOk}`}>Активен</span>
                  ) : (
                    <span className={`${styles.pill} ${styles.pillBlocked}`}>Заблокирован</span>
                  )}
                </td>
                <td>{fmtDate(row.account?.passwordChangedAt ?? null)}</td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    className={row.account ? shared.btnGhost : shared.btn}
                    disabled={rowBusy === row.employeeId}
                    onClick={() => openEditor(row)}
                  >
                    {row.account ? 'Сменить пароль' : 'Создать аккаунт'}
                  </button>
                  {row.account ? (
                    <>
                      <button
                        type="button"
                        className={shared.btnGhost}
                        disabled={rowBusy === row.employeeId}
                        onClick={() => void toggleActive(row)}
                      >
                        {row.account.isActive ? 'Заблокировать' : 'Разблокировать'}
                      </button>
                      <button
                        type="button"
                        className={`${shared.btnGhost} ${styles.danger}`}
                        disabled={rowBusy === row.employeeId}
                        onClick={() => void removeAccount(row)}
                        title="Удалить аккаунт"
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className={styles.backdrop} onClick={() => !modalBusy && setEditing(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.cardTitle}>
              {editing.account ? 'Аккаунт сотрудника' : 'Новый аккаунт'}
            </h3>
            <p className={styles.muted}>{editing.fullName}</p>

            <label className={styles.label}>Логин</label>
            <input
              className={styles.input}
              value={loginDraft}
              onChange={(e) => setLoginDraft(e.target.value.toLowerCase())}
              placeholder="ali.valiyev"
              maxLength={32}
              disabled={!!editing.account?.loginName.includes('@')}
            />
            <p className={styles.mutedSmall}>
              {editing.account?.loginName.includes('@')
                ? 'Служебный аккаунт — логин меняется в «Пользователи»'
                : 'Латиница, цифры, «.», «_», «-». Должен быть уникальным во всей системе'}
            </p>

            <label className={styles.label}>
              {editing.account ? 'Новый пароль' : 'Пароль'}
            </label>
            <div className={styles.passRow}>
              <input
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                value={passDraft}
                autoComplete="new-password"
                placeholder={editing.account ? 'Оставьте пустым, чтобы не менять' : 'Минимум 8 символов'}
                onChange={(e) => setPassDraft(e.target.value)}
              />
              <button
                type="button"
                className={shared.btnGhost}
                onClick={() => setShowPass((v) => !v)}
                title={showPass ? 'Скрыть' : 'Показать'}
              >
                <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
              <button
                type="button"
                className={shared.btnGhost}
                onClick={() => {
                  setPassDraft(generatePassword());
                  setShowPass(true);
                }}
                title="Сгенерировать"
              >
                <i className="fas fa-random" />
              </button>
            </div>
            <p className={styles.mutedSmall}>
              Текущий пароль посмотреть нельзя — можно только задать новый.
            </p>

            {modalErr ? <p className={styles.error}>{modalErr}</p> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={shared.btnGhost}
                disabled={modalBusy}
                onClick={() => setEditing(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={shared.btn}
                disabled={modalBusy || !loginDraft.trim() || (!editing.account && passDraft.trim().length < 8)}
                onClick={() => void saveAccount()}
              >
                {modalBusy ? '…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
