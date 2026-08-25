import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentOrderDto, UpdatePaymentOrderDto } from './payment-orders.dto';

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

function isNewStatus(status: string) {
  return status === 'new' || status === 'open';
}

@Injectable()
export class PaymentOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return { employee: { select: EMP_SELECT } };
  }

  private map(row: {
    amount: unknown;
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
      amount: n(row.amount),
      employee: row.employee ? { ...row.employee, label: empLabel(row.employee) } : null,
    };
  }

  private async nextNumber(tenantId: string) {
    const count = await this.prisma.paymentOrder.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  async list(tenantId: string) {
    const rows = await this.prisma.paymentOrder.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.paymentOrder.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Поручение не найдено');
    return this.map(row);
  }

  async create(tenantId: string, dto: CreatePaymentOrderDto) {
    const amount = n(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Сумма должна быть больше 0');
    await this.assertEmployee(tenantId, dto.employeeId);
    const accrualName = dto.accrualName?.trim() || dto.title?.trim() || 'Поручение';
    const row = await this.prisma.paymentOrder.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        number: dto.number?.trim() || (await this.nextNumber(tenantId)),
        title: dto.title?.trim() || accrualName,
        accrualName,
        amount,
        startDate: day(dto.startDate),
        endDate: dto.endDate ? day(dto.endDate) : day(dto.startDate),
        dueDate: dto.endDate ? day(dto.endDate) : day(dto.startDate),
        status: 'new',
        note: dto.note?.trim() || null,
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async update(tenantId: string, id: string, dto: UpdatePaymentOrderDto) {
    const existing = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Поручение не найдено');
    if (existing.status === 'paid') {
      throw new BadRequestException('Выплаченное поручение нельзя изменить');
    }
    if (dto.employeeId) await this.assertEmployee(tenantId, dto.employeeId);
    const amount = dto.amount != null ? n(dto.amount) : n(existing.amount);
    if (dto.amount != null && !(amount > 0)) {
      throw new BadRequestException('Сумма должна быть больше 0');
    }
    const accrualName =
      dto.accrualName !== undefined ? dto.accrualName.trim() || null : existing.accrualName;
    const row = await this.prisma.paymentOrder.update({
      where: { id },
      data: {
        number: dto.number?.trim() || undefined,
        employeeId: dto.employeeId || undefined,
        accrualName: dto.accrualName !== undefined ? accrualName : undefined,
        title: dto.title?.trim() || (accrualName || undefined),
        amount: dto.amount != null ? amount : undefined,
        startDate: dto.startDate ? day(dto.startDate) : undefined,
        endDate: dto.endDate !== undefined ? (dto.endDate ? day(dto.endDate) : null) : undefined,
        note: dto.note !== undefined ? dto.note.trim() || null : undefined,
      },
      include: this.include(),
    });
    return this.map(row);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Поручение не найдено');
    if (!isNewStatus(existing.status)) {
      throw new BadRequestException('Удалить можно только новое поручение');
    }
    await this.prisma.paymentOrder.delete({ where: { id } });
    return { ok: true };
  }

  async send(tenantId: string, id: string) {
    const existing = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Поручение не найдено');
    if (!isNewStatus(existing.status)) {
      throw new BadRequestException(
        existing.status === 'sent'
          ? 'Поручение уже отправлено'
          : 'Выплаченное поручение нельзя отправить',
      );
    }
    const row = await this.prisma.paymentOrder.update({
      where: { id },
      data: { status: 'sent' },
      include: this.include(),
    });
    return this.map(row);
  }

  async pay(tenantId: string, id: string) {
    const existing = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Поручение не найдено');
    if (existing.status !== 'sent') {
      throw new BadRequestException('Сначала отправьте поручение');
    }
    const row = await this.prisma.paymentOrder.update({
      where: { id },
      data: { status: 'paid' },
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
