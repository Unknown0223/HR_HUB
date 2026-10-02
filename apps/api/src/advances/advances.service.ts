import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdvanceRequestStatus, AdvanceStatus, NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { MeService } from '../me/me.service';
import { NotificationsService } from '../notifications/notifications.service';
import { employeeNameSearchWhere } from '../common/name-search';
import {
  advanceCommentError,
  resolveAdvanceLimit,
  type AdvanceLimitRule,
} from './advance-limit';
import {
  AdvanceLimitDto,
  CreateAdvanceRequestDto,
  ReviewAdvanceRequestDto,
  UpdateAdvanceLimitDto,
} from './advances.dto';

const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} so‘m`;

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  tabNumber: true,
  division: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class AdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly notifications: NotificationsService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private async rules(tenantId: string): Promise<AdvanceLimitRule[]> {
    const rows = await this.prisma.advanceLimit.findMany({ where: { tenantId } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      maxAmount: Number(r.maxAmount),
      roles: r.roles,
      employeeIds: r.employeeIds,
      reason: r.reason,
      isActive: r.isActive,
    }));
  }

  private async limitFor(tenantId: string, employeeId: string, role: string) {
    return resolveAdvanceLimit(await this.rules(tenantId), { employeeId, role });
  }

  private serialize<
    T extends {
      amount: Prisma.Decimal;
      limitAmount: Prisma.Decimal | null;
    },
  >(row: T) {
    return {
      ...row,
      amount: Number(row.amount),
      limitAmount: row.limitAmount == null ? null : Number(row.limitAmount),
    };
  }

  /** Employee screen: the cap that applies to them and their own requests. */
  async myOverview(user: AuthUser) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    const [limit, requests] = await Promise.all([
      this.limitFor(tenantId, employee.id, user.role),
      this.prisma.advanceRequest.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { limit, requests: requests.map((r) => this.serialize(r)) };
  }

  async create(user: AuthUser, dto: CreateAdvanceRequestDto) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    const pending = await this.prisma.advanceRequest.count({
      where: { tenantId, employeeId: employee.id, status: AdvanceRequestStatus.pending },
    });
    if (pending > 0) {
      throw new BadRequestException(
        'Avvalgi avans so‘rovingiz hali ko‘rib chiqilmoqda / Предыдущая заявка ещё на рассмотрении',
      );
    }
    const limit = await this.limitFor(tenantId, employee.id, user.role);
    const commentError = advanceCommentError(dto.amount, dto.comment, limit);
    if (commentError) throw new BadRequestException(commentError);

    const comment = dto.comment?.trim() || null;
    const overLimit = !!limit && dto.amount > limit.maxAmount;
    const row = await this.prisma.advanceRequest.create({
      data: {
        tenantId,
        employeeId: employee.id,
        amount: dto.amount,
        comment,
        limitAmount: limit?.maxAmount ?? null,
        limitId: limit?.id ?? null,
        overLimit,
        createdByUserId: user.userId,
      },
    });

    const name = [employee.lastName, employee.firstName].filter(Boolean).join(' ');
    await this.notifications.notifyApprovers(tenantId, {
      kind: NotificationKind.approval,
      title: `Заявка на аванс: ${name}`,
      body: `${new Intl.NumberFormat('ru-RU').format(dto.amount)} сум${
        overLimit ? ` — больше лимита ${new Intl.NumberFormat('ru-RU').format(limit!.maxAmount)}` : ''
      }${comment ? `. ${comment}` : ''}`,
      entity: 'advance_request',
      entityId: row.id,
      href: '/payroll/advance-requests',
    });
    return this.serialize(row);
  }

  async cancelMine(user: AuthUser, id: string) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    const row = await this.prisma.advanceRequest.findFirst({
      where: { id, tenantId, employeeId: employee.id },
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== AdvanceRequestStatus.pending) {
      throw new BadRequestException('Only a pending request can be cancelled');
    }
    const updated = await this.prisma.advanceRequest.update({
      where: { id },
      data: { status: AdvanceRequestStatus.cancelled },
    });
    return this.serialize(updated);
  }

  async list(tenantId: string, opts: { status?: string; q?: string }) {
    const where: Prisma.AdvanceRequestWhereInput = { tenantId };
    if (opts.status && opts.status in AdvanceRequestStatus) {
      where.status = opts.status as AdvanceRequestStatus;
    }
    const nameWhere = opts.q?.trim() ? employeeNameSearchWhere(opts.q) : null;
    if (opts.q?.trim()) {
      where.employee = nameWhere ?? { tabNumber: { contains: opts.q.trim() } };
    }
    const rows = await this.prisma.advanceRequest.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const reviewerIds = [...new Set(rows.map((r) => r.reviewedByUserId).filter(Boolean))] as string[];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const reviewerName = new Map(reviewers.map((u) => [u.id, u.fullName || u.email]));
    return rows.map((r) => ({
      ...this.serialize(r),
      reviewedByName: r.reviewedByUserId ? reviewerName.get(r.reviewedByUserId) ?? null : null,
    }));
  }

  async review(tenantId: string, id: string, dto: ReviewAdvanceRequestDto, reviewer: AuthUser) {
    const row = await this.prisma.advanceRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== AdvanceRequestStatus.pending) {
      throw new BadRequestException('Request has already been reviewed');
    }
    const approved = dto.status === 'approved';
    const note = dto.reviewNote?.trim() || null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const advance = approved
        ? await tx.payrollAdvance.create({
            data: {
              tenantId,
              employeeId: row.employeeId,
              amount: row.amount,
              status: AdvanceStatus.draft,
              note: ['Заявка сотрудника', row.comment].filter(Boolean).join(': '),
            },
          })
        : null;
      return tx.advanceRequest.update({
        where: { id },
        data: {
          status: approved ? AdvanceRequestStatus.approved : AdvanceRequestStatus.rejected,
          reviewedByUserId: reviewer.userId,
          reviewedAt: new Date(),
          reviewNote: note,
          advanceId: advance?.id ?? null,
        },
        include: { employee: { select: employeeSelect } },
      });
    });

    const amount = money(Number(row.amount));
    await this.notifications.notifyEmployee(tenantId, row.employeeId, {
      kind: approved ? NotificationKind.info : NotificationKind.alert,
      title: approved ? 'Avans so‘rovingiz tasdiqlandi' : 'Avans so‘rovingiz rad etildi',
      body: approved
        ? `${amount} avans tasdiqlandi va to‘lovga yuborildi.${note ? ` Izoh: ${note}` : ''}`
        : `${amount} avans so‘rovi rad etildi.${note ? ` Sabab: ${note}` : ''}`,
      entity: 'advance_request',
      entityId: id,
      href: '/advance',
    });
    return this.serialize(updated);
  }

  async listLimits(tenantId: string) {
    const rows = await this.prisma.advanceLimit.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    const ids = [...new Set(rows.flatMap((r) => r.employeeIds))];
    const employees = ids.length
      ? await this.prisma.employee.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        })
      : [];
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows.map((r) => ({
      ...r,
      maxAmount: Number(r.maxAmount),
      employees: r.employeeIds.map((eid) => byId.get(eid)).filter(Boolean),
    }));
  }

  async createLimit(tenantId: string, dto: AdvanceLimitDto) {
    const employeeIds = await this.ownEmployeeIds(tenantId, dto.employeeIds);
    const row = await this.prisma.advanceLimit.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        maxAmount: dto.maxAmount,
        roles: dto.roles ?? [],
        employeeIds,
        reason: dto.reason?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
    return { ...row, maxAmount: Number(row.maxAmount) };
  }

  async updateLimit(tenantId: string, id: string, dto: UpdateAdvanceLimitDto) {
    const existing = await this.prisma.advanceLimit.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Limit not found');
    const row = await this.prisma.advanceLimit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount } : {}),
        ...(dto.roles !== undefined ? { roles: dto.roles } : {}),
        ...(dto.employeeIds !== undefined
          ? { employeeIds: await this.ownEmployeeIds(tenantId, dto.employeeIds) }
          : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return { ...row, maxAmount: Number(row.maxAmount) };
  }

  async removeLimit(tenantId: string, id: string) {
    const existing = await this.prisma.advanceLimit.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Limit not found');
    await this.prisma.advanceLimit.delete({ where: { id } });
    return { ok: true };
  }

  /** Drops ids that are not employees of this tenant. */
  private async ownEmployeeIds(tenantId: string, ids?: string[]) {
    const unique = [...new Set(ids ?? [])];
    if (!unique.length) return [];
    const rows = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
