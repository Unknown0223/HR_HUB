import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentLifecycle, EmploymentStatus, PayrollLineType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSalesAccrualDto,
  FillSalesAccrualDto,
  SalesAccrualLineDto,
  SaveSalesRatesDto,
  UpdateSalesAccrualDto,
} from './sales-accruals.dto';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function roundingScale(mask?: string | null): number {
  const m = String(mask || '####.000000');
  const i = m.indexOf('.');
  if (i < 0) return 0;
  return m.slice(i + 1).replace(/[^0#]/g, '').length;
}

function roundByMask(value: number, mask?: string | null): number {
  const s = roundingScale(mask);
  const f = 10 ** s;
  return Math.round(n(value) * f) / f;
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
  divisionId: true,
  positionId: true,
  position: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class SalesAccrualsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      division: { select: { id: true, name: true, code: true } },
      position: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          employee: { select: EMP_SELECT },
          position: { select: { id: true, name: true, code: true } },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private map(row: {
    totalSales: unknown;
    totalAmount: unknown;
    lines?: Array<
      Record<string, unknown> & {
        percent: unknown;
        salesAmount: unknown;
        amount: unknown;
        employee?: {
          lastName: string;
          firstName: string;
          middleName?: string | null;
          tabNumber?: string;
          position?: { name: string } | null;
        } | null;
        position?: { name: string } | null;
      }
    >;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      totalSales: n(row.totalSales),
      totalAmount: n(row.totalAmount),
      lines: (row.lines || []).map((l) => ({
        ...l,
        percent: n(l.percent),
        salesAmount: n(l.salesAmount),
        amount: n(l.amount),
        employee: l.employee
          ? { ...l.employee, label: empLabel(l.employee) }
          : null,
        positionName: l.position?.name || l.employee?.position?.name || '—',
      })),
    };
  }

  private calcLine(line: SalesAccrualLineDto, rounding: string) {
    const percent = n(line.percent);
    const salesAmount = n(line.salesAmount);
    const amount =
      line.amount != null && Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0
        ? roundByMask(Number(line.amount), rounding)
        : roundByMask((salesAmount * percent) / 100, rounding);
    return { percent, salesAmount, amount };
  }

  private totals(lines: SalesAccrualLineDto[], rounding: string) {
    let totalSales = 0;
    let totalAmount = 0;
    const mapped = lines.map((l) => {
      const c = this.calcLine(l, rounding);
      totalSales += c.salesAmount;
      totalAmount += c.amount;
      return c;
    });
    return {
      lines: mapped,
      totalSales: roundByMask(totalSales, rounding),
      totalAmount: roundByMask(totalAmount, rounding),
    };
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.salesCommissionAccrual.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private async actorName(userId?: string | null) {
    if (!userId) return 'Система';
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    return u?.fullName || u?.email || 'Система';
  }

  private validateHeader(dto: { paymentType?: string; cashbox?: string; bankAccount?: string }) {
    const pay = dto.paymentType === 'bank' ? 'bank' : 'cash';
    if (pay === 'cash' && !String(dto.cashbox || '').trim()) {
      throw new BadRequestException('Укажите кассу');
    }
    if (pay === 'bank' && !String(dto.bankAccount || '').trim()) {
      throw new BadRequestException('Укажите расчетный счет');
    }
  }

  private async ratesMap(tenantId: string) {
    const rows = await this.prisma.salesCommissionPolicy.findMany({ where: { tenantId } });
    const map = new Map<string, { personal: number; division: number }>();
    for (const r of rows) {
      if (!r.positionId) continue;
      map.set(r.positionId, {
        personal: n(r.personalPercent),
        division: n(r.divisionPercent),
      });
    }
    return map;
  }

  async list(tenantId: string) {
    const rows = await this.prisma.salesCommissionAccrual.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Документ не найден');
    return this.map(row);
  }

  async create(tenantId: string, dto: CreateSalesAccrualDto, userId?: string) {
    this.validateHeader(dto);
    const rounding = dto.rounding || '####.000000';
    const lines = (dto.lines || []).filter((l) => l.employeeId);
    const tot = this.totals(lines, rounding);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.salesCommissionAccrual.create({
      data: {
        tenantId,
        number,
        docDate: day(dto.docDate),
        periodFrom: day(dto.periodFrom),
        periodTo: day(dto.periodTo),
        title: dto.title?.trim() || null,
        paymentType: dto.paymentType === 'bank' ? 'bank' : 'cash',
        salesKind: dto.salesKind === 'division' ? 'division' : 'personal',
        divisionId: dto.divisionId || null,
        positionId: dto.positionId || null,
        cashbox: dto.cashbox?.trim() || null,
        bankAccount: dto.bankAccount?.trim() || null,
        rounding,
        note: dto.note?.trim() || null,
        totalSales: tot.totalSales,
        totalAmount: tot.totalAmount,
        createdByName: await this.actorName(userId),
        lines: {
          create: lines.map((l, i) => ({
            employeeId: l.employeeId,
            positionId: l.positionId || null,
            salesKind: l.salesKind === 'division' ? 'division' : 'personal',
            percent: tot.lines[i].percent,
            salesAmount: tot.lines[i].salesAmount,
            amount: tot.lines[i].amount,
            sortOrder: i,
          })),
        },
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdateSalesAccrualDto) {
    const existing = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя изменить');
    }
    const paymentType = dto.paymentType ?? existing.paymentType;
    const cashbox = dto.cashbox !== undefined ? dto.cashbox : existing.cashbox;
    const bankAccount = dto.bankAccount !== undefined ? dto.bankAccount : existing.bankAccount;
    this.validateHeader({ paymentType, cashbox: cashbox || undefined, bankAccount: bankAccount || undefined });
    const rounding = dto.rounding || existing.rounding;
    const lines = dto.lines ? dto.lines.filter((l) => l.employeeId) : null;
    const tot = lines ? this.totals(lines, rounding) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.salesCommissionLine.deleteMany({ where: { docId: id } });
      }
      return tx.salesCommissionAccrual.update({
        where: { id },
        data: {
          number: dto.number?.trim() || undefined,
          docDate: dto.docDate ? day(dto.docDate) : undefined,
          periodFrom: dto.periodFrom ? day(dto.periodFrom) : undefined,
          periodTo: dto.periodTo ? day(dto.periodTo) : undefined,
          title: dto.title !== undefined ? dto.title.trim() || null : undefined,
          paymentType: dto.paymentType === 'bank' ? 'bank' : dto.paymentType === 'cash' ? 'cash' : undefined,
          salesKind:
            dto.salesKind === 'division' ? 'division' : dto.salesKind === 'personal' ? 'personal' : undefined,
          divisionId: dto.divisionId !== undefined ? dto.divisionId || null : undefined,
          positionId: dto.positionId !== undefined ? dto.positionId || null : undefined,
          cashbox: dto.cashbox !== undefined ? dto.cashbox.trim() || null : undefined,
          bankAccount: dto.bankAccount !== undefined ? dto.bankAccount.trim() || null : undefined,
          rounding,
          note: dto.note !== undefined ? dto.note.trim() || null : undefined,
          ...(tot
            ? {
                totalSales: tot.totalSales,
                totalAmount: tot.totalAmount,
                lines: {
                  create: lines!.map((l, i) => ({
                    employeeId: l.employeeId,
                    positionId: l.positionId || null,
                    salesKind: l.salesKind === 'division' ? 'division' : 'personal',
                    percent: tot.lines[i].percent,
                    salesAmount: tot.lines[i].salesAmount,
                    amount: tot.lines[i].amount,
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
    const existing = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя удалить');
    }
    await this.prisma.salesCommissionAccrual.delete({ where: { id } });
    return { ok: true };
  }

  async fill(tenantId: string, dto: FillSalesAccrualDto) {
    const salesKind = dto.salesKind === 'division' ? 'division' : 'personal';
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: EmploymentStatus.active,
    };
    if (dto.divisionId) where.divisionId = dto.divisionId;
    if (dto.positionId) where.positionId = dto.positionId;
    if (dto.employeeIds?.length) where.id = { in: dto.employeeIds };

    const [emps, rates] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: EMP_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 500,
      }),
      this.ratesMap(tenantId),
    ]);

    return {
      lines: emps.map((e, i) => {
        const rate = e.positionId ? rates.get(e.positionId) : undefined;
        const percent = salesKind === 'division' ? rate?.division || 0 : rate?.personal || 0;
        return {
          employeeId: e.id,
          employee: { ...e, label: empLabel(e) },
          positionId: e.positionId,
          positionName: e.position?.name || '—',
          salesKind,
          percent,
          salesAmount: 0,
          amount: 0,
          sortOrder: i,
        };
      }),
    };
  }

  async calculate(tenantId: string, dto: { rounding?: string; lines?: SalesAccrualLineDto[] }) {
    const rounding = dto.rounding || '####.000000';
    const tot = this.totals(dto.lines || [], rounding);
    return {
      rounding,
      totalSales: tot.totalSales,
      totalAmount: tot.totalAmount,
      lines: (dto.lines || []).map((l, i) => ({
        ...l,
        ...tot.lines[i],
      })),
    };
  }

  async post(tenantId: string, id: string) {
    const row = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Документ уже проведён');
    }
    if (row.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Отменённый документ нельзя провести');
    }
    this.validateHeader({
      paymentType: row.paymentType,
      cashbox: row.cashbox || undefined,
      bankAccount: row.bankAccount || undefined,
    });
    const year = row.periodFrom.getUTCFullYear();
    const month = row.periodFrom.getUTCMonth() + 1;

    await this.prisma.$transaction(async (tx) => {
      let period = await tx.payrollPeriod.findFirst({ where: { tenantId, year, month } });
      if (!period) {
        period = await tx.payrollPeriod.create({
          data: { tenantId, year, month, note: 'Auto-created from sales accrual' },
        });
      }
      if (period.status !== 'closed') {
        for (const line of row.lines) {
          const amount = n(line.amount);
          if (!(amount > 0)) continue;
          await tx.payrollLine.create({
            data: {
              tenantId,
              periodId: period.id,
              employeeId: line.employeeId,
              type: PayrollLineType.bonus,
              status: DocumentLifecycle.posted,
              postedAt: new Date(),
              amount: new Prisma.Decimal(amount),
              description: `Sales commission ${row.number}`,
            },
          });
        }
      }
      await tx.salesCommissionAccrual.update({
        where: { id },
        data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      });
    });
    return this.get(tenantId, id);
  }

  async unpost(tenantId: string, id: string) {
    const row = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status !== DocumentLifecycle.posted) {
      throw new BadRequestException('Документ не проведён');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.deleteMany({
        where: { tenantId, description: `Sales commission ${row.number}` },
      });
      await tx.salesCommissionAccrual.update({
        where: { id },
        data: { status: DocumentLifecycle.draft, postedAt: null },
      });
    });
    return this.get(tenantId, id);
  }

  async listRates(tenantId: string) {
    const [positions, rates] = await Promise.all([
      this.prisma.position.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.salesCommissionPolicy.findMany({ where: { tenantId } }),
    ]);
    const map = new Map(rates.map((r) => [r.positionId, r]));
    return positions.map((p, i) => {
      const r = map.get(p.id);
      return {
        id: r?.id || p.id,
        positionId: p.id,
        positionName: p.name,
        positionCode: p.code,
        personalPercent: r ? n(r.personalPercent) : 0,
        divisionPercent: r ? n(r.divisionPercent) : 0,
        sortOrder: i + 1,
      };
    });
  }

  async saveRates(tenantId: string, dto: SaveSalesRatesDto) {
    await this.prisma.$transaction(
      (dto.rows || []).map((row) =>
        this.prisma.salesCommissionPolicy.upsert({
          where: { tenantId_positionId: { tenantId, positionId: row.positionId } },
          create: {
            tenantId,
            positionId: row.positionId,
            personalPercent: n(row.personalPercent),
            divisionPercent: n(row.divisionPercent),
          },
          update: {
            personalPercent: n(row.personalPercent),
            divisionPercent: n(row.divisionPercent),
            isActive: true,
          },
        }),
      ),
    );
    return this.listRates(tenantId);
  }
}
