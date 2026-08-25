import ExcelJS from 'exceljs';
import type { Response } from 'express';

export type ExcelSheetInput = {
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

/** Build xlsx Buffer from flat row objects keyed by column names. */
export async function buildExcelBuffer(input: ExcelSheetInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  const ws = wb.addWorksheet(sanitizeSheetName(input.sheetName));
  const header = ws.addRow(input.columns);
  header.font = { bold: true, color: { argb: 'FF3F4254' } };
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF7F8FA' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D4DC' } },
      left: { style: 'thin', color: { argb: 'FFD0D4DC' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D4DC' } },
      right: { style: 'thin', color: { argb: 'FFD0D4DC' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  for (const [idx, row] of input.rows.entries()) {
    const excelRow = ws.addRow(input.columns.map((col) => formatCell(row[col])));
    excelRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D4DC' } },
        left: { style: 'thin', color: { argb: 'FFD0D4DC' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D4DC' } },
        right: { style: 'thin', color: { argb: 'FFD0D4DC' } },
      };
      if (idx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });
  }
  input.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = Math.min(36, Math.max(12, col.length + 4));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function sendExcelAttachment(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export function buildCsvBuffer(columns: string[], rows: Record<string, unknown>[]): Buffer {
  const escape = (v: unknown) => {
    const s = formatCell(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    columns.map(escape).join(','),
    ...rows.map((row) => columns.map((col) => escape(row[col])).join(',')),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

export function sendCsvAttachment(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/** Flatten a Prisma row for export (nested relations → readable strings). */
export function flattenExportRow(
  row: Record<string, unknown>,
  extraKeys: string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [...new Set([...Object.keys(row), ...extraKeys])];
  for (const key of keys) {
    if (key === 'tenant' || key === 'tenantId') continue;
    out[key] = flattenValue(row[key]);
  }
  return out;
}

function flattenValue(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    return Number(v);
  }
  if (Array.isArray(v)) {
    return v.map((item) => flattenValue(item)).join('; ');
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('tabNumber' in o && 'lastName' in o && 'firstName' in o) {
      return `${o.tabNumber} ${o.lastName} ${o.firstName}`;
    }
    if ('name' in o && typeof o.name === 'string') return o.name;
    if ('code' in o && 'name' in o) return `${o.code} ${o.name}`;
    if ('code' in o && typeof o.code === 'string') return o.code;
    return JSON.stringify(v);
  }
  return v;
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1';
}
