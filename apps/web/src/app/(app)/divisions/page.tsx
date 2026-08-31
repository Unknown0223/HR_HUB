'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiDownload, apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox, type PhotoLightboxApi } from '@/components/PhotoLightbox';
import { downloadXlsxViaApi } from '@/lib/excel';
import { useUrlParam } from '@/lib/use-url-state';
import list from './list.module.css';
import chart from './org-chart.module.css';

type Tab = 'tree' | 'divisions' | 'groups';
const TABS = ['divisions', 'tree', 'groups'] as const;

const DIV_FILTER_KEYS = [
  'code',
  'name',
  'groupId',
  'createdBy',
  'from',
  'to',
  'status',
] as const;

type Division = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  createdAt?: string;
  createdByLabel?: string | null;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber?: string;
    position?: { name: string; code?: string } | null;
  } | null;
  divisionGroup?: { id: string; name: string; code: string } | null;
  _count?: { children: number; employees: number };
};

type DivisionGroupRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  _count?: { divisions?: number };
};

type EmpPreview = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  positionName: string | null;
};

type TreeNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  isActive: boolean;
  employeeCount: number;
  childDivisionCount: number;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    photoUrl: string | null;
    positionName: string | null;
  } | null;
  employeesPreview: EmpPreview[];
  children: TreeNode[];
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? list.badgeOk : list.badgeWarn}>
      {active ? 'Активный' : 'Неактивный'}
    </span>
  );
}

function initials(last: string, first: string) {
  return `${(last || '?')[0] ?? ''}${(first || '?')[0] ?? ''}`.toUpperCase();
}

function fullName(p: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
}

function headerClass(level: number) {
  if (level <= 0) return chart.lvl0;
  if (level === 1) return chart.lvl1;
  if (level === 2) return chart.lvl2;
  return chart.lvl3;
}

function isStubNode(node: TreeNode): boolean {
  const hasKids = (node.children?.length ?? 0) > 0;
  return !node.manager && node.employeeCount === 0 && !hasKids;
}

function preferredRoot(nodes: TreeNode[]): TreeNode | null {
  if (!nodes.length) return null;
  const hq = nodes.find((n) => n.code.toUpperCase() === 'HQ');
  if (hq) return hq;
  return [...nodes].sort(
    (a, b) =>
      b.childDivisionCount + b.employeeCount - (a.childDivisionCount + a.employeeCount),
  )[0];
}

function findChild(node: TreeNode, id: string): TreeNode | undefined {
  return (node.children ?? []).find((c) => c.id === id);
}

function Avatar({
  photoUrl,
  lastName,
  firstName,
  sizeClass,
  lightbox,
  slides,
  index = 0,
}: {
  photoUrl: string | null;
  lastName: string;
  firstName: string;
  sizeClass?: string;
  lightbox?: PhotoLightboxApi;
  slides?: { src: string; caption?: string }[];
  index?: number;
}) {
  const src = mediaSrc(photoUrl);
  if (src && lightbox) {
    return (
      <PhotoThumb
        className={sizeClass || chart.avatar}
        src={src}
        alt=""
        width={42}
        height={42}
        lightbox={lightbox}
        slides={slides?.length ? slides : [{ src, caption: `${lastName} ${firstName}` }]}
        index={index}
      />
    );
  }
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={sizeClass || chart.avatar}
        src={src}
        alt=""
        width={42}
        height={42}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className={chart.avatarFallback}>
      {initials(lastName, firstName)}
    </span>
  );
}

function OrgCard({
  node,
  level,
  compact,
  stubsOpen,
  onToggleStubs,
}: {
  node: TreeNode;
  level: number;
  compact?: boolean;
  stubsOpen?: boolean;
  onToggleStubs?: () => void;
}) {
  const photos = usePhotoLightbox();
  const empLabel =
    node.employeeCount === 1
      ? '1 сотрудник'
      : `${node.employeeCount} сотрудника(ов)`;
  const stubCount = (node.children ?? []).filter(isStubNode).length;
  const cardSlides = [
    node.manager
      ? {
          src: mediaSrc(node.manager.photoUrl) || '',
          caption: fullName(node.manager),
        }
      : null,
    ...node.employeesPreview.map((e) => ({
      src: mediaSrc(e.photoUrl) || '',
      caption: fullName(e),
    })),
  ].filter((s): s is { src: string; caption: string } => Boolean(s?.src));

  return (
    <>
    <div className={[chart.card, compact ? chart.miniCard : ''].filter(Boolean).join(' ')}>
      <div className={`${chart.cardHeader} ${headerClass(level)}`}>
        <span>{node.code || node.name}</span>
      </div>
      <div className={chart.body}>
        <div className={chart.manager}>
          {node.manager ? (
            <>
              <Avatar
                photoUrl={node.manager.photoUrl}
                lastName={node.manager.lastName}
                firstName={node.manager.firstName}
                sizeClass={chart.managerPhoto}
                lightbox={photos}
                slides={cardSlides}
                index={Math.max(
                  0,
                  cardSlides.findIndex(
                    (s) => s.src === mediaSrc(node.manager?.photoUrl),
                  ),
                )}
              />
              <div className={chart.managerMeta}>
                <div className={chart.managerName}>{fullName(node.manager)}</div>
                <div className={chart.managerTitle}>
                  {node.manager.positionName || 'Руководитель'}
                </div>
              </div>
            </>
          ) : (
            <span className={chart.emptyMgr}>Руководитель не назначен</span>
          )}
        </div>
        <div className={chart.staffBlock}>
          <div className={chart.staffRow}>
            <div className={chart.avatarStack}>
              {node.employeesPreview.slice(0, 5).map((e) => {
                const src = mediaSrc(e.photoUrl);
                return (
                  <Avatar
                    key={e.id}
                    photoUrl={e.photoUrl}
                    lastName={e.lastName}
                    firstName={e.firstName}
                    lightbox={photos}
                    slides={cardSlides}
                    index={Math.max(
                      0,
                      src ? cardSlides.findIndex((s) => s.src === src) : 0,
                    )}
                  />
                );
              })}
            </div>
            <Link
              className={chart.empLink}
              href={`/employees?divisionId=${node.id}`}
            >
              {empLabel}
            </Link>
          </div>
        </div>
      </div>
      <div className={chart.cardFooter}>
        <span>Кол-во подразделений: {node.childDivisionCount}</span>
        {stubCount > 0 && onToggleStubs ? (
          <button type="button" className={chart.footerBtn} onClick={onToggleStubs}>
            {stubsOpen ? 'Скрыть' : 'Показать'}
          </button>
        ) : null}
      </div>
    </div>
    {photos.node}
    </>
  );
}

function StubPanel({ nodes }: { nodes: TreeNode[] }) {
  if (!nodes.length) return null;
  return (
    <div className={chart.stubPanel}>
      <div className={chart.stubTitle}>Подразделения ({nodes.length})</div>
      <div className={chart.stubGrid}>
        {nodes.map((n) => (
          <Link
            key={n.id}
            className={chart.stubChip}
            href={`/employees?divisionId=${n.id}`}
            title={n.name}
          >
            {n.code || n.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

function FocusChart({ roots }: { roots: TreeNode[] }) {
  const root = useMemo(() => preferredRoot(roots), [roots]);
  const [path, setPath] = useState<string[]>([]);
  const [openStubs, setOpenStubs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!root) {
      setPath([]);
      return;
    }
    const first = (root.children ?? []).find((c) => !isStubNode(c));
    setPath(first ? [first.id] : []);
    setOpenStubs({});
  }, [root?.id]);

  if (!root) return null;

  const chain: TreeNode[] = [root];
  let cursor = root;
  for (const id of path) {
    const next = findChild(cursor, id);
    if (!next || isStubNode(next)) break;
    chain.push(next);
    cursor = next;
  }

  return (
    <div className={chart.focusStack}>
      {chain.map((node, idx) => {
        const mainKids = (node.children ?? []).filter((c) => !isStubNode(c));
        const stubs = (node.children ?? []).filter(isStubNode);
        const selectedId = path[idx];
        const showStubs = Boolean(openStubs[node.id]);
        return (
          <div key={node.id} style={{ display: 'contents' }}>
            {idx > 0 ? <div className={chart.vline} /> : null}
            <OrgCard
              node={node}
              level={idx}
              stubsOpen={showStubs}
              onToggleStubs={
                stubs.length
                  ? () =>
                      setOpenStubs((s) => ({
                        ...s,
                        [node.id]: !s[node.id],
                      }))
                  : undefined
              }
            />
            {showStubs ? <StubPanel nodes={stubs} /> : null}
            {mainKids.length ? (
              <>
                <div className={chart.vline} />
                <div className={chart.siblingBar}>
                  {mainKids.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={
                        selectedId === k.id ? chart.sibChipActive : chart.sibChip
                      }
                      onClick={() =>
                        setPath((prev) => {
                          const next = prev.slice(0, idx);
                          next[idx] = k.id;
                          return next;
                        })
                      }
                    >
                      {k.code || k.name}
                      {k.employeeCount ? ` · ${k.employeeCount}` : ''}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FullBranch({ nodes, level }: { nodes: TreeNode[]; level: number }) {
  if (!nodes.length) return null;
  const single = nodes.length === 1;
  return (
    <div className={chart.childrenBlock}>
      <div className={chart.vline} />
      <div
        className={[
          chart.childrenRow,
          single ? chart.childrenRowSingle : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {nodes.map((n) => (
          <div key={n.id} className={chart.childCol}>
            <FullNode node={n} level={level} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FullNode({ node, level }: { node: TreeNode; level: number }) {
  const kids = node.children ?? [];
  const stubs = kids.filter(isStubNode);
  const mainKids = kids.filter((c) => !isStubNode(c));
  const [showStubs, setShowStubs] = useState(false);

  return (
    <div className={chart.level}>
      <OrgCard
        node={node}
        level={level}
        compact
        stubsOpen={showStubs}
        onToggleStubs={
          stubs.length ? () => setShowStubs((v) => !v) : undefined
        }
      />
      {showStubs ? <StubPanel nodes={stubs} /> : null}
      {mainKids.length ? <FullBranch nodes={mainKids} level={level + 1} /> : null}
    </div>
  );
}

function FullMap({ roots }: { roots: TreeNode[] }) {
  const visible = roots.filter((r) => !isStubNode(r) || r.children?.length);
  return (
    <div className={chart.fullMap}>
      <div className={chart.roots}>
        {visible.map((root) => (
          <FullNode key={root.id} node={root} level={0} />
        ))}
      </div>
    </div>
  );
}

function DivisionsPageInner() {
  const [tab] = useUrlParam('tab', 'divisions', TABS);
  const filters = useFilterFromUrl(DIV_FILTER_KEYS);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [groups, setGroups] = useState<DivisionGroupRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chartMode, setChartMode] = useState<'focus' | 'full'>('focus');
  const exportRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const [t, d, g] = await Promise.all([
        apiFetch<TreeNode[]>('/api/organization/divisions/tree'),
        apiFetch<Division[]>('/api/organization/divisions'),
        apiFetch<DivisionGroupRow[]>('/api/catalog/division-groups'),
      ]);
      setTree(t);
      setDivisions(d);
      setGroups(Array.isArray(g) ? g : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!exportRef.current?.contains(e.target as Node)) {
          setExportOpen(false);
        }
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, []);

  const filteredDivisions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const groupF = (filters.groupId || '').trim();
    const createdByF = (filters.createdBy || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return divisions.filter((d) => {
      if (codeF && !(d.code || '').toLowerCase().includes(codeF)) return false;
      if (nameF && !(d.name || '').toLowerCase().includes(nameF)) return false;
      if (groupF && d.divisionGroup?.id !== groupF) return false;
      if (
        createdByF &&
        !(d.createdByLabel || 'Admin').toLowerCase().includes(createdByF)
      ) {
        return false;
      }
      if (statusF === 'active' && !d.isActive) return false;
      if (statusF === 'inactive' && d.isActive) return false;
      if (from || to) {
        if (!d.createdAt) return false;
        const created = new Date(d.createdAt);
        if (Number.isNaN(created.getTime())) return false;
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      if (!q) return true;
      const blob = [
        d.code,
        d.name,
        d.createdByLabel,
        d.divisionGroup?.name,
        d.manager?.lastName,
        d.manager?.firstName,
        d.manager?.tabNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [divisions, search, filters]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    return groups.filter((g) => {
      if (codeF && !(g.code || '').toLowerCase().includes(codeF)) return false;
      if (nameF && !(g.name || '').toLowerCase().includes(nameF)) return false;
      if (statusF === 'active' && !g.isActive) return false;
      if (statusF === 'inactive' && g.isActive) return false;
      if (!q) return true;
      return [g.code, g.name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [groups, search, filters]);

  const groupFilterOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );

  async function exportOrg(format: 'xlsx' | 'csv') {
    setExportBusy(true);
    setExportOpen(false);
    try {
      if (format === 'xlsx') {
        await downloadXlsxViaApi(
          '/api/organization/divisions/export.xlsx',
          'org-structure.xlsx',
        );
      } else {
        await apiDownload(
          '/api/organization/divisions/export.csv',
          'org-structure.csv',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  async function deleteDivision(id: string) {
    if (!(await confirm('Удалить подразделение?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/organization/divisions/${id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  const subnavKey = 'divisions';

  function managerLabel(d: Division) {
    const m = d.manager;
    if (!m) return '—';
    const name = [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' ');
    const pos = m.position?.code || m.position?.name;
    return [name, pos, m.tabNumber ? `(${m.tabNumber})` : null].filter(Boolean).join(' ');
  }

  function fmtCreated(iso?: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU');
  }

  return (
    <div className={list.wrap}>
      <PageSubnav groupKey={subnavKey} />

      <div className={list.toolbar}>
        <div className={list.leftActions}>
          {tab === 'tree' ? (
            <div className={list.exportWrap} ref={exportRef}>
              <button
                type="button"
                className={list.exportBtn}
                disabled={exportBusy || !tree.length}
                onClick={() => setExportOpen((v) => !v)}
              >
                {exportBusy ? '…' : 'Экспорт ▾'}
              </button>
              {exportOpen ? (
                <div className={list.exportMenu} role="menu">
                  <button type="button" role="menuitem" onClick={() => void exportOrg('xlsx')}>
                    Excel
                  </button>
                  <button type="button" role="menuitem" onClick={() => void exportOrg('csv')}>
                    CSV
                  </button>
                </div>
              ) : null}
            </div>
          ) : tab === 'groups' ? (
            <Link href="/catalog/division-groups" className={list.createBtn}>
              Создать
            </Link>
          ) : (
            <>
              <Link href="/divisions/new" className={list.createBtn}>
                Создать
              </Link>
              <Link href="/divisions/import" className={list.importBtn}>
                Импорт
              </Link>
            </>
          )}
          <button type="button" className={list.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          {tab === 'divisions' || tab === 'groups' ? (
            <FilterPanel
              inline
              urlSync
              open={filtersOpen}
              onToggle={() => setFiltersOpen((v) => !v)}
              fields={
                tab === 'divisions'
                  ? [
                      { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
                      { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
                      {
                        type: 'select',
                        key: 'groupId',
                        label: 'Группа подразделений',
                        options: groupFilterOptions,
                      },
                      {
                        type: 'text',
                        key: 'createdBy',
                        label: 'Создал',
                        placeholder: 'Поиск...',
                      },
                      {
                        type: 'dateRange',
                        fromKey: 'from',
                        toKey: 'to',
                        label: 'Дата создания',
                      },
                      {
                        type: 'select',
                        key: 'status',
                        label: 'Статус',
                        options: [
                          { value: 'active', label: 'Активный' },
                          { value: 'inactive', label: 'Неактивный' },
                        ],
                      },
                    ]
                  : [
                      { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
                      { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
                      {
                        type: 'select',
                        key: 'status',
                        label: 'Статус',
                        options: [
                          { value: 'active', label: 'Активный' },
                          { value: 'inactive', label: 'Неактивный' },
                        ],
                      },
                    ]
              }
            />
          ) : null}
        </div>

        {tab !== 'tree' ? (
          <div className={list.rightTools}>
            <input
              className={list.search}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className={list.pagerMeta}>
              {tab === 'divisions'
                ? `${filteredDivisions.length} / ${divisions.length}`
                : `${filteredGroups.length} / ${groups.length}`}
            </span>
          </div>
        ) : null}
      </div>

      {error ? <p className={list.error}>{error}</p> : null}

      {tab === 'tree' ? (
        <div className={chart.chartWrap}>
          <div className={chart.toolbar}>
            <div className={chart.modeSwitch}>
              <button
                type="button"
                className={chartMode === 'focus' ? chart.modeBtnActive : chart.modeBtn}
                onClick={() => setChartMode('focus')}
              >
                Ветка
              </button>
              <button
                type="button"
                className={chartMode === 'full' ? chart.modeBtnActive : chart.modeBtn}
                onClick={() => setChartMode('full')}
              >
                Вся схема
              </button>
            </div>
          </div>
          {tree.length ? (
            chartMode === 'focus' ? (
              <FocusChart roots={tree} />
            ) : (
              <FullMap roots={tree} />
            )
          ) : (
            <p className={list.empty}>Нет данных</p>
          )}
        </div>
      ) : null}

      {tab === 'divisions' ? (
        <div className={list.tableWrap}>
          <table className={list.table}>
            <thead>
              <tr>
                <th className={list.checkCol} />
                <th>Код</th>
                <th>Название</th>
                <th>Руководитель</th>
                <th>Группа подразделений</th>
                <th>Создал</th>
                <th>Дата создания</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredDivisions.map((d) => {
                const open = selectedId === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr
                      className={open ? list.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : d.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={() => setSelectedId(open ? null : d.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{d.code || '—'}</td>
                      <td>{d.name}</td>
                      <td>{managerLabel(d)}</td>
                      <td>{d.divisionGroup?.name || '—'}</td>
                      <td>{d.createdByLabel || 'Admin'}</td>
                      <td>{fmtCreated(d.createdAt)}</td>
                      <td>
                        <StatusBadge active={d.isActive} />
                      </td>
                    </tr>
                    {open ? (
                      <tr className={list.actionsRow}>
                        <td colSpan={8}>
                          <div className={list.rowActions}>
                            <Link href={`/divisions/${d.id}`}>Просмотреть</Link>
                            <Link href={`/divisions/${d.id}/edit`}>Изменить</Link>
                            <Link href="/divisions?tab=tree">Подразделения</Link>
                            <Link href={`/employees?divisionId=${d.id}`}>Сотрудники</Link>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteDivision(d.id)}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {filteredDivisions.length === 0 ? (
                <tr>
                  <td colSpan={8} className={list.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'groups' ? (
        <div className={list.tableWrap}>
          <table className={list.table}>
            <thead>
              <tr>
                <th className={list.checkCol} />
                <th>Код</th>
                <th>Название</th>
                <th>Количество отделов</th>
                <th>Создал</th>
                <th>Дата создания</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => {
                const open = selectedGroupId === g.id;
                return (
                  <Fragment key={g.id}>
                    <tr
                      className={open ? list.rowSelected : undefined}
                      onClick={() => setSelectedGroupId(open ? null : g.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={() => setSelectedGroupId(open ? null : g.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{g.code || '—'}</td>
                      <td>{g.name}</td>
                      <td>{g._count?.divisions ?? 0}</td>
                      <td>Admin</td>
                      <td>{fmtCreated(g.createdAt)}</td>
                      <td>
                        <StatusBadge active={g.isActive} />
                      </td>
                    </tr>
                    {open ? (
                      <tr className={list.actionsRow}>
                        <td colSpan={7}>
                          <div className={list.rowActions}>
                            <Link href="/catalog/division-groups">Просмотреть</Link>
                            <Link href="/catalog/division-groups">Изменить</Link>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiFetch(`/api/catalog/division-groups/${g.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ isActive: !g.isActive }),
                                  });
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Ошибка');
                                }
                              }}
                            >
                              {g.isActive ? 'Неактивный' : 'Активный'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!(await confirm('Удалить группу?'))) return;
                                try {
                                  await apiFetch(`/api/catalog/division-groups/${g.id}`, {
                                    method: 'DELETE',
                                  });
                                  setSelectedGroupId(null);
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Ошибка');
                                }
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className={list.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function DivisionsPage() {
  return (
    <Suspense fallback={<p className={list.empty}>Загрузка…</p>}>
      <DivisionsPageInner />
    </Suspense>
  );
}
