import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const tripInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      tabNumber: true,
      email: true,
      divisionId: true,
      positionId: true,
    },
  },
  location: { select: { id: true, name: true, code: true } },
  recipientDivision: { select: { id: true, name: true, code: true } },
  senderDivision: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, name: true, code: true } },
  workSchedule: { select: { id: true, name: true, code: true } },
} satisfies Prisma.InternalTripInclude;

export type CreateInternalTripDto = {
  employeeId: string;
  recipientDivisionId?: string;
  senderDivisionId?: string;
  locationId?: string;
  positionId?: string;
  quantity?: number;
  requestDate?: string;
  startDate: string;
  endDate: string;
  earlyArrival?: string;
  lateDeparture?: string;
  bySchedule?: boolean;
  workScheduleId?: string;
  accrualName?: string;
  amount?: number | string;
  note?: string;
  title?: string;
  visibility?: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class InternalTripsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(t: string | null): string {
    if (!t) throw new BadRequestException('X-Tenant-Id required');
    return t;
  }

  private assertDateRange(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Некорректная дата');
    }
    if (end < start) {
      throw new BadRequestException('Дата окончания раньше даты начала');
    }
  }

  list(
    tenantId: string,
    opts: {
      scope?: string;
      status?: string;
      q?: string;
      userId?: string;
      userEmail?: string;
    } = {},
  ) {
    const where: Prisma.InternalTripWhereInput = { tenantId };
    const scope = opts.scope || 'to_me';

    if (scope === 'mine') {
      where.OR = [
        { visibility: 'personal' },
        ...(opts.userId ? [{ createdByUserId: opts.userId }] : []),
        ...(opts.userEmail
          ? [
              {
                employee: {
                  email: { equals: opts.userEmail, mode: 'insensitive' as const },
                },
              },
            ]
          : []),
      ];
    } else if (scope === 'shared' || scope === 'all') {
      where.visibility = 'shared';
    } else {
      // to_me
      where.visibility = 'inbox';
    }

    if (opts.status) {
      where.requestStatus = opts.status as RequestStatus;
    }

    const q = opts.q?.trim();
    if (q) {
      const textFilter: Prisma.InternalTripWhereInput = {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { note: { contains: q, mode: 'insensitive' } },
          { accrualName: { contains: q, mode: 'insensitive' } },
          {
            employee: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { tabNumber: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
          {
            recipientDivision: { name: { contains: q, mode: 'insensitive' } },
          },
          { senderDivision: { name: { contains: q, mode: 'insensitive' } } },
          { location: { name: { contains: q, mode: 'insensitive' } } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), textFilter];
    }

    return this.prisma.internalTrip.findMany({
      where,
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.internalTrip.findFirst({
      where: { id, tenantId },
      include: tripInclude,
    });
    if (!row) throw new NotFoundException('Командировка не найдена');
    return row;
  }

  async create(
    tenantId: string,
    dto: CreateInternalTripDto,
    actor?: { userId?: string; email?: string },
  ) {
    if (!dto.employeeId) throw new BadRequestException('Сотрудник обязателен');
    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException('Даты начала и окончания обязательны');
    }
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    this.assertDateRange(start, end);

    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!emp) throw new BadRequestException('Сотрудник не найден');

    const requestDate = dto.requestDate
      ? new Date(dto.requestDate)
      : new Date();
    const title =
      dto.title?.trim() ||
      `Внутренняя командировка · ${emp.lastName} ${emp.firstName}`;

    const visibility = dto.visibility || 'personal';
    if (!['personal', 'shared', 'inbox'].includes(visibility)) {
      throw new BadRequestException('Некорректная visibility');
    }

    return this.prisma.internalTrip.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        recipientDivisionId: dto.recipientDivisionId || emp.divisionId || undefined,
        senderDivisionId: dto.senderDivisionId || emp.divisionId || undefined,
        locationId: dto.locationId || undefined,
        positionId: dto.positionId || emp.positionId || undefined,
        workScheduleId: dto.workScheduleId || emp.scheduleId || undefined,
        visibility,
        createdByUserId: actor?.userId,
        title,
        quantity: dto.quantity && dto.quantity > 0 ? dto.quantity : 1,
        requestDate,
        startDate: start,
        endDate: end,
        earlyArrival: dto.earlyArrival || '00:00',
        lateDeparture: dto.lateDeparture || '00:00',
        bySchedule: dto.bySchedule !== false,
        accrualName: dto.accrualName || undefined,
        amount:
          dto.amount != null && dto.amount !== ''
            ? new Prisma.Decimal(dto.amount)
            : undefined,
        requestStatus: RequestStatus.pending,
        status: TripStatus.planned,
        note: dto.note || undefined,
        meta: dto.meta ? (dto.meta as Prisma.InputJsonValue) : undefined,
      },
      include: tripInclude,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateInternalTripDto> & { requestStatus?: string },
  ) {
    await this.get(tenantId, id);
    const data: Prisma.InternalTripUpdateInput = {};

    if (dto.employeeId) data.employee = { connect: { id: dto.employeeId } };
    if (dto.recipientDivisionId !== undefined) {
      data.recipientDivision = dto.recipientDivisionId
        ? { connect: { id: dto.recipientDivisionId } }
        : { disconnect: true };
    }
    if (dto.senderDivisionId !== undefined) {
      data.senderDivision = dto.senderDivisionId
        ? { connect: { id: dto.senderDivisionId } }
        : { disconnect: true };
    }
    if (dto.locationId !== undefined) {
      data.location = dto.locationId
        ? { connect: { id: dto.locationId } }
        : { disconnect: true };
    }
    if (dto.positionId !== undefined) {
      data.position = dto.positionId
        ? { connect: { id: dto.positionId } }
        : { disconnect: true };
    }
    if (dto.workScheduleId !== undefined) {
      data.workSchedule = dto.workScheduleId
        ? { connect: { id: dto.workScheduleId } }
        : { disconnect: true };
    }
    if (dto.title != null) data.title = dto.title;
    if (dto.quantity != null) data.quantity = dto.quantity;
    if (dto.requestDate) data.requestDate = new Date(dto.requestDate);
    if (dto.startDate && dto.endDate) {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      this.assertDateRange(start, end);
      data.startDate = start;
      data.endDate = end;
    } else if (dto.startDate) data.startDate = new Date(dto.startDate);
    else if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (dto.earlyArrival != null) data.earlyArrival = dto.earlyArrival;
    if (dto.lateDeparture != null) data.lateDeparture = dto.lateDeparture;
    if (dto.bySchedule != null) data.bySchedule = dto.bySchedule;
    if (dto.accrualName !== undefined) data.accrualName = dto.accrualName;
    if (dto.amount !== undefined) {
      data.amount =
        dto.amount === '' || dto.amount == null
          ? null
          : new Prisma.Decimal(dto.amount);
    }
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.visibility) data.visibility = dto.visibility;
    if (dto.meta) data.meta = dto.meta as Prisma.InputJsonValue;
    if (dto.requestStatus) {
      data.requestStatus = dto.requestStatus as RequestStatus;
    }

    return this.prisma.internalTrip.update({
      where: { id },
      data,
      include: tripInclude,
    });
  }

  async review(
    tenantId: string,
    id: string,
    status: 'approved' | 'rejected',
    opts: { reviewNote?: string; actorName?: string } = {},
  ) {
    const row = await this.get(tenantId, id);
    if (row.requestStatus !== RequestStatus.pending) {
      throw new BadRequestException('Заявка уже обработана');
    }
    return this.prisma.internalTrip.update({
      where: { id },
      data: {
        requestStatus:
          status === 'approved' ? RequestStatus.approved : RequestStatus.rejected,
        status: status === 'approved' ? TripStatus.active : TripStatus.cancelled,
        reviewNote: opts.reviewNote,
        reviewedBy: opts.actorName,
      },
      include: tripInclude,
    });
  }

  async cancel(tenantId: string, id: string, actorName?: string) {
    await this.get(tenantId, id);
    return this.prisma.internalTrip.update({
      where: { id },
      data: {
        requestStatus: RequestStatus.cancelled,
        status: TripStatus.cancelled,
        reviewedBy: actorName,
      },
      include: tripInclude,
    });
  }

  async bulkAction(
    tenantId: string,
    body: { ids: string[]; action: string; reviewNote?: string },
    actor?: { email?: string },
  ) {
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) throw new BadRequestException('ids required');
    let ok = 0;
    for (const id of ids) {
      try {
        if (body.action === 'approve') {
          await this.review(tenantId, id, 'approved', {
            reviewNote: body.reviewNote,
            actorName: actor?.email,
          });
        } else if (body.action === 'reject') {
          await this.review(tenantId, id, 'rejected', {
            reviewNote: body.reviewNote,
            actorName: actor?.email,
          });
        } else if (body.action === 'cancel') {
          await this.cancel(tenantId, id, actor?.email);
        } else {
          throw new BadRequestException(`Unknown action: ${body.action}`);
        }
        ok += 1;
      } catch {
        /* skip failed */
      }
    }
    return { ok, total: ids.length };
  }
}
