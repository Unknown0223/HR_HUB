/** Local calendar season. Month is 0-based: Mar–May spring, Jun–Aug summer, Sep–Nov autumn, Dec–Feb winter. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonFromDate(date: Date): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** Worklyn mark colours per season (same as scripts/brand/build-brand-icons.js). */
export const SEASON_MARK: Record<Season, { from: string; to: string; accent: string }> = {
  spring: { from: '#15803D', to: '#4ADE80', accent: '#F472B6' },
  summer: { from: '#0F766E', to: '#22C55E', accent: '#FACC15' },
  autumn: { from: '#9A3412', to: '#F59E0B', accent: '#FDE047' },
  winter: { from: '#1E3A8A', to: '#38BDF8', accent: '#E0F2FE' },
};

export function seasonPhoto(season: Season) {
  return `/seasons/${season}.jpg`;
}

/** Which part of the illustration sits behind each app section. */
export function sectionFocus(section?: string | null) {
  switch (section) {
    case 'hr':
      return '18% top';
    case 'attendance':
      return '0% top';
    case 'payroll':
      return '28% top';
    case 'reports':
      return '36% top';
    case 'settings':
      return '8% top';
    case 'home':
    default:
      return 'left top';
  }
}
