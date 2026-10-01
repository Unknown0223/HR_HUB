'use client';

import { seasonFromDate, seasonPhoto, sectionFocus } from '@/lib/season';
import styles from './seasonal-backdrop.module.css';

const BITS = [0, 1, 2, 3, 4, 5];

export function SeasonalBackdrop({
  mode,
  section,
}: {
  mode: 'login' | 'app';
  section?: string | null;
}) {
  const season = seasonFromDate(new Date());
  const position = mode === 'login' ? 'left center' : sectionFocus(section);

  return (
    <div
      className={`${styles.root} ${styles[mode]} ${styles[season]}`}
      data-season={season}
      data-no-print
      aria-hidden
    >
      <div
        className={styles.photo}
        style={{
          backgroundImage: `url(${seasonPhoto(season)})`,
          backgroundPosition: position,
        }}
      />
      <div className={styles.orbs} />
      <div className={styles.bits}>
        {BITS.map((i) => (
          <span key={i} className={styles.bit} style={{ ['--i' as string]: String(i) }} />
        ))}
      </div>
      <div className={styles.veil} />
    </div>
  );
}
