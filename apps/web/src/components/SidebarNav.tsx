'use client';

import Link from 'next/link';
import type { NavSection, NavSectionId } from '@/lib/nav-registry';
import sb from './sidebar.module.css';

type Props = {
  sections: NavSection[];
  activeSectionId: NavSectionId | null;
  activeItemId: string | null;
  isOpen: (id: NavSectionId) => boolean;
  onToggle: (id: NavSectionId) => void;
  /** Icon-only rail: labels and item lists are hidden. */
  compact?: boolean;
  onNavigate?: () => void;
  /** Keeps aria-controls ids unique when the nav is rendered twice. */
  idPrefix: string;
};

export function SidebarNav({
  sections,
  activeSectionId,
  activeItemId,
  isOpen,
  onToggle,
  compact = false,
  onNavigate,
  idPrefix,
}: Props) {
  return (
    <>
      {sections.map((sec) => {
        const items = sec.groups.flatMap((g) => g.items);
        const sectionActive = activeSectionId === sec.id;
        const headCls = sectionActive ? sb.sectionActive : sb.sectionBtn;

        if (items.length === 1) {
          const item = items[0];
          const active = activeItemId === item.id;
          return (
            <div key={sec.id} className={sb.section}>
              <Link
                href={item.href}
                className={headCls}
                aria-current={active ? 'page' : undefined}
                title={compact ? sec.label : undefined}
                onClick={onNavigate}
              >
                <i className={`fas ${sec.faIcon} ${sb.sectionIcon}`} aria-hidden />
                <span className={sb.sectionLabel}>{sec.label}</span>
              </Link>
            </div>
          );
        }

        const open = !compact && isOpen(sec.id);
        const panelId = `${idPrefix}-${sec.id}`;
        const showGroupTitles = sec.groups.length > 1;
        return (
          <div key={sec.id} className={sb.section}>
            <button
              type="button"
              className={headCls}
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              title={compact ? sec.label : undefined}
              onClick={() => onToggle(sec.id)}
            >
              <i className={`fas ${sec.faIcon} ${sb.sectionIcon}`} aria-hidden />
              <span className={sb.sectionLabel}>{sec.label}</span>
              <i
                className={`fas fa-chevron-right ${open ? sb.chevronOpen : sb.chevron}`}
                aria-hidden
              />
            </button>
            {open ? (
              <div id={panelId} className={sb.items}>
                {sec.groups.map((g) => (
                  <div key={g.id} role="group" aria-label={g.title}>
                    {showGroupTitles && g.title !== sec.label ? (
                      <div className={sb.groupTitle}>{g.title}</div>
                    ) : null}
                    <ul className={sb.itemList}>
                      {g.items.map((item) => {
                        const active = activeItemId === item.id;
                        return (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              className={active ? sb.itemActive : sb.itemLink}
                              aria-current={active ? 'page' : undefined}
                              onClick={onNavigate}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
