import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import ExcelJS from 'exceljs';

/** Shared limits for every Excel *import* (not export). */
export const EXCEL_IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const EXCEL_IMPORT_MAX_SHEETS = 8;
export const EXCEL_IMPORT_MAX_ROWS = 10_000;
export const EXCEL_IMPORT_MAX_COLS = 64;

const XLSX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
]);

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];

export function isExcelImportFileName(name: string | undefined): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n.endsWith('.xlsx')) return false;
  if (n.endsWith('.xlsm') || n.includes('..')) return false;
  return true;
}

export function isExcelImportMime(mime: string | undefined): boolean {
  if (!mime) return true;
  const m = mime.split(';')[0].trim().toLowerCase();
  return XLSX_MIME.has(m);
}

/** ZIP local-file header — real .xlsx is OOXML (zip). Rejects HTML/OLE .xls. */
export function hasXlsxZipMagic(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return (
    buf[0] === ZIP_LOCAL[0] &&
    buf[1] === ZIP_LOCAL[1] &&
    buf[2] === ZIP_LOCAL[2] &&
    buf[3] === ZIP_LOCAL[3]
  );
}

export function assertExcelImportUpload(
  originalname: string | undefined,
  mimetype: string | undefined,
): void {
  if (!isExcelImportFileName(originalname)) {
    throw new BadRequestException('Разрешён только файл Excel (.xlsx)');
  }
  if (!isExcelImportMime(mimetype)) {
    throw new BadRequestException('Разрешён только файл Excel (.xlsx)');
  }
}

/**
 * Memory-only multer for Excel import. No disk temp files.
 * Size is enforced again on the buffer before ExcelJS.load.
 */
export const excelImportMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: EXCEL_IMPORT_MAX_BYTES,
    files: 1,
    fields: 16,
  },
  fileFilter: (
    _req: unknown,
    file: { originalname: string; mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    try {
      assertExcelImportUpload(file.originalname, file.mimetype);
      cb(null, true);
    } catch (err) {
      cb(err as Error, false);
    }
  },
};

export function assertExcelImportBuffer(buf: Buffer): void {
  if (!buf?.length) {
    throw new BadRequestException('file is required');
  }
  if (buf.length > EXCEL_IMPORT_MAX_BYTES) {
    throw new BadRequestException('Файл слишком большой (макс. 5 МБ)');
  }
  if (!hasXlsxZipMagic(buf)) {
    throw new BadRequestException('Файл не является корректным Excel (.xlsx)');
  }
}

function assertWorkbookBounds(wb: ExcelJS.Workbook): void {
  if (wb.worksheets.length > EXCEL_IMPORT_MAX_SHEETS) {
    throw new BadRequestException('Слишком много листов в книге');
  }
  for (const ws of wb.worksheets) {
    if ((ws.columnCount || 0) > EXCEL_IMPORT_MAX_COLS) {
      throw new BadRequestException('Слишком много столбцов в файле');
    }
    if ((ws.rowCount || 0) > EXCEL_IMPORT_MAX_ROWS) {
      throw new BadRequestException('Слишком много строк в файле');
    }
  }
}

/** Load .xlsx from memory with size/type/sheet/row caps. Never writes temp files. */
export async function loadExcelImportWorkbook(
  buf: Buffer,
): Promise<ExcelJS.Workbook> {
  assertExcelImportBuffer(buf);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Не удалось прочитать Excel (.xlsx)');
  }
  assertWorkbookBounds(wb);
  return wb;
}
