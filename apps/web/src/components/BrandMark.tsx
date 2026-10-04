import { useId } from 'react';
import { type Season, SEASON_MARK, seasonFromDate } from '@/lib/season';

/** Worklyn mark (same drawing as assets/brand/worklyn-mark.svg), coloured for the current season. */
export function BrandMark({
  size = 32,
  className,
  season,
}: {
  size?: number;
  className?: string;
  season?: Season;
}) {
  const gid = `wlg${useId().replace(/:/g, '')}`;
  const current = season ?? seasonFromDate(new Date());
  const c = SEASON_MARK[current];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      data-season={current}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
      <path d="M0 18A18 18 0 0 1 18 0H64V14C34 14 14 34 14 64H0Z" fill="#fff" opacity="0.1" />
      <path
        d="M13 20.5 24.5 45 32 31 39.5 45 51 20.5"
        stroke="#fff"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="51" cy="20.5" r="5.2" fill={c.accent} />
    </svg>
  );
}
