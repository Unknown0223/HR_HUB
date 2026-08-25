/** Flatten nested objects for table/CSV display */
export function flattenRow(row: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) {
      out[key] = '';
    } else if (Array.isArray(v)) {
      out[key] = String(v.length);
    } else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.lastName != null || o.firstName != null) {
        out[key] = `${o.lastName ?? ''} ${o.firstName ?? ''}`.trim();
      } else if (o.name != null) {
        out[key] = String(o.name);
      } else if (o.title != null) {
        out[key] = String(o.title);
      } else if (o.code != null) {
        out[key] = String(o.code);
      } else {
        Object.assign(out, flattenRow(o, key));
      }
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export function extractRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['rows', 'items', 'divisions', 'orders', 'settlements', 'overrides', 'positionSchedules', 'shifts', 'documents', 'audit']) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
    // single summary object → one row
    const skip = new Set(['title', 'legend', 'year', 'month', 'from', 'to', 'daysInMonth']);
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k)) continue;
      if (v != null && typeof v !== 'object') flat[k] = v;
      else if (k === 'counts' && v && typeof v === 'object') {
        Object.assign(flat, v as object);
      }
    }
    if (Object.keys(flat).length) return [flat];
  }
  return [];
}

/** Parse CSV text into row objects (handles quoted fields). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Build CSV string from row objects (no download). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const flat = rows.map((r) => flattenRow(r));
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(','),
    ...flat.map((r) => headers.map((h) => esc(r[h] ?? '')).join(',')),
  ];
  return '\uFEFF' + lines.join('\n');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const flat = rows.map((r) => flattenRow(r));
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(','),
    ...flat.map((r) => headers.map((h) => esc(r[h] ?? '')).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
