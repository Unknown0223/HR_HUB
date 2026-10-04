'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import {
  RangeCalendar,
  addDaysYmd,
  addMonthsYmd,
  daysBetween,
  fmtYmd,
  localTodayYmd,
  monthEndYmd,
  monthStartYmd,
  type YmdRange,
} from '@/components/RangeCalendar';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import styles from './copy.module.css';

type Emp = {
  id: string;
  fullName: string;
  tabNumber: string;
  division?: { id: string; name: string } | null;
  position?: { name: string } | null;
  marksCount: number;
  targetCount: number;
};

type Preview = {
  days: number;
  targetTo: string | null;
  dayCounts: Record<string, number>;
  employees: Emp[];
};

type CopyResult = { ok: boolean; copied: number; skipped?: number; message?: string };

const MAX_DAYS = 62;
const PREVIEW_URL = '/api/attendance/marks/copy/preview';

function mondayOf(ymd: string) {
  const wd = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysYmd(ymd, -wd);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function CopyInner() {
  const { lang } = useI18n();
  const L = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);
  const today = useMemo(() => localTodayYmd(), []);

  const [from, setFrom] = useState(() => addDaysYmd(today, -1));
  const [to, setTo] = useState(() => addDaysYmd(today, -1));
  const [targetFrom, setTargetFrom] = useState(today);
  const [view, setView] = useState(() => addMonthsYmd(monthStartYmd(today), -1));
  const [mode, setMode] = useState<'source' | 'target'>('source');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const [data, setData] = useState<Preview | null>(null);
  const [selDayCounts, setSelDayCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState('');
  const [division, setDivision] = useState('');
  const [onlyWithMarks, setOnlyWithMarks] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null);

  const days = daysBetween(from, to) + 1;
  const targetTo = addDaysYmd(targetFrom, days - 1);
  const windowFrom = view;
  const windowTo = monthEndYmd(addMonthsYmd(view, 1));
  const selectedIds = useMemo(() => [...selected], [selected]);

  useEffect(() => {
    if (anchor) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch<Preview>(PREVIEW_URL, {
          method: 'POST',
          body: JSON.stringify({ from, to, targetFrom, windowFrom, windowTo }),
        });
        if (!cancelled) {
          setData(res);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [from, to, targetFrom, windowFrom, windowTo, anchor, reload]);

  useEffect(() => {
    if (!selectedIds.length) {
      setSelDayCounts(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<Preview>(PREVIEW_URL, {
          method: 'POST',
          body: JSON.stringify({ employeeIds: selectedIds, from, to, windowFrom, windowTo }),
        });
        if (!cancelled) setSelDayCounts(res.dayCounts);
      } catch {
        if (!cancelled) setSelDayCounts(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selectedIds, from, to, windowFrom, windowTo, reload]);

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const divisions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) if (e.division) map.set(e.division.id, e.division.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees]);
  const withMarks = useMemo(() => employees.filter((e) => e.marksCount > 0).length, [employees]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (onlyWithMarks && e.marksCount === 0 && !selected.has(e.id)) return false;
      if (division && e.division?.id !== division) return false;
      if (qq && !`${e.fullName} ${e.tabNumber}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [employees, q, division, onlyWithMarks, selected]);

  const chosen = useMemo(() => employees.filter((e) => selected.has(e.id)), [employees, selected]);
  const totalMarks = chosen.reduce((s, e) => s + e.marksCount, 0);
  const totalExisting = chosen.reduce((s, e) => s + e.targetCount, 0);
  const overlaps = targetFrom <= to && targetTo >= from;
  const sameStart = targetFrom === from;
  const allVisibleOn = visible.length > 0 && visible.every((e) => selected.has(e.id));

  const shownSource: YmdRange =
    anchor && hover
      ? anchor <= hover
        ? { from: anchor, to: hover }
        : { from: hover, to: anchor }
      : { from, to };
  const shownTarget: YmdRange | null = anchor
    ? null
    : mode === 'target' && hover
      ? { from: hover, to: addDaysYmd(hover, days - 1) }
      : { from: targetFrom, to: targetTo };

  function resetOutcome() {
    setResult(null);
    setConfirming(false);
  }

  function pickDay(d: string) {
    resetOutcome();
    if (mode === 'target') {
      setTargetFrom(d);
      return;
    }
    if (!anchor) {
      setAnchor(d);
      return;
    }
    let a = anchor;
    let b = d;
    if (b < a) [a, b] = [b, a];
    if (daysBetween(a, b) + 1 > MAX_DAYS) b = addDaysYmd(a, MAX_DAYS - 1);
    setFrom(a);
    setTo(b);
    setAnchor(null);
    if (targetFrom >= a && targetFrom <= b) setTargetFrom(addDaysYmd(b, 1));
    setMode('target');
  }

  function applyPreset(src: YmdRange, target: string) {
    resetOutcome();
    setAnchor(null);
    setFrom(src.from);
    setTo(src.to);
    setTargetFrom(target);
    setMode('target');
    const last = monthStartYmd(target > src.to ? target : src.to);
    setView(monthStartYmd(src.from) === last ? addMonthsYmd(last, -1) : monthStartYmd(src.from));
  }

  const thisMonday = mondayOf(today);
  const presets: Array<{ label: string; src: YmdRange; target: string }> = [
    { label: L('Вчера → сегодня', 'Kecha → bugun'), src: { from: addDaysYmd(today, -1), to: addDaysYmd(today, -1) }, target: today },
    { label: L('Сегодня → завтра', 'Bugun → ertaga'), src: { from: today, to: today }, target: addDaysYmd(today, 1) },
    {
      label: L('Прошлая неделя → эта', 'O‘tgan hafta → shu hafta'),
      src: { from: addDaysYmd(thisMonday, -7), to: addDaysYmd(thisMonday, -1) },
      target: thisMonday,
    },
    {
      label: L('Эта неделя → следующая', 'Shu hafta → keyingi hafta'),
      src: { from: thisMonday, to: addDaysYmd(thisMonday, 6) },
      target: addDaysYmd(thisMonday, 7),
    },
  ];

  function toggle(id: string) {
    resetOutcome();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    resetOutcome();
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visible) {
        if (on) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
  }

  async function runCopy() {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<CopyResult>('/api/attendance/marks/copy', {
        method: 'POST',
        body: JSON.stringify({ employeeIds: selectedIds, from, to, targetFrom, skipExisting }),
      });
      if (!res.ok) {
        setError(res.message || 'Не найдены отметки для копирования');
      } else {
        setResult({ copied: res.copied, skipped: res.skipped ?? 0 });
        setReload((x) => x + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const canCopy = selected.size > 0 && totalMarks > 0 && !sameStart && !anchor && !busy;
  const counts = selDayCounts ?? data?.dayCounts ?? {};

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" titleOverride="Копирование отметок" />

      <header className={styles.hero}>
        <span className={styles.heroIcon}>
          <i className="fas fa-clone" aria-hidden />
        </span>
        <div className={styles.heroText}>
          <h1>{L('Копирование отметок', 'Belgilarni nusxalash')}</h1>
          <p>
            {L(
              'Отметки выбранных сотрудников за один период повторяются на других датах с тем же временем. Удобно, когда смена повторяется или нужно заполнить пропущенные дни.',
              'Tanlangan xodimlarning bir davrdagi belgilari boshqa sanalarga xuddi shu vaqt bilan takrorlanadi. Smena takrorlanganda yoki o‘tkazib yuborilgan kunlarni to‘ldirishda qulay.',
            )}
          </p>
        </div>
        <Link href="/attendance/marks" className={styles.btnGhost}>
          <i className="fas fa-arrow-left" aria-hidden /> {L('К отметкам', 'Belgilarga qaytish')}
        </Link>
      </header>

      {error ? (
        <div className={`${styles.alert} ${styles.alertDanger}`}>
          <i className="fas fa-exclamation-circle" aria-hidden /> {error}
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.col}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.step}>1</span>
              <div>
                <h2>{L('Период и дата копирования', 'Davr va nusxa sanasi')}</h2>
                <p>{L('Выберите дни в календаре', 'Kalendardan kunlarni tanlang')}</p>
              </div>
            </div>

            <div className={styles.modeTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'source'}
                className={`${styles.modeTab} ${styles.modeSource} ${mode === 'source' ? styles.modeOn : ''}`}
                onClick={() => {
                  setMode('source');
                  setAnchor(null);
                }}
              >
                <span className={styles.modeDot} />
                <span className={styles.modeLabel}>{L('Откуда копировать', 'Qayerdan nusxalash')}</span>
                <strong>{from === to ? fmtYmd(from) : `${fmtYmd(from)} – ${fmtYmd(to)}`}</strong>
              </button>
              <i className={`fas fa-arrow-right ${styles.modeArrow}`} aria-hidden />
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'target'}
                className={`${styles.modeTab} ${styles.modeTarget} ${mode === 'target' ? styles.modeOn : ''}`}
                onClick={() => {
                  setMode('target');
                  setAnchor(null);
                }}
              >
                <span className={styles.modeDot} />
                <span className={styles.modeLabel}>{L('Куда копировать', 'Qayerga nusxalash')}</span>
                <strong>{days === 1 ? fmtYmd(targetFrom) : `${fmtYmd(targetFrom)} – ${fmtYmd(targetTo)}`}</strong>
              </button>
            </div>

            <p className={styles.hint}>
              <i className="fas fa-hand-pointer" aria-hidden />{' '}
              {mode === 'source'
                ? anchor
                  ? L('Теперь нажмите последний день периода', 'Endi davrning oxirgi kunini bosing')
                  : L(
                      'Нажмите первый день, затем последний день периода (для одного дня — дважды)',
                      'Davrning birinchi kunini, keyin oxirgi kunini bosing (bitta kun uchun — ikki marta)',
                    )
                : L(
                    'Нажмите день, с которого начнётся копия',
                    'Nusxa boshlanadigan kunni bosing',
                  )}
            </p>

            <RangeCalendar
              view={view}
              onViewChange={setView}
              range={shownSource}
              secondary={shownTarget}
              counts={counts}
              today={today}
              lang={lang}
              onDayClick={pickDay}
              onDayHover={setHover}
            />

            <div className={styles.legend}>
              <span>
                <i className={`${styles.sw} ${styles.swSource}`} /> {L('Источник', 'Manba')}
              </span>
              <span>
                <i className={`${styles.sw} ${styles.swTarget}`} /> {L('Копия', 'Nusxa')}
              </span>
              <span>
                <i className={`${styles.sw} ${styles.swBadge}`} />{' '}
                {selected.size
                  ? L('отметки выбранных сотрудников', 'tanlangan xodimlar belgilari')
                  : L('отметки всех сотрудников', 'barcha xodimlar belgilari')}
              </span>
            </div>

            <div className={styles.presets}>
              {presets.map((p) => (
                <button key={p.label} type="button" className={styles.chip} onClick={() => applyPreset(p.src, p.target)}>
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section className={`${styles.card} ${styles.summary}`}>
            <div className={styles.cardHead}>
              <span className={styles.step}>3</span>
              <div>
                <h2>{L('Проверка и копирование', 'Tekshirish va nusxalash')}</h2>
                <p>
                  {L('Период', 'Davr')}: {days} {L('дн.', 'kun')}
                </p>
              </div>
            </div>

            <div className={styles.stats}>
              <div className={styles.stat}>
                <span>{L('Сотрудники', 'Xodimlar')}</span>
                <strong>{selected.size}</strong>
              </div>
              <div className={styles.stat}>
                <span>{L('Отметок к копии', 'Nusxalanadigan belgilar')}</span>
                <strong>{totalMarks}</strong>
              </div>
              <div className={styles.stat}>
                <span>{L('Уже есть в копии', 'Nusxa davrida bor')}</span>
                <strong className={totalExisting ? styles.warnText : ''}>{totalExisting}</strong>
              </div>
            </div>

            <div className={styles.flow}>
              <span className={styles.flowSource}>
                {fmtYmd(from)}
                {days > 1 ? ` – ${fmtYmd(to)}` : ''}
              </span>
              <i className="fas fa-arrow-right" aria-hidden />
              <span className={styles.flowTarget}>
                {fmtYmd(targetFrom)}
                {days > 1 ? ` – ${fmtYmd(targetTo)}` : ''}
              </span>
            </div>

            {sameStart ? (
              <div className={`${styles.alert} ${styles.alertDanger}`}>
                <i className="fas fa-ban" aria-hidden />{' '}
                {L('Дата копии совпадает с источником — выберите другой день.', 'Nusxa sanasi manba bilan bir xil — boshqa kunni tanlang.')}
              </div>
            ) : overlaps ? (
              <div className={`${styles.alert} ${styles.alertWarn}`}>
                <i className="fas fa-exclamation-triangle" aria-hidden />{' '}
                {L('Период копии пересекается с источником.', 'Nusxa davri manba davri bilan ustma-ust tushadi.')}
              </div>
            ) : null}

            {totalExisting > 0 ? (
              <label className={styles.check}>
                <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
                <span>
                  {L(
                    'Не дублировать: пропускать отметки, которые уже есть в то же время',
                    'Takrorlamaslik: xuddi shu vaqtda mavjud belgilarni o‘tkazib yuborish',
                  )}
                </span>
              </label>
            ) : null}

            {result ? (
              <div className={`${styles.alert} ${styles.alertOk}`}>
                <i className="fas fa-check-circle" aria-hidden />
                <span>
                  {L('Скопировано отметок', 'Nusxalangan belgilar')}: <strong>{result.copied}</strong>
                  {result.skipped
                    ? ` · ${L('пропущено (уже были)', 'o‘tkazib yuborildi (avval bor edi)')}: ${result.skipped}`
                    : ''}
                </span>
                <Link href="/attendance/marks" className={styles.alertLink}>
                  {L('Открыть журнал', 'Jurnalni ochish')}
                </Link>
              </div>
            ) : null}

            {confirming ? (
              <div className={styles.confirm}>
                <p>
                  {L(
                    `Скопировать ${totalMarks} отметок ${selected.size} сотрудников на ${fmtYmd(targetFrom)}${days > 1 ? ` – ${fmtYmd(targetTo)}` : ''}?`,
                    `${selected.size} ta xodimning ${totalMarks} ta belgisi ${fmtYmd(targetFrom)}${days > 1 ? ` – ${fmtYmd(targetTo)}` : ''} sanalariga nusxalansinmi?`,
                  )}
                </p>
                <div className={styles.confirmBtns}>
                  <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void runCopy()}>
                    {busy ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-check" aria-hidden />}{' '}
                    {L('Да, копировать', 'Ha, nusxalash')}
                  </button>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setConfirming(false)}>
                    {L('Отмена', 'Bekor qilish')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.btnPrimary} ${styles.btnWide}`}
                disabled={!canCopy}
                onClick={() => {
                  setResult(null);
                  setConfirming(true);
                }}
              >
                <i className="fas fa-clone" aria-hidden />{' '}
                {selected.size === 0
                  ? L('Выберите сотрудников', 'Xodimlarni tanlang')
                  : totalMarks === 0
                    ? L('В источнике нет отметок', 'Manbada belgi yo‘q')
                    : L(`Копировать ${totalMarks} отметок`, `${totalMarks} ta belgini nusxalash`)}
              </button>
            )}
          </section>
        </div>

        <section className={`${styles.card} ${styles.empCard}`}>
          <div className={styles.cardHead}>
            <span className={styles.step}>2</span>
            <div>
              <h2>{L('Сотрудники', 'Xodimlar')}</h2>
              <p>
                {L('Выбрано', 'Tanlangan')}: {selected.size} · {L('с отметками в источнике', 'manbada belgisi bor')}: {withMarks}
              </p>
            </div>
            {loading ? <i className={`fas fa-spinner fa-spin ${styles.spin}`} aria-hidden /> : null}
          </div>

          <div className={styles.filters}>
            <div className={styles.search}>
              <i className="fas fa-search" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={L('Поиск по ФИО или таб. номеру', 'F.I.Sh. yoki tabel raqami bo‘yicha qidirish')}
              />
            </div>
            <select className={styles.select} value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">{L('Все подразделения', 'Barcha bo‘limlar')}</option>
              {divisions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.segment}>
            <button
              type="button"
              className={onlyWithMarks ? styles.segOn : ''}
              onClick={() => setOnlyWithMarks(true)}
            >
              {L('С отметками', 'Belgisi borlar')} <em>{withMarks}</em>
            </button>
            <button
              type="button"
              className={!onlyWithMarks ? styles.segOn : ''}
              onClick={() => setOnlyWithMarks(false)}
            >
              {L('Все', 'Hammasi')} <em>{employees.length}</em>
            </button>
          </div>

          <div className={styles.listHead}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={allVisibleOn}
                disabled={!visible.length}
                onChange={(e) => toggleAllVisible(e.target.checked)}
              />
              <span>
                {L('Выбрать все в списке', 'Ro‘yxatdagilarning hammasi')} ({visible.length})
              </span>
            </label>
            {selected.size ? (
              <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Set())}>
                {L('Снять выбор', 'Tanlovni bekor qilish')}
              </button>
            ) : null}
          </div>

          <ul className={styles.list}>
            {visible.length === 0 ? (
              <li className={styles.empty}>
                <i className="fas fa-user-slash" aria-hidden />
                {data
                  ? onlyWithMarks
                    ? L('В выбранном периоде нет отметок. Выберите другой период или «Все».', 'Tanlangan davrda belgi yo‘q. Boshqa davrni yoki «Hammasi»ni tanlang.')
                    : L('Сотрудники не найдены', 'Xodim topilmadi')
                  : L('Загрузка…', 'Yuklanmoqda…')}
              </li>
            ) : (
              visible.map((e) => {
                const on = selected.has(e.id);
                return (
                  <li key={e.id}>
                    <label className={`${styles.row} ${on ? styles.rowOn : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(e.id)} />
                      <span className={styles.avatar}>{initials(e.fullName)}</span>
                      <span className={styles.who}>
                        <strong>{e.fullName}</strong>
                        <small>
                          {[e.tabNumber, e.division?.name, e.position?.name].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <span className={styles.badges}>
                        <span
                          className={`${styles.pill} ${e.marksCount ? styles.pillOk : styles.pillMuted}`}
                          title={L('Отметок в источнике', 'Manbadagi belgilar')}
                        >
                          <i className="fas fa-fingerprint" aria-hidden /> {e.marksCount}
                        </span>
                        {e.targetCount ? (
                          <span className={`${styles.pill} ${styles.pillWarn}`} title={L('Уже есть в периоде копии', 'Nusxa davrida allaqachon bor')}>
                            <i className="fas fa-copy" aria-hidden /> {e.targetCount}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function CopyMarksPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <CopyInner />
    </Suspense>
  );
}
