import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentLifecycle, DayStatus, Prisma, WorkScheduleKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateParam } from '../common/date-range';
import {
  buildIndividualScheduleTemplateBuffer,
  parseIndividualScheduleWorkbook,
  shiftCodeHours,
  type ScheduleShiftMeta,
} from './schedule-xlsx';
import {
  isDayOffByPattern,
  mergeScheduleSettings,
  monthDaysFromSchedule,
  parseScheduleSettings,
  type ScheduleKind as Skind,
  type ScheduleSettings,
} from '../attendance/schedule-settings';
import { round2 } from './catalog-hours.util';

/**
 * F10: schedule docs / rosters / shift assignments extracted from CatalogService.
 */
@Injectable()
export class SchedulesCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private individualScheduleInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              divisionId: true,
              positionId: true,
              position: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parseScheduleKind(raw: unknown): WorkScheduleKind {
    const k = String(raw || 'ordinary');
    const allowed = new Set(Object.values(WorkScheduleKind));
    if (!allowed.has(k as WorkScheduleKind)) {
      throw new BadRequestException(`Unknown schedule kind: ${k}`);
    }
    return k as WorkScheduleKind;
  }

  private monthStartFrom(body: Record<string, unknown>, fallback = new Date()): Date {
    if (body.month) {
      const s = String(body.month);
      // YYYY-MM or YYYY-MM-DD
      if (/^\d{4}-\d{2}$/.test(s)) {
        const [y, m] = s.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, 1));
      }
      return parseDateParam(s, fallback, 'month');
    }
    if (body.year != null && body.monthNum != null) {
      return new Date(Date.UTC(Number(body.year), Number(body.monthNum) - 1, 1));
    }
    return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1));
  }

  private parseIndividualLines(raw: unknown[]): Array<{
    employeeId: string;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const employeeId = String(row.employeeId || '');
      if (!employeeId) throw new BadRequestException(`lines[${idx}].employeeId is required`);
      const daysRaw = row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  private computeLineTotals(days: Record<string, string>) {
    let daysCount = 0;
    let hoursTotal = 0;
    for (const v of Object.values(days)) {
      if (!v || v === 'В' || v === 'R' || v === 'Вх' || v === 'П') continue;
      // "8" or "09:00-18:00" or shift code with hours later
      if (/^\d+(\.\d+)?$/.test(v)) {
        daysCount += 1;
        hoursTotal += Number(v);
        continue;
      }
      const m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (m) {
        const start = Number(m[1]) * 60 + Number(m[2]);
        let end = Number(m[3]) * 60 + Number(m[4]);
        if (end < start) end += 24 * 60;
        daysCount += 1;
        hoursTotal += (end - start) / 60;
        continue;
      }
      // shift label / non-empty work mark
      daysCount += 1;
    }
    return { daysCount, hoursTotal: round2(hoursTotal) };
  }

  private dayHoursValue(v: string): number | null {
    if (!v || v === 'В' || v === 'R' || v === 'Вх' || v === 'П') return null;
    if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
    const m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (m) {
      const start = Number(m[1]) * 60 + Number(m[2]);
      let end = Number(m[3]) * 60 + Number(m[4]);
      if (end < start) end += 24 * 60;
      return (end - start) / 60;
    }
    return null;
  }

  async createIndividualSchedule(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const kind = this.parseScheduleKind(body.kind);
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseIndividualLines(body.lines)
        : [];

    for (const line of lines) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: line.employeeId, tenantId },
        select: { id: true },
      });
      if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
    }
    if (body.divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: String(body.divisionId), tenantId },
        select: { id: true },
      });
      if (!div) throw new NotFoundException('Division not found');
    }

    return this.prisma.individualSchedule.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        kind,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        settings: (body.settings as Prisma.InputJsonValue) ?? undefined,
        normDays:
          body.normDays != null && body.normDays !== ''
            ? new Prisma.Decimal(Number(body.normDays))
            : undefined,
        normHours:
          body.normHours != null && body.normHours !== ''
            ? new Prisma.Decimal(Number(body.normHours))
            : undefined,
        lines: {
          create: lines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.individualScheduleInclude(),
    });
  }

  async updateIndividualSchedule(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft individual schedules can be edited');
    }

    const data: Prisma.IndividualScheduleUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.kind !== undefined) data.kind = this.parseScheduleKind(body.kind);
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.settings !== undefined) data.settings = body.settings as Prisma.InputJsonValue;
    if (body.normDays !== undefined) {
      data.normDays =
        body.normDays != null && body.normDays !== ''
          ? new Prisma.Decimal(Number(body.normDays))
          : null;
    }
    if (body.normHours !== undefined) {
      data.normHours =
        body.normHours != null && body.normHours !== ''
          ? new Prisma.Decimal(Number(body.normHours))
          : null;
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parseIndividualLines(body.lines) : [];
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.individualScheduleLine.deleteMany({ where: { documentId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.individualSchedule.update({
      where: { id },
      data,
      include: this.individualScheduleInclude(),
    });
  }

  async postIndividualSchedule(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Individual schedule already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled individual schedule cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty individual schedule');
    }

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        const hours = this.dayHoursValue(String(cell));
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));

        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });
      }
    }

    return this.prisma.individualSchedule.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.individualScheduleInclude(),
    });
  }

  async cancelIndividualSchedule(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status === 'posted') {
      throw new BadRequestException(
        'Проведённый документ нельзя отменить напрямую — снимите проведение отдельным процессом',
      );
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Individual schedule already cancelled');
    }
    return this.prisma.individualSchedule.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.individualScheduleInclude(),
    });
  }

  /** Fill employee month grid from week pattern + day norm (Заполнить). */
  async fillIndividualSchedule(
    tenantId: string,
    body: {
      month?: string;
      year?: number;
      monthNum?: number;
      employeeIds?: string[];
      divisionId?: string;
      dayNorm?: number;
      weekPattern?: '5/2' | '6/1' | '5/1';
      kind?: string;
      displayMode?: 'hours' | 'time_range';
      startTime?: string;
      endTime?: string;
    },
  ) {
    const month = this.monthStartFrom(
      {
        month: body.month,
        year: body.year,
        monthNum: body.monthNum,
      },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIdx = month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const dayNorm = Number(body.dayNorm ?? 8);
    const pattern = body.weekPattern || '5/2';
    const kind = String(body.kind || 'ordinary');
    const displayMode = body.displayMode || 'hours';
    const startTime = body.startTime || '09:00';
    const endTime = body.endTime || '18:00';

    let employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.employeeIds?.length ? { id: { in: body.employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        divisionId: true,
        positionId: true,
        position: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 500,
    });

    if (body.employeeIds?.length && !body.divisionId) {
      // keep order of request when only employeeIds
      const map = new Map(employees.map((e) => [e.id, e]));
      employees = body.employeeIds.map((id) => map.get(id)).filter(Boolean) as typeof employees;
    }

    const lines = employees.map((emp, idx) => {
      const days: Record<string, string> = {};
      for (let d = 1; d <= dim; d++) {
        const wd = new Date(Date.UTC(year, monthIdx, d)).getUTCDay(); // 0=Sun
        const isWeekend =
          pattern === '6/1' ? wd === 0 : wd === 0 || wd === 6;
        if (isWeekend) {
          days[String(d)] = kind === 'advanced' ? 'R' : 'В';
        } else if (displayMode === 'time_range') {
          days[String(d)] = `${startTime}-${endTime}`;
        } else {
          days[String(d)] = String(dayNorm);
        }
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId: emp.id,
        sortOrder: idx,
        days,
        daysCount: totals.daysCount,
        hoursTotal: totals.hoursTotal,
        employee: emp,
      };
    });

    return {
      month: month.toISOString().slice(0, 10),
      lines,
      normDays: lines[0]?.daysCount ?? 0,
      normHours: lines[0] ? round2((lines[0].daysCount || 0) * dayNorm) : 0,
    };
  }

  // ─── Position schedules (HR HUB «Индивидуальные графики для позиций») ─────

  private positionScheduleDocInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          position: { select: { id: true, name: true, code: true } },
          staffPosition: { select: { id: true, code: true, title: true } },
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              divisionId: true,
              positionId: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parsePositionLines(raw: unknown[]): Array<{
    positionId: string;
    staffPositionId?: string | null;
    employeeId?: string | null;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    normDays: number | null;
    normHours: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const positionId = String(row.positionId || '');
      if (!positionId) throw new BadRequestException(`lines[${idx}].positionId is required`);
      const daysRaw =
        row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        positionId,
        staffPositionId: row.staffPositionId ? String(row.staffPositionId) : null,
        employeeId: row.employeeId ? String(row.employeeId) : null,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        normDays:
          row.normDays != null && row.normDays !== '' ? Number(row.normDays) : null,
        normHours:
          row.normHours != null && row.normHours !== '' ? Number(row.normHours) : null,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  async createPositionScheduleDoc(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const kind = this.parseScheduleKind(body.kind);
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parsePositionLines(body.lines)
        : [];

    for (const line of lines) {
      const pos = await this.prisma.position.findFirst({
        where: { id: line.positionId, tenantId },
        select: { id: true },
      });
      if (!pos) throw new NotFoundException(`Position ${line.positionId} not found`);
      if (line.employeeId) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
    }
    if (body.divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: String(body.divisionId), tenantId },
        select: { id: true },
      });
      if (!div) throw new NotFoundException('Division not found');
    }

    return this.prisma.positionScheduleDoc.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        kind,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        settings: (body.settings as Prisma.InputJsonValue) ?? undefined,
        normDays:
          body.normDays != null && body.normDays !== ''
            ? new Prisma.Decimal(Number(body.normDays))
            : undefined,
        normHours:
          body.normHours != null && body.normHours !== ''
            ? new Prisma.Decimal(Number(body.normHours))
            : undefined,
        lines: {
          create: lines.map((l) => ({
            positionId: l.positionId,
            staffPositionId: l.staffPositionId ?? undefined,
            employeeId: l.employeeId ?? undefined,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            normDays: l.normDays != null ? new Prisma.Decimal(l.normDays) : undefined,
            normHours: l.normHours != null ? new Prisma.Decimal(l.normHours) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  async updatePositionScheduleDoc(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft documents can be edited');
    }

    const data: Prisma.PositionScheduleDocUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.kind !== undefined) data.kind = this.parseScheduleKind(body.kind);
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.settings !== undefined) data.settings = body.settings as Prisma.InputJsonValue;
    if (body.normDays !== undefined) {
      data.normDays =
        body.normDays != null && body.normDays !== ''
          ? new Prisma.Decimal(Number(body.normDays))
          : null;
    }
    if (body.normHours !== undefined) {
      data.normHours =
        body.normHours != null && body.normHours !== ''
          ? new Prisma.Decimal(Number(body.normHours))
          : null;
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parsePositionLines(body.lines) : [];
      for (const line of lines) {
        const pos = await this.prisma.position.findFirst({
          where: { id: line.positionId, tenantId },
          select: { id: true },
        });
        if (!pos) throw new NotFoundException(`Position ${line.positionId} not found`);
      }
      await this.prisma.positionScheduleDocLine.deleteMany({ where: { documentId: id } });
      data.lines = {
        create: lines.map((l) => ({
          positionId: l.positionId,
          staffPositionId: l.staffPositionId ?? undefined,
          employeeId: l.employeeId ?? undefined,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          normDays: l.normDays != null ? new Prisma.Decimal(l.normDays) : undefined,
          normHours: l.normHours != null ? new Prisma.Decimal(l.normHours) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data,
      include: this.positionScheduleDocInclude(),
    });
  }

  async postPositionScheduleDoc(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Document already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled document cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty document');
    }

    const settings =
      row.settings && typeof row.settings === 'object'
        ? (row.settings as Record<string, unknown>)
        : {};
    const shiftList = Array.isArray(settings.shifts)
      ? (settings.shifts as ScheduleShiftMeta[])
      : [];

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      if (!line.employeeId) continue;
      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        let hours = this.dayHoursValue(String(cell));
        if (hours == null && shiftList.length) {
          hours = shiftCodeHours(String(cell), shiftList);
        }
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));
        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });
      }
    }

    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  async cancelPositionScheduleDoc(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Проведённый документ нельзя отменить напрямую');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Already cancelled');
    }
    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  /** Fill rows from staff positions / employees. */
  async fillPositionScheduleDoc(
    tenantId: string,
    body: {
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      positionIds?: string[];
      fillOnlyWithEmployees?: boolean;
      dayNorm?: number;
      weekPattern?: '5/2' | '6/1' | '5/1';
      kind?: string;
      displayMode?: 'hours' | 'time_range';
      startTime?: string;
      endTime?: string;
      defaultShiftCode?: string;
    },
  ) {
    const month = this.monthStartFrom(
      { month: body.month, year: body.year, monthNum: body.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIdx = month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const dayNorm = Number(body.dayNorm ?? 8);
    const pattern = body.weekPattern || '5/2';
    const kind = String(body.kind || 'ordinary');
    const displayMode = body.displayMode || 'hours';
    const startTime = body.startTime || '09:00';
    const endTime = body.endTime || '18:00';
    const onlyWithEmp = body.fillOnlyWithEmployees !== false;
    const shiftCode = body.defaultShiftCode || '';

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        positionId: { not: null },
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.positionIds?.length
          ? { positionId: { in: body.positionIds } }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        externalId: true,
        divisionId: true,
        positionId: true,
        staffPositionId: true,
        position: { select: { id: true, name: true, code: true } },
        staffPosition: { select: { id: true, code: true, title: true } },
        division: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 800,
    });

    type LineOut = {
      positionId: string;
      staffPositionId?: string | null;
      employeeId?: string | null;
      sortOrder: number;
      days: Record<string, string>;
      daysCount: number;
      hoursTotal: number;
      employee?: (typeof employees)[0] | null;
      position?: { id: string; name: string; code: string } | null;
      staffPosition?: { id: string; code: string; title: string } | null;
    };

    const lines: LineOut[] = [];

    if (onlyWithEmp || employees.length > 0) {
      for (const emp of employees) {
        if (!emp.positionId) continue;
        const days = this.buildMonthDaysGrid({
          year,
          monthIdx,
          dim,
          pattern,
          kind,
          displayMode,
          dayNorm,
          startTime,
          endTime,
          shiftCode,
        });
        const totals = this.computeLineTotals(days);
        lines.push({
          positionId: emp.positionId,
          staffPositionId: emp.staffPositionId,
          employeeId: emp.id,
          sortOrder: lines.length,
          days,
          daysCount: totals.daysCount,
          hoursTotal: totals.hoursTotal,
          employee: emp,
          position: emp.position,
          staffPosition: emp.staffPosition,
        });
      }
    }

    if (!onlyWithEmp) {
      const positions = await this.prisma.position.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(body.positionIds?.length ? { id: { in: body.positionIds } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
        take: 500,
      });
      const covered = new Set(lines.map((l) => l.positionId));
      for (const pos of positions) {
        if (covered.has(pos.id)) continue;
        // skip if already has employee line for this position when only empty vacancies
        const days = this.buildMonthDaysGrid({
          year,
          monthIdx,
          dim,
          pattern,
          kind,
          displayMode,
          dayNorm,
          startTime,
          endTime,
          shiftCode,
        });
        const totals = this.computeLineTotals(days);
        lines.push({
          positionId: pos.id,
          employeeId: null,
          sortOrder: lines.length,
          days,
          daysCount: totals.daysCount,
          hoursTotal: totals.hoursTotal,
          position: pos,
        });
      }
    }

    return {
      month: month.toISOString().slice(0, 10),
      lines,
      normDays: lines[0]?.daysCount ?? 0,
      normHours: lines[0] ? round2((lines[0].daysCount || 0) * dayNorm) : 0,
    };
  }

  private buildMonthDaysGrid(opts: {
    year: number;
    monthIdx: number;
    dim: number;
    pattern: string;
    kind: string;
    displayMode: string;
    dayNorm: number;
    startTime: string;
    endTime: string;
    shiftCode?: string;
  }) {
    const days: Record<string, string> = {};
    for (let d = 1; d <= opts.dim; d++) {
      const wd = new Date(Date.UTC(opts.year, opts.monthIdx, d)).getUTCDay();
      const isWeekend =
        opts.pattern === '6/1' ? wd === 0 : wd === 0 || wd === 6;
      if (isWeekend) {
        days[String(d)] = opts.kind === 'advanced' ? 'R' : 'В';
      } else if (opts.shiftCode) {
        days[String(d)] = opts.shiftCode;
      } else if (opts.displayMode === 'time_range') {
        days[String(d)] = `${opts.startTime}-${opts.endTime}`;
      } else {
        days[String(d)] = String(opts.dayNorm);
      }
    }
    return days;
  }

  /** Download HR HUB xlsx template (optionally prefilled). */
  async downloadScheduleTemplate(
    tenantId: string,
    opts: {
      resource: 'schedule-overrides' | 'position-schedules';
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      documentId?: string;
      fillOnlyWithEmployees?: boolean;
    },
  ) {
    const month = this.monthStartFrom(
      { month: opts.month, year: opts.year, monthNum: opts.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();

    let seedRows: Array<{
      id?: string;
      staff?: string;
      employee?: string;
      division?: string;
      position?: string;
      days: Record<string, string>;
    }> = [];
    let shifts: ScheduleShiftMeta[] | undefined;

    if (opts.documentId) {
      if (opts.resource === 'schedule-overrides') {
        const doc = await this.prisma.individualSchedule.findFirst({
          where: { id: opts.documentId, tenantId },
          include: {
            lines: {
              include: {
                employee: {
                  select: {
                    id: true,
                    tabNumber: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    externalId: true,
                    division: { select: { name: true } },
                    position: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (doc) {
          const settings = (doc.settings || {}) as Record<string, unknown>;
          if (Array.isArray(settings.shifts)) shifts = settings.shifts as ScheduleShiftMeta[];
          seedRows = doc.lines.map((l) => {
            const e = l.employee;
            const name = e
              ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
              : '';
            return {
              id: e?.externalId || e?.tabNumber || e?.id,
              employee: name,
              division: e?.division?.name || '',
              position: e?.position?.name || '',
              days:
                l.days && typeof l.days === 'object'
                  ? (l.days as Record<string, string>)
                  : {},
            };
          });
        }
      } else {
        const doc = await this.prisma.positionScheduleDoc.findFirst({
          where: { id: opts.documentId, tenantId },
          include: {
            lines: {
              include: {
                position: true,
                staffPosition: true,
                employee: {
                  select: {
                    id: true,
                    tabNumber: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    externalId: true,
                    division: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (doc) {
          const settings = (doc.settings || {}) as Record<string, unknown>;
          if (Array.isArray(settings.shifts)) shifts = settings.shifts as ScheduleShiftMeta[];
          seedRows = doc.lines.map((l) => {
            const e = l.employee;
            const name = e
              ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
              : '';
            return {
              id: e?.externalId || e?.tabNumber || e?.id || l.positionId,
              staff: l.staffPosition?.code || '',
              employee: name,
              division: e?.division?.name || '',
              position: l.staffPosition
                ? `${l.staffPosition.title}/${l.position?.name || ''}(${l.staffPosition.code})`
                : l.position?.name || '',
              days:
                l.days && typeof l.days === 'object'
                  ? (l.days as Record<string, string>)
                  : {},
            };
          });
        }
      }
    } else if (opts.resource === 'position-schedules') {
      const filled = await this.fillPositionScheduleDoc(tenantId, {
        month: month.toISOString().slice(0, 10),
        divisionId: opts.divisionId,
        fillOnlyWithEmployees: opts.fillOnlyWithEmployees !== false,
        dayNorm: 8,
        weekPattern: '5/2',
      });
      seedRows = filled.lines.map((l) => {
        const e = l.employee;
        const name = e
          ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
          : '';
        return {
          id: e?.externalId || e?.tabNumber || e?.id || l.positionId,
          staff: l.staffPosition?.code || '',
          employee: name,
          division: e?.division?.name || '',
          position: l.position
            ? `${l.position.name}${l.position.code ? ` (${l.position.code})` : ''}`
            : '',
          days: l.days,
        };
      });
    }

    const buffer = await buildIndividualScheduleTemplateBuffer({
      year,
      monthIndex,
      seedRows,
      shifts,
    });
    const label =
      opts.resource === 'position-schedules'
        ? 'individual-schedule-positions'
        : 'individual-schedule';
    return {
      buffer,
      filename: `${label}-${year}-${String(monthIndex + 1).padStart(2, '0')}.xlsx`,
    };
  }

  /** Import HR HUB xlsx into line drafts (or attach to existing draft). */
  async importScheduleTemplate(
    tenantId: string,
    opts: {
      resource: 'schedule-overrides' | 'position-schedules';
      file: Buffer;
      documentId?: string;
      month?: string;
      kind?: string;
      merge?: boolean;
    },
  ) {
    const parsed = await parseIndividualScheduleWorkbook(opts.file);
    if (!parsed.rows.length && !parsed.shifts.length) {
      throw new BadRequestException('Файл пуст или не распознан (листы data/metadata)');
    }

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active' },
      select: {
        id: true,
        tabNumber: true,
        externalId: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        staffPositionId: true,
        position: { select: { id: true, name: true, code: true } },
        staffPosition: { select: { id: true, code: true, title: true } },
      },
      take: 2000,
    });
    const positions = await this.prisma.position.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });
    const staffPositions = await this.prisma.staffPosition.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, title: true, positionId: true },
      take: 2000,
    });

    const empByTab = new Map(employees.map((e) => [e.tabNumber.toLowerCase(), e]));
    const empByExt = new Map(
      employees.filter((e) => e.externalId).map((e) => [String(e.externalId).toLowerCase(), e]),
    );
    const empByName = new Map(
      employees.map((e) => {
        const n = [e.lastName, e.firstName, e.middleName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/\s+/g, ' ');
        return [n, e] as const;
      }),
    );
    const posByCode = new Map(positions.map((p) => [p.code.toLowerCase(), p]));
    const posByName = new Map(positions.map((p) => [p.name.toLowerCase(), p]));
    const staffByCode = new Map(staffPositions.map((s) => [s.code.toLowerCase(), s]));

    const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    if (opts.resource === 'schedule-overrides') {
      const lines: Array<{
        employeeId: string;
        days: Record<string, string>;
        daysCount: number;
        hoursTotal: number;
        matched?: string;
      }> = [];
      const unmatched: string[] = [];

      for (const row of parsed.rows) {
        let emp =
          (row.id && (empByTab.get(row.id.toLowerCase()) || empByExt.get(row.id.toLowerCase()))) ||
          (row.employee && empByName.get(normName(row.employee)));
        if (!emp && row.employee) {
          const loose = [...empByName.entries()].find(([n]) => n.includes(normName(row.employee!)));
          if (loose) emp = loose[1];
        }
        if (!emp) {
          unmatched.push(row.employee || row.id || '?');
          continue;
        }
        const days = { ...row.days };
        // resolve shift hours totals using metadata
        let hoursTotal = 0;
        let daysCount = 0;
        for (const [k, v] of Object.entries(days)) {
          let h = this.dayHoursValue(v);
          if (h == null) h = shiftCodeHours(v, parsed.shifts);
          if (h != null) {
            daysCount += 1;
            hoursTotal += h;
          }
        }
        lines.push({
          employeeId: emp.id,
          days,
          daysCount,
          hoursTotal: round2(hoursTotal),
          matched: [emp.lastName, emp.firstName].join(' '),
        });
      }

      if (opts.documentId) {
        const updated = await this.updateIndividualSchedule(tenantId, opts.documentId, {
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          settings: {
            useTemplate: true,
            shifts: parsed.shifts,
          },
        });
        return { document: updated, imported: lines.length, unmatched, shifts: parsed.shifts };
      }

      return {
        lines,
        shifts: parsed.shifts,
        imported: lines.length,
        unmatched,
        monthDays: parsed.monthDays,
      };
    }

    // position-schedules
    const lines: Array<{
      positionId: string;
      staffPositionId?: string | null;
      employeeId?: string | null;
      days: Record<string, string>;
      daysCount: number;
      hoursTotal: number;
      matched?: string;
    }> = [];
    const unmatched: string[] = [];

    for (const row of parsed.rows) {
      type EmpRow = (typeof employees)[number];
      let emp: EmpRow | undefined;
      if (row.id) {
        emp = empByTab.get(row.id.toLowerCase()) || empByExt.get(row.id.toLowerCase());
      }
      if (!emp && row.employee) {
        emp = empByName.get(normName(row.employee));
      }
      if (!emp && row.employee) {
        const loose = [...empByName.entries()].find(([n]) => n.includes(normName(row.employee!)));
        if (loose) emp = loose[1];
      }

      let staff =
        (row.staff && staffByCode.get(row.staff.toLowerCase())) || undefined;
      if (!staff && row.position) {
        const codeMatch = row.position.match(/\((\d+)\)\s*$/);
        if (codeMatch) staff = staffByCode.get(codeMatch[1]);
      }

      let pos =
        emp?.position ||
        (staff?.positionId ? positions.find((p) => p.id === staff!.positionId) : undefined) ||
        (row.position && posByName.get(normName(row.position.split('/')[0] || row.position))) ||
        (row.position && posByCode.get(row.position.toLowerCase())) ||
        undefined;

      if (!pos && !emp) {
        unmatched.push(row.position || row.employee || row.id || '?');
        continue;
      }
      if (!pos && emp?.positionId) {
        pos = positions.find((p) => p.id === emp!.positionId) || emp.position || undefined;
      }
      if (!pos) {
        unmatched.push(row.position || row.employee || '?');
        continue;
      }

      const days = { ...row.days };
      let hoursTotal = 0;
      let daysCount = 0;
      for (const v of Object.values(days)) {
        let h = this.dayHoursValue(v);
        if (h == null) h = shiftCodeHours(v, parsed.shifts);
        if (h != null) {
          daysCount += 1;
          hoursTotal += h;
        }
      }
      lines.push({
        positionId: pos.id,
        staffPositionId: staff?.id || emp?.staffPositionId || null,
        employeeId: emp?.id || null,
        days,
        daysCount,
        hoursTotal: round2(hoursTotal),
        matched: row.position || pos.name,
      });
    }

    if (opts.documentId) {
      const updated = await this.updatePositionScheduleDoc(tenantId, opts.documentId, {
        lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
        settings: {
          useTemplate: true,
          fillOnlyWithEmployees: true,
          shifts: parsed.shifts,
        },
      });
      return { document: updated, imported: lines.length, unmatched, shifts: parsed.shifts };
    }

    return {
      lines,
      shifts: parsed.shifts,
      imported: lines.length,
      unmatched,
      monthDays: parsed.monthDays,
    };
  }

  // ─── Work rosters (HR HUB «Расписание») ───────────────────────────────────

  private workRosterInclude() {
    return {
      schedule: { select: { id: true, name: true, code: true, kind: true } },
      lines: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              positionId: true,
              position: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parseRosterLines(raw: unknown[]): Array<{
    employeeId: string;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const employeeId = String(row.employeeId || '');
      if (!employeeId) throw new BadRequestException(`lines[${idx}].employeeId is required`);
      const daysRaw =
        row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  async createWorkRoster(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Название is required');
    const scheduleId = String(body.scheduleId || '');
    if (!scheduleId) throw new BadRequestException('График работы is required');
    const sched = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, tenantId },
      select: { id: true },
    });
    if (!sched) throw new NotFoundException('Work schedule not found');

    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseRosterLines(body.lines)
        : [];
    for (const line of lines) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: line.employeeId, tenantId },
        select: { id: true },
      });
      if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
    }

    return this.prisma.workRoster.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        name,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        scheduleId,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        lines: {
          create: lines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.workRosterInclude(),
    });
  }

  async updateWorkRoster(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.workRoster.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft rosters can be edited');
    }

    const data: Prisma.WorkRosterUpdateInput = {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw new BadRequestException('Название is required');
      data.name = name;
    }
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.scheduleId !== undefined) {
      const scheduleId = String(body.scheduleId || '');
      if (!scheduleId) throw new BadRequestException('График работы is required');
      const sched = await this.prisma.workSchedule.findFirst({
        where: { id: scheduleId, tenantId },
        select: { id: true },
      });
      if (!sched) throw new NotFoundException('Work schedule not found');
      data.schedule = { connect: { id: scheduleId } };
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parseRosterLines(body.lines) : [];
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.workRosterLine.deleteMany({ where: { rosterId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.workRoster.update({
      where: { id },
      data,
      include: this.workRosterInclude(),
    });
  }

  async postWorkRoster(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.workRoster.findFirst({
      where: { id, tenantId },
      include: { lines: true, schedule: true },
    });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status === 'posted') throw new BadRequestException('Already posted');
    if (row.status === 'cancelled') throw new BadRequestException('Cancelled');
    if (row.lines.length === 0) throw new BadRequestException('Cannot post empty roster');

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      // Assign work schedule to employee on post
      await this.prisma.employee.update({
        where: { id: line.employeeId },
        data: { scheduleId: row.scheduleId },
      });

      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};
      for (let d = 1; d <= dim; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        const hours = this.dayHoursValue(String(cell));
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));
        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });

        const shiftLabel =
          row.schedule?.name ||
          (String(cell).match(/^\d/) ? `Смена ${cell}` : String(cell));
        const sourceRef = `${row.id}:${line.employeeId}:${d}`;
        await this.prisma.scheduleShiftAssignment.upsert({
          where: {
            tenantId_employeeId_workDate_source_sourceRef: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
              source: 'roster',
              sourceRef,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            number: d,
            shiftLabel,
            status: 'planned',
            replaced: false,
            source: 'roster',
            sourceRef,
            scheduleId: row.scheduleId,
            note: row.number ? `№ ${row.number}` : row.name,
          },
          update: {
            number: d,
            shiftLabel,
            status: 'planned',
            scheduleId: row.scheduleId,
            note: row.number ? `№ ${row.number}` : row.name,
          },
        });
      }
    }

    return this.prisma.workRoster.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.workRosterInclude(),
    });
  }

  async cancelWorkRoster(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.workRoster.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Проведённый документ нельзя отменить напрямую');
    }
    if (row.status === 'cancelled') throw new BadRequestException('Already cancelled');
    return this.prisma.workRoster.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.workRosterInclude(),
    });
  }

  /** Prefill employee month grids from a work schedule template. */
  async fillWorkRoster(
    tenantId: string,
    body: {
      scheduleId: string;
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      employeeIds?: string[];
    },
  ) {
    const scheduleId = String(body.scheduleId || '');
    if (!scheduleId) throw new BadRequestException('scheduleId is required');
    const sched = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, tenantId },
    });
    if (!sched) throw new NotFoundException('Work schedule not found');

    const month = this.monthStartFrom(
      { month: body.month, year: body.year, monthNum: body.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const settings = parseScheduleSettings(sched.settings) as ScheduleSettings;
    const days = monthDaysFromSchedule({
      year,
      monthIndex,
      settings,
      kind: sched.kind as Skind,
      startTime: sched.startTime,
      endTime: sched.endTime,
    });
    const totals = this.computeLineTotals(days);

    let employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.employeeIds?.length ? { id: { in: body.employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        positionId: true,
        position: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 500,
    });

    if (body.employeeIds?.length) {
      const map = new Map(employees.map((e) => [e.id, e]));
      employees = body.employeeIds.map((id) => map.get(id)).filter(Boolean) as typeof employees;
    }

    // If no ids and no division: prefer employees already on this schedule
    if (!body.employeeIds?.length && !body.divisionId) {
      const onSched = await this.prisma.employee.findMany({
        where: { tenantId, status: 'active', scheduleId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          positionId: true,
          position: { select: { id: true, name: true } },
        },
        orderBy: { lastName: 'asc' },
        take: 500,
      });
      if (onSched.length) employees = onSched;
    }

    return {
      month: month.toISOString().slice(0, 10),
      schedule: { id: sched.id, name: sched.name, code: sched.code },
      lines: employees.map((emp, idx) => ({
        employeeId: emp.id,
        sortOrder: idx,
        days: { ...days },
        daysCount: totals.daysCount,
        hoursTotal: totals.hoursTotal,
        employee: emp,
      })),
    };
  }

  // ─── Список смен расписания (operational assignments) ─────────────────────

  private shiftAssignmentInclude() {
    return {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      replacedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      schedule: { select: { id: true, name: true, code: true } },
      shift: {
        select: { id: true, code: true, name: true, startTime: true, endTime: true },
      },
    };
  }

  async listShiftAssignments(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      employeeId?: string;
      status?: string;
      q?: string;
    } = {},
  ) {
    const where: Prisma.ScheduleShiftAssignmentWhereInput = { tenantId };
    const from = opts.from
      ? parseDateParam(String(opts.from), new Date(), 'from')
      : null;
    const to = opts.to ? parseDateParam(String(opts.to), new Date(), 'to') : null;
    if (from || to) {
      where.workDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (opts.employeeId) where.employeeId = opts.employeeId;
    if (opts.status) where.status = opts.status;

    const q = (opts.q || '').trim();
    if (q) {
      where.OR = [
        { shiftLabel: { contains: q, mode: 'insensitive' } },
        { source: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
        {
          employee: {
            OR: [
              { lastName: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { tabNumber: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        {
          schedule: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    return this.prisma.scheduleShiftAssignment.findMany({
      where,
      include: this.shiftAssignmentInclude(),
      orderBy: [{ workDate: 'desc' }, { number: 'asc' }],
      take: 2000,
    });
  }

  /** Rematerialize shift list from posted work rosters for a date window. */
  async rebuildShiftAssignments(
    tenantId: string,
    body: { from?: string; to?: string } = {},
  ) {
    const now = new Date();
    const from =
      body.from != null
        ? parseDateParam(String(body.from), now, 'from')
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to =
      body.to != null
        ? parseDateParam(String(body.to), now, 'to')
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    await this.prisma.scheduleShiftAssignment.deleteMany({
      where: {
        tenantId,
        source: 'roster',
        workDate: { gte: from, lte: to },
      },
    });

    const rosters = await this.prisma.workRoster.findMany({
      where: {
        tenantId,
        status: DocumentLifecycle.posted,
        month: {
          gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)),
          lte: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)),
        },
      },
      include: { lines: true, schedule: true },
    });

    let created = 0;
    for (const row of rosters) {
      const year = row.month.getUTCFullYear();
      const monthIdx = row.month.getUTCMonth();
      const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
      const shiftLabel = row.schedule?.name || 'Смена';
      for (const line of row.lines) {
        const days =
          line.days && typeof line.days === 'object' && !Array.isArray(line.days)
            ? (line.days as Record<string, string>)
            : {};
        for (let d = 1; d <= dim; d++) {
          const cell = days[String(d)];
          if (cell == null || cell === '') continue;
          const hours = this.dayHoursValue(String(cell));
          if (hours == null) continue;
          const workDate = new Date(Date.UTC(year, monthIdx, d));
          if (workDate < from || workDate > to) continue;
          const sourceRef = `${row.id}:${line.employeeId}:${d}`;
          await this.prisma.scheduleShiftAssignment.create({
            data: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
              number: d,
              shiftLabel,
              status: 'planned',
              replaced: false,
              source: 'roster',
              sourceRef,
              scheduleId: row.scheduleId,
              note: row.number ? `№ ${row.number}` : row.name,
            },
          });
          created += 1;
        }
      }
    }

    return { from, to, created, rosters: rosters.length };
  }

  async bulkShiftAssignments(
    tenantId: string,
    body: { ids?: string[]; action?: string },
  ) {
    const ids = Array.isArray(body.ids)
      ? body.ids.map(String).filter(Boolean)
      : [];
    if (!ids.length) throw new BadRequestException('ids required');
    const action = String(body.action || '').toLowerCase();
    if (!['cancel', 'complete', 'delete', 'plan'].includes(action)) {
      throw new BadRequestException('action must be cancel|complete|delete|plan');
    }

    const owned = await this.prisma.scheduleShiftAssignment.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = owned.map((r) => r.id);
    let ok = 0;
    if (action === 'delete') {
      const res = await this.prisma.scheduleShiftAssignment.deleteMany({
        where: { tenantId, id: { in: ownedIds } },
      });
      ok = res.count;
    } else {
      const status =
        action === 'cancel'
          ? 'cancelled'
          : action === 'complete'
            ? 'completed'
            : 'planned';
      const res = await this.prisma.scheduleShiftAssignment.updateMany({
        where: { tenantId, id: { in: ownedIds } },
        data: {
          status,
          ...(status === 'planned' ? { replaced: false, replacedById: null } : {}),
        },
      });
      ok = res.count;
    }
    return { ok, skipped: ids.length - ok, total: ids.length };
  }
}
