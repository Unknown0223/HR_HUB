import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DayStatus,
  DocumentLifecycle,
  DocumentType,
  EmploymentStatus,
  HrChangeKind,
  Prisma,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { buildExcelBuffer } from '../common/excel';
import {
  CreateAbsenceDto,
  CreateAbsenceTypeDto,
  CreateDocumentDto,
  CreateRequestDto,
  ReviewRequestDto,
  UpdateAbsenceDto,
  UpdateAbsenceTypeDto,
  UpdateDocumentDto,
  UpsertHrChangeRequestDto,
} from './hr.controller';
import { parseDateParam } from '../common/date-range';
export type HrDocFile = {
  id: string;
  name: string;
  key: string;
  contentType: string;
  size: number;
  url?: string;
  uploadedAt: string;
  uploadedBy?: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  hire: 'Прием на работу',
  transfer: 'Кадровый перевод',
  dismiss: 'Увольнение',
  name_change: 'Изменение имени',
  wage_change: 'Изменение оплаты труда',
  other: 'Кадровый документ',
};

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  private async writeDocAudit(
    tenantId: string,
    docId: string,
    userId: string | null | undefined,
    userLabel: string | null | undefined,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    let userName = userLabel || 'Система';
    if (userId && !userLabel) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, email: true },
      });
      userName = u?.fullName || u?.email || userName;
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || undefined,
        action,
        entity: 'HrDocument',
        entityId: docId,
        meta: { userName, ...(meta || {}) } as Prisma.InputJsonValue,
      },
    });
  }

  private async nextDocumentNumber(tenantId: string) {
    const last = await this.prisma.hrDocument.findFirst({
      where: { tenantId, number: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    const raw = String(last?.number || '').replace(/\D/g, '');
    const n = raw ? Number(raw) + 1 : 8700;
    return String(Number.isFinite(n) ? n : 8700).padStart(10, '0');
  }

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  listAbsenceTypes(
    tenantId: string,
    opts: { includeInactive?: boolean } = {},
  ) {
    return this.prisma.absenceType.findMany({
      where: {
        tenantId,
        ...(opts.includeInactive ? {} : { isActive: true }),
      },
      include: {
        timeType: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  createAbsenceType(tenantId: string, dto: CreateAbsenceTypeDto) {
    const code =
      dto.code?.trim() ||
      dto.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
        .slice(0, 24) ||
      `AT_${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.absenceType.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        paid: dto.paid ?? true,
        isActive: dto.isActive ?? true,
        description: dto.description?.trim() || null,
        calcKind: dto.calcKind === 'one_time' ? 'one_time' : 'annual',
        accrualName: dto.accrualName?.trim() || null,
        timeTypeId: dto.timeTypeId || null,
        allowEmployeeRequest: dto.allowEmployeeRequest ?? true,
        trackUnusedTime: dto.trackUnusedTime ?? false,
        requestTimeLimit: dto.requestTimeLimit ?? false,
        providedIn: dto.providedIn || 'working',
        isAnnual: dto.isAnnual ?? dto.calcKind === 'annual',
        daysPerYear: dto.daysPerYear ?? null,
        limitDays: dto.limitDays ?? null,
        monthlyQtyLimit: dto.monthlyQtyLimit ?? false,
        monthlyHourLimit: dto.monthlyHourLimit ?? false,
        carryoverPolicy: dto.carryoverPolicy?.trim() || null,
      },
      include: {
        timeType: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async getAbsenceType(tenantId: string, id: string) {
    const row = await this.prisma.absenceType.findFirst({
      where: { id, tenantId },
      include: {
        timeType: { select: { id: true, code: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Absence type not found');
    return row;
  }

  async updateAbsenceType(
    tenantId: string,
    id: string,
    dto: UpdateAbsenceTypeDto,
  ) {
    const row = await this.prisma.absenceType.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Absence type not found');
    return this.prisma.absenceType.update({
      where: { id },
      data: {
        ...(dto.code != null ? { code: dto.code.trim() } : {}),
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.paid != null ? { paid: dto.paid } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.calcKind != null
          ? { calcKind: dto.calcKind === 'one_time' ? 'one_time' : 'annual' }
          : {}),
        ...(dto.accrualName !== undefined
          ? { accrualName: dto.accrualName?.trim() || null }
          : {}),
        ...(dto.timeTypeId !== undefined
          ? { timeTypeId: dto.timeTypeId || null }
          : {}),
        ...(dto.allowEmployeeRequest != null
          ? { allowEmployeeRequest: dto.allowEmployeeRequest }
          : {}),
        ...(dto.trackUnusedTime != null
          ? { trackUnusedTime: dto.trackUnusedTime }
          : {}),
        ...(dto.requestTimeLimit != null
          ? { requestTimeLimit: dto.requestTimeLimit }
          : {}),
        ...(dto.providedIn != null ? { providedIn: dto.providedIn } : {}),
        ...(dto.isAnnual != null ? { isAnnual: dto.isAnnual } : {}),
        ...(dto.daysPerYear !== undefined ? { daysPerYear: dto.daysPerYear } : {}),
        ...(dto.limitDays !== undefined ? { limitDays: dto.limitDays } : {}),
        ...(dto.monthlyQtyLimit != null
          ? { monthlyQtyLimit: dto.monthlyQtyLimit }
          : {}),
        ...(dto.monthlyHourLimit != null
          ? { monthlyHourLimit: dto.monthlyHourLimit }
          : {}),
        ...(dto.carryoverPolicy !== undefined
          ? { carryoverPolicy: dto.carryoverPolicy?.trim() || null }
          : {}),
      },
      include: {
        timeType: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async deleteAbsenceType(tenantId: string, id: string) {
    const row = await this.prisma.absenceType.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { absences: true } } },
    });
    if (!row) throw new NotFoundException('Absence type not found');
    if (row._count.absences > 0) {
      return this.prisma.absenceType.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return this.prisma.absenceType.delete({ where: { id } });
  }

  private absenceDaysBetween(start: Date, end: Date) {
    const ms = Math.max(0, end.getTime() - start.getTime());
    return Math.floor(ms / 86400000) + 1;
  }

  private defaultAccrualPeriod(hiredAt?: Date | null) {
    const now = new Date();
    const year = now.getUTCFullYear();
    if (hiredAt) {
      const h = new Date(hiredAt);
      const start = new Date(Date.UTC(year, h.getUTCMonth(), h.getUTCDate()));
      if (start > now) {
        start.setUTCFullYear(year - 1);
      }
      const end = new Date(start);
      end.setUTCFullYear(start.getUTCFullYear() + 1);
      end.setUTCDate(end.getUTCDate() - 1);
      return { start, end };
    }
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31)),
    };
  }

  async listAbsenceTypeEmployees(
    tenantId: string,
    absenceTypeId: string,
    opts: {
      scope?: 'attached' | 'available';
      accrualKind?: string;
      q?: string;
    } = {},
  ) {
    const type = await this.prisma.absenceType.findFirst({
      where: { id: absenceTypeId, tenantId },
    });
    if (!type) throw new NotFoundException('Absence type not found');

    const scope = opts.scope === 'available' ? 'available' : 'attached';
    const accrualKind =
      opts.accrualKind === 'carryover' ? 'carryover' : 'planned';
    const q = (opts.q || '').trim().toLowerCase();

    const linked = await this.prisma.absenceTypeEmployee.findMany({
      where: { tenantId, absenceTypeId },
      select: { employeeId: true, accrualKind: true },
    });
    const attachedIds = [...new Set(linked.map((l) => l.employeeId))];

    if (scope === 'available') {
      const employees = await this.prisma.employee.findMany({
        where: {
          tenantId,
          status: 'active',
          ...(attachedIds.length ? { id: { notIn: attachedIds } } : {}),
        },
        select: {
          id: true,
          tabNumber: true,
          firstName: true,
          lastName: true,
          middleName: true,
          hiredAt: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 500,
      });
      const rows = employees
        .filter((e) => {
          if (!q) return true;
          const blob = [e.tabNumber, e.lastName, e.firstName, e.middleName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return blob.includes(q);
        })
        .map((e) => {
          const period = this.defaultAccrualPeriod(e.hiredAt);
          const accrued = Number(type.daysPerYear ?? type.limitDays ?? 0);
          return {
            id: e.id,
            employeeId: e.id,
            tabNumber: e.tabNumber,
            fullName: [e.lastName, e.firstName, e.middleName]
              .filter(Boolean)
              .join(' '),
            hiredAt: e.hiredAt,
            periodStart: period.start,
            periodEnd: period.end,
            accrued,
            used: 0,
            remaining: accrued,
            accrualKind: 'planned',
            attached: false,
          };
        });
      return {
        absenceType: {
          id: type.id,
          code: type.code,
          name: type.name,
          calcKind: type.calcKind,
          daysPerYear: type.daysPerYear,
          limitDays: type.limitDays,
          carryoverPolicy: type.carryoverPolicy,
        },
        scope,
        accrualKind,
        items: rows,
      };
    }

    const assignments = await this.prisma.absenceTypeEmployee.findMany({
      where: {
        tenantId,
        absenceTypeId,
        accrualKind,
      },
      include: {
        employee: {
          select: {
            id: true,
            tabNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
            hiredAt: true,
            status: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const employeeIds = assignments.map((a) => a.employeeId);
    const absences =
      employeeIds.length === 0
        ? []
        : await this.prisma.absence.findMany({
            where: {
              tenantId,
              absenceTypeId,
              employeeId: { in: employeeIds },
              status: { in: [RequestStatus.approved, RequestStatus.pending] },
            },
            select: {
              employeeId: true,
              startDate: true,
              endDate: true,
            },
          });

    const usedByEmp = new Map<string, number>();
    for (const a of absences) {
      const days = this.absenceDaysBetween(a.startDate, a.endDate);
      usedByEmp.set(a.employeeId, (usedByEmp.get(a.employeeId) || 0) + days);
    }

    const items = assignments
      .filter((a) => {
        if (!q) return true;
        const e = a.employee;
        const blob = [e.tabNumber, e.lastName, e.firstName, e.middleName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      })
      .map((a) => {
        const e = a.employee;
        const period =
          a.periodStart && a.periodEnd
            ? { start: a.periodStart, end: a.periodEnd }
            : this.defaultAccrualPeriod(e.hiredAt);
        const accrued = Number(a.accrued) || 0;
        const used = usedByEmp.get(e.id) || 0;
        return {
          id: a.id,
          assignmentId: a.id,
          employeeId: e.id,
          tabNumber: e.tabNumber,
          fullName: [e.lastName, e.firstName, e.middleName]
            .filter(Boolean)
            .join(' '),
          hiredAt: e.hiredAt,
          periodStart: period.start,
          periodEnd: period.end,
          accrued,
          used,
          remaining: Math.max(0, accrued - used),
          accrualKind: a.accrualKind,
          attached: true,
        };
      });

    return {
      absenceType: {
        id: type.id,
        code: type.code,
        name: type.name,
        calcKind: type.calcKind,
        daysPerYear: type.daysPerYear,
        limitDays: type.limitDays,
        carryoverPolicy: type.carryoverPolicy,
      },
      scope,
      accrualKind,
      items,
    };
  }

  async attachAbsenceTypeEmployees(
    tenantId: string,
    absenceTypeId: string,
    body: { employeeIds: string[]; accrualKind?: string },
  ) {
    const type = await this.prisma.absenceType.findFirst({
      where: { id: absenceTypeId, tenantId },
    });
    if (!type) throw new NotFoundException('Absence type not found');

    const accrualKind =
      body.accrualKind === 'carryover' ? 'carryover' : 'planned';
    const ids = [...new Set((body.employeeIds || []).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('employeeIds required');

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: ids }, status: 'active' },
      select: { id: true, hiredAt: true },
    });
    const defaultAccrued = Number(type.daysPerYear ?? type.limitDays ?? 0);
    let attached = 0;

    for (const emp of employees) {
      const period = this.defaultAccrualPeriod(emp.hiredAt);
      const accrued =
        accrualKind === 'carryover' ? 0 : defaultAccrued;
      await this.prisma.absenceTypeEmployee.upsert({
        where: {
          absenceTypeId_employeeId_accrualKind: {
            absenceTypeId,
            employeeId: emp.id,
            accrualKind,
          },
        },
        create: {
          tenantId,
          absenceTypeId,
          employeeId: emp.id,
          accrualKind,
          periodStart: period.start,
          periodEnd: period.end,
          accrued,
        },
        update: {
          periodStart: period.start,
          periodEnd: period.end,
          accrued,
        },
      });
      attached += 1;
    }

    return this.listAbsenceTypeEmployees(tenantId, absenceTypeId, {
      scope: 'attached',
      accrualKind,
    }).then((r) => ({ ok: attached, ...r }));
  }

  async detachAbsenceTypeEmployees(
    tenantId: string,
    absenceTypeId: string,
    body: { employeeIds: string[]; accrualKind?: string },
  ) {
    const type = await this.prisma.absenceType.findFirst({
      where: { id: absenceTypeId, tenantId },
    });
    if (!type) throw new NotFoundException('Absence type not found');

    const accrualKind =
      body.accrualKind === 'carryover' ? 'carryover' : 'planned';
    const ids = [...new Set((body.employeeIds || []).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('employeeIds required');

    const result = await this.prisma.absenceTypeEmployee.deleteMany({
      where: {
        tenantId,
        absenceTypeId,
        employeeId: { in: ids },
        accrualKind,
      },
    });

    return this.listAbsenceTypeEmployees(tenantId, absenceTypeId, {
      scope: 'attached',
      accrualKind,
    }).then((r) => ({ ok: result.count, ...r }));
  }

  listAbsences(
    tenantId: string,
    opts: {
      employeeId?: string;
      status?: string;
      from?: string;
      to?: string;
      q?: string;
      posted?: string;
      scope?: string;
      userEmail?: string;
    } = {},
  ) {
    if (typeof opts === 'string') {
      opts = { employeeId: opts };
    }
    const where: Prisma.AbsenceWhereInput = { tenantId };
    if (opts.scope === 'mine' && opts.userEmail) {
      where.employee = {
        email: { equals: opts.userEmail, mode: 'insensitive' },
      };
    } else if (opts.employeeId) {
      where.employeeId = opts.employeeId;
    }
    if (opts.posted === 'yes' || opts.status === 'posted' || opts.status === 'approved') {
      where.status = RequestStatus.approved;
    } else if (opts.posted === 'no' || opts.status === 'unposted') {
      where.status = { not: RequestStatus.approved };
    } else if (opts.status) {
      where.status = opts.status as RequestStatus;
    }
    if (opts.from || opts.to) {
      where.startDate = {};
      if (opts.from) where.startDate.gte = new Date(opts.from);
      if (opts.to) where.startDate.lte = new Date(opts.to);
    }
    const q = opts.q?.trim();
    if (q) {
      where.OR = [
        { note: { contains: q, mode: 'insensitive' } },
        { managerNote: { contains: q, mode: 'insensitive' } },
        { employee: { lastName: { contains: q, mode: 'insensitive' } } },
        { employee: { firstName: { contains: q, mode: 'insensitive' } } },
        { employee: { tabNumber: { contains: q, mode: 'insensitive' } } },
        { absenceType: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.absence.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            email: true,
          },
        },
        absenceType: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getAbsence(tenantId: string, id: string) {
    const row = await this.prisma.absence.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            email: true,
          },
        },
        absenceType: true,
      },
    });
    if (!row) throw new NotFoundException('Absence not found');
    return row;
  }

  async createAbsence(tenantId: string, dto: CreateAbsenceDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.assertDateRange(startDate, endDate);
    await this.assertNoAbsenceOverlap(tenantId, dto.employeeId, startDate, endDate);

    const daySpan =
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const requestKind =
      (dto.meta?.requestKind as string) ||
      (daySpan > 1 ? 'multi_day' : 'full_day');

    const absenceType = await this.prisma.absenceType.findFirst({
      where: { id: dto.absenceTypeId, tenantId },
    });
    if (!absenceType) throw new NotFoundException('Absence type not found');

    const number =
      dto.number?.trim() ||
      (typeof dto.meta?.number === 'string' ? dto.meta.number : null) ||
      `ABS-${Date.now().toString().slice(-8)}`;
    const documentType =
      dto.documentType?.trim() ||
      (typeof dto.meta?.documentType === 'string' ? dto.meta.documentType : null) ||
      absenceType.name;
    const documentDate =
      dto.documentDate ||
      (typeof dto.meta?.documentDate === 'string' ? dto.meta.documentDate : null) ||
      new Date().toISOString().slice(0, 10);

    const status = dto.status ?? RequestStatus.pending;

    const created = await this.prisma.absence.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        absenceTypeId: dto.absenceTypeId,
        startDate,
        endDate,
        startTime: dto.startTime || (typeof dto.meta?.startTime === 'string' ? dto.meta.startTime : null),
        endTime: dto.endTime || (typeof dto.meta?.endTime === 'string' ? dto.meta.endTime : null),
        note: dto.note,
        managerNote: dto.managerNote || null,
        status,
        meta: {
          ...(dto.meta ?? {}),
          requestKind,
          requestDate: new Date().toISOString(),
          number,
          documentType,
          documentDate,
        },
      },
      include: {
        absenceType: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });

    if (status === RequestStatus.approved) {
      await this.applyLeaveRange(tenantId, dto.employeeId, startDate, endDate);
    }

    return created;
  }

  async updateAbsence(tenantId: string, id: string, dto: UpdateAbsenceDto) {
    const row = await this.prisma.absence.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Absence not found');
    if (row.status === RequestStatus.approved) {
      throw new BadRequestException('Cannot edit posted absence — unpost first');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : row.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : row.endDate;
    this.assertDateRange(startDate, endDate);
    const employeeId = dto.employeeId || row.employeeId;
    if (
      dto.startDate ||
      dto.endDate ||
      dto.employeeId
    ) {
      await this.assertNoAbsenceOverlap(tenantId, employeeId, startDate, endDate, id);
    }

    const prevMeta =
      row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    const nextMeta: Record<string, unknown> = {
      ...prevMeta,
      ...(dto.meta ?? {}),
    };
    if (dto.number !== undefined) nextMeta.number = dto.number;
    if (dto.documentType !== undefined) nextMeta.documentType = dto.documentType;
    if (dto.documentDate !== undefined) nextMeta.documentDate = dto.documentDate;

    return this.prisma.absence.update({
      where: { id },
      data: {
        employeeId,
        absenceTypeId: dto.absenceTypeId || row.absenceTypeId,
        startDate,
        endDate,
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        note: dto.note !== undefined ? dto.note : row.note,
        ...(dto.managerNote !== undefined ? { managerNote: dto.managerNote } : {}),
        meta: nextMeta as Prisma.InputJsonValue,
      },
      include: {
        absenceType: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
  }

  async deleteAbsence(tenantId: string, id: string) {
    const row = await this.prisma.absence.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Absence not found');
    if (row.status === RequestStatus.approved) {
      await this.revertLeaveRange(tenantId, row.employeeId, row.startDate, row.endDate);
    }
    await this.prisma.absence.delete({ where: { id } });
    return { ok: true };
  }

  async updateAbsenceStatus(
    tenantId: string,
    id: string,
    status: RequestStatus,
    reviewNote?: string,
    actorName?: string,
  ) {
    const row = await this.prisma.absence.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Absence not found');

    const prev = row.status;
    const prevMeta =
      row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    const updated = await this.prisma.absence.update({
      where: { id },
      data: {
        status,
        ...(reviewNote !== undefined ? { managerNote: reviewNote } : {}),
        meta: {
          ...prevMeta,
          ...(reviewNote !== undefined ? { reviewNote } : {}),
          reviewedAt: new Date().toISOString(),
          ...(actorName
            ? status === RequestStatus.approved
              ? { confirmedBy: actorName }
              : { updatedBy: actorName }
            : {}),
        },
      },
      include: { absenceType: true, employee: true },
    });

    if (status === RequestStatus.approved && prev !== RequestStatus.approved) {
      await this.applyLeaveRange(tenantId, row.employeeId, row.startDate, row.endDate);
      await this.notifications.notifyApprovers(tenantId, {
        kind: 'approval',
        title: `Yo‘qlik tasdiqlandi: ${updated.employee.lastName} ${updated.employee.firstName}`,
        entity: 'absence',
        entityId: id,
        href: `/catalog/absence-requests/${id}`,
      });
    } else if (
      prev === RequestStatus.approved &&
      (status === RequestStatus.rejected ||
        status === RequestStatus.cancelled ||
        status === RequestStatus.pending)
    ) {
      await this.revertLeaveRange(tenantId, row.employeeId, row.startDate, row.endDate);
    }

    return updated;
  }

  /** Verifix actions: complete | cancel | restore | approve | reject */
  async applyAbsenceAction(
    tenantId: string,
    id: string,
    action: string,
    opts: { reviewNote?: string; actorName?: string } = {},
  ) {
    const row = await this.prisma.absence.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Absence not found');
    const prevMeta =
      row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    const act = action.toLowerCase();

    if (act === 'approve') {
      return this.updateAbsenceStatus(
        tenantId,
        id,
        RequestStatus.approved,
        opts.reviewNote,
        opts.actorName,
      );
    }
    if (act === 'reject') {
      return this.updateAbsenceStatus(
        tenantId,
        id,
        RequestStatus.rejected,
        opts.reviewNote,
        opts.actorName,
      );
    }
    if (act === 'cancel') {
      return this.updateAbsenceStatus(
        tenantId,
        id,
        RequestStatus.cancelled,
        opts.reviewNote,
        opts.actorName,
      );
    }
    if (act === 'complete') {
      return this.prisma.absence.update({
        where: { id },
        data: {
          status: RequestStatus.approved,
          meta: {
            ...prevMeta,
            completed: true,
            completedAt: new Date().toISOString(),
            completedBy: opts.actorName || String(prevMeta.completedBy || ''),
            updatedBy: opts.actorName || null,
          } as Prisma.InputJsonValue,
        },
        include: { absenceType: true, employee: true },
      });
    }
    if (act === 'restore') {
      const wasCompleted = !!prevMeta.completed;
      if (wasCompleted) {
        return this.prisma.absence.update({
          where: { id },
          data: {
            status: RequestStatus.approved,
            meta: {
              ...prevMeta,
              completed: false,
              completedAt: null,
              restoredAt: new Date().toISOString(),
              updatedBy: opts.actorName,
            },
          },
          include: { absenceType: true, employee: true },
        });
      }
      return this.updateAbsenceStatus(
        tenantId,
        id,
        RequestStatus.pending,
        opts.reviewNote,
        opts.actorName,
      );
    }
    throw new BadRequestException(`Unknown action: ${action}`);
  }

  async bulkAbsenceAction(
    tenantId: string,
    body: { ids: string[]; action: string; reviewNote?: string },
    opts: { actorName?: string } = {},
  ) {
    const ids = [...new Set((body.ids || []).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('ids required');
    const action = (body.action || '').toLowerCase();
    let ok = 0;
    let skipped = 0;
    const errors: { id: string; message: string }[] = [];

    for (const id of ids) {
      try {
        if (action === 'delete') {
          await this.deleteAbsence(tenantId, id);
        } else {
          await this.applyAbsenceAction(tenantId, id, action, {
            reviewNote: body.reviewNote,
            actorName: opts.actorName,
          });
        }
        ok += 1;
      } catch (e) {
        skipped += 1;
        errors.push({
          id,
          message: e instanceof Error ? e.message : 'error',
        });
      }
    }

    return { ok, skipped, errors: errors.slice(0, 10) };
  }

  listRequests(
    tenantId: string,
    opts: {
      status?: RequestStatus;
      type?: string;
      scope?: string;
      q?: string;
      userId?: string;
    } = {},
  ) {
    const where: Prisma.HrRequestWhereInput = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.type) where.type = opts.type as RequestType;
    const scope = opts.scope || 'all';
    if (scope === 'mine') {
      where.OR = [
        { visibility: 'personal' },
        ...(opts.userId ? [{ createdByUserId: opts.userId }] : []),
      ];
    } else if (scope === 'my_requests' || scope === 'created') {
      // Verifix «Мои запросы»: so‘rovlar foydalanuvchi tomonidan yaratilgan
      if (opts.userId) {
        where.createdByUserId = opts.userId;
      } else {
        where.visibility = 'shared';
      }
    } else if (scope === 'available') {
      // Verifix «Доступные»: shared/inbox of any status (pending, rejected, …)
      where.visibility = { in: ['shared', 'inbox'] };
    } else if (scope === 'to_me') {
      where.visibility = 'inbox';
      if (opts.userId) {
        where.OR = [{ assigneeUserId: opts.userId }, { assigneeUserId: null }];
      }
    } else if (scope === 'shared') {
      where.visibility = 'shared';
    } else if (scope === 'personal') {
      where.visibility = 'personal';
    }
    const q = (opts.q || '').trim();
    if (q) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { reviewNote: { contains: q, mode: 'insensitive' } },
            {
              employee: {
                OR: [
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { tabNumber: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
      ];
    }
    return this.prisma.hrRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            division: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequest(tenantId: string, id: string) {
    const row = await this.prisma.hrRequest.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            scheduleId: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  createRequest(tenantId: string, dto: CreateRequestDto, userId?: string) {
    const payload = { ...(dto.payload || {}) };
    const start = payload.startDate ?? payload.beginDate ?? payload.from;
    const end = payload.endDate ?? payload.to;
    if (start && end) {
      this.assertDateRange(new Date(String(start)), new Date(String(end)));
    }
    const swaps = Array.isArray(payload.swaps) ? payload.swaps : [];
    for (const s of swaps) {
      if (!s || typeof s !== 'object') continue;
      const pair = s as Record<string, unknown>;
      if (pair.fromDate) {
        const d = new Date(String(pair.fromDate));
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('Invalid swap fromDate');
        }
      }
      if (pair.toDate) {
        const d = new Date(String(pair.toDate));
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('Invalid swap toDate');
        }
      }
    }

    return this.prisma.hrRequest.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        type: dto.type,
        title: dto.title,
        payload: payload as Prisma.InputJsonValue,
        status: RequestStatus.pending,
        visibility: dto.visibility ?? 'shared',
        createdByUserId: userId ?? dto.createdByUserId,
        assigneeUserId: dto.assigneeUserId,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
  }

  async updateRequest(
    tenantId: string,
    id: string,
    dto: {
      employeeId?: string;
      title?: string;
      payload?: Record<string, unknown>;
      visibility?: string;
    },
  ) {
    const row = await this.prisma.hrRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (
      row.status !== RequestStatus.pending &&
      row.status !== RequestStatus.draft &&
      row.status !== RequestStatus.rejected
    ) {
      throw new BadRequestException(`Cannot edit request in status ${row.status}`);
    }
    const payload =
      dto.payload !== undefined
        ? { ...((row.payload as Record<string, unknown>) || {}), ...dto.payload }
        : undefined;
    return this.prisma.hrRequest.update({
      where: { id },
      data: {
        ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(payload !== undefined
          ? { payload: payload as Prisma.InputJsonValue }
          : {}),
        ...(dto.visibility != null ? { visibility: dto.visibility } : {}),
        ...(row.status === RequestStatus.rejected
          ? { status: RequestStatus.pending, reviewNote: null, reviewedBy: null }
          : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
  }

  async deleteRequest(tenantId: string, id: string) {
    const row = await this.prisma.hrRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status === RequestStatus.approved) {
      await this.revertScheduleChangeEffects(tenantId, row);
    }
    await this.prisma.hrRequest.delete({ where: { id } });
    return { ok: true };
  }

  async restoreRequest(tenantId: string, id: string, actor?: string) {
    const row = await this.prisma.hrRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (
      row.status !== RequestStatus.rejected &&
      row.status !== RequestStatus.cancelled &&
      row.status !== RequestStatus.approved
    ) {
      throw new BadRequestException(`Cannot restore request in status ${row.status}`);
    }
    if (row.status === RequestStatus.approved) {
      await this.revertScheduleChangeEffects(tenantId, row);
    }
    return this.prisma.hrRequest.update({
      where: { id },
      data: {
        status: RequestStatus.pending,
        reviewNote: [
          row.reviewNote,
          actor ? `[restored_by:${actor}]` : null,
          `[restored_at:${new Date().toISOString()}]`,
        ]
          .filter(Boolean)
          .join(' '),
        reviewedBy: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
  }

  async bulkRequestAction(
    tenantId: string,
    body: { ids: string[]; action: string; reviewNote?: string },
    opts: { actorName?: string } = {},
  ) {
    const ids = [...new Set((body.ids || []).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('ids required');
    const action = (body.action || '').toLowerCase();
    let ok = 0;
    let skipped = 0;
    const errors: { id: string; message: string }[] = [];

    for (const id of ids) {
      try {
        if (action === 'delete') {
          await this.deleteRequest(tenantId, id);
        } else if (action === 'approve') {
          await this.reviewRequest(
            tenantId,
            id,
            { status: RequestStatus.approved, reviewNote: body.reviewNote },
            opts.actorName,
          );
        } else if (action === 'reject') {
          await this.reviewRequest(
            tenantId,
            id,
            { status: RequestStatus.rejected, reviewNote: body.reviewNote },
            opts.actorName,
          );
        } else if (action === 'restore') {
          await this.restoreRequest(tenantId, id, opts.actorName);
        } else if (action === 'cancel') {
          await this.cancelRequest(tenantId, id, opts.actorName);
        } else {
          throw new BadRequestException(`Unknown action: ${action}`);
        }
        ok += 1;
      } catch (e) {
        skipped += 1;
        errors.push({
          id,
          message: e instanceof Error ? e.message : 'error',
        });
      }
    }

    return { ok, skipped, errors: errors.slice(0, 10) };
  }

  private async revertScheduleChangeEffects(
    tenantId: string,
    row: { id: string; employeeId: string; type: RequestType; payload: Prisma.JsonValue | null },
  ) {
    if (
      row.type !== RequestType.schedule_change &&
      row.type !== RequestType.roster_change
    ) {
      return;
    }
    await this.prisma.employeeScheduleOverride.deleteMany({
      where: {
        tenantId,
        employeeId: row.employeeId,
        note: { contains: `request ${row.id}` },
      },
    });
  }

  async reviewRequest(
    tenantId: string,
    id: string,
    dto: ReviewRequestDto,
    reviewedBy?: string,
  ) {
    const row = await this.prisma.hrRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (dto.status !== RequestStatus.approved && dto.status !== RequestStatus.rejected) {
      throw new BadRequestException('status must be approved or rejected');
    }
    if (row.status !== RequestStatus.pending && row.status !== RequestStatus.draft) {
      throw new BadRequestException(`Cannot review request in status ${row.status}`);
    }

    const auditNote = [
      dto.reviewNote?.trim(),
      reviewedBy ? `[actor:${reviewedBy}]` : null,
      `[at:${new Date().toISOString()}]`,
    ]
      .filter(Boolean)
      .join(' ');

    const updated = await this.prisma.hrRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewNote: auditNote || undefined,
        reviewedBy: reviewedBy ?? undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });

    if (dto.status === RequestStatus.approved) {
      await this.applyApprovedRequest(tenantId, updated);
    }

    await this.notifications.notifyApprovers(tenantId, {
      kind: 'approval',
      title: `Запрос ${dto.status === RequestStatus.approved ? 'утверждён' : 'отклонён'}: ${row.title}`,
      entity: 'hr-request',
      entityId: id,
      href: `/attendance?tab=requests&scope=to_me`,
    });

    return updated;
  }

  async cancelRequest(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.hrRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Request not found');
    if (
      row.status !== RequestStatus.pending &&
      row.status !== RequestStatus.draft &&
      row.status !== RequestStatus.approved
    ) {
      throw new BadRequestException(`Cannot cancel request in status ${row.status}`);
    }

    // Revert side-effects if cancelling an approved absence / schedule request
    if (row.status === RequestStatus.approved && row.type === RequestType.absence) {
      const payload = (row.payload as Record<string, unknown>) || {};
      const start = payload.startDate
        ? new Date(String(payload.startDate))
        : payload.from
          ? new Date(String(payload.from))
          : null;
      const end = payload.endDate
        ? new Date(String(payload.endDate))
        : payload.to
          ? new Date(String(payload.to))
          : start;
      if (start && end) {
        await this.revertLeaveRange(tenantId, row.employeeId, start, end);
      }
    }
    if (
      row.status === RequestStatus.approved &&
      (row.type === RequestType.schedule_change ||
        row.type === RequestType.roster_change)
    ) {
      await this.revertScheduleChangeEffects(tenantId, row);
    }

    return this.prisma.hrRequest.update({
      where: { id },
      data: {
        status: RequestStatus.cancelled,
        reviewNote: [
          row.reviewNote,
          cancelledBy ? `[cancelled_by:${cancelledBy}]` : null,
          `[cancelled_at:${new Date().toISOString()}]`,
        ]
          .filter(Boolean)
          .join(' '),
        reviewedBy: cancelledBy ?? row.reviewedBy ?? undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });
  }

  async listDocuments(
    tenantId: string,
    query: {
      q?: string;
      type?: DocumentType | string;
      status?: string;
      employeeId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const where: Prisma.HrDocumentWhereInput = { tenantId };
    if (query.type) where.type = query.type as DocumentType;
    if (query.status === 'unposted' || query.status === '!posted') {
      where.status = { not: DocumentLifecycle.posted };
    } else if (query.status) {
      where.status = query.status as DocumentLifecycle;
    }
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.from || query.to) {
      where.documentDate = {};
      if (query.from) where.documentDate.gte = new Date(query.from);
      if (query.to) where.documentDate.lte = new Date(query.to);
    }
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { employee: { lastName: { contains: q, mode: 'insensitive' } } },
        { employee: { firstName: { contains: q, mode: 'insensitive' } } },
        { employee: { tabNumber: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const paginate = query.page != null || query.limit != null;

    const include = {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          divisionId: true,
          positionId: true,
          division: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, name: true } },
        },
      },
    } as const;

    if (!paginate) {
      const rows = await this.prisma.hrDocument.findMany({
        where,
        include,
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      });
      return this.enrichDocumentList(tenantId, rows);
    }

    const [total, items] = await Promise.all([
      this.prisma.hrDocument.count({ where }),
      this.prisma.hrDocument.findMany({
        where,
        include,
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: await this.enrichDocumentList(tenantId, items),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private positionPath(
    division?: { code?: string | null; name?: string | null } | null,
    position?: { code?: string | null; name?: string | null } | null,
  ) {
    const parts = [division?.code, position?.code || position?.name].filter(Boolean);
    return parts.length ? parts.join('/') : null;
  }

  private async enrichDocumentList<
    T extends {
      documentDate: Date;
      payload: Prisma.JsonValue | null;
      employee: {
        division?: { id: string; code: string; name: string } | null;
        position?: { id: string; code: string; name: string } | null;
      };
    },
  >(tenantId: string, rows: T[]) {
    const [setting, tenant] = await Promise.all([
      this.prisma.tenantSetting.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
    ]);
    const organization =
      setting?.legalName || setting?.orgName || tenant?.name || '—';

    const posIds = new Set<string>();
    const divIds = new Set<string>();
    for (const row of rows) {
      const p = (row.payload as Record<string, unknown>) || {};
      for (const key of [
        'positionId',
        'oldPositionId',
        'previousPositionId',
        'toPositionId',
        'fromPositionId',
      ]) {
        if (p[key]) posIds.add(String(p[key]));
      }
      for (const key of [
        'divisionId',
        'oldDivisionId',
        'previousDivisionId',
        'toDivisionId',
        'fromDivisionId',
      ]) {
        if (p[key]) divIds.add(String(p[key]));
      }
    }

    const [positions, divisions] = await Promise.all([
      posIds.size
        ? this.prisma.position.findMany({
            where: { tenantId, id: { in: [...posIds] } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
      divIds.size
        ? this.prisma.division.findMany({
            where: { tenantId, id: { in: [...divIds] } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const posById = new Map(positions.map((x) => [x.id, x]));
    const divById = new Map(divisions.map((x) => [x.id, x]));

    return rows.map((row) => {
      const payload = (row.payload as Record<string, unknown>) || {};
      const fromDivId =
        (payload.oldDivisionId as string) ||
        (payload.previousDivisionId as string) ||
        (payload.fromDivisionId as string) ||
        null;
      const toDivId =
        (payload.divisionId as string) ||
        (payload.toDivisionId as string) ||
        null;
      const fromPosId =
        (payload.oldPositionId as string) ||
        (payload.previousPositionId as string) ||
        (payload.fromPositionId as string) ||
        null;
      const toPosId =
        (payload.positionId as string) ||
        (payload.toPositionId as string) ||
        null;

      const fromDiv = fromDivId
        ? divById.get(fromDivId)
        : row.employee.division;
      const toDiv = toDivId ? divById.get(toDivId) : null;
      const fromPos = fromPosId
        ? posById.get(fromPosId)
        : row.employee.position;
      const toPos = toPosId ? posById.get(toPosId) : null;

      const transferFrom =
        (payload.transferFrom as string) ||
        (payload.startDate as string) ||
        (payload.from as string) ||
        row.documentDate;
      const transferTo =
        (payload.transferTo as string) ||
        (payload.endDate as string) ||
        (payload.to as string) ||
        null;

      const positionBefore =
        (payload.fromPositionLabel as string) ||
        (payload.oldPositionLabel as string) ||
        this.positionPath(fromDiv, fromPos) ||
        null;
      const positionAfter =
        (payload.toPositionLabel as string) ||
        (payload.newPositionLabel as string) ||
        this.positionPath(toDiv, toPos) ||
        null;

      return {
        ...row,
        organization,
        transferFrom,
        transferTo,
        positionBefore,
        positionAfter,
      };
    });
  }

  async getDocument(tenantId: string, id: string) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          include: {
            division: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, name: true, code: true } },
            grade: { select: { id: true, name: true, code: true } },
            schedule: true,
            region: { select: { id: true, name: true, code: true } },
            person: true,
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const payload = (doc.payload as Record<string, unknown>) || {};
    const files = await this.refreshFileUrls(this.readFiles(payload));
    return {
      ...doc,
      payload: { ...payload, files },
      tabs: this.buildDocTabs(doc, payload, files),
    };
  }

  private readFiles(payload: Record<string, unknown>): HrDocFile[] {
    if (!Array.isArray(payload.files)) return [];
    return payload.files
      .filter((f) => f && typeof f === 'object')
      .map((f) => {
        const row = f as Record<string, unknown>;
        return {
          id: String(row.id || randomUUID()),
          name: String(row.name || 'file'),
          key: String(row.key || ''),
          contentType: String(row.contentType || 'application/octet-stream'),
          size: Number(row.size || 0),
          url: row.url != null ? String(row.url) : undefined,
          uploadedAt: String(row.uploadedAt || new Date().toISOString()),
          uploadedBy: row.uploadedBy != null ? String(row.uploadedBy) : null,
        };
      });
  }

  private async refreshFileUrls(files: HrDocFile[]): Promise<HrDocFile[]> {
    const out: HrDocFile[] = [];
    for (const f of files) {
      if (!f.key) {
        out.push(f);
        continue;
      }
      try {
        if (f.key.startsWith('data:') || f.url?.startsWith('data:')) {
          out.push(f);
        } else {
          const url = await this.storage.getSignedGetUrl(f.key);
          out.push({ ...f, url: url || undefined });
        }
      } catch {
        out.push(f);
      }
    }
    return out;
  }

  private buildDocTabs(
    doc: {
      number?: string | null;
      title: string;
      documentDate: Date;
      employee: {
        hiredAt?: Date | null;
        baseSalary?: Prisma.Decimal | null;
        employmentSource?: string | null;
        division?: { name: string } | null;
        position?: { name: string; code?: string | null } | null;
        grade?: { name: string } | null;
        schedule?: { name: string; startTime: string; endTime: string } | null;
      };
    },
    payload: Record<string, unknown>,
    files: HrDocFile[],
  ) {
    const contract =
      payload.contract && typeof payload.contract === 'object'
        ? (payload.contract as Record<string, unknown>)
        : {};
    const vacationLimit = Array.isArray(payload.vacationLimit)
      ? payload.vacationLimit
      : [];
    return {
      main: {
        hireDate: doc.employee.hiredAt,
        probation: payload.probation != null ? String(payload.probation) : null,
        schedule: doc.employee.schedule,
        division: doc.employee.division,
        position: doc.employee.position,
        grade: doc.employee.grade,
        employmentKind: String(
          payload.employmentKind || 'Основное место работы',
        ),
        source:
          payload.source != null
            ? String(payload.source)
            : doc.employee.employmentSource ?? null,
        documentName: doc.title,
        staffPositionLabel: [
          doc.employee.position?.code || doc.employee.position?.name,
          doc.employee.division?.name,
        ]
          .filter(Boolean)
          .join(' / '),
      },
      payroll: {
        baseSalary:
          payload.baseSalary != null
            ? payload.baseSalary
            : doc.employee.baseSalary != null
              ? Number(doc.employee.baseSalary)
              : null,
        paymentType:
          payload.paymentType != null ? String(payload.paymentType) : null,
      },
      vacationLimit,
      contract: {
        number: contract.number != null ? String(contract.number) : doc.number,
        date:
          contract.date != null
            ? String(contract.date)
            : doc.documentDate.toISOString(),
        startDate:
          contract.startDate != null ? String(contract.startDate) : null,
        endDate: contract.endDate != null ? String(contract.endDate) : null,
      },
      files,
    };
  }

  async listDocumentFiles(tenantId: string, id: string) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
      select: { id: true, payload: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const payload = (doc.payload as Record<string, unknown>) || {};
    return this.refreshFileUrls(this.readFiles(payload));
  }

  async addDocumentFile(
    tenantId: string,
    id: string,
    file: Express.Multer.File,
    userId?: string | null,
    userLabel?: string | null,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Cannot attach files to cancelled document');
    }
    const fileId = randomUUID();
    const safeName = (file.originalname || 'file')
      .replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_')
      .slice(0, 120);
    const key = `hr-docs/${tenantId}/${id}/${fileId}-${safeName}`;
    const stored = await this.storage.putObject(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    const entry: HrDocFile = {
      id: fileId,
      name: file.originalname || safeName,
      key: stored.key,
      contentType: file.mimetype || 'application/octet-stream',
      size: file.size,
      url: stored.url,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userLabel || userId || null,
    };
    const payload = (doc.payload as Record<string, unknown>) || {};
    const files = [...this.readFiles(payload), entry];
    await this.prisma.hrDocument.update({
      where: { id },
      data: {
        payload: { ...payload, files } as Prisma.InputJsonValue,
      },
    });
    await this.writeDocAudit(tenantId, id, userId, userLabel, 'hr-document.update', {
      fileAdded: entry.name,
    });
    return entry;
  }

  async deleteDocumentFile(
    tenantId: string,
    id: string,
    fileId: string,
    userId?: string | null,
    userLabel?: string | null,
  ) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Cannot modify cancelled document files');
    }
    const payload = (doc.payload as Record<string, unknown>) || {};
    const files = this.readFiles(payload);
    const target = files.find((f) => f.id === fileId);
    if (!target) throw new NotFoundException('File not found');
    if (target.key && !target.key.startsWith('data:')) {
      await this.storage.deleteObject(target.key);
    }
    const next = files.filter((f) => f.id !== fileId);
    await this.prisma.hrDocument.update({
      where: { id },
      data: {
        payload: { ...payload, files: next } as Prisma.InputJsonValue,
      },
    });
    await this.writeDocAudit(tenantId, id, userId, userLabel, 'hr-document.update', {
      fileRemoved: target.name,
    });
    return { ok: true };
  }

  async getDocumentFileUrl(tenantId: string, id: string, fileId: string) {
    const files = await this.listDocumentFiles(tenantId, id);
    const file = files.find((f) => f.id === fileId);
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async exportDocumentsXlsx(
    tenantId: string,
    query: {
      q?: string;
      type?: DocumentType | string;
      status?: string;
      employeeId?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const data = await this.listDocuments(tenantId, {
      ...query,
      page: 1,
      limit: 5000,
    });
    const items = Array.isArray(data) ? data : data.items;
    const isTransfer = query.type === DocumentType.transfer || query.type === 'transfer';
    const columns = isTransfer
      ? [
          'Дата',
          'Номер',
          'Сотрудник',
          'Организация',
          'Перевод с',
          'Перевод по',
          'Позиция (до перевода)',
          'Позиция (после перевода)',
          'Проведен',
        ]
      : [
          'Дата',
          'Номер',
          'Тип документа',
          'Сотрудник',
          'Таб. №',
          'Статус',
          'Проведен',
          'Заголовок',
        ];
    const rows = items.map((row) => {
      const emp = row.employee as {
        lastName?: string;
        firstName?: string;
        middleName?: string | null;
        tabNumber?: string;
      };
      const name = [emp?.lastName, emp?.firstName, emp?.middleName]
        .filter(Boolean)
        .join(' ');
      const enriched = row as typeof row & {
        organization?: string | null;
        transferFrom?: string | Date | null;
        transferTo?: string | Date | null;
        positionBefore?: string | null;
        positionAfter?: string | null;
      };
      const fmt = (v?: string | Date | null) => {
        if (!v) return '';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
      };
      if (isTransfer) {
        return {
          Дата: fmt(row.documentDate),
          Номер: row.number || '',
          Сотрудник: name,
          Организация: enriched.organization || '',
          'Перевод с': fmt(enriched.transferFrom),
          'Перевод по': fmt(enriched.transferTo),
          'Позиция (до перевода)': enriched.positionBefore || '',
          'Позиция (после перевода)': enriched.positionAfter || '',
          Проведен: row.status === 'posted' ? 'Да' : 'Нет',
        };
      }
      return {
        Дата: fmt(row.documentDate),
        Номер: row.number || '',
        'Тип документа': DOC_TYPE_LABELS[row.type] || row.type,
        Сотрудник: name,
        'Таб. №': emp?.tabNumber || '',
        Статус: row.status,
        Проведен: row.status === 'posted' ? 'Да' : 'Нет',
        Заголовок: row.title,
      };
    });
    const buffer = await buildExcelBuffer({
      sheetName: isTransfer ? 'Кадровые переводы' : 'Кадровые документы',
      columns,
      rows,
    });
    return {
      buffer,
      filename: `${isTransfer ? 'transfers' : 'hr-documents'}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  async documentHistory(tenantId: string, id: string) {
    const doc = await this.getDocument(tenantId, id);
    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, entity: 'HrDocument', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const payload = (doc.payload as Record<string, unknown>) || {};
    const empName = [doc.employee.lastName, doc.employee.firstName, doc.employee.middleName]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    const mapLog = (log: {
      createdAt: Date;
      action: string;
      meta: unknown;
    }) => {
      const meta =
        log.meta && typeof log.meta === 'object' && !Array.isArray(log.meta)
          ? (log.meta as Record<string, unknown>)
          : {};
      const eventMap: Record<string, string> = {
        'hr-document.create': 'Добавлен',
        'hr-document.update': 'Обновлен',
        'hr-document.post': 'Проведен',
        'hr-document.unpost': 'Отменено проведение',
        'hr-document.cancel': 'Отменен',
      };
      return {
        occurredAt: log.createdAt.toISOString(),
        userName: String(meta.userName || '—'),
        event: eventMap[log.action] || log.action,
        documentType: DOC_TYPE_LABELS[doc.type] || doc.title,
        posted: doc.status === DocumentLifecycle.posted,
        employeeName: empName,
        details: meta,
      };
    };

    const documentRows = logs.map(mapLog);
    if (!documentRows.length) {
      documentRows.push({
        occurredAt: doc.createdAt.toISOString(),
        userName: String(doc.postedBy || '—'),
        event: 'Добавлен',
        documentType: DOC_TYPE_LABELS[doc.type] || doc.title,
        posted: doc.status === DocumentLifecycle.posted,
        employeeName: empName,
        details: {},
      });
      if (doc.postedAt) {
        documentRows.unshift({
          occurredAt: doc.postedAt.toISOString(),
          userName: String(doc.postedBy || '—'),
          event: 'Проведен',
          documentType: DOC_TYPE_LABELS[doc.type] || doc.title,
          posted: true,
          employeeName: empName,
          details: {},
        });
      }
    }

    const hireRows =
      doc.type === DocumentType.hire
        ? [
            {
              occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
              userName: String(doc.postedBy || '—'),
              event: 'Добавлен',
              hireDate: doc.employee.hiredAt?.toISOString() || doc.documentDate.toISOString(),
              probation: String(payload.probation ?? '0'),
            },
          ]
        : [];

    const positionRows = [
      {
        occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
        userName: String(doc.postedBy || '—'),
        event: 'Добавлен',
        employmentKind: String(payload.employmentKind || 'Основное место работы'),
        positionLabel: [
          doc.employee.position?.code || doc.employee.position?.name,
          doc.employee.division?.name,
        ]
          .filter(Boolean)
          .join('/'),
      },
    ];

    const scheduleRows = doc.employee.schedule
      ? [
          {
            occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
            userName: String(doc.postedBy || '—'),
            event: 'Добавлен',
            schedule: `${doc.employee.schedule.startTime}-${doc.employee.schedule.endTime} · ${doc.employee.schedule.name}`,
          },
        ]
      : [];

    const contractMeta =
      payload.contract && typeof payload.contract === 'object'
        ? (payload.contract as Record<string, unknown>)
        : {};
    const contractRows =
      contractMeta.number || contractMeta.date || doc.number
        ? [
            {
              occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
              userName: String(doc.postedBy || '—'),
              event: 'Добавлен',
              contractDate: String(contractMeta.date || doc.documentDate.toISOString()),
              startDate: contractMeta.startDate
                ? String(contractMeta.startDate)
                : null,
              endDate: contractMeta.endDate ? String(contractMeta.endDate) : null,
              contractNumber: String(contractMeta.number || doc.number || ''),
            },
          ]
        : [];

    const accrualRows =
      payload.baseSalary != null || payload.newAmount != null
        ? [
            {
              occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
              userName: String(doc.postedBy || '—'),
              event: 'Добавлен',
              accrual: 'Оклад',
              value: String(payload.baseSalary ?? payload.newAmount ?? ''),
            },
          ]
        : [];

    const indicatorRows: {
      occurredAt: string;
      userName: string;
      event: string;
      indicator: string;
      value: string;
    }[] = [];
    if (payload.probation != null && String(payload.probation) !== '') {
      indicatorRows.push({
        occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
        userName: String(doc.postedBy || '—'),
        event: 'Добавлен',
        indicator: 'Испыт. срок',
        value: String(payload.probation),
      });
    }
    if (payload.employmentKind) {
      indicatorRows.push({
        occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
        userName: String(doc.postedBy || '—'),
        event: 'Добавлен',
        indicator: 'Вид занятости',
        value: String(payload.employmentKind),
      });
    }
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (files.length) {
      indicatorRows.push({
        occurredAt: (doc.postedAt || doc.createdAt).toISOString(),
        userName: String(doc.postedBy || '—'),
        event: 'Добавлен',
        indicator: 'Файлы',
        value: String(files.length),
      });
    }

    return {
      document: documentRows,
      page: documentRows,
      hire: hireRows,
      positions: positionRows,
      contracts: contractRows,
      schedules: scheduleRows,
      accruals: accrualRows,
      indicators: indicatorRows,
    };
  }

  async createDocument(
    tenantId: string,
    dto: CreateDocumentDto,
    userId?: string | null,
    userLabel?: string | null,
  ) {
    const payload = { ...(dto.payload || {}) };
    if (dto.type === DocumentType.transfer || dto.type === DocumentType.hire) {
      if (dto.type === DocumentType.transfer && !payload.divisionId && !payload.positionId) {
        throw new BadRequestException(
          'Transfer requires payload.divisionId and/or payload.positionId',
        );
      }
    }

    if (dto.type === DocumentType.transfer) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId },
        include: {
          division: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, name: true } },
        },
      });
      if (!emp) throw new NotFoundException('Employee not found');

      if (payload.oldDivisionId == null && emp.divisionId) {
        payload.oldDivisionId = emp.divisionId;
        payload.previousDivisionId = emp.divisionId;
      }
      if (payload.oldPositionId == null && emp.positionId) {
        payload.oldPositionId = emp.positionId;
        payload.previousPositionId = emp.positionId;
      }
      if (!payload.fromPositionLabel) {
        payload.fromPositionLabel =
          this.positionPath(emp.division, emp.position) || undefined;
      }
      if (!payload.transferFrom) {
        payload.transferFrom = dto.documentDate;
      }

      const toDivId = payload.divisionId ? String(payload.divisionId) : null;
      const toPosId = payload.positionId ? String(payload.positionId) : null;
      if (!payload.toPositionLabel && (toDivId || toPosId)) {
        const [toDiv, toPos] = await Promise.all([
          toDivId
            ? this.prisma.division.findFirst({
                where: { id: toDivId, tenantId },
                select: { code: true, name: true },
              })
            : Promise.resolve(null),
          toPosId
            ? this.prisma.position.findFirst({
                where: { id: toPosId, tenantId },
                select: { code: true, name: true },
              })
            : Promise.resolve(null),
        ]);
        payload.toPositionLabel =
          this.positionPath(toDiv, toPos) || undefined;
      }
    }

    const number = dto.number?.trim() || (await this.nextDocumentNumber(tenantId));
    const title = dto.title?.trim() || DOC_TYPE_LABELS[dto.type] || 'Кадровый документ';
    const created = await this.prisma.hrDocument.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        type: dto.type,
        title,
        number,
        documentDate: new Date(dto.documentDate),
        note: dto.note,
        payload: payload as Prisma.InputJsonValue,
        status: DocumentLifecycle.draft,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
    await this.writeDocAudit(tenantId, created.id, userId, userLabel, 'hr-document.create');
    const enriched = await this.enrichDocumentList(tenantId, [
      {
        ...created,
        employee: {
          ...created.employee,
          division: null,
          position: null,
        },
      },
    ]);
    return enriched[0] ?? created;
  }

  async updateDocument(
    tenantId: string,
    id: string,
    dto: UpdateDocumentDto,
    userId?: string | null,
    userLabel?: string | null,
  ) {
    const doc = await this.prisma.hrDocument.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status !== DocumentLifecycle.draft) {
      throw new BadRequestException('Only draft documents can be edited');
    }
    const data: Prisma.HrDocumentUpdateInput = {};
    if (dto.title != null) data.title = dto.title;
    if (dto.number != null) data.number = dto.number;
    if (dto.note != null) data.note = dto.note;
    if (dto.documentDate != null) data.documentDate = new Date(dto.documentDate);
    if (dto.employeeId != null) {
      data.employee = { connect: { id: dto.employeeId } };
    }
    if (dto.payload != null) {
      data.payload = {
        ...((doc.payload as Record<string, unknown>) || {}),
        ...dto.payload,
      } as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.hrDocument.update({
      where: { id },
      data,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
    if (doc.type === DocumentType.hire && dto.payload && dto.payload.source != null) {
      const src = String(dto.payload.source).trim();
      await this.prisma.employee.update({
        where: { id: updated.employee.id },
        data: { employmentSource: src || null },
      });
    }
    await this.writeDocAudit(tenantId, id, userId, userLabel, 'hr-document.update');
    return updated;
  }

  async postDocument(
    tenantId: string,
    id: string,
    postedBy?: string,
    userId?: string | null,
  ) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
      include: { employee: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Document already posted');
    }
    if (doc.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Cancelled document cannot be posted');
    }

    // Duplicate prevention: same employee + type + date already posted
    const dup = await this.prisma.hrDocument.findFirst({
      where: {
        tenantId,
        employeeId: doc.employeeId,
        type: doc.type,
        status: DocumentLifecycle.posted,
        documentDate: doc.documentDate,
        id: { not: doc.id },
      },
    });
    if (dup) {
      throw new BadRequestException(
        `Duplicate posted ${doc.type} document already exists for this employee on ${doc.documentDate.toISOString().slice(0, 10)}`,
      );
    }

    const payload = { ...((doc.payload as Record<string, unknown>) || {}) };
    const emp = doc.employee;
    // Snapshot previous employee state so unpost can reverse hire/transfer/dismiss/name/wage.
    const snapshot: Record<string, unknown> = {
      ...payload,
      previousStatus: payload.previousStatus ?? emp.status,
      oldDivisionId: payload.oldDivisionId ?? payload.previousDivisionId ?? emp.divisionId,
      previousDivisionId: payload.previousDivisionId ?? payload.oldDivisionId ?? emp.divisionId,
      oldPositionId: payload.oldPositionId ?? payload.previousPositionId ?? emp.positionId,
      previousPositionId: payload.previousPositionId ?? payload.oldPositionId ?? emp.positionId,
      oldStaffPositionId: payload.oldStaffPositionId ?? emp.staffPositionId,
      oldGradeId: payload.oldGradeId ?? emp.gradeId,
      oldScheduleId: payload.oldScheduleId ?? emp.scheduleId,
      oldLastName: payload.oldLastName ?? emp.lastName,
      oldFirstName: payload.oldFirstName ?? emp.firstName,
      oldMiddleName: payload.oldMiddleName !== undefined ? payload.oldMiddleName : emp.middleName,
      oldAmount:
        payload.oldAmount != null
          ? payload.oldAmount
          : emp.baseSalary != null
            ? Number(emp.baseSalary)
            : null,
      previousBaseSalary:
        payload.previousBaseSalary != null
          ? payload.previousBaseSalary
          : emp.baseSalary != null
            ? Number(emp.baseSalary)
            : null,
      previousDismissedAt: payload.previousDismissedAt ?? emp.dismissedAt,
      previousDismissalReasonId:
        payload.previousDismissalReasonId ?? emp.dismissalReasonId ?? null,
      // Position history entry (Verifix journal carries from→to)
      positionHistory: {
        fromDivisionId: emp.divisionId,
        fromPositionId: emp.positionId,
        fromStaffPositionId: emp.staffPositionId,
        toDivisionId: payload.divisionId ?? emp.divisionId,
        toPositionId: payload.positionId ?? emp.positionId,
        toStaffPositionId: payload.staffPositionId ?? emp.staffPositionId,
        effectiveAt: doc.documentDate,
      },
    };

    const empUpdate: Prisma.EmployeeUpdateInput = {};

    switch (doc.type) {
      case DocumentType.hire:
        empUpdate.status = EmploymentStatus.active;
        if (payload.divisionId) {
          empUpdate.division = { connect: { id: String(payload.divisionId) } };
        }
        if (payload.positionId) {
          empUpdate.position = { connect: { id: String(payload.positionId) } };
        }
        if (payload.staffPositionId) {
          empUpdate.staffPosition = { connect: { id: String(payload.staffPositionId) } };
        }
        if (payload.baseSalary != null) {
          empUpdate.baseSalary = new Prisma.Decimal(Number(payload.baseSalary));
        }
        if (payload.source != null) {
          const src = String(payload.source).trim();
          empUpdate.employmentSource = src || null;
        }
        if (!emp.hiredAt) {
          empUpdate.hiredAt = doc.documentDate;
        }
        break;
      case DocumentType.transfer:
        if (payload.divisionId) {
          empUpdate.division = { connect: { id: String(payload.divisionId) } };
        }
        if (payload.positionId) {
          empUpdate.position = { connect: { id: String(payload.positionId) } };
        }
        if (payload.staffPositionId) {
          empUpdate.staffPosition = { connect: { id: String(payload.staffPositionId) } };
        }
        if (payload.gradeId) {
          empUpdate.grade = { connect: { id: String(payload.gradeId) } };
        }
        if (payload.scheduleId) {
          empUpdate.schedule = { connect: { id: String(payload.scheduleId) } };
        }
        if (payload.baseSalary != null) {
          empUpdate.baseSalary = new Prisma.Decimal(Number(payload.baseSalary));
        }
        break;
      case DocumentType.dismiss:
        empUpdate.status = EmploymentStatus.dismissed;
        empUpdate.dismissedAt = doc.documentDate;
        if (payload.dismissalReasonId) {
          empUpdate.dismissalReason = {
            connect: { id: String(payload.dismissalReasonId) },
          };
        }
        // Cascade: clear schedule assignment
        empUpdate.schedule = { disconnect: true };
        break;
      case DocumentType.name_change:
        if (payload.newLastName) empUpdate.lastName = String(payload.newLastName);
        if (payload.newFirstName) empUpdate.firstName = String(payload.newFirstName);
        if (payload.newMiddleName !== undefined) {
          empUpdate.middleName =
            payload.newMiddleName != null ? String(payload.newMiddleName) : null;
        }
        break;
      case DocumentType.wage_change:
        if (payload.newAmount != null) {
          empUpdate.baseSalary = new Prisma.Decimal(Number(payload.newAmount));
        }
        break;
      default:
        break;
    }

    if (Object.keys(empUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: doc.employeeId },
        data: empUpdate,
      });
    }

    if (doc.type === DocumentType.dismiss) {
      await this.applyDismissCascades(tenantId, doc.employeeId, doc.documentDate);
    }

    if (doc.type === DocumentType.transfer && payload.gradeId) {
      await this.prisma.employeeGradeHistory.create({
        data: {
          tenantId,
          employeeId: doc.employeeId,
          gradeId: String(payload.gradeId),
          effectiveAt: doc.documentDate,
          note: `From transfer document ${doc.id}`,
        },
      });
    }

    const updated = await this.prisma.hrDocument.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        payload: snapshot as Prisma.InputJsonValue,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true, status: true } },
      },
    });

    await this.notifications.notifyApprovers(tenantId, {
      kind: 'info',
      title: `Kadroviy hujjat o‘tkazildi: ${doc.title}`,
      entity: 'hr-document',
      entityId: id,
      href: `/catalog/hr-documents`,
    });

    await this.writeDocAudit(tenantId, id, userId, postedBy, 'hr-document.post');

    return updated;
  }

  async cancelDocument(
    tenantId: string,
    id: string,
    cancelledBy?: string,
    userId?: string | null,
  ) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Document already cancelled');
    }
    // Verifix: «Отменить» on posted doc reverses side-effects then voids
    if (doc.status === DocumentLifecycle.posted) {
      await this.unpostDocument(tenantId, id, userId, cancelledBy);
    }
    const fresh = await this.prisma.hrDocument.findFirst({ where: { id, tenantId } });
    if (!fresh) throw new NotFoundException('Document not found');
    if (fresh.status === DocumentLifecycle.cancelled) {
      return this.getDocument(tenantId, id);
    }
    const payload = {
      ...((fresh.payload as Record<string, unknown>) || {}),
      cancelledBy: cancelledBy ?? null,
      cancelledAt: new Date().toISOString(),
    };
    const updated = await this.prisma.hrDocument.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        payload: payload as Prisma.InputJsonValue,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
          },
        },
      },
    });
    await this.writeDocAudit(tenantId, id, userId, cancelledBy, 'hr-document.cancel');
    return updated;
  }

  async unpostDocument(
    tenantId: string,
    id: string,
    userId?: string | null,
    userLabel?: string | null,
  ) {
    const doc = await this.prisma.hrDocument.findFirst({
      where: { id, tenantId },
      include: { employee: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status !== DocumentLifecycle.posted) {
      throw new BadRequestException('Only posted documents can be unposted');
    }

    const payload = (doc.payload as Record<string, unknown>) || {};

    switch (doc.type) {
      case DocumentType.name_change: {
        const hasOld =
          payload.oldLastName != null ||
          payload.oldFirstName != null ||
          payload.oldMiddleName !== undefined;
        if (!hasOld) {
          throw new BadRequestException(
            'Cannot unpost name change: missing previous name values in payload',
          );
        }
        await this.prisma.employee.update({
          where: { id: doc.employeeId },
          data: {
            lastName: payload.oldLastName != null ? String(payload.oldLastName) : doc.employee.lastName,
            firstName:
              payload.oldFirstName != null ? String(payload.oldFirstName) : doc.employee.firstName,
            middleName:
              payload.oldMiddleName !== undefined
                ? payload.oldMiddleName != null
                  ? String(payload.oldMiddleName)
                  : null
                : doc.employee.middleName,
          },
        });
        break;
      }
      case DocumentType.wage_change: {
        // Allow null previous salary (employee had no baseSalary before post)
        const empUpdate: Prisma.EmployeeUpdateInput =
          payload.oldAmount != null
            ? { baseSalary: new Prisma.Decimal(Number(payload.oldAmount)) }
            : { baseSalary: null };
        await this.prisma.employee.update({
          where: { id: doc.employeeId },
          data: empUpdate,
        });
        break;
      }
      case DocumentType.other:
        break;
      case DocumentType.transfer: {
        const hasOld =
          payload.oldDivisionId != null ||
          payload.oldPositionId != null ||
          payload.previousDivisionId != null ||
          payload.previousPositionId != null;
        if (!hasOld) {
          throw new BadRequestException(
            'Cannot unpost transfer: missing previous division/position in payload',
          );
        }
        const empUpdate: Prisma.EmployeeUpdateInput = {};
        const oldDiv = payload.oldDivisionId ?? payload.previousDivisionId;
        const oldPos = payload.oldPositionId ?? payload.previousPositionId;
        if (oldDiv != null) {
          empUpdate.division = oldDiv
            ? { connect: { id: String(oldDiv) } }
            : { disconnect: true };
        }
        if (oldPos != null) {
          empUpdate.position = oldPos
            ? { connect: { id: String(oldPos) } }
            : { disconnect: true };
        }
        await this.prisma.employee.update({
          where: { id: doc.employeeId },
          data: empUpdate,
        });
        break;
      }
      case DocumentType.hire: {
        const prevStatus = payload.previousStatus as EmploymentStatus | undefined;
        if (prevStatus) {
          const empUpdate: Prisma.EmployeeUpdateInput = { status: prevStatus };
          const prevDiv = payload.previousDivisionId ?? payload.oldDivisionId;
          const prevPos = payload.previousPositionId ?? payload.oldPositionId;
          if (prevDiv !== undefined) {
            empUpdate.division = prevDiv
              ? { connect: { id: String(prevDiv) } }
              : { disconnect: true };
          }
          if (prevPos !== undefined) {
            empUpdate.position = prevPos
              ? { connect: { id: String(prevPos) } }
              : { disconnect: true };
          }
          if (payload.previousBaseSalary != null) {
            empUpdate.baseSalary = new Prisma.Decimal(Number(payload.previousBaseSalary));
          }
          await this.prisma.employee.update({
            where: { id: doc.employeeId },
            data: empUpdate,
          });
        }
        // Legacy posted docs without snapshot: only flip document status
        break;
      }
      case DocumentType.dismiss: {
        const later = doc.postedAt
          ? await this.prisma.hrDocument.findFirst({
              where: {
                tenantId,
                employeeId: doc.employeeId,
                status: DocumentLifecycle.posted,
                postedAt: { gt: doc.postedAt },
                id: { not: doc.id },
              },
            })
          : null;
        if (later) {
          throw new BadRequestException(
            'Cannot unpost dismiss: employee has later posted documents',
          );
        }
        const empUpdate: Prisma.EmployeeUpdateInput = {
          status: EmploymentStatus.active,
          dismissedAt:
            payload.previousDismissedAt != null
              ? new Date(String(payload.previousDismissedAt))
              : null,
          dismissalReason:
            payload.previousDismissalReasonId != null
              ? { connect: { id: String(payload.previousDismissalReasonId) } }
              : { disconnect: true },
        };
        if (payload.oldScheduleId) {
          empUpdate.schedule = { connect: { id: String(payload.oldScheduleId) } };
        }
        await this.prisma.employee.update({
          where: { id: doc.employeeId },
          data: empUpdate,
        });
        // Re-activate access grants closed on dismiss day
        if (doc.documentDate) {
          await this.prisma.employeeAccessGrant.updateMany({
            where: {
              tenantId,
              employeeId: doc.employeeId,
              isActive: false,
              expiresAt: doc.documentDate,
            },
            data: { isActive: true, expiresAt: null },
          });
        }
        break;
      }
      default:
        throw new BadRequestException(`Unpost not supported for document type ${doc.type}`);
    }

    const updated = await this.prisma.hrDocument.update({
      where: { id },
      data: {
        status: DocumentLifecycle.draft,
        postedAt: null,
        postedBy: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
            status: true,
          },
        },
      },
    });
    await this.writeDocAudit(tenantId, id, userId, userLabel, 'hr-document.unpost');
    return updated;
  }

  /** Set AttendanceDay.status=leave for each calendar day in range. */
  async applyLeaveRange(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const days = this.eachDate(startDate, endDate);
    for (const workDate of days) {
      await this.prisma.attendanceDay.upsert({
        where: {
          tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
        },
        create: {
          tenantId,
          employeeId,
          workDate,
          status: DayStatus.leave,
          lateMinutes: 0,
        },
        update: {
          status: DayStatus.leave,
          lateMinutes: 0,
        },
      });
    }
  }

  /** Revert leave→not_started only when day has no punches. */
  async revertLeaveRange(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const days = this.eachDate(startDate, endDate);
    for (const workDate of days) {
      const day = await this.prisma.attendanceDay.findUnique({
        where: {
          tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
        },
      });
      if (!day || day.status !== DayStatus.leave) continue;
      if (day.firstInAt) continue;
      await this.prisma.attendanceDay.update({
        where: { id: day.id },
        data: { status: DayStatus.not_started, lateMinutes: 0 },
      });
    }
  }

  private async applyApprovedRequest(
    tenantId: string,
    req: {
      id: string;
      employeeId: string;
      type: RequestType;
      title?: string;
      payload: Prisma.JsonValue | null;
    },
  ) {
    const payload = (req.payload as Record<string, unknown>) || {};
    const start = payload.startDate
      ? new Date(String(payload.startDate))
      : payload.beginDate
        ? new Date(String(payload.beginDate))
        : payload.from
          ? new Date(String(payload.from))
          : null;
    const end = payload.endDate
      ? new Date(String(payload.endDate))
      : payload.to
        ? new Date(String(payload.to))
        : start;

    if (req.type === RequestType.absence) {
      if (start && end) {
        this.assertDateRange(start, end);
        await this.assertNoAbsenceOverlap(tenantId, req.employeeId, start, end, undefined);
        let absenceTypeId = payload.absenceTypeId
          ? String(payload.absenceTypeId)
          : undefined;
        if (!absenceTypeId) {
          const vac = await this.prisma.absenceType.findFirst({
            where: { tenantId, isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          absenceTypeId = vac?.id;
        }
        if (absenceTypeId) {
          await this.prisma.absence.create({
            data: {
              tenantId,
              employeeId: req.employeeId,
              absenceTypeId,
              startDate: start,
              endDate: end,
              status: RequestStatus.approved,
              note: `From request ${req.id}`,
            },
          });
        }
        await this.applyLeaveRange(tenantId, req.employeeId, start, end);
      }
      return;
    }

    if (
      req.type === RequestType.schedule_change ||
      req.type === RequestType.roster_change
    ) {
      // Verifix «Запрос на изменение расписания»: смена + замещающий сотрудник
      if (req.type === RequestType.roster_change) {
        const recommendedId = String(
          payload.recommendedEmployeeId ||
            payload.replacementEmployeeId ||
            payload.replacingEmployeeId ||
            '',
        );
        const requestDateRaw =
          payload.requestDate || payload.workDate || payload.startDate || start;
        const workDate = requestDateRaw ? new Date(String(requestDateRaw)) : null;
        let scheduleId = payload.scheduleId ? String(payload.scheduleId) : '';
        const shiftId = payload.shiftId ? String(payload.shiftId) : '';
        if (!scheduleId && shiftId) {
          const shift = await this.prisma.scheduleShift.findFirst({
            where: { id: shiftId, tenantId },
            select: { scheduleId: true, startTime: true, endTime: true, name: true },
          });
          if (shift) scheduleId = shift.scheduleId;
        }
        if (recommendedId && workDate && !Number.isNaN(workDate.getTime())) {
          const noteBase = `roster_change ${req.id}`;
          if (scheduleId) {
            await this.prisma.employeeScheduleOverride.create({
              data: {
                tenantId,
                employeeId: recommendedId,
                scheduleId,
                startDate: workDate,
                endDate: workDate,
                note: `${noteBase} cover for ${req.employeeId}`,
              },
            });
            await this.prisma.employeeScheduleOverride.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                scheduleId,
                startDate: workDate,
                endDate: workDate,
                note: `${noteBase} replaced by ${recommendedId}`,
              },
            });
          }
          // Ensure attendance day rows exist for audit
          for (const empId of [req.employeeId, recommendedId]) {
            await this.prisma.attendanceDay.upsert({
              where: {
                tenantId_employeeId_workDate: {
                  tenantId,
                  employeeId: empId,
                  workDate,
                },
              },
              create: {
                tenantId,
                employeeId: empId,
                workDate,
                status:
                  empId === req.employeeId ? DayStatus.day_off : DayStatus.not_started,
              },
              update: {
                status:
                  empId === req.employeeId ? DayStatus.day_off : DayStatus.not_started,
              },
            });
          }

          // Список смен: mark origin as replaced, add cover shift for recommended
          const shiftName =
            (typeof payload.shiftName === 'string' && payload.shiftName) ||
            (typeof payload.shiftCode === 'string' && payload.shiftCode) ||
            'Смена';
          const dayNum = workDate.getUTCDate();
          const originRef = `rc:${req.id}:origin`;
          const coverRef = `rc:${req.id}:cover`;
          await this.prisma.scheduleShiftAssignment.upsert({
            where: {
              tenantId_employeeId_workDate_source_sourceRef: {
                tenantId,
                employeeId: req.employeeId,
                workDate,
                source: 'roster_change',
                sourceRef: originRef,
              },
            },
            create: {
              tenantId,
              employeeId: req.employeeId,
              workDate,
              number: dayNum,
              shiftLabel: shiftName,
              shiftId: shiftId || undefined,
              status: 'replaced',
              replaced: true,
              replacedById: recommendedId,
              source: 'roster_change',
              sourceRef: originRef,
              scheduleId: scheduleId || undefined,
              note: noteBase,
            },
            update: {
              status: 'replaced',
              replaced: true,
              replacedById: recommendedId,
              shiftLabel: shiftName,
              shiftId: shiftId || undefined,
              scheduleId: scheduleId || undefined,
            },
          });
          await this.prisma.scheduleShiftAssignment.upsert({
            where: {
              tenantId_employeeId_workDate_source_sourceRef: {
                tenantId,
                employeeId: recommendedId,
                workDate,
                source: 'roster_change',
                sourceRef: coverRef,
              },
            },
            create: {
              tenantId,
              employeeId: recommendedId,
              workDate,
              number: dayNum,
              shiftLabel: shiftName,
              shiftId: shiftId || undefined,
              status: 'planned',
              replaced: false,
              source: 'roster_change',
              sourceRef: coverRef,
              scheduleId: scheduleId || undefined,
              note: `${noteBase} for ${req.employeeId}`,
            },
            update: {
              status: 'planned',
              shiftLabel: shiftName,
              shiftId: shiftId || undefined,
              scheduleId: scheduleId || undefined,
            },
          });
          // Mark any existing roster assignments for the origin employee that day
          await this.prisma.scheduleShiftAssignment.updateMany({
            where: {
              tenantId,
              employeeId: req.employeeId,
              workDate,
              source: 'roster',
            },
            data: {
              replaced: true,
              replacedById: recommendedId,
              status: 'replaced',
            },
          });
          return;
        }
      }

      const changeKind = String(payload.changeKind || payload.requestKind || 'schedule_change');
      if (changeKind === 'day_swap') {
        const swaps = Array.isArray(payload.swaps) ? payload.swaps : [];
        const emp = await this.prisma.employee.findFirst({
          where: { id: req.employeeId, tenantId },
          select: { scheduleId: true },
        });
        const scheduleId =
          (payload.scheduleId ? String(payload.scheduleId) : null) ||
          emp?.scheduleId ||
          null;
        for (const raw of swaps) {
          if (!raw || typeof raw !== 'object') continue;
          const pair = raw as Record<string, unknown>;
          const fromDate = pair.fromDate ? new Date(String(pair.fromDate)) : null;
          const toDate = pair.toDate ? new Date(String(pair.toDate)) : null;
          if (!fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
            continue;
          }
          if (scheduleId) {
            await this.prisma.employeeScheduleOverride.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                scheduleId,
                startDate: fromDate,
                endDate: fromDate,
                note: `day_swap ${String(pair.fromDate)}↔${String(pair.toDate)} (request ${req.id})`,
              },
            });
            await this.prisma.employeeScheduleOverride.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                scheduleId,
                startDate: toDate,
                endDate: toDate,
                note: `day_swap ${String(pair.toDate)}↔${String(pair.fromDate)} (request ${req.id})`,
              },
            });
          }
        }
        return;
      }

      // Verifix «Изменение графика»: per-day work/off marks
      const dayRows = Array.isArray(payload.days) ? payload.days : [];
      if (dayRows.length) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: req.employeeId, tenantId },
          select: { scheduleId: true },
        });
        const scheduleId =
          (payload.scheduleId ? String(payload.scheduleId) : null) ||
          emp?.scheduleId ||
          null;
        for (const raw of dayRows) {
          if (!raw || typeof raw !== 'object') continue;
          const row = raw as Record<string, unknown>;
          const date = row.date ? new Date(String(row.date)) : null;
          if (!date || Number.isNaN(date.getTime())) continue;
          const dayType = String(row.dayType || 'work') === 'off' ? 'off' : 'work';
          if (scheduleId) {
            await this.prisma.employeeScheduleOverride.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                scheduleId,
                startDate: date,
                endDate: date,
                note: `day_type:${dayType} (request ${req.id})`,
              },
            });
          }
          // Reflect on attendance day status when possible
          const existing = await this.prisma.attendanceDay.findUnique({
            where: {
              tenantId_employeeId_workDate: {
                tenantId,
                employeeId: req.employeeId,
                workDate: date,
              },
            },
          });
          if (existing) {
            await this.prisma.attendanceDay.update({
              where: { id: existing.id },
              data: {
                status: dayType === 'off' ? DayStatus.day_off : DayStatus.not_started,
              },
            });
          } else {
            await this.prisma.attendanceDay.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                workDate: date,
                status: dayType === 'off' ? DayStatus.day_off : DayStatus.not_started,
              },
            });
          }
        }
        return;
      }

      // Legacy: switch employee to another schedule template
      const scheduleId = payload.scheduleId ? String(payload.scheduleId) : null;
      const endRaw = payload.endDate ?? payload.to ?? null;
      const endDate = endRaw ? new Date(String(endRaw)) : null;
      const startDate =
        start ??
        (payload.effectiveDate
          ? new Date(String(payload.effectiveDate))
          : new Date());
      if (scheduleId) {
        await this.prisma.employeeScheduleOverride.create({
          data: {
            tenantId,
            employeeId: req.employeeId,
            scheduleId,
            startDate,
            endDate: endDate ?? undefined,
            note: req.title
              ? `${req.title} (request ${req.id})`
              : `From request ${req.id}`,
          },
        });
        if (!endDate) {
          await this.prisma.employee.update({
            where: { id: req.employeeId },
            data: { scheduleId },
          });
        }
      }
      return;
    }

    if (req.type === RequestType.overtime) {
      // Mark attendance days as needing OT hours in note/status — Verifix posts overtime marks
      if (start && end) {
        const days = this.eachDate(start, end);
        const otHours = Number(payload.hours ?? payload.otHours ?? 0);
        for (const workDate of days) {
          const existing = await this.prisma.attendanceDay.findUnique({
            where: {
              tenantId_employeeId_workDate: {
                tenantId,
                employeeId: req.employeeId,
                workDate,
              },
            },
          });
          if (existing) {
            await this.prisma.attendanceDay.update({
              where: { id: existing.id },
              data: {
                // Keep status; encode OT in lateMinutes negation is wrong — store via note on request only.
                // If hours provided, add as work presence without flipping leave.
                status:
                  existing.status === DayStatus.not_started ||
                  existing.status === DayStatus.absent
                    ? DayStatus.on_time
                    : existing.status,
              },
            });
          } else {
            await this.prisma.attendanceDay.create({
              data: {
                tenantId,
                employeeId: req.employeeId,
                workDate,
                status: DayStatus.on_time,
                lateMinutes: 0,
              },
            });
          }
        }
        // Persist computed OT hours back onto request payload for payroll/reports
        await this.prisma.hrRequest.update({
          where: { id: req.id },
          data: {
            payload: {
              ...payload,
              appliedOtHours: otHours,
              appliedDays: days.length,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return;
    }

    if (req.type === RequestType.location) {
      if (start && end) {
        this.assertDateRange(start, end);
        await this.prisma.internalTrip.create({
          data: {
            tenantId,
            employeeId: req.employeeId,
            locationId: payload.locationId ? String(payload.locationId) : undefined,
            title: String(payload.title || req.title || 'Location request'),
            startDate: start,
            endDate: end,
            status: 'active',
            requestStatus: 'approved',
            visibility: 'shared',
            note: `From request ${req.id}`,
          },
        });
      }
      return;
    }

    if (req.type === RequestType.hr_change) {
      // Create draft HR document (transfer / wage / name) for subsequent post
      const docType = String(payload.documentType || payload.type || 'transfer');
      const mapped =
        docType === 'dismiss' || docType === 'hire' || docType === 'name_change' || docType === 'wage_change'
          ? (docType as DocumentType)
          : DocumentType.transfer;
      await this.prisma.hrDocument.create({
        data: {
          tenantId,
          employeeId: req.employeeId,
          type: mapped,
          title: String(payload.title || req.title || `HR change from request ${req.id}`),
          documentDate: start ?? new Date(),
          status: DocumentLifecycle.draft,
          note: `From request ${req.id}`,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    }
  }

  /** On dismiss post: close access grants, end open schedule overrides, flag face for purge sync. */
  private async applyDismissCascades(
    tenantId: string,
    employeeId: string,
    asOf: Date,
  ) {
    await this.prisma.employeeAccessGrant.updateMany({
      where: { tenantId, employeeId, isActive: true },
      data: { isActive: false, expiresAt: asOf },
    });

    await this.prisma.employeeScheduleOverride.updateMany({
      where: {
        tenantId,
        employeeId,
        OR: [{ endDate: null }, { endDate: { gt: asOf } }],
      },
      data: { endDate: asOf },
    });

    const face = await this.prisma.faceProfile.findUnique({
      where: { employeeId },
    });
    if (face) {
      await this.prisma.faceProfile.update({
        where: { id: face.id },
        data: {
          syncStatus: 'pending',
          lastError: 'Employee dismissed — face access revoke pending',
        },
      });
    }
  }

  private assertDateRange(start: Date, end: Date) {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (e < s) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
  }

  private async assertNoAbsenceOverlap(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ) {
    const overlap = await this.prisma.absence.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: [RequestStatus.pending, RequestStatus.approved] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Absence overlaps existing ${overlap.status} record ${overlap.id} (${overlap.startDate.toISOString().slice(0, 10)}–${overlap.endDate.toISOString().slice(0, 10)})`,
      );
    }
  }

  private eachDate(start: Date, end: Date): Date[] {
    const out: Date[] = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cur <= last) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  // —— Verifix: Заявки на кадровые изменения ——

  private changeRequestInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      position: { select: { id: true, name: true, code: true } },
      staffPosition: { select: { id: true, title: true, code: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      dismissalReason: { select: { id: true, name: true, code: true } },
      lines: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
            },
          },
          staffPosition: { select: { id: true, title: true, code: true } },
        },
      },
    };
  }

  private parseHrChangeKind(raw: string): HrChangeKind {
    const map: Record<string, HrChangeKind> = {
      open_position: HrChangeKind.open_position,
      hire: HrChangeKind.hire,
      transfer: HrChangeKind.transfer,
      transfer_batch: HrChangeKind.transfer_batch,
      dismiss: HrChangeKind.dismiss,
    };
    const kind = map[String(raw || '').trim()];
    if (!kind) throw new BadRequestException(`Unknown kind: ${raw}`);
    return kind;
  }

  private async nextChangeRequestNumber(tenantId: string) {
    const count = await this.prisma.hrChangeRequest.count({ where: { tenantId } });
    return `ЗКИ-${String(count + 1).padStart(4, '0')}`;
  }

  private validateChangeRequestBody(kind: HrChangeKind, dto: UpsertHrChangeRequestDto) {
    if (kind === HrChangeKind.open_position) {
      if (!dto.title?.trim()) throw new BadRequestException('Название обязательно');
      if (!dto.divisionId) throw new BadRequestException('Подразделение обязательно');
      if (!dto.positionId && !dto.staffPositionId) {
        throw new BadRequestException('Должность или позиция обязательна');
      }
      if (!dto.effectiveDate) throw new BadRequestException('Дата открытия обязательна');
      if (dto.quantity == null || Number(dto.quantity) < 1) {
        throw new BadRequestException('Кол-во должно быть ≥ 1');
      }
    }
    if (kind === HrChangeKind.hire) {
      if (!dto.effectiveDate) throw new BadRequestException('Дата приема обязательна');
      if (!dto.employmentType?.trim()) {
        throw new BadRequestException('Вид занятости обязателен');
      }
      if (!dto.staffPositionId) throw new BadRequestException('Позиция обязательна');
      if (!dto.candidateFirstName?.trim() || !dto.candidateLastName?.trim()) {
        throw new BadRequestException('Имя и фамилия кандидата обязательны');
      }
    }
    if (kind === HrChangeKind.transfer) {
      if (!dto.employeeId) throw new BadRequestException('Сотрудник обязателен');
      if (!dto.effectiveDate) throw new BadRequestException('Перевод с обязателен');
      if (!dto.staffPositionId) throw new BadRequestException('Позиция обязательна');
    }
    if (kind === HrChangeKind.transfer_batch) {
      if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
        throw new BadRequestException('Добавьте хотя бы одну строку перевода');
      }
    }
    if (kind === HrChangeKind.dismiss) {
      if (!dto.employeeId) throw new BadRequestException('Сотрудник обязателен');
      if (!dto.effectiveDate) throw new BadRequestException('Дата увольнения обязательна');
    }
  }

  listChangeRequests(
    tenantId: string,
    opts: { kind?: string; status?: RequestStatus } = {},
  ) {
    const where: Prisma.HrChangeRequestWhereInput = { tenantId };
    if (opts.kind) where.kind = this.parseHrChangeKind(opts.kind);
    if (opts.status) where.status = opts.status;
    return this.prisma.hrChangeRequest.findMany({
      where,
      include: this.changeRequestInclude(),
      orderBy: [{ requestDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async exportChangeRequests(
    tenantId: string,
    opts: { kind?: string; status?: RequestStatus } = {},
  ) {
    const rows = await this.listChangeRequests(tenantId, opts);
    const kindLabels: Record<string, string> = {
      open_position: 'Открытие позиции',
      hire: 'Прием на работу',
      transfer: 'Кадровый перевод',
      transfer_batch: 'Кадровый перевод списком',
      dismiss: 'Увольнение',
    };
    const statusLabels: Record<string, string> = {
      draft: 'Черновик',
      pending: 'На рассмотрении',
      approved: 'Утверждена',
      rejected: 'Отклонена',
      cancelled: 'Отменена',
    };
    const flat = rows.map((r) => {
      const position =
        r.staffPosition?.title ||
        r.position?.name ||
        [r.candidateLastName, r.candidateFirstName].filter(Boolean).join(' ') ||
        (r.employee ? `${r.employee.lastName} ${r.employee.firstName}` : '');
      return {
        requestDate: r.requestDate,
        number: r.number,
        kind: kindLabels[r.kind] || r.kind,
        position,
        createdBy: r.createdByLabel,
        createdAt: r.createdAt,
        status: statusLabels[r.status] || r.status,
      };
    });
    const buffer = await buildExcelBuffer({
      sheetName: 'Заявки',
      columns: [
        'requestDate',
        'number',
        'kind',
        'position',
        'createdBy',
        'createdAt',
        'status',
      ],
      rows: flat,
    });
    return { buffer, filename: 'hr-change-requests.xlsx' };
  }

  async getChangeRequest(tenantId: string, id: string) {
    const row = await this.prisma.hrChangeRequest.findFirst({
      where: { id, tenantId },
      include: this.changeRequestInclude(),
    });
    if (!row) throw new NotFoundException('Change request not found');
    return row;
  }

  async createChangeRequest(
    tenantId: string,
    dto: UpsertHrChangeRequestDto,
    userId?: string,
    createdByLabel?: string,
  ) {
    const kind = this.parseHrChangeKind(dto.kind);
    this.validateChangeRequestBody(kind, dto);
    const requestDate = parseDateParam(
      dto.requestDate,
      new Date(),
      'requestDate',
    );
    const number = dto.number?.trim() || (await this.nextChangeRequestNumber(tenantId));
    const lines =
      kind === HrChangeKind.transfer_batch
        ? (dto.lines || []).map((l, idx) => ({
            employeeId: l.employeeId,
            sortOrder: idx,
            effectiveDate: l.effectiveDate
              ? parseDateParam(l.effectiveDate, requestDate, 'effectiveDate')
              : undefined,
            staffPositionId: l.staffPositionId || undefined,
            divisionId: l.divisionId || undefined,
            positionId: l.positionId || undefined,
            employmentType: l.employmentType || undefined,
            note: l.note || undefined,
          }))
        : [];

    return this.prisma.hrChangeRequest.create({
      data: {
        tenantId,
        kind,
        status: RequestStatus.draft,
        number,
        requestDate,
        title: dto.title?.trim() || this.defaultTitle(kind),
        divisionId: dto.divisionId || undefined,
        positionId: dto.positionId || undefined,
        staffPositionId: dto.staffPositionId || undefined,
        employeeId: dto.employeeId || undefined,
        effectiveDate: dto.effectiveDate
          ? parseDateParam(dto.effectiveDate, requestDate, 'effectiveDate')
          : undefined,
        quantity: dto.quantity != null ? Number(dto.quantity) : undefined,
        employmentType: dto.employmentType || undefined,
        dismissalReasonId: dto.dismissalReasonId || undefined,
        note: dto.note || undefined,
        candidateGender: dto.candidateGender || undefined,
        candidateFirstName: dto.candidateFirstName || undefined,
        candidateLastName: dto.candidateLastName || undefined,
        candidateMiddleName: dto.candidateMiddleName || undefined,
        createdByUserId: userId,
        createdByLabel: createdByLabel || undefined,
        payload: (dto.payload as Prisma.InputJsonValue) ?? undefined,
        lines: lines.length ? { create: lines } : undefined,
      },
      include: this.changeRequestInclude(),
    });
  }

  private defaultTitle(kind: HrChangeKind) {
    const labels: Record<HrChangeKind, string> = {
      open_position: 'Заявка на открытие позиции',
      hire: 'Заявка на прием на работу',
      transfer: 'Заявка на кадровый перевод',
      transfer_batch: 'Заявка на кадровый перевод списком',
      dismiss: 'Заявка на увольнение',
    };
    return labels[kind];
  }

  async updateChangeRequest(tenantId: string, id: string, dto: UpsertHrChangeRequestDto) {
    const row = await this.prisma.hrChangeRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Change request not found');
    if (row.status !== RequestStatus.draft && row.status !== RequestStatus.pending) {
      throw new BadRequestException('Only draft/pending requests can be edited');
    }
    const kind = dto.kind ? this.parseHrChangeKind(dto.kind) : row.kind;
    this.validateChangeRequestBody(kind, { ...dto, kind });

    if (kind === HrChangeKind.transfer_batch && dto.lines) {
      await this.prisma.hrChangeRequestLine.deleteMany({ where: { requestId: id } });
      await this.prisma.hrChangeRequestLine.createMany({
        data: dto.lines.map((l, idx) => ({
          requestId: id,
          employeeId: l.employeeId,
          sortOrder: idx,
          effectiveDate: l.effectiveDate
            ? parseDateParam(l.effectiveDate, row.requestDate, 'effectiveDate')
            : null,
          staffPositionId: l.staffPositionId || null,
          divisionId: l.divisionId || null,
          positionId: l.positionId || null,
          employmentType: l.employmentType || null,
          note: l.note || null,
        })),
      });
    }

    return this.prisma.hrChangeRequest.update({
      where: { id },
      data: {
        kind,
        number: dto.number !== undefined ? dto.number || null : undefined,
        requestDate: dto.requestDate
          ? parseDateParam(dto.requestDate, row.requestDate, 'requestDate')
          : undefined,
        title: dto.title !== undefined ? dto.title : undefined,
        divisionId: dto.divisionId !== undefined ? dto.divisionId || null : undefined,
        positionId: dto.positionId !== undefined ? dto.positionId || null : undefined,
        staffPositionId:
          dto.staffPositionId !== undefined ? dto.staffPositionId || null : undefined,
        employeeId: dto.employeeId !== undefined ? dto.employeeId || null : undefined,
        effectiveDate:
          dto.effectiveDate !== undefined
            ? dto.effectiveDate
              ? parseDateParam(dto.effectiveDate, row.requestDate, 'effectiveDate')
              : null
            : undefined,
        quantity: dto.quantity !== undefined ? Number(dto.quantity) : undefined,
        employmentType:
          dto.employmentType !== undefined ? dto.employmentType || null : undefined,
        dismissalReasonId:
          dto.dismissalReasonId !== undefined ? dto.dismissalReasonId || null : undefined,
        note: dto.note !== undefined ? dto.note : undefined,
        candidateGender:
          dto.candidateGender !== undefined ? dto.candidateGender || null : undefined,
        candidateFirstName:
          dto.candidateFirstName !== undefined ? dto.candidateFirstName || null : undefined,
        candidateLastName:
          dto.candidateLastName !== undefined ? dto.candidateLastName || null : undefined,
        candidateMiddleName:
          dto.candidateMiddleName !== undefined
            ? dto.candidateMiddleName || null
            : undefined,
        payload:
          dto.payload !== undefined
            ? (dto.payload as Prisma.InputJsonValue)
            : undefined,
      },
      include: this.changeRequestInclude(),
    });
  }

  async deleteChangeRequest(tenantId: string, id: string) {
    const row = await this.prisma.hrChangeRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Change request not found');
    if (row.status === RequestStatus.approved) {
      throw new BadRequestException('Approved request cannot be deleted');
    }
    await this.prisma.hrChangeRequest.delete({ where: { id } });
    return { ok: true };
  }

  async submitChangeRequest(tenantId: string, id: string, actor?: string) {
    const row = await this.prisma.hrChangeRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Change request not found');
    if (row.status !== RequestStatus.draft) {
      throw new BadRequestException('Only draft can be submitted');
    }
    return this.prisma.hrChangeRequest.update({
      where: { id },
      data: {
        status: RequestStatus.pending,
        reviewNote: actor ? `Submitted by ${actor}` : undefined,
      },
      include: this.changeRequestInclude(),
    });
  }

  async cancelChangeRequest(tenantId: string, id: string, actor?: string) {
    const row = await this.prisma.hrChangeRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Change request not found');
    if (row.status === RequestStatus.approved) {
      throw new BadRequestException('Approved request cannot be cancelled');
    }
    if (row.status === RequestStatus.cancelled) {
      throw new BadRequestException('Already cancelled');
    }
    return this.prisma.hrChangeRequest.update({
      where: { id },
      data: {
        status: RequestStatus.cancelled,
        reviewedBy: actor,
        reviewedAt: new Date(),
      },
      include: this.changeRequestInclude(),
    });
  }

  async reviewChangeRequest(
    tenantId: string,
    id: string,
    dto: ReviewRequestDto,
    reviewedBy?: string,
  ) {
    const row = await this.prisma.hrChangeRequest.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Change request not found');
    if (dto.status !== RequestStatus.approved && dto.status !== RequestStatus.rejected) {
      throw new BadRequestException('status must be approved or rejected');
    }
    if (row.status !== RequestStatus.pending && row.status !== RequestStatus.draft) {
      throw new BadRequestException(`Cannot review in status ${row.status}`);
    }

    const updated = await this.prisma.hrChangeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewNote: dto.reviewNote,
        reviewedBy: reviewedBy ?? undefined,
        reviewedAt: new Date(),
      },
      include: this.changeRequestInclude(),
    });

    if (dto.status === RequestStatus.approved) {
      await this.applyApprovedChangeRequest(tenantId, row);
    }
    return updated;
  }

  private async applyApprovedChangeRequest(
    tenantId: string,
    row: {
      id: string;
      kind: HrChangeKind;
      title: string | null;
      number: string | null;
      note: string | null;
      employeeId: string | null;
      divisionId: string | null;
      positionId: string | null;
      staffPositionId: string | null;
      effectiveDate: Date | null;
      requestDate: Date;
      quantity: number | null;
      employmentType: string | null;
      dismissalReasonId: string | null;
      candidateFirstName: string | null;
      candidateLastName: string | null;
      candidateMiddleName: string | null;
      candidateGender: string | null;
      lines: Array<{
        employeeId: string;
        effectiveDate: Date | null;
        staffPositionId: string | null;
        divisionId: string | null;
        positionId: string | null;
        note: string | null;
      }>;
    },
  ) {
    const docDate = row.effectiveDate ?? row.requestDate;

    if (row.kind === HrChangeKind.open_position) {
      let staffPositionId = row.staffPositionId;
      if (!staffPositionId && row.positionId) {
        const sp = await this.prisma.staffPosition.create({
          data: {
            tenantId,
            divisionId: row.divisionId || undefined,
            positionId: row.positionId,
            code: `SP-${Date.now().toString(36).toUpperCase()}`,
            title: row.title || 'Новая позиция',
            headcount: row.quantity || 1,
            status: 'vacant',
          },
        });
        staffPositionId = sp.id;
      }
      if (staffPositionId) {
        await this.prisma.vacancy.create({
          data: {
            tenantId,
            staffPositionId,
            title: row.title || 'Вакансия',
            status: 'open',
            openedAt: docDate,
            note: row.note || `From change request ${row.number || row.id}`,
          },
        });
      }
      return;
    }

    if (row.kind === HrChangeKind.hire) {
      const fullName = [row.candidateLastName, row.candidateFirstName, row.candidateMiddleName]
        .filter(Boolean)
        .join(' ');
      await this.prisma.candidate.create({
        data: {
          tenantId,
          staffPositionId: row.staffPositionId || undefined,
          fullName: fullName || 'Кандидат',
          status: 'approved',
          note: row.note || `From hire request ${row.number || row.id}`,
        },
      });
      // Placeholder employee slot for draft hire document when possible
      if (row.employeeId) {
        await this.prisma.hrDocument.create({
          data: {
            tenantId,
            employeeId: row.employeeId,
            type: DocumentType.hire,
            title: row.title || `Прием: ${fullName}`,
            documentDate: docDate,
            number: row.number || undefined,
            status: DocumentLifecycle.draft,
            note: `From change request ${row.id}`,
            payload: {
              divisionId: row.divisionId,
              positionId: row.positionId,
              staffPositionId: row.staffPositionId,
              employmentType: row.employmentType,
              candidateFirstName: row.candidateFirstName,
              candidateLastName: row.candidateLastName,
              candidateMiddleName: row.candidateMiddleName,
              candidateGender: row.candidateGender,
            },
          },
        });
      }
      return;
    }

    if (row.kind === HrChangeKind.transfer && row.employeeId) {
      await this.prisma.hrDocument.create({
        data: {
          tenantId,
          employeeId: row.employeeId,
          type: DocumentType.transfer,
          title: row.title || 'Кадровый перевод',
          documentDate: docDate,
          number: row.number || undefined,
          status: DocumentLifecycle.draft,
          note: `From change request ${row.id}`,
          payload: {
            divisionId: row.divisionId,
            positionId: row.positionId,
            staffPositionId: row.staffPositionId,
            employmentType: row.employmentType,
            transferFrom: row.effectiveDate,
          },
        },
      });
      return;
    }

    if (row.kind === HrChangeKind.transfer_batch) {
      for (const line of row.lines) {
        await this.prisma.hrDocument.create({
          data: {
            tenantId,
            employeeId: line.employeeId,
            type: DocumentType.transfer,
            title: row.title || 'Кадровый перевод',
            documentDate: line.effectiveDate ?? docDate,
            number: row.number || undefined,
            status: DocumentLifecycle.draft,
            note: line.note || `From change request ${row.id}`,
            payload: {
              divisionId: line.divisionId || row.divisionId,
              positionId: line.positionId || row.positionId,
              staffPositionId: line.staffPositionId || row.staffPositionId,
              transferFrom: line.effectiveDate,
            },
          },
        });
      }
      return;
    }

    if (row.kind === HrChangeKind.dismiss && row.employeeId) {
      await this.prisma.hrDocument.create({
        data: {
          tenantId,
          employeeId: row.employeeId,
          type: DocumentType.dismiss,
          title: row.title || 'Увольнение',
          documentDate: docDate,
          number: row.number || undefined,
          status: DocumentLifecycle.draft,
          note: `From change request ${row.id}`,
          payload: {
            dismissalReasonId: row.dismissalReasonId,
            dismissDate: row.effectiveDate,
          },
        },
      });
    }
  }
}
