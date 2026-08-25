import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentStatus,
  PayrollSheetKind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSheetDto,
  FillSheetDto,
  SheetLineDto,
  UpdateSheetDto,
  UpdateSheetSettingsDto,
} from './vedomost.dto';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function day(iso?: string | null): Date {
  const s = (iso || new Date().toISOString()).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

function firstOfMonth(iso?: string | null): Date {
  const d = day(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function empLabel(e: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  tabNumber?: string;
}) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ') || e.tabNumber || '—';
}

const EMP_SELECT = {
  id: true,
  tabNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
  baseSalary: true,
} as const;

@Injectable()
export class VedomostService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: { employee: { select: EMP_SELECT } },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private map(row: {
    totalAmount: unknown;
    lines?: Array<Record<string, unknown> & { debt: unknown; limitAmount: unknown; accruedAdvance: unknown; amount: unknown; employee?: unknown }>;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      totalAmount: n(row.totalAmount),
      lines: (row.lines || []).map((l) => ({
        ...l,
        debt: n(l.debt),
        limitAmount: n(l.limitAmount),
        accruedAdvance: n(l.accruedAdvance),
        amount: n(l.amount),
        employee: l.employee
          ? { ...(l.employee as object), label: empLabel(l.employee as never) }
          : null,
      })),
    };
  }

  private async actorName(userId?: string | null) {
    if (!userId) return 'Система';
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    return u?.fullName || u?.email || 'Система';
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.payrollSheet.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private async audit(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    sheetId: string | null,
    eventType: string,
    userName: string,
  ) {
    await tx.payrollSheetAudit.create({
      data: { tenantId, sheetId: sheetId || undefined, eventType, userName },
    });
  }

  private totals(lines: SheetLineDto[], enableLimit: boolean) {
    return lines.reduce((s, l) => {
      let amt = n(l.amount);
      if (enableLimit && n(l.limitAmount) > 0) amt = Math.min(amt, n(l.limitAmount));
      return s + amt;
    }, 0);
  }

  async list(tenantId: string) {
    const rows = await this.prisma.payrollSheet.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.payrollSheet.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Ведомость не найдена');
    return this.map(row);
  }

  async fill(tenantId: string, dto: FillSheetDto) {
    const month = firstOfMonth(dto.month);
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const settings = await this.getSettings(tenantId);
    const emps = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: EmploymentStatus.active,
        ...(dto.divisionId ? { divisionId: dto.divisionId } : {}),
      },
      select: EMP_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    });

    const percent = n(settings.percent) / 100;
    const lines: SheetLineDto[] = [];
    for (const e of emps) {
      const salary = n(e.baseSalary);
      let amount = 0;
      let accruedAdvance = 0;
      let debt = 0;
      if (dto.kind === 'advance_salary') {
        accruedAdvance = Math.round(salary * percent * 100) / 100;
        amount = accruedAdvance;
        if (settings.countPaidAdvances) {
          const paid = await this.prisma.payrollAdvance.aggregate({
            where: {
              tenantId,
              employeeId: e.id,
              status: 'paid',
              paidAt: { gte: month, lt: next },
            },
            _sum: { amount: true },
          });
          amount = Math.max(0, amount - n(paid._sum.amount));
        }
      } else if (dto.forMonth) {
        const sum = await this.prisma.payrollAccrualLine.aggregate({
          where: {
            employeeId: e.id,
            doc: {
              tenantId,
              month,
              ...(settings.postedAccrualsOnly ? { status: 'posted' } : {}),
            },
          },
          _sum: { toPay: true },
        });
        amount = n(sum._sum.toPay);
        debt = amount;
      }
      lines.push({
        employeeId: e.id,
        debt,
        limitAmount: n(settings.monthlyDayLimit),
        accruedAdvance,
        amount,
        note: settings.generateNote ? (dto.kind === 'advance_salary' ? 'Аванс' : 'Ведомость') : '',
      });
    }
    return {
      lines: lines.map((l) => {
        const e = emps.find((x) => x.id === l.employeeId);
        return { ...l, employee: e ? { ...e, label: empLabel(e) } : null };
      }),
    };
  }

  private assertPayTarget(payType: string | undefined, cashbox?: string | null, bankAccount?: string | null) {
    const t = payType || 'cash';
    if (t === 'bank' && !bankAccount?.trim()) throw new BadRequestException('Укажите расчетный счет');
    if (t !== 'bank' && !cashbox?.trim()) throw new BadRequestException('Укажите кассу');
  }

  async create(tenantId: string, dto: CreateSheetDto, userId?: string) {
    this.assertPayTarget(dto.payType, dto.cashbox, dto.bankAccount);
    const userName = await this.actorName(userId);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const lines = dto.lines || [];
    const enableLimit = dto.enableLimit === true;
    const totalAmount = this.totals(lines, enableLimit);
    const row = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.payrollSheet.create({
        data: {
          tenantId,
          kind: dto.kind,
          payType: dto.payType || 'cash',
          month: firstOfMonth(dto.month),
          issueDate: day(dto.issueDate),
          number,
          divisionId: dto.divisionId || null,
          cashbox: dto.cashbox?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
          currency: dto.currency || 'UZS',
          note: dto.note?.trim() || null,
          rounding: dto.rounding || '###.000000',
          enableLimit,
          totalAmount,
          createdByName: userName,
          lines: {
            create: lines.map((l, i) => ({
              employeeId: l.employeeId,
              debt: n(l.debt),
              limitAmount: n(l.limitAmount),
              accruedAdvance: n(l.accruedAdvance),
              amount: n(l.amount),
              note: l.note || null,
              bank: l.bank || null,
              bankCode: l.bankCode || null,
              settlementAccount: l.settlementAccount || null,
              sortOrder: i,
            })),
          },
        },
      });
      await this.audit(tx, tenantId, doc.id, 'Добавлен', userName);
      return tx.payrollSheet.findFirst({ where: { id: doc.id }, include: this.include() });
    });
    return this.map(row!);
  }

  async update(tenantId: string, id: string, dto: UpdateSheetDto, userId?: string) {
    const existing = await this.prisma.payrollSheet.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ведомость не найдена');
    if (existing.status !== 'draft') throw new BadRequestException('Завершённый документ нельзя изменить');
    const payType = dto.payType ?? existing.payType;
    const cashbox = dto.cashbox === undefined ? existing.cashbox : dto.cashbox;
    const bankAccount = dto.bankAccount === undefined ? existing.bankAccount : dto.bankAccount;
    this.assertPayTarget(payType, cashbox, bankAccount);
    const userName = await this.actorName(userId);
    const lines = dto.lines;
    const enableLimit = dto.enableLimit ?? existing.enableLimit;
    const totalAmount = lines ? this.totals(lines, enableLimit) : undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.payrollSheetLine.deleteMany({ where: { sheetId: id } });
        if (lines.length) {
          await tx.payrollSheetLine.createMany({
            data: lines.map((l, i) => ({
              sheetId: id,
              employeeId: l.employeeId,
              debt: n(l.debt),
              limitAmount: n(l.limitAmount),
              accruedAdvance: n(l.accruedAdvance),
              amount: n(l.amount),
              note: l.note || null,
              bank: l.bank || null,
              bankCode: l.bankCode || null,
              settlementAccount: l.settlementAccount || null,
              sortOrder: i,
            })),
          });
        }
      }
      await tx.payrollSheet.update({
        where: { id },
        data: {
          month: dto.month ? firstOfMonth(dto.month) : undefined,
          issueDate: dto.issueDate ? day(dto.issueDate) : undefined,
          payType: dto.payType,
          number: dto.number?.trim() || undefined,
          divisionId: dto.divisionId === undefined ? undefined : dto.divisionId || null,
          cashbox: dto.cashbox === undefined ? undefined : dto.cashbox?.trim() || null,
          bankAccount: dto.bankAccount === undefined ? undefined : dto.bankAccount?.trim() || null,
          currency: dto.currency,
          note: dto.note === undefined ? undefined : dto.note?.trim() || null,
          rounding: dto.rounding,
          enableLimit: dto.enableLimit,
          totalAmount,
        },
      });
      await this.audit(tx, tenantId, id, 'Обновлен', userName);
      return tx.payrollSheet.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async complete(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.payrollSheet.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Ведомость не найдена');
    if (existing.status === 'completed') throw new BadRequestException('Уже завершена');
    const userName = await this.actorName(userId);
    const year = existing.month.getUTCFullYear();
    const month = existing.month.getUTCMonth() + 1;
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.kind === PayrollSheetKind.advance_salary) {
        let period = await tx.payrollPeriod.findFirst({ where: { tenantId, year, month } });
        if (!period) {
          period = await tx.payrollPeriod.create({ data: { tenantId, year, month } });
        }
        for (const l of existing.lines) {
          if (n(l.amount) <= 0) continue;
          await tx.payrollAdvance.create({
            data: {
              tenantId,
              periodId: period.id,
              employeeId: l.employeeId,
              amount: l.amount,
              status: 'paid',
              paidAt: existing.issueDate,
              note: l.note || existing.note || 'Аванс по официальному окладу',
              sourceSheetId: id,
            },
          });
        }
      }
      await tx.payrollSheet.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await this.audit(tx, tenantId, id, 'Завершен', userName);
      return tx.payrollSheet.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async reopen(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.payrollSheet.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ведомость не найдена');
    if (existing.status !== 'completed') throw new BadRequestException('Документ не завершён');
    const userName = await this.actorName(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.payrollAdvance.deleteMany({ where: { sourceSheetId: id } });
      await tx.payrollSheet.update({
        where: { id },
        data: { status: 'draft', completedAt: null },
      });
      await this.audit(tx, tenantId, id, 'Отменен', userName);
      return tx.payrollSheet.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.payrollSheet.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ведомость не найдена');
    if (existing.status !== 'draft') throw new BadRequestException('Сначала откройте документ');
    await this.prisma.payrollSheet.delete({ where: { id } });
    return { ok: true };
  }

  async history(
    tenantId: string,
    q?: { sheetId?: string; from?: string; to?: string; search?: string },
  ) {
    const where: Prisma.PayrollSheetAuditWhereInput = { tenantId };
    if (q?.sheetId) where.sheetId = q.sheetId;
    if (q?.from || q?.to) {
      where.occurredAt = {};
      if (q.from) where.occurredAt.gte = day(q.from);
      if (q.to) {
        const t = day(q.to);
        t.setUTCHours(23, 59, 59, 999);
        where.occurredAt.lte = t;
      }
    }
    if (q?.search) {
      where.OR = [
        { userName: { contains: q.search, mode: 'insensitive' } },
        { eventType: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.payrollSheetAudit.findMany({
      where,
      include: { sheet: { select: { id: true, number: true, kind: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  async getSettings(tenantId: string) {
    const row = await this.prisma.payrollSheetSetting.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
    });
    return {
      ...row,
      monthlyDayLimit: n(row.monthlyDayLimit),
      percent: n(row.percent),
      deductionPercent: n(row.deductionPercent),
    };
  }

  async updateSettings(tenantId: string, dto: UpdateSheetSettingsDto) {
    await this.getSettings(tenantId);
    const row = await this.prisma.payrollSheetSetting.update({
      where: { tenantId },
      data: {
        rounding: dto.rounding,
        countPaidAdvances: dto.countPaidAdvances,
        generateNote: dto.generateNote,
        monthlyDayLimit: dto.monthlyDayLimit,
        percent: dto.percent,
        deductionPercent: dto.deductionPercent,
        postedAccrualsOnly: dto.postedAccrualsOnly,
        postedDeductionsOnly: dto.postedDeductionsOnly,
      },
    });
    return {
      ...row,
      monthlyDayLimit: n(row.monthlyDayLimit),
      percent: n(row.percent),
      deductionPercent: n(row.deductionPercent),
    };
  }
}
