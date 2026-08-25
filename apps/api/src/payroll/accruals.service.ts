import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentLifecycle,
  PayrollAccrualKind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccrualDeductionDto,
  AccrualLineDto,
  CreateAccrualDocDto,
  FillAccrualDto,
  UpdateAccrualDocDto,
} from './accruals.dto';

const KIND_DEFAULT_ACCRUAL: Record<PayrollAccrualKind, string> = {
  salary_contributions: 'MONTHLY',
  sick_leave: 'SICK',
  travel: 'TRIP',
  vacation: 'VACATION',
  all_types: 'MONTHLY',
};

const NDFL_RATE = 0.12;
const INPS_RATE = 0.001;
const ESP_RATE = 0.12;

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
}): string {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

@Injectable()
export class AccrualsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private include() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          employee: {
            select: {
              id: true,
              tabNumber: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
      deductions: {
        include: {
          employee: {
            select: {
              id: true,
              tabNumber: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
      _count: { select: { entries: true, audits: true } },
    };
  }

  private hydrate(row: Record<string, unknown>) {
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const deductions = Array.isArray(row.deductions) ? row.deductions : [];
    return {
      ...row,
      accruedTotal: n(row.accruedTotal),
      deductedTotal: n(row.deductedTotal),
      ndflTotal: n(row.ndflTotal),
      inpsTotal: n(row.inpsTotal),
      espTotal: n(row.espTotal),
      lines: lines.map((l: Record<string, unknown>) => ({
        ...l,
        accrued: n(l.accrued),
        toPay: n(l.toPay),
        ndfl: n(l.ndfl),
        inps: n(l.inps),
        esp: n(l.esp),
      })),
      deductions: deductions.map((d: Record<string, unknown>) => ({
        ...d,
        amount: n(d.amount),
      })),
    };
  }

  private totals(lines: AccrualLineDto[], deductions: AccrualDeductionDto[]) {
    const accruedTotal = lines.reduce((s, l) => s + n(l.accrued), 0);
    const deductedTotal = deductions.reduce((s, d) => s + n(d.amount), 0);
    const ndflTotal = lines.reduce((s, l) => s + n(l.ndfl), 0);
    const inpsTotal = lines.reduce((s, l) => s + n(l.inps), 0);
    const espTotal = lines.reduce((s, l) => s + n(l.esp), 0);
    return { accruedTotal, deductedTotal, ndflTotal, inpsTotal, espTotal };
  }

  private async nextNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.payrollAccrualDoc.count({ where: { tenantId } });
    return String(count + 1).padStart(10, '0');
  }

  private async actorName(userId?: string | null): Promise<string> {
    if (!userId) return 'Система';
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    return u?.fullName || u?.email || 'Система';
  }

  private async audit(
    tx: Prisma.TransactionClient | PrismaService,
    docId: string,
    event: string,
    userName: string,
    extra?: { month?: Date; number?: string | null; title?: string | null; posted?: boolean },
  ) {
    await tx.payrollAccrualAudit.create({
      data: {
        docId,
        event,
        userName,
        month: extra?.month,
        number: extra?.number ?? null,
        title: extra?.title ?? null,
        posted: extra?.posted ?? false,
      },
    });
  }

  list(tenantId: string) {
    return this.prisma.payrollAccrualDoc
      .findMany({
        where: { tenantId },
        include: {
          division: { select: { id: true, name: true, code: true } },
          _count: { select: { lines: true, deductions: true, entries: true } },
        },
        orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
      })
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          accruedTotal: n(r.accruedTotal),
          deductedTotal: n(r.deductedTotal),
        })),
      );
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Начисление не найдено');
    return this.hydrate(row as unknown as Record<string, unknown>);
  }

  async create(tenantId: string, dto: CreateAccrualDocDto, userId?: string) {
    const lines = dto.lines ?? [];
    const deductions = dto.deductions ?? [];
    const totals = this.totals(lines, deductions);
    const number = dto.number?.trim() || (await this.nextNumber(tenantId));
    const month = firstOfMonth(dto.month);
    const docDate = day(dto.docDate);
    const userName = await this.actorName(userId);

    const created = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.payrollAccrualDoc.create({
        data: {
          tenantId,
          kind: dto.kind,
          month,
          docDate,
          number,
          title: dto.title?.trim() || null,
          divisionId: dto.divisionId || null,
          currency: dto.currency || 'UZS',
          note: dto.note?.trim() || null,
          mergeAccruals: dto.mergeAccruals ?? false,
          attachments: dto.attachments as Prisma.InputJsonValue | undefined,
          ...totals,
          lines: {
            create: lines.map((l, i) => ({
              employeeId: l.employeeId,
              sortOrder: i,
              accrualTypeId: l.accrualTypeId || null,
              accrualName: l.accrualName || null,
              accrued: n(l.accrued),
              toPay: n(l.toPay ?? n(l.accrued) - n(l.ndfl) - n(l.inps)),
              ndfl: n(l.ndfl),
              inps: n(l.inps),
              esp: n(l.esp),
            })),
          },
          deductions: {
            create: deductions.map((d, i) => ({
              employeeId: d.employeeId,
              sortOrder: i,
              deductionTypeId: d.deductionTypeId || null,
              deductionName: d.deductionName || null,
              amount: n(d.amount),
            })),
          },
        },
      });
      await this.audit(tx, doc.id, 'Добавлен', userName, {
        month,
        number,
        title: dto.title,
        posted: false,
      });
      return doc;
    });
    return this.get(tenantId, created.id);
  }

  async update(tenantId: string, id: string, dto: UpdateAccrualDocDto, userId?: string) {
    const existing = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Начисление не найдено');
    if (existing.status !== DocumentLifecycle.draft) {
      throw new BadRequestException('Изменять можно только черновик');
    }
    const lines = dto.lines ?? [];
    const deductions = dto.deductions ?? [];
    const totals = this.totals(lines, deductions);
    const month = dto.month ? firstOfMonth(dto.month) : existing.month;
    const docDate = dto.docDate ? day(dto.docDate) : existing.docDate;
    const userName = await this.actorName(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollAccrualLine.deleteMany({ where: { docId: id } });
      await tx.payrollAccrualDeduction.deleteMany({ where: { docId: id } });
      await tx.payrollAccrualDoc.update({
        where: { id },
        data: {
          month,
          docDate,
          number: dto.number !== undefined ? dto.number.trim() || null : existing.number,
          title: dto.title !== undefined ? dto.title.trim() || null : existing.title,
          divisionId: dto.divisionId !== undefined ? dto.divisionId || null : existing.divisionId,
          currency: dto.currency || existing.currency,
          note: dto.note !== undefined ? dto.note.trim() || null : existing.note,
          mergeAccruals: dto.mergeAccruals ?? existing.mergeAccruals,
          attachments:
            dto.attachments !== undefined
              ? (dto.attachments as Prisma.InputJsonValue)
              : undefined,
          ...totals,
          lines: {
            create: lines.map((l, i) => ({
              employeeId: l.employeeId,
              sortOrder: i,
              accrualTypeId: l.accrualTypeId || null,
              accrualName: l.accrualName || null,
              accrued: n(l.accrued),
              toPay: n(l.toPay ?? n(l.accrued) - n(l.ndfl) - n(l.inps)),
              ndfl: n(l.ndfl),
              inps: n(l.inps),
              esp: n(l.esp),
            })),
          },
          deductions: {
            create: deductions.map((d, i) => ({
              employeeId: d.employeeId,
              sortOrder: i,
              deductionTypeId: d.deductionTypeId || null,
              deductionName: d.deductionName || null,
              amount: n(d.amount),
            })),
          },
        },
      });
      await this.audit(tx, id, 'Обновлен', userName, {
        month,
        number: dto.number ?? existing.number,
        title: dto.title ?? existing.title,
        posted: false,
      });
    });
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Начисление не найдено');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Сначала отмените проведение');
    }
    await this.prisma.payrollAccrualDoc.delete({ where: { id } });
    return { ok: true };
  }

  async post(tenantId: string, id: string, userId?: string) {
    const doc = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          include: {
            employee: {
              select: { lastName: true, firstName: true, middleName: true, tabNumber: true },
            },
          },
        },
        deductions: {
          include: {
            employee: {
              select: { lastName: true, firstName: true, middleName: true, tabNumber: true },
            },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Начисление не найдено');
    if (doc.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Уже проведено');
    }
    const userName = await this.actorName(userId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLedgerEntry.deleteMany({ where: { docId: id } });
      const entries: Prisma.PayrollLedgerEntryCreateManyInput[] = [];

      for (const line of doc.lines) {
        const who = empLabel(line.employee);
        const currency = doc.currency;
        if (n(line.accrued) > 0) {
          entries.push({
            tenantId,
            docId: id,
            createdDate: now,
            transDate: doc.docDate,
            debitAccount: '9420',
            debitSubconto: who,
            creditAccount: '6710',
            creditSubconto: who,
            amount: n(line.accrued),
            currency,
            exchangeRate: 1,
            amountFx: n(line.accrued),
            note: line.accrualName || 'Начисление',
          });
        }
        if (n(line.ndfl) > 0) {
          entries.push({
            tenantId,
            docId: id,
            createdDate: now,
            transDate: doc.docDate,
            debitAccount: '6710',
            debitSubconto: who,
            creditAccount: '6410',
            creditSubconto: 'НДФЛ',
            amount: n(line.ndfl),
            currency,
            exchangeRate: 1,
            amountFx: n(line.ndfl),
            note: 'НДФЛ',
          });
        }
        if (n(line.inps) > 0) {
          entries.push({
            tenantId,
            docId: id,
            createdDate: now,
            transDate: doc.docDate,
            debitAccount: '6710',
            debitSubconto: who,
            creditAccount: '6520',
            creditSubconto: 'ИНПС',
            amount: n(line.inps),
            currency,
            exchangeRate: 1,
            amountFx: n(line.inps),
            note: 'ИНПС',
          });
        }
        if (n(line.esp) > 0) {
          entries.push({
            tenantId,
            docId: id,
            createdDate: now,
            transDate: doc.docDate,
            debitAccount: '9430',
            debitSubconto: who,
            creditAccount: '6520',
            creditSubconto: 'ЕСП',
            amount: n(line.esp),
            currency,
            exchangeRate: 1,
            amountFx: n(line.esp),
            note: 'ЕСП',
          });
        }
      }
      for (const d of doc.deductions) {
        if (n(d.amount) <= 0) continue;
        const who = empLabel(d.employee);
        entries.push({
          tenantId,
          docId: id,
          createdDate: now,
          transDate: doc.docDate,
          debitAccount: '6710',
          debitSubconto: who,
          creditAccount: '6980',
          creditSubconto: d.deductionName || 'Удержание',
          amount: n(d.amount),
          currency: doc.currency,
          exchangeRate: 1,
          amountFx: n(d.amount),
          note: d.deductionName || 'Удержание',
        });
      }
      if (entries.length) {
        await tx.payrollLedgerEntry.createMany({ data: entries });
      }
      await tx.payrollAccrualDoc.update({
        where: { id },
        data: {
          status: DocumentLifecycle.posted,
          postedAt: now,
          postedBy: userName,
        },
      });
      await this.audit(tx, id, 'Проведен', userName, {
        month: doc.month,
        number: doc.number,
        title: doc.title,
        posted: true,
      });
    });
    return this.get(tenantId, id);
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Начисление не найдено');
    if (existing.status !== DocumentLifecycle.posted) {
      throw new BadRequestException('Документ не проведён');
    }
    const userName = await this.actorName(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLedgerEntry.deleteMany({ where: { docId: id } });
      await tx.payrollAccrualDoc.update({
        where: { id },
        data: {
          status: DocumentLifecycle.cancelled,
          postedAt: null,
          postedBy: null,
        },
      });
      await this.audit(tx, id, 'Отменен', userName, {
        month: existing.month,
        number: existing.number,
        title: existing.title,
        posted: false,
      });
    });
    return this.get(tenantId, id);
  }

  async bulk(tenantId: string, ids: string[], action: 'post' | 'cancel' | 'delete', userId?: string) {
    const unique = [...new Set(ids.filter(Boolean))];
    let ok = 0;
    for (const id of unique) {
      try {
        if (action === 'post') await this.post(tenantId, id, userId);
        else if (action === 'cancel') await this.cancel(tenantId, id, userId);
        else await this.remove(tenantId, id);
        ok += 1;
      } catch {
        /* skip failed */
      }
    }
    return { ok, total: unique.length };
  }

  async fill(tenantId: string, dto: FillAccrualDto) {
    const code = KIND_DEFAULT_ACCRUAL[dto.kind];
    const [emps, types, deductions] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          tenantId,
          status: 'active',
          ...(dto.divisionId ? { divisionId: dto.divisionId } : {}),
        },
        select: {
          id: true,
          tabNumber: true,
          firstName: true,
          lastName: true,
          middleName: true,
          baseSalary: true,
        },
        orderBy: { lastName: 'asc' },
        take: 500,
      }),
      this.prisma.accrualType.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.deductionType.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        take: 5,
      }),
    ]);
    const type =
      types.find((t) => t.code === code) ||
      types.find((t) => t.code === 'MONTHLY') ||
      types[0];
    const lines = emps.map((e) => {
      const accrued = n(e.baseSalary) || 0;
      const ndfl = type?.taxNdfl ? n(accrued * NDFL_RATE) : 0;
      const inps = type?.taxInps ? n(accrued * INPS_RATE) : 0;
      const esp = type?.taxOss ? n(accrued * ESP_RATE) : 0;
      return {
        employeeId: e.id,
        employee: e,
        accrualTypeId: type?.id ?? null,
        accrualName: type?.name ?? null,
        accrued,
        ndfl,
        inps,
        esp,
        toPay: n(accrued - ndfl - inps),
      };
    });
    return { lines, deductions: [] as AccrualDeductionDto[], deductionTypes: deductions, accrualTypes: types };
  }

  async entries(tenantId: string, id: string) {
    const doc = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Начисление не найдено');
    const rows = await this.prisma.payrollLedgerEntry.findMany({
      where: { docId: id },
      orderBy: [{ transDate: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      ...r,
      quantity: r.quantity != null ? n(r.quantity) : null,
      amount: n(r.amount),
      exchangeRate: r.exchangeRate != null ? Number(r.exchangeRate) : null,
      amountFx: r.amountFx != null ? n(r.amountFx) : null,
    }));
  }

  async history(tenantId: string, id: string) {
    const doc = await this.prisma.payrollAccrualDoc.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Начисление не найдено');
    return this.prisma.payrollAccrualAudit.findMany({
      where: { docId: id },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async operations(tenantId: string, id: string) {
    const doc = await this.get(tenantId, id);
    const ops: Array<{
      employee: string;
      name: string;
      amount: number;
      amountBase: number;
      opType: string;
    }> = [];
    for (const l of doc.lines as Array<{
      employee?: { lastName?: string; firstName?: string; middleName?: string };
      accrualName?: string | null;
      toPay: number;
      accrued: number;
    }>) {
      ops.push({
        employee: l.employee ? empLabel(l.employee as { lastName: string; firstName: string; middleName?: string | null }) : '—',
        name: l.accrualName || 'Начисление',
        amount: l.toPay,
        amountBase: l.toPay,
        opType: 'Начисление',
      });
    }
    for (const d of doc.deductions as Array<{
      employee?: { lastName?: string; firstName?: string; middleName?: string };
      deductionName?: string | null;
      amount: number;
    }>) {
      ops.push({
        employee: d.employee ? empLabel(d.employee as { lastName: string; firstName: string; middleName?: string | null }) : '—',
        name: d.deductionName || 'Удержание',
        amount: d.amount,
        amountBase: d.amount,
        opType: 'Удержание',
      });
    }
    return ops;
  }
}
