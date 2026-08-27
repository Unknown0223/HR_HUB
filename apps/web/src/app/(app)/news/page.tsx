'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function hueOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 40% 42%)`;
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
  gift: (
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
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
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
  plus: (
    <svg
      width="14"
      height="14"
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
    const html = (editorRef.current?.innerHTML || '').trim();
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

      <header className={css.head}>
        <div className={css.headInner}>
          <div>
            <span className={css.kicker}>
              <span className={css.kickerDot} aria-hidden="true" />
              Главная · Внутренние коммуникации
            </span>
            <h1 className={css.h1}>Новостная лента</h1>
            <p className={css.headSub}>
              Сообщения для сотрудников и ближайшие дни рождения коллег.
            </p>
          </div>
          <div className={css.headStats}>
            <div className={css.headStat}>
              <span className={css.headStatVal}>{items.length}</span>
              <span className={css.headStatLabel}>сообщений</span>
            </div>
            <div className={css.headStat}>
              <span className={css.headStatVal}>{birthdays.length}</span>
              <span className={css.headStatLabel}>дней рождения</span>
            </div>
          </div>
        </div>
      </header>

      {error ? <div className={css.errorBanner}>{error}</div> : null}

      <div className={css.layout}>
        <section className={css.messagesCard} aria-label="Сообщения">
          <div className={css.cardHead}>
            <div>
              <h2 className={css.cardTitle}>Сообщения</h2>
              <p className={css.cardSub}>Объявления и уведомления для сотрудников</p>
            </div>
            <button type="button" className={css.addBtn} onClick={openModal}>
              {I.plus}
              Добавить сообщение
            </button>
          </div>

          <div className={css.messagesBody}>
            {loading && items.length === 0 ? (
              <div className={css.loading}>
                <div className={css.spinner} aria-hidden="true" />
                <div className={css.emptySub}>Загрузка…</div>
              </div>
            ) : null}
            {!loading && items.length === 0 ? (
              <div className={css.empty}>
                <div className={css.emptyIcon}>{I.inbox}</div>
                <div className={css.emptyText}>Нет сообщений</div>
                <div className={css.emptySub}>Нажмите «Добавить сообщение», чтобы создать запись</div>
              </div>
            ) : null}
            <ul className={css.feed}>
              {items.map((item) => {
                const author = item.authorName?.trim() || 'HR HUB';
                return (
                  <li key={item.id} className={css.post}>
                    <div className={css.postTop}>
                      <span className={css.author}>
                        <span
                          className={css.authorAvatar}
                          style={{ background: hueOf(author) }}
                          aria-hidden="true"
                        >
                          {initials(author)}
                        </span>
                        <span>
                          <span className={css.authorName}>{author}</span>
                          {item.publishedAt ? (
                            <time className={css.postTime} dateTime={item.publishedAt}>
                              {formatPublished(item.publishedAt)}
                            </time>
                          ) : null}
                        </span>
                      </span>
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
                      dangerouslySetInnerHTML={{ __html: item.body || '' }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <aside className={css.sideCard} aria-label="Дни рождения">
          <div className={css.sideHead}>
            <h2 className={css.sideTitle}>Дни рождения</h2>
            <p className={css.sideSub}>Ближайшие даты коллег</p>
          </div>
          {birthdays.length === 0 ? (
            <div className={css.birthEmpty}>
              <div className={css.birthEmptyIcon}>{I.gift}</div>
              <div className={css.birthEmptyText}>
                Здесь Вы будете видеть дни рождения коллег
              </div>
            </div>
          ) : (
            <ul className={css.birthList}>
              {birthdays.map((b) => (
                <li key={b.employeeId} className={css.birthRow}>
                  <span
                    className={css.birthAvatar}
                    style={{ background: hueOf(b.fullName) }}
                    aria-hidden="true"
                  >
                    {initials(b.fullName)}
                  </span>
                  <span className={css.birthMain}>
                    <Link href={`/employees/${b.employeeId}`} className={css.birthName}>
                      {b.fullName}
                    </Link>
                    {b.position ? <span className={css.birthPos}>{b.position}</span> : null}
                  </span>
                  <span
                    className={`${css.birthDate} ${b.daysUntil === 0 ? css.birthDateToday : ''}`}
                  >
                    {b.label || `${b.day}.${b.month}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
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
            aria-label="Добавить сообщение"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onSave(e)}
          >
            <div className={css.modalHead}>
              <h3 className={css.modalTitle}>Добавить сообщение</h3>
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
                    if (url) exec('createLink', url);
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
