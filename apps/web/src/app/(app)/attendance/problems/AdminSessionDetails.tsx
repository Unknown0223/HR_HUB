'use client';

import { mediaSrc } from '@/lib/media';
import styles from './admin-session.module.css';

type Candidate = { employeeId: string; name: string; tabNumber?: string; score: number };
type Identity = {
  status: 'match' | 'unknown' | 'no_face' | 'no_frames';
  frames: number;
  facesFound: number;
  threshold: number;
  compared: number;
  ambiguous: boolean;
  candidates: Candidate[];
};
type LoginBy = { employeeId: string | null; name: string; employeeNo: string } | null;
type Operation = { serial: number; time: string; code: string; label: string; local: boolean; name?: string; remoteHost?: string };
type Change = {
  section: string;
  kind: 'added' | 'removed' | 'changed';
  key?: string;
  before?: unknown;
  after?: unknown;
  employeeNo?: string;
  name?: string;
  employeeName?: string;
  byServer?: boolean;
};
type Audit = {
  snapshotsAt?: string;
  photos?: { photoKey: string; photoUrl: string }[];
  identity?: Identity;
  loginBy?: LoginBy;
  completedAt?: string;
  endReason?: string | null;
  baselineAt?: string | null;
  diffAvailable?: boolean;
  operations?: Operation[];
  changes?: Change[];
};

const SECTION_LABEL: Record<string, string> = {
  time: 'Время',
  ntp: 'NTP',
  network: 'Сеть',
  device: 'Устройство',
  acs: 'Контроль доступа',
  cardReader: 'Считыватель',
  door: 'Дверь',
  users: 'Количество пользователей',
  persons: 'Персоны',
};

const END_REASON: Record<string, string> = {
  logout: 'выход из меню',
  unlocked: 'терминал разблокирован',
  timeout: 'выход не зафиксирован (15 мин)',
  next_login: 'новый вход администратора',
};

const PERSON_FIELD: Record<string, string> = {
  name: 'имя',
  userType: 'тип',
  localUIRight: 'доступ к меню',
  numOfFace: 'лиц',
  numOfCard: 'карт',
};

function fmt(v: unknown) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('ru-RU');
}

function pct(score: number) {
  return `${Math.round(Math.max(0, score) * 100)}%`;
}

function IdentityLine({ identity, loginBy }: { identity?: Identity; loginBy?: LoginBy }) {
  if (loginBy) {
    return (
      <p>
        <b>Вошёл (по данным терминала):</b> {loginBy.name}
        {loginBy.employeeId ? '' : ` — № ${loginBy.employeeNo} не найден среди сотрудников`}
      </p>
    );
  }
  if (!identity) return <p className={styles.muted}>Ожидаем снимок с камеры терминала…</p>;
  const top = identity.candidates[0];
  if (identity.status === 'match' && top) {
    return (
      <p>
        <b>Вероятно:</b> {top.name} ({pct(top.score)})
        {identity.ambiguous ? (
          <span className={styles.warn}> — похож и на другого сотрудника, проверьте фото</span>
        ) : null}
      </p>
    );
  }
  if (identity.status === 'no_frames') {
    return <p className={styles.muted}>Камера терминала не отдала снимок.</p>;
  }
  if (identity.status === 'no_face') {
    return <p className={styles.muted}>На снимках не найдено лицо.</p>;
  }
  return (
    <p>
      <b>Не опознан</b> — лицо не совпало ни с одним из {identity.compared} сотрудников с фото
      (порог {pct(identity.threshold)}).
    </p>
  );
}

function changeText(c: Change) {
  const who = c.employeeName || c.name || c.employeeNo || '';
  if (c.section === 'persons') {
    if (c.kind === 'added') return `Добавлен: ${who} (№ ${c.employeeNo})`;
    if (c.kind === 'removed') return `Удалён: ${who} (№ ${c.employeeNo})`;
    const field = PERSON_FIELD[c.key ?? ''] ?? c.key;
    return `${who}: ${field} ${fmt(c.before)} → ${fmt(c.after)}`;
  }
  return `${c.key}: ${fmt(c.before)} → ${fmt(c.after)}`;
}

export function AdminSessionDetails({ payload }: { payload: Record<string, unknown> }) {
  const audit = (payload.audit ?? {}) as Audit;
  const photos = audit.photos ?? [];
  const changes = audit.changes ?? [];
  const operations = audit.operations ?? [];
  const candidates = audit.identity?.candidates ?? [];

  return (
    <div className={styles.wrap}>
      <section>
        <h4>Кто ввёл пароль</h4>
        <IdentityLine identity={audit.identity} loginBy={audit.loginBy} />
        {photos.length ? (
          <div className={styles.photos}>
            {photos.map((p) => {
              const src = mediaSrc(p.photoUrl, p.photoKey);
              return src ? (
                <a key={p.photoKey} href={src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="Снимок камеры терминала" />
                </a>
              ) : null;
            })}
          </div>
        ) : null}
        {candidates.length > 1 ? (
          <p className={styles.muted}>
            Ближайшие: {candidates.map((c) => `${c.name} ${pct(c.score)}`).join(', ')}
          </p>
        ) : null}
      </section>

      <section>
        <h4>Что изменили</h4>
        {!audit.completedAt ? (
          <p className={styles.muted}>Сессия ещё открыта — отчёт придёт после выхода из меню терминала.</p>
        ) : (
          <>
            <p className={styles.muted}>
              Завершено {fmtTime(audit.completedAt)} ({END_REASON[audit.endReason ?? ''] ?? audit.endReason ?? '—'})
            </p>
            {!audit.diffAvailable ? (
              <p className={styles.warn}>
                Нет снимка настроек до входа (шлюз перезапускался) — сравнение недоступно, смотрите журнал.
              </p>
            ) : changes.length === 0 ? (
              <p>Настройки и список персон не изменились.</p>
            ) : (
              <ul className={styles.changes}>
                {changes.map((c, i) => (
                  <li key={i} className={c.byServer ? styles.server : undefined}>
                    <span className={styles.section}>{SECTION_LABEL[c.section] ?? c.section}</span>
                    {changeText(c)}
                    {c.byServer ? <span className={styles.tag}>синхронизация Worklyn</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {operations.length ? (
        <section>
          <h4>Журнал терминала</h4>
          <table className={styles.ops}>
            <tbody>
              {operations.map((o) => (
                <tr key={`${o.serial}-${o.time}`} className={o.local ? styles.local : undefined}>
                  <td>{fmtTime(o.time)}</td>
                  <td>
                    {o.label}
                    {o.name ? ` — ${o.name}` : ''}
                    {o.remoteHost ? ` (${o.remoteHost})` : ''}
                  </td>
                  <td className={styles.muted}>{o.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
