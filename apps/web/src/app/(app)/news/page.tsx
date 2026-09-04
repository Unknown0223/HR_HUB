'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { sanitizeNewsHref, sanitizeNewsHtml } from '@/lib/sanitize-news-html';
import { PageSubnav } from '@/components/PageSubnav';
import css from './page.module.css';

type NewsItem = {
  id: string;
  code: string;
  title: string;
  body: string;
  publishedAt?: string | null;
  sendToAll?: boolean;
  authorName?: string | null;
};

type Birthday = {
  employeeId: string;
  fullName: string;
  position?: string;
  label?: string;
  day: number;
  month: number;
  daysUntil: number;
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0a85e2, #6366f1)',
  'linear-gradient(135deg, #0e9f6e, #0a85e2)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #06b6d4, #0e9f6e)',
  'linear-gradient(135deg, #f43f5e, #f59e0b)',
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function formatPublished(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value);
  } catch {
    /* ignore */
  }
}

const I = {
  newspaper: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  ),
  plus: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  ),
  x: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  calendar: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  ),
  chevron: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  inbox: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
};

export default function NewsFeedPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendToAll, setSendToAll] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  const activeAuthors = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of items) {
      const name = item.authorName?.trim() || 'HR HUB';
      if (seen.has(name)) continue;
      seen.add(name);
      list.push(name);
    }
    return list.length ? list : ['HR HUB'];
  }, [items]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [news, bdays] = await Promise.all([
        apiFetch<NewsItem[]>('/api/news'),
        apiFetch<Birthday[]>('/api/news/birthdays'),
      ]);
      setItems(Array.isArray(news) ? news : []);
      setBirthdays(Array.isArray(bdays) ? bdays : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setItems([]);
      setBirthdays([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [modal]);

  function openModal() {
    setSendToAll(true);
    setModal(true);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        editorRef.current.focus();
      }
    }, 50);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const html = sanitizeNewsHtml(editorRef.current?.innerHTML || '').trim();
    const text = (editorRef.current?.innerText || '').trim();
    if (!text) {
      setError('Введите текст сообщения');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/news', {
        method: 'POST',
        body: JSON.stringify({
          message: html,
          sendToAll,
        }),
      });
      setModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await apiFetch(`/api/news/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }

  return (
    <div className={css.page}>
      <PageSubnav
        group={{
          title: 'Новостная лента',
          siblings: [],
        }}
      />

      <div className={css.wrap}>
        <header className={css.pageHead}>
          <div className={css.pageHeadLeft}>
            <span className={css.iconBadge} aria-hidden="true">
              {I.newspaper}
            </span>
            <div>
              <h1 className={css.h1}>Новостная лента</h1>
              <p className={css.headSub}>Объявления, приказы и события компании</p>
            </div>
          </div>
          <button type="button" className={css.addBtn} onClick={openModal}>
            {I.plus}
            Новая публикация
          </button>
        </header>

        {error ? <div className={css.errorBanner}>{error}</div> : null}

        <div className={css.layout}>
          <section className={css.feed} aria-label="Сообщения">
            {loading && items.length === 0 ? (
              <div className={css.emptyCard}>
                <div className={css.spinner} aria-hidden="true" />
                <div className={css.emptySub}>Загрузка…</div>
              </div>
            ) : null}

            {!loading && items.length === 0 ? (
              <div className={css.emptyCard}>
                <div className={css.emptyIcon}>{I.inbox}</div>
                <div className={css.emptyText}>Нет сообщений</div>
                <div className={css.emptySub}>
                  Нажмите «Новая публикация», чтобы создать запись
                </div>
              </div>
            ) : null}

            {items.map((item) => {
              const author = item.authorName?.trim() || 'HR HUB';
              return (
                <article key={item.id} className={css.post}>
                  <div className={css.postInner}>
                    <span
                      className={css.authorAvatar}
                      style={{ background: avatarGradient(author) }}
                      aria-hidden="true"
                    >
                      {initials(author)}
                    </span>
                    <div className={css.postMain}>
                      <div className={css.postMeta}>
                        <div className={css.postMetaLeft}>
                          <span className={css.authorName}>{author}</span>
                          {item.publishedAt ? (
                            <>
                              <span className={css.metaDot} aria-hidden="true">
                                ·
                              </span>
                              <time className={css.postTime} dateTime={item.publishedAt}>
                                {formatPublished(item.publishedAt)}
                              </time>
                            </>
                          ) : null}
                        </div>
                        <div className={css.postActions}>
                          {item.sendToAll ? (
                            <span className={css.sendBadge}>Всем</span>
                          ) : null}
                          <button
                            type="button"
                            className={css.deleteBtn}
                            title="Удалить"
                            aria-label="Удалить"
                            onClick={() => void onDelete(item.id)}
                          >
                            {I.x}
                          </button>
                        </div>
                      </div>
                      {item.title ? <h3 className={css.postTitle}>{item.title}</h3> : null}
                      <div
                        className={css.postBody}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeNewsHtml(item.body || ''),
                        }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className={css.aside} aria-label="Боковая панель">
            <div className={css.sideCard}>
              <div className={css.sideHead}>
                <span className={css.sideHeadIcon} aria-hidden="true">
                  {I.calendar}
                </span>
                <h2 className={css.sideTitle}>Ближайшие события</h2>
              </div>
              {birthdays.length === 0 ? (
                <div className={css.sideEmpty}>
                  Здесь появятся дни рождения коллег
                </div>
              ) : (
                <ul className={css.eventList}>
                  {birthdays.map((b) => (
                    <li key={b.employeeId}>
                      <Link
                        href={`/employees/${b.employeeId}`}
                        className={css.eventRow}
                      >
                        <span className={css.eventText}>
                          <span className={css.eventTitle}>{b.fullName}</span>
                          <span
                            className={`${css.eventDate} ${b.daysUntil === 0 ? css.eventDateToday : ''}`}
                          >
                            {b.label || `${b.day}.${b.month}`}
                          </span>
                        </span>
                        <span className={css.eventChevron}>{I.chevron}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${css.sideCard} ${css.sideCardPad}`}>
              <h2 className={css.sideTitle}>Активные авторы</h2>
              <ul className={css.authorsList}>
                {activeAuthors.map((name) => (
                  <li key={name} className={css.authorRow}>
                    <span
                      className={css.authorChip}
                      style={{ background: avatarGradient(name) }}
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className={css.authorChipName}>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {modal ? (
        <div
          className={css.overlay}
          onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <form
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Новая публикация"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onSave(e)}
          >
            <div className={css.modalHead}>
              <h3 className={css.modalTitle}>Новая публикация</h3>
              <button
                type="button"
                className={css.modalClose}
                onClick={() => setModal(false)}
                aria-label="Закрыть"
              >
                {I.x}
              </button>
            </div>
            <div className={css.modalBody}>
              <label className={css.fieldLabel}>
                Сообщение <span className={css.req}>*</span>
              </label>
              <div className={css.editorToolbar}>
                <button type="button" onClick={() => exec('undo')} title="Отменить">
                  ↶
                </button>
                <button type="button" onClick={() => exec('redo')} title="Повторить">
                  ↷
                </button>
                <span className={css.toolSep} />
                <button type="button" onClick={() => exec('bold')} title="Жирный">
                  <b>B</b>
                </button>
                <button type="button" onClick={() => exec('italic')} title="Курсив">
                  <i>I</i>
                </button>
                <button
                  type="button"
                  onClick={() => exec('underline')}
                  title="Подчёркнутый"
                >
                  <u>U</u>
                </button>
                <span className={css.toolSep} />
                <button
                  type="button"
                  onClick={() => exec('formatBlock', 'blockquote')}
                  title="Цитата"
                >
                  “
                </button>
                <button
                  type="button"
                  onClick={() => exec('insertUnorderedList')}
                  title="Список"
                >
                  •
                </button>
                <button
                  type="button"
                  onClick={() => exec('insertOrderedList')}
                  title="Нумерованный"
                >
                  1.
                </button>
                <span className={css.toolSep} />
                <button
                  type="button"
                  onClick={() => {
                    const url = window.prompt('Ссылка (URL)');
                    if (!url) return;
                    const safe = sanitizeNewsHref(url);
                    if (safe) exec('createLink', safe);
                  }}
                  title="Ссылка"
                >
                  🔗
                </button>
              </div>
              <div
                ref={editorRef}
                className={css.editor}
                contentEditable
                role="textbox"
                aria-multiline
                data-placeholder="Введите сообщение…"
                suppressContentEditableWarning
              />
              <label className={css.checkRow}>
                <input
                  type="checkbox"
                  checked={sendToAll}
                  onChange={(e) => setSendToAll(e.target.checked)}
                />
                Отправить всем сотрудникам
              </label>
            </div>
            <div className={css.modalFooter}>
              <button type="button" className={css.btnClose} onClick={() => setModal(false)}>
                Закрыть
              </button>
              <button type="submit" className={css.btnSave} disabled={saving}>
                Сохранить
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
