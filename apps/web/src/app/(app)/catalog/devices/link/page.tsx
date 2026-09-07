'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
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
  const [error, setError] = useState('');
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [download, setDownload] = useState<DownloadInfo | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [copied, setCopied] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await apiFetch<SessionRow[] | { items: SessionRow[] }>(
        '/api/attendance/office-link/sessions',
      );
      setSessions(Array.isArray(rows) ? rows : rows.items || []);
    } catch {
      /* ignore poll errors */
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
  }, []);

  useEffect(() => {
    void loadDownload();
    void loadSessions();
    const t = setInterval(() => void loadSessions(), 2000);
    return () => clearInterval(t);
  }, [loadDownload, loadSessions]);

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
      setError(e instanceof Error ? e.message : 'Не удалось создать токен');
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
      </p>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>1. Скачать HR HUB Link</h2>
          <p className={styles.cardHint}>
            Установите программу на офисный ПК в одной сети с терминалом Face ID.
          </p>
          {download?.url ? (
            <a
              className={styles.primaryBtn}
              href={download.url}
              target="_blank"
              rel="noreferrer"
            >
              Скачать .exe
              {download.version ? ` (v${download.version})` : ''}
            </a>
          ) : (
            <p className={styles.muted}>
              Ссылка ещё не настроена (`OFFICE_LINK_DOWNLOAD_URL`). Локально:
              запустите <code>tools/office-link/BUILD-EXE.bat</code> →{' '}
              <code>dist/HRHUB-Qurilma/HRHUB-Qurilma.exe</code>, либо{' '}
              <code>BOSHLASH.bat</code> (Python). Инструкция:{' '}
              <code>tools/office-link/QOLLAMA.txt</code>
            </p>
          )}
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
          <button type="button" className={styles.ghostBtn} onClick={() => void loadSessions()}>
            Обновить
          </button>
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
