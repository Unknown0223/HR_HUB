import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { currentEmployeeScope } from '../common/data-scope';
import { employeeNameSearchWhere } from '../common/name-search';
import {
  ACCESS_TYPES,
  AccessTypeId,
  EXPIRING_DAYS,
  GRANT_ROLES,
  GrantStatus,
  PROFILE_FLAGS,
  canGrantType,
  checkGrantInput,
  grantStatus,
  grantStatusWhere,
  isAccessType,
} from './access-rules';
import type { BulkAccessDto, GrantAccessDto } from './access.dto';

type Actor = Pick<AuthUser, 'userId' | 'role' | 'email'>;
type Source = 'access' | 'access.bulk';
type GrantRow = {
  id: string;
  employeeId: string;
  accessType: string;
  resource: string;
  grantedAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
  note: string | null;
};

export type AccessListQuery = {
  q?: string;
  status?: string;
  divisionId?: string;
  positionId?: string;
  locationId?: string;
  accessType?: string;
  grantStatus?: string;
  page?: number;
  limit?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGED_TYPES = (Object.keys(ACCESS_TYPES) as AccessTypeId[]).filter((t) => !ACCESS_TYPES[t].readOnly);
const GRANT_STATUSES: GrantStatus[] = ['active', 'expiring', 'expired', 'revoked'];
const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  tabNumber: true,
  status: true,
  division: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

function snapshot(g: GrantRow) {
  return {
    accessType: g.accessType,
    resource: g.resource,
    isActive: g.isActive,
    expiresAt: g.expiresAt?.toISOString() ?? null,
  };
}

function fullName(e: { lastName: string; firstName: string; middleName?: string | null }) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  options(role: string) {
    return {
      canGrant: GRANT_ROLES.has(role),
      expiringDays: EXPIRING_DAYS,
      types: (Object.keys(ACCESS_TYPES) as AccessTypeId[]).map((id) => ({
        id,
        ...ACCESS_TYPES[id],
        canGrant: canGrantType(role, id),
      })),
      flags: Object.entries(PROFILE_FLAGS).map(([id, label]) => ({ id, label })),
    };
  }

  async summary(tenantId: string) {
    const now = new Date();
    const base: Prisma.EmployeeAccessGrantWhereInput = { tenantId, accessType: { in: MANAGED_TYPES } };
    const [byStatus, byType, holders] = await Promise.all([
      Promise.all(
        GRANT_STATUSES.map((s) =>
          this.prisma.employeeAccessGrant.count({ where: { AND: [base, grantStatusWhere(s, now)] } }),
        ),
      ),
      this.prisma.employeeAccessGrant.groupBy({
        by: ['accessType'],
        where: { AND: [base, grantStatusWhere('active', now)] },
        _count: { _all: true },
      }),
      this.prisma.employeeAccessGrant.groupBy({
        by: ['employeeId'],
        where: { AND: [base, grantStatusWhere('active', now)] },
      }),
    ]);
    return {
      employeesWithAccess: holders.length,
      active: byStatus[0],
      expiring: byStatus[1],
      expired: byStatus[2],
      revoked: byStatus[3],
      byType: Object.fromEntries(byType.map((r) => [r.accessType, r._count._all])),
    };
  }

  async listEmployees(tenantId: string, query: AccessListQuery) {
    const now = new Date();
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const and: Prisma.EmployeeWhereInput[] = [{ tenantId }];

    const nameWhere = query.q ? employeeNameSearchWhere(query.q) : undefined;
    if (nameWhere) and.push(nameWhere);
    if (query.status && query.status !== 'all') {
      if (!(query.status in EmploymentStatus)) throw new BadRequestException('Некорректный статус');
      and.push({ status: query.status as EmploymentStatus });
    }
    if (query.divisionId) and.push({ divisionId: query.divisionId });
    if (query.positionId) and.push({ positionId: query.positionId });
    if (query.locationId) {
      and.push({
        OR: [
          { division: { locationId: query.locationId } },
          { accessGrants: { some: { accessType: 'location', resource: query.locationId, isActive: true } } },
        ],
      });
    }

    if (query.accessType && !isAccessType(query.accessType)) {
      throw new BadRequestException('Неизвестный тип доступа');
    }
    const typeWhere: Prisma.EmployeeAccessGrantWhereInput = query.accessType
      ? { accessType: query.accessType }
      : { accessType: { in: MANAGED_TYPES } };
    if (query.grantStatus === 'none') {
      and.push({ accessGrants: { none: { AND: [typeWhere, grantStatusWhere('active', now)] } } });
    } else if (query.grantStatus) {
      if (!GRANT_STATUSES.includes(query.grantStatus as GrantStatus)) {
        throw new BadRequestException('Некорректный статус доступа');
      }
      and.push({
        accessGrants: { some: { AND: [typeWhere, grantStatusWhere(query.grantStatus as GrantStatus, now)] } },
      });
    } else if (query.accessType) {
      and.push({ accessGrants: { some: typeWhere } });
    }

    const where: Prisma.EmployeeWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          ...EMPLOYEE_SELECT,
          accessGrants: { where: { tenantId }, orderBy: { grantedAt: 'desc' } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const labels = await this.resourceLabels(
      tenantId,
      rows.flatMap((r) => r.accessGrants),
    );
    return {
      items: rows.map(({ accessGrants, ...e }) => ({
        ...e,
        fullName: fullName(e),
        grants: accessGrants.map((g) => this.present(g, labels, now)),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getEmployee(tenantId: string, employeeId: string) {
    const now = new Date();
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        ...EMPLOYEE_SELECT,
        accessGrants: { where: { tenantId }, orderBy: { grantedAt: 'desc' } },
      },
    });
    if (!emp) throw new NotFoundException('Сотрудник не найден');

    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, entity: 'Employee', entityId: employeeId, action: { startsWith: 'access.' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const userIds = [...new Set(logs.map((l) => l.userId).filter((v): v is string => !!v))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, fullName: true },
        })
      : [];
    const actorById = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    const { accessGrants, ...e } = emp;
    const labels = await this.resourceLabels(tenantId, accessGrants);
    return {
      employee: { ...e, fullName: fullName(e) },
      grants: accessGrants.map((g) => this.present(g, labels, now)),
      history: logs.map((l) => ({
        id: l.id,
        action: l.action,
        createdAt: l.createdAt,
        actor: (l.userId && actorById.get(l.userId)) || null,
        meta: l.meta,
      })),
    };
  }

  async grant(tenantId: string, actor: Actor, dto: GrantAccessDto, source: Source = 'access') {
    const now = new Date();
    const checked = checkGrantInput(dto, actor.role, now);
    if (checked.ok === false) throw new BadRequestException(checked.error);
    const { accessType, resource, expiresAt } = checked;

    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
      select: { id: true, status: true },
    });
    if (!emp) throw new NotFoundException('Сотрудник не найден');
    if (emp.status === 'dismissed') {
      throw new BadRequestException('Нельзя выдать доступ уволенному сотруднику');
    }
    if (ACCESS_TYPES[accessType].resource === 'division') {
      await this.assertDivision(tenantId, resource);
    }

    const existing = await this.prisma.employeeAccessGrant.findFirst({
      where: { tenantId, employeeId: emp.id, accessType, resource },
      orderBy: { grantedAt: 'desc' },
    });
    if (existing) {
      const st = grantStatus(existing, now);
      if (st === 'active' || st === 'expiring') throw new ConflictException('Такой доступ уже выдан');
    }

    const data = {
      isActive: true,
      grantedAt: now,
      expiresAt,
      note: accessType === 'profile_flag' ? 'enabled' : dto.reason.trim(),
    };
    const before = existing ? snapshot(existing) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.employeeAccessGrant.update({ where: { id: existing.id }, data })
        : await tx.employeeAccessGrant.create({
            data: { ...data, tenantId, employeeId: emp.id, accessType, resource },
          });
      await this.audit(tx, tenantId, actor, existing ? 'access.reactivate' : 'access.grant', emp.id, {
        grantId: saved.id,
        before,
        after: snapshot(saved),
        reason: dto.reason.trim(),
        source,
      });
      return saved;
    });
    const labels = await this.resourceLabels(tenantId, [row]);
    return this.present(row, labels, now);
  }

  async revoke(tenantId: string, actor: Actor, grantId: string, reason: string, source: Source = 'access') {
    const g = await this.prisma.employeeAccessGrant.findFirst({ where: { id: grantId, tenantId } });
    if (!g) throw new NotFoundException('Доступ не найден');
    if (!isAccessType(g.accessType) || ACCESS_TYPES[g.accessType].readOnly) {
      throw new BadRequestException('Этот доступ управляется в карточке сотрудника');
    }
    if (!canGrantType(actor.role, g.accessType)) {
      throw new ForbiddenException('Недостаточно прав для этого типа доступа');
    }
    if (!g.isActive) throw new ConflictException('Доступ уже отозван');

    const before = snapshot(g);
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.employeeAccessGrant.update({
        where: { id: g.id },
        data: { isActive: false, ...(g.accessType === 'profile_flag' ? { note: 'disabled' } : {}) },
      });
      await this.audit(tx, tenantId, actor, 'access.revoke', g.employeeId, {
        grantId: g.id,
        before,
        after: snapshot(saved),
        reason: reason.trim(),
        source,
      });
      return saved;
    });
    const labels = await this.resourceLabels(tenantId, [row]);
    return this.present(row, labels, new Date());
  }

  async bulk(tenantId: string, actor: Actor, dto: BulkAccessDto) {
    const checked = checkGrantInput(
      { accessType: dto.accessType, resource: dto.resource, expiresAt: dto.action === 'grant' ? dto.expiresAt : null },
      actor.role,
    );
    if (checked.ok === false) throw new BadRequestException(checked.error);

    const results: { employeeId: string; ok: boolean; error?: string; grantIds?: string[] }[] = [];
    for (const employeeId of [...new Set(dto.employeeIds)]) {
      try {
        if (dto.action === 'grant') {
          const g = await this.grant(
            tenantId,
            actor,
            { employeeId, accessType: dto.accessType, resource: dto.resource, expiresAt: dto.expiresAt, reason: dto.reason },
            'access.bulk',
          );
          results.push({ employeeId, ok: true, grantIds: [g.id] });
        } else {
          const active = await this.prisma.employeeAccessGrant.findMany({
            where: {
              tenantId,
              employeeId,
              accessType: checked.accessType,
              resource: checked.resource,
              isActive: true,
            },
            select: { id: true },
          });
          if (!active.length) throw new NotFoundException('Активный доступ не найден');
          for (const a of active) await this.revoke(tenantId, actor, a.id, dto.reason, 'access.bulk');
          results.push({ employeeId, ok: true, grantIds: active.map((a) => a.id) });
        }
      } catch (err) {
        if (!(err instanceof HttpException)) throw err;
        results.push({ employeeId, ok: false, error: err.message });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { succeeded, failed: results.length - succeeded, results };
  }

  private async assertDivision(tenantId: string, divisionId: string) {
    const division = UUID_RE.test(divisionId)
      ? await this.prisma.division.findFirst({
          where: { id: divisionId, tenantId },
          select: { id: true, locationId: true },
        })
      : null;
    if (!division) throw new NotFoundException('Подразделение не найдено');
    const scope = currentEmployeeScope();
    if (scope && (!division.locationId || !scope.locationIds.includes(division.locationId))) {
      throw new ForbiddenException('Подразделение вне вашей зоны доступа');
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actor: Actor,
    action: string,
    employeeId: string,
    meta: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        tenantId,
        userId: actor.userId,
        action,
        entity: 'Employee',
        entityId: employeeId,
        meta: { ...meta, actorEmail: actor.email, actorRole: actor.role } as Prisma.InputJsonValue,
      },
    });
  }

  private async resourceLabels(tenantId: string, grants: GrantRow[]) {
    const ids = (kind: string) =>
      [
        ...new Set(
          grants
            .filter((g) => isAccessType(g.accessType) && ACCESS_TYPES[g.accessType].resource === kind)
            .map((g) => g.resource)
            .filter((r) => UUID_RE.test(r)),
        ),
      ];
    const divisionIds = ids('division');
    const locationIds = ids('location');
    const employeeIds = ids('employee');
    const [divisions, locations, employees] = await Promise.all([
      divisionIds.length
        ? this.prisma.division.findMany({ where: { tenantId, id: { in: divisionIds } }, select: { id: true, name: true } })
        : [],
      locationIds.length
        ? this.prisma.location.findMany({ where: { tenantId, id: { in: locationIds } }, select: { id: true, name: true } })
        : [],
      employeeIds.length
        ? this.prisma.employee.findMany({
            where: { tenantId, id: { in: employeeIds } },
            select: { id: true, firstName: true, lastName: true, middleName: true },
          })
        : [],
    ]);
    const map = new Map<string, string>();
    for (const d of divisions) map.set(d.id, d.name);
    for (const l of locations) map.set(l.id, l.name);
    for (const e of employees) map.set(e.id, fullName(e));
    return map;
  }

  private present(g: GrantRow, labels: Map<string, string>, now: Date) {
    const rule = isAccessType(g.accessType) ? ACCESS_TYPES[g.accessType] : null;
    let resourceLabel = labels.get(g.resource) ?? g.resource;
    if (rule?.resource === 'all') resourceLabel = 'Вся организация';
    if (rule?.resource === 'flag') resourceLabel = PROFILE_FLAGS[g.resource] ?? g.resource;
    return {
      id: g.id,
      accessType: g.accessType,
      typeLabel: rule?.label ?? g.accessType,
      resource: g.resource,
      resourceLabel,
      readOnly: !rule || rule.readOnly,
      status: grantStatus(g, now),
      grantedAt: g.grantedAt,
      expiresAt: g.expiresAt,
      note: g.note,
    };
  }
}
