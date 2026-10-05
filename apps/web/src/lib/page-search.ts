import type { NavSection } from './nav-registry';
import type { ReportDefinition } from './reports-registry';

export type PageHit = {
  key: string;
  label: string;
  /** Where the page lives: «Section · Group». */
  path: string;
  href: string;
  faIcon: string;
};

type Entry = PageHit & { names: string[]; hay: string };

/** Case, «ё» and Uzbek apostrophe variants must not decide a match. */
export function foldSearchText(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Russian page names typed in Latin letters («otmetki», «grafik»). */
function latin(folded: string) {
  return folded.replace(/[а-я]/g, (c) => CYR_TO_LAT[c] ?? c);
}

function haystack(parts: string[]) {
  const folded = foldSearchText(parts.join(' '));
  const lat = latin(folded);
  return lat === folded ? folded : `${folded} ${lat}`;
}

/**
 * Index of every page the user can open: sidebar items and individual reports, searchable
 * by the original (Russian) and the translated label. `sections` and `reports` must already
 * be filtered by access.
 */
export function buildPageIndex(
  sections: NavSection[],
  reports: ReportDefinition[],
  t: (s: string) => string,
): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const sec of sections) {
    for (const g of sec.groups) {
      const path = g.title === sec.label ? t(sec.label) : `${t(sec.label)} · ${t(g.title)}`;
      for (const item of g.items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        const label = t(item.label);
        out.push({
          key: `nav:${item.href}`,
          label,
          path,
          href: item.href,
          faIcon: item.faIcon,
          names: [foldSearchText(label), foldSearchText(item.label), latin(foldSearchText(item.label))],
          hay: haystack([label, item.label, t(sec.label), sec.label, t(g.title), g.title]),
        });
      }
    }
  }
  const reportsPath = t('Отчёты');
  for (const r of reports) {
    if (seen.has(r.href)) continue;
    seen.add(r.href);
    const label = t(r.title);
    out.push({
      key: `report:${r.id}`,
      label,
      path: reportsPath,
      href: r.href,
      faIcon: r.faIcon,
      names: [foldSearchText(label), foldSearchText(r.title), latin(foldSearchText(r.title))],
      hay: haystack([label, r.title, t(r.description), r.description, ...(r.keywords ?? []), reportsPath, 'Отчёты']),
    });
  }
  return out;
}

function wordStart(w: string) {
  return new RegExp(`(^|[\\s(«"'-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

/** Every word must match; hits in the page name rank above hits in its section or description. */
export function searchPages(index: Entry[], query: string, limit = 12): PageHit[] {
  const q = foldSearchText(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored: { hit: Entry; score: number }[] = [];
  for (const e of index) {
    if (!words.every((w) => e.hay.includes(w))) continue;
    let score = 0;
    for (const name of e.names) {
      let s = 0;
      if (name === q) s = 150;
      else if (name.startsWith(q)) s = 100;
      else if (name.includes(q)) s = 60;
      for (const w of words) {
        if (name.includes(w)) s += 10;
        if (wordStart(w).test(name)) s += 5;
      }
      score = Math.max(score, s);
    }
    if (e.key.startsWith('nav:')) score += 1;
    scored.push({ hit: e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.label.length - b.hit.label.length);
  return scored.slice(0, limit).map(({ hit }) => ({
    key: hit.key,
    label: hit.label,
    path: hit.path,
    href: hit.href,
    faIcon: hit.faIcon,
  }));
}
