import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import {
  EXCEL_IMPORT_MAX_BYTES,
  hasXlsxZipMagic,
  isExcelImportFileName,
  loadExcelImportWorkbook,
} from './excel-import';

async function tinyXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('data');
  ws.addRow(['ИД', 'Штат', 'Сотрудник']);
  ws.addRow(['1', '', 'Иванов']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('excel import guards', () => {
  it('accepts a normal small .xlsx', async () => {
    const buf = await tinyXlsx();
    assert.equal(hasXlsxZipMagic(buf), true);
    const wb = await loadExcelImportWorkbook(buf);
    assert.ok(wb.getWorksheet('data'));
    assert.equal(wb.getWorksheet('data')?.getRow(2).getCell(3).value, 'Иванов');
  });

  it('rejects oversized buffers before ExcelJS.load', async () => {
    const huge = Buffer.alloc(EXCEL_IMPORT_MAX_BYTES + 1, 0x50);
    huge[0] = 0x50;
    huge[1] = 0x4b;
    huge[2] = 0x03;
    huge[3] = 0x04;
    await assert.rejects(
      () => loadExcelImportWorkbook(huge),
      (err: unknown) =>
        err instanceof BadRequestException &&
        String((err as BadRequestException).message).includes('5'),
    );
  });

  it('rejects HTML and OLE .xls disguised as excel', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    assert.equal(hasXlsxZipMagic(html), false);
    await assert.rejects(() => loadExcelImportWorkbook(html), BadRequestException);

    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await assert.rejects(() => loadExcelImportWorkbook(ole), BadRequestException);
  });

  it('parses a template produced by the exporter (round-trip)', async () => {
    const { buildIndividualScheduleTemplateBuffer, parseIndividualScheduleWorkbook } =
      await import('../catalog/verifix-schedule-xlsx');
    const buf = await buildIndividualScheduleTemplateBuffer({
      year: 2026,
      monthIndex: 0,
      seedRows: [
        {
          id: 'T1',
          employee: 'Тест',
          days: { '1': '9' },
        },
      ],
    });
    const parsed = await parseIndividualScheduleWorkbook(buf);
    assert.ok(parsed.rows.length >= 1);
    assert.equal(parsed.rows[0].id, 'T1');
    assert.equal(parsed.rows[0].days['1'], '9');
  });

  it('only allows .xlsx names (blocks .xlsm macros and .xls)', () => {
    assert.equal(isExcelImportFileName('grafik.xlsx'), true);
    assert.equal(isExcelImportFileName('grafik.XLSX'), true);
    assert.equal(isExcelImportFileName('grafik.xlsm'), false);
    assert.equal(isExcelImportFileName('grafik.xls'), false);
    assert.equal(isExcelImportFileName('../grafik.xlsx'), false);
  });
});
