'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, getAccessToken, getSession } from '@/lib/api';
import { confirm } from '@/lib/dialogs';
import styles from './page.module.css';
import shared from '../../../../page-shared.module.css';

type PairingResult = {
  token: string;
  expiresAt: string;
  sessionId: string;
  qrPayload?: string;
};

type DownloadInfo = {
  url?: string | null;
  version?: string | null;
  available?: boolean;
};

type BindInfo = {
  apiUrl: string;
  webUrl: string;
  tenantCode: string;
  tenantName?: string;
  installerUrl?: string | null;
  version?: string | null;
  installerAvailable?: boolean;
};

type SessionRow = {
  id: string;
  status: string;
  step?: string | null;
  percent?: number;
  host?: string | null;
  serial?: string | null;
  deviceId?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU');
}

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === 'linked') return styles.pillOk;
  if (s === 'failed') return styles.pillDanger;
  if (s === 'configuring' || s === 'scanning') return styles.pillWarn;
  return styles.pillMuted;
}

export default function DeviceLinkPage() {
  const [busy, setBusy] = useState(false);
  const [boundBusy, setBoundBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [error, setError] = useState('');
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [download, setDownload] = useState<DownloadInfo | null>(null);
  const [bind, setBind] = useState<BindInfo | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [copied, setCopied] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await apiFetch<SessionRow[] | { items: SessionRow[] }>(
        '/api/attendance/office-link/sessions',
      );
      setSessions(Array.isArray(rows) ? rows : rows.items || []);
      setError((prev) =>
        prev.toLowerCase().includes('internal server') ||
        prev.toLowerCase().includes('does not exist')
          ? ''
          : prev,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить сессии';
      // Surface once (poll would spam); clear when API recovers.
      setError((prev) => prev || msg);
    }
  }, []);

  const loadDownload = useCallback(async () => {
    try {
      const info = await apiFetch<DownloadInfo>(
        '/api/attendance/office-link/download?redirect=0',
      );
      setDownload(info);
    } catch {
      setDownload({ available: false });
    }
    try {
      const b = await apiFetch<BindInfo>(
        '/api/attendance/office-link/download-bound?format=json',
      );
      setBind(b);
    } catch {
      setBind(null);
    }
  }, []);

  useEffect(() => {
    void loadDownload();
    void loadSessions();
    const t = setInterval(() => void loadSessions(), 2000);
    return () => clearInterval(t);
  }, [loadDownload, loadSessions]);

  async function downloadBoundPack() {
    setBoundBusy(true);
    setError('');
    try {
      const session = getSession();
      const headers = new Headers();
      const token = getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const tenantId = session?.tenant?.id ?? session?.user.tenantId;
      if (tenantId) headers.set('X-Tenant-Id', tenantId);
      const res = await fetch('/api/attendance/office-link/download-bound', {
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        let message = res.statusText;
        try {
          const body = await res.json();
          message = body.message || message;
        } catch {
          /* ignore */
        }
        throw new Error(typeof message === 'string' ? message : 'Yuklab bo‘lmadi');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/i);
      const filename =
        m?.[1] ||
        `HRHUB-Link-${bind?.tenantCode || 'bind'}-bind.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bog‘langan to‘plam yuklanmadi');
    } finally {
      setBoundBusy(false);
    }
  }
  async function createPairing() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const res = await apiFetch<PairingResult>(
        '/api/attendance/office-link/pairing-token',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPairing(res);
      await loadSessions();
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Не удалось создать токен';
      const lower = raw.toLowerCase();
      setError(
        lower.includes('does not exist') || lower.includes('device_provision')
          ? 'База ещё без таблицы pairing-сессий. Нужен migrate на API (device_provision_sessions).'
          : raw === 'Internal Server Error'
            ? 'Ошибка сервера при создании токена. Проверьте API / миграции БД.'
            : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!pairing?.token) return;
    try {
      await navigator.clipboard.writeText(pairing.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Буфер алмаштириш ишламади');
    }
  }

  async function clearSessions() {
    if (!sessions.length) return;
    const ok = await confirm({
      title: 'Сессии подключения',
      message: `Ro‘yxatdagi barcha ulanish sessiyalarini o‘chirish (${sessions.length})?`,
      confirmText: 'Tozalash',
      cancelText: 'Bekor',
      variant: 'danger',
    });
    if (!ok) return;
    setClearBusy(true);
    setError('');
    try {
      await apiFetch<{ ok: boolean; deleted: number }>(
        '/api/attendance/office-link/sessions',
        { method: 'DELETE' },
      );
      setSessions([]);
      setPairing(null);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сессии очистить не удалось');
    } finally {
      setClearBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="devices" />

      <div className={shared.pageHeader}>
        <span className={shared.pageIconBadge} aria-hidden>
          <i className="fas fa-link" />
        </span>
        <div>
          <h1 className={shared.pageTitle}>Связь с офисом (HR HUB Link)</h1>
          <p className={shared.pageSubtitle}>
            Скачайте программу, создайте pairing-токен и следите за подключением терминала
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <Link href="/catalog/devices" className={styles.ghostBtn}>
            ← К устройствам
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <p className={styles.serviceNote}>
        <strong>Faza 2 (Service):</strong> GUI yopilganda tunnel/GW ishlashi uchun Windows Service
        o‘rnatish mumkin (`install-service.bat` / <code>SERVICE.txt</code>). Yo‘riqnoma:{' '}
        <code>tools/office-link/QOLLAMA.txt</code>.
        {' '}
        Wi‑Fi o‘zgasa office-link → <strong>Tarmoqni qayta ulash</strong> (parol va yuzlar
        saqlanadi; to‘liq Ulash shart emas).
      </p>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>1. Скачать HR HUB Link</h2>
          <p className={styles.cardHint}>
            Har bir web o‘z ilovasini beradi: yuklab olgan to‘plam shu platformaga
            (API + tenant) bog‘lanadi. Boshqa mijoz webiga ulash uchun o‘sha webdan
            yangi to‘plam oling.
          </p>
          {bind ? (
            <p className={styles.muted}>
              Shu web: <strong>{bind.webUrl}</strong>
              {' · '}
              tenant <code>{bind.tenantCode}</code>
              {bind.tenantName ? ` (${bind.tenantName})` : ''}
              <br />
              API: <code>{bind.apiUrl}</code>
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={boundBusy}
              onClick={() => void downloadBoundPack()}
            >
              {boundBusy
                ? 'Tayyorlanmoqda…'
                : 'Shu web uchun bog‘langan to‘plam (.zip)'}
            </button>
            {download?.url ? (
              <a
                className={styles.ghostBtn}
                href={download.url}
                target="_blank"
                rel="noreferrer"
              >
                To‘liq dastur
                {download.version ? ` (v${download.version})` : ''}
              </a>
            ) : null}
          </div>
          <p className={styles.muted} style={{ marginTop: '0.75rem' }}>
            Zip ichida: <code>config.json</code>, shifrlangan{' '}
            <code>connection.hrhub</code>, qo‘llanma. Dasturni ochishdan oldin
            fayllarni HR HUB Link papkasiga qo‘ying (yoki avval to‘liq dasturni
            yuklab, keyin shu fayllarni ustiga yozing).
            {!download?.url ? (
              <>
                {' '}
                To‘liq EXE hali sozlanmagan (`OFFICE_LINK_DOWNLOAD_URL`) — lokal:{' '}
                <code>BUILD-EXE.bat</code> / <code>BOSHLASH.bat</code>.
              </>
            ) : null}
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>2. Pairing-токен</h2>
          <p className={styles.cardHint}>
            Токен действует ~15 минут. Вставьте его в HR HUB Link (поле «Pairing token»).
            При привязке сессии клиент может получить field link key для gateway.
            Альтернатива: ADMIN-PAROL.bat + DEVICE_LINK_KEY (без показа оператору).
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={busy}
            onClick={() => void createPairing()}
          >
            {busy ? 'Создание…' : 'Создать токен'}
          </button>
          {pairing ? (
            <div className={styles.tokenBox}>
              <div className={styles.tokenMeta}>
                Сессия: <code>{pairing.sessionId.slice(0, 8)}…</code>
                {' · '}
                до {fmtDt(pairing.expiresAt)}
              </div>
              <code className={styles.tokenValue}>{pairing.token}</code>
              <button type="button" className={styles.ghostBtn} onClick={() => void copyToken()}>
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
              {pairing.qrPayload ? (
                <p className={styles.muted}>QR payload: {pairing.qrPayload}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className={styles.cardWide}>
        <div className={styles.cardHeadRow}>
          <h2 className={styles.cardTitle}>3. Сессии подключения</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={clearBusy || sessions.length === 0}
              onClick={() => void clearSessions()}
            >
              {clearBusy ? 'Tozalanmoqda…' : 'Tozalash'}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => void loadSessions()}>
              Обновить
            </button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Статус</th>
                <th>Шаг</th>
                <th>%</th>
                <th>Host</th>
                <th>Serial</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Пока нет сессий — создайте токен и запустите HR HUB Link
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className={`${styles.pill} ${statusPill(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>{s.step || '—'}</td>
                    <td>{s.percent ?? 0}</td>
                    <td>{s.host || '—'}</td>
                    <td>{s.serial || '—'}</td>
                    <td>{fmtDt(s.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
