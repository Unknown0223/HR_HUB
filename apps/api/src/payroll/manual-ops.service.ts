import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualOpDto, ManualLineDto, UpdateManualOpDto } from './manual-ops.dto';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function n4(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : 0;
}

function parseDate(iso?: string | null): Date {
  const d = new Date(iso || new Date().toISOString());
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Некорректная дата');
  return d;
}

@Injectable()
export class ManualOpsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return { lines: { orderBy: { sortOrder: 'asc' as const } } };
  }

  private map(row: {
    totalAmount: unknown;
    status?: unknown;
    lines?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  }) {
    const lines = (row.lines || []).map((l) => ({
      ...l,
      debitAccount: String(l.debitAccount || ''),
      creditAccount: String(l.creditAccount || ''),
      debitName: l.debitName != null ? String(l.debitName) : '',
      creditName: l.creditName != null ? String(l.creditName) : '',
      quantity: n4(l.quantity),
      amount: n(l.amount),
      amountBase: n(l.amountBase),
    }));
    return {
      ...row,
      totalAmount: n(row.totalAmount),
      lines,
      debitAccounts: lines.map((l) => l.debitAccount).filter(Boolean).join(', '),
      creditAccounts: lines.map((l) => l.creditAccount).filter(Boolean).join(', '),
      debitNames: lines.map((l) => l.debitName).filter(Boolean).join(', '),
      creditNames: lines.map((l) => l.creditName).filter(Boolean).join(', '),
      posted: row.status === 'posted',
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
    const count = await this.prisma.payrollManualOp.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private async audit(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    opId: string | null,
    eventType: string,
    userName: string,
  ) {
    await tx.payrollManualAudit.create({
      data: { tenantId, opId: opId || undefined, eventType, userName },
    });
  }

  private totals(lines: ManualLineDto[]) {
    return lines.reduce((s, l) => s + n(l.amountBase ?? l.amount), 0);
  }

  private assertLines(lines: ManualLineDto[], forPost: boolean) {
    if (forPost && (!lines.length || lines.every((l) => n(l.amount) <= 0))) {
      throw new BadRequestException('Добавьте проводку с суммой');
    }
    for (const l of lines) {
      if (!l.debitAccount?.trim()) throw new BadRequestException('Укажите счет дебета');
      if (!l.creditAccount?.trim()) throw new BadRequestException('Укажите счет кредита');
    }
  }

  async list(tenantId: string) {
    const rows = await this.prisma.payrollManualOp.findMany({
      where: { tenantId },
      include: this.include(),
      orderBy: { docDate: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.payrollManualOp.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Ручная операция не найдена');
    return this.map(row);
  }

  private usableLines(lines?: ManualLineDto[]) {
    return (lines || []).filter(
      (l) => l.debitAccount?.trim() || l.creditAccount?.trim() || n(l.amount) || n4(l.quantity),
    );
  }

  async create(tenantId: string, dto: CreateManualOpDto, userId?: string) {
    const userName = await this.actorName(userId);
    const lines = this.usableLines(dto.lines);
    if (lines.length) this.assertLines(lines, false);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const row = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.payrollManualOp.create({
        data: {
          tenantId,
          number,
          docDate: parseDate(dto.docDate),
          note: dto.note?.trim() || null,
          totalAmount: this.totals(lines),
          createdByName: userName,
          lines: {
            create: lines.map((l, i) => ({
              debitAccount: l.debitAccount.trim(),
              debitName: l.debitName?.trim() || null,
              creditAccount: l.creditAccount.trim(),
              creditName: l.creditName?.trim() || null,
              quantity: n4(l.quantity),
              amount: n(l.amount),
              amountBase: n(l.amountBase ?? l.amount),
              sortOrder: i,
            })),
          },
        },
      });
      await this.audit(tx, tenantId, doc.id, 'Добавлен', userName);
      return tx.payrollManualOp.findFirst({ where: { id: doc.id }, include: this.include() });
    });
    return this.map(row!);
  }

  async update(tenantId: string, id: string, dto: UpdateManualOpDto, userId?: string) {
    const existing = await this.prisma.payrollManualOp.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ручная операция не найдена');
    if (existing.status !== 'draft') throw new BadRequestException('Проведённый документ нельзя изменить');
    const userName = await this.actorName(userId);
    const lines = dto.lines ? this.usableLines(dto.lines) : undefined;
    if (lines) this.assertLines(lines, false);
    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.payrollManualLine.deleteMany({ where: { opId: id } });
        if (lines.length) {
          await tx.payrollManualLine.createMany({
            data: lines.map((l, i) => ({
              opId: id,
              debitAccount: l.debitAccount.trim(),
              debitName: l.debitName?.trim() || null,
              creditAccount: l.creditAccount.trim(),
              creditName: l.creditName?.trim() || null,
              quantity: n4(l.quantity),
              amount: n(l.amount),
              amountBase: n(l.amountBase ?? l.amount),
              sortOrder: i,
            })),
          });
        }
      }
      await tx.payrollManualOp.update({
        where: { id },
        data: {
          number: dto.number?.trim() || undefined,
          docDate: dto.docDate ? parseDate(dto.docDate) : undefined,
          note: dto.note === undefined ? undefined : dto.note?.trim() || null,
          totalAmount: lines ? this.totals(lines) : undefined,
        },
      });
      await this.audit(tx, tenantId, id, 'Обновлен', userName);
      return tx.payrollManualOp.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async post(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.payrollManualOp.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Ручная операция не найдена');
    if (existing.status === 'posted') throw new BadRequestException('Уже проведена');
    this.assertLines(
      existing.lines.map((l) => ({
        debitAccount: l.debitAccount,
        creditAccount: l.creditAccount,
        amount: n(l.amount),
        amountBase: n(l.amountBase),
      })),
      true,
    );
    const userName = await this.actorName(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.payrollManualOp.update({
        where: { id },
        data: { status: 'posted', postedAt: new Date() },
      });
      await this.audit(tx, tenantId, id, 'Проведен', userName);
      return tx.payrollManualOp.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async unpost(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.payrollManualOp.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ручная операция не найдена');
    if (existing.status !== 'posted') throw new BadRequestException('Документ не проведён');
    const userName = await this.actorName(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.payrollManualOp.update({
        where: { id },
        data: { status: 'draft', postedAt: null },
      });
      await this.audit(tx, tenantId, id, 'Отменен', userName);
      return tx.payrollManualOp.findFirst({ where: { id }, include: this.include() });
    });
    return this.map(row!);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.payrollManualOp.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Ручная операция не найдена');
    if (existing.status !== 'draft') throw new BadRequestException('Сначала отмените проведение');
    await this.prisma.payrollManualOp.delete({ where: { id } });
    return { ok: true };
  }

  async history(
    tenantId: string,
    q?: { opId?: string; from?: string; to?: string; search?: string },
  ) {
    const where: Prisma.PayrollManualAuditWhereInput = { tenantId };
    if (q?.opId) where.opId = q.opId;
    if (q?.from || q?.to) {
      where.occurredAt = {};
      if (q.from) where.occurredAt.gte = parseDate(q.from);
      if (q.to) {
        const t = parseDate(q.to);
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
    return this.prisma.payrollManualAudit.findMany({
      where,
      include: { op: { select: { id: true, number: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }
}
