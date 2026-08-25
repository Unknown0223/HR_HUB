import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentLifecycle, EmploymentStatus, PayrollLineType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BonusAccrualLineDto,
  CreateBonusAccrualDto,
  FillBonusAccrualDto,
  UpdateBonusAccrualDto,
} from './bonus-accruals.dto';

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

function kindOf(v?: string | null): 'fact' | 'kpi' {
  return v === 'kpi' ? 'kpi' : 'fact';
}

function payrollDesc(kind: string, number: string) {
  return `Bonus ${kind} ${number}`;
}

const EMP_SELECT = {
  id: true,
  tabNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
  divisionId: true,
  baseSalary: true,
} as const;

@Injectable()
export class BonusAccrualsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      division: { select: { id: true, name: true, code: true } },
      factType: { select: { id: true, name: true, accrualName: true } },
      lines: {
        include: { employee: { select: EMP_SELECT } },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private map(row: {
    totalAmount: unknown;
    lines?: Array<{
      amount: unknown;
      employee?: {
        lastName: string;
        firstName: string;
        middleName?: string | null;
        tabNumber?: string | null;
      } | null;
    }>;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      totalAmount: n(row.totalAmount),
      lines: (row.lines || []).map((l) => ({
        ...l,
        amount: n(l.amount),
        employee: l.employee ? { ...l.employee, label: empLabel(l.employee) } : null,
      })),
    };
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.bonusAccrualDoc.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private lineTotal(lines: BonusAccrualLineDto[]) {
    return lines.reduce((s, l) => s + n(l.amount), 0);
  }

  private lineCreates(lines: BonusAccrualLineDto[]) {
    return lines.map((l, i) => ({
      employeeId: l.employeeId,
      typeName: l.typeName?.trim() || null,
      accrualName: l.accrualName?.trim() || null,
      startDate: l.startDate ? day(l.startDate) : null,
      endDate: l.endDate ? day(l.endDate) : null,
      amount: n(l.amount),
      sortOrder: i,
    }));
  }

  async list(tenantId: string, kind?: string) {
    const k = kind ? kindOf(kind) : undefined;
    const rows = await this.prisma.bonusAccrualDoc.findMany({
      where: { tenantId, ...(k ? { kind: k } : {}) },
      include: this.include(),
      orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.bonusAccrualDoc.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Документ не найден');
    return this.map(row);
  }

  private async assertDraft(tenantId: string, id: string) {
    const existing = await this.prisma.bonusAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя изменить');
    }
    return existing;
  }

  async create(tenantId: string, dto: CreateBonusAccrualDto) {
    const kind = kindOf(dto.kind);
    const lines = dto.lines || [];
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.bonusAccrualDoc.create({
      data: {
        tenantId,
        kind,
        number,
        docDate: day(dto.docDate),
        startDate: day(dto.startDate),
        endDate: day(dto.endDate),
        divisionId: dto.divisionId || null,
        factTypeId: kind === 'fact' ? dto.factTypeId || null : null,
        factTypeName: kind === 'fact' ? dto.factTypeName?.trim() || null : null,
        considerPayroll: kind === 'fact' ? Boolean(dto.considerPayroll) : false,
        note: dto.note?.trim() || null,
        totalAmount: this.lineTotal(lines),
        status: DocumentLifecycle.draft,
        lines: { create: this.lineCreates(lines) },
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdateBonusAccrualDto) {
    await this.assertDraft(tenantId, id);
    const lines = dto.lines;
    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) await tx.bonusAccrualLine.deleteMany({ where: { docId: id } });
      return tx.bonusAccrualDoc.update({
        where: { id },
        data: {
          kind: dto.kind ? kindOf(dto.kind) : undefined,
          number: dto.number?.trim() || undefined,
          docDate: dto.docDate ? day(dto.docDate) : undefined,
          startDate: dto.startDate ? day(dto.startDate) : undefined,
          endDate: dto.endDate ? day(dto.endDate) : undefined,
          divisionId: dto.divisionId !== undefined ? dto.divisionId || null : undefined,
          factTypeId: dto.factTypeId !== undefined ? dto.factTypeId || null : undefined,
          factTypeName: dto.factTypeName !== undefined ? dto.factTypeName?.trim() || null : undefined,
          considerPayroll: dto.considerPayroll != null ? Boolean(dto.considerPayroll) : undefined,
          note: dto.note !== undefined ? dto.note.trim() || null : undefined,
          ...(lines
            ? {
                totalAmount: this.lineTotal(lines),
                lines: { create: this.lineCreates(lines) },
              }
            : {}),
        },
        include: this.include(),
      });
    });
    return this.map(row);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.bonusAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Документ не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённый документ нельзя удалить');
    }
    await this.prisma.bonusAccrualDoc.delete({ where: { id } });
    return { ok: true };
  }

  async fill(tenantId: string, dto: FillBonusAccrualDto) {
    const kind = kindOf(dto.kind);
    const where: Prisma.EmployeeWhereInput = { tenantId, status: EmploymentStatus.active };
    if (dto.divisionId) where.divisionId = dto.divisionId;
    if (dto.employeeIds?.length) where.id = { in: dto.employeeIds };

    const emps = await this.prisma.employee.findMany({
      where,
      select: EMP_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    });

    let typeName = dto.factTypeName?.trim() || null;
    let accrualName = dto.accrualName?.trim() || null;
    if (dto.factTypeId) {
      const ft = await this.prisma.factType.findFirst({
        where: { id: dto.factTypeId, tenantId },
        select: { name: true, accrualName: true },
      });
      typeName = typeName || ft?.name || null;
      accrualName = accrualName || ft?.accrualName || null;
    }
    if (!accrualName) {
      const t = await this.prisma.accrualType.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      accrualName = t?.name || null;
    }

    return {
      lines: emps.map((e, i) => ({
        employeeId: e.id,
        employee: { ...e, label: empLabel(e) },
        typeName: kind === 'fact' ? typeName : null,
        accrualName,
        startDate: kind === 'kpi' ? dto.startDate || null : null,
        endDate: kind === 'kpi' ? dto.endDate || null : null,
        amount: dto.considerPayroll ? n(e.baseSalary) : 0,
        sortOrder: i,
      })),
    };
  }

  async post(tenantId: string, id: string) {
    const row = await this.prisma.bonusAccrualDoc.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status === DocumentLifecycle.posted) throw new BadRequestException('Документ уже проведён');
    const year = row.startDate.getUTCFullYear();
    const month = row.startDate.getUTCMonth() + 1;
    const desc = payrollDesc(row.kind, row.number);

    await this.prisma.$transaction(async (tx) => {
      let period = await tx.payrollPeriod.findFirst({ where: { tenantId, year, month } });
      if (!period) {
        period = await tx.payrollPeriod.create({
          data: { tenantId, year, month, note: 'Auto-created from bonus accrual' },
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
              description: desc,
            },
          });
        }
      }
      await tx.bonusAccrualDoc.update({
        where: { id },
        data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      });
    });
    return this.get(tenantId, id);
  }

  async unpost(tenantId: string, id: string) {
    const row = await this.prisma.bonusAccrualDoc.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Документ не найден');
    if (row.status !== DocumentLifecycle.posted) throw new BadRequestException('Документ не проведён');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.deleteMany({
        where: { tenantId, description: payrollDesc(row.kind, row.number) },
      });
      await tx.bonusAccrualDoc.update({
        where: { id },
        data: { status: DocumentLifecycle.draft, postedAt: null },
      });
    });
    return this.get(tenantId, id);
  }
}
