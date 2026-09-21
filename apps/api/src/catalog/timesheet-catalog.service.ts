import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayStatus, DocumentLifecycle, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateParam } from '../common/date-range';
import {
  creditedOnTimeHours,
  eachUtcDate,
  hoursAfter,
  hoursBefore,
  numDec,
  planNormHours,
  round2,
  scaleDailyHoursToTargets,
} from './catalog-hours.util';

/**
 * F10: timesheet corrections extracted from CatalogService.
 */
@Injectable()
export class TimesheetCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private timesheetCorrectionInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              divisionId: true,
            },
          },
        },
      },
    };
  }

  private parseCorrectionLines(raw: unknown): Array<{
    employeeId: string;
    sortOrder: number;
    plannedHours?: number | null;
    onTimeHours?: number | null;
    outsideHours?: number | null;
    workedHours?: number | null;
    overtimeHours?: number | null;
    beforeHours?: number | null;
    afterHours?: number | null;
    note?: string | null;
  }> {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного сотрудника');
    }
    const lines = raw
      .map((item, idx) => {
        const row = item as Record<string, unknown>;
        const employeeId = String(row.employeeId || '').trim();
        if (!employeeId) return null;
        const num = (v: unknown) => {
          if (v === undefined || v === null || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        return {
          employeeId,
          sortOrder: Number(row.sortOrder ?? idx) || idx,
          plannedHours: num(row.plannedHours),
          onTimeHours: num(row.onTimeHours),
          outsideHours: num(row.outsideHours),
          workedHours: num(row.workedHours),
          overtimeHours: num(row.overtimeHours),
          beforeHours: num(row.beforeHours),
          afterHours: num(row.afterHours),
          note: row.note ? String(row.note) : null,
        };
      })
      .filter(Boolean) as Array<{
      employeeId: string;
      sortOrder: number;
      plannedHours?: number | null;
      onTimeHours?: number | null;
      outsideHours?: number | null;
      workedHours?: number | null;
      overtimeHours?: number | null;
      beforeHours?: number | null;
      afterHours?: number | null;
      note?: string | null;
    }>;
    if (lines.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного сотрудника');
    }
    return lines;
  }

  async createTimesheetCorrection(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const periodFrom = parseDateParam(
      String(body.periodFrom || body.documentDate || documentDate.toISOString().slice(0, 10)),
      documentDate,
      'periodFrom',
    );
    const periodTo = parseDateParam(
      String(body.periodTo || body.periodFrom || documentDate.toISOString().slice(0, 10)),
      periodFrom,
      'periodTo',
    );
    if (periodTo.getTime() < periodFrom.getTime()) {
      throw new BadRequestException('periodTo must be >= periodFrom');
    }
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseCorrectionLines(body.lines)
        : Array.isArray(body.employeeIds) && body.employeeIds.length > 0
          ? this.parseCorrectionLines(
              (body.employeeIds as string[]).map((id) => ({ employeeId: id })),
            )
          : this.parseCorrectionLines([]);
    const resolvedLines = lines;
    for (const line of resolvedLines) {
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

    return this.prisma.timesheetCorrection.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        title: body.title ? String(body.title) : 'Корректировка табеля',
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        periodFrom,
        periodTo,
        meta: (body.meta as Prisma.InputJsonValue) ?? undefined,
        lines: {
          create: resolvedLines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            plannedHours: l.plannedHours,
            onTimeHours: l.onTimeHours,
            outsideHours: l.outsideHours,
            workedHours: l.workedHours,
            overtimeHours: l.overtimeHours,
            beforeHours: l.beforeHours,
            afterHours: l.afterHours,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.timesheetCorrectionInclude(),
    });
  }

  async updateTimesheetCorrection(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft timesheet corrections can be edited');
    }
    const data: Prisma.TimesheetCorrectionUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(String(body.documentDate), row.documentDate, 'documentDate');
    }
    if (body.periodFrom !== undefined) {
      data.periodFrom = parseDateParam(String(body.periodFrom), row.periodFrom, 'periodFrom');
    }
    if (body.periodTo !== undefined) {
      data.periodTo = parseDateParam(String(body.periodTo), row.periodTo, 'periodTo');
    }
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.title !== undefined) data.title = String(body.title || 'Корректировка табеля');
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.meta !== undefined) data.meta = body.meta as Prisma.InputJsonValue;

    if (body.lines !== undefined || body.employeeIds !== undefined) {
      const lines =
        Array.isArray(body.lines) && body.lines.length > 0
          ? this.parseCorrectionLines(body.lines)
          : this.parseCorrectionLines(
              (Array.isArray(body.employeeIds) ? body.employeeIds : []).map((eid) => ({
                employeeId: eid,
              })),
            );
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.timesheetCorrectionLine.deleteMany({ where: { correctionId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          plannedHours: l.plannedHours,
          onTimeHours: l.onTimeHours,
          outsideHours: l.outsideHours,
          workedHours: l.workedHours,
          overtimeHours: l.overtimeHours,
          beforeHours: l.beforeHours,
          afterHours: l.afterHours,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.timesheetCorrection.update({
      where: { id },
      data,
      include: this.timesheetCorrectionInclude(),
    });
  }

  async postTimesheetCorrection(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Timesheet correction already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled timesheet correction cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty timesheet correction');
    }

    const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<
      string,
      unknown
    >;
    const periodFrom = row.periodFrom;
    const periodTo = row.periodTo;

    for (const line of row.lines) {
      const daily = await this.computeEmployeePeriodHours(
        tenantId,
        line.employeeId,
        periodFrom,
        periodTo,
        meta,
      );

      // Scale daily hours to match edited line totals when present
      const target = {
        plannedHours: numDec(line.plannedHours),
        onTimeHours: numDec(line.onTimeHours),
        outsideHours: numDec(line.outsideHours),
        workedHours: numDec(line.workedHours),
        overtimeHours: numDec(line.overtimeHours),
        beforeHours: numDec(line.beforeHours),
        afterHours: numDec(line.afterHours),
      };
      const scaledDays = scaleDailyHoursToTargets(daily.days, target);

      for (const day of scaledDays) {
        const existing = await this.prisma.attendanceDay.findUnique({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate: day.workDate,
            },
          },
        });
        const oldStatus = existing?.status ?? null;
        const newStatus = day.status;

        if (existing) {
          await this.prisma.attendanceDay.update({
            where: { id: existing.id },
            data: {
              status: newStatus,
              plannedHours: day.plannedHours,
              onTimeHours: day.onTimeHours,
              outsideHours: day.outsideHours,
              workedHours: day.workedHours,
              overtimeHours: day.overtimeHours,
              beforeHours: day.beforeHours,
              afterHours: day.afterHours,
              correctionId: id,
            },
          });
        } else {
          await this.prisma.attendanceDay.create({
            data: {
              tenantId,
              employeeId: line.employeeId,
              workDate: day.workDate,
              status: newStatus,
              plannedHours: day.plannedHours,
              onTimeHours: day.onTimeHours,
              outsideHours: day.outsideHours,
              workedHours: day.workedHours,
              overtimeHours: day.overtimeHours,
              beforeHours: day.beforeHours,
              afterHours: day.afterHours,
              correctionId: id,
            },
          });
        }

        await this.prisma.timesheetAdjustment.create({
          data: {
            tenantId,
            employeeId: line.employeeId,
            workDate: day.workDate,
            oldStatus,
            newStatus,
            reason: row.title || row.number || 'Корректировка табеля',
            createdBy: postedBy,
          },
        });
      }

      // Persist computed/edited totals back onto the line if empty
      await this.prisma.timesheetCorrectionLine.update({
        where: { id: line.id },
        data: {
          plannedHours: target.plannedHours ?? daily.totals.plannedHours,
          onTimeHours: target.onTimeHours ?? daily.totals.onTimeHours,
          outsideHours: target.outsideHours ?? daily.totals.outsideHours,
          workedHours: target.workedHours ?? daily.totals.workedHours,
          overtimeHours: target.overtimeHours ?? daily.totals.overtimeHours,
          beforeHours: target.beforeHours ?? daily.totals.beforeHours,
          afterHours: target.afterHours ?? daily.totals.afterHours,
        },
      });
    }

    return this.prisma.timesheetCorrection.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        meta: {
          ...meta,
          appliedAt: new Date().toISOString(),
          appliedHours: true,
        } as Prisma.InputJsonValue,
      },
      include: this.timesheetCorrectionInclude(),
    });
  }

  async fillTimesheetCorrectionHours(
    tenantId: string,
    body: {
      employeeIds?: string[];
      divisionId?: string;
      periodFrom: string;
      periodTo: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const periodFrom = parseDateParam(body.periodFrom, new Date(), 'periodFrom');
    const periodTo = parseDateParam(body.periodTo, periodFrom, 'periodTo');
    if (periodTo.getTime() < periodFrom.getTime()) {
      throw new BadRequestException('periodTo must be >= periodFrom');
    }

    let employeeIds = (body.employeeIds || []).filter(Boolean);
    if (employeeIds.length === 0) {
      const emps = await this.prisma.employee.findMany({
        where: {
          tenantId,
          status: 'active',
          ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        },
        select: { id: true },
        take: 500,
      });
      employeeIds = emps.map((e) => e.id);
    }
    if (employeeIds.length === 0) {
      throw new BadRequestException('Нет сотрудников для заполнения');
    }

    const meta = body.meta || {};
    const lines = [];
    for (const employeeId of employeeIds) {
      const computed = await this.computeEmployeePeriodHours(
        tenantId,
        employeeId,
        periodFrom,
        periodTo,
        meta,
      );
      lines.push({
        employeeId,
        ...computed.totals,
      });
    }
    return { lines, periodFrom, periodTo };
  }

  private async computeEmployeePeriodHours(
    tenantId: string,
    employeeId: string,
    periodFrom: Date,
    periodTo: Date,
    meta: Record<string, unknown>,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { schedule: true },
    });
    if (!emp) throw new NotFoundException(`Employee ${employeeId} not found`);

    const planStart = emp.schedule?.startTime ?? '09:00';
    const planEnd = emp.schedule?.endTime ?? '18:00';
    const planNorm = planNormHours(planStart, planEnd);
    const countBefore = Boolean(meta.countBefore);
    const countAfter = Boolean(meta.countAfter);
    const countLunch = meta.countLunch !== false; // default true-ish for on-time calc

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        employeeId,
        workDate: { gte: periodFrom, lte: periodTo },
      },
    });
    const dayByKey = new Map(
      days.map((d) => [d.workDate.toISOString().slice(0, 10), d]),
    );
    const absences = await this.prisma.absence.findMany({
      where: {
        tenantId,
        employeeId,
        status: { in: ['approved', 'pending'] },
        startDate: { lte: periodTo },
        endDate: { gte: periodFrom },
      },
    });

    const totals = {
      plannedHours: 0,
      onTimeHours: 0,
      outsideHours: 0,
      workedHours: 0,
      overtimeHours: 0,
      beforeHours: 0,
      afterHours: 0,
    };
    const dayRows: Array<{
      workDate: Date;
      status: DayStatus;
      plannedHours: number;
      onTimeHours: number;
      outsideHours: number;
      workedHours: number;
      overtimeHours: number;
      beforeHours: number;
      afterHours: number;
    }> = [];

    for (const date of eachUtcDate(periodFrom, periodTo)) {
      const key = date.toISOString().slice(0, 10);
      const d = dayByKey.get(key);
      const dow = date.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const absenceCover = absences.find((a) => {
        const s = a.startDate.toISOString().slice(0, 10);
        const e = a.endDate.toISOString().slice(0, 10);
        return key >= s && key <= e;
      });
      let status: DayStatus =
        d?.status ??
        (weekend ? DayStatus.day_off : absenceCover ? DayStatus.leave : DayStatus.not_started);
      const isDayOff = status === DayStatus.day_off || weekend;
      const isLeave = status === DayStatus.leave || (!!absenceCover && !weekend);

      let planned = 0;
      let onTime = 0;
      let outside = 0;
      let worked = 0;
      let overtime = 0;
      let before = 0;
      let after = 0;

      if (isDayOff) {
        // no hours
      } else if (isLeave) {
        planned = planNorm;
        status = DayStatus.leave;
      } else if (d?.firstInAt && d?.lastOutAt) {
        const inAt = new Date(d.firstInAt);
        const outAt = new Date(d.lastOutAt);
        const samePunch = Math.abs(outAt.getTime() - inAt.getTime()) < 60_000;
        if (!samePunch) {
          planned = planNorm;
          worked = round2(Math.max(0, (outAt.getTime() - inAt.getTime()) / 3600000));
          onTime = round2(
            Math.min(
              planNorm,
              Math.max(0, creditedOnTimeHours(inAt, outAt, planStart, planEnd, countLunch)),
            ),
          );
          overtime = round2(Math.max(0, worked - planNorm));
          outside = round2(Math.max(0, worked - onTime));
          before = countBefore ? round2(hoursBefore(inAt, planStart)) : 0;
          after = countAfter ? round2(hoursAfter(outAt, planEnd)) : 0;
          if (d.status === DayStatus.late) status = DayStatus.late;
          else if (d.status === DayStatus.on_time) status = DayStatus.on_time;
          else status = DayStatus.on_time;
        } else {
          planned = planNorm;
          status = DayStatus.absent;
        }
      } else if (!weekend) {
        planned = planNorm;
        status = d?.status === DayStatus.absent ? DayStatus.absent : DayStatus.not_started;
      }

      totals.plannedHours += planned;
      totals.onTimeHours += onTime;
      totals.outsideHours += outside;
      totals.workedHours += worked;
      totals.overtimeHours += overtime;
      totals.beforeHours += before;
      totals.afterHours += after;

      dayRows.push({
        workDate: date,
        status,
        plannedHours: planned,
        onTimeHours: onTime,
        outsideHours: outside,
        workedHours: worked,
        overtimeHours: overtime,
        beforeHours: before,
        afterHours: after,
      });
    }

    return {
      totals: {
        plannedHours: round2(totals.plannedHours),
        onTimeHours: round2(totals.onTimeHours),
        outsideHours: round2(totals.outsideHours),
        workedHours: round2(totals.workedHours),
        overtimeHours: round2(totals.overtimeHours),
        beforeHours: round2(totals.beforeHours),
        afterHours: round2(totals.afterHours),
      },
      days: dayRows,
    };
  }

  async cancelTimesheetCorrection(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Posted timesheet correction cannot be cancelled directly');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Timesheet correction already cancelled');
    }
    return this.prisma.timesheetCorrection.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.timesheetCorrectionInclude(),
    });
  }

  // ─── Individual schedules (HR HUB «Индивидуальные графики») ───────────────
}
