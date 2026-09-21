import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, DayStatus, DocumentLifecycle, GradePromotionPeriodType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { buildExcelBuffer, flattenExportRow } from '../common/excel';
import { parseDateParam } from '../common/date-range';
import { NotificationsService } from '../notifications/notifications.service';
import { CATALOG_RESOURCES, findResource } from './catalog.resources';
import { IncidentsCatalogService } from './incidents-catalog.service';
import { ClearanceCatalogService } from './clearance-catalog.service';
import { GphCatalogService } from './gph-catalog.service';
import { TariffCatalogService } from './tariff-catalog.service';
import { HrChangesCatalogService } from './hr-changes-catalog.service';
import { FinanceCatalogService } from './finance-catalog.service';
import { TimesheetCatalogService } from './timesheet-catalog.service';
import { SchedulesCatalogService } from './schedules-catalog.service';
import { ReportsCatalogService } from './reports-catalog.service';

export type StaffPosTreePosition = {
  id: string;
  code: string;
  title: string;
  headcount: number;
  employeeCount: number;
};

export type StaffPosTreeDivision = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  positions: StaffPosTreePosition[];
  children: StaffPosTreeDivision[];
};

export type StaffPosTreeResponse = {
  title: string;
  roots: StaffPosTreeDivision[];
  orphanPositions: StaffPosTreePosition[];
};

const DATE_FIELDS = new Set([
  'effectiveAt',
  'startDate',
  'endDate',
  'workDate',
  'documentDate',
  'periodFrom',
  'periodTo',
  'dueDate',
  'settledAt',
  'spentAt',
  'openedAt',
  'closedAt',
  'grantedAt',
  'expiresAt',
  'occurredAt',
  'resolvedAt',
  'completedAt',
  'reviewedAt',
  'recordedAt',
  'paidAt',
  'birthDate',
  'postedAt',
  'month',
  'introducedAt',
]);

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly incidents: IncidentsCatalogService,
    private readonly clearance: ClearanceCatalogService,
    private readonly gph: GphCatalogService,
    private readonly tariff: TariffCatalogService,
    private readonly hrChanges: HrChangesCatalogService,
    private readonly finance: FinanceCatalogService,
    private readonly timesheet: TimesheetCatalogService,
    private readonly schedules: SchedulesCatalogService,
    private readonly reports: ReportsCatalogService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  listResources() {
    return CATALOG_RESOURCES.map((r) => ({
      key: r.key,
      section: r.section,
      title: r.title,
      fields: r.fields,
    }));
  }

  private delegate(model: string): any {
    const d = (this.prisma as any)[model];
    if (!d) throw new BadRequestException(`Unknown model: ${model}`);
    return d;
  }

  private pick(data: Record<string, unknown>, fields: string[]) {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (data[f] === undefined) continue;
      let v = data[f];
      if (DATE_FIELDS.has(f) && v != null && v !== '') {
        v = new Date(String(v));
      }
      if (v === '') v = null;
      out[f] = v;
    }
    return out;
  }

  async list(
    tenantId: string,
    key: string,
    opts: {
      activeOnly?: boolean;
      employeeId?: string;
      status?: string;
      type?: string;
      isActive?: boolean;
      from?: string;
      to?: string;
      contractId?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    const where = this.buildListWhere(tenantId, res, opts);
    const paging = opts.page != null || opts.limit != null;
    const limit = Math.min(Math.max(Number(opts.limit) || 1000, 1), 5000);
    const page = Math.max(Number(opts.page) || 1, 1);
    const skip = paging ? (page - 1) * limit : 0;
    if (paging) {
      const [items, total] = await Promise.all([
        this.delegate(res.model).findMany({
          where,
          orderBy: res.orderBy ?? { createdAt: 'desc' },
          include: res.include,
          skip,
          take: limit,
        }),
        this.delegate(res.model).count({ where }),
      ]);
      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }
    // Soft cap unbounded catalog lists (keeps array response shape).
    return this.delegate(res.model).findMany({
      where,
      orderBy: res.orderBy ?? { createdAt: 'desc' },
      include: res.include,
      take: limit,
    });
  }

  async getOne(tenantId: string, key: string, id: string) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    const row = await this.delegate(res.model).findFirst({
      where: { id, tenantId },
      include: res.include,
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  private buildListWhere(
    tenantId: string,
    res: NonNullable<ReturnType<typeof findResource>>,
    opts: {
      activeOnly?: boolean;
      employeeId?: string;
      status?: string;
      type?: string;
      isActive?: boolean;
      from?: string;
      to?: string;
      contractId?: string;
    },
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    const noTenant = [
      'careerPathStep',
      'loanPayment',
      'clearanceTemplateItem',
      'clearanceSheetItem',
      'clearanceTemplateEmployee',
    ];
    if (!noTenant.includes(res.model)) {
      where.tenantId = tenantId;
    } else if (res.model === 'careerPathStep') {
      where.careerPath = { tenantId };
    } else if (res.model === 'loanPayment') {
      where.loan = { tenantId };
    }
    if (opts.activeOnly && res.activeField) {
      where[res.activeField] = true;
    }
    if (opts.isActive !== undefined && res.fields.includes('isActive')) {
      where.isActive = opts.isActive;
    }
    if (opts.employeeId && res.fields.includes('employeeId')) {
      where.employeeId = opts.employeeId;
    }
    if (opts.contractId && res.fields.includes('contractId')) {
      where.contractId = opts.contractId;
    }
    if (opts.status === 'unposted' || opts.status === '!posted') {
      where.status = { not: 'posted' };
    } else if (opts.status && res.fields.includes('status')) {
      where.status = opts.status;
    }
    if (opts.type && res.fields.includes('type')) {
      where.type = opts.type;
    }
    if (opts.from || opts.to) {
      const dateField =
        [
          'effectiveAt',
          'workDate',
          'documentDate',
          'startDate',
          'openedAt',
          'dueDate',
          'paidAt',
          'grantedAt',
          'spentAt',
          'recordedAt',
          'month',
        ].find((f) => res.fields.includes(f)) ?? 'createdAt';
      const range: Record<string, Date> = {};
      if (opts.from) range.gte = parseDateParam(opts.from, new Date(), 'from');
      if (opts.to) range.lte = parseDateParam(opts.to, new Date(), 'to');
      where[dateField] = range;
    }
    return where;
  }

  async exportResource(
    tenantId: string,
    key: string,
    opts: {
      activeOnly?: boolean;
      employeeId?: string;
      contractId?: string;
      status?: string;
      type?: string;
      isActive?: boolean;
      from?: string;
      to?: string;
    } = {},
  ) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    const rows = await this.list(tenantId, key, opts);

    if (key === 'timesheet-adjustments') {
      const flatRows = (rows as Array<Record<string, any>>).map((row) => {
        const lines = Array.isArray(row.lines) ? row.lines : [];
        const names = lines
          .map((l: any) =>
            [l.employee?.lastName, l.employee?.firstName].filter(Boolean).join(' '),
          )
          .filter(Boolean)
          .join('; ');
        return {
          id: row.id,
          documentDate: row.documentDate,
          number: row.number,
          title: row.title,
          employees: names,
          division: row.division?.name,
          periodFrom: row.periodFrom,
          periodTo: row.periodTo,
          status: row.status,
          postedAt: row.postedAt,
          lineCount: lines.length,
        };
      });
      const buffer = await buildExcelBuffer({
        sheetName: 'Корректировки табеля',
        columns: [
          'documentDate',
          'number',
          'employees',
          'division',
          'periodFrom',
          'periodTo',
          'status',
          'lineCount',
        ],
        rows: flatRows,
      });
      return { buffer, filename: `${key}.xlsx` };
    }

    const columns = ['id', ...res.fields];
    const flatRows = rows.map((row: Record<string, unknown>) =>
      flattenExportRow({
        id: row.id,
        ...Object.fromEntries(res.fields.map((f) => [f, row[f]])),
        ...(row.employee ? { employee: row.employee } : {}),
        ...(row.grade ? { grade: row.grade } : {}),
        ...(row.division ? { division: row.division } : {}),
        ...(row.position ? { position: row.position } : {}),
        ...(row.template ? { template: row.template } : {}),
      }),
    );
    if (rows.some((r: Record<string, unknown>) => r.employee)) {
      if (!columns.includes('employee')) columns.push('employee');
    }
    const buffer = await buildExcelBuffer({
      sheetName: res.title,
      columns,
      rows: flatRows,
    });
    return { buffer, filename: `${key}.xlsx` };
  }

  /** Resolve any catalog analytics kind into raw report data. */
  async fetchAnalytics(
    tenantId: string,
    kind: string,
    opts: {
      year?: number;
      month?: number;
      from?: string;
      to?: string;
      date?: string;
      divisionId?: string;
      divisionIds?: string;
      divisionGroupId?: string;
      divisionGroupIds?: string;
      positionId?: string;
      positionGroupId?: string;
      positionGroupIds?: string;
      staffGroups?: string;
      reportType?: string;
      ranges?: string;
      gradeId?: string;
      educationType?: string;
      groupBy?: string;
      positionType?: string;
      keyEmployee?: string;
      basisType?: string;
      employeeIds?: string;
      positionIds?: string;
      scheduleIds?: string;
      filterByDept?: string;
      yearsFrom?: string;
      yearsTo?: string;
      rules?: string;
      kinds?: string;
      personType?: string;
      employmentSource?: string;
      gender?: string;
      relations?: string;
      ageFrom?: string;
      ageTo?: string;
      showHidden?: string | boolean;
      withoutAccess?: string | boolean;
      locationIds?: string;
      gradeIds?: string;
      includeInactive?: string | boolean;
      startTime?: string;
      endTime?: string;
      details?: string | boolean;
      cfg?: string;
      account?: string;
      currency?: string;
      subconto?: string;
      showQty?: boolean;
      showAmount?: boolean;
      excludeExtra?: boolean;
      /** one-time report: accrual | deduction | both */
      kind?: string;
    } = {},
  ): Promise<unknown> {
    const year = opts.year ?? new Date().getFullYear();
    const month = opts.month;
    switch (kind) {
      case 'division-stats':
        return this.divisionWorkDashboard(tenantId, {
          from: opts.from,
          to: opts.to,
        });
      case 'year-summary':
        return this.yearSummary(tenantId, year);
      case 'year-summary-dashboard':
        return this.yearSummaryDashboard(tenantId, year);
      case 'staffing':
        return this.staffingReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionId: opts.divisionId,
          positionId: opts.positionId,
        });
      case 'gender':
        return this.genderReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionId: opts.divisionId,
          reportType: opts.reportType,
          ranges: opts.ranges,
          gradeId: opts.gradeId,
          educationType: opts.educationType,
        });
      case 'movement-divisions':
        return this.movementDivisionsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
        });
      case 'movement-staff':
        return this.movementStaffReport(tenantId, {
          from: opts.from,
          to: opts.to,
          kinds: opts.kinds,
          divisionGroupId: opts.divisionGroupId,
          positionGroupId: opts.positionGroupId,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
      case 'dismissals-by-reason':
        return this.dismissalsByReason(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          keyEmployee: opts.keyEmployee,
          basisType: opts.basisType,
        });
      case 'dismissals-by-division':
        return this.dismissalsByDivision(tenantId, { from: opts.from, to: opts.to });
      case 'dismissal-dashboard':
        return this.dismissalDashboard(tenantId, opts.from, opts.to);
      case 'personnel-changes':
        return this.personnelChangesDashboard(tenantId, {
          year,
          groupBy: opts.groupBy === 'position' ? 'position' : 'division',
        });
      case 'grades':
        return this.gradeReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          filterByDept: opts.filterByDept,
        });
      case 'grade-changes':
        return this.gradeChangeReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
        });
      case 'vacancies':
        return this.vacancyReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionGroupIds: opts.divisionGroupIds || opts.divisionGroupId,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionGroupIds: opts.positionGroupIds || opts.positionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          staffGroups: opts.staffGroups,
        });
      case 'candidates':
        return this.candidateReport(tenantId, {
          from: opts.from,
          to: opts.to,
          positionIds: opts.positionIds || opts.positionId,
          personType: opts.personType,
          employmentSource: opts.employmentSource,
          gender: opts.gender,
        });
      case 'tenure':
        return this.tenureReport(tenantId, {
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          yearsFrom: opts.yearsFrom,
          yearsTo: opts.yearsTo,
          rules: opts.rules,
        });
      case 'relatives':
        return this.relativesReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          relations: opts.relations,
          gender: opts.gender,
          ageFrom: opts.ageFrom,
          ageTo: opts.ageTo,
          showHidden: opts.showHidden,
        });
      case 'access':
        return this.accessReport(tenantId, {
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          withoutAccess: opts.withoutAccess ?? opts.showHidden,
        });
      case 'distance':
        return this.distanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
      case 'shifts':
        return this.shiftReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          startTime: opts.startTime,
          endTime: opts.endTime,
          cfg: opts.cfg,
        });
      case 'time-types':
        return this.timeTypesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
          cfg: opts.cfg,
        });
      case 'schedule-plan':
        return this.schedulePlanReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
        });
      case 'schedules':
        return this.schedulesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
        });
      case 'employees':
        return this.employmentReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupIds: opts.divisionGroupIds || opts.divisionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
          educationType: opts.educationType,
          filterByDept: opts.filterByDept,
        });
      case 'occupancy':
        return this.occupancyReport(tenantId, {
          date: opts.date ?? opts.to,
          positionGroupIds: opts.positionGroupIds || opts.positionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          staffGroups: opts.staffGroups,
          divisionIds: opts.divisionIds || opts.divisionId,
          groupBy: opts.groupBy,
          positionType: opts.positionType,
        });
      case 'penalties':
        return this.penaltiesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          filterByDept: opts.filterByDept,
        });
      case 'one-time':
        return this.oneTimeAccrualsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          kind: opts.kind || opts.reportType || opts.kinds,
        });
      case 'division-expenses':
        return this.divisionExpensesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupIds: opts.divisionGroupIds || opts.divisionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          positionGroupIds: opts.positionGroupIds || opts.positionGroupId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
      case 'fot':
        return this.fotReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          locationIds: opts.locationIds,
          positionIds: opts.positionIds || opts.positionId,
          gradeIds: opts.gradeIds || opts.gradeId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
      case 'payroll-book':
        return this.payrollBookReport(tenantId, {
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
      case 'account-balance':
        return this.accountBalanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          account: opts.account,
          currency: opts.currency,
          subconto: opts.subconto,
          showQty: opts.showQty,
          showAmount: opts.showAmount,
        });
      case 'trial-balance':
        return this.trialBalanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          currency: opts.currency,
          subconto: opts.subconto,
          showQty: opts.showQty,
          showAmount: opts.showAmount,
          excludeExtra: opts.excludeExtra,
        });
      case 'payroll-grouped':
        return this.payrollGroupedReport(tenantId, {
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          positionType: opts.positionType,
          cfg: opts.cfg,
        });
      case 'preliminary-salary':
        return this.preliminarySalaryReport(tenantId, {
          year,
          month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
      case 'payments':
        return this.paymentsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
        });
      case 'hourly':
        return this.hourlyAttendanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
          startTime: opts.startTime,
          endTime: opts.endTime,
          cfg: opts.cfg,
        });
      case 'division-mode':
        return this.divisionModeReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          useGroups: String(opts.cfg || '').includes('groups'),
        });
      case 'discipline':
        return this.disciplineReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
      case 'lateness':
        return this.latenessReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
      case 'timesheet-adjustments':
        return this.timesheetAdjustmentReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
        });
      case 'positions-structure':
        return this.positionsStructure(tenantId);
      case 'positions':
        return this.positionsReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupId: opts.divisionGroupId,
          positionGroupId: opts.positionGroupId,
          positionId: opts.positionId,
        });
      case 'attendance-overview':
        return this.attendanceOverview(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
          includeInactive: opts.includeInactive === true || opts.includeInactive === '1' || opts.includeInactive === 'true',
          cfg: opts.cfg,
        });
      case 'marks-detail':
        return this.marksDetailReport(tenantId, {
          date: opts.date ?? opts.from ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
        });
      case 'multi-shift':
        return this.multiShiftAttendance(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
          details: opts.details,
        });
      default:
        throw new NotFoundException(`Analytics ${kind} not found`);
    }
  }

  private extractAnalyticsRows(data: unknown): Record<string, unknown>[] {
    if (!data) return [];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (typeof data !== 'object') return [];
    const o = data as Record<string, unknown>;
    for (const k of [
      'rows',
      'items',
      'divisions',
      'orders',
      'settlements',
      'overrides',
      'positionSchedules',
      'shifts',
      'todayAttendance',
      'documents',
      'audit',
    ]) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
    const skip = new Set(['title', 'legend', 'year', 'month', 'from', 'to', 'daysInMonth']);
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k)) continue;
      if (v != null && typeof v !== 'object') flat[k] = v;
      else if (k === 'counts' && v && typeof v === 'object') {
        Object.assign(flat, v as object);
      }
    }
    return Object.keys(flat).length ? [flat] : [];
  }

  async exportAnalytics(
    tenantId: string,
    kind: string,
    opts: {
      year?: number;
      month?: number;
      from?: string;
      to?: string;
      date?: string;
      divisionId?: string;
      divisionIds?: string;
      divisionGroupId?: string;
      divisionGroupIds?: string;
      positionId?: string;
      positionGroupId?: string;
      positionGroupIds?: string;
      staffGroups?: string;
      reportType?: string;
      ranges?: string;
      gradeId?: string;
      educationType?: string;
      keyEmployee?: string;
      basisType?: string;
      employeeIds?: string;
      positionIds?: string;
      scheduleIds?: string;
      filterByDept?: string;
      yearsFrom?: string;
      yearsTo?: string;
      rules?: string;
      kinds?: string;
      personType?: string;
      employmentSource?: string;
      gender?: string;
      relations?: string;
      ageFrom?: string;
      ageTo?: string;
      showHidden?: string | boolean;
      withoutAccess?: string | boolean;
      locationIds?: string;
      gradeIds?: string;
      includeInactive?: string | boolean;
      startTime?: string;
      endTime?: string;
      details?: string | boolean;
      cfg?: string;
      account?: string;
      currency?: string;
      subconto?: string;
      showQty?: boolean;
      showAmount?: boolean;
      excludeExtra?: boolean;
      positionType?: string;
      /** one-time report: accrual | deduction | both */
      kind?: string;
    } = {},
  ) {
    type ExportSpec = { sheetName: string; columns: string[]; rows: Record<string, unknown>[] };
    let spec: ExportSpec;

    // Prefer typed columns for high-traffic reports; fall back to generic flatten for all others.
    switch (kind) {
      case 'employees': {
        const data = await this.employmentReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupIds: opts.divisionGroupIds || opts.divisionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
          educationType: opts.educationType,
          filterByDept: opts.filterByDept,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '#',
            'Ф.И.О.',
            'Дата приема',
            'Код',
            'Группа подразделений',
            'Подразделение',
            'Должность',
            'Позиция',
            'Зарплата',
            'Разряд',
            'Пол',
            'Регион',
            'ИНПС',
            'ПИНФЛ',
            'Дата рождения',
            'Адрес',
            'Номер телефона',
            'График работы',
            'Серия и номер паспорта',
            'Паспорт выдан',
            'Вид образования',
            'Заведение',
            'Специальность',
            'Курс',
            'Степень родства',
            'Имя родственника',
          ],
          rows: data.rows.map((r) => ({
            '#': r.n,
            'Ф.И.О.': r.fullName,
            'Дата приема': r.hiredAt,
            Код: r.code,
            'Группа подразделений': r.divisionGroup,
            Подразделение: r.division,
            Должность: r.position,
            Позиция: r.staffPosition,
            Зарплата: r.salary ?? '',
            Разряд: r.grade,
            Пол: r.gender,
            Регион: r.region,
            ИНПС: r.inps,
            ПИНФЛ: r.pinfl,
            'Дата рождения': r.birthDate,
            Адрес: r.address,
            'Номер телефона': r.phone,
            'График работы': r.schedule,
            'Серия и номер паспорта': r.passport,
            'Паспорт выдан': r.passportIssuer,
            'Вид образования': r.educationType,
            Заведение: r.educationInstitution,
            Специальность: r.educationSpecialty,
            Курс: r.educationCourse,
            'Степень родства': r.familyRelation,
            'Имя родственника': r.familyName,
          })),
        };
        break;
      }
      case 'tenure': {
        const data = await this.tenureReport(tenantId, {
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          yearsFrom: opts.yearsFrom,
          yearsTo: opts.yearsTo,
          rules: opts.rules,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Сотрудник',
            'Организационная единица',
            'Должность',
            'Стаж',
            'Соответствуют ли начисления?',
          ],
          rows: data.rows.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            'Организационная единица': r.division,
            Должность: r.position,
            Стаж: r.tenure,
            'Соответствуют ли начисления?': r.accrualsMatch,
          })),
        };
        break;
      }
      case 'relatives': {
        const data = await this.relativesReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          relations: opts.relations,
          gender: opts.gender,
          ageFrom: opts.ageFrom,
          ageTo: opts.ageTo,
          showHidden: opts.showHidden,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '#',
            'Имя',
            'Количество родственников',
            'Название степени родства',
            'Имя родственника',
            'Пол',
            'Возраст',
            'Дата рождения',
            'Рабочее место',
            'Зависимость',
          ],
          rows: [
            ...data.rows.map((r) => ({
              '#': r.n,
              Имя: r.employee,
              'Количество родственников': r.relativesCount || '',
              'Название степени родства': r.relation,
              'Имя родственника': r.relativeName,
              Пол: r.gender,
              Возраст: r.age ?? '',
              'Дата рождения': r.birthDate,
              'Рабочее место': r.workplace,
              Зависимость: r.dependent,
            })),
            {
              '#': '',
              Имя: 'Итого',
              'Количество родственников': data.totalRelatives,
              'Название степени родства': '',
              'Имя родственника': '',
              Пол: '',
              Возраст: '',
              'Дата рождения': '',
              'Рабочее место': '',
              Зависимость: '',
            },
          ],
        };
        break;
      }
      case 'access': {
        const data = await this.accessReport(tenantId, {
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          withoutAccess: opts.withoutAccess ?? opts.showHidden,
        });
        spec = {
          sheetName: data.title,
          columns: [
            'ФИО Сотрудника',
            'Полный доступ',
            'Пользовательский доступ',
            'Подчиненное подразделение',
            'Полный доступ к КПЭ',
          ],
          rows: data.rows.map((r) => ({
            'ФИО Сотрудника': r.employee,
            'Полный доступ': r.fullAccess,
            'Пользовательский доступ': r.userAccess,
            'Подчиненное подразделение': r.subordinate,
            'Полный доступ к КПЭ': r.kpeFull,
          })),
        };
        break;
      }
      case 'marks-detail': {
        const data = await this.marksDetailReport(tenantId, {
          date: opts.date ?? opts.from ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Сотрудник',
            'План приход',
            'План уход',
            'Норма',
            'Факт приход',
            'Факт уход',
            'Отработано',
            'Отметки план',
            'Отметки факт',
            'Начало',
            'Конец',
            'Отметился',
            'Локация',
          ],
          rows: data.rows.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            'План приход': r.planIn,
            'План уход': r.planOut,
            Норма: r.planNorm ?? '',
            'Факт приход': r.factIn,
            'Факт уход': r.factOut,
            Отработано: r.worked ?? '',
            'Отметки план': r.marksPlan,
            'Отметки факт': r.marksFact,
            Начало: r.markStart,
            Конец: r.markEnd,
            Отметился: r.markedBy,
            Локация: r.markLocation,
          })),
        };
        break;
      }
      case 'distance': {
        const data = await this.distanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Сотрудник',
            'Общее (км)',
            'В прикрепленных (км)',
            'Прикрепленные локации',
            'Прочие (км)',
            'Прочие локации',
          ],
          rows: data.rows.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            'Общее (км)': r.totalKm,
            'В прикрепленных (км)': r.attachedKm,
            'Прикрепленные локации': r.attachedLocations,
            'Прочие (км)': r.otherKm,
            'Прочие локации': r.otherLocations,
          })),
        };
        break;
      }
      case 'hourly': {
        const data = await this.hourlyAttendanceReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
          startTime: opts.startTime,
          endTime: opts.endTime,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: data.title,
          columns: ['№', 'Сотрудник', ...data.days.map((d) => d.dd), 'Отработано'],
          rows: data.rows.map((r) => {
            const rec: Record<string, unknown> = { '№': r.n, Сотрудник: r.employee, Отработано: r.total ?? '' };
            data.days.forEach((d, i) => {
              rec[d.dd] = r.hours[i] ?? '';
            });
            return rec;
          }),
        };
        break;
      }
      case 'time-types': {
        const data = await this.timeTypesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: data.title,
          columns: ['№', 'Табельный номер', 'Сотрудник', ...data.types.map((t) => t.letter ? `${t.name} (${t.letter})` : t.name), 'Итого'],
          rows: data.rows.map((r) => {
            const rec: Record<string, unknown> = {
              '№': r.n,
              'Табельный номер': r.tabNumber,
              Сотрудник: r.employee,
              Итого: r.total,
            };
            data.types.forEach((t, i) => {
              rec[t.letter ? `${t.name} (${t.letter})` : t.name] = r.hours[i] || '';
            });
            return rec;
          }),
        };
        break;
      }
      case 'multi-shift': {
        const data = await this.multiShiftAttendance(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
          details: opts.details,
        });
        spec = data.details
          ? {
              sheetName: data.title,
              columns: [
                'Дата',
                'Табельный номер',
                'Сотрудник',
                'Смена',
                'План приход',
                'План уход',
                'План',
                'Факт приход',
                'Факт уход',
                'Факт',
              ],
              rows: data.detailRows.map((r) => ({
                Дата: r.dateLabel,
                'Табельный номер': r.tabNumber,
                Сотрудник: r.employee,
                Смена: r.shift,
                'План приход': r.planIn,
                'План уход': r.planOut,
                План: r.planHours ?? '',
                'Факт приход': r.factIn,
                'Факт уход': r.factOut,
                Факт: r.factHours ?? '',
              })),
            }
          : {
              sheetName: data.title,
              columns: ['№', 'Табельный номер', 'Сотрудник', 'График', 'Смен', 'План', 'Факт'],
              rows: data.summary.map((r) => ({
                '№': r.n,
                'Табельный номер': r.tabNumber,
                Сотрудник: r.employee,
                График: r.schedule,
                Смен: r.shifts,
                План: r.plan,
                Факт: r.fact,
              })),
            };
        break;
      }
      case 'shifts': {
        const data = await this.shiftReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          startTime: opts.startTime,
          endTime: opts.endTime,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: data.title,
          columns: [
            'Дата',
            'Табельный номер',
            'Сотрудник',
            'Тип смены',
            'План приход',
            'План уход',
            'По плану',
            'Факт приход',
            'Факт уход',
            'Факт',
            'Отметки приход',
            'Отметки уход',
          ],
          rows: data.rows.map((r) => ({
            Дата: r.dateLabel,
            'Табельный номер': r.tabNumber,
            Сотрудник: r.employee,
            'Тип смены': r.shiftType,
            'План приход': r.planIn,
            'План уход': r.planOut,
            'По плану': r.planHours,
            'Факт приход': r.factIn,
            'Факт уход': r.factOut,
            Факт: r.factHours,
            'Отметки приход': r.marksIn.join(', '),
            'Отметки уход': r.marksOut.join(', '),
          })),
        };
        break;
      }
      case 'attendance-overview': {
        const data = await this.attendanceOverview(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          locationIds: opts.locationIds,
          includeInactive: opts.includeInactive === true || opts.includeInactive === '1' || opts.includeInactive === 'true',
          cfg: opts.cfg,
        });
        const dayCols = data.days.map((d) => d.day);
        spec = {
          sheetName: data.title,
          columns: ['№', 'ФИО', ...dayCols, 'По плану', 'Вовремя', 'По причине', 'Без причины', 'Итого'],
          rows: data.rows.map((r) => {
            const rec: Record<string, unknown> = {
              '№': r.n,
              ФИО: r.employee,
              'По плану': r.planned,
              Вовремя: r.onTime,
              'По причине': r.absentReason || '',
              'Без причины': r.absentNoReason,
              Итого: r.total,
            };
            r.cells.forEach((c, i) => {
              rec[dayCols[i]] = c.text;
            });
            return rec;
          }),
        };
        break;
      }
      case 'staffing': {
        const data = await this.staffingReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionId: opts.divisionId,
          positionId: opts.positionId,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Подразделение',
            'Должность',
            'Общее количество штатных единиц',
            'Общее количество ставок',
            'Общее количество занятых штатных единиц',
            'Общее количество вакантных штатных единиц',
            'Ставка на штатную единицу',
            'Общее количество фактических ставок',
            'Оклад позиции',
            'Общая заработная плата',
            'Фактическая заработная плата',
            'Общая фактическая заработная плата',
          ],
          rows: data.rows.map((r) => ({
            '№': r.kind === 'group' ? r.groupIndex : '',
            'Подразделение': r.division,
            'Должность': r.position,
            'Общее количество штатных единиц': r.units,
            'Общее количество ставок': r.rates,
            'Общее количество занятых штатных единиц': r.occupied,
            'Общее количество вакантных штатных единиц': r.vacant,
            'Ставка на штатную единицу': r.ratePerUnit ?? '',
            'Общее количество фактических ставок': r.actualRates,
            'Оклад позиции': r.positionSalary ?? '',
            'Общая заработная плата': r.totalSalary,
            'Фактическая заработная плата': r.actualSalary ?? '',
            'Общая фактическая заработная плата': r.totalActualSalary,
          })),
        };
        break;
      }
      case 'gender': {
        const data = await this.genderReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionId: opts.divisionId,
          reportType: opts.reportType,
          ranges: opts.ranges,
          gradeId: opts.gradeId,
          educationType: opts.educationType,
        });
        spec = {
          sheetName: data.title,
          columns: [data.bucketLabel, 'Мужчины', 'Женщины', 'Итого'],
          rows: [
            ...data.rows.map((r) => ({
              [data.bucketLabel]: r.label,
              Мужчины: r.male,
              Женщины: r.female,
              Итого: r.total,
            })),
            {
              [data.bucketLabel]: 'Итого',
              Мужчины: data.totals.male,
              Женщины: data.totals.female,
              Итого: data.totals.total,
            },
          ],
        };
        break;
      }
      case 'movement-divisions': {
        const data = await this.movementDivisionsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionId,
        });
        spec = {
          sheetName: data.title,
          columns: [
            'Подразделение',
            'Принятые кол-во',
            'Принятые %',
            'Уволенные кол-во',
            'Уволенные %',
            'Прибывшие кол-во',
            'Прибывшие %',
            'Ушедшие кол-во',
            'Ушедшие %',
          ],
          rows: data.rows.map((r) => ({
            'Подразделение': r.division,
            'Принятые кол-во': r.hired,
            'Принятые %': r.hiredPct,
            'Уволенные кол-во': r.dismissed,
            'Уволенные %': r.dismissedPct,
            'Прибывшие кол-во': r.transferIn,
            'Прибывшие %': r.transferInPct,
            'Ушедшие кол-во': r.transferOut,
            'Ушедшие %': r.transferOutPct,
          })),
        };
        break;
      }
      case 'movement-staff': {
        const data = await this.movementStaffReport(tenantId, {
          from: opts.from,
          to: opts.to,
          kinds: opts.kinds,
          divisionGroupId: opts.divisionGroupId,
          positionGroupId: opts.positionGroupId,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
        const ru = (iso: string) => {
          const [y, m, d] = (iso || '').split('-');
          return y && m && d ? `${d}.${m}.${y}` : iso || '';
        };
        const rows: Record<string, unknown>[] = [
          {
            Раздел: 'Кол-во сотрудников на конец периода',
            '#': data.headcount,
            'Группа подразделений': '',
            Подразделение: '',
            Должность: '',
            'Группа позиций': '',
            Позиция: '',
            Сотрудник: '',
            'Дата движения': '',
            Примечание: '',
          },
        ];
        for (const sec of data.sections) {
          for (const r of sec.rows) {
            rows.push({
              Раздел: sec.title,
              '#': r.n,
              'Группа подразделений': r.divisionGroup,
              Подразделение: r.division,
              Должность: r.position,
              'Группа позиций': r.positionGroup,
              Позиция: r.slot,
              Сотрудник: r.employee,
              'Дата движения': ru(r.date),
              Примечание: sec.extra === 'dismissedAt' ? ru(r.dismissedAt || '') : r.note,
            });
          }
        }
        spec = {
          sheetName: data.title,
          columns: [
            'Раздел',
            '#',
            'Группа подразделений',
            'Подразделение',
            'Должность',
            'Группа позиций',
            'Позиция',
            'Сотрудник',
            'Дата движения',
            'Примечание',
          ],
          rows: rows.length
            ? rows
            : [{ Раздел: data.title, '#': data.headcount, Примечание: '' }],
        };
        break;
      }
      case 'positions': {
        const data = await this.positionsReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupId: opts.divisionGroupId,
          positionGroupId: opts.positionGroupId,
          positionId: opts.positionId,
        });
        const rows: Record<string, unknown>[] = [];
        for (const g of data.byDivision) {
          rows.push({
            Подразделение: g.name,
            Должность: '',
            Запланировано: g.planned,
            Забронировано: g.reserved,
            Занято: g.occupied,
            Доступно: g.available,
          });
          for (const l of g.lines) {
            rows.push({
              Подразделение: g.name,
              Должность: l.position,
              Запланировано: l.planned,
              Забронировано: l.reserved,
              Занято: l.occupied,
              Доступно: l.available,
            });
          }
        }
        spec = {
          sheetName: 'По подразделениям',
          columns: ['Подразделение', 'Должность', 'Запланировано', 'Забронировано', 'Занято', 'Доступно'],
          rows,
        };
        break;
      }
      case 'dismissals-by-reason': {
        const data = await this.dismissalsByReason(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          keyEmployee: opts.keyEmployee,
          basisType: opts.basisType,
        });
        spec = {
          sheetName: data.title,
          columns: ['Причина увольнения', 'Группа причин увольнения', 'Кол-во', '%'],
          rows: data.rows.map((r) => ({
            'Причина увольнения': r.reason,
            'Группа причин увольнения': r.group,
            'Кол-во': r.count,
            '%': r.pct,
          })),
        };
        break;
      }
      case 'dismissals-by-division': {
        const data = await this.dismissalsByDivision(tenantId, { from: opts.from, to: opts.to });
        const corner = 'Подразделения / Должности';
        const seen = new Map<string, number>();
        const colNames = data.divisions.map((d) => {
          const n = seen.get(d.name) || 0;
          seen.set(d.name, n + 1);
          return n ? `${d.name} (${n + 1})` : d.name;
        });
        spec = {
          sheetName: data.printTitle,
          columns: [corner, ...colNames, 'Итого'],
          rows: [
            ...data.rows.map((r) => ({
              [corner]: r.position,
              ...Object.fromEntries(colNames.map((name, i) => [name, r.counts[i] || ''])),
              Итого: r.total,
            })),
            {
              [corner]: 'Итого',
              ...Object.fromEntries(colNames.map((name, i) => [name, data.colTotals[i]])),
              Итого: data.grandTotal,
            },
          ],
        };
        break;
      }
      case 'timesheet-adjustments': {
        const data = await this.timesheetAdjustmentReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
        });
        const ru = (iso: string) => {
          const [y, m, d] = iso.split('-');
          return `${d}.${m}.${y}`;
        };
        const dateCols = data.days.map(ru);
        const blankZero = (n: number) => (n ? n : '');
        spec = {
          sheetName: 'Корректировка табеля',
          columns: ['Подразделения', 'Код подразделения', ...dateCols, 'Итого'],
          rows: [
            ...data.rows.map((r) => ({
              Подразделения: r.name,
              'Код подразделения': r.code,
              ...Object.fromEntries(dateCols.map((name, i) => [name, blankZero(r.counts[i])])),
              Итого: blankZero(r.total),
            })),
            {
              Подразделения: 'Итого',
              'Код подразделения': '',
              ...Object.fromEntries(dateCols.map((name, i) => [name, blankZero(data.colTotals[i])])),
              Итого: blankZero(data.grandTotal),
            },
          ],
        };
        break;
      }
      case 'grades': {
        const data = await this.gradeReport(tenantId, {
          date: opts.date ?? opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          filterByDept: opts.filterByDept,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Сотрудник',
            'Подразделение',
            'Должность',
            'Позиция',
            'Предыдущая дата',
            'Предыдущий разряд',
            'Дата',
            'Действующий разряд',
          ],
          rows: data.rows.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            Подразделение: r.division,
            Должность: r.position,
            Позиция: r.slot,
            'Предыдущая дата': r.prevDate,
            'Предыдущий разряд': r.prevGrade,
            Дата: r.date,
            'Действующий разряд': r.grade,
          })),
        };
        break;
      }
      case 'grade-changes': {
        const data = await this.gradeChangeReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
        });
        const rows: Record<string, unknown>[] = [];
        for (const g of data.groups) {
          g.lines.forEach((l, i) => {
            rows.push({
              Сотрудник: i === 0 ? g.employee : '',
              Подразделение: l.division,
              Должность: l.position,
              Позиция: l.slot,
              Дата: l.date,
              Источник: l.source,
              Разряд: l.grade,
            });
          });
        }
        spec = {
          sheetName: data.title,
          columns: ['Сотрудник', 'Подразделение', 'Должность', 'Позиция', 'Дата', 'Источник', 'Разряд'],
          rows,
        };
        break;
      }
      case 'discipline': {
        const data = await this.disciplineReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
        spec = {
          sheetName: 'Дисциплина',
          columns: [
            'Табельный номер',
            'Сотрудник',
            'Подразделение',
            'Должность',
            'Разряд',
            'Кол-во опозданий',
            'Опоздание (сред.)',
            'Опоздание (макс.)',
            'Кол-во отсутствий',
            'Кол-во приходов вовремя',
            'Кол-во ранних уходов',
            'Ранний уход (сред.)',
            'Ранний уход (макс.)',
            'Выходные дни',
          ],
          rows: (data.rows as Array<Record<string, unknown>>).map((r) => {
            const hm = (m: unknown) => {
              const n = Math.max(0, Math.round(Number(m) || 0));
              return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
            };
            return {
              'Табельный номер': r.tabNumber,
              Сотрудник: r.fullName,
              Подразделение: r.division,
              Должность: r.position,
              Разряд: r.grade,
              'Кол-во опозданий': r.lateCount,
              'Опоздание (сред.)': hm(r.lateAvgMinutes),
              'Опоздание (макс.)': hm(r.lateMaxMinutes),
              'Кол-во отсутствий': r.absentCount,
              'Кол-во приходов вовремя': r.onTimeCount,
              'Кол-во ранних уходов': r.earlyCount,
              'Ранний уход (сред.)': hm(r.earlyAvgMinutes),
              'Ранний уход (макс.)': hm(r.earlyMaxMinutes),
              'Выходные дни': r.dayOffCount,
            };
          }),
        };
        break;
      }
      case 'lateness': {
        const data = await this.latenessReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: data.title,
          columns: [
            '№',
            'Табельный номер',
            'Сотрудник',
            'Организационная единица',
            'Должность',
            'Количество опозданий',
            'Общая сумма',
          ],
          rows: data.rows.map((r) => ({
            '№': r.n,
            'Табельный номер': r.tabNumber,
            Сотрудник: r.employee,
            'Организационная единица': r.division,
            Должность: r.position,
            'Количество опозданий': r.lateCount,
            'Общая сумма': r.totalAmount,
          })),
        };
        break;
      }
      case 'schedules': {
        const data = await this.schedulesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          scheduleIds: opts.scheduleIds,
        });
        const dayCols = data.days.map((d) => d.dd);
        spec = {
          sheetName: data.title,
          columns: ['№', 'Сотрудник', 'Должность', 'Подразделение', 'График работы', ...dayCols, 'ИТОГО'],
          rows: data.rows.map((r) => {
            const row: Record<string, string | number> = {
              '№': r.n,
              Сотрудник: r.employee,
              Должность: r.position,
              Подразделение: r.division,
              'График работы': r.schedule,
              ИТОГО: r.total ?? '--',
            };
            data.days.forEach((d, i) => {
              row[d.dd] = r.days[i]?.text || '';
            });
            return row;
          }),
        };
        break;
      }
      case 'payroll-book': {
        const data = await this.payrollBookReport(tenantId, {
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
        const cols = [
          'n',
          'tabNumber',
          'employee',
          'pinfl',
          'inn',
          'inps',
          'division',
          'position',
          'grade',
          'salary',
          'plannedSalary',
          'workedDays',
          'workedHours',
          'openingBalance',
          'accruedBase',
          'accruedOther',
          'accruedTotal',
          'taxIncome',
          'taxInps',
          'deductionOther',
          'fineLate',
          'fineEarly',
          'fineAbsent',
          'fineSkipDay',
          'loan',
          'deductionTotal',
          'advance',
          'paymentOther',
          'paidTotal',
          'closingBalance',
          'socialTax',
          'ytdIncome',
          'ytdIncomeTax',
          'ytdSocialTax',
        ];
        spec = {
          sheetName: data.title,
          columns: cols,
          rows: data.rows.map((r) => Object.fromEntries(cols.map((c) => [c, (r as Record<string, unknown>)[c] ?? '']))),
        };
        break;
      }
      case 'payroll-grouped': {
        const data = await this.payrollGroupedReport(tenantId, {
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          positionType: opts.positionType,
          cfg: opts.cfg,
        });
        const cols = [
          'n',
          'employee',
          'divisionGroup',
          'divisionCode',
          'division',
          'orgUnit',
          'position',
          'positionType',
          'tabNumber',
          'grade',
          'schedule',
          'bankAccount',
          'pinfl',
          'inps',
          'salary',
          'planDays',
          'planHours',
          'workedDays',
          'workedHours',
          'overtimeDays',
          'overtimeHours',
          'schedulePlan',
          'scheduleFact',
          'loan',
          'advance',
          'travelAdvance',
          'ndfl',
          'inpsAmount',
          'deductionTotal',
          'toPay',
          'sheet',
          'difference',
        ];
        spec = {
          sheetName: data.title,
          columns: cols,
          rows: data.rows.map((r) => Object.fromEntries(cols.map((c) => [c, (r as Record<string, unknown>)[c] ?? '']))),
        };
        break;
      }
      case 'payments': {
        const data = await this.paymentsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          employeeIds: opts.employeeIds,
        });
        spec = {
          sheetName: data.title,
          columns: ['Сотрудник', 'Должность', 'Подразделение', 'Наличные', 'Безналичные', 'Итого'],
          rows: [
            ...data.rows.map((r) => ({
              Сотрудник: r.employee,
              Должность: r.position,
              Подразделение: r.division,
              Наличные: r.cash,
              Безналичные: r.bank,
              Итого: r.total,
            })),
            {
              Сотрудник: 'Итого',
              Должность: '',
              Подразделение: '',
              Наличные: data.totals.cash,
              Безналичные: data.totals.bank,
              Итого: data.totals.total,
            },
          ],
        };
        break;
      }
      case 'division-expenses': {
        const data = await this.divisionExpensesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          divisionGroupIds: opts.divisionGroupIds || opts.divisionGroupId,
          positionIds: opts.positionIds || opts.positionId,
          positionGroupIds: opts.positionGroupIds || opts.positionGroupId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
        const dayCols = data.days.map((d) => d.dd);
        spec = {
          sheetName: 'Развернутый по сотрудникам',
          columns: [
            '№',
            'Подразделение',
            'Сотрудник',
            'Должность',
            'Оклад',
            ...dayCols,
            'Всего часов',
            'Всего начислено',
            ...dayCols.map((d) => `Доп ${d}`),
            'Всего часов (доп)',
            'Всего начислено (доп)',
            'Дорожные начисления',
            'Всего разовые',
          ],
          rows: data.detailed.map((r) => {
            const row: Record<string, unknown> = {
              '№': r.n,
              Подразделение: r.division,
              Сотрудник: r.employee,
              Должность: r.position,
              Оклад: r.salary,
              'Всего часов': r.totalHours,
              'Всего начислено': r.accrued,
              'Всего часов (доп)': r.extraTotalHours,
              'Всего начислено (доп)': r.extraAccrued,
              'Дорожные начисления': r.travel,
              'Всего разовые': r.oneTimeTotal,
            };
            data.days.forEach((d, i) => {
              row[d.dd] = r.hours[i] ?? 0;
              row[`Доп ${d.dd}`] = r.extraHours[i] ?? 0;
            });
            return row;
          }),
        };
        break;
      }
      case 'fot': {
        const data = await this.fotReport(tenantId, {
          from: opts.from,
          to: opts.to,
          divisionIds: opts.divisionIds || opts.divisionId,
          locationIds: opts.locationIds,
          positionIds: opts.positionIds || opts.positionId,
          gradeIds: opts.gradeIds || opts.gradeId,
          employeeIds: opts.employeeIds,
          cfg: opts.cfg,
        });
        spec = {
          sheetName: 'По сотрудникам',
          columns: ['№', 'Сотрудник', 'Подразделение', 'Должность', 'Разряд', 'Оклад', 'Всего часов', 'Всего начислено'],
          rows: data.byEmployee.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            Подразделение: r.division,
            Должность: r.position,
            Разряд: r.grade,
            Оклад: r.salary,
            'Всего часов': r.totalHours,
            'Всего начислено': r.accrued,
          })),
        };
        break;
      }
      case 'one-time': {
        const data = await this.oneTimeAccrualsReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          kind: opts.kind || opts.reportType || opts.kinds,
        });
        const moneyRu = (n: number) =>
          (Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        spec = {
          sheetName: 'Отчет разового начисления',
          columns: ['№', 'Сотрудник', 'Подразделение', 'Должность', 'Дата', 'Тип', 'Тип операции', 'Сумма', 'Примечание'],
          rows: data.rows.map((r) => ({
            '№': r.n,
            Сотрудник: r.employee,
            Подразделение: r.division,
            Должность: r.position,
            Дата: r.date,
            Тип: r.type,
            'Тип операции': r.operationType,
            Сумма: moneyRu(r.amount),
            Примечание: r.note,
          })),
        };
        break;
      }
      case 'preliminary-salary': {
        const data = await this.preliminarySalaryReport(tenantId, {
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
        });
        const moneyRu = (n: number) => {
          const v = Number(n) || 0;
          if (!v) return 0;
          return v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
        };
        spec = {
          sheetName: 'Отчет по предварительному оклад',
          columns: [
            '№',
            'Сотрудник',
            'Подразделение',
            'Должность',
            'График работы',
            'Начисление',
            'Удержание',
            'ИТОГО',
            'Выплачено',
            'Осталось',
          ],
          rows: [
            ...data.rows.map((r) => ({
              '№': r.n,
              Сотрудник: r.employee,
              Подразделение: r.division,
              Должность: r.position,
              'График работы': r.schedule,
              Начисление: moneyRu(r.accrued),
              Удержание: moneyRu(r.deduction),
              ИТОГО: moneyRu(r.total),
              Выплачено: moneyRu(r.paid),
              Осталось: moneyRu(r.remaining),
            })),
            {
              '№': 'ИТОГО',
              Сотрудник: '',
              Подразделение: '',
              Должность: '',
              'График работы': '',
              Начисление: moneyRu(data.totals.accrued),
              Удержание: moneyRu(data.totals.deduction),
              ИТОГО: moneyRu(data.totals.total),
              Выплачено: moneyRu(data.totals.paid),
              Осталось: moneyRu(data.totals.remaining),
            },
          ],
        };
        break;
      }
      case 'penalties': {
        const data = await this.penaltiesReport(tenantId, {
          from: opts.from,
          to: opts.to,
          year: opts.year,
          month: opts.month,
          divisionIds: opts.divisionIds || opts.divisionId,
          positionIds: opts.positionIds || opts.positionId,
          employeeIds: opts.employeeIds,
          filterByDept: opts.filterByDept,
        });
        const moneyRu = (n: number) => {
          const v = Number(n) || 0;
          if (!v) return '';
          return v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
        };
        const dayCols = data.days.map((d) => d.dd);
        spec = {
          sheetName: 'Штрафы',
          columns: ['Сотрудник', 'Должность', 'Подразделение', 'График работы', ...dayCols, 'Итог'],
          rows: [
            ...data.rows.map((r) => {
              const row: Record<string, unknown> = {
                Сотрудник: r.employee,
                Должность: r.position,
                Подразделение: r.division,
                'График работы': r.schedule,
                Итог: moneyRu(r.total),
              };
              data.days.forEach((d, i) => {
                row[d.dd] = moneyRu(r.amounts[i] || 0);
              });
              return row;
            }),
            (() => {
              const row: Record<string, unknown> = {
                Сотрудник: 'Итог',
                Должность: '',
                Подразделение: '',
                'График работы': '',
                Итог: moneyRu(data.totals.total),
              };
              data.days.forEach((d, i) => {
                row[d.dd] = moneyRu(data.totals.amounts[i] || 0);
              });
              return row;
            })(),
          ],
        };
        break;
      }
      case 'account-balance': {
        const data = await this.accountBalanceReport(tenantId, opts);
        const cols = [
          'subconto',
          'openingDebit',
          'openingCredit',
          'turnoverDebit',
          'turnoverCredit',
          'closingDebit',
          'closingCredit',
        ];
        if (opts.showQty) cols.push('qty');
        spec = {
          sheetName: data.title,
          columns: cols,
          rows: data.rows as Record<string, unknown>[],
        };
        break;
      }
      case 'trial-balance': {
        const data = await this.trialBalanceReport(tenantId, opts);
        const cols = [
          'account',
          'subconto',
          'openingDebit',
          'openingCredit',
          'turnoverDebit',
          'turnoverCredit',
          'closingDebit',
          'closingCredit',
        ];
        if (opts.showQty) cols.push('qty');
        spec = {
          sheetName: data.title,
          columns: cols,
          rows: data.rows as Record<string, unknown>[],
        };
        break;
      }
      default: {
        const data = await this.fetchAnalytics(tenantId, kind, opts);
        const rawRows = this.extractAnalyticsRows(data);
        const flatRows = rawRows.map((r) => flattenExportRow(r));
        const columns =
          flatRows.length > 0
            ? Object.keys(flatRows[0]).slice(0, 24)
            : ['empty'];
        const title =
          data && typeof data === 'object' && 'title' in (data as object)
            ? String((data as { title: string }).title)
            : kind;
        spec = { sheetName: title, columns, rows: flatRows.length ? flatRows : [{ empty: '' }] };
        break;
      }
    }

    const buffer = await buildExcelBuffer({
      sheetName: spec.sheetName,
      columns: spec.columns,
      rows: spec.rows,
    });
    return { buffer, filename: `${kind}.xlsx` };
  }

  async create(tenantId: string, key: string, body: Record<string, unknown>) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    const data = this.pick(body, res.fields);
    const noTenant = [
      'careerPathStep',
      'loanPayment',
      'clearanceTemplateItem',
      'clearanceSheetItem',
      'clearanceTemplateEmployee',
    ];
    if (!noTenant.includes(res.model)) {
      (data as any).tenantId = tenantId;
    }

    // Domain hooks — name/wage: fill old* only; mutate employee on /post
    if (key === 'name-changes' && data.employeeId) {
      await this.prepareNameChange(tenantId, data);
      if (!data.status) data.status = 'draft';
    }
    if (key === 'wage-changes' && data.employeeId) {
      await this.prepareWageChange(tenantId, data);
      if (!data.status) data.status = 'draft';
    }
    if (key === 'grade-history') {
      return this.createGradePromotion(tenantId, body);
    }
    if (key === 'career-paths') {
      return this.createCareerPath(tenantId, body);
    }
    if (key === 'timesheet-adjustments') {
      return this.createTimesheetCorrection(tenantId, body);
    }
    if (key === 'schedule-overrides') {
      return this.createIndividualSchedule(tenantId, body);
    }
    if (key === 'position-schedules') {
      return this.createPositionScheduleDoc(tenantId, body);
    }
    if (key === 'rosters') {
      return this.createWorkRoster(tenantId, body);
    }
    if (key === 'clearance-templates') {
      return this.clearance.createClearanceTemplate(tenantId, body);
    }
    if (key === 'incident-types') {
      return this.createIncidentType(tenantId, body);
    }
    if (key === 'incidents') {
      return this.createIncident(tenantId, body);
    }
    if (key === 'loan-payments' && data.loanId) {
      const amount = Number(data.amount);
      if (!(amount > 0)) {
        throw new BadRequestException('Loan payment amount must be > 0');
      }
      await this.applyLoanPayment(tenantId, data);
    }
    if (key === 'clearance-sheets' && data.templateId && !body.skipItems) {
      return this.clearance.createClearanceFromTemplate(tenantId, data);
    }
    if (key === 'sales-accruals' && !data.status) {
      data.status = DocumentLifecycle.draft;
    }
    if (key === 'sales-accruals') {
      if (!data.paymentType) data.paymentType = 'cash';
      if (!data.salesKind) data.salesKind = 'personal';
      if (!data.rounding) data.rounding = '####.000000';
      if (!data.number) {
        const n = await this.prisma.salesCommissionAccrual.count({ where: { tenantId } });
        data.number = String(n + 1).padStart(10, '0');
      }
    }
    if (key === 'staff-positions' && data.tariffGroupId) {
      await this.tariff.ensureTariffGroupApproved(
        tenantId,
        String(data.tariffGroupId),
      );
    }
    if (key === 'staff-positions') {
      this.normalizeStaffPositionDates(data);
    }
    if (key === 'tariff-groups') {
      if (!data.code && data.name) {
        data.code = String(data.name)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9А-ЯЁ]+/gi, '-')
          .slice(0, 24) || `TG-${Date.now().toString(36).toUpperCase()}`;
      }
      if (!data.fullName && data.name) data.fullName = data.name;
    }
    if (key === 'tariff-approvals') {
      if (!data.status) data.status = ApprovalStatus.draft;
      if (data.tariffGroupId && data.baseRate == null) {
        const g = await this.prisma.tariffGroup.findFirst({
          where: { id: String(data.tariffGroupId), tenantId },
          select: { baseRate: true },
        });
        if (g) data.baseRate = g.baseRate;
      }
    }
    if (key === 'gph-contracts') {
      if (!data.status) data.status = DocumentLifecycle.draft;
      if (data.allowAddService === undefined) data.allowAddService = true;
      if (data.employeeId && (!data.divisionId || !data.personId)) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: String(data.employeeId), tenantId },
          select: { divisionId: true, personId: true },
        });
        if (emp) {
          if (!data.divisionId && emp.divisionId) data.divisionId = emp.divisionId;
          if (!data.personId && emp.personId) data.personId = emp.personId;
        }
      }
    }
    if (key === 'gph-services') {
      if (!data.status) data.status = DocumentLifecycle.draft;
      if (data.isActive === undefined) data.isActive = true;
      const name = data.name != null ? String(data.name).trim() : '';
      if (!name) data.name = 'Услуга по договору ГПХ';
      const code = data.code != null ? String(data.code).trim() : '';
      if (!code) {
        data.code = `GPH-S-${Date.now().toString(36).toUpperCase()}`;
      }
      if (data.month instanceof Date && Number.isNaN(data.month.getTime())) {
        throw new BadRequestException('Некорректный месяц');
      }
      if (!data.month && data.contractId) {
        const c = await this.prisma.gphContract.findFirst({
          where: { id: String(data.contractId), tenantId },
          select: { startDate: true },
        });
        if (c?.startDate) {
          data.month = new Date(
            Date.UTC(c.startDate.getUTCFullYear(), c.startDate.getUTCMonth(), 1),
          );
        }
      }
      if (!data.month) {
        const now = new Date();
        data.month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      } else if (data.month instanceof Date) {
        data.month = new Date(
          Date.UTC(data.month.getUTCFullYear(), data.month.getUTCMonth(), 1),
        );
      }
    }
    if (key === 'facts' && data.factDate != null) {
      const d =
        data.factDate instanceof Date
          ? data.factDate
          : new Date(String(data.factDate));
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Некорректная дата факта');
      }
      data.factDate = d;
    }
    if (key === 'fact-types' && !data.code && data.name) {
      data.code = String(data.name)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
        .slice(0, 32) || `FT_${Date.now().toString(36).toUpperCase()}`;
    }
    if (key === 'accrual-types') {
      if (!data.code && data.name) {
        data.code = String(data.name)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
          .slice(0, 32) || `ACC_${Date.now().toString(36).toUpperCase()}`;
      }
      if (data.sortOrder != null) data.sortOrder = Number(data.sortOrder) || 0;
      if (data.isActive === undefined) data.isActive = true;
      if (!data.periodCalc) data.periodCalc = 'period';
      if (!data.resultMode) data.resultMode = 'formula';
      if (!data.accountingMode) data.accountingMode = 'employee';
    }
    if (key === 'deduction-types') {
      if (!data.code && data.name) {
        data.code = String(data.name)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
          .slice(0, 32) || `DED_${Date.now().toString(36).toUpperCase()}`;
      }
      if (data.sortOrder != null) data.sortOrder = Number(data.sortOrder) || 0;
      if (data.isActive === undefined) data.isActive = true;
      if (!data.periodCalc) data.periodCalc = 'period';
      if (!data.resultMode) data.resultMode = 'formula';
      if (!data.accountingMode) data.accountingMode = 'employee';
      if (data.accountingMode === 'employee') data.account = null;
    }

    return this.delegate(res.model).create({
      data,
      include: res.include,
    });
  }

  async update(tenantId: string, key: string, id: string, body: Record<string, unknown>) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    if (key === 'timesheet-adjustments') {
      return this.updateTimesheetCorrection(tenantId, id, body);
    }
    if (key === 'schedule-overrides') {
      return this.updateIndividualSchedule(tenantId, id, body);
    }
    if (key === 'position-schedules') {
      return this.updatePositionScheduleDoc(tenantId, id, body);
    }
    if (key === 'rosters') {
      return this.updateWorkRoster(tenantId, id, body);
    }
    if (key === 'grade-history') {
      return this.updateGradePromotion(tenantId, id, body);
    }
    if (key === 'career-paths') {
      return this.updateCareerPath(tenantId, id, body);
    }
    if (key === 'clearance-templates') {
      return this.clearance.updateClearanceTemplate(tenantId, id, body);
    }
    if (key === 'incidents') {
      return this.updateIncident(tenantId, id, body);
    }
    await this.ensureOwned(tenantId, res.model, id);
    const data = this.pick(body, res.fields);
    if (key === 'staff-positions' && data.tariffGroupId) {
      await this.tariff.ensureTariffGroupApproved(
        tenantId,
        String(data.tariffGroupId),
      );
    }
    if (key === 'staff-positions') {
      this.normalizeStaffPositionDates(data);
    }
    if (key === 'deduction-types') {
      if (data.sortOrder != null) data.sortOrder = Number(data.sortOrder) || 0;
      if (data.accountingMode === 'employee') data.account = null;
    }
    if (key === 'accrual-types' && data.sortOrder != null) {
      data.sortOrder = Number(data.sortOrder) || 0;
    }
    if (key === 'gph-services' && data.month instanceof Date && !Number.isNaN(data.month.getTime())) {
      data.month = new Date(
        Date.UTC(data.month.getUTCFullYear(), data.month.getUTCMonth(), 1),
      );
    }
    return this.delegate(res.model).update({
      where: { id },
      data,
      include: res.include,
    });
  }

  async remove(tenantId: string, key: string, id: string) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    if (key === 'timesheet-adjustments') {
      const row = await this.prisma.timesheetCorrection.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === 'posted') {
        throw new BadRequestException('Posted timesheet correction cannot be deleted');
      }
    }
    if (key === 'schedule-overrides') {
      const row = await this.prisma.individualSchedule.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === 'posted') {
        throw new BadRequestException('Проведённый индивидуальный график нельзя удалить');
      }
    }
    if (key === 'position-schedules') {
      const row = await this.prisma.positionScheduleDoc.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === 'posted') {
        throw new BadRequestException('Проведённый документ нельзя удалить');
      }
    }
    if (key === 'rosters') {
      const row = await this.prisma.workRoster.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === 'posted') {
        throw new BadRequestException('Проведённое расписание нельзя удалить');
      }
    }
    if (key === 'tariff-approvals') {
      const row = await this.prisma.tariffGroupApproval.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === ApprovalStatus.approved) {
        throw new BadRequestException('Проведённое утверждение нельзя удалить');
      }
    }
    if (key === 'grade-history') {
      const row = await this.prisma.gradePromotion.findFirst({
        where: { id, tenantId },
      });
      if (!row) throw new NotFoundException('Not found');
      if (row.status === DocumentLifecycle.posted) {
        throw new BadRequestException('Проведённое повышение нельзя удалить');
      }
    }
    await this.ensureOwned(tenantId, res.model, id);
    return this.delegate(res.model).delete({ where: { id } });
  }

  private async ensureOwned(tenantId: string, model: string, id: string) {
    const noTenant = [
      'careerPathStep',
      'loanPayment',
      'clearanceTemplateItem',
      'clearanceSheetItem',
      'clearanceTemplateEmployee',
    ];
    if (noTenant.includes(model)) {
      const row = await this.delegate(model).findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Not found');
      return row;
    }
    const row = await this.delegate(model).findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  private async prepareNameChange(tenantId: string, data: Record<string, unknown>) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: String(data.employeeId), tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!data.oldLastName) data.oldLastName = emp.lastName;
    if (!data.oldFirstName) data.oldFirstName = emp.firstName;
    if (data.oldMiddleName === undefined) data.oldMiddleName = emp.middleName;
  }

  private async prepareWageChange(tenantId: string, data: Record<string, unknown>) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: String(data.employeeId), tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (data.oldAmount == null && emp.baseSalary != null) {
      data.oldAmount = emp.baseSalary;
    }
  }

  private async applyGradeChange(tenantId: string, data: Record<string, unknown>) {
    const employeeId = String(data.employeeId);
    const gradeId = String(data.gradeId);
    const empUpdate: Prisma.EmployeeUpdateInput = {
      grade: { connect: { id: gradeId } },
    };

    // Grade → tariff: pick active tariff group for grade and apply baseRate to salary
    const tariff = await this.prisma.tariffGroup.findFirst({
      where: { tenantId, gradeId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (tariff && Number(tariff.baseRate) > 0) {
      const approved = await this.prisma.tariffGroupApproval.findFirst({
        where: {
          tenantId,
          tariffGroupId: tariff.id,
          status: ApprovalStatus.approved,
        },
      });
      if (approved) {
        empUpdate.baseSalary = tariff.baseRate;
        data.appliedTariffGroupId = tariff.id;
        data.appliedBaseRate = Number(tariff.baseRate);
      }
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: empUpdate,
    });
  }

  private parseGradePromotionLines(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((l, i) => {
        const row = l as Record<string, unknown>;
        const employeeId = String(row.employeeId || '').trim();
        if (!employeeId) return null;
        return {
          employeeId,
          staffPositionId: row.staffPositionId ? String(row.staffPositionId) : null,
          fromGradeId: row.fromGradeId ? String(row.fromGradeId) : null,
          toGradeId: row.toGradeId ? String(row.toGradeId) : null,
          changeDate: row.changeDate ? new Date(String(row.changeDate)) : null,
          attemptStatus: row.attemptStatus != null ? String(row.attemptStatus) : null,
          lineState: row.lineState != null ? String(row.lineState) : null,
          note: row.note != null ? String(row.note) : null,
          sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : i,
        };
      })
      .filter(Boolean) as {
      employeeId: string;
      staffPositionId: string | null;
      fromGradeId: string | null;
      toGradeId: string | null;
      changeDate: Date | null;
      attemptStatus: string | null;
      lineState: string | null;
      note: string | null;
      sortOrder: number;
    }[];
  }

  private async createGradePromotion(
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    const res = findResource('grade-history')!;
    const data = this.pick(body, res.fields);
    if (!data.documentDate) {
      throw new BadRequestException('Дата обязательна');
    }
    if (!data.status) data.status = DocumentLifecycle.draft;
    if (!data.periodType) data.periodType = GradePromotionPeriodType.grade_only;
    const lines = this.parseGradePromotionLines(body.lines);
    return this.prisma.gradePromotion.create({
      data: {
        tenantId,
        documentDate: new Date(String(data.documentDate)),
        documentNumber: data.documentNumber != null ? String(data.documentNumber) : null,
        divisionId: data.divisionId ? String(data.divisionId) : null,
        note: data.note != null ? String(data.note) : null,
        periodType: data.periodType as GradePromotionPeriodType,
        medicalExam: Boolean(data.medicalExam),
        useGphPeriod: Boolean(data.useGphPeriod),
        assignTraining: Boolean(data.assignTraining),
        status: data.status as DocumentLifecycle,
        lines: { create: lines },
      },
      include: res.include,
    });
  }

  private async updateGradePromotion(
    tenantId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const res = findResource('grade-history')!;
    const existing = await this.prisma.gradePromotion.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Not found');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Проведённое повышение нельзя изменить');
    }
    const data = this.pick(body, res.fields);
    const patch: Prisma.GradePromotionUpdateInput = {};
    if (data.documentDate !== undefined) {
      patch.documentDate = new Date(String(data.documentDate));
    }
    if (data.documentNumber !== undefined) {
      patch.documentNumber =
        data.documentNumber != null ? String(data.documentNumber) : null;
    }
    if (data.divisionId !== undefined) {
      patch.division = data.divisionId
        ? { connect: { id: String(data.divisionId) } }
        : { disconnect: true };
    }
    if (data.note !== undefined) {
      patch.note = data.note != null ? String(data.note) : null;
    }
    if (data.periodType !== undefined) {
      patch.periodType = data.periodType as GradePromotionPeriodType;
    }
    if (data.medicalExam !== undefined) patch.medicalExam = Boolean(data.medicalExam);
    if (data.useGphPeriod !== undefined) patch.useGphPeriod = Boolean(data.useGphPeriod);
    if (data.assignTraining !== undefined) {
      patch.assignTraining = Boolean(data.assignTraining);
    }
    if (data.status !== undefined) {
      patch.status = data.status as DocumentLifecycle;
    }

    if (body.lines !== undefined) {
      const lines = this.parseGradePromotionLines(body.lines);
      patch.lines = {
        deleteMany: {},
        create: lines,
      };
    }

    return this.prisma.gradePromotion.update({
      where: { id },
      data: patch,
      include: res.include,
    });
  }

  async postGradePromotion(tenantId: string, id: string, postedBy?: string) {
    const res = findResource('grade-history')!;
    const row = await this.prisma.gradePromotion.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Повышение разрядов не найдено');
    if (row.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Документ уже проведён');
    }
    if (row.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Отменённый документ нельзя провести');
    }
    if (!row.lines.length) {
      throw new BadRequestException('Добавьте хотя бы одного сотрудника');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of row.lines) {
        if (!line.toGradeId) continue;
        const effectiveAt = line.changeDate || row.documentDate;
        await tx.employeeGradeHistory.create({
          data: {
            tenantId,
            employeeId: line.employeeId,
            gradeId: line.toGradeId,
            effectiveAt,
            note: line.note || row.note || undefined,
          },
        });

        const empUpdate: Prisma.EmployeeUpdateInput = {
          grade: { connect: { id: line.toGradeId } },
        };
        const tariff = await tx.tariffGroup.findFirst({
          where: { tenantId, gradeId: line.toGradeId, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
        if (tariff && Number(tariff.baseRate) > 0) {
          const approved = await tx.tariffGroupApproval.findFirst({
            where: {
              tenantId,
              tariffGroupId: tariff.id,
              status: ApprovalStatus.approved,
            },
          });
          if (approved) empUpdate.baseSalary = tariff.baseRate;
        }
        await tx.employee.update({
          where: { id: line.employeeId },
          data: empUpdate,
        });

        if (row.assignTraining) {
          await tx.gradePromotionRecommendation.updateMany({
            where: {
              tenantId,
              employeeId: line.employeeId,
              status: 'pending',
            },
            data: { status: 'used' },
          });
        }
      }
      await tx.gradePromotion.update({
        where: { id },
        data: {
          status: DocumentLifecycle.posted,
          postedAt: new Date(),
          postedBy: postedBy ?? undefined,
        },
      });
    });

    return this.prisma.gradePromotion.findFirst({
      where: { id },
      include: res.include,
    });
  }

  /** Заполнить строки сотрудниками подразделения */
  async fillGradePromotionLines(
    tenantId: string,
    opts: { divisionId?: string; employeeIds?: string[] },
  ) {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: 'active',
    };
    if (opts.divisionId) where.divisionId = opts.divisionId;
    if (opts.employeeIds?.length) where.id = { in: opts.employeeIds };

    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        gradeId: true,
        staffPositionId: true,
        positionId: true,
        grade: { select: { id: true, code: true, name: true, level: true } },
        staffPosition: { select: { id: true, code: true, title: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });

    const grades = await this.prisma.grade.findMany({
      where: { tenantId, isActive: true },
      orderBy: { level: 'asc' },
      select: { id: true, code: true, name: true, level: true },
    });

    return employees.map((e, i) => {
      const next =
        e.grade?.level != null
          ? grades.find((g) => g.level === (e.grade!.level ?? 0) + 1) || null
          : grades[0] || null;
      return {
        employeeId: e.id,
        employee: e,
        staffPositionId: e.staffPositionId,
        staffPosition: e.staffPosition,
        position: e.position,
        fromGradeId: e.gradeId,
        fromGrade: e.grade,
        toGradeId: next?.id ?? null,
        toGrade: next,
        changeDate: null,
        attemptStatus: null,
        lineState: null,
        note: null,
        sortOrder: i,
      };
    });
  }

  async listPendingGradeRecommendations(tenantId: string) {
    return this.prisma.gradePromotionRecommendation.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { recommendedAt: 'desc' },
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
        grade: { select: { id: true, code: true, name: true } },
        division: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private parseCareerSteps(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((l, i) => {
        const row = l as Record<string, unknown>;
        const fromGradeId = row.fromGradeId ? String(row.fromGradeId) : null;
        const toGradeId = row.toGradeId ? String(row.toGradeId) : null;
        const title =
          row.title != null && String(row.title).trim()
            ? String(row.title)
            : fromGradeId || toGradeId
              ? 'Переход'
              : `Шаг ${i + 1}`;
        return {
          title,
          positionId: row.positionId ? String(row.positionId) : null,
          gradeId: row.gradeId ? String(row.gradeId) : toGradeId,
          fromGradeId,
          toGradeId,
          sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : i,
          minMonths:
            row.minMonths != null && row.minMonths !== ''
              ? Number(row.minMonths)
              : row.periodMonths != null && row.periodMonths !== ''
                ? Number(row.periodMonths)
                : null,
          attempts:
            row.attempts != null && row.attempts !== ''
              ? Number(row.attempts)
              : 1,
          periodMonths:
            row.periodMonths != null && row.periodMonths !== ''
              ? Number(row.periodMonths)
              : null,
          penaltyPeriodMonths:
            row.penaltyPeriodMonths != null && row.penaltyPeriodMonths !== ''
              ? Number(row.penaltyPeriodMonths)
              : null,
          conditions:
            row.conditions == null
              ? undefined
              : (row.conditions as Prisma.InputJsonValue),
        };
      })
      .filter((s) => s.fromGradeId || s.toGradeId || s.positionId || s.title);
  }

  private async createCareerPath(
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    const res = findResource('career-paths')!;
    const data = this.pick(body, res.fields);
    if (!data.name) throw new BadRequestException('Название обязательно');
    if (!data.code) {
      data.code = String(data.name)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9А-ЯЁ]+/gi, '-')
        .slice(0, 24) || `CP-${Date.now().toString(36).toUpperCase()}`;
    }
    if (data.isActive === undefined) data.isActive = true;
    if (data.sortOrder === undefined) data.sortOrder = 0;
    const steps = this.parseCareerSteps(body.steps);
    return this.prisma.careerPath.create({
      data: {
        tenantId,
        code: String(data.code),
        name: String(data.name),
        sortOrder: Number(data.sortOrder) || 0,
        isActive: Boolean(data.isActive),
        steps: { create: steps },
      },
      include: res.include,
    });
  }

  private async updateCareerPath(
    tenantId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const res = findResource('career-paths')!;
    await this.ensureOwned(tenantId, 'careerPath', id);
    const data = this.pick(body, res.fields);
    const patch: Prisma.CareerPathUpdateInput = {};
    if (data.name !== undefined) patch.name = String(data.name);
    if (data.code !== undefined) patch.code = String(data.code);
    if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder) || 0;
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);
    if (body.steps !== undefined) {
      const steps = this.parseCareerSteps(body.steps);
      patch.steps = {
        deleteMany: {},
        create: steps,
      };
    }
    return this.prisma.careerPath.update({
      where: { id },
      data: patch,
      include: res.include,
    });
  }

  async postNameChange(tenantId: string, id: string, postedBy?: string) {
    return this.hrChanges.postNameChange(tenantId, id, postedBy);
  }

  async postWageChange(tenantId: string, id: string, postedBy?: string) {
    return this.hrChanges.postWageChange(tenantId, id, postedBy);
  }

  async completeClearanceSheet(tenantId: string, id: string) {
    return this.clearance.completeClearanceSheet(tenantId, id);
  }

  async cancelClearanceSheet(tenantId: string, id: string) {
    return this.clearance.cancelClearanceSheet(tenantId, id);
  }

  async approveTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    return this.tariff.approveTariffApproval(tenantId, id, reviewedBy);
  }

  async postTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    return this.tariff.postTariffApproval(tenantId, id, reviewedBy);
  }

  async bulkPostTariffApprovals(
    tenantId: string,
    ids: string[],
    reviewedBy?: string,
  ) {
    return this.tariff.bulkPostTariffApprovals(tenantId, ids, reviewedBy);
  }

  async bulkDeleteTariffApprovals(tenantId: string, ids: string[]) {
    return this.tariff.bulkDeleteTariffApprovals(tenantId, ids);
  }

  async rejectTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    return this.tariff.rejectTariffApproval(tenantId, id, reviewedBy);
  }

  async postSettlement(tenantId: string, id: string) {
    return this.finance.postSettlement(tenantId, id);
  }

  async closeSettlement(tenantId: string, id: string) {
    return this.finance.closeSettlement(tenantId, id);
  }

  async cancelNameChange(tenantId: string, id: string, cancelledBy?: string) {
    return this.hrChanges.cancelNameChange(tenantId, id, cancelledBy);
  }

  async cancelWageChange(tenantId: string, id: string, cancelledBy?: string) {
    return this.hrChanges.cancelWageChange(tenantId, id, cancelledBy);
  }

  async postSalesAccrual(tenantId: string, id: string) {
    return this.finance.postSalesAccrual(tenantId, id);
  }

  async cancelSalesAccrual(tenantId: string, id: string) {
    return this.finance.cancelSalesAccrual(tenantId, id);
  }

  async buildFactsImportTemplate() {
    const { buildFactsImportTemplateBuffer } = await import('./facts-xlsx');
    return {
      buffer: await buildFactsImportTemplateBuffer(),
      filename: 'import-facts-template.xlsx',
    };
  }

  async importFacts(tenantId: string, rows: Record<string, unknown>[]) {
    const { parseFactDate } = await import('./facts-xlsx');
    const result = {
      created: 0,
      skipped: 0,
      errors: [] as { row: number; message: string }[],
    };

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        divisionId: true,
      },
    });
    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });
    let factTypes = await this.prisma.factType.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });

    const empByName = new Map<string, (typeof employees)[0]>();
    for (const e of employees) {
      const full = norm(
        [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
      );
      if (full) empByName.set(full, e);
      // also first-last order variants used in imports
      const alt = norm(
        [e.firstName, e.lastName, e.middleName].filter(Boolean).join(' '),
      );
      if (alt) empByName.set(alt, e);
      const all = norm(
        [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
      );
      // single blob of FIO without order: tokens sorted
      const tokens = all.split(' ').filter(Boolean).sort().join(' ');
      if (tokens) empByName.set(tokens, e);
      empByName.set(norm(e.tabNumber), e);
    }
    const divByName = new Map<string, (typeof divisions)[0]>();
    for (const d of divisions) {
      divByName.set(norm(d.name), d);
      if (d.code) divByName.set(norm(d.code), d);
    }
    const typeByName = new Map<string, (typeof factTypes)[0]>();
    for (const t of factTypes) {
      typeByName.set(norm(t.name), t);
      typeByName.set(norm(t.code), t);
    }

    const pick = (row: Record<string, unknown>, keys: string[]) => {
      for (const k of keys) {
        if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
      }
      const entries = Object.entries(row);
      for (const k of keys) {
        const found = entries.find(([ek]) => norm(ek) === norm(k));
        if (found && String(found[1]).trim()) return String(found[1]).trim();
      }
      return '';
    };

    const ensureType = async (name: string) => {
      const key = norm(name);
      let t = typeByName.get(key);
      if (t) return t;
      const codeBase = name
        .toUpperCase()
        .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24) || `FT_${Date.now().toString(36).toUpperCase()}`;
      let code = codeBase;
      let n = 1;
      while (factTypes.some((x) => x.code === code)) {
        code = `${codeBase.slice(0, 20)}_${n++}`;
      }
      t = await this.prisma.factType.create({
        data: {
          tenantId,
          code,
          name,
          unit: 'Количество',
          isActive: true,
        },
        select: { id: true, name: true, code: true },
      });
      factTypes = [...factTypes, t];
      typeByName.set(key, t);
      typeByName.set(norm(t.code), t);
      return t;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const person = pick(row, [
          'person_name',
          'personName',
          'employeeName',
          'employee',
          'Сотрудник',
          'fullName',
          'fio',
        ]);
        const divName = pick(row, [
          'division_name',
          'divisionName',
          'division',
          'Подразделение',
        ]);
        const typeName = pick(row, [
          'fact_type_name',
          'factTypeName',
          'factType',
          'type',
          'Тип',
          'Тип факта',
        ]);
        const value = pick(row, [
          'fact_value',
          'factValue',
          'value',
          'Значение факта',
        ]);
        const dateRaw = pick(row, [
          'fact_date',
          'factDate',
          'date',
          'Дата',
        ]);

        if (!typeName || !value || !dateRaw) {
          result.errors.push({
            row: rowNum,
            message: 'Нужны тип факта, значение и дата',
          });
          result.skipped += 1;
          continue;
        }

        const factDate = parseFactDate(dateRaw);
        if (!factDate) {
          result.errors.push({
            row: rowNum,
            message: `Некорректная дата: ${dateRaw}`,
          });
          result.skipped += 1;
          continue;
        }

        let employeeId: string | null = null;
        let divisionId: string | null = null;

        if (person) {
          let emp =
            empByName.get(norm(person)) ||
            empByName.get(
              norm(person)
                .split(' ')
                .filter(Boolean)
                .sort()
                .join(' '),
            );
          if (!emp) {
            // partial match last word
            const tokens = norm(person).split(' ').filter(Boolean);
            emp = employees.find((e) => {
              const blob = norm(
                [e.lastName, e.firstName, e.middleName]
                  .filter(Boolean)
                  .join(' '),
              );
              return tokens.every((t) => blob.includes(t));
            });
          }
          if (!emp) {
            result.errors.push({
              row: rowNum,
              message: `Сотрудник не найден: ${person}`,
            });
            result.skipped += 1;
            continue;
          }
          employeeId = emp.id;
          divisionId = emp.divisionId;
        }

        if (divName) {
          const div = divByName.get(norm(divName));
          if (div) divisionId = div.id;
        }

        const type = await ensureType(typeName);

        await this.prisma.fact.create({
          data: {
            tenantId,
            employeeId,
            divisionId,
            factTypeId: type.id,
            value,
            factDate,
            status: 'active',
          },
        });
        result.created += 1;
      } catch (e) {
        result.errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'Ошибка строки',
        });
        result.skipped += 1;
      }
    }

    return result;
  }

  async sendPaymentOrder(tenantId: string, id: string) {
    return this.finance.sendPaymentOrder(tenantId, id);
  }

  async payPaymentOrder(tenantId: string, id: string) {
    return this.finance.payPaymentOrder(tenantId, id);
  }

  async activateGphContract(tenantId: string, id: string) {
    return this.gph.activateGphContract(tenantId, id);
  }

  async closeGphContract(tenantId: string, id: string) {
    return this.gph.closeGphContract(tenantId, id);
  }

  async postGphContract(tenantId: string, id: string, postedBy?: string) {
    return this.gph.postGphContract(tenantId, id, postedBy);
  }

  async unpostGphContract(tenantId: string, id: string) {
    return this.gph.unpostGphContract(tenantId, id);
  }

  private async applyTimesheetAdjustment(tenantId: string, data: Record<string, unknown>) {
    const workDate = data.workDate as Date;
    const employeeId = String(data.employeeId);
    const existing = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
      },
    });
    if (existing) {
      data.oldStatus = existing.status;
      await this.prisma.attendanceDay.update({
        where: { id: existing.id },
        data: { status: data.newStatus as DayStatus },
      });
    } else {
      await this.prisma.attendanceDay.create({
        data: {
          tenantId,
          employeeId,
          workDate,
          status: data.newStatus as DayStatus,
        },
      });
    }
  }

  private async applyLoanPayment(tenantId: string, data: Record<string, unknown>) {
    const loan = await this.prisma.employeeLoan.findFirst({
      where: { id: String(data.loanId), tenantId },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status === 'closed') {
      throw new BadRequestException('Loan is already closed');
    }
    if (loan.status === 'draft') {
      throw new BadRequestException('Сначала завершите заём');
    }
    const amount = Number(data.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Loan payment amount must be > 0');
    }
    if (amount > Number(loan.remaining) + 0.0001) {
      throw new BadRequestException(
        `Payment ${amount} exceeds remaining balance ${loan.remaining}`,
      );
    }
    const remaining = Math.max(0, Number(loan.remaining) - amount);
    await this.prisma.employeeLoan.update({
      where: { id: loan.id },
      data: {
        remaining,
        status: remaining <= 0 ? 'closed' : loan.status,
      },
    });
    data.remainingAfter = remaining;
  }

  /** @deprecated F5 — use IncidentsCatalogService; thin delegate for CatalogService routes */
  async createIncidentType(tenantId: string, body: Record<string, unknown>) {
    return this.incidents.createIncidentType(tenantId, body);
  }

  async createIncident(tenantId: string, body: Record<string, unknown>) {
    return this.incidents.createIncident(tenantId, body);
  }

  async updateIncident(
    tenantId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    return this.incidents.updateIncident(tenantId, id, body);
  }

  async resolveIncident(
    tenantId: string,
    id: string,
    body?: { resolution?: string | null },
  ) {
    return this.incidents.resolveIncident(tenantId, id, body);
  }

  async closeIncident(tenantId: string, id: string) {
    return this.incidents.closeIncident(tenantId, id);
  }

  async investigateIncident(tenantId: string, id: string) {
    return this.incidents.investigateIncident(tenantId, id);
  }

  async createClearanceTemplate(tenantId: string, body: Record<string, unknown>) {
    return this.clearance.createClearanceTemplate(tenantId, body);
  }

  async updateClearanceTemplate(tenantId: string, id: string, body: Record<string, unknown>) {
    return this.clearance.updateClearanceTemplate(tenantId, id, body);
  }

  // —— Analytics used by catalog reports ——

  async divisionStats(tenantId: string) {
    return this.reports.divisionStats(tenantId);
  }

  async divisionWorkDashboard(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionGroupId?: string;
      scheduleId?: string;
      q?: string;
    } = {},
  ) {
    return this.reports.divisionWorkDashboard(tenantId, opts);
  }

  async yearSummary(tenantId: string, yearInput: number) {
    return this.reports.yearSummary(tenantId, yearInput);
  }

  async yearSummaryDashboard(tenantId: string, yearInput?: number) {
    return this.reports.yearSummaryDashboard(tenantId, yearInput);
  }

  async staffingReport(
    tenantId: string,
    opts: { date?: string; divisionId?: string; positionId?: string } = {},
  ) {
    return this.reports.staffingReport(tenantId, opts);
  }

  async genderReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionId?: string;
      reportType?: string;
      ranges?: string;
      gradeId?: string;
      educationType?: string;
    } = {},
  ) {
    return this.reports.genderReport(tenantId, opts);
  }

  async movementDivisionsReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string } = {},
  ) {
    return this.reports.movementDivisionsReport(tenantId, opts);
  }

  async movementStaffReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      kinds?: string;
      divisionGroupId?: string;
      positionGroupId?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    return this.reports.movementStaffReport(tenantId, opts);
  }

  async dismissalsByReason(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      keyEmployee?: string;
      basisType?: string;
    } = {},
  ) {
    return this.reports.dismissalsByReason(tenantId, opts);
  }

  async gradeReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      filterByDept?: string;
    } = {},
  ) {
    return this.reports.gradeReport(tenantId, opts);
  }

  async gradeChangeReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string; employeeIds?: string } = {},
  ) {
    return this.reports.gradeChangeReport(tenantId, opts);
  }

  async vacancyReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionGroupIds?: string;
      divisionIds?: string;
      positionGroupIds?: string;
      positionIds?: string;
      staffGroups?: string;
    } = {},
  ) {
    return this.reports.vacancyReport(tenantId, opts);
  }

  async candidateReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      positionIds?: string;
      personType?: string;
      employmentSource?: string;
      gender?: string;
    } = {},
  ) {
    return this.reports.candidateReport(tenantId, opts);
  }

  async tenureReport(
    tenantId: string,
    opts: {
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      yearsFrom?: string;
      yearsTo?: string;
      rules?: string;
    } = {},
  ) {
    return this.reports.tenureReport(tenantId, opts);
  }

  async relativesReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      relations?: string;
      gender?: string;
      ageFrom?: string;
      ageTo?: string;
      showHidden?: string | boolean;
    } = {},
  ) {
    return this.reports.relativesReport(tenantId, opts);
  }

  async accessReport(
    tenantId: string,
    opts: {
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      withoutAccess?: string | boolean;
    } = {},
  ) {
    return this.reports.accessReport(tenantId, opts);
  }

  async distanceReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.distanceReport(tenantId, opts);
  }

  async shiftReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      startTime?: string;
      endTime?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.shiftReport(tenantId, opts);
  }

  async timeTypesReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      locationIds?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.timeTypesReport(tenantId, opts);
  }

  async latenessReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.latenessReport(tenantId, opts);
  }

  async schedulePlanReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string; positionIds?: string } = {},
  ) {
    return this.reports.schedulePlanReport(tenantId, opts);
  }

  async employmentReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionIds?: string;
      divisionGroupIds?: string;
      positionIds?: string;
      employeeIds?: string;
      scheduleIds?: string;
      educationType?: string;
      filterByDept?: string;
    } = {},
  ) {
    return this.reports.employmentReport(tenantId, opts);
  }

  async occupancyReport(
    tenantId: string,
    opts: {
      date?: string;
      positionGroupIds?: string;
      positionIds?: string;
      staffGroups?: string;
      divisionIds?: string;
      groupBy?: string;
      positionType?: string;
    } = {},
  ) {
    return this.reports.occupancyReport(tenantId, opts);
  }

  async penaltiesReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      year?: number;
      month?: number;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      filterByDept?: string | boolean;
    } = {},
  ) {
    return this.reports.penaltiesReport(tenantId, opts);
  }

  async oneTimeAccrualsReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      year?: number;
      month?: number;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      /** accrual | deduction | both */
      kind?: string;
    } = {},
  ) {
    return this.reports.oneTimeAccrualsReport(tenantId, opts);
  }

  async divisionExpensesReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      year?: number;
      month?: number;
      divisionIds?: string;
      divisionGroupIds?: string;
      positionIds?: string;
      positionGroupIds?: string;
      employeeIds?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.divisionExpensesReport(tenantId, opts);
  }

  async payrollBookReport(
    tenantId: string,
    opts: {
      year?: number;
      month?: number;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    return this.reports.payrollBookReport(tenantId, opts);
  }

  async accountBalanceReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      account?: string;
      currency?: string;
      subconto?: string;
      showQty?: boolean;
      showAmount?: boolean;
    },
  ) {
    return this.reports.accountBalanceReport(tenantId, opts);
  }

  async trialBalanceReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      currency?: string;
      subconto?: string;
      showQty?: boolean;
      showAmount?: boolean;
      excludeExtra?: boolean;
    },
  ) {
    return this.reports.trialBalanceReport(tenantId, opts);
  }

  async preliminarySalaryReport(
    tenantId: string,
    opts: {
      year?: number;
      month?: number;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    return this.reports.preliminarySalaryReport(tenantId, opts);
  }

  async fotReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      locationIds?: string;
      positionIds?: string;
      gradeIds?: string;
      employeeIds?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.fotReport(tenantId, opts);
  }

  async paymentsReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    return this.reports.paymentsReport(tenantId, opts);
  }

  async hourlyAttendanceReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      employeeIds?: string;
      startTime?: string;
      endTime?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.hourlyAttendanceReport(tenantId, opts);
  }

  async divisionModeReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      groupIds?: string;
      useGroups?: boolean;
      layout?: string;
      managerGroupId?: string;
    } = {},
  ) {
    return this.reports.divisionModeReport(tenantId, opts);
  }

  async divisionModeCalendarReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      managerGroupId?: string;
    } = {},
  ) {
    return this.reports.divisionModeCalendarReport(tenantId, opts);
  }

  async disciplineReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    return this.reports.disciplineReport(tenantId, opts);
  }

  async disciplineEmployeeDetail(
    tenantId: string,
    employeeId: string,
    from?: string,
    to?: string,
  ) {
    return this.reports.disciplineEmployeeDetail(tenantId, employeeId, from, to);
  }

  async timesheetAdjustmentReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string } = {},
  ) {
    return this.reports.timesheetAdjustmentReport(tenantId, opts);
  }

  async dismissalsByDivision(
    tenantId: string,
    opts: { from?: string; to?: string } = {},
  ) {
    return this.reports.dismissalsByDivision(tenantId, opts);
  }

  async dismissalDashboard(tenantId: string, from?: string, to?: string) {
    return this.reports.dismissalDashboard(tenantId, from, to);
  }

  async personnelChangesDashboard(
    tenantId: string,
    opts: { year?: number; groupBy?: 'division' | 'position' } = {},
  ) {
    return this.reports.personnelChangesDashboard(tenantId, opts);
  }

  async marksDetailReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      locationIds?: string;
    } = {},
  ) {
    return this.reports.marksDetailReport(tenantId, opts);
  }

  async attendanceOverview(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      locationIds?: string;
      groupIds?: string;
      includeInactive?: boolean;
      cfg?: string;
    } = {},
  ) {
    return this.reports.attendanceOverview(tenantId, opts);
  }

  async positionsReport(
    tenantId: string,
    opts: {
      date?: string;
      divisionIds?: string;
      divisionGroupId?: string;
      positionGroupId?: string;
      positionId?: string;
    } = {},
  ) {
    return this.reports.positionsReport(tenantId, opts);
  }

  async schedulesReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      scheduleIds?: string;
    } = {},
  ) {
    return this.reports.schedulesReport(tenantId, opts);
  }

  async multiShiftAttendance(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      scheduleIds?: string;
      details?: string | boolean;
    } = {},
  ) {
    return this.reports.multiShiftAttendance(tenantId, opts);
  }

  async payrollGroupedReport(
    tenantId: string,
    opts: {
      year?: number;
      month?: number;
      divisionIds?: string;
      positionIds?: string;
      employeeIds?: string;
      positionType?: string;
      cfg?: string;
    } = {},
  ) {
    return this.reports.payrollGroupedReport(tenantId, opts);
  }

  private normalizeStaffPositionDates(data: Record<string, unknown>) {
    for (const key of ['openedAt', 'closedAt'] as const) {
      if (data[key] === '' || data[key] === undefined) {
        if (data[key] === '') data[key] = null;
        continue;
      }
      if (typeof data[key] === 'string') {
        const s = String(data[key]).trim();
        // DD.MM.YYYY
        const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
        if (m) {
          data[key] = new Date(`${m[3]}-${m[2]}-${m[1]}`);
        } else {
          const d = new Date(s);
          data[key] = Number.isNaN(d.getTime()) ? null : d;
        }
      }
    }
  }

  async bulkCloseStaffPositions(
    tenantId: string,
    ids: string[],
    closedAt: string,
  ) {
    if (!ids?.length) throw new BadRequestException('Выберите позиции');
    let date: Date;
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((closedAt || '').trim());
    if (m) date = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    else date = new Date(closedAt || new Date().toISOString().slice(0, 10));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Некорректная дата закрытия');
    }
    const result = await this.prisma.staffPosition.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { closedAt: date, status: 'closed', isActive: false },
    });
    return { updated: result.count };
  }

  async bulkDeleteStaffPositions(tenantId: string, ids: string[]) {
    if (!ids?.length) throw new BadRequestException('Выберите позиции');
    const used = await this.prisma.employee.count({
      where: { tenantId, staffPositionId: { in: ids }, status: 'active' },
    });
    if (used > 0) {
      throw new BadRequestException(
        `Нельзя удалить: на позициях есть активные сотрудники (${used})`,
      );
    }
    const result = await this.prisma.staffPosition.deleteMany({
      where: { tenantId, id: { in: ids } },
    });
    return { deleted: result.count };
  }

  async positionsStructure(tenantId: string) {
    const rows = await this.prisma.staffPosition.findMany({
      where: { tenantId },
      include: {
        division: true,
        position: true,
        employees: {
          where: { status: 'active' },
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
      },
      orderBy: [{ divisionId: 'asc' }, { code: 'asc' }],
    });
    return { title: 'Организационная структура по позициям', rows };
  }

  /** Tree for Arena-style org chart by staff positions */
  async staffPositionsTree(tenantId: string): Promise<StaffPosTreeResponse> {
    const [divisions, staffPositions] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, code: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.staffPosition.findMany({
        where: { tenantId, isActive: true },
        include: {
          position: { select: { id: true, name: true, code: true } },
          _count: { select: { employees: { where: { status: 'active' } } } },
        },
        orderBy: { title: 'asc' },
      }),
    ]);

    const byDivision = new Map<string | null, typeof staffPositions>();
    for (const sp of staffPositions) {
      const key = sp.divisionId;
      const list = byDivision.get(key) ?? [];
      list.push(sp);
      byDivision.set(key, list);
    }

    const mapPos = (sp: (typeof staffPositions)[0]): StaffPosTreePosition => ({
      id: sp.id,
      code: sp.code,
      title: sp.position?.name || sp.title,
      headcount: sp.headcount,
      employeeCount: sp._count.employees,
    });

    const nodeMap = new Map<string, StaffPosTreeDivision>();
    for (const d of divisions) {
      nodeMap.set(d.id, {
        id: d.id,
        code: d.code,
        name: d.name,
        parentId: d.parentId,
        positions: (byDivision.get(d.id) ?? []).map(mapPos),
        children: [],
      });
    }

    const roots: StaffPosTreeDivision[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return {
      title: 'Организационная структура по позициям',
      roots,
      orphanPositions: (byDivision.get(null) ?? []).map(mapPos),
    };
  }


  async lookups(tenantId: string) {
    const cacheKey = `lookups:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // corrupt cache — rebuild
      }
    }

    const result = await this.buildLookups(tenantId);
    await this.redis.set(cacheKey, JSON.stringify(result), 120);
    return result;
  }

  async invalidateLookups(tenantId: string) {
    await this.redis.del(`lookups:${tenantId}`);
  }

  private async buildLookups(tenantId: string) {
    const empty = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const none = <T>(p: Promise<T | null>) => p.catch(() => null);
    const [
      employees,
      grades,
      divisions,
      positions,
      schedules,
      locations,
      incidentTypes,
      tariffGroups,
      staffPositions,
      policies,
      accountPairs,
      templates,
      careerPaths,
      dismissalReasons,
      persons,
      divisionGroups,
      positionGroups,
      employmentSourceDict,
      avgSalaryDict,
      coaDict,
      eduDict,
    ] = await Promise.all([
        empty(this.prisma.employee.findMany({
          where: { tenantId, status: 'active' },
          select: {
            id: true,
            tabNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
            divisionId: true,
            positionId: true,
            phone: true,
            employmentType: true,
            position: { select: { id: true, name: true } },
          },
          orderBy: { lastName: 'asc' },
          take: 500,
        })),
        empty(this.prisma.grade.findMany({ where: { tenantId }, orderBy: { level: 'asc' } })),
        empty(this.prisma.division.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.position.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.workSchedule.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.location.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.incidentType.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.tariffGroup.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.staffPosition.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.salesCommissionPolicy.findMany({
          where: { tenantId, isActive: true },
          include: { position: { select: { name: true } } },
        })),
        empty(this.prisma.accountPair.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.clearanceTemplate.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.careerPath.findMany({ where: { tenantId, isActive: true } })),
        empty(this.prisma.dismissalReason.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.person.findMany({
          where: { tenantId },
          select: { id: true, firstName: true, lastName: true, middleName: true },
          orderBy: { lastName: 'asc' },
          take: 500,
        })),
        empty(this.prisma.divisionGroup.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        empty(this.prisma.positionGroup.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })),
        none(this.prisma.dictionary.findFirst({
          where: { tenantId, code: 'employment_sources' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })),
        none(this.prisma.dictionary.findFirst({
          where: { tenantId, code: 'avg_salary' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })),
        none(this.prisma.dictionary.findFirst({
          where: { tenantId, code: 'coa' },
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
          },
        })),
        none(this.prisma.dictionary.findFirst({
          where: { tenantId, code: 'edu' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })),
      ]);
    const timeTypesList = await this.prisma.timeType
      .findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true, letterCode: true },
      })
      .catch(() => [] as { id: string; name: string; code: string; letterCode: string | null }[]);
    const accrualTypesList = await this.prisma.accrualType
      .findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true },
      })
      .catch(() => [] as { id: string; name: string; code: string }[]);
    const deductionTypesList = await this.prisma.deductionType
      .findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true },
      })
      .catch(() => [] as { id: string; name: string; code: string }[]);
    return {
      employees: employees.map((e) => ({
        id: e.id,
        tabNumber: e.tabNumber,
        lastName: e.lastName,
        firstName: e.firstName,
        middleName: e.middleName,
        label: `${e.tabNumber} — ${e.lastName} ${e.firstName}`,
        divisionId: e.divisionId ?? undefined,
        positionId: e.positionId ?? undefined,
        positionName: e.position?.name ?? undefined,
        employmentType: e.employmentType,
        phone: e.phone ?? undefined,
      })),
      persons: persons.map((p) => {
        const text = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
        return { id: p.id, label: text, name: text };
      }),
      // Both `label` and `name` — UI forms historically used either key for <option> text.
      grades: grades.map((g) => {
        const text = `${g.code} ${g.name}`.trim();
        return { id: g.id, label: text, name: text };
      }),
      divisions: divisions.map((d) => ({ id: d.id, label: d.name, name: d.name })),
      positions: positions.map((p) => ({ id: p.id, label: p.name, name: p.name })),
      schedules: schedules.map((s) => ({
        id: s.id,
        label: s.name,
        name: s.name,
        code: s.code,
        kind: s.kind,
      })),
      educationTypes: (eduDict?.items || []).map((it) => ({
        id: it.id,
        label: it.name,
        name: it.name,
        code: it.code,
      })),
      accrualTypes: accrualTypesList.map((a) => ({
        id: a.id,
        label: a.name,
        name: a.name,
        code: a.code,
      })),
      deductionTypes: deductionTypesList.map((d) => ({
        id: d.id,
        label: d.name,
        name: d.name,
        code: d.code,
      })),
      locations: locations.map((l) => ({ id: l.id, label: l.name, name: l.name })),
      timeTypes: timeTypesList.map((t) => ({
        id: t.id,
        label: t.name,
        name: t.name,
        code: t.code,
        letterCode: t.letterCode,
      })),
      incidentTypes: incidentTypes.map((i) => ({
        id: i.id,
        label: i.name,
        name: i.name,
      })),
      tariffGroups: tariffGroups.map((t) => ({
        id: t.id,
        label: t.name,
        name: t.name,
      })),
      staffPositions: staffPositions.map((s) => {
        const text = `${s.code} ${s.title}`.trim();
        return { id: s.id, label: text, name: text };
      }),
      staffGroups: [
        ...new Set(
          staffPositions
            .map((s) => (s.groupName || '').trim())
            .filter(Boolean),
        ),
      ]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((name) => ({ id: name, label: name, name })),
      divisionGroups: divisionGroups.map((g) => ({
        id: g.id,
        label: g.name,
        name: g.name,
      })),
      positionGroups: positionGroups.map((g) => ({
        id: g.id,
        label: g.name,
        name: g.name,
      })),
      salesPolicies: policies.map((p) => {
        const text = p.position?.name || p.positionId;
        return { id: p.id, label: text, name: text };
      }),
      accountPairs: accountPairs.map((a) => ({
        id: a.id,
        label: a.name,
        name: a.name,
      })),
      clearanceTemplates: templates.map((t) => ({
        id: t.id,
        label: t.name,
        name: t.name,
      })),
      careerPaths: careerPaths.map((c) => ({
        id: c.id,
        label: c.name,
        name: c.name,
      })),
      dismissalReasons: dismissalReasons.map((r) => ({
        id: r.id,
        label: r.name,
        name: r.name,
      })),
      employmentSources: (employmentSourceDict?.items || []).map((it) => {
        const meta =
          it.meta && typeof it.meta === 'object' && !Array.isArray(it.meta)
            ? (it.meta as { sourceType?: string })
            : {};
        return {
          id: it.id,
          label: it.name,
          name: it.name,
          code: it.code,
          sourceType: meta.sourceType || 'hire_and_dismissal',
        };
      }),
      avgSalaries: (avgSalaryDict?.items || []).map((it) => {
        const meta =
          it.meta && typeof it.meta === 'object' && !Array.isArray(it.meta)
            ? (it.meta as {
                positionId?: string;
                positionName?: string;
                gradeId?: string;
                gradeName?: string;
                valueFrom?: number;
                valueTo?: number | null;
              })
            : {};
        return {
          id: it.id,
          label: meta.positionName || it.name,
          name: meta.positionName || it.name,
          code: it.code,
          positionId: meta.positionId,
          positionName: meta.positionName || it.name,
          gradeId: meta.gradeId,
          gradeName: meta.gradeName,
          valueFrom: meta.valueFrom,
          valueTo: meta.valueTo,
        };
      }),
      coa: (coaDict?.items || []).map((it) => {
        const meta =
          it.meta && typeof it.meta === 'object' && !Array.isArray(it.meta)
            ? (it.meta as {
                parentCode?: string;
                accountKind?: string;
                paymentKind?: string;
              })
            : {};
        return {
          id: it.id,
          code: it.code,
          label: `${it.code}. ${it.name}`,
          name: it.name,
          isActive: it.isActive,
          parentCode: meta.parentCode,
          accountKind: meta.accountKind,
          paymentKind: meta.paymentKind,
        };
      }),
    };
  }

  async addClearanceTemplateItem(
    tenantId: string,
    templateId: string,
    body: { title: string; department?: string; sortOrder?: number },
  ) {
    return this.clearance.addClearanceTemplateItem(tenantId, templateId, body);
  }

  async updateClearanceItem(
    tenantId: string,
    itemId: string,
    body: { status?: string; note?: string },
  ) {
    return this.clearance.updateClearanceItem(tenantId, itemId, body);
  }


  async createTimesheetCorrection(tenantId: string, body: Record<string, unknown>) {
    return this.timesheet.createTimesheetCorrection(tenantId, body);
  }

  async updateTimesheetCorrection(tenantId: string, id: string, body: Record<string, unknown>) {
    return this.timesheet.updateTimesheetCorrection(tenantId, id, body);
  }

  async postTimesheetCorrection(tenantId: string, id: string, postedBy?: string) {
    return this.timesheet.postTimesheetCorrection(tenantId, id, postedBy);
  }

  async fillTimesheetCorrectionHours(
    tenantId: string,
    body: {
      employeeIds?: string[];
      divisionId?: string;
      periodFrom: string;
      periodTo: string;
      meta?: Record<string, unknown>;
    },
  ) {
    return this.timesheet.fillTimesheetCorrectionHours(tenantId, body);
  }

  async cancelTimesheetCorrection(tenantId: string, id: string, cancelledBy?: string) {
    return this.timesheet.cancelTimesheetCorrection(tenantId, id, cancelledBy);
  }

  async createIndividualSchedule(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.createIndividualSchedule(tenantId, body);
  }

  async updateIndividualSchedule(tenantId: string, id: string, body: Record<string, unknown>) {
    return this.schedules.updateIndividualSchedule(tenantId, id, body);
  }

  async postIndividualSchedule(tenantId: string, id: string, postedBy?: string) {
    return this.schedules.postIndividualSchedule(tenantId, id, postedBy);
  }

  async cancelIndividualSchedule(tenantId: string, id: string, cancelledBy?: string) {
    return this.schedules.cancelIndividualSchedule(tenantId, id, cancelledBy);
  }

  async fillIndividualSchedule(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.fillIndividualSchedule(tenantId, body as any);
  }

  async createPositionScheduleDoc(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.createPositionScheduleDoc(tenantId, body);
  }

  async updatePositionScheduleDoc(tenantId: string, id: string, body: Record<string, unknown>) {
    return this.schedules.updatePositionScheduleDoc(tenantId, id, body);
  }

  async postPositionScheduleDoc(tenantId: string, id: string, postedBy?: string) {
    return this.schedules.postPositionScheduleDoc(tenantId, id, postedBy);
  }

  async cancelPositionScheduleDoc(tenantId: string, id: string, cancelledBy?: string) {
    return this.schedules.cancelPositionScheduleDoc(tenantId, id, cancelledBy);
  }

  async fillPositionScheduleDoc(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.fillPositionScheduleDoc(tenantId, body as any);
  }

  async downloadScheduleTemplate(tenantId: string, opts: Record<string, unknown>) {
    return this.schedules.downloadScheduleTemplate(tenantId, opts as any);
  }

  async importScheduleTemplate(tenantId: string, opts: Record<string, unknown>) {
    return this.schedules.importScheduleTemplate(tenantId, opts as any);
  }

  async createWorkRoster(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.createWorkRoster(tenantId, body);
  }

  async updateWorkRoster(tenantId: string, id: string, body: Record<string, unknown>) {
    return this.schedules.updateWorkRoster(tenantId, id, body);
  }

  async postWorkRoster(tenantId: string, id: string, postedBy?: string) {
    return this.schedules.postWorkRoster(tenantId, id, postedBy);
  }

  async cancelWorkRoster(tenantId: string, id: string, cancelledBy?: string) {
    return this.schedules.cancelWorkRoster(tenantId, id, cancelledBy);
  }

  async fillWorkRoster(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.fillWorkRoster(tenantId, body as any);
  }

  async listShiftAssignments(tenantId: string, opts: Record<string, unknown>) {
    return this.schedules.listShiftAssignments(tenantId, opts as any);
  }

  async rebuildShiftAssignments(tenantId: string, body: Record<string, unknown>) {
    return this.schedules.rebuildShiftAssignments(tenantId, body as any);
  }

  async bulkShiftAssignments(tenantId: string, body: { ids?: string[]; action?: string }) {
    return this.schedules.bulkShiftAssignments(tenantId, body);
  }

}
