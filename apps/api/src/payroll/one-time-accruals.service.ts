import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentLifecycle, EmploymentStatus, PayrollLineType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalculateOneTimeAccrualDto,
  CreateOneTimeAccrualDto,
  FillOneTimeAccrualDto,
  OneTimeLineDto,
  UpdateOneTimeAccrualDto,
} from './one-time-accruals.dto';

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
  tabNumber?: string;
}) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ') || e.tabNumber || '—';
}

function parseFormulaPercent(formula?: string | null): number | null {
  const s = String(formula || '').trim();
  if (!s) return null;
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (m) return Number(m[1]);
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return null;
}

const EMP_SELECT = {
  id: true,
  tabNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
  divisionId: true,
  positionId: true,
  baseSalary: true,
  position: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OneTimeAccrualsService {
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
    percent: unknown;
    totalAmount: unknown;
    attachments?: unknown;
    lines?: Array<
      Record<string, unknown> & {
        amount: unknown;
        employee?: {
          lastName: string;
          firstName: string;
          middleName?: string | null;
          tabNumber?: string;
        } | null;
      }
    >;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      percent: n(row.percent),
      totalAmount: n(row.totalAmount),
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      lines: (row.lines || []).map((l) => ({
        ...l,
        amount: n(l.amount),
        employee: l.employee ? { ...l.employee, label: empLabel(l.employee) } : null,
      })),
    };
  }

  private kind(v?: string | null) {
    return v === 'deduction' ? 'deduction' : 'accrual';
  }

  private calcType(v?: string | null) {
    if (v === 'percent' || v === 'formula') return v;
    return 'value';
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.oneTimeAccrualDoc.count({ where: { tenantId } });
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

  private async lineAmounts(
    tenantId: string,
    calcType: string,
    percent: number,
    formula: string | null,
    lines: OneTimeLineDto[],
  ) {
    const empIds = [...new Set(lines.map((l) => l.employeeId).filter(Boolean))];
    const emps = empIds.length
      ? await this.prisma.employee.findMany({
          where: { tenantId, id: { in: empIds } },
          select: { id: true, baseSalary: true },
        })
      : [];
    const salary = new Map(emps.map((e) => [e.id, n(e.baseSalary)]));
    const pct = calcType === 'formula' ? parseFormulaPercent(formula) ?? percent : percent;
    return lines.map((l) => {
      if (calcType === 'value') return n(l.amount);
      const base = salary.get(l.employeeId) || 0;
      return Math.round(((base * n(pct)) / 100) * 100) / 100;
    });
  }

  async list(tenantId: string, kind?: string) {
    const rows = await this.prisma.oneTimeAccrualDoc.findMany({
      where: { tenantId, ...(kind === 'accrual' || kind === 'deduction' ? { kind } : {}) },
      include: this.include(),
      orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.oneTimeAccrualDoc.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Документ не найден');
    return this.map(row);
  }

  async create(tenantId: string, dto: CreateOneTimeAccrualDto, userId?: string) {
    const lines = (dto.lines || []).filter((l) => l.employeeId);
    const calcType = this.calcType(dto.calcType);
    const amounts = await this.lineAmounts(
      tenantId,
      calcType,
      n(dto.percent),
      dto.formula || null,
      lines,
    );
    const totalAmount = amounts.reduce((s, a) => s + a, 0);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.oneTimeAccrualDoc.create({
      data: {
        tenantId,
        kind: this.kind(dto.kind),
        number,
        docDate: day(dto.docDate),
        month: day(dto.month),
        title: dto.title?.trim() || null,
        divisionId: dto.divisionId || null,
        basis: dto.basis?.trim() || null,
        note: dto.note?.trim() || null,
        currency: dto.currency?.trim() || 'UZS',
        calcType,
        percent: n(dto.percent),
        formula: dto.formula?.trim() || null,
        useOneForAll: Boolean(dto.useOneForAll),
        attachments: (dto.attachments || []) as unknown as Prisma.InputJsonValue,
        totalAmount,
        createdByName: await this.actorName(userId),
        lines: {
          create: lines.map((l, i) => ({
            employeeId: l.employeeId,
            typeId: l.typeId || null,
            typeName: l.typeName?.trim() || null,
            lineDate: l.lineDate ? day(l.lineDate) : null,
            amount: amounts[i],
            note: l.note?.trim() || null,
            sortOrder: i,
          })),
        },
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdateOneTimeAccrualDto) {
    const existing = await this.prisma.oneTimeAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя изменить');
    }
    const calcType = dto.calcType ? this.calcType(dto.calcType) : existing.calcType;
    const percent = dto.percent != null ? n(dto.percent) : n(existing.percent);
    const formula = dto.formula !== undefined ? dto.formula?.trim() || null : existing.formula;
    const lines = dto.lines ? dto.lines.filter((l) => l.employeeId) : null;
    const amounts = lines ? await this.lineAmounts(tenantId, calcType, percent, formula, lines) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) await tx.oneTimeAccrualLine.deleteMany({ where: { docId: id } });
      return tx.oneTimeAccrualDoc.update({
        where: { id },
        data: {
          kind: dto.kind ? this.kind(dto.kind) : undefined,
          number: dto.number?.trim() || undefined,
          docDate: dto.docDate ? day(dto.docDate) : undefined,
          month: dto.month ? day(dto.month) : undefined,
          title: dto.title !== undefined ? dto.title.trim() || null : undefined,
          divisionId: dto.divisionId !== undefined ? dto.divisionId || null : undefined,
          basis: dto.basis !== undefined ? dto.basis.trim() || null : undefined,
          note: dto.note !== undefined ? dto.note.trim() || null : undefined,
          currency: dto.currency?.trim() || undefined,
          calcType: dto.calcType ? calcType : undefined,
          percent: dto.percent != null ? percent : undefined,
          formula: dto.formula !== undefined ? formula : undefined,
          useOneForAll: dto.useOneForAll != null ? Boolean(dto.useOneForAll) : undefined,
          attachments:
            dto.attachments !== undefined
              ? ((dto.attachments || []) as unknown as Prisma.InputJsonValue)
              : undefined,
          ...(amounts && lines
            ? {
                totalAmount: amounts.reduce((s, a) => s + a, 0),
                lines: {
                  create: lines.map((l, i) => ({
                    employeeId: l.employeeId,
                    typeId: l.typeId || null,
                    typeName: l.typeName?.trim() || null,
                    lineDate: l.lineDate ? day(l.lineDate) : null,
                    amount: amounts[i],
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
    const existing = await this.prisma.oneTimeAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя удалить');
    }
    await this.prisma.oneTimeAccrualDoc.delete({ where: { id } });
    return { ok: true };
  }

  async fill(tenantId: string, dto: FillOneTimeAccrualDto) {
    const where: Prisma.EmployeeWhereInput = { tenantId, status: EmploymentStatus.active };
    if (dto.divisionId) where.divisionId = dto.divisionId;
    if (dto.employeeIds?.length) where.id = { in: dto.employeeIds };
    if (dto.initiators) {
      const managers = await this.prisma.division.findMany({
        where: { tenantId, managerId: { not: null } },
        select: { managerId: true },
      });
      const ids = [...new Set(managers.map((d) => d.managerId).filter(Boolean))] as string[];
      where.id = dto.employeeIds?.length ? { in: dto.employeeIds.filter((id) => ids.includes(id)) } : { in: ids };
    }

    const emps = await this.prisma.employee.findMany({
      where,
      select: EMP_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    });

    let typeName = dto.typeName || null;
    let typeId = dto.typeId || null;
    if (dto.useOneForAll && !typeId) {
      if (this.kind(dto.kind) === 'deduction') {
        const t = await this.prisma.deductionType.findFirst({
          where: { tenantId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        typeId = t?.id || null;
        typeName = t?.name || null;
      } else {
        const t = await this.prisma.accrualType.findFirst({
          where: { tenantId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        typeId = t?.id || null;
        typeName = t?.name || null;
      }
    }

    return {
      lines: emps.map((e, i) => ({
        employeeId: e.id,
        employee: { ...e, label: empLabel(e) },
        typeId,
        typeName,
        lineDate: dto.lineDate || null,
        amount: 0,
        note: '',
        sortOrder: i,
      })),
    };
  }

  async calculate(tenantId: string, dto: CalculateOneTimeAccrualDto) {
    const calcType = this.calcType(dto.calcType);
    const lines = dto.lines || [];
    const amounts = await this.lineAmounts(tenantId, calcType, n(dto.percent), dto.formula || null, lines);
    return {
      totalAmount: amounts.reduce((s, a) => s + a, 0),
      lines: lines.map((l, i) => ({ ...l, amount: amounts[i] })),
    };
  }

  async post(tenantId: string, id: string) {
    const row = await this.prisma.oneTimeAccrualDoc.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status === DocumentLifecycle.posted) throw new BadRequestException('Документ уже проведён');
    if (row.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Отменённый документ нельзя провести');
    }
    const year = row.month.getUTCFullYear();
    const month = row.month.getUTCMonth() + 1;
    const lineType = row.kind === 'deduction' ? PayrollLineType.deduction : PayrollLineType.one_time;
    const desc = `One-time ${row.kind} ${row.number}`;

    await this.prisma.$transaction(async (tx) => {
      let period = await tx.payrollPeriod.findFirst({ where: { tenantId, year, month } });
      if (!period) {
        period = await tx.payrollPeriod.create({
          data: { tenantId, year, month, note: 'Auto-created from one-time accrual' },
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
              type: lineType,
              status: DocumentLifecycle.posted,
              postedAt: new Date(),
              amount: new Prisma.Decimal(amount),
              description: desc,
            },
          });
        }
      }
      await tx.oneTimeAccrualDoc.update({
        where: { id },
        data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      });
    });
    return this.get(tenantId, id);
  }

  async unpost(tenantId: string, id: string) {
    const row = await this.prisma.oneTimeAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status !== DocumentLifecycle.posted) throw new BadRequestException('Документ не проведён');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.deleteMany({
        where: { tenantId, description: `One-time ${row.kind} ${row.number}` },
      });
      await tx.oneTimeAccrualDoc.update({
        where: { id },
        data: { status: DocumentLifecycle.draft, postedAt: null },
      });
    });
    return this.get(tenantId, id);
  }
}
