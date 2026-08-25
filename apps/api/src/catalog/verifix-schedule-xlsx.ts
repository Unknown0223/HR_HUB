/**
 * Verifix «Индивидуальный-график-(создание)» xlsx layout.
 * Sheets: data (row per employee/position) + metadata (shift definitions).
 */
import ExcelJS from 'exceljs';

const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export type VerifixShiftMeta = {
  code: string;
  startTime: string;
  endTime: string;
  breakYn: 'Y' | 'N';
  breakStart?: string;
  breakEnd?: string;
  appearance?: string;
};

export type VerifixScheduleDataRow = {
  id?: string;
  staff?: string;
  employee?: string;
  division?: string;
  position?: string;
  days: Record<string, string>;
};

export type ParsedVerifixSchedule = {
  shifts: VerifixShiftMeta[];
  rows: VerifixScheduleDataRow[];
  monthDays: number;
};

function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v).trim();
  }
  if (typeof v === 'object' && v && 'text' in (v as object)) {
    return String((v as { text: unknown }).text ?? '').trim();
  }
  if (typeof v === 'object' && v && 'result' in (v as object)) {
    return String((v as { result: unknown }).result ?? '').trim();
  }
  return String(v).trim();
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Build Verifix-compatible template workbook buffer. */
export async function buildIndividualScheduleTemplateBuffer(opts: {
  year: number;
  monthIndex: number;
  seedRows?: VerifixScheduleDataRow[];
  shifts?: VerifixShiftMeta[];
}): Promise<Buffer> {
  const { year, monthIndex } = opts;
  const dim = daysInMonth(year, monthIndex);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR HUB';
  wb.created = new Date();

  const data = wb.addWorksheet('data');
  const head1: (string | number)[] = ['ИД', 'Штат', 'Сотрудник', 'Подразделение', 'Должность'];
  const head2: (string | number)[] = ['ИД', 'Штат', 'Сотрудник', 'Подразделение', 'Должность'];
  for (let d = 1; d <= 31; d++) {
    head1.push(d <= dim ? d : '');
    if (d <= dim) {
      const wd = new Date(Date.UTC(year, monthIndex, d)).getUTCDay();
      head2.push(WEEKDAYS_RU[wd]);
    } else {
      head2.push('');
    }
  }
  data.addRow(head1);
  data.addRow(head2);
  data.getRow(1).font = { bold: true };
  data.getRow(2).font = { bold: true, color: { argb: 'FF64748B' } };

  for (const row of opts.seedRows || []) {
    const vals: (string | number)[] = [
      row.id || '',
      row.staff || '',
      row.employee || '',
      row.division || '',
      row.position || '',
    ];
    for (let d = 1; d <= 31; d++) {
      vals.push(d <= dim ? row.days[String(d)] ?? '' : '');
    }
    data.addRow(vals);
  }

  data.columns = Array.from({ length: 36 }, (_, i) => ({
    width: i < 5 ? 18 : 5,
  }));

  const meta = wb.addWorksheet('metadata');
  meta.addRow([
    'Код',
    'Начало дня',
    'Конец дня',
    'Перерыв(Y или N (Y - да, N – нет))',
    'Начало перерыва',
    'Конец перерыва',
    'Явка',
  ]);
  meta.getRow(1).font = { bold: true };

  const shifts =
    opts.shifts && opts.shifts.length
      ? opts.shifts
      : [
          {
            code: 'Смена 1',
            startTime: '09:00',
            endTime: '18:00',
            breakYn: 'Y' as const,
            breakStart: '13:00',
            breakEnd: '14:00',
            appearance: '08:00',
          },
        ];

  for (const s of shifts) {
    meta.addRow([
      s.code,
      s.startTime,
      s.endTime,
      s.breakYn,
      s.breakStart || '',
      s.breakEnd || '',
      s.appearance || '',
    ]);
  }

  const tip =
    '1. Все типы данных должны быть текстовыми\n' +
    '2. Коды должны быть уникальными\n' +
    '3. Если Перерыв нет начало и конец перерыв не нужно писать';
  meta.getCell('I2').value = tip;
  meta.getColumn(1).width = 14;
  meta.getColumn(2).width = 12;
  meta.getColumn(3).width = 12;
  meta.getColumn(4).width = 28;
  meta.getColumn(5).width = 14;
  meta.getColumn(6).width = 14;
  meta.getColumn(7).width = 10;
  meta.getColumn(9).width = 48;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Parse Verifix individual-schedule workbook (data + metadata sheets). */
export async function parseIndividualScheduleWorkbook(
  buffer: Buffer,
): Promise<ParsedVerifixSchedule> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const dataSheet =
    wb.getWorksheet('data') ||
    wb.worksheets.find((s) => /data|данные|graph|график/i.test(s.name)) ||
    wb.worksheets[0];
  const metaSheet =
    wb.getWorksheet('metadata') ||
    wb.worksheets.find((s) => /meta|смен|shift/i.test(s.name));

  const shifts: VerifixShiftMeta[] = [];
  if (metaSheet) {
    metaSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = cellText(row.getCell(1).value);
      if (!code || /^1\./.test(code)) return;
      const startTime = cellText(row.getCell(2).value);
      const endTime = cellText(row.getCell(3).value);
      if (!startTime && !endTime) return;
      const breakYn = cellText(row.getCell(4).value).toUpperCase().startsWith('N')
        ? 'N'
        : 'Y';
      shifts.push({
        code,
        startTime: startTime || '09:00',
        endTime: endTime || '18:00',
        breakYn,
        breakStart: cellText(row.getCell(5).value) || undefined,
        breakEnd: cellText(row.getCell(6).value) || undefined,
        appearance: cellText(row.getCell(7).value) || undefined,
      });
    });
  }

  const rows: VerifixScheduleDataRow[] = [];
  let monthDays = 31;
  if (dataSheet) {
    const r1 = dataSheet.getRow(1);
    // detect last filled day col
    for (let c = 36; c >= 6; c--) {
      const v = cellText(r1.getCell(c).value);
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0 && n <= 31) {
          monthDays = n;
          break;
        }
      }
    }

    dataSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;
      const id = cellText(row.getCell(1).value);
      const staff = cellText(row.getCell(2).value);
      const employee = cellText(row.getCell(3).value);
      const division = cellText(row.getCell(4).value);
      const position = cellText(row.getCell(5).value);
      const days: Record<string, string> = {};
      let any = false;
      for (let d = 1; d <= monthDays; d++) {
        const v = cellText(row.getCell(5 + d).value);
        if (v) {
          days[String(d)] = v;
          any = true;
        }
      }
      if (!id && !staff && !employee && !position && !any) return;
      rows.push({ id, staff, employee, division, position, days });
    });
  }

  return { shifts, rows, monthDays };
}

/** Resolve shift code hours from metadata. */
export function shiftCodeHours(
  cell: string,
  shifts: VerifixShiftMeta[],
): number | null {
  if (!cell) return null;
  if (/^\d+(\.\d+)?$/.test(cell)) return Number(cell);
  const m = cell.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end < start) end += 24 * 60;
    return (end - start) / 60;
  }
  const sh = shifts.find(
    (s) => s.code.toLowerCase() === cell.toLowerCase() || s.code === cell,
  );
  if (!sh) return null;
  const [shH, shM] = sh.startTime.split(':').map(Number);
  const [eh, em] = sh.endTime.split(':').map(Number);
  let mins = eh * 60 + em - (shH * 60 + shM);
  if (mins < 0) mins += 24 * 60;
  if (sh.breakYn === 'Y' && sh.breakStart && sh.breakEnd) {
    const [bh, bm] = sh.breakStart.split(':').map(Number);
    const [bhe, bme] = sh.breakEnd.split(':').map(Number);
    mins -= bhe * 60 + bme - (bh * 60 + bm);
  }
  return Math.round((mins / 60) * 100) / 100;
}
