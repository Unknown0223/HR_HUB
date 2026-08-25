import { BadRequestException } from '@nestjs/common';

/**
 * Query-string dates arrive untyped. `new Date('nonsense')` yields an Invalid Date
 * which Prisma rejects at serialization time with a 500 — so parse defensively and
 * surface a 400 instead.
 */
export function parseDateParam(
  value: string | undefined | null,
  fallback: Date,
  field = 'date',
): Date {
  if (value == null || value === '') return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `Invalid ${field} value "${value}". Expected an ISO date (YYYY-MM-DD).`,
    );
  }
  return parsed;
}

export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Validate a year/month pair. Missing values fall back to the current month so
 * that deep-linking a report without params renders instead of crashing.
 */
export function parseYearMonth(
  year: number | string | undefined | null,
  month: number | string | undefined | null,
): { year: number; month: number } {
  const now = new Date();
  const y =
    year == null || year === '' || Number.isNaN(Number(year))
      ? now.getFullYear()
      : Number(year);
  const m =
    month == null || month === '' || Number.isNaN(Number(month))
      ? now.getMonth() + 1
      : Number(month);
  if (!Number.isInteger(y) || y < 1970 || y > 2999) {
    throw new BadRequestException(`Invalid year "${year}". Expected 1970–2999.`);
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new BadRequestException(`Invalid month "${month}". Expected 1–12.`);
  }
  return { year: y, month: m };
}
