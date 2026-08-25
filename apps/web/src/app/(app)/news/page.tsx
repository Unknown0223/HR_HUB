'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageSubnav } from '@/components/PageSubnav';
import styles from './page.module.css';

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
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Новостная лента',
          siblings: [],
        }}
      />

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <section className={styles.messagesCard}>
          <div className={styles.messagesHead}>
            <h2>Сообщения</h2>
            <button type="button" className={styles.addBtn} onClick={openModal}>
              Добавить сообщение
            </button>
          </div>

          <div className={styles.messagesBody}>
            {loading && items.length === 0 ? (
              <p className={styles.empty}>Загрузка…</p>
            ) : null}
            {!loading && items.length === 0 ? (
              <p className={styles.emptyMuted}>Нет сообщений</p>
            ) : null}
            <ul className={styles.feed}>
              {items.map((item) => (
                <li key={item.id} className={styles.post}>
                  <div className={styles.postTop}>
                    <strong className={styles.postTitle}>{item.title}</strong>
                    <div className={styles.postActions}>
                      {item.publishedAt ? (
                        <time className={styles.postTime}>
                          {formatPublished(item.publishedAt)}
                        </time>
                      ) : null}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        title="Удалить"
                        onClick={() => void onDelete(item.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div
                    className={styles.postBody}
                    dangerouslySetInnerHTML={{ __html: item.body || '' }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className={styles.sideCard}>
          <div className={styles.sideHead}>
            <h2>Дни рождения</h2>
          </div>
          <div className={styles.birthdayBody}>
            {birthdays.length === 0 ? (
              <div className={styles.birthdayEmpty}>
                <i className="fa fa-gift" aria-hidden />
                <p>Здесь Вы будете видеть дни рождения коллег</p>
              </div>
            ) : (
              <ul className={styles.birthdayList}>
                {birthdays.map((b) => (
                  <li key={b.employeeId} className={styles.birthdayItem}>
                    <Link
                      href={`/employees/${b.employeeId}`}
                      className={styles.birthdayLink}
                    >
                      <span className={styles.avatar} aria-hidden>
                        {initials(b.fullName)}
                      </span>
                      <span className={styles.birthdayMeta}>
                        <strong>{b.fullName}</strong>
                        {b.position ? <em>{b.position}</em> : null}
                      </span>
                      <span className={styles.birthdayDate}>
                        {b.label || `${b.day}.${b.month}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {modal ? (
        <div className={styles.overlay} onClick={() => setModal(false)}>
          <form
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onSave(e)}
          >
            <h3 className={styles.modalTitle}>Добавить сообщение</h3>
            <div className={styles.modalBody}>
              <label className={styles.fieldLabel}>
                Сообщение <span className={styles.req}>*</span>
              </label>
              <div className={styles.toolbar}>
                <button type="button" onClick={() => exec('undo')} title="Отменить">
                  ↶
                </button>
                <button type="button" onClick={() => exec('redo')} title="Повторить">
                  ↷
                </button>
                <span className={styles.toolSep} />
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
                <span className={styles.toolSep} />
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
                <span className={styles.toolSep} />
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
                className={styles.editor}
                contentEditable
                role="textbox"
                aria-multiline
                data-placeholder="Введите сообщение…"
                suppressContentEditableWarning
              />
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={sendToAll}
                  onChange={(e) => setSendToAll(e.target.checked)}
                />
                Отправить всем сотрудникам
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="submit"
                className={styles.btnSave}
                disabled={saving}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={styles.btnClose}
                onClick={() => setModal(false)}
              >
                Закрыть
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
