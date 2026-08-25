import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, DocumentLifecycle, PayrollLineType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTravelExpenseDto, TravelExpenseLineDto, UpdateTravelExpenseDto } from './travel-expenses.dto';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function day(iso?: string | null): Date {
  const s = (iso || new Date().toISOString()).slice(0, 10);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Некорректная дата');
  return d;
}

function empLabel(e: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  tabNumber?: string | null;
}) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ') || e.tabNumber || '—';
}

function tripDays(start?: Date | null, end?: Date | null) {
  if (!start || !end) return 0;
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

const EMP_SELECT = {
  id: true,
  tabNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
  divisionId: true,
  division: { select: { id: true, name: true } },
} as const;

const TRIP_SELECT = {
  id: true,
  title: true,
  startDate: true,
  endDate: true,
  amount: true,
  employeeId: true,
} as const;

@Injectable()
export class TravelExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      employee: { select: EMP_SELECT },
      trip: { select: TRIP_SELECT },
      lines: { orderBy: { sortOrder: 'asc' as const } },
    };
  }

  private map(
    row: {
      amount: unknown;
      advance: unknown;
      lines?: Array<{ amount: unknown }>;
      employee?: {
        lastName: string;
        firstName: string;
        middleName?: string | null;
        tabNumber?: string | null;
        division?: { id: string; name: string } | null;
      } | null;
      trip?: { startDate: Date; endDate: Date; amount: unknown; title: string } | null;
      [k: string]: unknown;
    },
  ) {
    const expenses = n(row.amount);
    const advance = n(row.advance);
    return {
      ...row,
      amount: expenses,
      advance,
      balance: Math.round((advance - expenses) * 100) / 100,
      tripDays: tripDays(row.trip?.startDate || null, row.trip?.endDate || null),
      tripNumber: row.trip?.title || '',
      employee: row.employee
        ? {
            ...row.employee,
            label: empLabel(row.employee),
            divisionName: row.employee.division?.name || '',
          }
        : null,
      lines: (row.lines || []).map((l) => ({ ...l, amount: n(l.amount) })),
    };
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.travelExpenseReport.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private lineTotal(lines: TravelExpenseLineDto[]) {
    return lines.reduce((s, l) => s + n(l.amount), 0);
  }

  async listTrips(tenantId: string, employeeId?: string) {
    const rows = await this.prisma.internalTrip.findMany({
      where: { tenantId, ...(employeeId ? { employeeId } : {}) },
      select: {
        ...TRIP_SELECT,
        employee: { select: { lastName: true, firstName: true, tabNumber: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 300,
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      label: t.title || empLabel(t.employee),
      employeeId: t.employeeId,
      startDate: t.startDate,
      endDate: t.endDate,
      amount: n(t.amount),
      days: tripDays(t.startDate, t.endDate),
    }));
  }

  async list(tenantId: string) {
    const rows = await this.prisma.travelExpenseReport.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.travelExpenseReport.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Авансовый отчет не найден');
    return this.map(row);
  }

  private async resolveTrip(tenantId: string, tripId: string, employeeId: string) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
      select: TRIP_SELECT,
    });
    if (!trip) throw new BadRequestException('Командировка не найдена');
    if (trip.employeeId !== employeeId) {
      throw new BadRequestException('Командировка принадлежит другому сотруднику');
    }
    return trip;
  }

  async create(tenantId: string, dto: CreateTravelExpenseDto) {
    await this.assertEmployee(tenantId, dto.employeeId);
    const trip = await this.resolveTrip(tenantId, dto.tripId, dto.employeeId);
    const lines = dto.lines || [];
    const expenses = this.lineTotal(lines);
    const advance = dto.advance != null ? n(dto.advance) : n(trip.amount);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.travelExpenseReport.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        tripId: dto.tripId,
        number,
        title: number,
        docDate: day(dto.docDate),
        spentAt: day(dto.docDate),
        currency: dto.currency?.trim() || 'UZS',
        advance,
        amount: expenses,
        calcForSalary: Boolean(dto.calcForSalary),
        status: ApprovalStatus.draft,
        note: dto.note?.trim() || null,
        lines: {
          create: lines.map((l, i) => ({
            accrualName: l.accrualName?.trim() || null,
            startDate: l.startDate ? day(l.startDate) : null,
            endDate: l.endDate ? day(l.endDate) : null,
            amount: n(l.amount),
            note: l.note?.trim() || null,
            sortOrder: i,
          })),
        },
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdateTravelExpenseDto) {
    const existing = await this.prisma.travelExpenseReport.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Авансовый отчет не найден');
    if (existing.status === ApprovalStatus.approved) {
      throw new BadRequestException('Завершённый отчет нельзя изменить');
    }
    const employeeId = dto.employeeId || existing.employeeId;
    if (dto.employeeId) await this.assertEmployee(tenantId, dto.employeeId);
    const tripId = dto.tripId !== undefined ? dto.tripId : existing.tripId;
    if (tripId) await this.resolveTrip(tenantId, tripId, employeeId);
    const lines = dto.lines;
    const expenses = lines ? this.lineTotal(lines) : n(existing.amount);

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) await tx.travelExpenseLine.deleteMany({ where: { reportId: id } });
      return tx.travelExpenseReport.update({
        where: { id },
        data: {
          number: dto.number?.trim() || undefined,
          title: dto.number?.trim() || undefined,
          docDate: dto.docDate ? day(dto.docDate) : undefined,
          spentAt: dto.docDate ? day(dto.docDate) : undefined,
          employeeId: dto.employeeId || undefined,
          tripId: dto.tripId !== undefined ? dto.tripId || null : undefined,
          currency: dto.currency?.trim() || undefined,
          advance: dto.advance != null ? n(dto.advance) : undefined,
          amount: lines ? expenses : undefined,
          calcForSalary: dto.calcForSalary != null ? Boolean(dto.calcForSalary) : undefined,
          note: dto.note !== undefined ? dto.note.trim() || null : undefined,
          ...(lines
            ? {
                lines: {
                  create: lines.map((l, i) => ({
                    accrualName: l.accrualName?.trim() || null,
                    startDate: l.startDate ? day(l.startDate) : null,
                    endDate: l.endDate ? day(l.endDate) : null,
                    amount: n(l.amount),
                    note: l.note?.trim() || null,
                    sortOrder: i,
                  })),
                },
              }
            : {}),
        },
        include: this.include(),
      });
    });
    return this.map(row);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.travelExpenseReport.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Авансовый отчет не найден');
    if (existing.status === ApprovalStatus.approved) {
      throw new BadRequestException('Завершённый отчет нельзя удалить');
    }
    await this.prisma.travelExpenseReport.delete({ where: { id } });
    return { ok: true };
  }

  async complete(tenantId: string, id: string) {
    const existing = await this.prisma.travelExpenseReport.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Авансовый отчет не найден');
    if (existing.status === ApprovalStatus.approved) {
      throw new BadRequestException('Отчет уже завершён');
    }
    if (existing.calcForSalary) {
      const d = existing.docDate;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      await this.prisma.$transaction(async (tx) => {
        let period = await tx.payrollPeriod.findFirst({ where: { tenantId, year, month } });
        if (!period) {
          period = await tx.payrollPeriod.create({
            data: { tenantId, year, month, note: 'Auto-created from travel expense' },
          });
        }
        if (period.status !== 'closed') {
          const amount = n(existing.amount);
          if (amount > 0) {
            await tx.payrollLine.create({
              data: {
                tenantId,
                periodId: period.id,
                employeeId: existing.employeeId,
                type: PayrollLineType.one_time,
                status: DocumentLifecycle.posted,
                postedAt: new Date(),
                amount: new Prisma.Decimal(amount),
                description: `Travel expense ${existing.number}`,
              },
            });
          }
        }
        await tx.travelExpenseReport.update({
          where: { id },
          data: { status: ApprovalStatus.approved },
        });
      });
    } else {
      await this.prisma.travelExpenseReport.update({
        where: { id },
        data: { status: ApprovalStatus.approved },
      });
    }
    return this.get(tenantId, id);
  }

  private async assertEmployee(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Сотрудник не найден');
  }
}
