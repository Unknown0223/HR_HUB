'use client';

import { useEffect, useRef } from 'react';
import type { SortDir } from './types';
import type { TablePrefsApi } from './useTablePrefs';
import css from './table-prefs.module.css';

export function TablePrefsMenuButton({
  prefs,
  onExport,
}: {
  prefs: TablePrefsApi;
  onExport?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prefs.menuOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        prefs.setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [prefs.menuOpen, prefs]);

  return (
    <div className={css.menuAnchor} ref={ref}>
      <button
        type="button"
        className={css.iconBtn}
        aria-expanded={prefs.menuOpen}
        aria-label="Меню таблицы"
        title="Меню таблицы"
        onClick={() => prefs.setMenuOpen(!prefs.menuOpen)}
      >
        <i className="fas fa-bars" aria-hidden />
      </button>
      {prefs.menuOpen ? (
        <div className={css.menuPanel} role="menu">
          <button type="button" className={css.menuItem} onClick={prefs.openSort}>
            Сортировка
          </button>
          <button
            type="button"
            className={css.menuItem}
            onClick={prefs.openSettings}
          >
            Настройка таблицы
          </button>
          {onExport ? (
            <button
              type="button"
              className={css.menuItem}
              onClick={() => {
                prefs.setMenuOpen(false);
                onExport();
              }}
            >
              Скачать в Excel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TablePrefsModals({ prefs }: { prefs: TablePrefsApi }) {
  useEffect(() => {
    const open =
      prefs.sortOpen || prefs.settingsOpen || prefs.confirmDefault;
    document.body.style.overflow = open ? 'hidden' : '';
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (prefs.confirmDefault) prefs.setConfirmDefault(false);
      else if (prefs.sortOpen) prefs.setSortOpen(false);
      else if (prefs.settingsOpen) prefs.setSettingsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [prefs]);

  return (
    <>
      {prefs.sortOpen ? (
        <div className={css.overlay} onClick={() => prefs.setSortOpen(false)}>
          <div
            className={`${css.modal} ${css.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-label="Сортировка"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Сортировка</h2>
              <div className={css.headActions}>
                <button
                  type="button"
                  className={css.ghostBtn}
                  onClick={() =>
                    prefs.setDraftSort(
                      prefs.sortableFields.map((f) => ({
                        key: f.key,
                        dir: 'none' as SortDir,
                      })),
                    )
                  }
                >
                  По умолчанию
                </button>
                <button
                  type="button"
                  className={css.closeBtn}
                  aria-label="Закрыть"
                  onClick={() => prefs.setSortOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className={css.modalBody}>
              <ul className={css.sortList}>
                {prefs.draftSort.map((rule, idx) => (
                  <li key={rule.key} className={css.sortRow}>
                    <span className={css.sortLabel}>{prefs.labelOf(rule.key)}</span>
                    <select
                      className={css.select}
                      value={rule.dir}
                      onChange={(e) => {
                        const dir = e.target.value as SortDir;
                        prefs.setDraftSort((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, dir } : r)),
                        );
                      }}
                    >
                      <option value="none">нет действий</option>
                      <option value="asc">по возрастанию</option>
                      <option value="desc">по убыванию</option>
                    </select>
                    <span className={css.handle} aria-hidden>
                      ⋮⋮
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.ghostBtn}
                onClick={() => prefs.setSortOpen(false)}
              >
                Отменить
              </button>
              <button
                type="button"
                className={css.primaryBtn}
                onClick={prefs.applySort}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {prefs.settingsOpen ? (
        <div
          className={css.overlay}
          onClick={() => prefs.setSettingsOpen(false)}
        >
          <div
            className={`${css.modal} ${css.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-label="Настройка таблицы"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>{prefs.title}</h2>
              <button
                type="button"
                className={css.closeBtn}
                aria-label="Закрыть"
                onClick={() => prefs.setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={css.modalBody}>
              <div className={css.settingsActions}>
                <button
                  type="button"
                  className={css.primaryBtn}
                  onClick={prefs.applySettings}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className={css.ghostBtn}
                  onClick={() => prefs.setConfirmDefault(true)}
                >
                  По умолчанию
                </button>
                <button
                  type="button"
                  className={css.ghostBtn}
                  onClick={() => prefs.setSettingsOpen(false)}
                >
                  Закрыть
                </button>
              </div>

              <h3 className={css.sectionTitle}>Настройка полей</h3>
              <div className={css.chips}>
                {prefs.draftColumns.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`${css.chip} ${css.chipActive}`}
                    title="Убрать из таблицы"
                    onClick={() =>
                      prefs.setDraftColumns((cols) =>
                        cols.filter((k) => k !== key),
                      )
                    }
                  >
                    {prefs.labelOf(key)} <span aria-hidden>×</span>
                  </button>
                ))}
              </div>

              <h3 className={css.sectionTitle}>Дополнительные поля</h3>
              <div className={css.chips}>
                {prefs.unusedColumns.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`${css.chip} ${css.chipExtra}`}
                    title="Добавить в таблицу"
                    onClick={() =>
                      prefs.setDraftColumns((cols) => [...cols, f.key])
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {prefs.searchableFields.length ? (
                <>
                  <h3 className={css.sectionTitle}>Настройка поиска</h3>
                  <div className={css.searchToggles}>
                    {prefs.searchableFields.map((f) => (
                      <label key={f.key} className={css.searchRow}>
                        <span>{f.label}</span>
                        <input
                          type="checkbox"
                          checked={prefs.draftSearch.includes(f.key)}
                          onChange={(e) => {
                            const on = e.target.checked;
                            prefs.setDraftSearch((keys) =>
                              on
                                ? [...keys, f.key]
                                : keys.filter((k) => k !== f.key),
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {prefs.confirmDefault ? (
        <div
          className={css.overlay}
          onClick={() => prefs.setConfirmDefault(false)}
        >
          <div
            className={css.modal}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={css.modalHead}>
              <h2 className={css.modalTitle}>Установить по умолчанию?</h2>
            </div>
            <div className={css.modalFoot}>
              <button
                type="button"
                className={css.ghostBtn}
                onClick={() => prefs.setConfirmDefault(false)}
              >
                Нет
              </button>
              <button
                type="button"
                className={css.primaryBtn}
                onClick={prefs.resetDefaults}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
