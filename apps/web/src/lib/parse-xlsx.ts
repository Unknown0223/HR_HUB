import type { CellValue } from 'exceljs';

type ExcelJSNS = typeof import('exceljs');

/** Keep in sync with apps/api/src/common/excel-import.ts */
export const EXCEL_IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXCEL_IMPORT_MAX_SHEETS = 8;
const EXCEL_IMPORT_MAX_ROWS = 10_000;
const EXCEL_IMPORT_MAX_COLS = 64;

async function loadExcelJS(): Promise<ExcelJSNS> {
  const mod = await import('exceljs');
  const ns = (mod as ExcelJSNS & { default?: ExcelJSNS }).default ?? (mod as ExcelJSNS);
  return ns;
}

export type XlsxMatrix = {
  sheetName: string;
  /** 0-based matrix of cell strings (including header row if present) */
  rows: string[][];
};

function cellToString(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${value.getFullYear()}`;
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: string }).text === 'string') {
      return (value as { text: string }).text.trim();
    }
    if ('result' in value) {
      return cellToString((value as { result: CellValue }).result);
    }
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim();
    }
  }
  return String(value).trim();
}

export function assertExcelImportFile(file: File): void {
  const name = (file.name || '').trim().toLowerCase();
  if (!name.endsWith('.xlsx') || name.includes('..') || name.endsWith('.xlsm')) {
    throw new Error('Разрешён только файл Excel (.xlsx)');
  }
  if (file.size > EXCEL_IMPORT_MAX_BYTES) {
    throw new Error('Файл слишком большой (макс. 5 МБ)');
  }
}

function hasXlsxZipMagic(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const b = new Uint8Array(buf, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** Parse first worksheet of an .xlsx file into a string matrix. */
export async function parseXlsxFile(
  file: File,
  preferredSheet?: string | string[],
): Promise<XlsxMatrix> {
  assertExcelImportFile(file);
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  if (!hasXlsxZipMagic(buf)) {
    throw new Error('Файл не является корректным Excel (.xlsx)');
  }
  await wb.xlsx.load(buf);
  if (wb.worksheets.length > EXCEL_IMPORT_MAX_SHEETS) {
    throw new Error('Слишком много листов в книге');
  }

  const preferred = (
    Array.isArray(preferredSheet)
      ? preferredSheet
      : preferredSheet
        ? [preferredSheet]
        : []
  ).map((s) => s.toLowerCase());

  let ws = wb.worksheets[0];
  if (preferred.length) {
    const found = wb.worksheets.find((s) =>
      preferred.includes(s.name.toLowerCase()),
    );
    if (found) ws = found;
  }
  if (!ws) return { sheetName: '', rows: [] };
  if ((ws.columnCount || 0) > EXCEL_IMPORT_MAX_COLS) {
    throw new Error('Слишком много столбцов в файле');
  }
  if ((ws.rowCount || 0) > EXCEL_IMPORT_MAX_ROWS) {
    throw new Error('Слишком много строк в файле');
  }

  const rows: string[][] = [];
  const colCount = Math.min(Math.max(ws.columnCount || 0, 9), EXCEL_IMPORT_MAX_COLS);
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > EXCEL_IMPORT_MAX_ROWS) return;
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    // Skip trailing empty rows after first content
    if (rowNumber > 1 && cells.every((x) => !x)) return;
    rows.push(cells);
  });

  return { sheetName: ws.name, rows };
}

/** Map matrix rows using 1-based column numbers and 1-based start row. */
export function mapMatrixToObjects(
  matrix: string[][],
  columnMap: Record<string, number>,
  startRow: number,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const from = Math.max(1, startRow) - 1;
  for (let i = from; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    const obj: Record<string, string> = {};
    let any = false;
    for (const [key, colNum] of Object.entries(columnMap)) {
      const idx = Math.max(1, colNum) - 1;
      const val = (line[idx] ?? '').trim();
      obj[key] = val;
      if (val) any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}
