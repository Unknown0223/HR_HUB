import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { transitionIncidentStatus } from './incident-lifecycle';

/**
 * F5: first domain slice extracted from CatalogService god-class.
 * CatalogService thin-delegates here for incidents / incident-types writes.
 */
@Injectable()
export class IncidentsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private incidentInclude() {
    return {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      incidentType: true,
    };
  }

  async createIncidentType(tenantId: string, body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Название обязательно');
    const accrualName = body.accrualName ? String(body.accrualName).trim() : null;
    if (!accrualName) throw new BadRequestException('Начисление обязательно');
    const code =
      (body.code ? String(body.code).trim() : '') ||
      `INC-${Date.now().toString(36).toUpperCase()}`;
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
    return this.prisma.incidentType.create({
      data: { tenantId, code, name, accrualName, isActive },
    });
  }

  async createIncident(tenantId: string, body: Record<string, unknown>) {
    const incidentTypeId = String(body.incidentTypeId || '');
    if (!incidentTypeId) throw new BadRequestException('Тип инцидента обязателен');
    const employeeId = body.employeeId ? String(body.employeeId) : null;
    if (!employeeId) throw new BadRequestException('Физическое лицо обязательно');
    const type = await this.prisma.incidentType.findFirst({
      where: { id: incidentTypeId, tenantId },
    });
    if (!type) throw new NotFoundException('Тип инцидента не найден');

    const occurredAt = body.occurredAt
      ? new Date(String(body.occurredAt))
      : new Date();
    const number = body.number ? String(body.number).trim() : undefined;
    const title =
      (body.title ? String(body.title).trim() : '') ||
      number ||
      type.name ||
      'Инцидент';
    const action = (body.action as string) || 'verbal_warning';
    const damageAmount =
      body.damageAmount != null && body.damageAmount !== ''
        ? new Prisma.Decimal(Number(body.damageAmount))
        : action === 'fine'
          ? new Prisma.Decimal(0)
          : null;

    return this.prisma.incident.create({
      data: {
        tenantId,
        employeeId,
        managerId: body.managerId ? String(body.managerId) : null,
        incidentTypeId,
        number,
        title,
        description: body.description ? String(body.description) : undefined,
        note: body.note ? String(body.note) : undefined,
        action: action as never,
        damageAmount: damageAmount ?? undefined,
        sendNotification: Boolean(body.sendNotification),
        occurredAt,
        status: ((body.status as string) || 'open') as never,
        severity: ((body.severity as string) || 'medium') as never,
        attachments:
          body.attachments == null
            ? undefined
            : (body.attachments as Prisma.InputJsonValue),
      },
      include: this.incidentInclude(),
    });
  }

  async updateIncident(
    tenantId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Incident not found');
    const data: Record<string, unknown> = {};
    for (const key of [
      'employeeId',
      'managerId',
      'incidentTypeId',
      'number',
      'title',
      'description',
      'note',
      'severity',
      'status',
      'action',
      'resolution',
    ] as const) {
      if (body[key] !== undefined) {
        data[key] = body[key] === '' || body[key] === null ? null : body[key];
      }
    }
    if (body.occurredAt !== undefined) {
      data.occurredAt = new Date(String(body.occurredAt));
    }
    if (body.resolvedAt !== undefined) {
      data.resolvedAt = body.resolvedAt
        ? new Date(String(body.resolvedAt))
        : null;
    }
    if (body.damageAmount !== undefined) {
      data.damageAmount =
        body.damageAmount === '' || body.damageAmount == null
          ? null
          : new Prisma.Decimal(Number(body.damageAmount));
    }
    if (body.sendNotification !== undefined) {
      data.sendNotification = Boolean(body.sendNotification);
    }
    if (body.attachments !== undefined) data.attachments = body.attachments;
    return this.prisma.incident.update({
      where: { id },
      data,
      include: this.incidentInclude(),
    });
  }

  async resolveIncident(
    tenantId: string,
    id: string,
    body?: { resolution?: string | null },
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Incident not found');
    const next = transitionIncidentStatus(existing.status, 'resolve');
    if (next.ok === false) throw new BadRequestException(next.message);
    return this.prisma.incident.update({
      where: { id },
      data: {
        status: next.status,
        resolvedAt: new Date(),
        ...(body?.resolution !== undefined
          ? { resolution: body.resolution || null }
          : {}),
      },
      include: this.incidentInclude(),
    });
  }

  async closeIncident(tenantId: string, id: string) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Incident not found');
    const next = transitionIncidentStatus(existing.status, 'close');
    if (next.ok === false) throw new BadRequestException(next.message);
    return this.prisma.incident.update({
      where: { id },
      data: { status: next.status },
      include: this.incidentInclude(),
    });
  }

  async investigateIncident(tenantId: string, id: string) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Incident not found');
    const next = transitionIncidentStatus(existing.status, 'investigate');
    if (next.ok === false) throw new BadRequestException(next.message);
    return this.prisma.incident.update({
      where: { id },
      data: { status: next.status },
      include: this.incidentInclude(),
    });
  }
}
