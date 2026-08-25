import { BadRequestException, Injectable } from '@nestjs/common';
import { DayStatus, DocumentType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { daysAgo, parseDateParam, parseYearMonth, startOfCurrentMonth } from '../common/date-range';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  async attendanceT13(tenantId: string, yearInput: number, monthInput: number) {
    const { year, month } = parseYearMonth(yearInput, monthInput);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    const daysInMonth = to.getDate();

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', employmentType: 'staff' },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }],
    });

    const days = await this.prisma.attendanceDay.findMany({
      where: { tenantId, workDate: { gte: from, lte: to } },
    });

    const statusLetter = (s: DayStatus) => {
      switch (s) {
        case DayStatus.on_time:
          return 'Я';
        case DayStatus.late:
          return 'О';
        case DayStatus.absent:
          return 'Н';
        case DayStatus.leave:
          return 'ОТ';
        case DayStatus.day_off:
          return 'В';
        default:
          return '·';
      }
    };

    const rows = employees.map((emp) => {
      const cells: Record<string, string> = {};
      let worked = 0;
      let late = 0;
      let absent = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const key = String(d).padStart(2, '0');
        const found = days.find((x) => {
          if (x.employeeId !== emp.id) return false;
          const dt = new Date(x.workDate);
          return dt.getDate() === d;
        });
        cells[key] = found ? statusLetter(found.status) : '·';
        if (found?.status === DayStatus.on_time || found?.status === DayStatus.late) worked += 1;
        if (found?.status === DayStatus.late) late += 1;
        if (found?.status === DayStatus.absent) absent += 1;
      }
      return { employee: emp, cells, worked, late, absent };
    });

    return {
      title: `Табель T-13 — ${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      daysInMonth,
      legend: { Я: 'Vaqtida', О: 'Kechikkan', Н: 'Yo‘q', ОТ: 'Ta’til', В: 'Dam', '·': 'Bo‘sh' },
      rows,
    };
  }

  async lateness(tenantId: string, from?: string, to?: string) {
    const gte = parseDateParam(from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(to, new Date(), 'to');
    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte, lte },
        OR: [{ status: DayStatus.late }, { lateMinutes: { gt: 0 } }],
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
            division: { select: { name: true } },
          },
        },
      },
      orderBy: { workDate: 'desc' },
    });

    const byEmp = new Map<
      string,
      { employee: (typeof days)[0]['employee']; count: number; totalMinutes: number }
    >();
    for (const d of days) {
      const key = d.employeeId;
      if (!byEmp.has(key)) {
        byEmp.set(key, { employee: d.employee, count: 0, totalMinutes: 0 });
      }
      const row = byEmp.get(key)!;
      row.count += 1;
      row.totalMinutes += d.lateMinutes;
    }

    return {
      title: 'Kechikish hisoboti',
      from: gte,
      to: lte,
      details: days,
      summary: [...byEmp.values()].sort((a, b) => b.totalMinutes - a.totalMinutes),
    };
  }

  async markDetails(tenantId: string, from?: string, to?: string) {
    const gte = parseDateParam(from, daysAgo(7), 'from');
    const lte = parseDateParam(to, new Date(), 'to');
    const marks = await this.prisma.attendanceMark.findMany({
      where: { tenantId, occurredAt: { gte, lte } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        device: { select: { id: true, name: true, serialNumber: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });

    const bySource: Record<string, number> = {};
    for (const m of marks) {
      bySource[m.source] = (bySource[m.source] || 0) + 1;
    }

    return {
      title: 'Belgilar detallari',
      from: gte,
      to: lte,
      total: marks.length,
      bySource,
      marks,
    };
  }

  async hrMovement(tenantId: string, year?: number, groupBy: 'division' | 'staff' = 'division') {
    const { year: y } = parseYearMonth(year, 1);
    const from = new Date(y, 0, 1);
    const to = new Date(y, 11, 31, 23, 59, 59);

    const [hired, dismissed, docs, headcount, byDivision, byPosition, byGender] = await Promise.all([
      this.prisma.employee.count({
        where: { tenantId, hiredAt: { gte: from, lte: to } },
      }),
      this.prisma.employee.count({
        where: { tenantId, dismissedAt: { gte: from, lte: to } },
      }),
      this.prisma.hrDocument.findMany({
        where: { tenantId, documentDate: { gte: from, lte: to } },
        include: {
          employee: {
            select: { firstName: true, lastName: true, tabNumber: true },
          },
        },
        orderBy: { documentDate: 'desc' },
        take: 100,
      }),
      this.prisma.employee.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['divisionId'],
        where: { tenantId, status: 'active' },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['positionId'],
        where: { tenantId, status: 'active' },
        _count: true,
      }),
      this.prisma.person.groupBy({
        by: ['gender'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    const [divisions, positions] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.position.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d.name]));
    const posMap = Object.fromEntries(positions.map((p) => [p.id, p.name]));

    const byDivisionRows = byDivision.map((d) => ({
      divisionId: d.divisionId,
      name: d.divisionId ? divMap[d.divisionId] ?? '—' : 'Belgilanmagan',
      count: d._count,
    }));
    const byStaffRows = byPosition.map((p) => ({
      positionId: p.positionId,
      name: p.positionId ? posMap[p.positionId] ?? '—' : 'Belgilanmagan',
      count: p._count,
    }));

    const rows = groupBy === 'staff' ? byStaffRows : byDivisionRows;

    return {
      title:
        groupBy === 'staff'
          ? `HR harakat (штаты) — ${y}`
          : `HR harakat (подразделения) — ${y}`,
      year: y,
      groupBy,
      hired,
      dismissed,
      headcount,
      gender: byGender,
      byDivision: byDivisionRows,
      byStaff: byStaffRows,
      rows,
      documents: docs,
      docTypes: Object.values(DocumentType),
    };
  }

  async fot(tenantId: string, periodId?: string) {
    let period = periodId
      ? await this.prisma.payrollPeriod.findFirst({ where: { id: periodId, tenantId } })
      : await this.prisma.payrollPeriod.findFirst({
          where: { tenantId },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

    if (!period) {
      return {
        title: 'ФОТ hisoboti',
        empty: true,
        message: 'Ish haqi davri hali yo‘q',
      };
    }

    const lines = await this.prisma.payrollLine.findMany({
      where: { tenantId, periodId: period.id, status: 'posted' },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
            division: { select: { name: true } },
          },
        },
      },
    });

    const byType: Record<string, number> = {};
    const byDivision: Record<string, number> = {};
    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        tabNumber: string;
        fullName: string;
        division: string;
        base: number;
        penalty: number;
        advance: number;
        other: number;
        net: number;
      }
    >();
    let total = 0;
    let penalties = 0;

    for (const line of lines) {
      const amt = Number(line.amount);
      byType[line.type] = (byType[line.type] || 0) + amt;
      total += amt;
      if (line.type === 'penalty') penalties += Math.abs(amt);
      const div = line.employee.division?.name ?? '—';
      byDivision[div] = (byDivision[div] || 0) + amt;

      const key = line.employeeId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeId: key,
          tabNumber: line.employee.tabNumber,
          fullName: `${line.employee.lastName} ${line.employee.firstName}`,
          division: div,
          base: 0,
          penalty: 0,
          advance: 0,
          other: 0,
          net: 0,
        });
      }
      const row = byEmployee.get(key)!;
      if (line.type === 'base') row.base += amt;
      else if (line.type === 'penalty') row.penalty += amt;
      else if (line.type === 'advance') row.advance += Math.abs(amt);
      else row.other += amt;
      row.net += amt;
    }

    const rows = [...byEmployee.values()];

    return {
      title: `ФОТ — ${period.year}-${String(period.month).padStart(2, '0')}`,
      period,
      total,
      penalties,
      byType,
      byDivision: Object.entries(byDivision).map(([name, amount]) => ({ name, amount })),
      lineCount: lines.length,
      rows,
    };
  }

  async overview(tenantId: string) {
    const now = new Date();
    const [employees, marksToday, pendingRequests, openProblems, periods] =
      await Promise.all([
        this.prisma.employee.count({ where: { tenantId, status: 'active' } }),
        this.prisma.attendanceMark.count({
          where: {
            tenantId,
            occurredAt: {
              gte: new Date(now.toISOString().slice(0, 10)),
            },
          },
        }),
        this.prisma.hrRequest.count({ where: { tenantId, status: 'pending' } }),
        this.prisma.problemMark.count({ where: { tenantId, resolved: false } }),
        this.prisma.payrollPeriod.count({ where: { tenantId } }),
      ]);

    return {
      title: 'Hisobotlar paneli',
      employees,
      marksToday,
      pendingRequests,
      openProblems,
      periods,
    };
  }

  async attendanceT13Xlsx(tenantId: string, year: number, month: number) {
    const data = await this.attendanceT13(tenantId, year, month);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR HUB';
    const ws = wb.addWorksheet('T-13');
    const days = data.daysInMonth;
    const header = [
      'Tab№',
      'F.I.O.',
      'Bo‘lim',
      ...Array.from({ length: days }, (_, i) => String(i + 1)),
      'Я',
      'О',
      'Н',
    ];
    ws.addRow(header);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([
        r.employee.tabNumber,
        `${r.employee.lastName} ${r.employee.firstName}`,
        r.employee.division?.name ?? '',
        ...Array.from({ length: days }, (_, i) => {
          const key = String(i + 1).padStart(2, '0');
          return r.cells[key] ?? '';
        }),
        r.worked,
        r.late,
        r.absent,
      ]);
    }
    ws.addRow([]);
    ws.addRow(['Legend', ...Object.entries(data.legend).map(([k, v]) => `${k}=${v}`)]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `t13-${year}-${String(month).padStart(2, '0')}.xlsx`;
    return { buffer, filename };
  }

  async fotXlsx(tenantId: string, periodId?: string) {
    const data = await this.fot(tenantId, periodId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR HUB';
    const ws = wb.addWorksheet('FOT');
    ws.addRow(['Metrika', 'Qiymat']);
    ws.getRow(1).font = { bold: true };
    if ('empty' in data && data.empty) {
      ws.addRow(['Xabar', data.message ?? '']);
    } else {
      const fot = data as {
        title: string;
        total: number;
        penalties: number;
        byType: Record<string, number>;
        byDivision: { name: string; amount: number }[];
        period?: { year: number; month: number };
      };
      ws.addRow(['Sarlavha', fot.title]);
      ws.addRow(['Jami ФОТ', fot.total ?? 0]);
      ws.addRow(['Jarimalar', fot.penalties ?? 0]);
      for (const [t, n] of Object.entries(fot.byType ?? {})) {
        ws.addRow([`Tur: ${t}`, n]);
      }
      for (const d of fot.byDivision ?? []) {
        ws.addRow([`Bo‘lim: ${d.name}`, d.amount]);
      }
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const period = 'period' in data && data.period
      ? `${data.period.year}-${String(data.period.month).padStart(2, '0')}`
      : 'latest';
    return { buffer, filename: `fot-${period}.xlsx` };
  }

  async latenessXlsx(tenantId: string, from?: string, to?: string) {
    const data = await this.lateness(tenantId, from, to);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR HUB';
    const summary = wb.addWorksheet('Summary');
    summary.addRow(['Xodim', 'Tab№', 'Bo‘lim', 'Kunlar', 'Jami min']);
    summary.getRow(1).font = { bold: true };
    for (const r of data.summary) {
      summary.addRow([
        `${r.employee.lastName} ${r.employee.firstName}`,
        r.employee.tabNumber,
        r.employee.division?.name ?? '',
        r.count,
        r.totalMinutes,
      ]);
    }
    const details = wb.addWorksheet('Details');
    details.addRow(['Sana', 'Xodim', 'Tab№', 'Status', 'Late min']);
    details.getRow(1).font = { bold: true };
    for (const d of data.details) {
      details.addRow([
        String(d.workDate).slice(0, 10),
        `${d.employee.lastName} ${d.employee.firstName}`,
        d.employee.tabNumber,
        d.status,
        d.lateMinutes,
      ]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const fromKey = new Date(data.from).toISOString().slice(0, 10);
    return { buffer, filename: `lateness-${fromKey}.xlsx` };
  }

  async markDetailsXlsx(tenantId: string, from?: string, to?: string) {
    const data = await this.markDetails(tenantId, from, to);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR HUB';
    const meta = wb.addWorksheet('Overview');
    meta.addRow(['Metrika', 'Qiymat']);
    meta.getRow(1).font = { bold: true };
    meta.addRow(['Sarlavha', data.title]);
    meta.addRow(['Jami', data.total]);
    for (const [src, n] of Object.entries(data.bySource)) {
      meta.addRow([`Manba: ${src}`, n]);
    }
    const ws = wb.addWorksheet('Marks');
    ws.addRow(['Vaqt', 'Xodim', 'Tab№', 'Yo‘nalish', 'Manba', 'Qurilma']);
    ws.getRow(1).font = { bold: true };
    for (const m of data.marks) {
      ws.addRow([
        String(m.occurredAt),
        m.employee ? `${m.employee.lastName} ${m.employee.firstName}` : '',
        m.employee?.tabNumber ?? '',
        m.direction,
        m.source,
        m.device?.name ?? m.device?.serialNumber ?? '',
      ]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const fromKey = new Date(data.from).toISOString().slice(0, 10);
    return { buffer, filename: `marks-${fromKey}.xlsx` };
  }

  async hrMovementXlsx(tenantId: string, year?: number) {
    const data = await this.hrMovement(tenantId, year);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR HUB';
    const summary = wb.addWorksheet('Summary');
    summary.addRow(['Metrika', 'Qiymat']);
    summary.getRow(1).font = { bold: true };
    summary.addRow(['Yil', data.year]);
    summary.addRow(['Qabul', data.hired]);
    summary.addRow(['Bo‘shatish', data.dismissed]);
    for (const h of data.headcount) {
      summary.addRow([`Status: ${h.status}`, h._count]);
    }
    for (const g of data.gender) {
      summary.addRow([`Gender: ${g.gender ?? '—'}`, g._count]);
    }
    for (const d of data.byDivision) {
      summary.addRow([`Bo‘lim: ${d.name}`, d.count]);
    }
    const docs = wb.addWorksheet('Documents');
    docs.addRow(['Hujjat', 'Tur', 'Xodim', 'Tab№', 'Sana']);
    docs.getRow(1).font = { bold: true };
    for (const d of data.documents) {
      docs.addRow([
        d.title,
        d.type,
        d.employee ? `${d.employee.lastName} ${d.employee.firstName}` : '',
        d.employee?.tabNumber ?? '',
        String(d.documentDate).slice(0, 10),
      ]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: `hr-movement-${data.year}.xlsx` };
  }
}
