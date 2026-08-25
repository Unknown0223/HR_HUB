import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto, UpdateLoanDto } from './loans.dto';

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

const EMP_SELECT = {
  id: true,
  tabNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
} as const;

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      employee: { select: EMP_SELECT },
      payments: { orderBy: { paidAt: 'desc' as const } },
    };
  }

  private map(row: {
    principal: unknown;
    remaining: unknown;
    monthlyPayment?: unknown;
    employee?: {
      lastName: string;
      firstName: string;
      middleName?: string | null;
      tabNumber?: string | null;
    } | null;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      principal: n(row.principal),
      remaining: n(row.remaining),
      monthlyPayment: row.monthlyPayment == null ? null : n(row.monthlyPayment),
      employee: row.employee ? { ...row.employee, label: empLabel(row.employee) } : null,
    };
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.employeeLoan.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  async list(tenantId: string) {
    const rows = await this.prisma.employeeLoan.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: [{ loanDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.employeeLoan.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Заём не найден');
    return this.map(row);
  }

  async create(tenantId: string, dto: CreateLoanDto) {
    const principal = n(dto.principal);
    if (!(principal > 0)) throw new BadRequestException('Сумма должна быть больше 0');
    await this.assertEmployee(tenantId, dto.employeeId);
    const remaining = dto.remaining != null ? n(dto.remaining) : principal;
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.employeeLoan.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        number,
        loanDate: day(dto.loanDate),
        contractNumber: dto.contractNumber?.trim() || null,
        contractDate: dto.contractDate ? day(dto.contractDate) : null,
        currency: dto.currency?.trim() || 'UZS',
        principal,
        remaining,
        monthlyPayment: dto.monthlyPayment != null ? n(dto.monthlyPayment) : null,
        startDate: day(dto.startDate),
        endDate: dto.endDate ? day(dto.endDate) : null,
        status: LoanStatus.draft,
        note: dto.note?.trim() || null,
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdateLoanDto) {
    const existing = await this.prisma.employeeLoan.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Заём не найден');
    if (existing.status === LoanStatus.closed) {
      throw new BadRequestException('Закрытый заём нельзя изменить');
    }
    if (dto.employeeId) await this.assertEmployee(tenantId, dto.employeeId);
    const principal = dto.principal != null ? n(dto.principal) : n(existing.principal);
    if (dto.principal != null && !(principal > 0)) {
      throw new BadRequestException('Сумма должна быть больше 0');
    }
    let remaining = dto.remaining != null ? n(dto.remaining) : n(existing.remaining);
    if (dto.principal != null && dto.remaining == null && existing.status === LoanStatus.draft) {
      remaining = principal;
    }
    const row = await this.prisma.employeeLoan.update({
      where: { id },
      data: {
        number: dto.number?.trim() || undefined,
        loanDate: dto.loanDate ? day(dto.loanDate) : undefined,
        contractNumber: dto.contractNumber !== undefined ? dto.contractNumber.trim() || null : undefined,
        contractDate:
          dto.contractDate !== undefined ? (dto.contractDate ? day(dto.contractDate) : null) : undefined,
        employeeId: dto.employeeId || undefined,
        startDate: dto.startDate ? day(dto.startDate) : undefined,
        endDate: dto.endDate !== undefined ? (dto.endDate ? day(dto.endDate) : null) : undefined,
        principal: dto.principal != null ? principal : undefined,
        remaining: dto.remaining != null || dto.principal != null ? remaining : undefined,
        monthlyPayment: dto.monthlyPayment != null ? n(dto.monthlyPayment) : undefined,
        currency: dto.currency?.trim() || undefined,
        note: dto.note !== undefined ? dto.note.trim() || null : undefined,
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.employeeLoan.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Заём не найден');
    if (existing.status !== LoanStatus.draft) {
      throw new BadRequestException('Удалить можно только черновик');
    }
    await this.prisma.employeeLoan.delete({ where: { id } });
    return { ok: true };
  }

  async reopen(tenantId: string, id: string) {
    const existing = await this.prisma.employeeLoan.findFirst({
      where: { id, tenantId },
      include: { payments: { select: { id: true }, take: 1 } },
    });
    if (!existing) throw new NotFoundException('Заём не найден');
    if (existing.payments.length) {
      throw new BadRequestException('Есть платежи — нельзя вернуть в черновик');
    }
    const row = await this.prisma.employeeLoan.update({
      where: { id },
      data: { status: LoanStatus.draft },
      include: this.include(),
    });
    return this.map(row);
  }

  async complete(tenantId: string, id: string) {
    const existing = await this.prisma.employeeLoan.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Заём не найден');
    if (existing.status === LoanStatus.closed) {
      throw new BadRequestException('Закрытый заём нельзя завершить');
    }
    const row = await this.prisma.employeeLoan.update({
      where: { id },
      data: { status: LoanStatus.active },
      include: this.include(),
    });
    return this.map(row);
  }

  async close(tenantId: string, id: string) {
    const existing = await this.prisma.employeeLoan.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Заём не найден');
    if (existing.status === LoanStatus.closed) {
      throw new BadRequestException('Заём уже закрыт');
    }
    const row = await this.prisma.employeeLoan.update({
      where: { id },
      data: { status: LoanStatus.closed },
      include: this.include(),
    });
    return this.map(row);
  }

  private async assertEmployee(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Сотрудник не найден');
  }
}
