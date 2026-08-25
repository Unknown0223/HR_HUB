import ExcelJS from 'exceljs';

export type XlsxMatrix = {
  sheetName: string;
  /** 0-based matrix of cell strings (including header row if present) */
  rows: string[][];
};

function cellToString(value: ExcelJS.CellValue): string {
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
      return cellToString((value as { result: ExcelJS.CellValue }).result);
    }
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim();
    }
  }
  return String(value).trim();
}

/** Parse first worksheet of an .xlsx/.xls file into a string matrix. */
export async function parseXlsxFile(
  file: File,
  preferredSheet?: string | string[],
): Promise<XlsxMatrix> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);

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

  const rows: string[][] = [];
  const colCount = Math.max(ws.columnCount || 0, 9);
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
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
