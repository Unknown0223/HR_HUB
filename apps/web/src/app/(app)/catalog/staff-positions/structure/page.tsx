'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadXlsxViaApi } from '@/lib/excel';
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

function countStaff(node: DivNode): { positions: number; people: number; units: number } {
  let positions = node.positions.length;
  let people = node.positions.reduce((s, p) => s + (p.employeeCount || 0), 0);
  let units = node.positions.reduce((s, p) => s + (p.headcount || 0), 0);
  for (const c of node.children) {
    const nested = countStaff(c);
    positions += nested.positions;
    people += nested.people;
    units += nested.units;
  }
  return { positions, people, units };
}

function PosBox({
  p,
  selected,
  onSelect,
}: {
  p: PosNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const filled = p.employeeCount || 0;
  const units = p.headcount || 0;
  const show = filled || units || 0;

  return (
    <button
      type="button"
      className={selected ? styles.posBoxActive : styles.posBox}
      onClick={onSelect}
      title={`${p.title} · код ${p.code}`}
    >
      <span className={styles.posCount}>{show}</span>
      <span className={styles.posBody}>
        <span className={styles.posTitle}>{p.title}</span>
        <span className={styles.posMeta}>
          {filled}/{units || '—'} ед. · {p.code}
        </span>
      </span>
    </button>
  );
}

function DivBranch({
  node,
  depth,
  selectedPosId,
  onSelectPos,
  collapsed,
  onToggle,
}: {
  node: DivNode;
  depth: number;
  selectedPosId: string | null;
  onSelectPos: (id: string | null) => void;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const stats = countStaff(node);
  const hasKids = node.children.length > 0 || node.positions.length > 0;
  const lvlClass =
    depth === 0
      ? styles.divLvl0
      : depth === 1
        ? styles.divLvl1
        : depth === 2
          ? styles.divLvl2
          : styles.divLvl3;

  return (
    <li className={styles.treeItem}>
      <div className={styles.nodeStack}>
        <div className={`${styles.divCard} ${lvlClass}`}>
          {hasKids ? (
            <button
              type="button"
              className={styles.collapseBtn}
              aria-label={isCollapsed ? 'Развернуть' : 'Свернуть'}
              onClick={() => onToggle(node.id)}
            >
              {isCollapsed ? '+' : '−'}
            </button>
          ) : (
            <span className={styles.collapseSpacer} />
          )}
          <div className={styles.divMain}>
            <div className={styles.divCode}>{node.code || '—'}</div>
            <div className={styles.divName}>{node.name}</div>
          </div>
          <div className={styles.divStats}>
            <span title="Позиции">{stats.positions} поз.</span>
            <span title="Сотрудники">{stats.people} чел.</span>
          </div>
        </div>

        {!isCollapsed && hasKids ? (
          <>
            <div className={styles.stem} aria-hidden />
            <ul className={styles.treeRow}>
              {node.positions.map((p) => (
                <li key={p.id} className={styles.leafItem}>
                  <PosBox
                    p={p}
                    selected={selectedPosId === p.id}
                    onSelect={() =>
                      onSelectPos(selectedPosId === p.id ? null : p.id)
                    }
                  />
                </li>
              ))}
              {node.children.map((c) => (
                <DivBranch
                  key={c.id}
                  node={c}
                  depth={depth + 1}
                  selectedPosId={selectedPosId}
                  onSelectPos={onSelectPos}
                  collapsed={collapsed}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </>
        ) : null}

        {!isCollapsed && !hasKids ? (
          <div className={styles.emptyBranch}>нет позиций</div>
        ) : null}
      </div>
    </li>
  );
}

export default function StaffPositionsStructurePage() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<TreeResponse>('/api/catalog/staff-positions/tree');
        setTree(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, []);

  const totals = useMemo(() => {
    if (!tree) return { divisions: 0, positions: 0, people: 0 };
    let divisions = 0;
    let positions = tree.orphanPositions.length;
    let people = tree.orphanPositions.reduce((s, p) => s + (p.employeeCount || 0), 0);
    const walk = (n: DivNode) => {
      divisions += 1;
      positions += n.positions.length;
      people += n.positions.reduce((s, p) => s + (p.employeeCount || 0), 0);
      n.children.forEach(walk);
    };
    tree.roots.forEach(walk);
    return { divisions, positions, people };
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

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  function collapseDeep() {
    if (!tree) return;
    const ids = new Set<string>();
    const walk = (n: DivNode, depth: number) => {
      if (depth >= 1) ids.add(n.id);
      n.children.forEach((c) => walk(c, depth + 1));
    };
    tree.roots.forEach((r) => walk(r, 0));
    setCollapsed(ids);
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

  return (
    <div className={styles.wrap}>
      <PageSubnav
        groupKey="staff-positions-structure"
        titleOverride="Организационная структура по позициям"
      />

      <div className={styles.toolbar}>
        <div className={styles.legend}>
          <span className={styles.legDiv}>
            <i /> Подразделение
          </span>
          <span className={styles.legPos}>
            <i /> Позиция (шт.)
          </span>
          <span className={styles.totals}>
            {totals.divisions} подр. · {totals.positions} поз. · {totals.people}{' '}
            сотр.
          </span>
        </div>

        <div className={styles.tools}>
          <div className={styles.zoomGroup}>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(1))))}
            >
              −
            </button>
            <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
            >
              +
            </button>
          </div>
          <button type="button" className={styles.toolBtn} onClick={expandAll}>
            Развернуть
          </button>
          <button type="button" className={styles.toolBtn} onClick={collapseDeep}>
            Свернуть
          </button>
          <div className={styles.exportWrap} ref={exportRef}>
            <button
              type="button"
              className={styles.exportBtn}
              disabled={exportBusy}
              onClick={() => setExportOpen((v) => !v)}
            >
              {exportBusy ? '…' : 'Экспорт ▾'}
            </button>
            {exportOpen ? (
              <div className={styles.exportMenu} role="menu">
                <button type="button" role="menuitem" onClick={() => void exportXlsx()}>
                  Excel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.canvas}>
        <div className={styles.canvasGrid} aria-hidden />
        {!tree ? (
          <p className={styles.empty}>Загрузка…</p>
        ) : !tree.roots.length && !tree.orphanPositions.length ? (
          <p className={styles.empty}>
            Нет данных — создайте подразделения и позиции
          </p>
        ) : (
          <div
            className={styles.forest}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            <ul className={styles.treeRoot}>
              {tree.roots.map((r) => (
                <DivBranch
                  key={r.id}
                  node={r}
                  depth={0}
                  selectedPosId={selectedPosId}
                  onSelectPos={setSelectedPosId}
                  collapsed={collapsed}
                  onToggle={toggleCollapse}
                />
              ))}
              {tree.orphanPositions.length ? (
                <li className={styles.treeItem}>
                  <div className={styles.nodeStack}>
                    <div className={`${styles.divCard} ${styles.divOrphan}`}>
                      <span className={styles.collapseSpacer} />
                      <div className={styles.divMain}>
                        <div className={styles.divCode}>—</div>
                        <div className={styles.divName}>Без подразделения</div>
                      </div>
                      <div className={styles.divStats}>
                        <span>{tree.orphanPositions.length} поз.</span>
                      </div>
                    </div>
                    <div className={styles.stem} aria-hidden />
                    <ul className={styles.treeRow}>
                      {tree.orphanPositions.map((p) => (
                        <li key={p.id} className={styles.leafItem}>
                          <PosBox
                            p={p}
                            selected={selectedPosId === p.id}
                            onSelect={() =>
                              setSelectedPosId(
                                selectedPosId === p.id ? null : p.id,
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ) : null}
            </ul>
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
              Просмотр
            </Link>
            <Link
              href={`/catalog/staff-positions/${selectedPos.id}/edit`}
              className={styles.actionLink}
            >
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
