'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirm } from '@/lib/dialogs';
import { useI18n } from '@/lib/i18n';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import shared from '../../../page-shared.module.css';
import styles from './page.module.css';
import { money } from './format';

type Emp = { id: string; firstName: string; lastName: string; tabNumber: string };

type LimitRow = {
  id: string;
  name: string;
  maxAmount: number;
  roles: string[];
  employeeIds: string[];
  employees: Emp[];
  reason: string | null;
  isActive: boolean;
};

const ROLES: Array<{ id: string; label: string }> = [
  { id: 'employee', label: 'Сотрудник' },
  { id: 'manager', label: 'Руководитель' },
  { id: 'hr', label: 'HR' },
  { id: 'tenant_admin', label: 'Администратор' },
];

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;
const empName = (e: Emp) => `${e.lastName} ${e.firstName}`.trim();

type Draft = {
  id?: string;
  name: string;
  maxAmount: string;
  roles: string[];
  employees: Emp[];
  reason: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  name: '',
  maxAmount: '',
  roles: [],
  employees: [],
  reason: '',
  isActive: true,
};

export function AdvanceLimitsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<LimitRow[]>('/api/advance-requests/limits');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(row: LimitRow) {
    setDraft({
      id: row.id,
      name: row.name,
      maxAmount: String(row.maxAmount),
      roles: row.roles,
      employees: row.employees,
      reason: row.reason ?? '',
      isActive: row.isActive,
    });
  }

  async function save() {
    if (!draft) return;
    const amount = Number(draft.maxAmount.replace(/\s/g, ''));
    if (!draft.name.trim()) return setError(t('Укажите название'));
    if (!Number.isFinite(amount) || amount <= 0) return setError(t('Укажите максимальную сумму'));
    setBusy(true);
    setError('');
    const body = {
      name: draft.name.trim(),
      maxAmount: amount,
      roles: draft.roles,
      employeeIds: draft.employees.map((e) => e.id),
      reason: draft.reason.trim(),
      isActive: draft.isActive,
    };
    try {
      await apiFetch(
        draft.id ? `/api/advance-requests/limits/${draft.id}` : '/api/advance-requests/limits',
        { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: LimitRow) {
    if (!(await confirm(t('Удалить ограничение «{name}»?', { name: row.name })))) return;
    try {
      await apiFetch(`/api/advance-requests/limits/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось удалить'));
    }
  }

  return (
    <>
      <div className={styles.limitsIntro}>
        <p>
          {t(
            'Лимит — максимальная сумма аванса без объяснения. Правило можно задать для ролей, для конкретных сотрудников или для всех (если не выбраны ни роли, ни сотрудники). Если подходит несколько правил: правило сотрудника важнее правила роли, правило роли важнее общего, а среди правил одного вида действует меньшая сумма.',
          )}
        </p>
        <p>
          {t(
            'Сотрудник видит лимит и пояснение в приложении. Если он просит больше лимита, комментарий «на что нужен аванс» обязателен; в пределах лимита — нет.',
          )}
        </p>
        {canEdit ? (
          <button type="button" className={styles.createBtn} onClick={() => setDraft({ ...EMPTY })}>
            <i className="fas fa-plus" aria-hidden /> {t('Добавить ограничение')}
          </button>
        ) : null}
      </div>

      {error && !draft ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('Название')}</th>
              <th className={styles.num}>{t('Макс. сумма')}</th>
              <th>{t('Кому')}</th>
              <th>{t('Пояснение для сотрудника')}</th>
              <th>{t('Статус')}</th>
              <th aria-label={t('Действия')} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  {t('Загрузка…')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  {t('Ограничений нет — сотрудники могут запрашивать любую сумму без комментария')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={r.isActive ? undefined : styles.rowMuted}>
                  <td className={styles.fio}>{r.name}</td>
                  <td className={`${styles.num} ${styles.amount}`}>{money(r.maxAmount)}</td>
                  <td>
                    <div className={styles.targets}>
                      {r.employees.map((e) => (
                        <span key={e.id} className={styles.targetEmp}>
                          <i className="fas fa-user" aria-hidden /> {empName(e)}
                        </span>
                      ))}
                      {r.employees.length === 0
                        ? r.roles.map((role) => (
                            <span key={role} className={styles.targetRole}>
                              <i className="fas fa-user-tag" aria-hidden /> {t(roleLabel(role))}
                            </span>
                          ))
                        : null}
                      {r.employees.length === 0 && r.roles.length === 0 ? (
                        <span className={styles.targetAll}>
                          <i className="fas fa-users" aria-hidden /> {t('Все сотрудники')}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={styles.comment}>{r.reason || <span className={styles.sub}>—</span>}</td>
                  <td>
                    <span className={`${shared.badge} ${r.isActive ? shared.badgeOk : shared.badgeDraft}`}>
                      {r.isActive ? t('Активно') : t('Выключено')}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    {canEdit ? (
                      <>
                        <button type="button" className={styles.iconBtn} onClick={() => edit(r)} title={t('Изменить')}>
                          <i className="fas fa-pen" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => void remove(r)}
                          title={t('Удалить')}
                        >
                          <i className="fas fa-trash" aria-hidden />
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FormModal
        open={!!draft}
        width="md"
        title={draft?.id ? t('Изменить ограничение') : t('Новое ограничение')}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button type="button" className={modal.btnGhost} onClick={() => setDraft(null)}>
              {t('Отмена')}
            </button>
            <button type="button" className={modal.btnPrimary} disabled={busy} onClick={() => void save()}>
              {t('Сохранить')}
            </button>
          </>
        }
      >
        {draft ? (
          <div className={modal.fields}>
            {error ? <p className={modal.error}>{error}</p> : null}
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>
                  {t('Название')}
                  <span className={modal.req}>*</span>
                </span>
                <input
                  value={draft.name}
                  placeholder={t('Например: Рядовые сотрудники')}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className={modal.field}>
                <span>
                  {t('Максимальная сумма, сум')}
                  <span className={modal.req}>*</span>
                </span>
                <input
                  inputMode="numeric"
                  value={draft.maxAmount}
                  placeholder="1 000 000"
                  onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value.replace(/[^\d\s]/g, '') })}
                />
              </label>
            </div>

            <div className={modal.field}>
              <span>{t('Роли')}</span>
              <div className={styles.roleChecks}>
                {ROLES.map((r) => (
                  <label key={r.id} className={modal.checkRow}>
                    <input
                      type="checkbox"
                      checked={draft.roles.includes(r.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          roles: e.target.checked
                            ? [...draft.roles, r.id]
                            : draft.roles.filter((x) => x !== r.id),
                        })
                      }
                    />
                    {t(r.label)}
                  </label>
                ))}
              </div>
            </div>

            <EmployeePicker
              value={draft.employees}
              onChange={(employees) => setDraft({ ...draft, employees })}
            />
            <p className={styles.sub}>
              {draft.employees.length
                ? t('Правило действует для выбранных сотрудников (роли не учитываются).')
                : draft.roles.length
                  ? t('Правило действует для выбранных ролей.')
                  : t('Ни роли, ни сотрудники не выбраны — правило действует для всех.')}
            </p>

            <label className={modal.field}>
              <span>{t('Пояснение для сотрудника')}</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={draft.reason}
                placeholder={t(
                  'Например: Аванс выдаётся не больше 40% оклада. Если нужно больше — напишите, на что (лечение, учёба и т.п.).',
                )}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>

            <label className={modal.checkRow}>
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              {t('Активно')}
            </label>
          </div>
        ) : null}
      </FormModal>
    </>
  );
}

function EmployeePicker({ value, onChange }: { value: Emp[]; onChange: (v: Emp[]) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<Emp[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const data = await apiFetch<Emp[] | { items: Emp[] }>(
          `/api/employees?status=active&limit=20&q=${encodeURIComponent(term)}`,
        );
        setOptions(Array.isArray(data) ? data : data.items ?? []);
        setOpen(true);
      } catch {
        setOptions([]);
      }
    }, 250);
  }, [q]);

  const chosen = new Set(value.map((e) => e.id));

  return (
    <div className={modal.field}>
      <span>{t('Сотрудники')}</span>
      {value.length ? (
        <div className={styles.targets}>
          {value.map((e) => (
            <span key={e.id} className={styles.targetEmp}>
              {empName(e)}
              <button
                type="button"
                className={styles.chipX}
                aria-label={`${t('Убрать')} ${empName(e)}`}
                onClick={() => onChange(value.filter((x) => x.id !== e.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={modal.combo}>
        <input
          value={q}
          placeholder={t('Поиск сотрудника по ФИО или табельному…')}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => options.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && options.length ? (
          <div className={modal.comboList}>
            {options
              .filter((o) => !chosen.has(o.id))
              .map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={modal.comboItem}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...value, o]);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  {empName(o)} <span className={modal.comboMeta}>№ {o.tabNumber}</span>
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
