import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAccountPairDto,
  CreateSettlementDto,
  RefreshSettlementDto,
  SettlementLineDto,
  UpdateAccountPairDto,
  UpdateSettlementDto,
} from './settlements.dto';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function asDate(iso?: string | null): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private pairInclude() {
    return { subcontos: { orderBy: { sortOrder: 'asc' as const } } };
  }

  private settlementInclude() {
    return {
      accountPair: true,
      selectedPairs: { include: { accountPair: { include: this.pairInclude() } } },
      lines: { include: { accountPair: true }, orderBy: { sortOrder: 'asc' as const } },
      audits: { orderBy: { occurredAt: 'desc' as const }, take: 50 },
    };
  }

  private mapPair(row: {
    debitAccount: string;
    creditAccount: string;
    subcontos?: { id: string; name: string; sortOrder: number }[];
    [k: string]: unknown;
  }) {
    return {
      ...row,
      firstAccount: row.debitAccount,
      secondAccount: row.creditAccount,
      subcontos: (row.subcontos || []).map((s) => s.name),
    };
  }

  private mapSettlement(row: {
    amount: unknown;
    status: string;
    selectedPairs?: Array<{ accountPairId: string; accountPair: unknown }>;
    lines?: Array<Record<string, unknown> & { firstAmount: unknown; secondAmount: unknown; amount: unknown }>;
    [k: string]: unknown;
  }) {
    return {
      ...row,
      amount: n(row.amount),
      posted: row.status === 'matched' || row.status === 'closed',
      pairIds: (row.selectedPairs || []).map((p) => p.accountPairId),
      pairs: (row.selectedPairs || []).map((p) => this.mapPair(p.accountPair as never)),
      lines: (row.lines || []).map((l) => ({
        ...l,
        firstAmount: n(l.firstAmount),
        secondAmount: n(l.secondAmount),
        amount: n(l.amount),
      })),
    };
  }

  private async actorName(userId?: string | null): Promise<string> {
    if (!userId) return 'Система';
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    return u?.fullName || u?.email || 'Система';
  }

  private async nextNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.settlement.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private async audit(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    settlementId: string | null,
    eventType: string,
    userName: string,
  ) {
    await tx.settlementAudit.create({
      data: {
        tenantId,
        settlementId: settlementId || undefined,
        eventType,
        userName,
        organization: 'Demo',
        product: 'HR HUB',
      },
    });
  }

  // —— Парные счета ——
  async listPairs(tenantId: string) {
    const rows = await this.prisma.accountPair.findMany({
      where: { tenantId },
      include: this.pairInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.mapPair(r));
  }

  async getPair(tenantId: string, id: string) {
    const row = await this.prisma.accountPair.findFirst({
      where: { id, tenantId },
      include: this.pairInclude(),
    });
    if (!row) throw new NotFoundException('Парный счёт не найден');
    return this.mapPair(row);
  }

  private slugCode(name: string) {
    const base = name
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24)
      .toUpperCase();
    return base || `PAIR-${Date.now().toString(36).toUpperCase()}`;
  }

  async createPair(tenantId: string, dto: CreateAccountPairDto) {
    const name = dto.name?.trim();
    const first = dto.firstAccount?.trim();
    const second = dto.secondAccount?.trim();
    if (!name || !first || !second) {
      throw new BadRequestException('Название и оба счёта обязательны');
    }
    let code = (dto.code || this.slugCode(name)).slice(0, 32);
    const clash = await this.prisma.accountPair.findFirst({ where: { tenantId, code } });
    if (clash) code = `${code}-${Date.now().toString(36)}`.slice(0, 32);
    const maxSort = await this.prisma.accountPair.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });
    const row = await this.prisma.accountPair.create({
      data: {
        tenantId,
        code,
        name,
        debitAccount: first,
        creditAccount: second,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder || 0) + 1,
        isActive: dto.isActive !== false,
        subcontos: {
          create: (dto.subcontos || [])
            .map((s) => s.trim())
            .filter(Boolean)
            .map((name, i) => ({ name, sortOrder: i })),
        },
      },
      include: this.pairInclude(),
    });
    return this.mapPair(row);
  }

  async updatePair(tenantId: string, id: string, dto: UpdateAccountPairDto) {
    const existing = await this.prisma.accountPair.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Парный счёт не найден');
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.subcontos) {
        await tx.accountPairSubconto.deleteMany({ where: { pairId: id } });
        if (dto.subcontos.length) {
          await tx.accountPairSubconto.createMany({
            data: dto.subcontos
              .map((s) => String(s).trim())
              .filter(Boolean)
              .map((name, i) => ({ pairId: id, name, sortOrder: i })),
          });
        }
      }
      return tx.accountPair.update({
        where: { id },
        data: {
          name: dto.name?.trim() || undefined,
          debitAccount: dto.firstAccount?.trim() || undefined,
          creditAccount: dto.secondAccount?.trim() || undefined,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
        include: this.pairInclude(),
      });
    });
    return this.mapPair(row);
  }

  async removePair(tenantId: string, id: string) {
    const existing = await this.prisma.accountPair.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Парный счёт не найден');
    await this.prisma.accountPair.delete({ where: { id } });
    return { ok: true };
  }

  async bulkPairStatus(tenantId: string, ids: string[], isActive: boolean) {
    const res = await this.prisma.accountPair.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { isActive },
    });
    return { ok: res.count };
  }

  async bulkPairDelete(tenantId: string, ids: string[]) {
    const res = await this.prisma.accountPair.deleteMany({
      where: { tenantId, id: { in: ids } },
    });
    return { ok: res.count };
  }

  // —— Взаимозачет ——
  async list(tenantId: string) {
    const rows = await this.prisma.settlement.findMany({
      where: { tenantId },
      include: this.settlementInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapSettlement(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.settlement.findFirst({
      where: { id, tenantId },
      include: this.settlementInclude(),
    });
    if (!row) throw new NotFoundException('Взаимозачет не найден');
    return this.mapSettlement(row);
  }

  async refresh(tenantId: string, dto: RefreshSettlementDto) {
    const ids = dto.pairIds?.filter(Boolean) || [];
    const where: Prisma.AccountPairWhereInput = {
      tenantId,
      isActive: true,
      ...(ids.length ? { id: { in: ids } } : {}),
    };
    const pairs = await this.prisma.accountPair.findMany({
      where,
      include: this.pairInclude(),
      orderBy: { sortOrder: 'asc' },
    });
    const subFilter = (dto.subconto || '').trim().toLowerCase();
    const lines: SettlementLineDto[] = [];
    for (const p of pairs) {
      const names = p.subcontos.map((s) => s.name).filter(Boolean);
      const list = names.length ? names : [''];
      for (const sub of list) {
        if (subFilter && !sub.toLowerCase().includes(subFilter)) continue;
        lines.push({
          accountPairId: p.id,
          pairName: p.name,
          currency: 'UZS',
          subconto: sub,
          firstAmount: 0,
          secondAmount: 0,
          amount: 0,
        });
      }
    }
    return { lines };
  }

  private lineAmount(l: SettlementLineDto) {
    const a = n(l.firstAmount);
    const b = n(l.secondAmount);
    const given = n(l.amount);
    if (given) return given;
    if (a && b) return Math.min(a, b);
    return a || b;
  }

  async create(tenantId: string, dto: CreateSettlementDto, userId?: string) {
    const userName = await this.actorName(userId);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const lines = dto.lines || [];
    const pairIds = dto.pairIds?.filter(Boolean) || [];
    const amount = lines.reduce((s, l) => s + this.lineAmount(l), 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.settlement.create({
        data: {
          tenantId,
          number,
          title: 'Взаимозачет',
          note: dto.note?.trim() || null,
          docDate: asDate(dto.docDate),
          createdByName: userName,
          amount,
          status: 'open',
          accountPairId: pairIds[0] || null,
          selectedPairs: {
            create: pairIds.map((accountPairId) => ({ accountPairId })),
          },
          lines: {
            create: lines.map((l, i) => ({
              accountPairId: l.accountPairId || null,
              pairName: l.pairName || '',
              currency: l.currency || 'UZS',
              subconto: l.subconto || '',
              firstAmount: n(l.firstAmount),
              secondAmount: n(l.secondAmount),
              amount: this.lineAmount(l),
              sortOrder: i,
            })),
          },
        },
      });
      await this.audit(tx, tenantId, doc.id, 'Добавлен', userName);
      return tx.settlement.findFirst({
        where: { id: doc.id },
        include: this.settlementInclude(),
      });
    });
    return this.mapSettlement(row!);
  }

  async update(tenantId: string, id: string, dto: UpdateSettlementDto, userId?: string) {
    const existing = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Взаимозачет не найден');
    if (existing.status !== 'open') {
      throw new BadRequestException('Проведённый документ нельзя изменить');
    }
    const userName = await this.actorName(userId);
    const lines = dto.lines || [];
    const pairIds = dto.pairIds?.filter(Boolean);
    const amount = lines.reduce((s, l) => s + this.lineAmount(l), 0);
    const row = await this.prisma.$transaction(async (tx) => {
      if (pairIds) {
        await tx.settlementSelectedPair.deleteMany({ where: { settlementId: id } });
        if (pairIds.length) {
          await tx.settlementSelectedPair.createMany({
            data: pairIds.map((accountPairId) => ({ settlementId: id, accountPairId })),
          });
        }
      }
      await tx.settlementLine.deleteMany({ where: { settlementId: id } });
      if (lines.length) {
        await tx.settlementLine.createMany({
          data: lines.map((l, i) => ({
            settlementId: id,
            accountPairId: l.accountPairId || null,
            pairName: l.pairName || '',
            currency: l.currency || 'UZS',
            subconto: l.subconto || '',
            firstAmount: n(l.firstAmount),
            secondAmount: n(l.secondAmount),
            amount: this.lineAmount(l),
            sortOrder: i,
          })),
        });
      }
      await tx.settlement.update({
        where: { id },
        data: {
          note: dto.note !== undefined ? dto.note?.trim() || null : undefined,
          docDate: dto.docDate ? asDate(dto.docDate) : undefined,
          number: dto.number?.trim() || undefined,
          amount,
          accountPairId: pairIds?.[0] || undefined,
        },
      });
      await this.audit(tx, tenantId, id, 'Обновлен', userName);
      return tx.settlement.findFirst({
        where: { id },
        include: this.settlementInclude(),
      });
    });
    return this.mapSettlement(row!);
  }

  async post(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Взаимозачет не найден');
    if (existing.status === 'matched' || existing.status === 'closed') {
      throw new BadRequestException('Документ уже проведён');
    }
    const userName = await this.actorName(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.settlement.update({
        where: { id },
        data: { status: 'matched', settledAt: new Date() },
      });
      await this.audit(tx, tenantId, id, 'Проведен', userName);
      return tx.settlement.findFirst({
        where: { id },
        include: this.settlementInclude(),
      });
    });
    return this.mapSettlement(row!);
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Взаимозачет не найден');
    if (existing.status === 'open') {
      throw new BadRequestException('Документ не проведён');
    }
    const userName = await this.actorName(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.settlement.update({
        where: { id },
        data: { status: 'open', settledAt: null },
      });
      await this.audit(tx, tenantId, id, 'Отменен', userName);
      return tx.settlement.findFirst({
        where: { id },
        include: this.settlementInclude(),
      });
    });
    return this.mapSettlement(row!);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Взаимозачет не найден');
    if (existing.status !== 'open') {
      throw new BadRequestException('Сначала отмените проведение');
    }
    await this.prisma.settlement.delete({ where: { id } });
    return { ok: true };
  }

  async history(
    tenantId: string,
    q?: { settlementId?: string; from?: string; to?: string; search?: string },
  ) {
    const where: Prisma.SettlementAuditWhereInput = { tenantId };
    if (q?.settlementId) where.settlementId = q.settlementId;
    if (q?.from || q?.to) {
      where.occurredAt = {};
      if (q.from) where.occurredAt.gte = asDate(q.from);
      if (q.to) {
        const t = asDate(q.to);
        t.setUTCHours(23, 59, 59, 999);
        where.occurredAt.lte = t;
      }
    }
    if (q?.search) {
      where.OR = [
        { userName: { contains: q.search, mode: 'insensitive' } },
        { eventType: { contains: q.search, mode: 'insensitive' } },
        { organization: { contains: q.search, mode: 'insensitive' } },
        { product: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.settlementAudit.findMany({
      where,
      include: { settlement: { select: { id: true, number: true, title: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }
}
