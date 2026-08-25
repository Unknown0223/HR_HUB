export type PageMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PageResult<T> = {
  items: T[];
} & PageMeta;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Parse page/limit query (1-based page). */
export function parsePagination(
  pageRaw?: string | number,
  limitRaw?: string | number,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): { page: number; limit: number; skip: number } {
  const defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = opts.maxLimit ?? MAX_LIMIT;
  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(limitRaw) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PageResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
  };
}
