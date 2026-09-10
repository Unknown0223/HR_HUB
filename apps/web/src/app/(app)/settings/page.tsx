'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { useUrlParam } from '@/lib/use-url-state';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { SystemSettingsPanel } from './SystemSettingsPanel';
import styles from '../../page-shared.module.css';

type Tab = 'main' | 'org' | 'users' | 'dictionaries' | 'extra' | 'integrations' | 'audit' | 'admin';
const TABS = ['main', 'org', 'users', 'dictionaries', 'extra', 'integrations', 'audit', 'admin'] as const;

type User = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
};

type Dict = {
  id: string;
  code: string;
  name: string;
  kind?: string;
  items: {
    id: string;
    code: string;
    name: string;
    isActive?: boolean;
    meta?: Record<string, unknown> | null;
  }[];
};

type Integration = {
  id: string;
  type: string;
  name: string;
  webhookUrl?: string | null;
  isActive: boolean;
  lastSyncAt?: string | null;
  config?: {
    sys?: string;
    apiUrl?: string;
    apiKey?: string;
    stub?: boolean;
    note?: string;
  } | null;
};

type Audit = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
};

const CORE_DICT_CODES = [
  'edu',
  'institutions',
  'specialties',
  'doc_types',
  'labor_functions',
  'science',
  'languages',
  'lang_levels',
  'certificates',
  'kinship',
  'marital',
  'tenure',
  'awards',
  'inventory_types',
  'inventory',
  'cars',
] as const;

const EXTRA_DICT_CODES = [
  'trip_reasons',
  'sick_reasons',
  'employment_sources',
  'indicators',
  'avg_salary',
  'coa',
  'cashboxes',
  'currencies',
  'nationality',
  'entities',
  'facts',
  'news_feed',
] as const;

const ADMIN_DICT_PANELS = ['orgs', 'regions', 'banks'] as const;
const ADMIN_SPECIAL = ['quickstart', 'photos', 'import_docs'] as const;
const SYS_CODES = [
  'artix',
  'iiko',
  'iiko_sales',
  'billz2',
  'billz1',
  'onec',
  'esign',
  'mehnat',
  'telegram',
] as const;

function integrationSys(i: Integration): string {
  if (i.config && typeof i.config === 'object' && 'sys' in i.config && i.config.sys) {
    return String(i.config.sys);
  }
  const n = i.name.toLowerCase();
  if (n.includes('artix')) return 'artix';
  if (n.includes('iiko') && n.includes('продаж')) return 'iiko_sales';
  if (n.includes('iiko')) return 'iiko';
  if (n.includes('billz') && n.includes('1')) return 'billz1';
  if (n.includes('billz')) return 'billz2';
  if (n.includes('1с') || n.includes('1c') || n.includes('onec')) return 'onec';
  if (n.includes('e-imzo') || n.includes('подпис') || n.includes('esign')) return 'esign';
  if (n.includes('mehnat')) return 'mehnat';
  if (n.includes('telegram')) return 'telegram';
  return '';
}

function sysLabel(s: string) {
  switch (s) {
    case 'artix':
      return 'ARTIX';
    case 'iiko':
      return 'IIKO';
    case 'iiko_sales':
      return 'Продажи IIKO';
    case 'billz2':
      return 'Billz 2.0';
    case 'billz1':
      return 'Billz 1.0';
    case 'onec':
      return '1С';
    case 'esign':
      return 'E-IMZO';
    case 'mehnat':
      return 'Mehnat.gov';
    case 'telegram':
      return 'Telegram Bot';
    default:
      return s;
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useUrlParam('tab', 'main', TABS);
  const [dictCode, setDictCode] = useUrlParam('dict', '');
  const [sysCode, setSysCode] = useUrlParam('sys', '');
  const [panel, setPanel] = useUrlParam('panel', '');
  const [group, setGroup] = useUrlParam('group', '');
  const [error, setError] = useState('');
  const [org, setOrg] = useState<{
    tenant: { code: string; name: string };
    settings: {
      orgName?: string | null;
      legalName?: string | null;
      inn?: string | null;
      address?: string | null;
      phone?: string | null;
      timezone: string;
      currency: string;
      locale: string;
    };
  } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [dicts, setDicts] = useState<Dict[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [dictId, setDictId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemMode, setItemMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPlate, setItemPlate] = useState('');
  const [itemVin, setItemVin] = useState('');
  const [itemIsDebit, setItemIsDebit] = useState(true);
  const [itemIsCredit, setItemIsCredit] = useState(true);
  const [itemCurrency, setItemCurrency] = useState('UZS');
  const [itemSaving, setItemSaving] = useState(false);
  const [dictModalOpen, setDictModalOpen] = useState(false);
  const [newDictCode, setNewDictCode] = useState('');
  const [newDictName, setNewDictName] = useState('');
  const [dictSaving, setDictSaving] = useState(false);

  async function load() {
    setError('');
    try {
      if (tab === 'org' || tab === 'main' || tab === 'admin') setOrg(await apiFetch('/api/settings/org'));
      if (tab === 'admin') setUsers(await apiFetch('/api/settings/users'));
      if (tab === 'dictionaries' || tab === 'extra' || tab === 'admin') {
        const kind =
          tab === 'extra' ? 'extra' : tab === 'admin' ? 'admin' : 'core';
        const d = await apiFetch<Dict[]>(`/api/settings/dictionaries?kind=${kind}`);
        setDicts(d);
      }
      if (tab === 'main' && panel === 'news') {
        const d = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra');
        setDicts(d);
        const news = d.find((x) => x.code === 'news_feed');
        if (news) setDictId(news.id);
      }
      if (tab === 'integrations' || tab === 'admin') {
        setIntegrations(await apiFetch('/api/settings/integrations'));
      }
      if (tab === 'audit' || tab === 'admin') {
        setAudit(await apiFetch('/api/settings/audit'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, panel]);

  useEffect(() => {
    if (tab === 'extra' && (group === 'entities' || group === 'facts')) {
      setDictCode(group);
    }
  }, [tab, group, setDictCode]);

  useEffect(() => {
    if (tab === 'extra' && dictCode === 'employment_sources') {
      router.replace('/catalog/employment-sources');
    }
    if (tab === 'extra' && dictCode === 'indicators') {
      router.replace('/catalog/indicators');
    }
    if (tab === 'extra' && dictCode === 'avg_salary') {
      router.replace('/catalog/avg-salaries');
    }
    if (tab === 'extra' && dictCode === 'coa') {
      router.replace('/catalog/coa');
    }
    if (tab === 'extra' && dictCode === 'cashboxes') {
      router.replace('/catalog/cashboxes');
    }
    if (tab === 'extra' && dictCode === 'currencies') {
      router.replace('/catalog/currencies');
    }
    if (tab === 'extra' && dictCode === 'nationality') {
      router.replace('/catalog/nationality');
    }
    if (tab === 'integrations' && sysCode === 'artix') {
      router.replace('/settings/artix');
    }
    if (tab === 'integrations' && sysCode === 'iiko') {
      router.replace('/settings/iiko');
    }
    if (tab === 'integrations' && sysCode === 'iiko_sales') {
      router.replace('/settings/iiko-sales');
    }
    if (tab === 'integrations' && sysCode === 'billz2') {
      router.replace('/settings/billz');
    }
    if (tab === 'integrations' && sysCode === 'billz1') {
      router.replace('/settings/billz-sales');
    }
    if (tab === 'integrations' && sysCode === 'telegram') {
      router.replace('/settings/telegram');
    }
    if (tab === 'admin' && panel === 'orgs') {
      router.replace('/settings/organizations');
    }
    if (tab === 'admin' && panel === 'regions') {
      router.replace('/settings/countries');
    }
    if (tab === 'admin' && panel === 'banks') {
      router.replace('/settings/banks');
    }
    if (tab === 'admin' && panel === 'quickstart') {
      router.replace('/settings/quickstart');
    }
    if (tab === 'admin' && panel === 'photos') {
      router.replace('/settings/photos');
    }
    if (tab === 'admin' && panel === 'import_docs') {
      router.replace('/settings/person-docs');
    }
    if (tab === 'audit') {
      router.replace('/settings/audit');
    }
    if (tab === 'users') {
      router.replace('/settings/users');
    }
  }, [tab, dictCode, sysCode, panel, router]);

  useEffect(() => {
    if (!dicts.length) return;
    if (dictCode) {
      const match = dicts.find((d) => d.code === dictCode);
      if (match) {
        setDictId(match.id);
        return;
      }
    }
    if (tab === 'admin' && panel && (ADMIN_DICT_PANELS as readonly string[]).includes(panel)) {
      const match = dicts.find((d) => d.code === panel);
      if (match) {
        setDictId(match.id);
        return;
      }
    }
    if (!dictId && dicts[0]) setDictId(dicts[0].id);
  }, [dicts, dictCode, panel, tab, dictId]);

  async function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOrg(
      await apiFetch('/api/settings/org', {
        method: 'PATCH',
        body: JSON.stringify({
          orgName: fd.get('orgName') || undefined,
          legalName: fd.get('legalName') || undefined,
          inn: fd.get('inn') || undefined,
          address: fd.get('address') || undefined,
          phone: fd.get('phone') || undefined,
          timezone: fd.get('timezone') || undefined,
          currency: fd.get('currency') || undefined,
          locale: fd.get('locale') || undefined,
        }),
      }),
    );
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/settings/users', {
      method: 'POST',
      body: JSON.stringify({
        email: fd.get('email'),
        password: fd.get('password'),
        fullName: fd.get('fullName'),
        role: fd.get('role'),
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function toggleUser(u: User) {
    await apiFetch(`/api/settings/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    await load();
  }

  async function createDict() {
    if (!newDictCode.trim() || !newDictName.trim()) return;
    setDictSaving(true);
    setError('');
    try {
      const kind = tab === 'extra' ? 'extra' : tab === 'admin' ? 'admin' : 'core';
      const d = await apiFetch<Dict>('/api/settings/dictionaries', {
        method: 'POST',
        body: JSON.stringify({
          code: newDictCode.trim(),
          name: newDictName.trim(),
          kind,
        }),
      });
      setDictId(d.id);
      setDictCode(d.code);
      setDictModalOpen(false);
      setNewDictCode('');
      setNewDictName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDictSaving(false);
    }
  }

  function openCreateItem() {
    setEditItemId(null);
    setItemCode('');
    setItemName('');
    setItemPlate('');
    setItemVin('');
    setItemIsDebit(true);
    setItemIsCredit(true);
    setItemCurrency('UZS');
    setItemMode('create');
    setError('');
  }

  function openEditItem(item: {
    id: string;
    code: string;
    name: string;
    meta?: Record<string, unknown> | null;
  }) {
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    setEditItemId(item.id);
    setItemCode(item.code);
    setItemName(item.name);
    setItemPlate(String(meta.plate ?? ''));
    setItemVin(String(meta.vin ?? ''));
    setItemIsDebit(meta.isDebit !== false);
    setItemIsCredit(meta.isCredit !== false);
    setItemCurrency(String(meta.currency ?? 'UZS'));
    setItemMode('edit');
    setError('');
  }

  function closeItemModal() {
    setItemMode('none');
    setEditItemId(null);
  }

  async function saveItem() {
    if (!dictId || !itemCode.trim() || !itemName.trim()) return;
    const code = selected?.code;
    const meta: Record<string, unknown> = {};
    if (code === 'cars') {
      if (itemPlate.trim()) meta.plate = itemPlate.trim();
      if (itemVin.trim()) meta.vin = itemVin.trim();
    }
    if (code === 'coa') {
      meta.isDebit = itemIsDebit;
      meta.isCredit = itemIsCredit;
      if (itemCurrency.trim()) meta.currency = itemCurrency.trim();
    }
    const body = {
      code: itemCode.trim(),
      name: itemName.trim(),
      ...(Object.keys(meta).length ? { meta } : {}),
    };
    setItemSaving(true);
    setError('');
    try {
      if (itemMode === 'edit' && editItemId) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${editItemId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closeItemModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setItemSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!dictId) return;
    await apiFetch(`/api/settings/dictionaries/${dictId}/items/${itemId}/delete`, {
      method: 'POST',
    });
    await load();
  }

  async function createIntegration(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sys = String(fd.get('sys') || sysCode || '');
    await apiFetch('/api/settings/integrations', {
      method: 'POST',
      body: JSON.stringify({
        type: fd.get('type') || 'custom',
        name: fd.get('name'),
        webhookUrl: fd.get('webhookUrl') || undefined,
        config: {
          sys: sys || undefined,
          apiUrl: fd.get('apiUrl') || undefined,
          apiKey: fd.get('apiKey') || undefined,
        },
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function toggleIntegration(i: Integration) {
    await apiFetch(`/api/settings/integrations/${i.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !i.isActive }),
    });
    await load();
  }

  async function syncIntegration(id: string) {
    try {
      const res = await apiFetch<{
        ok?: boolean;
        stub?: boolean;
        message?: string;
      }>(`/api/settings/integrations/${id}/sync`, { method: 'POST' });
      if (res.stub) {
        setError(res.message || 'Интеграция-заглушка: живой API не подключён');
      } else {
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка синхронизации');
    }
    await load();
  }

  async function changeRole(u: User, role: string) {
    await apiFetch(`/api/settings/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    await load();
  }

  const selected = dicts.find((d) => d.id === dictId);

  const dictNavCodes = useMemo(() => {
    if (tab === 'extra') return EXTRA_DICT_CODES as readonly string[];
    if (tab === 'admin') return ADMIN_DICT_PANELS as readonly string[];
    return CORE_DICT_CODES as readonly string[];
  }, [tab]);

  const filteredIntegrations = useMemo(() => {
    if (!sysCode) return integrations;
    return integrations.filter((i) => integrationSys(i) === sysCode);
  }, [integrations, sysCode]);

  function selectDictByCode(code: string) {
    setDictCode(code);
    const match = dicts.find((d) => d.code === code);
    if (match) setDictId(match.id);
    setItemSearch('');
  }

  const filteredItems = useMemo(() => {
    const items = selected?.items ?? [];
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const meta = (i.meta ?? {}) as Record<string, unknown>;
      const blob = [
        i.code,
        i.name,
        String(meta.plate ?? ''),
        String(meta.vin ?? ''),
        String(meta.currency ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [selected?.items, itemSearch]);

  const itemColSpan =
    selected?.code === 'cars' ? 5 : selected?.code === 'coa' ? 6 : 3;

  function renderDictionaryCrud(title: string) {
    return (
      <>
        <div className={styles.split}>
          <div className={styles.panel}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem', padding: '1rem 1rem 0' }}>
              {title}
            </h2>
            <div style={{ padding: '0 1rem 1rem', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {dictNavCodes.map((code) => {
                const d = dicts.find((x) => x.code === code);
                const label = d?.name ?? code;
                return (
                  <button
                    key={code}
                    type="button"
                    className={
                      (dictCode || selected?.code) === code ? styles.tabActive : styles.tab
                    }
                    onClick={() => selectDictByCode(code)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className={styles.toolbar} style={{ padding: '0 1rem', marginBottom: 8 }}>
              <div className={styles.leftActions}>
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={() => {
                    setNewDictCode('');
                    setNewDictName('');
                    setDictModalOpen(true);
                  }}
                >
                  <i className="fas fa-plus" aria-hidden />
                  Справочник
                </button>
              </div>
              <div className={styles.rightTools}>
                <span className={styles.countBadge}>{dicts.length}</span>
              </div>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              {dicts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={dictId === d.id ? styles.tabActive : styles.tab}
                  style={{ display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
                  onClick={() => {
                    setDictId(d.id);
                    setDictCode(d.code);
                    setItemSearch('');
                  }}
                >
                  {d.name} ({d.code})
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={styles.toolbar}>
              <div className={styles.leftActions}>
                <button
                  type="button"
                  className={styles.createBtn}
                  disabled={!dictId}
                  onClick={openCreateItem}
                >
                  <i className="fas fa-plus" aria-hidden />
                  Создать
                </button>
              </div>
              <div className={styles.rightTools}>
                <div className={styles.searchWrap}>
                  <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
                  <input
                    className={styles.search}
                    placeholder="Поиск…"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    aria-label="Поиск элементов"
                  />
                </div>
                <span className={styles.countBadge}>
                  {filteredItems.length}
                  {selected?.items?.length != null && filteredItems.length !== selected.items.length
                    ? ` / ${selected.items.length}`
                    : ''}
                </span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => void load()}
                  title="Обновить"
                  aria-label="Обновить"
                >
                  <i className="fas fa-sync-alt" aria-hidden />
                </button>
              </div>
            </div>

            <div className={styles.tableCard}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Наименование</th>
                    {selected?.code === 'cars' ? (
                      <>
                        <th>Гос. номер</th>
                        <th>VIN</th>
                      </>
                    ) : null}
                    {selected?.code === 'coa' ? (
                      <>
                        <th>Дт</th>
                        <th>Кт</th>
                        <th>Валюта</th>
                      </>
                    ) : null}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((i) => {
                    const meta = (i.meta ?? {}) as Record<string, unknown>;
                    return (
                      <tr key={i.id}>
                        <td>{i.code}</td>
                        <td>{i.name}</td>
                        {selected?.code === 'cars' ? (
                          <>
                            <td>{String(meta.plate ?? i.code)}</td>
                            <td>{String(meta.vin ?? '—')}</td>
                          </>
                        ) : null}
                        {selected?.code === 'coa' ? (
                          <>
                            <td>{meta.isDebit ? '✓' : '—'}</td>
                            <td>{meta.isCredit ? '✓' : '—'}</td>
                            <td>{String(meta.currency ?? 'UZS')}</td>
                          </>
                        ) : null}
                        <td className={styles.actionsCell}>
                          <span className={styles.rowHoverActions}>
                            <button
                              type="button"
                              className={styles.rowActionBtn}
                              onClick={() => openEditItem(i)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => void deleteItem(i.id)}
                            >
                              Удалить
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredItems.length ? (
                    <tr className={styles.rowExpand}>
                      <td colSpan={itemColSpan} className={styles.muted}>
                        {selected?.items?.length
                          ? 'Ничего не найдено'
                          : 'Пусто — добавьте элемент'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <FormModal
          open={dictModalOpen}
          title="Новый справочник"
          width="sm"
          onClose={() => setDictModalOpen(false)}
          footer={
            <>
              <button
                type="button"
                className={modal.btnPrimary}
                disabled={dictSaving || !newDictCode.trim() || !newDictName.trim()}
                onClick={() => void createDict()}
              >
                {dictSaving ? '…' : 'Создать'}
              </button>
              <button
                type="button"
                className={modal.btnGhost}
                onClick={() => setDictModalOpen(false)}
              >
                Закрыть
              </button>
            </>
          }
        >
          <div className={modal.fields}>
            <label className={modal.field}>
              <span>
                Код <em className={modal.req}>*</em>
              </span>
              <input
                value={newDictCode}
                onChange={(e) => setNewDictCode(e.target.value)}
                placeholder="new_dict"
                required
              />
            </label>
            <label className={modal.field}>
              <span>
                Наименование <em className={modal.req}>*</em>
              </span>
              <input
                value={newDictName}
                onChange={(e) => setNewDictName(e.target.value)}
                placeholder="Новый справочник"
                required
              />
            </label>
          </div>
        </FormModal>

        <FormModal
          open={itemMode === 'create' || itemMode === 'edit'}
          title={
            itemMode === 'edit'
              ? `${selected?.name ?? 'Элемент'} (изменение)`
              : `${selected?.name ?? 'Элемент'} (создание)`
          }
          width="md"
          onClose={closeItemModal}
          footer={
            <>
              <button
                type="button"
                className={modal.btnPrimary}
                disabled={itemSaving || !itemCode.trim() || !itemName.trim()}
                onClick={() => void saveItem()}
              >
                {itemSaving ? '…' : 'Сохранить'}
              </button>
              <button type="button" className={modal.btnGhost} onClick={closeItemModal}>
                Закрыть
              </button>
            </>
          }
        >
          <div className={modal.fields}>
            <label className={modal.field}>
              <span>
                Код <em className={modal.req}>*</em>
              </span>
              <input
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                required
              />
            </label>
            <label className={modal.field}>
              <span>
                Наименование <em className={modal.req}>*</em>
              </span>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
              />
            </label>
            {selected?.code === 'cars' ? (
              <>
                <label className={modal.field}>
                  <span>Гос. номер</span>
                  <input
                    value={itemPlate}
                    onChange={(e) => setItemPlate(e.target.value)}
                    placeholder="01A001AA"
                  />
                </label>
                <label className={modal.field}>
                  <span>VIN</span>
                  <input
                    value={itemVin}
                    onChange={(e) => setItemVin(e.target.value)}
                    placeholder="XWB…"
                  />
                </label>
              </>
            ) : null}
            {selected?.code === 'coa' ? (
              <>
                <label className={modal.checkRow}>
                  <input
                    type="checkbox"
                    checked={itemIsDebit}
                    onChange={(e) => setItemIsDebit(e.target.checked)}
                  />
                  <span>Дебет</span>
                </label>
                <label className={modal.checkRow}>
                  <input
                    type="checkbox"
                    checked={itemIsCredit}
                    onChange={(e) => setItemIsCredit(e.target.checked)}
                  />
                  <span>Кредит</span>
                </label>
                <label className={modal.field}>
                  <span>Валюта</span>
                  <input
                    value={itemCurrency}
                    onChange={(e) => setItemCurrency(e.target.value)}
                    placeholder="UZS"
                  />
                </label>
              </>
            ) : null}
          </div>
        </FormModal>
      </>
    );
  }

  const pageTitle =
    tab === 'main' && panel === 'news'
      ? 'Новостная лента'
      : tab === 'org'
        ? 'Кадровый учет'
        : tab === 'dictionaries'
          ? 'Справочники'
          : tab === 'extra'
            ? 'Дополнительные справочники'
            : tab === 'admin'
              ? 'Администрирование'
              : tab === 'users'
                ? 'Пользователи'
                : tab === 'integrations'
                  ? 'Внешние системы'
                  : tab === 'audit'
                    ? 'Аудит'
                    : 'Настройки';

  const pageSubtitle =
    tab === 'org'
      ? 'Реквизиты организации, часовой пояс и локаль'
      : tab === 'main' && panel === 'news'
        ? 'Служебные объявления для сотрудников'
        : tab !== 'main'
          ? 'Организация, справочники, администрирование и внешние системы'
          : '';

  const pageIcon =
    tab === 'org'
      ? 'fa-id-badge'
      : tab === 'main' && panel === 'news'
        ? 'fa-newspaper'
        : tab === 'dictionaries' || tab === 'extra'
          ? 'fa-book'
          : tab === 'admin'
            ? 'fa-tools'
            : tab === 'users'
              ? 'fa-users'
              : tab === 'integrations'
                ? 'fa-plug'
                : tab === 'audit'
                  ? 'fa-history'
                  : 'fa-cog';

  const pageIconMod =
    tab === 'org'
      ? styles.pageIconBadgeHr
      : tab === 'main' && panel === 'news'
        ? styles.pageIconBadgeAbsence
        : tab === 'integrations'
          ? styles.pageIconBadgeDoc
          : tab === 'audit'
            ? styles.pageIconBadgeTimesheet
            : '';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="settings-main" />

      {/* Section tabs always at top (same band as PageSubnav) */}
      {tab !== 'main' || panel === 'news' ? (
        <div className={styles.tabs}>
          {(
            [
              ['main', 'Главное'],
              ['org', 'Кадровый учет'],
              ['dictionaries', 'Справочники'],
              ['extra', 'Доп. справочники'],
              ['admin', 'Администрирование'],
              ['users', 'Пользователи и роли'],
              ['integrations', 'Внешние системы'],
              ['audit', 'Аудит'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={tab === k ? styles.tabActive : styles.tab}
              onClick={() => {
                setTab(k);
                if (k !== 'dictionaries' && k !== 'extra') setDictCode('');
                if (k !== 'integrations') setSysCode('');
                if (k !== 'admin') setPanel('');
                if (k !== 'extra') setGroup('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'main' && panel !== 'news' ? null : (
        <header className={styles.pageHeader}>
          <div
            className={[styles.pageIconBadge, pageIconMod].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            <i className={`fas ${pageIcon}`} />
          </div>
          <div className={styles.pageHeaderText}>
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
            {pageSubtitle ? <p className={styles.pageSubtitle}>{pageSubtitle}</p> : null}
          </div>
          <div className={styles.pageHeaderActions}>
            {tab === 'users' && users.length ? (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => downloadCsv('settings-users', users)}
              >
                CSV
              </button>
            ) : null}
            {(tab === 'dictionaries' ||
              tab === 'extra' ||
              (tab === 'admin' &&
                !ADMIN_SPECIAL.includes(panel as (typeof ADMIN_SPECIAL)[number]))) &&
            selected?.items?.length ? (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  downloadCsv(`dictionary-${selected?.code ?? 'items'}`, selected?.items ?? [])
                }
              >
                CSV
              </button>
            ) : null}
            {tab === 'main' && panel === 'news' ? (
              <a className={styles.btnSecondary} href="/news">
                Открыть ленту
              </a>
            ) : null}
          </div>
        </header>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'main' ? (
        panel === 'news' ? (
          <div className={styles.formPanel} style={{ padding: '1.15rem 1.25rem 1.35rem' }}>
            <p className={styles.hint} style={{ marginBottom: '1rem' }}>
              Записи хранятся в справочнике «Новостная лента». Полная лента с FormModal — на{' '}
              <a href="/news" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                /news
              </a>
              .
            </p>
            <form
              className={styles.form}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const title = String(fd.get('title') || '').trim();
                const body = String(fd.get('body') || '').trim();
                if (!title) return;
                try {
                  let newsDict = dicts.find((d) => d.code === 'news_feed');
                  if (!newsDict) {
                    newsDict = await apiFetch<Dict>('/api/settings/dictionaries', {
                      method: 'POST',
                      body: JSON.stringify({
                        code: 'news_feed',
                        name: 'Новостная лента',
                        kind: 'extra',
                      }),
                    });
                  }
                  const code = `N-${Date.now().toString(36).toUpperCase()}`;
                  await apiFetch(`/api/settings/dictionaries/${newsDict.id}/items`, {
                    method: 'POST',
                    body: JSON.stringify({
                      code,
                      name: title,
                      meta: { body },
                    }),
                  });
                  setError('');
                  e.currentTarget.reset();
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка');
                }
              }}
            >
              <label>
                Заголовок
                <input name="title" required />
              </label>
              <label>
                Текст
                <textarea name="body" rows={3} />
              </label>
              <button className={styles.btn} type="submit">
                Добавить
              </button>
            </form>
            <ul style={{ marginTop: '1rem', paddingLeft: '1.1rem' }}>
              {(dicts.find((d) => d.code === 'news_feed')?.items || []).map((it) => (
                <li key={it.id} style={{ marginBottom: '0.45rem' }}>
                  <strong>{it.name}</strong>
                  {it.meta && typeof it.meta === 'object' && 'body' in it.meta
                    ? ` — ${String((it.meta as { body?: string }).body || '')}`
                    : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <SystemSettingsPanel />
        )
      ) : null}

      {tab === 'org' && org ? (
        <div className={styles.formPanel} style={{ padding: '1.15rem 1.25rem 1.35rem' }}>
          <form className={styles.form} onSubmit={saveOrg}>
            <label>
              Код tenant
              <input value={org.tenant.code} disabled />
            </label>
            <label>
              Наименование
              <input
                name="orgName"
                defaultValue={org.settings.orgName ?? org.tenant.name}
                required
              />
            </label>
            <label>
              Юридическое наименование
              <input name="legalName" defaultValue={org.settings.legalName ?? ''} />
            </label>
            <label>
              ИНН / STIR
              <input name="inn" defaultValue={org.settings.inn ?? ''} />
            </label>
            <label>
              Адрес
              <input name="address" defaultValue={org.settings.address ?? ''} />
            </label>
            <label>
              Телефон
              <input name="phone" defaultValue={org.settings.phone ?? ''} />
            </label>
            <label>
              Часовой пояс
              <input name="timezone" defaultValue={org.settings.timezone} />
            </label>
            <label>
              Валюта
              <input name="currency" defaultValue={org.settings.currency} />
            </label>
            <label>
              Locale
              <input name="locale" defaultValue={org.settings.locale} />
            </label>
            <button className={styles.btn} type="submit">
              Сохранить
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'admin' ? (
        <>
          <div className={styles.panel} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem' }}>
              {(
                [
                  ['orgs', 'Организации'],
                  ['regions', 'Регионы'],
                  ['banks', 'Банки'],
                  ['quickstart', 'Быстрый запуск'],
                  ['photos', 'Загрузка фото'],
                  ['import_docs', 'Импорт документов'],
                ] as const
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  className={panel === p ? styles.tabActive : styles.tab}
                  onClick={() => setPanel(p)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!panel ? (
              <>
                <h2 className={styles.h1} style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
                  Администрирование
                </h2>
                <p className={styles.lead} style={{ marginBottom: '1rem' }}>
                  Выберите панель выше или откройте ссылку из меню Настройки.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: '1rem',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div
                    style={{
                      padding: '0.85rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div className={styles.muted}>Пользователи</div>
                    <strong style={{ fontSize: '1.4rem' }}>{users.length}</strong>
                  </div>
                  <div
                    style={{
                      padding: '0.85rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div className={styles.muted}>Интеграции</div>
                    <strong style={{ fontSize: '1.4rem' }}>{integrations.length}</strong>
                  </div>
                  <div
                    style={{
                      padding: '0.85rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div className={styles.muted}>Tenant</div>
                    <strong style={{ fontSize: '1rem' }}>{org?.tenant.code ?? '—'}</strong>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {(ADMIN_DICT_PANELS as readonly string[]).includes(panel) || !panel
            ? panel &&
              (ADMIN_DICT_PANELS as readonly string[]).includes(panel) &&
              panel !== 'orgs' &&
              panel !== 'regions' &&
              panel !== 'banks'
              ? renderDictionaryCrud(
                  panel === 'orgs'
                    ? 'Организации'
                    : panel === 'regions'
                      ? 'Регионы'
                      : 'Банки',
                )
              : null
            : null}
        </>
      ) : null}

      {tab === 'users' ? (
        <>
          <div className={styles.panel} style={{ marginBottom: '1rem' }}>
            <form className={styles.form} onSubmit={createUser}>
              <label>
                ФИО
                <input name="fullName" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Пароль
                <input name="password" type="password" required minLength={6} />
              </label>
              <label>
                Роль
                <select name="role" defaultValue="hr">
                  <option value="tenant_admin">tenant_admin</option>
                  <option value="hr">hr</option>
                  <option value="manager">manager</option>
                  <option value="employee">employee</option>
                </select>
              </label>
              <button className={styles.btn} type="submit">
                Добавить пользователя
              </button>
            </form>
          </div>
          <div className={styles.panel}>
            <table>
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        aria-label="Роль"
                      >
                        <option value="tenant_admin">tenant_admin</option>
                        <option value="hr">hr</option>
                        <option value="manager">manager</option>
                        <option value="employee">employee</option>
                      </select>
                    </td>
                    <td>
                      <span className={u.isActive ? styles.badgeOk : styles.badgeWarn}>
                        {u.isActive ? 'active' : 'off'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => toggleUser(u)}
                      >
                        {u.isActive ? 'Отключить' : 'Включить'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'dictionaries' || tab === 'extra' ? (
        <>
          {tab === 'extra' && (group === 'entities' || group === 'facts') ? (
            <div className={styles.panel} style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem' }}>
                {group === 'entities' ? 'Объекты (динамичные поля)' : 'Факты (динамичные поля)'}
              </h2>
              <p className={styles.muted}>
                Метаданные расширяемых сущностей. Ниже — CRUD справочника «
                {group === 'entities' ? 'Объекты' : 'Факты'}».
              </p>
            </div>
          ) : null}
          {renderDictionaryCrud(tab === 'extra' ? 'Дополнительные справочники' : 'Справочники')}
        </>
      ) : null}

      {tab === 'integrations' ? (
        <>
          <div className={styles.panel} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem' }}>
              <button
                type="button"
                className={!sysCode ? styles.tabActive : styles.tab}
                onClick={() => setSysCode('')}
              >
                Все
              </button>
              {SYS_CODES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={sysCode === s ? styles.tabActive : styles.tab}
                  onClick={() => setSysCode(s)}
                >
                  {sysLabel(s)}
                </button>
              ))}
            </div>
            <form className={styles.form} onSubmit={createIntegration}>
              <label>
                Система
                <select name="sys" defaultValue={sysCode || 'artix'}>
                  {SYS_CODES.map((s) => (
                    <option key={s} value={s}>
                      {sysLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Тип
                <select name="type" defaultValue="custom">
                  <option value="custom">custom</option>
                  <option value="webhook">webhook</option>
                  <option value="onec">1C</option>
                  <option value="hikvision">hikvision</option>
                  <option value="bank">bank</option>
                </select>
              </label>
              <label>
                Наименование
                <input name="name" required placeholder="Настройки ARTIX" />
              </label>
              <label>
                API URL
                <input name="apiUrl" placeholder="https://..." />
              </label>
              <label>
                API Key
                <input name="apiKey" placeholder="••••••" />
              </label>
              <label>
                Webhook URL
                <input name="webhookUrl" placeholder="https://..." />
              </label>
              <button className={styles.btn} type="submit">
                Добавить
              </button>
            </form>
          </div>
          <div className={styles.panel}>
            <table>
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Система</th>
                  <th>Тип</th>
                  <th>URL</th>
                  <th>Последний sync</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredIntegrations.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.name}
                      {i.config?.stub ? (
                        <div className={styles.muted} style={{ fontSize: 11 }}>
                          Stub: {i.config.note || 'внешний API не подключён'}
                        </div>
                      ) : null}
                    </td>
                    <td>{sysLabel(integrationSys(i)) || '—'}</td>
                    <td>{i.type}</td>
                    <td>{i.webhookUrl ?? '—'}</td>
                    <td>
                      {i.lastSyncAt
                        ? String(i.lastSyncAt).replace('T', ' ').slice(0, 19)
                        : '—'}
                    </td>
                    <td>
                      <span className={i.isActive ? styles.badgeOk : styles.badge}>
                        {i.isActive ? 'active' : i.config?.stub ? 'stub' : 'off'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={() => syncIntegration(i.id)}
                          disabled={!i.isActive && !i.config?.stub}
                        >
                          Синхронизация
                        </button>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => toggleIntegration(i)}
                        >
                          {i.isActive ? 'Отключить' : 'Включить'}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!filteredIntegrations.length ? (
                  <tr>
                    <td colSpan={7} className={styles.muted}>
                      Нет интеграций для выбранной системы
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'audit' ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.leftActions}>
              <span className={styles.muted} style={{ fontSize: 13, fontWeight: 600 }}>
                Журнал действий
              </span>
            </div>
            <div className={styles.rightTools}>
              <span className={styles.countBadge}>{audit.length}</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => void load()}
                title="Обновить"
                aria-label="Обновить"
              >
                <i className="fas fa-sync-alt" aria-hidden />
              </button>
            </div>
          </div>
          <div className={styles.tableCard}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Действие</th>
                  <th>Сущность</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className={styles.rowExpand}>
                    <td>{String(a.createdAt).replace('T', ' ').slice(0, 19)}</td>
                    <td>{a.action}</td>
                    <td>{a.entity ?? '—'}</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{a.entityId?.slice(0, 8) ?? '—'}</code>
                    </td>
                  </tr>
                ))}
                {audit.length === 0 ? (
                  <tr className={styles.rowExpand}>
                    <td colSpan={4} className={styles.muted}>
                      Пусто
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
