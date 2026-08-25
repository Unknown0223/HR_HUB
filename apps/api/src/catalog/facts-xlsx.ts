/**
 * Verifix «Импорт фактов» xlsx — template matching
 * sheet «Факты»: person_name, division_name, fact_type_name, fact_value, fact_date
 */
import ExcelJS from 'exceljs';

export async function buildFactsImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Факты');
  sheet.addRow([
    'person_name',
    'division_name',
    'fact_type_name',
    'fact_value',
    'fact_date',
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(['', '', '', '', '']);
  sheet.columns = [
    { width: 32 },
    { width: 22 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
  ];

  const data = wb.addWorksheet('data');
  data.addRow(['employee_example', 'division_example', 'fact_type_example']);
  data.getRow(1).font = { bold: true, color: { argb: 'FF64748B' } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function parseFactDate(raw: string): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // dd.mm.yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // excel serial as number string
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 100000) {
    // Excel epoch 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
