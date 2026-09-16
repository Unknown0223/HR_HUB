import { Prisma } from '@prisma/client';

/** Split «Фамилия Имя» into tokens so each part can match any name field. */
export function searchTokens(q: string): string[] {
  return q
    .trim()
    .split(/\s+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Match full FIO queries like «ABDURADIROV ILHAM» against separate
 * lastName / firstName / middleName columns (AND of per-token OR).
 */
export function employeeNameSearchWhere(
  q: string,
): Prisma.EmployeeWhereInput | undefined {
  const tokens = searchTokens(q);
  if (!tokens.length) return undefined;
  return {
    AND: tokens.map((token) => ({
      OR: [
        { lastName: { contains: token, mode: 'insensitive' } },
        { firstName: { contains: token, mode: 'insensitive' } },
        { middleName: { contains: token, mode: 'insensitive' } },
        { tabNumber: { contains: token, mode: 'insensitive' } },
        { email: { contains: token, mode: 'insensitive' } },
        { phone: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

export function personNameSearchWhere(
  q: string,
): Prisma.PersonWhereInput | undefined {
  const tokens = searchTokens(q);
  if (!tokens.length) return undefined;
  return {
    AND: tokens.map((token) => ({
      OR: [
        { lastName: { contains: token, mode: 'insensitive' } },
        { firstName: { contains: token, mode: 'insensitive' } },
        { middleName: { contains: token, mode: 'insensitive' } },
        { pinfl: { contains: token, mode: 'insensitive' } },
        { passport: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}
