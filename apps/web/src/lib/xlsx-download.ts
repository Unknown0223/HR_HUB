import ExcelJS from 'exceljs';

/** Verifix-like table palette (ARGB without #). */
export const XLSX_COLORS = {
  headerBg: 'FFF7F8FA',
  headerFg: 'FF3F4254',
  border: 'FFD0D4DC',
  factBg: 'FFFFF2CC',
  weekendBg: 'FFE7F3FF',
  offDay: 'FFFFC000',
  noShowBg: 'FFFCE4EC',
  noShowFg: 'FFC62828',
  dateFg: 'FF3699FF',
  white: 'FFFFFFFF',
  zebra: 'FFF9FAFB',
  titleFg: 'FF181C32',
  accent: 'FF009EF7',
} as const;

export type XlsxCellStyle = {
  fill?: string;
  fontColor?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
};

export type XlsxCell = string | number | null | undefined | { v: string | number; s?: XlsxCellStyle };

export type XlsxTableExport = {
  filename: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  /** Single header row */
  columns: string[];
  rows: XlsxCell[][];
  /** Optional per-row background (overrides cell fill when set) */
  rowFills?: (string | undefined)[];
  colWidths?: number[];
  /** Lines before the table (empty string = blank row). Written to column A. */
  preamble?: string[];
  /** Optional header row above `columns` (weekdays over dates). */
  topHeader?: string[];
};

function cellValue(c: XlsxCell): string | number {
  if (c == null) return '';
  if (typeof c === 'object' && 'v' in c) return c.v ?? '';
  return c;
}

function cellStyle(c: XlsxCell): XlsxCellStyle | undefined {
  if (c != null && typeof c === 'object' && 's' in c) return c.s;
  return undefined;
}

function applyFill(cell: ExcelJS.Cell, argb?: string) {
  if (!argb) return;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

function applyBorder(cell: ExcelJS.Cell) {
  const edge: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: XLSX_COLORS.border },
  };
  cell.border = { top: edge, left: edge, bottom: edge, right: edge };
}

/** Build and download a styled .xlsx that mirrors web table look. */
export async function downloadStyledXlsx(input: XlsxTableExport): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  wb.created = new Date();
  const ws = wb.addWorksheet(
    (input.sheetName || 'Отчет').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1',
  );

  const colCount = Math.max(1, input.columns.length);
  let r = 1;

  if (input.preamble?.length) {
    for (const line of input.preamble) {
      if (line) {
        ws.getCell(r, 1).value = line;
        ws.getCell(r, 1).font = { size: 10, color: { argb: XLSX_COLORS.headerFg } };
      }
      r += 1;
    }
  }

  if (input.title) {
    ws.mergeCells(r, 1, r, colCount);
    const titleCell = ws.getCell(r, 1);
    titleCell.value = input.title;
    titleCell.font = { bold: true, size: 14, color: { argb: XLSX_COLORS.titleFg } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    r += 1;
  }
  if (input.subtitle) {
    ws.mergeCells(r, 1, r, colCount);
    const sub = ws.getCell(r, 1);
    sub.value = input.subtitle;
    sub.font = { size: 10, color: { argb: XLSX_COLORS.headerFg } };
    r += 1;
  }
  if (input.title || input.subtitle) r += 1;

  const writeHeader = (labels: string[]) => {
    const headerRow = ws.getRow(r);
    labels.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: XLSX_COLORS.headerFg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      applyFill(cell, XLSX_COLORS.headerBg);
      applyBorder(cell);
    });
    headerRow.height = 20;
    r += 1;
  };
  if (input.topHeader?.length) writeHeader(input.topHeader);
  writeHeader(input.columns);

  input.rows.forEach((row, rowIdx) => {
    const excelRow = ws.getRow(r);
    const rowFill = input.rowFills?.[rowIdx];
    for (let i = 0; i < colCount; i++) {
      const raw = row[i];
      const cell = excelRow.getCell(i + 1);
      cell.value = cellValue(raw);
      const st = cellStyle(raw);
      const fill = st?.fill || rowFill || (rowIdx % 2 === 1 ? XLSX_COLORS.zebra : XLSX_COLORS.white);
      applyFill(cell, fill);
      applyBorder(cell);
      cell.font = {
        size: 10,
        bold: !!st?.bold,
        color: { argb: st?.fontColor || XLSX_COLORS.titleFg },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: st?.align || 'center',
        wrapText: true,
      };
    }
    excelRow.height = 18;
    r += 1;
  });

  const widths =
    input.colWidths ||
    input.columns.map((c) => Math.min(36, Math.max(10, Math.ceil(c.length * 1.2) + 4)));
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const name = input.filename.endsWith('.xlsx')
    ? input.filename
    : `${input.filename}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Multi-header support for attendance-style tables. */
export async function downloadAttendanceLikeXlsx(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  /** Top header cells: { label, span, fill? } */
  topHeader: { label: string; span: number; fill?: string }[];
  /** Second header row labels (same total width as top) */
  subHeader: { label: string; fill?: string }[];
  rows: {
    cells: XlsxCell[];
    kind?: 'weekend' | 'noshow' | 'normal';
  }[];
  footer?: XlsxCell[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  const ws = wb.addWorksheet('Посещения');

  const colCount = opts.subHeader.length;
  let r = 1;
  ws.mergeCells(r, 1, r, colCount);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 13, color: { argb: XLSX_COLORS.titleFg } };
  r += 1;
  if (opts.subtitle) {
    ws.mergeCells(r, 1, r, colCount);
    ws.getCell(r, 1).value = opts.subtitle;
    ws.getCell(r, 1).font = { size: 10, color: { argb: XLSX_COLORS.headerFg } };
    r += 1;
  }
  r += 1;

  const topRow = ws.getRow(r);
  let c = 1;
  for (const h of opts.topHeader) {
    if (h.span > 1) ws.mergeCells(r, c, r, c + h.span - 1);
    const cell = topRow.getCell(c);
    cell.value = h.label;
    cell.font = { bold: true, size: 10, color: { argb: XLSX_COLORS.headerFg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyFill(cell, h.fill || XLSX_COLORS.headerBg);
    for (let i = 0; i < h.span; i++) applyBorder(topRow.getCell(c + i));
    c += h.span;
  }
  topRow.height = 20;
  r += 1;

  const subRow = ws.getRow(r);
  opts.subHeader.forEach((h, i) => {
    const cell = subRow.getCell(i + 1);
    cell.value = h.label;
    cell.font = { bold: true, size: 9, color: { argb: XLSX_COLORS.headerFg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyFill(cell, h.fill || XLSX_COLORS.headerBg);
    applyBorder(cell);
  });
  subRow.height = 28;
  r += 1;

  for (const row of opts.rows) {
    const excelRow = ws.getRow(r);
    const kindFill =
      row.kind === 'weekend'
        ? XLSX_COLORS.weekendBg
        : row.kind === 'noshow'
          ? XLSX_COLORS.noShowBg
          : undefined;
    row.cells.forEach((raw, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = cellValue(raw);
      const st = cellStyle(raw);
      applyFill(cell, st?.fill || kindFill || XLSX_COLORS.white);
      applyBorder(cell);
      cell.font = {
        size: 9,
        bold: !!st?.bold || row.kind === 'noshow',
        color: {
          argb:
            st?.fontColor ||
            (row.kind === 'noshow' ? XLSX_COLORS.noShowFg : XLSX_COLORS.titleFg),
        },
      };
      cell.alignment = {
        horizontal: st?.align || 'center',
        vertical: 'middle',
      };
    });
    r += 1;
  }

  if (opts.footer?.length) {
    const footerRow = ws.getRow(r);
    opts.footer.forEach((raw, i) => {
      const cell = footerRow.getCell(i + 1);
      cell.value = cellValue(raw);
      const st = cellStyle(raw);
      applyFill(cell, st?.fill || XLSX_COLORS.headerBg);
      applyBorder(cell);
      cell.font = { bold: true, size: 9, color: { argb: XLSX_COLORS.titleFg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  for (let i = 1; i <= colCount; i++) {
    ws.getColumn(i).width = i <= 2 ? 12 : 11;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const name = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pivot matrix: date lines + rotated column headers (Verifix dismissal report). */
export async function downloadMatrixXlsx(opts: {
  filename: string;
  sheetName?: string;
  meta: string[];
  corner: string;
  columns: string[];
  rows: { label: string; values: Array<number | string> }[];
  footer?: { label: string; values: Array<number | string> };
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  const ws = wb.addWorksheet((opts.sheetName || 'Отчет').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1');
  const colCount = 1 + opts.columns.length;
  let r = 1;

  for (const line of opts.meta) {
    ws.getCell(r, 1).value = line;
    ws.getCell(r, 1).font = { size: 10, color: { argb: XLSX_COLORS.headerFg } };
    r += 1;
  }
  if (opts.meta.length) r += 1;

  const header = ws.getRow(r);
  header.height = 120;
  const corner = header.getCell(1);
  corner.value = opts.corner;
  corner.font = { bold: true, size: 9, color: { argb: XLSX_COLORS.headerFg } };
  corner.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  applyFill(corner, XLSX_COLORS.headerBg);
  applyBorder(corner);
  opts.columns.forEach((label, i) => {
    const cell = header.getCell(i + 2);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: XLSX_COLORS.headerFg } };
    cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true };
    applyFill(cell, XLSX_COLORS.headerBg);
    applyBorder(cell);
  });
  r += 1;

  const writeRow = (label: string, values: Array<number | string>, bold = false) => {
    const excelRow = ws.getRow(r);
    const nameCell = excelRow.getCell(1);
    nameCell.value = label;
    nameCell.font = { size: 9, bold, color: { argb: XLSX_COLORS.titleFg } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
    applyFill(nameCell, bold ? XLSX_COLORS.headerBg : XLSX_COLORS.white);
    applyBorder(nameCell);
    for (let i = 0; i < opts.columns.length; i += 1) {
      const cell = excelRow.getCell(i + 2);
      const v = values[i];
      cell.value = v === '' || v == null ? null : v;
      cell.font = { size: 9, bold, color: { argb: XLSX_COLORS.titleFg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      applyFill(cell, bold ? XLSX_COLORS.headerBg : XLSX_COLORS.white);
      applyBorder(cell);
    }
    r += 1;
  };

  for (const row of opts.rows) writeRow(row.label, row.values);
  if (opts.footer) writeRow(opts.footer.label, opts.footer.values, true);

  ws.getColumn(1).width = 28;
  for (let i = 2; i <= colCount; i += 1) ws.getColumn(i).width = 4;

  const buffer = await wb.xlsx.writeBuffer();
  const name = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toArgb(hex?: string): string | undefined {
  if (!hex) return undefined;
  const h = hex.replace('#', '').trim();
  if (h.length === 8) return h.toUpperCase();
  if (h.length === 6) return `FF${h.toUpperCase()}`;
  return undefined;
}

export type XlsxSheetExport = {
  name: string;
  columns: string[];
  rows: XlsxCell[][];
  rowFills?: (string | undefined)[];
  /** Merge column A across these 0-based data-row ranges (inclusive). */
  mergeFirstCol?: Array<[number, number]>;
  colWidths?: number[];
};

/** Verifix multi-sheet reports: empty row, merged date line, header, grouped first column. */
export async function downloadMultiSheetXlsx(opts: {
  filename: string;
  dateLine?: string;
  sheets: XlsxSheetExport[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  wb.created = new Date();

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1');
    const colCount = Math.max(1, sheet.columns.length);
    let r = 2;
    if (opts.dateLine) {
      ws.mergeCells(r, 1, r, colCount);
      const dateCell = ws.getCell(r, 1);
      dateCell.value = opts.dateLine;
      dateCell.font = { size: 10, color: { argb: XLSX_COLORS.headerFg } };
      dateCell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
    r = 4;

    const headerRow = ws.getRow(r);
    sheet.columns.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: XLSX_COLORS.headerFg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      applyFill(cell, 'FFD5D5D5');
      applyBorder(cell);
    });
    headerRow.height = 22;
    const dataStart = r + 1;
    r += 1;

    const merges = sheet.mergeFirstCol || [];
    sheet.rows.forEach((row, rowIdx) => {
      const excelRow = ws.getRow(r);
      const rowFill = toArgb(sheet.rowFills?.[rowIdx]);
      const groupStart = merges.some(([a]) => a === rowIdx);
      const inGroup = merges.some(([a, b]) => rowIdx >= a && rowIdx <= b);
      for (let i = 0; i < colCount; i++) {
        const raw = row[i];
        const cell = excelRow.getCell(i + 1);
        cell.value = cellValue(raw);
        const st = cellStyle(raw);
        const fill = st?.fill || (groupStart || (inGroup && i === 0) ? rowFill : undefined);
        applyFill(cell, fill);
        applyBorder(cell);
        cell.font = {
          size: 10,
          bold: !!st?.bold || groupStart,
          color: { argb: st?.fontColor || XLSX_COLORS.titleFg },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: st?.align || (i < 2 ? 'left' : 'center'),
          wrapText: true,
        };
      }
      excelRow.height = 18;
      r += 1;
    });

    for (const [a, b] of merges) {
      if (b > a) ws.mergeCells(dataStart + a, 1, dataStart + b, 1);
    }

    const widths =
      sheet.colWidths ||
      sheet.columns.map((c, i) => (i <= 1 ? 28 : Math.min(22, Math.max(12, Math.ceil(c.length * 1.1) + 2))));
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const name = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** KPI + titled tables on one sheet (employee movement / similar Verifix reports). */
export async function downloadSectionedXlsx(opts: {
  filename: string;
  sheetName?: string;
  kpi?: { label: string; value: string | number };
  sections: { title: string; columns: string[]; rows: XlsxCell[][] }[];
  colWidths?: number[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  wb.created = new Date();
  const ws = wb.addWorksheet(
    (opts.sheetName || 'Отчет').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1',
  );
  const colCount = Math.max(
    9,
    ...opts.sections.map((s) => Math.max(s.columns.length, 1)),
  );
  let r = 1;

  const paintRow = (
    values: XlsxCell[],
    style?: { bold?: boolean; fill?: string; header?: boolean },
  ) => {
    const excelRow = ws.getRow(r);
    for (let i = 0; i < colCount; i += 1) {
      const raw = values[i];
      const cell = excelRow.getCell(i + 1);
      cell.value = cellValue(raw);
      const st = cellStyle(raw);
      applyFill(cell, st?.fill || style?.fill || (style?.header ? XLSX_COLORS.headerBg : XLSX_COLORS.white));
      applyBorder(cell);
      cell.font = {
        size: 10,
        bold: !!st?.bold || !!style?.bold || !!style?.header,
        color: { argb: st?.fontColor || XLSX_COLORS.titleFg },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: st?.align || (style?.header || i === 0 ? 'center' : 'left'),
        wrapText: true,
      };
    }
    excelRow.height = style?.header ? 22 : 18;
    r += 1;
  };

  if (opts.kpi) {
    paintRow([opts.kpi.label], { bold: true });
    paintRow([opts.kpi.value], { bold: true });
    r += 1;
  }

  for (const section of opts.sections) {
    paintRow([section.title], { bold: true });
    paintRow(section.columns, { header: true });
    section.rows.forEach((row, idx) => {
      paintRow(row, { fill: idx % 2 === 1 ? XLSX_COLORS.zebra : XLSX_COLORS.white });
    });
    r += 1;
  }

  const widths =
    opts.colWidths ||
    Array.from({ length: colCount }, (_, i) => (i === 0 ? 8 : i === 6 ? 36 : i >= 7 ? 16 : 22));
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const name = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
