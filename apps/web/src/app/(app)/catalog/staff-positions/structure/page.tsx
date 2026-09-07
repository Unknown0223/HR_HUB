'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadXlsxViaApi } from '@/lib/excel';
import shared from '../../../../page-shared.module.css';
import styles from './structure.module.css';

type PosNode = {
  id: string;
  code: string;
  title: string;
  headcount: number;
  employeeCount: number;
};

type DivNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  positions: PosNode[];
  children: DivNode[];
};

type TreeResponse = {
  title: string;
  roots: DivNode[];
  orphanPositions: PosNode[];
};

type ViewMode = 'list' | 'focus';

type NodeStats = { positions: number; people: number; units: number; empty: boolean };

function countStaff(node: DivNode): NodeStats {
  let positions = node.positions.length;
  let people = node.positions.reduce((s, p) => s + (p.employeeCount || 0), 0);
  let units = node.positions.reduce((s, p) => s + (p.headcount || 0), 0);
  for (const c of node.children) {
    const nested = countStaff(c);
    positions += nested.positions;
    people += nested.people;
    units += nested.units;
  }
  return {
    positions,
    people,
    units,
    empty: positions === 0,
  };
}

function nodeMatches(node: DivNode, q: string): boolean {
  if (!q) return true;
  const blob = `${node.code} ${node.name}`.toLowerCase();
  if (blob.includes(q)) return true;
  if (
    node.positions.some((p) =>
      `${p.title} ${p.code}`.toLowerCase().includes(q),
    )
  ) {
    return true;
  }
  return node.children.some((c) => nodeMatches(c, q));
}

function collectExpandIds(node: DivNode, q: string, into: Set<string>) {
  const selfHit = `${node.code} ${node.name}`.toLowerCase().includes(q);
  const posHit = node.positions.some((p) =>
    `${p.title} ${p.code}`.toLowerCase().includes(q),
  );
  let childHit = false;
  for (const c of node.children) {
    if (nodeMatches(c, q)) {
      childHit = true;
      collectExpandIds(c, q, into);
    }
  }
  if (selfHit || posHit || childHit) into.add(node.id);
}

function filterPositions(positions: PosNode[], q: string): PosNode[] {
  if (!q) return positions;
  return positions.filter((p) =>
    `${p.title} ${p.code}`.toLowerCase().includes(q),
  );
}

function PosChip({
  p,
  selected,
  onSelect,
  highlight,
}: {
  p: PosNode;
  selected: boolean;
  onSelect: () => void;
  highlight?: boolean;
}) {
  const filled = p.employeeCount || 0;
  const units = p.headcount || 0;
  const vacant = units > 0 && filled === 0;
  const over = units > 0 && filled > units;

  return (
    <button
      type="button"
      className={[
        selected ? styles.posChipActive : styles.posChip,
        vacant ? styles.posVacant : '',
        over ? styles.posOver : '',
        highlight ? styles.posHit : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      title={`${p.title}\n${p.code} · занято ${filled} / ${units || '—'} ед.`}
    >
      <span className={styles.posCount}>{filled || units || 0}</span>
      <span className={styles.posBody}>
        <span className={styles.posTitle}>{p.title}</span>
        <span className={styles.posMeta}>
          {filled}/{units || '—'} · {p.code}
        </span>
      </span>
    </button>
  );
}

function PosGrid({
  positions,
  selectedPosId,
  onSelectPos,
  query,
}: {
  positions: PosNode[];
  selectedPosId: string | null;
  onSelectPos: (id: string | null) => void;
  query: string;
}) {
  const list = filterPositions(positions, query);
  if (!list.length) {
    return query ? (
      <p className={styles.posEmpty}>Нет позиций по запросу</p>
    ) : (
      <p className={styles.posEmpty}>нет позиций</p>
    );
  }
  return (
    <div className={styles.posGrid}>
      {list.map((p) => (
        <PosChip
          key={p.id}
          p={p}
          selected={selectedPosId === p.id}
          highlight={Boolean(
            query && `${p.title} ${p.code}`.toLowerCase().includes(query),
          )}
          onSelect={() =>
            onSelectPos(selectedPosId === p.id ? null : p.id)
          }
        />
      ))}
    </div>
  );
}

function ListBranch({
  node,
  depth,
  expanded,
  onToggle,
  selectedPosId,
  onSelectPos,
  query,
  hideEmpty,
}: {
  node: DivNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedPosId: string | null;
  onSelectPos: (id: string | null) => void;
  query: string;
  hideEmpty: boolean;
}) {
  const stats = useMemo(() => countStaff(node), [node]);
  if (hideEmpty && stats.empty) return null;
  if (query && !nodeMatches(node, query)) return null;

  const open = expanded.has(node.id);
  const hasBody =
    node.children.length > 0 ||
    filterPositions(node.positions, query).length > 0 ||
    (!query && node.positions.length > 0);

  const lvl =
    depth === 0
      ? styles.rowLvl0
      : depth === 1
        ? styles.rowLvl1
        : depth === 2
          ? styles.rowLvl2
          : styles.rowLvl3;

  return (
    <div className={styles.listBranch}>
      <div
        className={`${styles.listRow} ${lvl}`}
        style={{ paddingLeft: `${12 + depth * 18}px` } as CSSProperties}
      >
        <button
          type="button"
          className={styles.expandBtn}
          disabled={!hasBody}
          aria-expanded={open}
          aria-label={open ? 'Свернуть' : 'Развернуть'}
          onClick={() => onToggle(node.id)}
        >
          {hasBody ? (open ? '▾' : '▸') : '·'}
        </button>
        <button
          type="button"
          className={styles.listMain}
          onClick={() => onToggle(node.id)}
        >
          <span className={styles.listCode}>{node.code || '—'}</span>
          <span className={styles.listName}>{node.name}</span>
        </button>
        <div className={styles.listStats}>
          <span title="Позиции в ветке">
            <strong>{stats.positions}</strong> поз.
          </span>
          <span title="Сотрудники">
            <strong>{stats.people}</strong> чел.
          </span>
          <span title="Штатные единицы">
            <strong>{stats.units}</strong> ед.
          </span>
        </div>
      </div>

      {open ? (
        <div className={styles.listBody}>
          {(query
            ? filterPositions(node.positions, query).length > 0
            : node.positions.length > 0) && (
            <div
              className={styles.listPosWrap}
              style={
                { paddingLeft: `${30 + depth * 18}px` } as CSSProperties
              }
            >
              <PosGrid
                positions={node.positions}
                selectedPosId={selectedPosId}
                onSelectPos={onSelectPos}
                query={query}
              />
            </div>
          )}
          {node.children.map((c) => (
            <ListBranch
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedPosId={selectedPosId}
              onSelectPos={onSelectPos}
              query={query}
              hideEmpty={hideEmpty}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FocusView({
  roots,
  orphanPositions,
  selectedPosId,
  onSelectPos,
  query,
  hideEmpty,
}: {
  roots: DivNode[];
  orphanPositions: PosNode[];
  selectedPosId: string | null;
  onSelectPos: (id: string | null) => void;
  query: string;
  hideEmpty: boolean;
}) {
  const visibleRoots = useMemo(() => {
    return roots.filter((r) => {
      if (hideEmpty && countStaff(r).empty) return false;
      if (query && !nodeMatches(r, query)) return false;
      return true;
    });
  }, [roots, hideEmpty, query]);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    if (!visibleRoots.length) {
      setFocusId(null);
      setPath([]);
      return;
    }
    if (!focusId || !visibleRoots.some((r) => r.id === focusId)) {
      setFocusId(visibleRoots[0].id);
      setPath([]);
    }
  }, [visibleRoots, focusId]);

  const root = visibleRoots.find((r) => r.id === focusId) || null;

  const chain = useMemo(() => {
    if (!root) return [] as DivNode[];
    const out: DivNode[] = [root];
    let cursor = root;
    for (const id of path) {
      const next = cursor.children.find((c) => c.id === id);
      if (!next) break;
      if (hideEmpty && countStaff(next).empty) break;
      if (query && !nodeMatches(next, query)) break;
      out.push(next);
      cursor = next;
    }
    return out;
  }, [root, path, hideEmpty, query]);

  if (!visibleRoots.length && !orphanPositions.length) {
    return <p className={styles.empty}>Нет данных для отображения</p>;
  }

  return (
    <div className={styles.focusWrap}>
      <div className={styles.rootPicker}>
        {visibleRoots.map((r) => {
          const st = countStaff(r);
          return (
            <button
              key={r.id}
              type="button"
              className={
                focusId === r.id ? styles.rootChipActive : styles.rootChip
              }
              onClick={() => {
                setFocusId(r.id);
                setPath([]);
              }}
            >
              <span className={styles.rootChipCode}>{r.code || '—'}</span>
              <span className={styles.rootChipName}>{r.name}</span>
              <span className={styles.rootChipMeta}>{st.positions} поз.</span>
            </button>
          );
        })}
        {orphanPositions.length ? (
          <button
            type="button"
            className={
              focusId === '__orphan__'
                ? styles.rootChipActive
                : styles.rootChip
            }
            onClick={() => {
              setFocusId('__orphan__');
              setPath([]);
            }}
          >
            <span className={styles.rootChipCode}>—</span>
            <span className={styles.rootChipName}>Без подразделения</span>
            <span className={styles.rootChipMeta}>
              {orphanPositions.length} поз.
            </span>
          </button>
        ) : null}
      </div>

      {focusId === '__orphan__' ? (
        <div className={styles.focusCard}>
          <div className={styles.focusHead}>
            <strong>Без подразделения</strong>
            <span>{orphanPositions.length} позиций</span>
          </div>
          <PosGrid
            positions={orphanPositions}
            selectedPosId={selectedPosId}
            onSelectPos={onSelectPos}
            query={query}
          />
        </div>
      ) : (
        <div className={styles.focusStack}>
          {chain.map((node, idx) => {
            const st = countStaff(node);
            const kids = node.children.filter((c) => {
              if (hideEmpty && countStaff(c).empty) return false;
              if (query && !nodeMatches(c, query)) return false;
              return true;
            });
            const selectedChild = path[idx];
            return (
              <div key={node.id} className={styles.focusBlock}>
                {idx > 0 ? <div className={styles.vline} aria-hidden /> : null}
                <div className={styles.focusCard}>
                  <div className={styles.focusHead}>
                    <div>
                      <span className={styles.focusCode}>
                        {node.code || '—'}
                      </span>
                      <strong>{node.name}</strong>
                    </div>
                    <span>
                      {st.positions} поз. · {st.people} чел. · {st.units} ед.
                    </span>
                  </div>
                  <PosGrid
                    positions={node.positions}
                    selectedPosId={selectedPosId}
                    onSelectPos={onSelectPos}
                    query={query}
                  />
                </div>
                {kids.length ? (
                  <>
                    <div className={styles.vline} aria-hidden />
                    <div className={styles.siblingBar}>
                      {kids.map((k) => {
                        const ks = countStaff(k);
                        return (
                          <button
                            key={k.id}
                            type="button"
                            className={
                              selectedChild === k.id
                                ? styles.sibActive
                                : styles.sib
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
                            <em>{ks.positions}</em>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StaffPositionsStructurePage() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TreeResponse>(
        '/api/catalog/staff-positions/tree',
      );
      setTree(data);
      // Default: expand only roots that have content (not every deep node)
      const ids = new Set<string>();
      for (const r of data.roots) {
        if (!countStaff(r).empty) ids.add(r.id);
      }
      setExpanded(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ac = new AbortController();
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!exportRef.current?.contains(e.target as Node))
          setExportOpen(false);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = searchDraft.trim().toLowerCase();
      setQuery(q);
      if (!tree || !q) return;
      const ids = new Set<string>();
      for (const r of tree.roots) collectExpandIds(r, q, ids);
      setExpanded(ids);
      setViewMode('list');
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchDraft, tree]);

  const totals = useMemo(() => {
    if (!tree) return { divisions: 0, positions: 0, people: 0, units: 0 };
    let divisions = 0;
    let positions = tree.orphanPositions.length;
    let people = tree.orphanPositions.reduce(
      (s, p) => s + (p.employeeCount || 0),
      0,
    );
    let units = tree.orphanPositions.reduce(
      (s, p) => s + (p.headcount || 0),
      0,
    );
    const walk = (n: DivNode) => {
      divisions += 1;
      positions += n.positions.length;
      people += n.positions.reduce((s, p) => s + (p.employeeCount || 0), 0);
      units += n.positions.reduce((s, p) => s + (p.headcount || 0), 0);
      n.children.forEach(walk);
    };
    tree.roots.forEach(walk);
    return { divisions, positions, people, units };
  }, [tree]);

  const selectedPos = useMemo(() => {
    if (!tree || !selectedPosId) return null;
    const find = (nodes: DivNode[]): PosNode | null => {
      for (const n of nodes) {
        const hit = n.positions.find((p) => p.id === selectedPosId);
        if (hit) return hit;
        const nested = find(n.children);
        if (nested) return nested;
      }
      return null;
    };
    return (
      find(tree.roots) ||
      tree.orphanPositions.find((p) => p.id === selectedPosId) ||
      null
    );
  }, [tree, selectedPosId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    if (!tree) return;
    const ids = new Set<string>();
    const walk = (n: DivNode) => {
      if (!(hideEmpty && countStaff(n).empty)) ids.add(n.id);
      n.children.forEach(walk);
    };
    tree.roots.forEach(walk);
    setExpanded(ids);
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function expandRootsOnly() {
    if (!tree) return;
    const ids = new Set<string>();
    for (const r of tree.roots) {
      if (!(hideEmpty && countStaff(r).empty)) ids.add(r.id);
    }
    setExpanded(ids);
  }

  async function exportXlsx() {
    setExportBusy(true);
    setExportOpen(false);
    try {
      await downloadXlsxViaApi(
        '/api/catalog/analytics/positions-structure/export.xlsx',
        'positions-structure.xlsx',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  const orphanVisible =
    tree &&
    tree.orphanPositions.length > 0 &&
    (!hideEmpty || tree.orphanPositions.length > 0) &&
    (!query ||
      tree.orphanPositions.some((p) =>
        `${p.title} ${p.code}`.toLowerCase().includes(query),
      ));

  return (
    <div className={styles.wrap}>
      <PageSubnav
        groupKey="staff-positions-structure"
        titleOverride="Организационная структура по позициям"
      />

      <div className={shared.pageHeader}>
        <div
          className={`${shared.pageIconBadge} ${shared.pageIconBadgeTransfer}`}
        >
          <i className="fas fa-project-diagram" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>
            Организационная структура по позициям
          </h1>
          <p className={shared.pageSubtitle}>
            Иерархия подразделений и штатных позиций — удобный просмотр больших
            деревьев
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск: подразделение, должность, код…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              aria-label="Поиск по структуре"
            />
            {searchDraft ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchDraft('')}
                aria-label="Очистить"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftTools}>
          <div className={styles.modeSwitch} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              className={
                viewMode === 'list' ? styles.modeActive : styles.modeBtn
              }
              onClick={() => setViewMode('list')}
            >
              <i className="fas fa-list" aria-hidden />
              Список
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'focus'}
              className={
                viewMode === 'focus' ? styles.modeActive : styles.modeBtn
              }
              onClick={() => setViewMode('focus')}
            >
              <i className="fas fa-sitemap" aria-hidden />
              Ветка
            </button>
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Скрыть пустые
          </label>

          <span className={styles.totals}>
            {totals.divisions} подр. · {totals.positions} поз. ·{' '}
            {totals.people} сотр. · {totals.units} ед.
          </span>
        </div>

        <div className={styles.tools}>
          {viewMode === 'list' ? (
            <>
              <button
                type="button"
                className={styles.toolBtn}
                onClick={expandRootsOnly}
                title="Только корни"
              >
                Корни
              </button>
              <button
                type="button"
                className={styles.toolBtn}
                onClick={expandAll}
              >
                <i className="fas fa-expand" aria-hidden />
                Развернуть
              </button>
              <button
                type="button"
                className={styles.toolBtn}
                onClick={collapseAll}
              >
                <i className="fas fa-compress" aria-hidden />
                Свернуть
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
          <div className={styles.exportWrap} ref={exportRef}>
            <button
              type="button"
              className={styles.exportBtn}
              disabled={exportBusy}
              onClick={() => setExportOpen((v) => !v)}
            >
              <i className="fas fa-download" aria-hidden />
              {exportBusy ? '…' : 'Экспорт'}
            </button>
            {exportOpen ? (
              <div className={styles.exportMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportXlsx()}
                >
                  Excel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.canvas}>
        {loading && !tree ? (
          <p className={styles.empty}>Загрузка…</p>
        ) : !tree ||
          (!tree.roots.length && !tree.orphanPositions.length) ? (
          <p className={styles.empty}>
            Нет данных — создайте подразделения и позиции
          </p>
        ) : viewMode === 'focus' ? (
          <FocusView
            roots={tree.roots}
            orphanPositions={tree.orphanPositions}
            selectedPosId={selectedPosId}
            onSelectPos={setSelectedPosId}
            query={query}
            hideEmpty={hideEmpty}
          />
        ) : (
          <div className={styles.listTree}>
            {tree.roots.map((r) => (
              <ListBranch
                key={r.id}
                node={r}
                depth={0}
                expanded={expanded}
                onToggle={toggleExpand}
                selectedPosId={selectedPosId}
                onSelectPos={setSelectedPosId}
                query={query}
                hideEmpty={hideEmpty}
              />
            ))}
            {orphanVisible ? (
              <div className={styles.listBranch}>
                <div className={`${styles.listRow} ${styles.rowOrphan}`}>
                  <span className={styles.expandBtn}>·</span>
                  <div className={styles.listMain}>
                    <span className={styles.listCode}>—</span>
                    <span className={styles.listName}>
                      Без подразделения
                    </span>
                  </div>
                  <div className={styles.listStats}>
                    <span>
                      <strong>{tree.orphanPositions.length}</strong> поз.
                    </span>
                  </div>
                </div>
                <div className={styles.listPosWrap}>
                  <PosGrid
                    positions={tree.orphanPositions}
                    selectedPosId={selectedPosId}
                    onSelectPos={setSelectedPosId}
                    query={query}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {selectedPos ? (
        <div className={styles.actionBar}>
          <div className={styles.actionInfo}>
            <strong>{selectedPos.title}</strong>
            <span>
              {selectedPos.code} · занято {selectedPos.employeeCount} /{' '}
              {selectedPos.headcount} ед.
            </span>
          </div>
          <div className={styles.actionBtns}>
            <Link
              href={`/catalog/staff-positions/${selectedPos.id}`}
              className={styles.actionLink}
            >
              <i className="fas fa-eye" aria-hidden />
              Просмотр
            </Link>
            <Link
              href={`/catalog/staff-positions/${selectedPos.id}/edit`}
              className={styles.actionPrimary}
            >
              <i className="fas fa-pen" aria-hidden />
              Изменить
            </Link>
            <button
              type="button"
              className={styles.actionGhost}
              onClick={() => setSelectedPosId(null)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
