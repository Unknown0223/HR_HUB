import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, DayStatus, DocumentLifecycle, GradePromotionPeriodType, PayrollLineType, Prisma, WorkScheduleKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildExcelBuffer, flattenExportRow } from '../common/excel';
import { daysAgo, parseDateParam, parseYearMonth, startOfCurrentMonth } from '../common/date-range';
import { NotificationsService } from '../notifications/notifications.service';
import { CATALOG_RESOURCES, findResource } from './catalog.resources';
import {
  buildIndividualScheduleTemplateBuffer,
  parseIndividualScheduleWorkbook,
  shiftCodeHours,
  type VerifixShiftMeta,
} from './verifix-schedule-xlsx';
import {
  isDayOffByPattern,
  mergeScheduleSettings,
  monthDaysFromSchedule,
  parseScheduleSettings,
  type ScheduleKind as Skind,
  type ScheduleSettings,
} from '../attendance/schedule-settings';

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
    } = {},
  ) {
    const res = findResource(key);
    if (!res) throw new NotFoundException(`Resource ${key}`);
    const where = this.buildListWhere(tenantId, res, opts);
    return this.delegate(res.model).findMany({
      where,
      orderBy: res.orderBy ?? { createdAt: 'desc' },
      include: res.include,
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
      return this.createClearanceTemplate(tenantId, body);
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
      return this.createClearanceFromTemplate(tenantId, data);
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
      await this.ensureTariffGroupApproved(tenantId, String(data.tariffGroupId));
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
      return this.updateClearanceTemplate(tenantId, id, body);
    }
    if (key === 'incidents') {
      return this.updateIncident(tenantId, id, body);
    }
    await this.ensureOwned(tenantId, res.model, id);
    const data = this.pick(body, res.fields);
    if (key === 'staff-positions' && data.tariffGroupId) {
      await this.ensureTariffGroupApproved(tenantId, String(data.tariffGroupId));
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
          conditions: row.conditions ?? undefined,
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
    const row = await this.prisma.employeeNameChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Name change not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Name change already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled name change cannot be posted');
    }

    await this.prisma.employee.update({
      where: { id: row.employeeId },
      data: {
        lastName: row.newLastName,
        firstName: row.newFirstName,
        middleName: row.newMiddleName,
      },
    });

    await this.prisma.hrDocument.create({
      data: {
        tenantId,
        employeeId: row.employeeId,
        type: 'name_change',
        status: 'posted',
        title: `Ism o‘zgarishi: ${row.oldLastName} → ${row.newLastName}`,
        documentDate: row.effectiveAt,
        number: row.documentNumber ?? undefined,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        payload: {
          newLastName: row.newLastName,
          newFirstName: row.newFirstName,
          newMiddleName: row.newMiddleName,
        },
      },
    });

    return this.prisma.employeeNameChange.update({
      where: { id },
      data: {
        status: 'posted',
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    }).then(async (result) => {
      await this.notifications.notifyApprovers(tenantId, {
        kind: 'info',
        title: `Ism o‘zgarishi o‘tkazildi: ${row.newLastName} ${row.newFirstName}`,
        entity: 'name-change',
        entityId: id,
        href: `/catalog/name-changes/${id}`,
      });
      return result;
    });
  }

  async postWageChange(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.wageChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Wage change not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Wage change already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled wage change cannot be posted');
    }

    await this.prisma.employee.update({
      where: { id: row.employeeId },
      data: { baseSalary: row.newAmount },
    });

    await this.prisma.hrDocument.create({
      data: {
        tenantId,
        employeeId: row.employeeId,
        type: 'wage_change',
        status: 'posted',
        title: `Ish haqi o‘zgarishi → ${row.newAmount}`,
        documentDate: row.effectiveAt,
        number: row.documentNumber ?? undefined,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        payload: {
          oldAmount: row.oldAmount != null ? Number(row.oldAmount) : null,
          newAmount: Number(row.newAmount),
        },
      },
    });

    const updated = await this.prisma.wageChange.update({
      where: { id },
      data: {
        status: 'posted',
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
            baseSalary: true,
          },
        },
      },
    });

    await this.notifications.notifyApprovers(tenantId, {
      kind: 'info',
      title: `Ish haqi o‘zgarishi o‘tkazildi → ${row.newAmount}`,
      entity: 'wage-change',
      entityId: id,
      href: `/catalog/wage-changes/${id}`,
    });

    return updated;
  }

  async completeClearanceSheet(tenantId: string, id: string) {
    const sheet = await this.prisma.clearanceSheet.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!sheet) throw new NotFoundException('Clearance sheet not found');
    if (sheet.status === 'completed') {
      throw new BadRequestException('Clearance already completed');
    }
    if (sheet.status === 'cancelled') {
      throw new BadRequestException('Cancelled clearance cannot be completed');
    }
    const pending = sheet.items.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      throw new BadRequestException(
        `Cannot complete: ${pending.length} item(s) still pending`,
      );
    }

    return this.prisma.clearanceSheet.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  private async ensureTariffGroupApproved(tenantId: string, tariffGroupId: string) {
    const group = await this.prisma.tariffGroup.findFirst({
      where: { id: tariffGroupId, tenantId },
    });
    if (!group) throw new NotFoundException('Tariff group not found');
    if (!group.isActive) {
      throw new BadRequestException('Tariff group is not active');
    }
    const approved = await this.prisma.tariffGroupApproval.findFirst({
      where: {
        tenantId,
        tariffGroupId,
        status: ApprovalStatus.approved,
      },
    });
    if (!approved) {
      throw new BadRequestException(
        'Staff position requires an approved tariff group approval',
      );
    }
  }

  async approveTariffApproval(tenantId: string, id: string, reviewedBy?: string) {
    const row = await this.prisma.tariffGroupApproval.findFirst({
      where: { id, tenantId },
      include: { tariffGroup: true },
    });
    if (!row) throw new NotFoundException('Tariff approval not found');
    if (row.status === ApprovalStatus.approved) {
      throw new BadRequestException('Tariff approval already approved');
    }
    if (row.status === ApprovalStatus.rejected) {
      throw new BadRequestException('Rejected tariff approval cannot be approved');
    }
    if (!row.tariffGroupId) {
      throw new BadRequestException('Тарифная группа обязательна');
    }
    if (!row.effectiveAt) {
      throw new BadRequestException('Дата «Вступает в силу с» обязательна');
    }

    const baseRate =
      row.baseRate != null
        ? row.baseRate
        : row.tariffGroup?.baseRate != null
          ? row.tariffGroup.baseRate
          : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (baseRate != null) {
        await tx.tariffGroup.update({
          where: { id: row.tariffGroupId },
          data: { baseRate },
        });
      }
      return tx.tariffGroupApproval.update({
        where: { id },
        data: {
          status: ApprovalStatus.approved,
          reviewedAt: new Date(),
          reviewedBy: reviewedBy ?? undefined,
          ...(baseRate != null ? { baseRate } : {}),
        },
        include: { tariffGroup: true },
      });
    });
  }

  /** Провести = утвердить документ */
  async postTariffApproval(tenantId: string, id: string, reviewedBy?: string) {
    return this.approveTariffApproval(tenantId, id, reviewedBy);
  }

  async bulkPostTariffApprovals(
    tenantId: string,
    ids: string[],
    reviewedBy?: string,
  ) {
    if (!ids?.length) throw new BadRequestException('Выберите утверждения');
    const result = { posted: 0, skipped: 0, errors: [] as { id: string; message: string }[] };
    for (const id of ids) {
      try {
        const row = await this.prisma.tariffGroupApproval.findFirst({
          where: { id, tenantId },
          select: { status: true },
        });
        if (!row) {
          result.skipped += 1;
          result.errors.push({ id, message: 'Не найдено' });
          continue;
        }
        if (row.status === ApprovalStatus.approved) {
          result.skipped += 1;
          continue;
        }
        if (row.status === ApprovalStatus.rejected) {
          result.skipped += 1;
          result.errors.push({ id, message: 'Отклонённое нельзя провести' });
          continue;
        }
        await this.approveTariffApproval(tenantId, id, reviewedBy);
        result.posted += 1;
      } catch (e) {
        result.skipped += 1;
        result.errors.push({
          id,
          message: e instanceof Error ? e.message : 'Ошибка',
        });
      }
    }
    return result;
  }

  async bulkDeleteTariffApprovals(tenantId: string, ids: string[]) {
    if (!ids?.length) throw new BadRequestException('Выберите утверждения');
    const blocked = await this.prisma.tariffGroupApproval.count({
      where: { tenantId, id: { in: ids }, status: ApprovalStatus.approved },
    });
    if (blocked > 0) {
      throw new BadRequestException(
        `Нельзя удалить: ${blocked} уже проведены`,
      );
    }
    const result = await this.prisma.tariffGroupApproval.deleteMany({
      where: {
        tenantId,
        id: { in: ids },
        status: { not: ApprovalStatus.approved },
      },
    });
    return { deleted: result.count };
  }

  async rejectTariffApproval(tenantId: string, id: string, reviewedBy?: string) {
    const row = await this.prisma.tariffGroupApproval.findFirst({
      where: { id, tenantId },
      include: { tariffGroup: true },
    });
    if (!row) throw new NotFoundException('Tariff approval not found');
    if (row.status === ApprovalStatus.approved) {
      throw new BadRequestException('Approved tariff approval cannot be rejected');
    }
    if (row.status === ApprovalStatus.rejected) {
      throw new BadRequestException('Tariff approval already rejected');
    }
    return this.prisma.tariffGroupApproval.update({
      where: { id },
      data: {
        status: ApprovalStatus.rejected,
        reviewedAt: new Date(),
        reviewedBy: reviewedBy ?? undefined,
      },
      include: { tariffGroup: true },
    });
  }

  async postSettlement(tenantId: string, id: string) {
    const row = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Settlement not found');
    if (row.status === 'matched') {
      throw new BadRequestException('Settlement already matched');
    }
    if (row.status === 'closed') {
      throw new BadRequestException('Closed settlement cannot be posted');
    }
    return this.prisma.settlement.update({
      where: { id },
      data: { status: 'matched' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
        accountPair: true,
      },
    });
  }

  async closeSettlement(tenantId: string, id: string) {
    const row = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Settlement not found');
    if (row.status === 'closed') {
      throw new BadRequestException('Settlement already closed');
    }
    if (row.status === 'open') {
      throw new BadRequestException('Settlement must be matched before closing');
    }
    return this.prisma.settlement.update({
      where: { id },
      data: { status: 'closed', settledAt: new Date() },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
        accountPair: true,
      },
    });
  }

  async cancelNameChange(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.employeeNameChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Name change not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Posted name change must be reversed via HR document unpost');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Name change already cancelled');
    }
    return this.prisma.employeeNameChange.update({
      where: { id },
      data: {
        status: 'cancelled',
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });
  }

  async cancelWageChange(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.wageChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Wage change not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Posted wage change must be reversed via HR document unpost');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Wage change already cancelled');
    }
    return this.prisma.wageChange.update({
      where: { id },
      data: {
        status: 'cancelled',
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });
  }

  async cancelClearanceSheet(tenantId: string, id: string) {
    const sheet = await this.prisma.clearanceSheet.findFirst({
      where: { id, tenantId },
    });
    if (!sheet) throw new NotFoundException('Clearance sheet not found');
    if (sheet.status === 'completed') {
      throw new BadRequestException('Completed clearance cannot be cancelled');
    }
    if (sheet.status === 'cancelled') {
      throw new BadRequestException('Clearance already cancelled');
    }
    return this.prisma.clearanceSheet.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async postSalesAccrual(tenantId: string, id: string) {
    const row = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Sales accrual not found');
    if (row.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Sales accrual already posted');
    }
    if (row.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Cancelled sales accrual cannot be posted');
    }

    // Ensure commission derived if missing
    const year = row.periodFrom.getUTCFullYear();
    const month = row.periodFrom.getUTCMonth() + 1;

    // Cascade into open payroll period as bonus line (ФОТ)
    let period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId, year, month },
    });
    if (!period) {
      period = await this.prisma.payrollPeriod.create({
        data: { tenantId, year, month, note: 'Auto-created from sales accrual' },
      });
    }
    if (period.status !== 'closed') {
      for (const line of row.lines) {
        const commission = Number(line.amount);
        if (!(commission > 0)) continue;
        await this.prisma.payrollLine.create({
          data: {
            tenantId,
            periodId: period.id,
            employeeId: line.employeeId,
            type: PayrollLineType.bonus,
            status: DocumentLifecycle.posted,
            postedAt: new Date(),
            amount: new Prisma.Decimal(commission),
            description: `Sales commission ${row.number}`,
          },
        });
      }
    }

    return this.prisma.salesCommissionAccrual.update({
      where: { id },
      data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      include: { lines: true },
    });
  }

  async cancelSalesAccrual(tenantId: string, id: string) {
    const row = await this.prisma.salesCommissionAccrual.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Sales accrual not found');
    if (row.status === DocumentLifecycle.posted) {
      await this.prisma.payrollLine.deleteMany({
        where: { tenantId, description: `Sales commission ${row.number}` },
      });
      return this.prisma.salesCommissionAccrual.update({
        where: { id },
        data: { status: DocumentLifecycle.draft, postedAt: null },
        include: { lines: true },
      });
    }
    if (row.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Sales accrual already cancelled');
    }
    return this.prisma.salesCommissionAccrual.update({
      where: { id },
      data: { status: DocumentLifecycle.cancelled },
      include: { lines: true },
    });
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
    const row = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Payment order not found');
    if (row.status !== 'open' && row.status !== 'new') {
      throw new BadRequestException(
        row.status === 'sent'
          ? 'Payment order already sent'
          : row.status === 'paid'
            ? 'Payment order already paid'
            : `Cannot send payment order in status ${row.status}`,
      );
    }
    return this.prisma.paymentOrder.update({
      where: { id },
      data: { status: 'sent' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });
  }

  async payPaymentOrder(tenantId: string, id: string) {
    const row = await this.prisma.paymentOrder.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Payment order not found');
    if (row.status !== 'sent') {
      throw new BadRequestException(
        row.status === 'open' || row.status === 'new'
          ? 'Payment order must be sent before paying'
          : row.status === 'paid'
            ? 'Payment order already paid'
            : `Cannot pay payment order in status ${row.status}`,
      );
    }
    return this.prisma.paymentOrder.update({
      where: { id },
      data: { status: 'paid' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, tabNumber: true } },
      },
    });
  }

  async activateGphContract(tenantId: string, id: string) {
    const row = await this.prisma.gphContract.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('GPH contract not found');
    if (row.isActive) {
      throw new BadRequestException('GPH contract already active');
    }
    return this.prisma.gphContract.update({
      where: { id },
      data: { isActive: true, status: row.status === 'cancelled' ? 'draft' : row.status },
      include: this.gphInclude(),
    });
  }

  async closeGphContract(tenantId: string, id: string) {
    const row = await this.prisma.gphContract.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('GPH contract not found');
    if (!row.isActive) {
      throw new BadRequestException('GPH contract already closed');
    }
    return this.prisma.gphContract.update({
      where: { id },
      data: {
        isActive: false,
        endDate: row.endDate ?? new Date(),
      },
      include: this.gphInclude(),
    });
  }

  async postGphContract(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.gphContract.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('GPH contract not found');
    if (row.status === 'posted') {
      throw new BadRequestException('GPH contract already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled GPH contract cannot be posted');
    }
    return this.prisma.gphContract.update({
      where: { id },
      data: {
        status: 'posted',
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        isActive: true,
      },
      include: this.gphInclude(),
    });
  }

  async unpostGphContract(tenantId: string, id: string) {
    const row = await this.prisma.gphContract.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('GPH contract not found');
    if (row.status !== 'posted') {
      throw new BadRequestException('Only posted GPH contracts can be unposted');
    }
    return this.prisma.gphContract.update({
      where: { id },
      data: {
        status: 'draft',
        postedAt: null,
        postedBy: null,
      },
      include: this.gphInclude(),
    });
  }

  private gphInclude() {
    return {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          personId: true,
          divisionId: true,
          person: {
            select: { id: true, firstName: true, lastName: true, middleName: true },
          },
          division: { select: { id: true, name: true, code: true } },
        },
      },
      division: { select: { id: true, name: true, code: true } },
      person: {
        select: { id: true, firstName: true, lastName: true, middleName: true },
      },
      services: true,
    };
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

    const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : new Date();
    const number = body.number ? String(body.number).trim() : undefined;
    const title =
      (body.title ? String(body.title).trim() : '') ||
      number ||
      type.name ||
      'Инцидент';
    const action = (body.action as any) || 'verbal_warning';
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
        action,
        damageAmount: damageAmount ?? undefined,
        sendNotification: Boolean(body.sendNotification),
        occurredAt,
        status: (body.status as any) || 'open',
        severity: (body.severity as any) || 'medium',
        attachments: body.attachments ?? undefined,
      },
      include: this.incidentInclude(),
    });
  }

  async updateIncident(tenantId: string, id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.incident.findFirst({ where: { id, tenantId } });
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
    if (body.occurredAt !== undefined) data.occurredAt = new Date(String(body.occurredAt));
    if (body.resolvedAt !== undefined) {
      data.resolvedAt = body.resolvedAt ? new Date(String(body.resolvedAt)) : null;
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

  private clearanceTemplateInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      position: { select: { id: true, name: true, code: true } },
      employees: {
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
        },
      },
      items: { orderBy: { sortOrder: 'asc' as const } },
    };
  }

  private clearanceSheetInclude() {
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
      template: true,
      items: { orderBy: { sortOrder: 'asc' as const } },
    };
  }

  private async createClearanceFromTemplate(tenantId: string, data: Record<string, unknown>) {
    const template = await this.prisma.clearanceTemplate.findFirst({
      where: { id: String(data.templateId), tenantId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        employees: {
          orderBy: { sortOrder: 'asc' },
          include: {
            employee: {
              select: { firstName: true, lastName: true, middleName: true, tabNumber: true },
            },
          },
        },
      },
    });
    if (!template) throw new NotFoundException('Template not found');

    const itemCreates: {
      title: string;
      department?: string | null;
      sortOrder: number;
    }[] = [];
    let sort = 0;
    for (const emp of template.employees) {
      const e = emp.employee;
      const name = [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
      itemCreates.push({
        title: name || e.tabNumber,
        department: null,
        sortOrder: sort++,
      });
    }
    if (template.requireManagerSign) {
      itemCreates.push({ title: 'Руководитель', department: null, sortOrder: sort++ });
    }
    if (template.requireHigherManagerSign) {
      itemCreates.push({
        title: 'Вышестоящий руководитель',
        department: null,
        sortOrder: sort++,
      });
    }
    for (const it of template.items) {
      itemCreates.push({
        title: it.title,
        department: it.department,
        sortOrder: sort++,
      });
    }
    if (itemCreates.length === 0) {
      itemCreates.push({ title: 'Подпись', department: null, sortOrder: 0 });
    }

    const documentDate = data.documentDate
      ? new Date(String(data.documentDate))
      : new Date();

    return this.prisma.clearanceSheet.create({
      data: {
        tenantId,
        employeeId: String(data.employeeId),
        templateId: template.id,
        number: data.number ? String(data.number) : undefined,
        documentDate,
        title: String(data.title || template.name),
        status: (data.status as any) || 'open',
        note: data.note ? String(data.note) : undefined,
        items: { create: itemCreates },
      },
      include: this.clearanceSheetInclude(),
    });
  }

  async createClearanceTemplate(tenantId: string, body: Record<string, unknown>) {
    const divisionId = body.divisionId ? String(body.divisionId) : null;
    const positionId = body.positionId ? String(body.positionId) : null;
    const requireManagerSign = Boolean(body.requireManagerSign);
    const requireHigherManagerSign = Boolean(body.requireHigherManagerSign);
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    let name = body.name ? String(body.name).trim() : '';
    if (!name) {
      const [div, pos] = await Promise.all([
        divisionId
          ? this.prisma.division.findFirst({ where: { id: divisionId, tenantId } })
          : null,
        positionId
          ? this.prisma.position.findFirst({ where: { id: positionId, tenantId } })
          : null,
      ]);
      name = [div?.name, pos?.name].filter(Boolean).join(' / ') || 'Шаблон обходного листа';
    }
    const code =
      (body.code ? String(body.code).trim() : '') ||
      `CLR-${Date.now().toString(36).toUpperCase()}`;

    const employeeIds = Array.isArray(body.employees)
      ? (body.employees as unknown[])
          .map((x) => {
            if (typeof x === 'string') return x;
            if (x && typeof x === 'object' && 'employeeId' in x) {
              return String((x as { employeeId: string }).employeeId);
            }
            return '';
          })
          .filter(Boolean)
      : Array.isArray(body.employeeIds)
        ? (body.employeeIds as unknown[]).map(String)
        : [];

    return this.prisma.clearanceTemplate.create({
      data: {
        tenantId,
        code,
        name,
        divisionId,
        positionId,
        requireManagerSign,
        requireHigherManagerSign,
        isActive,
        employees: {
          create: employeeIds.map((employeeId, i) => ({
            employeeId,
            sortOrder: i,
          })),
        },
      },
      include: this.clearanceTemplateInclude(),
    });
  }

  async updateClearanceTemplate(tenantId: string, id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.clearanceTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const data: Record<string, unknown> = {};
    if (body.code !== undefined) data.code = String(body.code);
    if (body.name !== undefined) data.name = String(body.name);
    if (body.divisionId !== undefined) {
      data.divisionId = body.divisionId ? String(body.divisionId) : null;
    }
    if (body.positionId !== undefined) {
      data.positionId = body.positionId ? String(body.positionId) : null;
    }
    if (body.requireManagerSign !== undefined) {
      data.requireManagerSign = Boolean(body.requireManagerSign);
    }
    if (body.requireHigherManagerSign !== undefined) {
      data.requireHigherManagerSign = Boolean(body.requireHigherManagerSign);
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const replaceEmployees =
      Array.isArray(body.employees) || Array.isArray(body.employeeIds);
    const employeeIds = Array.isArray(body.employees)
      ? (body.employees as unknown[])
          .map((x) => {
            if (typeof x === 'string') return x;
            if (x && typeof x === 'object' && 'employeeId' in x) {
              return String((x as { employeeId: string }).employeeId);
            }
            return '';
          })
          .filter(Boolean)
      : Array.isArray(body.employeeIds)
        ? (body.employeeIds as unknown[]).map(String)
        : [];

    return this.prisma.$transaction(async (tx) => {
      if (replaceEmployees) {
        await tx.clearanceTemplateEmployee.deleteMany({ where: { templateId: id } });
        if (employeeIds.length) {
          await tx.clearanceTemplateEmployee.createMany({
            data: employeeIds.map((employeeId, i) => ({
              templateId: id,
              employeeId,
              sortOrder: i,
            })),
          });
        }
      }
      return tx.clearanceTemplate.update({
        where: { id },
        data,
        include: this.clearanceTemplateInclude(),
      });
    });
  }

  // —— Analytics used by catalog reports ——

  async divisionStats(tenantId: string) {
    return this.divisionWorkDashboard(tenantId, {});
  }

  /**
   * Verifix «Статистика работы подразделений»
   * Статусы: режим не задан | не по графику | по графику
   */
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
    const day = opts.to
      ? parseDateParam(opts.to, new Date(), 'to')
      : opts.from
        ? parseDateParam(opts.from, new Date(), 'from')
        : new Date();
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const where: Prisma.DivisionWhereInput = {
      tenantId,
      isActive: true,
    };
    if (opts.divisionGroupId) where.divisionGroupId = opts.divisionGroupId;
    if (opts.scheduleId) where.scheduleId = opts.scheduleId;
    if (opts.q?.trim()) {
      const q = opts.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [divisions, groups, schedules] = await Promise.all([
      this.prisma.division.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          scheduleId: true,
          divisionGroupId: true,
          openedAt: true,
          closedAt: true,
          schedule: {
            select: {
              id: true,
              code: true,
              name: true,
              startTime: true,
              endTime: true,
              isActive: true,
            },
          },
          divisionGroup: { select: { id: true, name: true } },
        },
      }),
      this.prisma.divisionGroup.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.workSchedule.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
    ]);

    // Divisions with any attendance that day (employees of division punched/had day)
    const attendance = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte: day, lte: dayEnd },
        employee: { divisionId: { in: divisions.map((d) => d.id) } },
      },
      select: {
        employee: { select: { divisionId: true } },
      },
      take: 20000,
    });
    const activeDivIds = new Set<string>();
    for (const a of attendance) {
      if (a.employee.divisionId) activeDivIds.add(a.employee.divisionId);
    }

    type StatusKey = 'mode_not_set' | 'not_on_schedule' | 'on_schedule';
    const rows = divisions.map((d) => {
      let status: StatusKey = 'mode_not_set';
      let statusLabel = 'Режим работы не задан';
      let openTime: string | null = null;
      let closeTime: string | null = null;

      if (!d.scheduleId || !d.schedule) {
        status = 'mode_not_set';
        statusLabel = 'Режим работы не задан';
      } else {
        const permanentlyClosed =
          d.closedAt != null && d.closedAt.getTime() <= dayEnd.getTime();
        const notYetOpened =
          d.openedAt != null && d.openedAt.getTime() > dayEnd.getTime();
        const noActivity = !activeDivIds.has(d.id);

        if (permanentlyClosed || notYetOpened || !d.schedule.isActive || noActivity) {
          status = 'not_on_schedule';
          statusLabel = 'Не по графику';
          openTime = null;
          closeTime = null;
        } else {
          status = 'on_schedule';
          statusLabel = 'По графику';
          openTime = d.schedule.startTime;
          closeTime = d.schedule.endTime;
        }
      }

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        openTime,
        closeTime,
        status,
        statusLabel,
        scheduleId: d.scheduleId,
        scheduleName: d.schedule?.name ?? null,
        divisionGroupId: d.divisionGroupId,
        divisionGroupName: d.divisionGroup?.name ?? null,
      };
    });

    const modeNotSet = rows.filter((r) => r.status === 'mode_not_set').length;
    const notOnSchedule = rows.filter((r) => r.status === 'not_on_schedule').length;
    const onSchedule = rows.filter((r) => r.status === 'on_schedule').length;

    return {
      title: 'Статистика работы подразделений',
      date: day.toISOString().slice(0, 10),
      summary: {
        total: rows.length,
        modeNotSet,
        notOnSchedule,
        onSchedule,
        notOpened: notOnSchedule,
      },
      rows,
      filters: {
        divisionGroups: groups.map((g) => ({
          id: g.id,
          label: g.name,
        })),
        schedules: schedules.map((s) => ({
          id: s.id,
          label: `${s.code} ${s.name}`.trim(),
        })),
      },
      // legacy shape for generic report page
      divisions: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.statusLabel,
        openTime: r.openTime,
        closeTime: r.closeTime,
      })),
    };
  }

  async yearSummary(tenantId: string, yearInput: number) {
    const { year } = parseYearMonth(yearInput, 1);
    const from = new Date(year, 0, 1);
    const to = new Date(year, 11, 31, 23, 59, 59);
    const hired = await this.prisma.employee.count({
      where: { tenantId, hiredAt: { gte: from, lte: to } },
    });
    const dismissed = await this.prisma.employee.count({
      where: { tenantId, dismissedAt: { gte: from, lte: to } },
    });
    const headcount = await this.prisma.employee.count({
      where: { tenantId, status: 'active' },
    });
    const lateDays = await this.prisma.attendanceDay.count({
      where: { tenantId, workDate: { gte: from, lte: to }, status: 'late' },
    });
    const absentDays = await this.prisma.attendanceDay.count({
      where: { tenantId, workDate: { gte: from, lte: to }, status: 'absent' },
    });
    const payroll = await this.prisma.payrollLine.aggregate({
      where: { tenantId, period: { year } },
      _sum: { amount: true },
    });
    return {
      title: `Итоги года ${year}`,
      year,
      hired,
      dismissed,
      headcount,
      lateDays,
      absentDays,
      payrollTotal: payroll._sum.amount ?? 0,
    };
  }

  /** Verifix «Итоги года» / year_summary_dashboard */
  async yearSummaryDashboard(tenantId: string, yearInput?: number) {
    const year =
      yearInput && Number.isFinite(yearInput) && yearInput > 2000
        ? Math.floor(yearInput)
        : new Date().getFullYear();
    const now = new Date();
    const monthLimit =
      year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const MONTH_LABELS = [
      'Янв',
      'Фев',
      'Мар',
      'Апр',
      'Май',
      'Июн',
      'Июл',
      'Авг',
      'Сен',
      'Окт',
      'Ноя',
      'Дек',
    ];
    const from = new Date(year, 0, 1);
    const to = new Date(year, 11, 31, 23, 59, 59);
    const prevYearEnd = new Date(year - 1, 11, 31, 23, 59, 59);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const ageAt = year === now.getFullYear() ? now : yearEnd;

    const [employees, attendanceDays, absences, payrollLines] =
      await Promise.all([
        this.prisma.employee.findMany({
          where: { tenantId },
          select: {
            id: true,
            status: true,
            hiredAt: true,
            dismissedAt: true,
            person: { select: { gender: true, birthDate: true } },
          },
        }),
        this.prisma.attendanceDay.findMany({
          where: { tenantId, workDate: { gte: from, lte: to } },
          select: {
            workDate: true,
            lateMinutes: true,
            earlyLeaveMinutes: true,
            status: true,
          },
        }),
        this.prisma.absence.findMany({
          where: {
            tenantId,
            status: { in: ['approved', 'pending'] },
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: {
            absenceType: { select: { name: true, code: true } },
          },
        }),
        this.prisma.payrollLine.findMany({
          where: { tenantId, period: { year } },
          select: {
            type: true,
            amount: true,
            period: { select: { month: true } },
          },
        }),
      ]);

    const activeAt = (
      e: (typeof employees)[0],
      at: Date,
    ): boolean => {
      if (e.hiredAt && e.hiredAt > at) return false;
      if (e.dismissedAt && e.dismissedAt < at) return false;
      if (
        !e.hiredAt &&
        e.status === 'dismissed' &&
        e.dismissedAt &&
        e.dismissedAt < at
      ) {
        return false;
      }
      if (!e.hiredAt && e.status !== 'active') return false;
      return true;
    };

    const inMonth = (d: Date | null | undefined, y: number, m: number) => {
      if (!d) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    };

    const headDynamics: {
      month: number;
      label: string;
      count: number;
    }[] = [];
    const turnoverDynamics: {
      month: number;
      label: string;
      hired: number;
      dismissed: number;
      turnoverPct: number;
      headStart: number;
      headEnd: number;
    }[] = [];

    for (let m = 0; m < monthLimit; m++) {
      const monthStart = new Date(year, m, 1);
      const monthEnd = new Date(year, m + 1, 0, 23, 59, 59);
      let hired = 0;
      let dismissed = 0;
      let headStart = 0;
      let headEnd = 0;
      for (const e of employees) {
        if (inMonth(e.hiredAt, year, m)) hired += 1;
        if (inMonth(e.dismissedAt, year, m)) dismissed += 1;
        if (activeAt(e, monthStart)) headStart += 1;
        if (activeAt(e, monthEnd)) headEnd += 1;
      }
      const ssch = (headStart + headEnd) / 2;
      const turnoverPct =
        ssch > 0 ? Math.round((dismissed / ssch) * 10000) / 100 : 0;
      headDynamics.push({
        month: m + 1,
        label: MONTH_LABELS[m],
        count: headEnd,
      });
      turnoverDynamics.push({
        month: m + 1,
        label: MONTH_LABELS[m],
        hired,
        dismissed,
        turnoverPct,
        headStart,
        headEnd,
      });
    }

    const currentHeadcount = employees.filter((e) => e.status === 'active').length;
    const headPrevYearEnd = employees.filter((e) => activeAt(e, prevYearEnd)).length;
    const yoyPercent =
      headPrevYearEnd > 0
        ? Math.round(
            ((currentHeadcount - headPrevYearEnd) / headPrevYearEnd) * 1000,
          ) / 10
        : currentHeadcount
          ? 100
          : 0;

    const avgTurnover =
      turnoverDynamics.length > 0
        ? Math.round(
            (turnoverDynamics.reduce((s, r) => s + r.turnoverPct, 0) /
              turnoverDynamics.length) *
              100,
          ) / 100
        : 0;

    // Age structure (active now / at year end)
    const ageBuckets: { label: string; count: number }[] = [
      { label: '18-25', count: 0 },
      { label: '26-35', count: 0 },
      { label: '36-45', count: 0 },
      { label: '46-55', count: 0 },
      { label: '55+', count: 0 },
    ];
    for (const e of employees) {
      if (!activeAt(e, ageAt)) continue;
      const bd = e.person?.birthDate;
      if (!bd) continue;
      let age = ageAt.getFullYear() - bd.getFullYear();
      const md = ageAt.getMonth() - bd.getMonth();
      if (md < 0 || (md === 0 && ageAt.getDate() < bd.getDate())) age -= 1;
      if (age < 18) continue;
      if (age <= 25) ageBuckets[0].count += 1;
      else if (age <= 35) ageBuckets[1].count += 1;
      else if (age <= 45) ageBuckets[2].count += 1;
      else if (age <= 55) ageBuckets[3].count += 1;
      else ageBuckets[4].count += 1;
    }

    // Gender
    let male = 0;
    let female = 0;
    let other = 0;
    for (const e of employees) {
      if (e.status !== 'active') continue;
      const g = (e.person?.gender || '').toLowerCase().trim();
      if (
        g === 'male' ||
        g === 'm' ||
        g === 'муж' ||
        g === 'мужчина' ||
        g === 'мужской'
      ) {
        male += 1;
      } else if (
        g === 'female' ||
        g === 'f' ||
        g === 'жен' ||
        g === 'женщина' ||
        g === 'женский'
      ) {
        female += 1;
      } else {
        other += 1;
      }
    }
    const genderTotal = male + female + other;
    const gender = {
      male,
      female,
      other,
      total: genderTotal,
      malePct:
        genderTotal > 0
          ? Math.round((male / genderTotal) * 10000) / 100
          : 0,
      femalePct:
        genderTotal > 0
          ? Math.round((female / genderTotal) * 10000) / 100
          : 0,
    };

    // Attendance violations (minutes per month)
    const lateByMonth = Array.from({ length: monthLimit }, () => 0);
    const earlyByMonth = Array.from({ length: monthLimit }, () => 0);
    for (const d of attendanceDays) {
      const m = d.workDate.getMonth();
      if (m >= monthLimit) continue;
      lateByMonth[m] += d.lateMinutes || 0;
      earlyByMonth[m] += d.earlyLeaveMinutes || 0;
    }
    const attendanceViolations = {
      hasData: lateByMonth.some((v) => v > 0) || earlyByMonth.some((v) => v > 0),
      series: Array.from({ length: monthLimit }, (_, m) => ({
        month: m + 1,
        label: MONTH_LABELS[m],
        lateMinutes: lateByMonth[m],
        earlyLeaveMinutes: earlyByMonth[m],
      })),
    };

    // Absence reasons
    const absenceMap = new Map<string, number>();
    for (const a of absences) {
      const name = a.absenceType?.name || a.absenceType?.code || 'Прочее';
      absenceMap.set(name, (absenceMap.get(name) || 0) + 1);
    }
    const absenceReasons = [...absenceMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Payroll
    const ACCRUAL = new Set(['base', 'bonus', 'overtime', 'one_time', 'other']);
    const WITHHOLD = new Set(['deduction', 'penalty', 'advance']);
    const payByMonth = Array.from({ length: 12 }, () => 0);
    let accrued = 0;
    let withheld = 0;
    for (const line of payrollLines) {
      const amt = Number(line.amount) || 0;
      const m = (line.period?.month || 1) - 1;
      if (m >= 0 && m < 12) payByMonth[m] += amt;
      if (ACCRUAL.has(line.type)) accrued += amt;
      if (WITHHOLD.has(line.type)) withheld += Math.abs(amt);
    }
    const payrollPayments = Array.from({ length: monthLimit }, (_, m) => ({
      month: m + 1,
      label: MONTH_LABELS[m],
      amount: Math.round(payByMonth[m] * 100) / 100,
    }));
    const payrollHasData = payrollLines.length > 0;

    const queries = {
      headcount: `SELECT DATE_TRUNC('month', d)::date AS month,
  COUNT(*) FILTER (
    WHERE hired_at <= (DATE_TRUNC('month', d) + INTERVAL '1 month' - INTERVAL '1 day')
      AND (dismissed_at IS NULL OR dismissed_at > DATE_TRUNC('month', d) + INTERVAL '1 month' - INTERVAL '1 day')
  ) AS headcount
FROM generate_series('${year}-01-01'::date, '${year}-12-01'::date, '1 month') d
CROSS JOIN employees e
WHERE e.tenant_id = :tenantId
GROUP BY 1 ORDER BY 1;`,
      age: `SELECT
  CASE
    WHEN age_years BETWEEN 18 AND 25 THEN '18-25'
    WHEN age_years BETWEEN 26 AND 35 THEN '26-35'
    WHEN age_years BETWEEN 36 AND 45 THEN '36-45'
    WHEN age_years BETWEEN 46 AND 55 THEN '46-55'
    ELSE '55+'
  END AS bucket,
  COUNT(*) AS cnt
FROM (
  SELECT DATE_PART('year', AGE(persons.birth_date)) AS age_years
  FROM employees
  JOIN persons ON persons.id = employees.person_id
  WHERE employees.tenant_id = :tenantId AND employees.status = 'active'
    AND persons.birth_date IS NOT NULL
) t
GROUP BY 1;`,
      gender: `SELECT LOWER(COALESCE(persons.gender, 'unknown')) AS gender, COUNT(*) AS cnt
FROM employees
JOIN persons ON persons.id = employees.person_id
WHERE employees.tenant_id = :tenantId AND employees.status = 'active'
GROUP BY 1;`,
      turnover: `SELECT DATE_TRUNC('month', month_start) AS month,
  COUNT(*) FILTER (WHERE DATE_TRUNC('month', hired_at) = month_start) AS hired,
  COUNT(*) FILTER (WHERE DATE_TRUNC('month', dismissed_at) = month_start) AS dismissed
FROM generate_series('${year}-01-01'::date, '${year}-12-01'::date, '1 month') month_start
CROSS JOIN employees
WHERE tenant_id = :tenantId
GROUP BY 1 ORDER BY 1;`,
      attendance: `SELECT DATE_TRUNC('month', work_date) AS month,
  SUM(late_minutes) AS late_minutes,
  SUM(early_leave_minutes) AS early_leave_minutes
FROM attendance_days
WHERE tenant_id = :tenantId
  AND work_date >= '${year}-01-01' AND work_date <= '${year}-12-31'
GROUP BY 1 ORDER BY 1;`,
      absences: `SELECT at.name, COUNT(*) AS cnt
FROM absences a
JOIN absence_types at ON at.id = a.absence_type_id
WHERE a.tenant_id = :tenantId
  AND a.start_date <= '${year}-12-31' AND a.end_date >= '${year}-01-01'
  AND a.status IN ('approved', 'pending')
GROUP BY at.name
ORDER BY cnt DESC;`,
      payroll: `SELECT pp.month, pl.type, SUM(pl.amount) AS amount
FROM payroll_lines pl
JOIN payroll_periods pp ON pp.id = pl.period_id
WHERE pl.tenant_id = :tenantId AND pp.year = ${year}
GROUP BY pp.month, pl.type
ORDER BY pp.month;`,
    };

    return {
      title: `Итоги года ${year}`,
      year,
      prevYear: year - 1,
      fetchedAt: new Date().toISOString(),
      months: MONTH_LABELS.slice(0, monthLimit),
      headcount: {
        current: currentHeadcount,
        prevYearEnd: headPrevYearEnd,
        yoyPercent,
        dynamics: headDynamics,
      },
      ageStructure: ageBuckets,
      gender,
      turnover: {
        averagePct: avgTurnover,
        dynamics: turnoverDynamics,
      },
      attendanceViolations,
      absenceReasons,
      payroll: {
        hasData: payrollHasData,
        payments: payrollPayments,
        accrued: payrollHasData ? Math.round(accrued * 100) / 100 : null,
        withheld: payrollHasData ? Math.round(withheld * 100) / 100 : null,
      },
      totals: {
        hired: turnoverDynamics.reduce((s, r) => s + r.hired, 0),
        dismissed: turnoverDynamics.reduce((s, r) => s + r.dismissed, 0),
      },
      queries,
    };
  }

  async staffingReport(
    tenantId: string,
    opts: { date?: string; divisionId?: string; positionId?: string } = {},
  ) {
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const divisionId = opts.divisionId?.trim() || undefined;
    const positionId = opts.positionId?.trim() || undefined;
    const money = (n: number) => Math.round(n * 100) / 100;
    const num = (v: unknown) => {
      const n = v == null || v === '' ? 0 : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const where: Prisma.StaffPositionWhereInput = {
      tenantId,
      isActive: true,
      AND: [
        { OR: [{ openedAt: null }, { openedAt: { lte: asOf } }] },
        { OR: [{ closedAt: null }, { closedAt: { gte: asOf } }] },
      ],
    };
    if (divisionId) where.divisionId = divisionId;
    if (positionId) where.positionId = positionId;

    const positions = await this.prisma.staffPosition.findMany({
      where,
      include: {
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
        grade: { select: { name: true } },
        tariffGroup: { select: { name: true, baseRate: true } },
        employees: {
          where: {
            AND: [
              { OR: [{ hiredAt: null }, { hiredAt: { lte: asOf } }] },
              { OR: [{ dismissedAt: null }, { dismissedAt: { gte: asOf } }] },
            ],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
            baseSalary: true,
          },
        },
      },
    });

    positions.sort((a, b) => {
      const dn = (a.division?.name || '—').localeCompare(b.division?.name || '—', 'ru');
      if (dn) return dn;
      const pa = a.position?.name || a.title;
      const pb = b.position?.name || b.title;
      return pa.localeCompare(pb, 'ru');
    });

    type Line = {
      kind: 'group' | 'line';
      groupIndex: number;
      divisionId: string | null;
      division: string;
      staffPositionId?: string;
      code?: string;
      title?: string;
      position: string;
      grade?: string | null;
      tariff?: string | null;
      units: number;
      rates: number;
      occupied: number;
      vacant: number;
      ratePerUnit: number | null;
      actualRates: number;
      positionSalary: number | null;
      totalSalary: number;
      actualSalary: number | null;
      totalActualSalary: number;
      status?: string;
      holders?: { id: string; firstName: string; lastName: string; tabNumber: string }[];
    };

    const grouped = new Map<string, typeof positions>();
    for (const p of positions) {
      const key = p.divisionId || '_none';
      const list = grouped.get(key) || [];
      list.push(p);
      grouped.set(key, list);
    }

    const rows: Line[] = [];
    const groups: {
      divisionId: string | null;
      division: string;
      index: number;
      totals: Line;
      lines: Line[];
    }[] = [];

    let groupIndex = 0;
    for (const [, list] of grouped) {
      groupIndex += 1;
      const divisionIdVal = list[0]?.divisionId ?? null;
      const divisionName = list[0]?.division?.name || '—';
      const lines: Line[] = list.map((p) => {
        const units = p.headcount || 0;
        const ratePerUnit = 1;
        const rates = money(units * ratePerUnit);
        const occupied = p.employees.length;
        const vacant = Math.max(0, units - occupied);
        const actualRates = money(occupied * ratePerUnit);
        const empSalaries = p.employees.map((e) => num(e.baseSalary)).filter((n) => n > 0);
        const avgEmp =
          empSalaries.length > 0
            ? empSalaries.reduce((s, n) => s + n, 0) / empSalaries.length
            : 0;
        const tariffRate = num(p.tariffGroup?.baseRate);
        const positionSalary = money(tariffRate > 0 ? tariffRate : avgEmp);
        const totalSalary = money(positionSalary * rates);
        const actualSalary = occupied > 0 ? money(avgEmp || positionSalary) : 0;
        const totalActualSalary = money(
          empSalaries.length ? empSalaries.reduce((s, n) => s + n, 0) : actualSalary * actualRates,
        );
        return {
          kind: 'line' as const,
          groupIndex,
          divisionId: divisionIdVal,
          division: divisionName,
          staffPositionId: p.id,
          code: p.code,
          title: p.title,
          position: p.position?.name || p.title,
          grade: p.grade?.name ?? null,
          tariff: p.tariffGroup?.name ?? null,
          units,
          rates,
          occupied,
          vacant,
          ratePerUnit,
          actualRates,
          positionSalary,
          totalSalary,
          actualSalary,
          totalActualSalary,
          status: p.status,
          holders: p.employees,
        };
      });

      const sum = (pick: (l: Line) => number) => money(lines.reduce((s, l) => s + pick(l), 0));
      const totals: Line = {
        kind: 'group',
        groupIndex,
        divisionId: divisionIdVal,
        division: divisionName,
        position: '',
        units: sum((l) => l.units),
        rates: sum((l) => l.rates),
        occupied: sum((l) => l.occupied),
        vacant: sum((l) => l.vacant),
        ratePerUnit: null,
        actualRates: sum((l) => l.actualRates),
        positionSalary: null,
        totalSalary: sum((l) => l.totalSalary),
        actualSalary: null,
        totalActualSalary: sum((l) => l.totalActualSalary),
      };

      groups.push({
        divisionId: divisionIdVal,
        division: divisionName,
        index: groupIndex,
        totals,
        lines,
      });
      rows.push(totals, ...lines);
    }

    const iso = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;
    return {
      title: 'Отчет по штатному расписанию',
      date: iso,
      generatedAt: new Date().toISOString(),
      groups,
      rows,
    };
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const divisionId = opts.divisionId?.trim() || undefined;
    const gradeId = opts.gradeId?.trim() || undefined;
    const educationTypeFilter = opts.educationType?.trim() || undefined;
    const rawType = (opts.reportType || 'age').toLowerCase();
    const reportType =
      rawType === 'experience' || rawType === 'grade' || rawType === 'education'
        ? rawType
        : 'age';

    type Band = { min: number | null; max: number | null };
    const defaultAge: Band[] = [
      { min: null, max: 18 },
      { min: 18, max: 25 },
      { min: 25, max: 35 },
      { min: 35, max: 55 },
      { min: 55, max: null },
    ];
    const defaultExp: Band[] = [
      { min: null, max: 1 },
      { min: 1, max: 2 },
      { min: 2, max: 3 },
      { min: 3, max: 5 },
      { min: 5, max: null },
    ];
    const parseBands = (raw?: string, fallback: Band[] = defaultAge): Band[] => {
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return fallback;
        return parsed.slice(0, 20).map((item) => {
          const o = item as { min?: unknown; max?: unknown };
          const min = o.min == null || o.min === '' ? null : Number(o.min);
          const max = o.max == null || o.max === '' ? null : Number(o.max);
          return {
            min: min != null && Number.isFinite(min) ? min : null,
            max: max != null && Number.isFinite(max) ? max : null,
          };
        });
      } catch {
        return fallback;
      }
    };
    const bandLabel = (b: Band, unit: string) => {
      if (b.min == null && b.max != null) return `до ${b.max} ${unit}`;
      if (b.min != null && b.max == null) return `от ${b.min} ${unit}`;
      if (b.min != null && b.max != null) return `от ${b.min} до ${b.max} ${unit}`;
      return '—';
    };
    const inBand = (value: number, b: Band) => {
      if (b.min != null && value < b.min) return false;
      if (b.max != null && value >= b.max) return false;
      return true;
    };
    const yearsAt = (from: Date, to: Date) => {
      let y = to.getFullYear() - from.getFullYear();
      const m = to.getMonth() - from.getMonth();
      if (m < 0 || (m === 0 && to.getDate() < from.getDate())) y -= 1;
      return y;
    };
    const genderOf = (raw?: string | null): 'male' | 'female' | 'other' => {
      const g = (raw || '').toLowerCase().trim();
      if (g === 'male' || g === 'm' || g === 'муж' || g === 'мужчина' || g === 'мужской') {
        return 'male';
      }
      if (g === 'female' || g === 'f' || g === 'жен' || g === 'женщина' || g === 'женский') {
        return 'female';
      }
      return 'other';
    };
    const educationFromPayload = (payload: unknown, fallback?: string | null) => {
      const p =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const type = p.educationType != null ? String(p.educationType).trim() : '';
      if (type) return type;
      if (p.kind === 'education' && fallback) return String(fallback);
      if (fallback && fallback.toLowerCase().includes('образован')) return String(fallback);
      return '';
    };

    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      AND: [
        { OR: [{ hiredAt: null }, { hiredAt: { lte: asOf } }] },
        { OR: [{ dismissedAt: null }, { dismissedAt: { gte: asOf } }] },
      ],
    };
    if (divisionId) where.divisionId = divisionId;

    const [employees, grades, eduDict] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          id: true,
          personId: true,
          hiredAt: true,
          gradeId: true,
          grade: { select: { id: true, name: true, code: true, level: true } },
          person: {
            select: {
              gender: true,
              birthDate: true,
              documents: { select: { docType: true, note: true, payload: true } },
            },
          },
          personDocuments: { select: { docType: true, note: true, payload: true } },
        },
      }),
      this.prisma.grade.findMany({
        where: { tenantId, isActive: true, ...(gradeId ? { id: gradeId } : {}) },
        orderBy: { level: 'asc' },
      }),
      this.prisma.dictionary.findFirst({
        where: { tenantId, code: 'edu' },
        include: {
          items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    const seen = new Set<string>();
    type PersonRow = {
      gender: 'male' | 'female' | 'other';
      age: number | null;
      experience: number | null;
      gradeId: string | null;
      gradeName: string;
      educationType: string;
    };
    const people: PersonRow[] = [];
    for (const e of employees) {
      const key = e.personId || e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const docs = [...(e.personDocuments || []), ...(e.person?.documents || [])];
      let edu = '';
      for (const d of docs) {
        edu = educationFromPayload(d.payload, d.note || d.docType);
        if (edu) break;
      }
      people.push({
        gender: genderOf(e.person?.gender),
        age: e.person?.birthDate ? yearsAt(e.person.birthDate, asOf) : null,
        experience: e.hiredAt ? yearsAt(e.hiredAt, asOf) : null,
        gradeId: e.gradeId,
        gradeName: e.grade?.name || 'Не указано',
        educationType: edu || 'Не указано',
      });
    }

    type Cell = { label: string; male: number; female: number; other: number; total: number };
    const empty = (label: string): Cell => ({ label, male: 0, female: 0, other: 0, total: 0 });
    const add = (cell: Cell, g: PersonRow['gender']) => {
      if (g === 'male') cell.male += 1;
      else if (g === 'female') cell.female += 1;
      else cell.other += 1;
      cell.total += 1;
    };

    let bucketLabel = 'Возраст';
    let rows: Cell[] = [];

    if (reportType === 'age' || reportType === 'experience') {
      const unit = 'лет';
      const bands = parseBands(opts.ranges, reportType === 'experience' ? defaultExp : defaultAge);
      bucketLabel = reportType === 'experience' ? 'Стаж' : 'Возраст';
      rows = bands.map((b) => empty(bandLabel(b, unit)));
      const unknown = empty('Не указано');
      for (const p of people) {
        const value = reportType === 'experience' ? p.experience : p.age;
        if (value == null) {
          add(unknown, p.gender);
          continue;
        }
        const idx = bands.findIndex((b) => inBand(value, b));
        if (idx >= 0) add(rows[idx], p.gender);
        else add(unknown, p.gender);
      }
      if (unknown.total > 0) rows.push(unknown);
    } else if (reportType === 'grade') {
      bucketLabel = 'Разряд';
      const byId = new Map(grades.map((g) => [g.id, empty(g.name)]));
      const unknown = empty('Не указано');
      for (const p of people) {
        if (gradeId && p.gradeId !== gradeId) continue;
        if (p.gradeId && byId.has(p.gradeId)) add(byId.get(p.gradeId)!, p.gender);
        else add(unknown, p.gender);
      }
      rows = [...byId.values()];
      if (unknown.total > 0) rows.push(unknown);
    } else {
      bucketLabel = 'Вид образования';
      const items = (eduDict?.items || []).filter((i) =>
        educationTypeFilter
          ? i.id === educationTypeFilter ||
            i.name === educationTypeFilter ||
            i.code === educationTypeFilter
          : true,
      );
      const byName = new Map(items.map((i) => [i.name.toLowerCase(), empty(i.name)]));
      const unknown = empty('Не указано');
      for (const p of people) {
        const key = p.educationType.toLowerCase();
        if (educationTypeFilter) {
          const want = educationTypeFilter.toLowerCase();
          const matchItem = items.find(
            (i) =>
              i.id === educationTypeFilter ||
              i.name.toLowerCase() === want ||
              i.code.toLowerCase() === want,
          );
          const wantName = (matchItem?.name || educationTypeFilter).toLowerCase();
          if (key !== wantName) continue;
        }
        if (byName.has(key)) add(byName.get(key)!, p.gender);
        else if (!educationTypeFilter) add(unknown, p.gender);
        else add(unknown, p.gender);
      }
      rows = [...byName.values()];
      if (unknown.total > 0) rows.push(unknown);
    }

    const totals = rows.reduce(
      (acc, r) => {
        acc.male += r.male;
        acc.female += r.female;
        acc.other += r.other;
        acc.total += r.total;
        return acc;
      },
      { male: 0, female: 0, other: 0, total: 0 },
    );
    const iso = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;
    return {
      title: 'Отчет по гендерному разделению сотрудников',
      date: iso,
      generatedAt: new Date().toISOString(),
      reportType,
      bucketLabel,
      rows,
      totals,
      counts: {
        male: totals.male,
        female: totals.female,
        other: totals.other,
        unknown: totals.other,
      },
    };
  }

  async movementDivisionsReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string } = {},
  ) {
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const toRaw = parseDateParam(opts.to, new Date(), 'to');
    const to = new Date(toRaw);
    to.setHours(23, 59, 59, 999);
    const selected = (opts.divisionIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [divisions, employees, transferDocs, transferReqs] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { tenantId },
        select: { id: true, divisionId: true, hiredAt: true, dismissedAt: true },
      }),
      this.prisma.hrDocument.findMany({
        where: {
          tenantId,
          type: 'transfer',
          status: 'posted',
          documentDate: { gte: from, lte: to },
        },
        select: { payload: true },
      }),
      this.prisma.hrChangeRequest.findMany({
        where: {
          tenantId,
          kind: { in: ['transfer', 'transfer_batch'] },
          status: 'approved',
          OR: [
            { effectiveDate: { gte: from, lte: to } },
            { effectiveDate: null, requestDate: { gte: from, lte: to } },
          ],
        },
        select: {
          divisionId: true,
          payload: true,
          lines: { select: { divisionId: true } },
        },
      }),
    ]);

    const allowed = new Set<string>();
    if (selected.length) {
      const kids = new Map<string, string[]>();
      for (const d of divisions) {
        if (!d.parentId) continue;
        const list = kids.get(d.parentId) || [];
        list.push(d.id);
        kids.set(d.parentId, list);
      }
      const walk = (id: string) => {
        if (allowed.has(id)) return;
        allowed.add(id);
        for (const c of kids.get(id) || []) walk(c);
      };
      for (const id of selected) walk(id);
    }

    const inPeriod = (d: Date | null | undefined) => {
      if (!d) return false;
      return d >= from && d <= to;
    };
    const payloadPair = (payload: unknown) => {
      const p =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const str = (...keys: string[]) => {
        for (const k of keys) {
          if (p[k] != null && String(p[k]).trim()) return String(p[k]);
        }
        return null;
      };
      return {
        fromId: str('oldDivisionId', 'previousDivisionId', 'fromDivisionId'),
        toId: str('toDivisionId', 'divisionId'),
      };
    };

    type Agg = {
      id: string;
      division: string;
      hired: number;
      dismissed: number;
      transferIn: number;
      transferOut: number;
    };
    const map = new Map<string, Agg>();
    for (const d of divisions) {
      if (allowed.size && !allowed.has(d.id)) continue;
      map.set(d.id, {
        id: d.id,
        division: d.name,
        hired: 0,
        dismissed: 0,
        transferIn: 0,
        transferOut: 0,
      });
    }

    const bump = (id: string | null | undefined, field: keyof Omit<Agg, 'id' | 'division'>) => {
      if (!id) return;
      const row = map.get(id);
      if (!row) return;
      row[field] += 1;
    };

    for (const e of employees) {
      if (inPeriod(e.hiredAt)) bump(e.divisionId, 'hired');
      if (inPeriod(e.dismissedAt)) bump(e.divisionId, 'dismissed');
    }

    for (const doc of transferDocs) {
      const pair = payloadPair(doc.payload);
      if (pair.fromId && pair.toId && pair.fromId === pair.toId) continue;
      bump(pair.toId, 'transferIn');
      bump(pair.fromId, 'transferOut');
    }
    for (const req of transferReqs) {
      const pair = payloadPair(req.payload);
      const dests = req.lines.length
        ? req.lines.map((l) => l.divisionId || pair.toId || req.divisionId)
        : [pair.toId || req.divisionId];
      const fromId = pair.fromId;
      for (const dest of dests) {
        if (fromId && dest && fromId === dest) continue;
        bump(dest, 'transferIn');
        bump(fromId, 'transferOut');
      }
    }

    const pct = (n: number, total: number) =>
      total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
    const list = [...map.values()].sort((a, b) => a.division.localeCompare(b.division, 'ru'));
    const totals = list.reduce(
      (acc, r) => {
        acc.hired += r.hired;
        acc.dismissed += r.dismissed;
        acc.transferIn += r.transferIn;
        acc.transferOut += r.transferOut;
        return acc;
      },
      { hired: 0, dismissed: 0, transferIn: 0, transferOut: 0 },
    );
    const minMax = (key: 'hired' | 'dismissed' | 'transferIn' | 'transferOut') => {
      const vals = list.map((r) => r[key]);
      return {
        min: vals.length ? Math.min(...vals) : 0,
        max: vals.length ? Math.max(...vals) : 0,
      };
    };
    const extrema = {
      hired: minMax('hired'),
      dismissed: minMax('dismissed'),
      transferIn: minMax('transferIn'),
      transferOut: minMax('transferOut'),
    };
    const rows = list.map((r) => ({
      ...r,
      hiredPct: pct(r.hired, totals.hired),
      dismissedPct: pct(r.dismissed, totals.dismissed),
      transferInPct: pct(r.transferIn, totals.transferIn),
      transferOutPct: pct(r.transferOut, totals.transferOut),
    }));
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      title: 'Отчет по движению сотрудников (подразделения)',
      from: iso(from),
      to: iso(toRaw),
      generatedAt: new Date().toISOString(),
      extrema,
      totals: {
        ...totals,
        hiredPct: totals.hired ? 100 : 0,
        dismissedPct: totals.dismissed ? 100 : 0,
        transferInPct: totals.transferIn ? 100 : 0,
        transferOutPct: totals.transferOut ? 100 : 0,
      },
      rows,
    };
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
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const toRaw = parseDateParam(opts.to, new Date(), 'to');
    const to = new Date(toRaw);
    to.setHours(23, 59, 59, 999);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const csvIds = (v?: string) =>
      (v || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const wanted = csvIds(opts.kinds);
    const allKinds = ['hireNew', 'hire', 'dismiss', 'transferIn', 'transferOut', 'rehired'] as const;
    let kinds = (wanted.length ? wanted : [...allKinds]).filter((k) =>
      (allKinds as readonly string[]).includes(k),
    );
    if (!kinds.length) kinds = [...allKinds];
    const selectedDiv = csvIds(opts.divisionIds);
    const selectedPos = csvIds(opts.positionIds);
    const selectedEmp = csvIds(opts.employeeIds);
    const divisionGroupId = opts.divisionGroupId?.trim() || '';
    const positionGroupId = opts.positionGroupId?.trim() || '';

    const empSelect = {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      hiredAt: true,
      dismissedAt: true,
      divisionId: true,
      positionId: true,
      staffPositionId: true,
      dismissalReason: { select: { name: true } },
      region: { select: { name: true } },
      division: {
        select: {
          id: true,
          name: true,
          divisionGroupId: true,
          divisionGroup: { select: { name: true } },
        },
      },
      position: {
        select: {
          id: true,
          name: true,
          positionGroupId: true,
          positionGroup: { select: { name: true } },
        },
      },
      staffPosition: {
        select: {
          code: true,
          title: true,
          groupName: true,
          division: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    } as const;

    const [employees, docs, divisions] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, employmentType: 'staff' },
        select: empSelect,
      }),
      this.prisma.hrDocument.findMany({
        where: {
          tenantId,
          status: 'posted',
          type: { in: ['hire', 'transfer', 'dismiss'] },
        },
        select: {
          type: true,
          documentDate: true,
          employeeId: true,
          payload: true,
          employee: { select: empSelect },
        },
        orderBy: { documentDate: 'asc' },
      }),
      this.prisma.division.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          parentId: true,
          divisionGroupId: true,
          divisionGroup: { select: { name: true } },
        },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walk = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walk(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (divisionGroupId) {
      allowedDiv = new Set();
      for (const d of divisions) {
        if (d.divisionGroupId === divisionGroupId) walk(d.id, allowedDiv);
      }
    }
    if (selectedDiv.length) {
      const picked = new Set<string>();
      for (const id of selectedDiv) walk(id, picked);
      allowedDiv = allowedDiv ? new Set([...allowedDiv].filter((id) => picked.has(id))) : picked;
    }

    const divById = new Map(divisions.map((d) => [d.id, d]));
    const positions = await this.prisma.position.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        positionGroupId: true,
        positionGroup: { select: { name: true } },
      },
    });
    const posById = new Map(positions.map((p) => [p.id, p]));
    const staffRows = await this.prisma.staffPosition.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        title: true,
        groupName: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
    });
    const staffById = new Map(staffRows.map((s) => [s.id, s]));

    const empName = (e: { lastName: string; firstName: string; middleName?: string | null }) =>
      [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toLocaleUpperCase('ru');

    const slotOf = (optsSlot: {
      staffId?: string | null;
      positionName?: string;
      divisionName?: string;
    }) => {
      const staff = optsSlot.staffId ? staffById.get(optsSlot.staffId) : undefined;
      const position = staff?.position?.name || optsSlot.positionName || staff?.title || '';
      const division = staff?.division?.name || optsSlot.divisionName || '';
      const code = staff?.code || '';
      if (position && division && code) return `${position}/${division}/(${code})`;
      if (position && division) return `${position}/${division}`;
      return position || division || '';
    };

    type MoveRow = {
      n: number;
      divisionGroup: string;
      division: string;
      position: string;
      positionGroup: string;
      slot: string;
      employee: string;
      employeeId: string;
      date: string;
      note: string;
      dismissedAt?: string;
    };

    const payloadOf = (payload: unknown) =>
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const str = (p: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        if (p[k] != null && String(p[k]).trim()) return String(p[k]);
      }
      return '';
    };

    const dismissDatesByEmp = new Map<string, Date[]>();
    for (const doc of docs) {
      if (doc.type !== 'dismiss' || !doc.employeeId) continue;
      const list = dismissDatesByEmp.get(doc.employeeId) || [];
      list.push(doc.documentDate);
      dismissDatesByEmp.set(doc.employeeId, list);
    }
    const lastPriorDismiss = (empId: string, hiredAt: Date) => {
      const prior = (dismissDatesByEmp.get(empId) || []).filter((d) => d < hiredAt);
      return prior.length ? prior.reduce((a, b) => (a > b ? a : b)) : null;
    };

    const inPeriod = (d: Date | null | undefined) => !!d && d >= from && d <= to;

    const matches = (row: {
      employeeId: string;
      divisionId?: string | null;
      positionId?: string | null;
      divisionGroupId?: string | null;
      positionGroupId?: string | null;
    }) => {
      if (selectedEmp.length && !selectedEmp.includes(row.employeeId)) return false;
      if (allowedDiv && (!row.divisionId || !allowedDiv.has(row.divisionId))) return false;
      if (selectedPos.length && (!row.positionId || !selectedPos.includes(row.positionId))) return false;
      if (positionGroupId && row.positionGroupId !== positionGroupId) return false;
      return true;
    };

    const rowFrom = (
      emp: (typeof employees)[number],
      date: Date,
      override?: {
        divisionId?: string | null;
        positionId?: string | null;
        staffId?: string | null;
        note?: string;
        dismissedAt?: Date | null;
      },
    ): MoveRow | null => {
      const divisionId = override?.divisionId || emp.divisionId;
      const positionId = override?.positionId || emp.positionId;
      const staffId = override?.staffId || emp.staffPositionId;
      const div = divisionId ? divById.get(divisionId) : emp.division;
      const pos = positionId ? posById.get(positionId) : emp.position;
      const staff = staffId ? staffById.get(staffId) : undefined;
      if (
        !matches({
          employeeId: emp.id,
          divisionId: div?.id || divisionId,
          positionId: pos?.id || positionId,
          positionGroupId: pos?.positionGroupId,
        })
      ) {
        return null;
      }
      return {
        n: 0,
        divisionGroup: div?.divisionGroup?.name || '',
        division: div?.name || '',
        position: pos?.name || '',
        positionGroup: staff?.groupName || emp.region?.name || pos?.positionGroup?.name || '',
        slot: slotOf({
          staffId,
          positionName: pos?.name,
          divisionName: div?.name,
        }),
        employee: empName(emp),
        employeeId: emp.id,
        date: iso(date),
        note: override?.note || '',
        dismissedAt: override?.dismissedAt ? iso(override.dismissedAt) : '',
      };
    };

    const buckets: Record<string, MoveRow[]> = {
      hireNew: [],
      hire: [],
      dismiss: [],
      transferIn: [],
      transferOut: [],
      rehired: [],
    };

    for (const e of employees) {
      if (!inPeriod(e.hiredAt) || !e.hiredAt) continue;
      const prior = lastPriorDismiss(e.id, e.hiredAt);
      const isRehire = !!(prior && prior < e.hiredAt);
      const row = rowFrom(e, e.hiredAt, {
        dismissedAt: isRehire ? prior : null,
      });
      if (!row) continue;
      buckets.hire.push({ ...row });
      if (isRehire) buckets.rehired.push({ ...row });
      else buckets.hireNew.push({ ...row });
    }

    for (const e of employees) {
      if (!inPeriod(e.dismissedAt) || !e.dismissedAt) continue;
      const row = rowFrom(e, e.dismissedAt, { note: e.dismissalReason?.name || '' });
      if (row) buckets.dismiss.push(row);
    }

    for (const doc of docs) {
      if (doc.type !== 'transfer' || !doc.employee || !inPeriod(doc.documentDate)) continue;
      const p = payloadOf(doc.payload);
      const hist =
        p.positionHistory && typeof p.positionHistory === 'object' && !Array.isArray(p.positionHistory)
          ? (p.positionHistory as Record<string, unknown>)
          : {};
      const fromDiv =
        str(hist, 'fromDivisionId') || str(p, 'oldDivisionId', 'previousDivisionId', 'fromDivisionId');
      const toDiv = str(hist, 'toDivisionId') || str(p, 'toDivisionId', 'divisionId') || doc.employee.divisionId || '';
      const fromPos = str(hist, 'fromPositionId') || str(p, 'fromPositionId', 'oldPositionId');
      const toPos = str(hist, 'toPositionId') || str(p, 'toPositionId', 'positionId') || doc.employee.positionId || '';
      const fromStaff = str(hist, 'fromStaffPositionId') || str(p, 'fromStaffPositionId');
      const toStaff =
        str(hist, 'toStaffPositionId') || str(p, 'toStaffPositionId', 'staffPositionId') || doc.employee.staffPositionId || '';
      if (fromDiv && toDiv && fromDiv === toDiv && fromPos === toPos) continue;
      const outRow = rowFrom(doc.employee, doc.documentDate, {
        divisionId: fromDiv || doc.employee.divisionId,
        positionId: fromPos || doc.employee.positionId,
        staffId: fromStaff || doc.employee.staffPositionId,
      });
      const inRow = rowFrom(doc.employee, doc.documentDate, {
        divisionId: toDiv || doc.employee.divisionId,
        positionId: toPos || doc.employee.positionId,
        staffId: toStaff,
      });
      if (outRow) buckets.transferOut.push(outRow);
      if (inRow) buckets.transferIn.push(inRow);
    }

    const headcount = employees.filter((e) => {
      const hiredOk = !e.hiredAt || e.hiredAt <= to;
      const dismissedOk = !e.dismissedAt || e.dismissedAt > to;
      if (!hiredOk || !dismissedOk) return false;
      return matches({
        employeeId: e.id,
        divisionId: e.divisionId,
        positionId: e.positionId,
        positionGroupId: e.position?.positionGroupId,
      });
    }).length;

    const titles: Record<string, string> = {
      hireNew: 'Принятые на работу (Новые)',
      hire: 'Принятые на работу',
      dismiss: 'Уволенные',
      transferIn: 'Перемещенные (Прибывшие)',
      transferOut: 'Перемещенные (Ушедшие)',
      rehired: 'Повторно принятые',
    };
    const periodLabel = `${iso(from).split('-').reverse().join('.')} - ${iso(toRaw).split('-').reverse().join('.')}`;
    const sortRows = (rows: MoveRow[]) => {
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee, 'ru'));
      return rows.map((r, i) => ({ ...r, n: i + 1 }));
    };

    const sections = kinds.map((kind) => ({
      kind,
      title: `${titles[kind]} в периоде ${periodLabel}`,
      extra: kind === 'rehired' ? 'dismissedAt' : 'note',
      extraLabel: kind === 'rehired' ? 'Дата увольнения' : 'Примечание',
      rows: sortRows(buckets[kind] || []),
    }));

    return {
      title: 'Отчет по движению сотрудников (штаты)',
      from: iso(from),
      to: iso(toRaw),
      generatedAt: new Date().toISOString(),
      headcount,
      sections,
    };
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
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const from = parseDateParam(opts.from, yearStart, 'from');
    const toRaw = parseDateParam(opts.to, new Date(), 'to');
    const to = new Date(toRaw);
    to.setHours(23, 59, 59, 999);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const selected = (opts.divisionIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const keyFilter =
      opts.keyEmployee === 'key' ? true : opts.keyEmployee === 'not-key' ? false : undefined;
    const basis =
      opts.basisType === 'positive' || opts.basisType === 'negative' ? opts.basisType : undefined;

    const [divisions, reasonRows, employees] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true },
      }),
      this.prisma.$queryRaw<
        { id: string; name: string; groupName: string | null; basisType: string | null }[]
      >`SELECT id, name, group_name AS "groupName", basis_type AS "basisType"
        FROM dismissal_reasons
        WHERE tenant_id = ${tenantId}::uuid`,
      this.prisma.employee.findMany({
        where: {
          tenantId,
          dismissedAt: { gte: from, lte: to },
          ...(keyFilter === undefined ? {} : { isKeyEmployee: keyFilter }),
        },
        select: { divisionId: true, dismissalReasonId: true },
      }),
    ]);
    const reasons = reasonRows.filter((r) => !basis || r.basisType === basis);

    let allowed: Set<string> | null = null;
    if (selected.length) {
      allowed = new Set();
      const kids = new Map<string, string[]>();
      for (const d of divisions) {
        if (!d.parentId) continue;
        const list = kids.get(d.parentId) || [];
        list.push(d.id);
        kids.set(d.parentId, list);
      }
      const walk = (id: string) => {
        if (allowed!.has(id)) return;
        allowed!.add(id);
        for (const c of kids.get(id) || []) walk(c);
      };
      for (const id of selected) walk(id);
    }

    const reasonMap = new Map(reasons.map((r) => [r.id, r]));
    const counts = new Map<string, number>();
    for (const e of employees) {
      if (allowed && (!e.divisionId || !allowed.has(e.divisionId))) continue;
      const rid = e.dismissalReasonId || '';
      if (basis && (!rid || !reasonMap.has(rid))) continue;
      counts.set(rid, (counts.get(rid) || 0) + 1);
    }

    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    const rows = [...counts.entries()].map(([id, count]) => {
      const r = id ? reasonMap.get(id) : undefined;
      return {
        reasonId: id || null,
        reason: r?.name || (id ? '—' : 'Нет информации'),
        group: r?.groupName || '',
        count,
        pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });
    rows.sort((a, b) => a.reason.localeCompare(b.reason, 'ru'));

    return {
      title: 'Отчет по причинам увольнения',
      from: iso(from),
      to: iso(toRaw),
      generatedAt: new Date().toISOString(),
      total,
      rows,
    };
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const asOfEnd = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const filterByDept = opts.filterByDept !== '0' && opts.filterByDept !== 'false';

    const fmtRu = (d?: Date | null) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return '';
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      return `${dd}.${mm}.${dt.getFullYear()}`;
    };
    const gradeLabel = (g?: { name?: string | null; code?: string | null } | null) =>
      (g?.name || g?.code || '').trim();
    const slotOf = (e: {
      position?: { name: string } | null;
      division?: { name: string } | null;
      staffPosition?: { title?: string | null; code?: string | null } | null;
    }) => {
      const title = (e.staffPosition?.title || '').trim();
      if (title.includes('/')) return title;
      const pos = e.position?.name || '';
      const div = e.division?.name || '';
      const code = (e.staffPosition?.code || '').replace(/^(XLS-|OCC-|GP-|SP-|EMP-)/i, '');
      if (pos && div && code) return `${pos}/${div}/(${code})`;
      if (pos && div) return `${pos}/${div}`;
      return title || pos;
    };

    const [divisions, employees] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true },
      }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
          ...(positionIds.length ? { positionId: { in: positionIds } } : {}),
          AND: [
            { OR: [{ hiredAt: null }, { hiredAt: { lte: asOfEnd } }] },
            {
              OR: [
                { dismissedAt: null, status: { not: 'dismissed' } },
                { dismissedAt: { gt: asOf } },
              ],
            },
          ],
        },
        include: {
          division: { select: { name: true } },
          position: { select: { name: true } },
          grade: { select: { name: true, code: true } },
          staffPosition: { select: { code: true, title: true } },
          gradeHistory: {
            where: { effectiveAt: { lte: asOfEnd } },
            orderBy: { effectiveAt: 'asc' },
            include: { grade: { select: { name: true, code: true } } },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (filterByDept && selectedDivisionIds.length) {
      allowed = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowed);
    }

    type Row = {
      n: number;
      employee: string;
      division: string;
      position: string;
      slot: string;
      prevDate: string;
      prevGrade: string;
      date: string;
      grade: string;
    };
    const rows: Row[] = [];
    for (const e of employees) {
      const divId = e.divisionId || '';
      if (allowed && (!divId || !allowed.has(divId))) continue;
      const hist = e.gradeHistory;
      const current = hist.length ? hist[hist.length - 1] : null;
      const prev = hist.length > 1 ? hist[hist.length - 2] : null;
      rows.push({
        n: 0,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: e.division?.name || '',
        position: e.position?.name || '',
        slot: slotOf(e),
        prevDate: prev ? fmtRu(prev.effectiveAt) : '',
        prevGrade: prev ? gradeLabel(prev.grade) : '',
        date: current ? fmtRu(current.effectiveAt) : '',
        grade: current ? gradeLabel(current.grade) : gradeLabel(e.grade),
      });
    }
    rows.forEach((r, i) => {
      r.n = i + 1;
    });

    const dd = String(asOf.getDate()).padStart(2, '0');
    const mm = String(asOf.getMonth() + 1).padStart(2, '0');
    const dateLabel = `${dd}.${mm}.${asOf.getFullYear()}`;
    return {
      title: 'Отчет по разрядам',
      date: `${asOf.getFullYear()}-${mm}-${dd}`,
      dateLabel,
      generatedAt: new Date().toISOString(),
      rows,
    };
  }

  async gradeChangeReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string; employeeIds?: string } = {},
  ) {
    const gte = parseDateParam(opts.from || '1990-01-01', new Date('1990-01-01T12:00:00'), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fromIso = iso(gte);
    const toIso = iso(lte);
    const selectedDiv = (opts.divisionIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selectedEmp = (opts.employeeIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [divisions, documents, promotions, gradeHist] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, name: true, parentId: true },
      }),
      this.prisma.hrDocument.findMany({
        where: {
          tenantId,
          status: 'posted',
          type: { in: ['hire', 'transfer'] },
          documentDate: { gte, lte },
          ...(selectedEmp.length ? { employeeId: { in: selectedEmp } } : {}),
        },
        include: {
          employee: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              divisionId: true,
              positionId: true,
              staffPositionId: true,
              gradeId: true,
              hiredAt: true,
            },
          },
        },
        orderBy: { documentDate: 'asc' },
      }),
      this.prisma.gradePromotionLine.findMany({
        where: {
          changeDate: { gte, lte },
          ...(selectedEmp.length ? { employeeId: { in: selectedEmp } } : {}),
          promotion: { tenantId, status: 'posted' },
        },
        include: {
          employee: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              divisionId: true,
              positionId: true,
              staffPositionId: true,
            },
          },
          toGrade: { select: { name: true, code: true } },
          staffPosition: {
            select: {
              code: true,
              title: true,
              divisionId: true,
              positionId: true,
              division: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.employeeGradeHistory.findMany({
        where: {
          tenantId,
          effectiveAt: { lte },
          ...(selectedEmp.length ? { employeeId: { in: selectedEmp } } : {}),
        },
        include: { grade: { select: { name: true, code: true } } },
        orderBy: { effectiveAt: 'asc' },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (selectedDiv.length) {
      allowed = new Set();
      for (const id of selectedDiv) walkIds(id, allowed);
    }

    const divName = new Map(divisions.map((d) => [d.id, d.name]));
    const staffIds = new Set<string>();
    const posIds = new Set<string>();
    const payloadOf = (raw: unknown) =>
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

    for (const doc of documents) {
      const p = payloadOf(doc.payload);
      if (typeof p.staffPositionId === 'string') staffIds.add(p.staffPositionId);
      if (typeof p.positionId === 'string') posIds.add(p.positionId);
      if (doc.employee.staffPositionId) staffIds.add(doc.employee.staffPositionId);
      if (doc.employee.positionId) posIds.add(doc.employee.positionId);
    }
    for (const line of promotions) {
      if (line.staffPositionId) staffIds.add(line.staffPositionId);
      if (line.employee.staffPositionId) staffIds.add(line.employee.staffPositionId);
      if (line.employee.positionId) posIds.add(line.employee.positionId);
    }

    const [staffRows, posRows] = await Promise.all([
      staffIds.size
        ? this.prisma.staffPosition.findMany({
            where: { tenantId, id: { in: [...staffIds] } },
            select: {
              id: true,
              code: true,
              title: true,
              divisionId: true,
              positionId: true,
              gradeId: true,
              division: { select: { name: true } },
              position: { select: { name: true } },
              grade: { select: { name: true, code: true } },
            },
          })
        : Promise.resolve([]),
      posIds.size
        ? this.prisma.position.findMany({
            where: { tenantId, id: { in: [...posIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const staffById = new Map(staffRows.map((s) => [s.id, s]));
    const posById = new Map(posRows.map((p) => [p.id, p.name]));

    const empName = (e: { lastName: string; firstName: string; middleName?: string | null }) =>
      [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

    const gradeAt = (employeeId: string, on: Date) => {
      let found = '';
      for (const h of gradeHist) {
        if (h.employeeId !== employeeId) continue;
        if (h.effectiveAt.getTime() <= on.getTime()) found = h.grade?.name || '';
      }
      return found;
    };

    const slotOf = (optsSlot: {
      staffId?: string | null;
      positionId?: string | null;
      divisionId?: string | null;
    }) => {
      const staff = optsSlot.staffId ? staffById.get(optsSlot.staffId) : undefined;
      const position = staff?.position?.name || (optsSlot.positionId ? posById.get(optsSlot.positionId) : '') || staff?.title || '';
      const division =
        staff?.division?.name || (optsSlot.divisionId ? divName.get(optsSlot.divisionId) : '') || '';
      const code = staff?.code || '';
      if (position && division && code) return `${position}/${division}/(${code})`;
      if (position && division) return `${position}/${division}`;
      return position || division || '—';
    };

    type Line = {
      date: string;
      sort: number;
      divisionId: string;
      division: string;
      position: string;
      slot: string;
      source: string;
      grade: string;
    };
    const byEmp = new Map<
      string,
      { employeeId: string; employee: string; lines: Line[] }
    >();

    const push = (
      employeeId: string,
      employee: string,
      line: Line,
    ) => {
      if (allowed && line.divisionId && !allowed.has(line.divisionId)) return;
      if (allowed && !line.divisionId) return;
      const g = byEmp.get(employeeId) || { employeeId, employee, lines: [] };
      g.lines.push(line);
      byEmp.set(employeeId, g);
    };

    for (const doc of documents) {
      const p = payloadOf(doc.payload);
      const staffId =
        (typeof p.staffPositionId === 'string' && p.staffPositionId) || doc.employee.staffPositionId || '';
      const positionId =
        (typeof p.positionId === 'string' && p.positionId) || doc.employee.positionId || '';
      const divisionId =
        (typeof p.divisionId === 'string' && p.divisionId) || doc.employee.divisionId || '';
      const staff = staffId ? staffById.get(staffId) : undefined;
      const position =
        staff?.position?.name || (positionId ? posById.get(positionId) : '') || staff?.title || '—';
      const division = staff?.division?.name || (divisionId ? divName.get(divisionId) : '') || '—';
      const gradeFromPayload =
        staff?.grade?.name ||
        gradeAt(doc.employeeId, doc.documentDate) ||
        '';
      push(doc.employeeId, empName(doc.employee), {
        date: iso(doc.documentDate),
        sort: doc.documentDate.getTime(),
        divisionId: staff?.divisionId || divisionId,
        division,
        position,
        slot: slotOf({ staffId, positionId, divisionId }),
        source: doc.type === 'hire' ? 'Прием на работу' : 'Кадровый перевод',
        grade: gradeFromPayload,
      });
    }

    for (const line of promotions) {
      const staffId = line.staffPositionId || line.employee.staffPositionId || '';
      const positionId = line.staffPosition?.positionId || line.employee.positionId || '';
      const divisionId =
        line.staffPosition?.divisionId || line.employee.divisionId || '';
      const on = line.changeDate || new Date();
      const staff = staffId ? staffById.get(staffId) : undefined;
      const position =
        line.staffPosition?.position?.name ||
        staff?.position?.name ||
        (positionId ? posById.get(positionId) : '') ||
        line.staffPosition?.title ||
        staff?.title ||
        '—';
      const division =
        line.staffPosition?.division?.name ||
        staff?.division?.name ||
        (divisionId ? divName.get(divisionId) : '') ||
        '—';
      push(line.employeeId, empName(line.employee), {
        date: iso(on),
        sort: on.getTime(),
        divisionId: staff?.divisionId || divisionId,
        division,
        position,
        slot: slotOf({ staffId, positionId, divisionId }),
        source: 'Повышение разряда',
        grade: line.toGrade?.name || '',
      });
    }

    const groups = [...byEmp.values()]
      .map((g) => {
        const lines = g.lines
          .sort((a, b) => a.sort - b.sort || a.source.localeCompare(b.source, 'ru'))
          .map((l) => ({
            date: l.date,
            division: l.division,
            position: l.position,
            slot: l.slot,
            source: l.source,
            grade: l.grade,
          }));
        return { employeeId: g.employeeId, employee: g.employee, lines };
      })
      .filter((g) => g.lines.length)
      .sort((a, b) => a.employee.localeCompare(b.employee, 'ru'));

    return {
      title: 'Отчет по изменению разрядов',
      from: fromIso,
      to: toIso,
      generatedAt: new Date().toISOString(),
      groups,
      rows: groups.flatMap((g) =>
        g.lines.map((l, i) => ({
          employee: i === 0 ? g.employee : '',
          ...l,
        })),
      ),
    };
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const asOfEnd = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const divisionGroupIds = ids(opts.divisionGroupIds);
    const divisionIds = ids(opts.divisionIds);
    const positionGroupIds = ids(opts.positionGroupIds);
    const positionIds = ids(opts.positionIds);
    const staffGroups = ids(opts.staffGroups);

    const where: Prisma.StaffPositionWhereInput = {
      tenantId,
      isActive: true,
      status: 'vacant',
      AND: [
        { OR: [{ openedAt: null }, { openedAt: { lte: asOfEnd } }] },
        { OR: [{ closedAt: null }, { closedAt: { gt: asOf } }] },
      ],
    };
    if (divisionIds.length) where.divisionId = { in: divisionIds };
    if (positionIds.length) where.positionId = { in: positionIds };
    if (staffGroups.length) where.groupName = { in: staffGroups };
    if (divisionGroupIds.length) {
      where.division = { is: { divisionGroupId: { in: divisionGroupIds } } };
    }
    if (positionGroupIds.length) {
      where.position = { is: { positionGroupId: { in: positionGroupIds } } };
    }

    const positions = await this.prisma.staffPosition.findMany({
      where,
      include: {
        division: { include: { divisionGroup: true, parent: { select: { name: true } } } },
        position: { include: { positionGroup: true } },
      },
      orderBy: [{ openedAt: 'asc' }, { code: 'asc' }],
    });

    const ymd = (d?: Date | null) => {
      if (!d) return '';
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const asOfYmd = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;

    const rows = positions.map((sp, i) => ({
      n: i + 1,
      positionId: sp.code,
      divisionGroup: sp.division?.divisionGroup?.name || '',
      division: sp.division?.name || '',
      department: '',
      positionGroup: sp.position?.positionGroup?.name || '',
      position: sp.position?.name || '',
      staffGroup: sp.groupName || '',
      title: sp.title,
      vacantFrom: ymd(sp.openedAt),
    }));

    return {
      title: 'Отчет по вакантным позициям',
      date: asOfYmd,
      generatedAt: new Date().toISOString(),
      rows,
    };
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
    const from = opts.from
      ? parseDateParam(opts.from, startOfCurrentMonth(), 'from')
      : startOfCurrentMonth();
    const toRaw = opts.to ? parseDateParam(opts.to, new Date(), 'to') : new Date();
    const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
    const positionIds = (opts.positionIds || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const personType = (opts.personType || '').trim();
    const employmentSource = (opts.employmentSource || '').trim();
    const genderRaw = (opts.gender || '').trim().toLowerCase();

    const rows = await this.prisma.candidate.findMany({
      where: { tenantId },
      include: { staffPosition: { select: { id: true, title: true, code: true } } },
      orderBy: [{ introducedAt: 'asc' }, { createdAt: 'asc' }, { fullName: 'asc' }],
    });

    const genderOf = (raw?: string | null) => {
      const g = (raw || '').trim().toLowerCase();
      if (['m', 'male', 'муж', 'мужской', 'м'].includes(g)) return 'male';
      if (['f', 'female', 'жен', 'женский', 'ж'].includes(g)) return 'female';
      return '';
    };

    const ymd = (d?: Date | null) => {
      if (!d) return '';
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const inRange = (c: (typeof rows)[number]) => {
      const d = c.introducedAt || c.createdAt;
      return d >= from && d <= to;
    };

    const filtered = rows.filter((c) => {
      if (!inRange(c)) return false;
      if (personType && (c.personType || '') !== personType) return false;
      if (employmentSource && (c.employmentSource || '') !== employmentSource) return false;
      if (genderRaw && genderRaw !== 'all') {
        const g = genderOf(c.gender);
        if (genderRaw === 'male' && g !== 'male') return false;
        if (genderRaw === 'female' && g !== 'female') return false;
      }
      if (positionIds.length) {
        const title = (c.positionName || c.staffPosition?.title || '').toLowerCase();
        const code = (c.staffPosition?.code || '').toLowerCase();
        const id = c.staffPositionId || '';
        const hit = positionIds.some((p) => {
          const q = p.toLowerCase();
          return id === p || title === q || code === q || title.includes(q);
        });
        if (!hit) return false;
      }
      return true;
    });

    let n = 0;
    let prevKey = '';
    const out = filtered.map((c) => {
      const key = `${c.fullName}|${c.phone || ''}`;
      if (key !== prevKey) {
        n += 1;
        prevKey = key;
      }
      const genderLabel =
        genderOf(c.gender) === 'male' ? 'Мужской' : genderOf(c.gender) === 'female' ? 'Женский' : c.gender || '';
      return {
        n,
        introducedAt: ymd(c.introducedAt || c.createdAt),
        fullName: c.fullName,
        category: c.category || '',
        education: c.education || '',
        employmentSource: c.employmentSource || '',
        birthDate: ymd(c.birthDate),
        gender: genderLabel,
        languages: c.languages || '',
        position: c.positionName || c.staffPosition?.title || '',
        phone: c.phone || '',
      };
    });

    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return {
      title: 'Отчет по кандидатам',
      from: iso(from),
      to: iso(toRaw),
      generatedAt: new Date().toISOString(),
      rows: out,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const yearsFrom =
      opts.yearsFrom != null && opts.yearsFrom !== '' && Number.isFinite(Number(opts.yearsFrom))
        ? Number(opts.yearsFrom)
        : null;
    const yearsTo =
      opts.yearsTo != null && opts.yearsTo !== '' && Number.isFinite(Number(opts.yearsTo))
        ? Number(opts.yearsTo)
        : null;
    type Rule = { from?: number | string; to?: number | string; accrualIds?: string[] };
    let rules: Rule[] = [];
    if (opts.rules?.trim()) {
      try {
        const parsed = JSON.parse(opts.rules) as unknown;
        if (Array.isArray(parsed)) rules = parsed as Rule[];
      } catch {
        rules = [];
      }
    }

    const asOf = new Date();
    const tenureParts = (hired?: Date | null) => {
      if (!hired) return { years: 0, months: 0, label: '0 г. 0 мес.' };
      let months =
        (asOf.getFullYear() - hired.getFullYear()) * 12 + (asOf.getMonth() - hired.getMonth());
      if (asOf.getDate() < hired.getDate()) months -= 1;
      months = Math.max(0, months);
      const years = Math.floor(months / 12);
      const rest = months % 12;
      return { years, months: rest, label: `${years} г. ${rest} мес.` };
    };

    const [divisions, employees, accrualTypes] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true },
      }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
          ...(positionIds.length ? { positionId: { in: positionIds } } : {}),
          AND: [
            { OR: [{ hiredAt: null }, { hiredAt: { lte: asOf } }] },
            {
              OR: [
                { dismissedAt: null, status: { not: 'dismissed' } },
                { dismissedAt: { gt: asOf } },
              ],
            },
          ],
        },
        include: {
          division: { select: { name: true } },
          position: { select: { name: true } },
          staffPosition: { select: { accruals: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.accrualType.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowed = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowed);
    }

    const accById = new Map(accrualTypes.map((a) => [a.id, a]));
    const matchRule = (years: number): Rule | null => {
      for (const r of rules) {
        const from = r.from === '' || r.from == null ? null : Number(r.from);
        const to = r.to === '' || r.to == null ? null : Number(r.to);
        if (from != null && Number.isFinite(from) && years < from) continue;
        if (to != null && Number.isFinite(to) && years > to) continue;
        if (from == null && to == null && !(r.accrualIds || []).length) continue;
        return r;
      }
      return null;
    };

    const rows: {
      n: number;
      employee: string;
      division: string;
      position: string;
      tenure: string;
      years: number;
      accrualsMatch: string;
    }[] = [];

    for (const e of employees) {
      const divId = e.divisionId || '';
      if (allowed && (!divId || !allowed.has(divId))) continue;
      const t = tenureParts(e.hiredAt);
      if (yearsFrom != null && t.years < yearsFrom) continue;
      if (yearsTo != null && t.years > yearsTo) continue;
      const rule = matchRule(t.years);
      const want = (rule?.accrualIds || []).filter(Boolean);
      let accrualsMatch = '';
      if (want.length) {
        const assigned = new Set<string>();
        const raw = e.staffPosition?.accruals;
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const o = item as { name?: string; id?: string; accrualTypeId?: string };
            if (o.id) assigned.add(o.id);
            if (o.accrualTypeId) assigned.add(o.accrualTypeId);
            const name = (o.name || '').trim().toLowerCase();
            if (name) assigned.add(name);
          }
        }
        const ok = want.every((id) => {
          if (assigned.has(id)) return true;
          const acc = accById.get(id);
          if (!acc) return false;
          return (
            assigned.has(acc.name.toLowerCase()) || assigned.has(acc.code.toLowerCase())
          );
        });
        accrualsMatch = ok ? 'Да' : 'Нет';
      }
      rows.push({
        n: 0,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: e.division?.name || '',
        position: e.position?.name || '',
        tenure: t.label,
        years: t.years,
        accrualsMatch,
      });
    }
    rows.forEach((r, i) => {
      r.n = i + 1;
    });

    return {
      title: 'Отчет по стажам',
      generatedAt: new Date().toISOString(),
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const relationKeys = ids(opts.relations).map((x) => x.toLowerCase());
    const genderRaw = (opts.gender || 'all').trim().toLowerCase();
    const ageFrom =
      opts.ageFrom != null && opts.ageFrom !== '' && Number.isFinite(Number(opts.ageFrom))
        ? Number(opts.ageFrom)
        : null;
    const ageTo =
      opts.ageTo != null && opts.ageTo !== '' && Number.isFinite(Number(opts.ageTo))
        ? Number(opts.ageTo)
        : null;
    const showHidden =
      opts.showHidden === true ||
      opts.showHidden === '1' ||
      opts.showHidden === 'true';
    const asOf = opts.date ? parseDateParam(opts.date, new Date(), 'date') : new Date();

    const genderOf = (raw?: string | null): 'male' | 'female' | '' => {
      const g = (raw || '').trim().toLowerCase();
      if (['m', 'male', 'муж', 'мужской', 'м'].includes(g)) return 'male';
      if (['f', 'female', 'жен', 'женский', 'ж'].includes(g)) return 'female';
      return '';
    };
    const genderLabel = (raw?: string | null) => {
      const g = genderOf(raw);
      if (g === 'male') return 'Мужской';
      if (g === 'female') return 'Женский';
      return (raw || '').trim();
    };
    const relationLabel = (raw: string) => {
      const map: Record<string, string> = {
        spouse: 'Супруг(а)',
        husband: 'Муж',
        wife: 'Жена',
        father: 'Отец',
        mother: 'Мать',
        son: 'Сын',
        daughter: 'Дочь',
        brother: 'Брат',
        sister: 'Сестра',
        child: 'Ребёнок',
        parent: 'Родитель',
      };
      return map[raw.trim().toLowerCase()] || raw;
    };
    const ageYears = (birth?: Date | null) => {
      if (!birth) return null;
      let age = asOf.getFullYear() - birth.getFullYear();
      const m = asOf.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && asOf.getDate() < birth.getDate())) age -= 1;
      return age;
    };
    const ymd = (d?: Date | null) => {
      if (!d) return '';
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${day}.${mo}.${y}`;
    };
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ruDate = (d: Date) => {
      const [y, m, day] = iso(d).split('-');
      return `${day}.${m}.${y}`;
    };

    const [divisions, kinship] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true },
      }),
      this.prisma.dictionary.findFirst({
        where: { tenantId, code: 'kinship' },
        include: { items: { where: { isActive: true } } },
      }),
    ]);
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowed = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowed);
    }

    const relationAliases = new Set<string>();
    if (relationKeys.length) {
      for (const key of relationKeys) {
        relationAliases.add(key);
        const item = (kinship?.items || []).find(
          (i) => i.id.toLowerCase() === key || i.code.toLowerCase() === key || i.name.toLowerCase() === key,
        );
        if (item) {
          relationAliases.add(item.code.toLowerCase());
          relationAliases.add(item.name.toLowerCase());
        }
      }
    }

    type RelRow = {
      id: string;
      employee_id: string;
      full_name: string;
      relation: string;
      birth_date: Date | null;
      gender: string | null;
      workplace: string | null;
      dependent: boolean;
      is_hidden: boolean;
      created_at: Date;
    };
    const rawRels = await this.prisma.$queryRaw<RelRow[]>`
      SELECT id, employee_id, full_name, relation, birth_date, gender, workplace, dependent, is_hidden, created_at
      FROM employee_relatives
      WHERE tenant_id = ${tenantId}::uuid
    `;
    const empIds = [...new Set(rawRels.map((r) => r.employee_id))];
    const employees = empIds.length
      ? await this.prisma.employee.findMany({
          where: { tenantId, id: { in: empIds } },
          select: {
            id: true,
            tabNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
            status: true,
            divisionId: true,
            positionId: true,
            division: { select: { name: true } },
            position: { select: { name: true } },
          },
        })
      : [];
    const empById = new Map(employees.map((e) => [e.id, e]));
    const relatives = rawRels
      .map((r) => ({
        id: r.id,
        employeeId: r.employee_id,
        fullName: r.full_name,
        relation: r.relation,
        birthDate: r.birth_date,
        gender: r.gender,
        workplace: r.workplace,
        dependent: Boolean(r.dependent),
        isHidden: Boolean(r.is_hidden),
        createdAt: r.created_at,
        employee: empById.get(r.employee_id) || null,
      }))
      .sort((a, b) => {
        const an = [a.employee?.lastName, a.employee?.firstName].filter(Boolean).join(' ');
        const bn = [b.employee?.lastName, b.employee?.firstName].filter(Boolean).join(' ');
        return an.localeCompare(bn, 'ru') || a.createdAt.getTime() - b.createdAt.getTime();
      });

    type OutRow = {
      n: number;
      employee: string;
      relativesCount: number | '';
      relation: string;
      relativeName: string;
      gender: string;
      age: number | null;
      birthDate: string;
      workplace: string;
      dependent: string;
    };
    const grouped = new Map<string, typeof relatives>();
    for (const rel of relatives) {
      if (!showHidden && rel.isHidden) continue;
      if (employeeIds.length && !employeeIds.includes(rel.employeeId)) continue;
      const emp = rel.employee;
      if (!emp) continue;
      if (allowed && (!emp.divisionId || !allowed.has(emp.divisionId))) continue;
      if (positionIds.length && (!emp.positionId || !positionIds.includes(emp.positionId))) continue;
      if (!showHidden && emp.status && emp.status !== 'active') continue;
      const relName = relationLabel(rel.relation);
      if (relationAliases.size) {
        const keys = [rel.relation, relName].map((x) => x.toLowerCase());
        if (!keys.some((k) => relationAliases.has(k))) continue;
      }
      const g = genderOf(rel.gender);
      if (genderRaw === 'male' && g !== 'male') continue;
      if (genderRaw === 'female' && g !== 'female') continue;
      const age = ageYears(rel.birthDate);
      if (ageFrom != null && (age == null || age < ageFrom)) continue;
      if (ageTo != null && (age == null || age > ageTo)) continue;
      const list = grouped.get(emp.id) || [];
      list.push(rel);
      grouped.set(emp.id, list);
    }

    const rows: OutRow[] = [];
    let n = 0;
    for (const list of grouped.values()) {
      const first = list[0];
      if (!first?.employee) continue;
      const emp = first.employee;
      const employee = [emp.lastName, emp.firstName, emp.middleName]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      list.forEach((rel, i) => {
        n += 1;
        rows.push({
          n,
          employee,
          relativesCount: i === 0 ? list.length : '',
          relation: relationLabel(rel.relation),
          relativeName: rel.fullName,
          gender: genderLabel(rel.gender),
          age: ageYears(rel.birthDate),
          birthDate: ymd(rel.birthDate),
          workplace: rel.workplace || '',
          dependent: rel.dependent ? 'Да' : '',
        });
      });
    }

    const genderFilterLabel =
      genderRaw === 'male' ? 'Мужской' : genderRaw === 'female' ? 'Женский' : '';

    return {
      title: 'Сотрудники и их родственники',
      date: iso(asOf),
      dateLabel: ruDate(asOf),
      gender: genderFilterLabel,
      generatedAt: new Date().toISOString(),
      totalRelatives: rows.length,
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const withoutAccess =
      opts.withoutAccess === true ||
      opts.withoutAccess === '1' ||
      opts.withoutAccess === 'true';

    const [divisions, employees, grants] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true, name: true, managerId: true },
      }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          ...(employeeIds.length ? { id: { in: employeeIds } } : { status: 'active' }),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          divisionId: true,
          positionId: true,
          position: { select: { id: true, name: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.employeeAccessGrant.findMany({
        where: { tenantId, isActive: true },
        select: { employeeId: true, accessType: true, resource: true },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowed = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowed);
    }

    const divById = new Map(divisions.map((d) => [d.id, d]));
    const managedBy = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.managerId) continue;
      const list = managedBy.get(d.managerId) || [];
      list.push(d.name);
      managedBy.set(d.managerId, list);
    }

    const grantsByEmp = new Map<string, typeof grants>();
    for (const g of grants) {
      const list = grantsByEmp.get(g.employeeId) || [];
      list.push(g);
      grantsByEmp.set(g.employeeId, list);
    }

    const resolveDivName = (resource: string) => {
      const byId = divById.get(resource);
      if (byId) return byId.name;
      const byName = divisions.find((d) => d.name.toLowerCase() === resource.toLowerCase());
      return byName?.name || resource;
    };

    type OutRow = {
      employee: string;
      fullAccess: string;
      userAccess: string;
      subordinate: string;
      kpeFull: string;
    };
    const rows: OutRow[] = [];
    const posNeedles = positionIds.map((x) => x.toLowerCase());

    for (const e of employees) {
      if (allowed && (!e.divisionId || !allowed.has(e.divisionId))) continue;
      if (posNeedles.length) {
        const pid = (e.positionId || '').toLowerCase();
        const pname = (e.position?.name || '').toLowerCase();
        const hit = posNeedles.some(
          (p) => p === pid || p === pname || (!!pname && (pname.includes(p) || p.includes(pname))),
        );
        if (!hit) continue;
      }
      const empGrants = grantsByEmp.get(e.id) || [];
      const fullAccess = empGrants.some((g) => g.accessType === 'org_full') ? 'Да' : 'Нет';
      const kpeFull = empGrants.some((g) => g.accessType === 'kpe_full') ? 'Да' : 'Нет';
      const custom = empGrants
        .filter((g) => g.accessType === 'org_custom')
        .map((g) => resolveDivName(g.resource))
        .filter(Boolean);
      const fromGrants = empGrants
        .filter((g) => g.accessType === 'org_subordinate')
        .map((g) => resolveDivName(g.resource))
        .filter(Boolean);
      const fromManager = managedBy.get(e.id) || [];
      const subordinates = [...new Set([...fromGrants, ...fromManager])];
      const hasAccess = fullAccess === 'Да' || custom.length > 0 || subordinates.length > 0;
      if (!hasAccess && !withoutAccess) continue;

      const name = [e.lastName, e.firstName, e.middleName]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      if (!subordinates.length) {
        rows.push({
          employee: name,
          fullAccess,
          userAccess: custom.join(', '),
          subordinate: '',
          kpeFull,
        });
        continue;
      }
      subordinates.forEach((div, i) => {
        rows.push({
          employee: i === 0 ? name : '',
          fullAccess: i === 0 ? fullAccess : '',
          userAccess: i === 0 ? custom.join(', ') : '',
          subordinate: div,
          kpeFull: i === 0 ? kpeFull : '',
        });
      });
    }

    return {
      title: 'Отчет по доступам сотрудников',
      generatedAt: new Date().toISOString(),
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    type DistCfg = { useTimeLimit?: boolean; timeSec?: number; useDistLimit?: boolean; distM?: number };
    let cfg: DistCfg = {};
    try {
      cfg = opts.cfg ? (JSON.parse(opts.cfg) as DistCfg) : {};
    } catch {
      cfg = {};
    }
    const maxGapSec = cfg.useTimeLimit ? Number(cfg.timeSec) || 300 : 0;
    const minStepM = cfg.useDistLimit ? Number(cfg.distM) || 50 : 0;

    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ruDay = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
      const R = 6371000;
      const toRad = (n: number) => (n * Math.PI) / 180;
      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const km2 = (m: number) => Math.round((m / 1000) * 100) / 100;

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowedDiv = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        position: { select: { name: true } },
        grade: { select: { name: true } },
        division: {
          select: {
            name: true,
            locationId: true,
            location: { select: { id: true, name: true, latitude: true, longitude: true, geoRadiusM: true } },
            manager: { select: { lastName: true, firstName: true, middleName: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      return true;
    });

    const empIds = filtered.map((e) => e.id);
    const points = empIds.length
      ? await this.prisma.gpsTrackPoint.findMany({
          where: { tenantId, employeeId: { in: empIds }, recordedAt: { gte, lte } },
          orderBy: [{ employeeId: 'asc' }, { recordedAt: 'asc' }],
          select: { employeeId: true, latitude: true, longitude: true, recordedAt: true },
        })
      : [];
    const ptsByEmp = new Map<string, typeof points>();
    for (const p of points) {
      const list = ptsByEmp.get(p.employeeId) || [];
      list.push(p);
      ptsByEmp.set(p.employeeId, list);
    }

    const rows = filtered.map((e, i) => {
      const loc = e.division?.location;
      const attached = loc && loc.latitude != null && loc.longitude != null
        ? [{ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, radius: loc.geoRadiusM || 150 }]
        : [];
      const inside = (p: { latitude: number; longitude: number }) =>
        attached.filter((a) => haversine(p, a) <= a.radius);
      let attachedM = 0;
      let otherM = 0;
      const used = new Set<string>();
      const list = ptsByEmp.get(e.id) || [];
      for (let k = 1; k < list.length; k += 1) {
        const a = list[k - 1];
        const b = list[k];
        const dt = (b.recordedAt.getTime() - a.recordedAt.getTime()) / 1000;
        if (maxGapSec > 0 && dt > maxGapSec) continue;
        const meters = haversine(a, b);
        if (minStepM > 0 && meters < minStepM) continue;
        const hit = [...inside(a), ...inside(b)];
        if (hit.length) {
          attachedM += meters;
          for (const h of hit) used.add(h.name);
        } else {
          otherM += meters;
        }
      }
      const attachedKm = km2(attachedM);
      const otherKm = km2(otherM);
      return {
        n: i + 1,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        tabNumber: e.tabNumber || '',
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        grade: e.grade?.name || '',
        manager: [e.division?.manager?.lastName, e.division?.manager?.firstName, e.division?.manager?.middleName]
          .filter(Boolean)
          .join(' ')
          .toUpperCase(),
        totalKm: km2(attachedM + otherM),
        attachedKm,
        attachedLocations: [...used].join(', '),
        otherKm,
        otherLocations: otherKm > 0 ? 'Прочие' : '',
      };
    });

    return {
      title: 'Отчет по пройденному расстоянию',
      generatedAt: new Date().toISOString(),
      from: iso(gte),
      to: iso(lte),
      periodLine: `С ${ruDay(gte)} по ${ruDay(lte)}`,
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const normHm = (s: string, fallback: string) => {
      const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
      return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : fallback;
    };
    let startTime = normHm(opts.startTime || '', '08:00');
    let endTime = normHm(opts.endTime || '', '20:00');
    let showEmpty = false;
    if (opts.cfg) {
      try {
        const parsed = JSON.parse(opts.cfg) as {
          startTime?: string;
          endTime?: string;
          showEmpty?: boolean;
        };
        if (parsed.startTime) startTime = normHm(parsed.startTime, startTime);
        if (parsed.endTime) endTime = normHm(parsed.endTime, endTime);
        showEmpty = !!parsed.showEmpty;
      } catch {
        /* ignore */
      }
    }

    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const hm = (d?: Date | null) => {
      if (!d) return '';
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const planHoursOf = (start: string, end: string) => {
      let d = toMin(end) - toMin(start);
      if (d < 0) d += 24 * 60;
      if (d >= 8 * 60) d -= 60;
      return r2(d / 60);
    };

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, name: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        position: { select: { name: true } },
        schedule: { select: { startTime: true, endTime: true, settings: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) {
          return false;
        }
      }
      return true;
    });

    const dayList: string[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      dayList.push(isoLocal(cur));
      if (dayList.length > 366) break;
    }

    const empIds = filtered.map((e) => e.id);
    const [days, marks] = await Promise.all([
      empIds.length
        ? this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              status: true,
              firstInAt: true,
              lastOutAt: true,
              plannedHours: true,
              workedHours: true,
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.attendanceMark.findMany({
            where: { tenantId, employeeId: { in: empIds }, occurredAt: { gte, lte } },
            select: { employeeId: true, occurredAt: true, direction: true },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const recByEmpDay = new Map<string, (typeof days)[number]>();
    for (const d of days) {
      recByEmpDay.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recByEmpDay.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }
    const marksByEmpDay = new Map<string, typeof marks>();
    for (const m of marks) {
      if (!m.employeeId) continue;
      const key = `${m.employeeId}|${isoLocal(m.occurredAt)}`;
      const list = marksByEmpDay.get(key) || [];
      list.push(m);
      marksByEmpDay.set(key, list);
    }

    const winStart = toMin(startTime);
    const winEnd = toMin(endTime);
    const rows: {
      date: string;
      dateLabel: string;
      employeeId: string;
      tabNumber: string;
      employee: string;
      shiftType: string;
      planIn: string;
      planOut: string;
      planHours: string;
      factIn: string;
      factOut: string;
      factHours: string;
      marksIn: string[];
      marksOut: string[];
      dateWarn: boolean;
    }[] = [];

    for (const e of filtered) {
      const sch = e.schedule;
      const parsed = parseScheduleSettings(sch?.settings);
      const planInDef = sch?.startTime || '09:00';
      const planOutDef = sch?.endTime || '18:00';
      for (const ymd of dayList) {
        const day = parseYmd(ymd);
        const rec = recByEmpDay.get(`${e.id}|${ymd}`);
        const empMarks = marksByEmpDay.get(`${e.id}|${ymd}`) || [];
        const dayOff =
          isDayOffByPattern(day, parsed.weekPattern || '6/1') || rec?.status === DayStatus.day_off;
        const firstIn = rec?.firstInAt || empMarks.find((m) => m.direction !== 'OUT')?.occurredAt || empMarks[0]?.occurredAt;
        const lastOut =
          rec?.lastOutAt ||
          [...empMarks].reverse().find((m) => m.direction === 'OUT')?.occurredAt ||
          null;
        const hasMarks = empMarks.length > 0 || !!rec?.firstInAt;
        if (!hasMarks && !showEmpty) continue;

        const firstMin = firstIn ? firstIn.getHours() * 60 + firstIn.getMinutes() : null;
        const night = firstMin != null && (firstMin < winStart || firstMin > winEnd);
        const shiftType = night || (dayOff && hasMarks) ? 'Ночь' : 'День';
        const dateWarn = !!(hasMarks && (dayOff || night));

        const marksIn = empMarks.filter((m) => m.direction !== 'OUT').map((m) => hm(m.occurredAt));
        const marksOut = empMarks.filter((m) => m.direction === 'OUT').map((m) => hm(m.occurredAt));
        if (!marksIn.length && firstIn) marksIn.push(hm(firstIn));
        if (!marksOut.length && lastOut) marksOut.push(hm(lastOut));

        let factH = '';
        if (firstIn && lastOut && lastOut.getTime() > firstIn.getTime()) {
          factH = String(r2((lastOut.getTime() - firstIn.getTime()) / 3_600_000));
        }

        rows.push({
          date: ymd,
          dateLabel: `${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}`,
          employeeId: e.id,
          tabNumber: e.tabNumber || '',
          employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
          shiftType,
          planIn: dayOff ? 'В' : planInDef,
          planOut: dayOff ? 'В' : planOutDef,
          planHours: dayOff
            ? 'В'
            : String(rec?.plannedHours != null ? r2(Number(rec.plannedHours)) : parsed.dayNormHours ?? planHoursOf(planInDef, planOutDef)),
          factIn: firstIn ? hm(firstIn) : '',
          factOut: lastOut ? hm(lastOut) : '',
          factHours: factH,
          marksIn: marksIn.length ? marksIn : hasMarks ? ['--'] : [],
          marksOut: marksOut.length ? marksOut : hasMarks ? ['--'] : [],
          dateWarn,
        });
      }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee, 'ru'));

    return {
      title: 'Отчет посещений сотрудников по сменам',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      startTime,
      endTime,
      periodLine: `Период: ${pad(parseYmd(fromIso).getDate())} ${months[parseYmd(fromIso).getMonth()]} ${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())} ${months[parseYmd(toIso).getMonth()]} ${parseYmd(toIso).getFullYear()}`,
      warnLine:
        'Если дата отметки отображается предупреждающим цветом, это означает, что день отметки отличается от рабочего дня сотрудника.',
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    type Cfg = {
      timeTypeIds?: string[];
      showLetter?: boolean;
      warningLimit?: number | string;
      useShiftMode?: boolean;
      shiftIds?: string[];
    };
    let cfg: Cfg = {};
    try {
      cfg = opts.cfg ? (JSON.parse(opts.cfg) as Cfg) : {};
    } catch {
      cfg = {};
    }
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const locationIds = ids(opts.locationIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const spanH = (a?: string | null, b?: string | null) => {
      if (!a || !b) return null;
      let d = toMin(b) - toMin(a);
      if (d < 0) d += 24 * 60;
      return r2(d / 60);
    };

    const catalog = await this.prisma.timeType.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, letterCode: true, color: true, parentId: true },
    });
    const workSynth = {
      id: 'work',
      code: 'WORK',
      name: 'Явка',
      letterCode: 'Я',
      color: '#3699FF',
      parentId: null as string | null,
    };
    const hasWork = catalog.some(
      (t) =>
        t.code.toUpperCase() === 'WORK' ||
        t.code.toUpperCase() === 'YAVKA' ||
        (t.letterCode || '').toUpperCase() === 'Я' ||
        t.name.toLowerCase().includes('явк'),
    );
    const allTypes = hasWork ? catalog : [workSynth, ...catalog];
    const pick = (...needles: string[]) =>
      allTypes.find((t) =>
        needles.some((n) => {
          const q = n.toLowerCase();
          return (
            t.id === n ||
            t.code.toLowerCase() === q ||
            (t.letterCode || '').toLowerCase() === q ||
            t.name.toLowerCase().includes(q)
          );
        }),
      );
    const workType = pick('WORK', 'YAVKA', 'Я', 'явк') || workSynth;
    const dayOffType = pick('DAYOFF', 'В', 'выходн');
    const leaveType = pick('LEAVE', 'О', 'отпуск');
    const sickType = pick('SICK', 'Б', 'больнич');
    const tripType = pick('TRIP', 'К', 'командир');
    const holidayType = pick('HOLIDAY', 'П', 'праздн');
    const absentType = pick('ABSENT', 'NOSHOW', 'НН', 'Н', 'неявк', 'прогул');
    const wanted = new Set((cfg.timeTypeIds || []).filter(Boolean));
    const wantedHit = (t: { id: string; code: string; name: string }) =>
      [...wanted].some((w) => {
        const q = w.toLowerCase();
        return t.id === w || t.code.toLowerCase() === q || t.name.toLowerCase() === q;
      });
    const types = (wanted.size ? allTypes.filter(wantedHit) : allTypes).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      letter: t.letterCode || '',
      color: t.color || '',
    }));
    if (wanted.size) {
      for (const w of wanted) {
        if (types.some((t) => t.id === w || t.name.toLowerCase() === w.toLowerCase())) continue;
        types.push({ id: w, code: w, name: w, letter: '', color: '' });
      }
    }
    const typeIndex = new Map(types.map((t, i) => [t.id, i]));
    const warnMin = Number(cfg.warningLimit) || 0;
    const useShift = !!cfg.useShiftMode;
    const shiftNeedles = (cfg.shiftIds || []).map((s) => String(s).toLowerCase()).filter(Boolean);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, locationId: true, name: true, location: { select: { name: true } } },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        scheduleId: true,
        position: { select: { name: true } },
        division: { select: { name: true, locationId: true, location: { select: { name: true } } } },
        schedule: { select: { settings: true, startTime: true, endTime: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const locNeedles = locationIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      if (locNeedles.length) {
        const locId = (e.division?.locationId || '').toLowerCase();
        const locName = (e.division?.location?.name || '').toLowerCase();
        if (!locNeedles.includes(locId) && !locNeedles.includes(locName)) return false;
      }
      return true;
    });

    const dayList: string[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      dayList.push(isoLocal(cur));
      if (dayList.length > 366) break;
    }
    const empIds = filtered.map((e) => e.id);
    const [days, absences, trips, assignments] = await Promise.all([
      empIds.length
        ? this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              status: true,
              firstInAt: true,
              lastOutAt: true,
              plannedHours: true,
              workedHours: true,
              beforeHours: true,
              afterHours: true,
              overtimeHours: true,
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.absence.findMany({
            where: {
              tenantId,
              employeeId: { in: empIds },
              status: { in: ['approved'] },
              startDate: { lte },
              endDate: { gte },
            },
            select: {
              employeeId: true,
              startDate: true,
              endDate: true,
              startTime: true,
              endTime: true,
              absenceType: { select: { timeTypeId: true, name: true, code: true } },
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.internalTrip
            .findMany({
              where: { tenantId, employeeId: { in: empIds }, startDate: { lte }, endDate: { gte } },
              select: { employeeId: true, startDate: true, endDate: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      empIds.length && useShift
        ? this.prisma.scheduleShiftAssignment.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              shiftId: true,
              shiftLabel: true,
              shift: { select: { id: true, name: true, code: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const recBy = new Map<string, (typeof days)[number]>();
    for (const d of days) {
      recBy.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recBy.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }
    const absByEmp = new Map<string, typeof absences>();
    for (const a of absences) {
      const list = absByEmp.get(a.employeeId) || [];
      list.push(a);
      absByEmp.set(a.employeeId, list);
    }
    const tripSet = new Set<string>();
    for (const t of trips) {
      for (let x = new Date(t.startDate); isoLocal(x) <= isoLocal(t.endDate) && isoLocal(x) <= toIso; x.setDate(x.getDate() + 1)) {
        const ymd = isoLocal(x);
        if (ymd >= fromIso) tripSet.add(`${t.employeeId}|${ymd}`);
      }
    }
    const asgBy = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) {
      asgBy.set(`${a.employeeId}|${isoUtc(a.workDate)}`, a);
      asgBy.set(`${a.employeeId}|${isoLocal(a.workDate)}`, a);
    }

    const rows = filtered.map((e, n) => {
      const hours = types.map(() => 0);
      const dayCounts = types.map(() => 0);
      const dayRows: {
        date: string;
        dateLabel: string;
        typeId: string;
        typeName: string;
        letter: string;
        hours: number;
        warn: boolean;
      }[] = [];
      const parsed = parseScheduleSettings(e.schedule?.settings);
      const plan = e.schedule
        ? (() => {
            let d = toMin(e.schedule.endTime) - toMin(e.schedule.startTime);
            if (d < 0) d += 24 * 60;
            if (d >= 8 * 60) d -= 60;
            return r2(d / 60);
          })()
        : 8;
      for (const ymd of dayList) {
        const day = parseYmd(ymd);
        const rec = recBy.get(`${e.id}|${ymd}`);
        if (useShift) {
          const asg = asgBy.get(`${e.id}|${ymd}`);
          if (!asg) continue;
          if (shiftNeedles.length) {
            const keys = [asg.shiftId, asg.shift?.id, asg.shift?.name, asg.shift?.code, asg.shiftLabel]
              .filter(Boolean)
              .map((x) => String(x).toLowerCase());
            if (!keys.some((k) => shiftNeedles.includes(k))) continue;
          }
        }
        const off = isDayOffByPattern(day, parsed.weekPattern || '6/1') || rec?.status === DayStatus.day_off;
        const covering = (absByEmp.get(e.id) || []).find((a) => {
          const a0 = isoUtc(a.startDate) <= ymd && ymd <= isoUtc(a.endDate);
          const a1 = isoLocal(a.startDate) <= ymd && ymd <= isoLocal(a.endDate);
          return a0 || a1;
        });
        let type = workType;
        let h = 0;
        if (covering) {
          const mapped =
            (covering.absenceType.timeTypeId && allTypes.find((t) => t.id === covering.absenceType.timeTypeId)) ||
            pick(covering.absenceType.code, covering.absenceType.name) ||
            leaveType ||
            workType;
          type = mapped;
          h = spanH(covering.startTime, covering.endTime) ?? (rec?.plannedHours != null ? Number(rec.plannedHours) : plan);
        } else if (tripSet.has(`${e.id}|${ymd}`) && tripType) {
          type = tripType;
          h = rec?.plannedHours != null ? Number(rec.plannedHours) : plan;
        } else if (rec?.status === DayStatus.leave && leaveType) {
          type = leaveType;
          h = rec.plannedHours != null ? Number(rec.plannedHours) : plan;
        } else if (off && !(rec?.firstInAt || rec?.lastOutAt)) {
          if (!dayOffType && !holidayType) continue;
          type = day.getDay() === 0 && holidayType ? holidayType : dayOffType || holidayType!;
          h = rec?.plannedHours != null ? Number(rec.plannedHours) : plan;
        } else if (rec?.firstInAt || rec?.workedHours != null) {
          type = workType;
          h =
            rec.firstInAt && rec.lastOutAt && rec.lastOutAt.getTime() > rec.firstInAt.getTime()
              ? r2((rec.lastOutAt.getTime() - rec.firstInAt.getTime()) / 3_600_000)
              : rec.workedHours != null
                ? Number(rec.workedHours)
                : 0;
        } else if (rec?.status === DayStatus.absent && absentType) {
          type = absentType;
          h = rec.plannedHours != null ? Number(rec.plannedHours) : plan;
        } else {
          continue;
        }
        if (!h) continue;
        const warn = warnMin > 0 && h * 60 > warnMin;
        const idx = typeIndex.get(type.id);
        if (idx == null) continue;
        hours[idx] = r2(hours[idx] + h);
        dayCounts[idx] += 1;
        dayRows.push({
          date: ymd,
          dateLabel: `${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}`,
          typeId: type.id,
          typeName: type.name,
          letter: type.letterCode || '',
          hours: r2(h),
          warn,
        });
      }
      return {
        n: n + 1,
        employeeId: e.id,
        tabNumber: e.tabNumber || '',
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: e.division?.name || '',
        position: e.position?.name || '',
        location: e.division?.location?.name || '',
        hours: hours.map(r2),
        hoursWarn: hours.map((h) => warnMin > 0 && h * 60 > warnMin),
        days: dayCounts,
        total: r2(hours.reduce((s, v) => s + v, 0)),
        totalWarn: warnMin > 0 && hours.reduce((s, v) => s + v, 0) * 60 > warnMin,
        dayRows,
      };
    });

    return {
      title: 'Отчет по видам времени',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      warningLimit: warnMin || null,
      periodLine: `Период: ${pad(parseYmd(fromIso).getDate())} ${months[parseYmd(fromIso).getMonth()]} ${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())} ${months[parseYmd(toIso).getMonth()]} ${parseYmd(toIso).getFullYear()}`,
      types,
      rows,
    };
  }

  /** Отчет по опозданиям */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    type Rule = { from: string; to: string; amount: number };
    type Cfg = {
      mode?: 'time' | 'minutes';
      timeRules?: Rule[];
      minuteRules?: Rule[];
    };
    let cfg: Cfg = {};
    try {
      cfg = opts.cfg ? (JSON.parse(opts.cfg) as Cfg) : {};
    } catch {
      cfg = {};
    }
    const mode = cfg.mode === 'minutes' ? 'minutes' : 'time';
    const timeRules = (cfg.timeRules || [])
      .map((r) => ({
        from: String(r.from || '').trim(),
        to: String(r.to || '').trim(),
        amount: Number(r.amount) || 0,
      }))
      .filter((r) => r.from && r.to);
    const minuteRules = (cfg.minuteRules || [])
      .map((r) => ({
        from: Number(r.from) || 0,
        to: Number(r.to) || 0,
        amount: Number(r.amount) || 0,
      }))
      .filter((r) => r.to >= r.from);

    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const amountFor = (lateMinutes: number, firstInAt?: Date | null) => {
      if (mode === 'minutes') {
        const hit = minuteRules.find((r) => lateMinutes >= r.from && lateMinutes <= r.to);
        return hit?.amount || 0;
      }
      if (!firstInAt) return 0;
      const t = firstInAt.getHours() * 60 + firstInAt.getMinutes();
      const hit = timeRules.find((r) => {
        const a = toMin(r.from);
        const b = toMin(r.to);
        return a <= b ? t >= a && t <= b : t >= a || t <= b;
      });
      return hit?.amount || 0;
    };

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);
    const days = empIds.length
      ? await this.prisma.attendanceDay.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            workDate: { gte, lte },
            OR: [{ status: DayStatus.late }, { lateMinutes: { gt: 0 } }],
          },
          select: {
            employeeId: true,
            lateMinutes: true,
            firstInAt: true,
            workDate: true,
          },
        })
      : [];
    const byEmp = new Map<string, { count: number; amount: number; minutes: number }>();
    for (const d of days) {
      const cur = byEmp.get(d.employeeId) || { count: 0, amount: 0, minutes: 0 };
      cur.count += 1;
      cur.minutes += d.lateMinutes || 0;
      cur.amount += amountFor(d.lateMinutes || 0, d.firstInAt);
      byEmp.set(d.employeeId, cur);
    }

    const rows = filtered.map((e, i) => {
      const a = byEmp.get(e.id) || { count: 0, amount: 0, minutes: 0 };
      return {
        n: i + 1,
        employeeId: e.id,
        tabNumber: e.tabNumber || '',
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        lateCount: a.count,
        lateMinutes: a.minutes,
        totalAmount: Math.round(a.amount * 100) / 100,
      };
    });

    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    return {
      title: 'Отчет по опозданиям',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      mode,
      periodLine: `Период: ${pad(parseYmd(fromIso).getDate())}.${pad(parseYmd(fromIso).getMonth() + 1)}.${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())}.${pad(parseYmd(toIso).getMonth() + 1)}.${parseYmd(toIso).getFullYear()}`,
      rows,
    };
  }

  async schedulePlanReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string; positionIds?: string } = {},
  ) {
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const defaultTo = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const toRaw = opts.to ? parseDateParam(opts.to, defaultTo, 'to') : defaultTo;
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate());
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const divisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);

    const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const isoLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const utcYmd = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const pad2 = (n: number) => String(n).padStart(2, '0');

    const days: { date: string; weekday: string; label: string }[] = [];
    for (let cursor = new Date(fromDay), n = 0; cursor <= toDay && n < 93; cursor.setDate(cursor.getDate() + 1), n += 1) {
      const dt = new Date(cursor);
      days.push({
        date: isoLocal(dt),
        weekday: WEEK[dt.getDay()],
        label: `${pad2(dt.getDate())}.${MON[dt.getMonth()]}`,
      });
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(divisionIds.length ? { divisionId: { in: divisionIds } } : {}),
        ...(positionIds.length ? { positionId: { in: positionIds } } : {}),
      },
      include: {
        division: { select: { name: true } },
        position: { select: { name: true } },
        grade: { select: { name: true } },
        staffPosition: { select: { code: true, status: true, schedule: true } },
        schedule: true,
        scheduleOverrides: { include: { schedule: true }, orderBy: { startDate: 'desc' } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 2000,
    });

    const monthKeys = [...new Set(days.map((d) => `${d.date.slice(0, 7)}-01`))];
    const monthDates = monthKeys.map((k) => new Date(`${k}T00:00:00.000Z`));
    const indivLines =
      employees.length && monthDates.length
        ? await this.prisma.individualScheduleLine.findMany({
            where: {
              employeeId: { in: employees.map((e) => e.id) },
              document: { tenantId, status: 'posted', month: { in: monthDates } },
            },
            include: { document: { select: { month: true } } },
          })
        : [];
    const indivMap = new Map<string, Record<string, string>>();
    for (const line of indivLines) {
      const month = utcYmd(line.document.month).slice(0, 7);
      const raw = line.days && typeof line.days === 'object' && !Array.isArray(line.days) ? line.days : {};
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v != null && v !== '') map[k] = String(v);
      }
      indivMap.set(`${line.employeeId}:${month}`, map);
    }

    type Sched = {
      startTime: string;
      endTime: string;
      settings: Prisma.JsonValue | null;
    } | null;

    const scheduleOn = (emp: (typeof employees)[number], day: string): Sched => {
      const ov = emp.scheduleOverrides.find((o) => {
        const a = utcYmd(o.startDate);
        const b = o.endDate ? utcYmd(o.endDate) : '9999-12-31';
        return a <= day && day <= b;
      });
      return ov?.schedule || emp.schedule || emp.staffPosition?.schedule || null;
    };

    const cellFor = (emp: (typeof employees)[number], day: { date: string }) => {
      const month = day.date.slice(0, 7);
      const indiv = indivMap.get(`${emp.id}:${month}`);
      if (indiv) {
        const raw = indiv[String(Number(day.date.slice(8)))] ?? indiv[day.date];
        if (raw != null && raw !== '') {
          const off = raw === 'В' || raw === 'R' || raw === 'Выходной';
          let text = raw;
          if (off) text = 'В';
          else if (/^\d+(\.\d+)?$/.test(raw)) {
            const sch = scheduleOn(emp, day.date);
            text = sch ? `${sch.startTime} - ${sch.endTime}` : '09:00 - 18:00';
          } else if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(raw)) {
            text = raw.replace('-', ' - ');
          }
          return { text, off };
        }
      }
      const sch = scheduleOn(emp, day.date);
      if (!sch) return { text: '', off: false };
      const settings = mergeScheduleSettings(sch.settings);
      const gridVal = settings.yearGrid?.[day.date];
      if (gridVal === 'В' || gridVal === 'R') return { text: 'В', off: true };
      const [yy, mm, dd] = day.date.split('-').map(Number);
      const dt = new Date(yy, (mm || 1) - 1, dd || 1);
      const off = isDayOffByPattern(dt, settings.weekPattern || '6/1');
      if (off) return { text: 'В', off: true };
      return { text: `${sch.startTime} - ${sch.endTime}`, off: false };
    };

    const fmtShort = (d: Date) => `${pad2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
    const rows = employees.map((e, i) => {
      const cells = days.map((d) => cellFor(e, d));
      const spStatus = e.staffPosition?.status;
      const state =
        spStatus === 'vacant' || spStatus === 'reserved' ? 'Свободный' : 'Занятый';
      return {
        n: i + 1,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: e.division?.name || '',
        position: e.position?.name || '',
        code: e.staffPosition?.code || '',
        grade: e.grade?.name || '',
        state,
        days: cells,
        daysOff: cells.filter((c) => c.off).length,
      };
    });

    return {
      title: 'Отчет по плану графиков',
      from: isoLocal(fromDay),
      to: isoLocal(toDay),
      periodLabel: `Период с ${fmtShort(fromDay)} по ${fmtShort(toDay)}`,
      generatedAt: new Date().toISOString(),
      days,
      rows,
    };
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const asOfEnd = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivisionIds = ids(opts.divisionIds);
    const divisionGroupIds = ids(opts.divisionGroupIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const scheduleIds = ids(opts.scheduleIds);
    const educationTypes = ids(opts.educationType);
    const filterByDept = opts.filterByDept !== '0' && opts.filterByDept !== 'false';

    const fmtRu = (d?: Date | null) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return '';
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      return `${dd}.${mm}.${dt.getFullYear()}`;
    };
    const genderLabel = (g?: string | null) => {
      const v = (g || '').trim().toLowerCase();
      if (!v) return '';
      if (v === 'm' || v === 'male' || v.startsWith('муж')) return 'Мужской';
      if (v === 'f' || v === 'female' || v.startsWith('жен')) return 'Женский';
      return g || '';
    };
    const scheduleLabel = (s?: {
      name?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: Prisma.JsonValue | null;
    } | null) => {
      if (!s) return '';
      const name = (s.name || '').trim();
      if (name) return name;
      const st = (s.startTime || '09:00').slice(0, 5);
      const en = (s.endTime || '18:00').slice(0, 5);
      const pat = parseScheduleSettings(s.settings).weekPattern;
      const patLabel = pat === '5/2' || pat === '6/1' || pat === '5/1' ? ` (${pat})` : '';
      return `${st}-${en}${patLabel}`.trim();
    };
    const hideStaffCode = (code?: string | null) =>
      !code || /^(OCC-|GP-|XLS-|SP-|EMP-)/i.test(code) ? '' : code;

    const [divisions, employees, eduDict] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true, divisionGroupId: true },
      }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
          ...(positionIds.length ? { positionId: { in: positionIds } } : {}),
          ...(scheduleIds.length ? { scheduleId: { in: scheduleIds } } : {}),
          AND: [
            { OR: [{ hiredAt: null }, { hiredAt: { lte: asOfEnd } }] },
            {
              OR: [
                { dismissedAt: null, status: { not: 'dismissed' } },
                { dismissedAt: { gt: asOf } },
              ],
            },
          ],
        },
        include: {
          person: {
            include: {
              region: { select: { name: true } },
              documents: {
                where: { docType: { in: ['PASSPORT', 'ID'] } },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          division: { include: { divisionGroup: { select: { name: true } } } },
          position: { select: { name: true } },
          grade: { select: { name: true, code: true } },
          schedule: { select: { name: true, startTime: true, endTime: true, settings: true } },
          staffPosition: { select: { code: true, title: true } },
          region: { select: { name: true } },
          relatives: { orderBy: { createdAt: 'asc' }, take: 1 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.dictionary.findFirst({
        where: { tenantId, code: 'edu' },
        include: { items: { where: { isActive: true } } },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };

    let allowed: Set<string> | null = null;
    if (divisionGroupIds.length) {
      allowed = new Set();
      for (const d of divisions) {
        if (d.divisionGroupId && divisionGroupIds.includes(d.divisionGroupId)) walkIds(d.id, allowed);
      }
    }
    if (filterByDept && selectedDivisionIds.length) {
      const picked = new Set<string>();
      for (const id of selectedDivisionIds) walkIds(id, picked);
      allowed = allowed ? new Set([...allowed].filter((id) => picked.has(id))) : picked;
    }

    const eduWant = new Set(
      educationTypes.map((x) => x.toLowerCase()),
    );
    if (eduDict?.items?.length) {
      for (const it of eduDict.items) {
        if (
          eduWant.has(it.id.toLowerCase()) ||
          eduWant.has(it.code.toLowerCase()) ||
          eduWant.has(it.name.toLowerCase())
        ) {
          eduWant.add(it.id.toLowerCase());
          eduWant.add(it.code.toLowerCase());
          eduWant.add(it.name.toLowerCase());
        }
      }
    }

    const docs = employees.length
      ? await this.prisma.hrDocument.findMany({
          where: {
            tenantId,
            employeeId: { in: employees.map((e) => e.id) },
            type: 'other',
          },
          orderBy: { documentDate: 'desc' },
        })
      : [];
    const eduByEmp = new Map<
      string,
      { educationType: string; institution: string; specialty: string; course: string }
    >();
    for (const d of docs) {
      const p =
        d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
          ? (d.payload as {
              kind?: string;
              educationType?: string;
              institution?: string;
              specialty?: string;
              course?: string;
            })
          : null;
      if (!p || p.kind !== 'education' || eduByEmp.has(d.employeeId)) continue;
      eduByEmp.set(d.employeeId, {
        educationType: String(p.educationType || '').trim(),
        institution: String(p.institution || '').trim(),
        specialty: String(p.specialty || '').trim(),
        course: String(p.course || '').trim(),
      });
    }

    type Row = {
      n: number;
      fullName: string;
      hiredAt: string;
      code: string;
      divisionGroup: string;
      division: string;
      position: string;
      staffPosition: string;
      salary: number | null;
      grade: string;
      gender: string;
      region: string;
      inps: string;
      pinfl: string;
      inn: string;
      birthDate: string;
      address: string;
      phone: string;
      schedule: string;
      passport: string;
      passportIssuer: string;
      educationType: string;
      educationInstitution: string;
      educationSpecialty: string;
      educationCourse: string;
      familyRelation: string;
      familyName: string;
    };
    const rows: Row[] = [];
    let totalSalary = 0;
    for (const e of employees) {
      const divId = e.divisionId || '';
      if (allowed && (!divId || !allowed.has(divId))) continue;
      const edu = eduByEmp.get(e.id);
      if (eduWant.size) {
        const blob = [edu?.educationType, edu?.institution].filter(Boolean).join(' ').toLowerCase();
        const hit = [...eduWant].some((w) => blob.includes(w) || w === (edu?.educationType || '').toLowerCase());
        if (!hit) continue;
      }
      const p = e.person;
      const passportDoc = p?.documents?.[0];
      const salary = e.baseSalary != null ? Number(e.baseSalary) : null;
      if (salary != null && Number.isFinite(salary)) totalSalary += salary;
      const rel = e.relatives[0];
      rows.push({
        n: 0,
        fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        hiredAt: fmtRu(e.hiredAt),
        code: hideStaffCode(e.staffPosition?.code) || hideStaffCode(e.tabNumber),
        divisionGroup: e.division?.divisionGroup?.name || '',
        division: e.division?.name || '',
        position: e.position?.name || '',
        staffPosition: e.staffPosition?.title || '',
        salary: salary != null && Number.isFinite(salary) ? salary : null,
        grade: e.grade?.name || e.grade?.code || '',
        gender: genderLabel(p?.gender),
        region: p?.region?.name || e.region?.name || '',
        inps: p?.inps || p?.inn || '',
        pinfl: p?.pinfl || '',
        inn: p?.inn || '',
        birthDate: fmtRu(p?.birthDate),
        address: p?.addressResidence || '',
        phone: e.phone || p?.phone || '',
        schedule: scheduleLabel(e.schedule),
        passport: (p?.passport || passportDoc?.docNumber || '').trim(),
        passportIssuer: (passportDoc?.issuer || '').trim(),
        educationType: edu?.educationType || '',
        educationInstitution: edu?.institution || '',
        educationSpecialty: edu?.specialty || '',
        educationCourse: edu?.course || '',
        familyRelation: rel?.relation || '',
        familyName: rel?.fullName || '',
      });
    }
    rows.forEach((r, i) => {
      r.n = i + 1;
    });

    const dd = String(asOf.getDate()).padStart(2, '0');
    const mm = String(asOf.getMonth() + 1).padStart(2, '0');
    const dateLabel = `${dd}.${mm}.${asOf.getFullYear()}`;
    return {
      title: 'Отчет по сотрудникам',
      date: `${asOf.getFullYear()}-${mm}-${dd}`,
      dateLabel,
      generatedAt: new Date().toISOString(),
      totalSalary,
      rows,
    };
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const asOfEnd = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const positionGroupIds = ids(opts.positionGroupIds);
    const positionIds = ids(opts.positionIds);
    const staffGroups = ids(opts.staffGroups);
    const selectedDivisionIds = ids(opts.divisionIds);
    const groupBy = (opts.groupBy || 'none').trim();
    const positionType = (opts.positionType || 'all').trim();

    const where: Prisma.StaffPositionWhereInput = {
      tenantId,
      isActive: true,
      AND: [
        { OR: [{ openedAt: null }, { openedAt: { lte: asOfEnd } }] },
        { OR: [{ closedAt: null }, { closedAt: { gt: asOf } }] },
      ],
    };
    if (positionType === 'occupied') where.status = 'occupied';
    else if (positionType === 'vacant') where.status = { in: ['vacant', 'reserved'] };
    if (positionIds.length) where.positionId = { in: positionIds };
    if (staffGroups.length) where.groupName = { in: staffGroups };
    if (positionGroupIds.length) {
      where.position = { is: { positionGroupId: { in: positionGroupIds } } };
    }

    const staff = await this.prisma.staffPosition.findMany({
      where,
      include: {
        division: { select: { id: true, name: true, sortOrder: true } },
        position: { include: { positionGroup: { select: { name: true } } } },
      },
    });

    const rowKeyOf = (sp: (typeof staff)[number]) => {
      if (groupBy === 'jobGroup') return sp.position?.positionGroup?.name || '—';
      if (groupBy === 'staffGroup') return sp.groupName || '—';
      return sp.position?.name || sp.title || '—';
    };

    const selectedSet = new Set(selectedDivisionIds);
    const selectedDivs = selectedDivisionIds.length
      ? await this.prisma.division.findMany({
          where: { tenantId, id: { in: selectedDivisionIds } },
          select: { id: true, name: true },
        })
      : [];
    const idToName = new Map(selectedDivs.map((d) => [d.id, d.name]));
    let colNames: string[];
    if (selectedDivisionIds.length) {
      colNames = selectedDivisionIds.map((id) => idToName.get(id)).filter(Boolean) as string[];
    } else {
      const order = new Map<string, number>();
      for (const s of staff) {
        const name = s.division?.name;
        if (!name) continue;
        const so = s.division?.sortOrder ?? 0;
        if (!order.has(name) || so < (order.get(name) || 0)) order.set(name, so);
      }
      colNames = [...order.entries()]
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'ru'))
        .map(([name]) => name);
    }

    const OTHER = 'Другие подразделения*';
    const matrix = new Map<string, Map<string, number>>();
    const rowOrder: string[] = [];
    const seenRow = new Set<string>();
    let hasOther = false;

    for (const sp of staff) {
      const row = rowKeyOf(sp);
      if (!seenRow.has(row)) {
        seenRow.add(row);
        rowOrder.push(row);
      }
      const divName = sp.division?.name || '';
      let col = divName;
      if (selectedDivisionIds.length) {
        if (sp.division?.id && selectedSet.has(sp.division.id)) col = divName;
        else {
          col = OTHER;
          hasOther = true;
        }
      }
      if (!col) {
        col = OTHER;
        hasOther = true;
      }
      if (!matrix.has(row)) matrix.set(row, new Map());
      const line = matrix.get(row)!;
      line.set(col, (line.get(col) || 0) + (sp.headcount || 1));
    }

    const columns = [...colNames, ...(hasOther ? [OTHER] : []), 'Итого'];
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dateLabel = `Дата: ${pad2(asOf.getDate())} ${MON[asOf.getMonth()]} ${asOf.getFullYear()}`;
    const asOfYmd = `${asOf.getFullYear()}-${pad2(asOf.getMonth() + 1)}-${pad2(asOf.getDate())}`;

    const rows = rowOrder
      .map((name) => {
        const line = matrix.get(name) || new Map();
        const values = colNames.map((c) => line.get(c) || 0);
        const other = hasOther ? line.get(OTHER) || 0 : 0;
        const total = values.reduce((a, b) => a + b, 0) + other;
        return { name, values, other, total };
      })
      .filter((r) => r.total > 0);

    return {
      title: 'Отчет по занятости',
      date: asOfYmd,
      dateLabel,
      generatedAt: new Date().toISOString(),
      rowLabel: groupBy === 'jobGroup' ? 'Группа должностей' : groupBy === 'staffGroup' ? 'Группа позиций' : 'Должности',
      columns,
      hasOther,
      rows,
    };
  }

  /**
   * Verifix «Отчет по штрафам»
   * Matrix: employee + schedule | day amounts | Итог
   */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const monthsShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const parseDay = (s: string | undefined, fallback: Date) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtShort = (d: Date) => `${pad(d.getDate())} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`;

    const now = new Date();
    let from: Date;
    let to: Date;
    if (opts.from || opts.to) {
      from = parseDay(opts.from, new Date(now.getFullYear(), now.getMonth(), 1));
      to = parseDay(opts.to, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    } else {
      const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 0);
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const fromIso = isoLocal(from);
    const toIso = isoLocal(to);
    const periodLine = `Период: ${fmtShort(from)} - ${fmtShort(to)}`;

    const filterByDept = opts.filterByDept !== '0' && opts.filterByDept !== false && opts.filterByDept !== 'false';
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const dayList: { iso: string; dd: string; weekday: string; weekend: boolean }[] = [];
    for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
      const wd = t.getDay();
      dayList.push({
        iso: isoLocal(t),
        dd: pad(t.getDate()),
        weekday: weekdays[wd],
        weekend: wd === 0 || wd === 6,
      });
    }

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (filterByDept && selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const scheduleLabel = (sch: {
      name?: string | null;
      code?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null) => {
      if (!sch) return '';
      const parsed = parseScheduleSettings(sch.settings);
      const pat = parsed.weekPattern || '6/1';
      const start = (sch.startTime || '09:00').slice(0, 5);
      const end = (sch.endTime || '18:00').slice(0, 5);
      const name = (sch.name || sch.code || '').trim();
      const core = `${start}-${end} (${pat})`;
      return name ? `${core} (${name})` : core;
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        schedule: { select: { name: true, code: true, startTime: true, endTime: true, settings: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const pname = (e.position?.name || '').toLowerCase();
        if (!posNeedles.some((p) => p === e.positionId || pname === p || pname.includes(p))) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);

    /** employeeId -> iso -> amount */
    const dayAmt = new Map<string, Map<string, number>>();
    const bump = (employeeId: string, iso: string, amount: number) => {
      if (!amount) return;
      let m = dayAmt.get(employeeId);
      if (!m) {
        m = new Map();
        dayAmt.set(employeeId, m);
      }
      m.set(iso, money((m.get(iso) || 0) + amount));
    };

    // 1) Posted payroll penalties dated in range
    if (empIds.length) {
      try {
        const lines = await this.prisma.payrollLine.findMany({
          where: {
            tenantId,
            type: PayrollLineType.penalty,
            employeeId: { in: empIds },
            OR: [
              { postedAt: { gte: from, lte: to } },
              { createdAt: { gte: from, lte: to } },
            ],
          },
          select: { employeeId: true, amount: true, postedAt: true, createdAt: true },
          take: 20000,
        });
        for (const l of lines) {
          const day = l.postedAt || l.createdAt;
          const iso = isoLocal(day);
          if (iso < fromIso || iso > toIso) continue;
          bump(l.employeeId, iso, Math.abs(Number(l.amount) || 0));
        }
      } catch {
        /* ignore */
      }
    }

    // 2) Fine policies + attendance for days without payroll lines
    type FineRule = {
      timeFrom?: number;
      timeTo?: number;
      type?: string;
      value?: number;
    };
    type FineRules = {
      late?: FineRule[];
      early?: FineRule[];
      absence?: FineRule[];
      missed_day?: FineRule[];
      missed_mark?: FineRule[];
    };
    type PolicyRow = {
      scope: string;
      divisionId: string | null;
      positionId: string | null;
      employeeIds: unknown;
      rules: unknown;
      month: Date;
    };
    let policies: PolicyRow[] = [];
    try {
      const monthStart = new Date(from.getFullYear(), from.getMonth(), 1);
      const monthEnd = new Date(to.getFullYear(), to.getMonth() + 1, 0, 23, 59, 59, 999);
      policies = await this.prisma.finePolicy.findMany({
        where: {
          tenantId,
          isActive: true,
          month: { gte: monthStart, lte: monthEnd },
        },
        select: {
          scope: true,
          divisionId: true,
          positionId: true,
          employeeIds: true,
          rules: true,
          month: true,
        },
      });
    } catch {
      policies = [];
    }

    const parseRules = (raw: unknown): FineRules => {
      if (!raw || typeof raw !== 'object') return {};
      return raw as FineRules;
    };
    const policyEmpIds = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.map(String);
      return [];
    };
    const pickAmount = (rules: FineRule[] | undefined, minutes: number): number => {
      if (!rules?.length) return 0;
      const hit = rules.find((r) => {
        if (r.type && r.type !== 'amount' && r.type !== 'time') return false;
        const a = r.timeFrom ?? 0;
        const b = r.timeTo ?? Number.MAX_SAFE_INTEGER;
        return minutes >= a && minutes <= b;
      });
      if (hit) return Number(hit.value) || 0;
      const anyAmt = rules.find((r) => r.type === 'amount' || !r.type);
      return Number(anyAmt?.value) || 0;
    };
    const resolveRules = (e: { id: string; divisionId: string | null; positionId: string | null }, day: Date): FineRules => {
      const ym = day.getFullYear() * 100 + (day.getMonth() + 1);
      const inMonth = policies.filter((p) => {
        const pYm = p.month.getFullYear() * 100 + (p.month.getMonth() + 1);
        return pYm === ym;
      });
      const empPol = inMonth.find(
        (p) => p.scope === 'employee' && policyEmpIds(p.employeeIds).includes(e.id),
      );
      if (empPol) return parseRules(empPol.rules);
      const posPol = inMonth.find((p) => p.scope === 'position' && p.positionId && p.positionId === e.positionId);
      if (posPol) return parseRules(posPol.rules);
      const divPol = inMonth.find((p) => p.scope === 'division' && p.divisionId && p.divisionId === e.divisionId);
      if (divPol) return parseRules(divPol.rules);
      const company = inMonth.find((p) => p.scope === 'company');
      return company ? parseRules(company.rules) : {};
    };

    let defaultLate = 30000;
    let defaultAbsence = 100000;
    try {
      const policy = await this.prisma.payrollPolicy.findFirst({
        where: { tenantId, isActive: true },
        select: { latePenaltyPerMin: true, absencePenalty: true },
      });
      if (policy) {
        defaultAbsence = Number(policy.absencePenalty) || defaultAbsence;
        const perMin = Number(policy.latePenaltyPerMin) || 0;
        if (perMin > 0) defaultLate = money(Math.max(perMin * 60, 30000));
      }
    } catch {
      /* ignore */
    }

    if (empIds.length) {
      try {
        const days = await this.prisma.attendanceDay.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            workDate: { gte: from, lte: to },
          },
          select: {
            employeeId: true,
            workDate: true,
            status: true,
            lateMinutes: true,
            earlyLeaveMinutes: true,
            firstInAt: true,
            lastOutAt: true,
          },
        });
        const empById = new Map(filtered.map((e) => [e.id, e]));
        for (const d of days) {
          const iso = isoLocal(d.workDate);
          const existing = dayAmt.get(d.employeeId)?.get(iso) || 0;
          if (existing) continue; // payroll line already set
          const e = empById.get(d.employeeId);
          if (!e) continue;
          const rules = resolveRules(e, d.workDate);
          let amt = 0;
          const lateMin = d.lateMinutes || 0;
          const earlyMin = d.earlyLeaveMinutes || 0;
          if (lateMin > 0 || d.status === DayStatus.late) {
            amt += pickAmount(rules.late, lateMin) || (lateMin > 0 ? defaultLate : 0);
          }
          if (earlyMin > 0) {
            amt += pickAmount(rules.early, earlyMin);
          }
          if (d.status === DayStatus.absent) {
            amt += pickAmount(rules.absence, 0) || pickAmount(rules.missed_day, 0) || defaultAbsence;
          }
          if (!d.firstInAt && !d.lastOutAt && d.status === DayStatus.not_started) {
            const miss = pickAmount(rules.missed_day, 0) || pickAmount(rules.missed_mark, 0);
            amt += miss;
          }
          bump(d.employeeId, iso, amt);
        }
      } catch {
        /* ignore */
      }
    }

    const colTotals = dayList.map(() => 0);
    const rows = filtered.map((e, i) => {
      const amounts = dayList.map((d, di) => {
        const v = dayAmt.get(e.id)?.get(d.iso) || 0;
        colTotals[di] += v;
        return v;
      });
      const total = money(amounts.reduce((s, v) => s + v, 0));
      return {
        n: i + 1,
        employeeId: e.id,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        division: (e.division?.name || '').toUpperCase(),
        schedule: scheduleLabel(e.schedule),
        amounts,
        total,
      };
    });

    const totals = {
      amounts: colTotals.map(money),
      total: money(colTotals.reduce((s, v) => s + v, 0)),
      count: rows.length,
    };

    return {
      title: 'Отчет по штрафам',
      from: fromIso,
      to: toIso,
      periodLine,
      generatedAt: new Date().toISOString(),
      days: dayList,
      rows,
      totals,
      year: from.getFullYear(),
      month: from.getMonth() + 1,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const monthsShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const parseDay = (s: string | undefined, fallback: Date) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const fmtShort = (d: Date) =>
      `${pad(d.getDate())} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`;
    const fmtRu = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const now = new Date();
    let from: Date;
    let to: Date;
    if (opts.from || opts.to) {
      from = parseDay(opts.from, new Date(now.getFullYear(), now.getMonth(), 1));
      to = parseDay(opts.to, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    } else {
      const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 0);
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const fromIso = isoLocal(from);
    const toIso = isoLocal(to);

    const kindRaw = (opts.kind || 'both').toLowerCase();
    const kindFilter =
      kindRaw === 'accrual' || kindRaw === 'начисление'
        ? 'accrual'
        : kindRaw === 'deduction' || kindRaw === 'удержание'
          ? 'deduction'
          : 'both';
    const typeLine =
      kindFilter === 'accrual'
        ? 'Тип начисления: Начисление'
        : kindFilter === 'deduction'
          ? 'Тип начисления: Удержание'
          : 'Тип начисления: Оба';
    const periodLine = `С ${fmtShort(from)} по ${fmtShort(to)}`;

    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    let docs: Array<{
      id: string;
      kind: string;
      docDate: Date;
      note: string | null;
      title: string | null;
      basis: string | null;
      lines: Array<{
        employeeId: string;
        typeName: string | null;
        lineDate: Date | null;
        amount: unknown;
        note: string | null;
        employee: {
          firstName: string;
          lastName: string;
          middleName: string | null;
          divisionId: string | null;
          positionId: string | null;
          division: { name: string } | null;
          position: { name: string } | null;
        };
      }>;
    }> = [];

    try {
      docs = await this.prisma.oneTimeAccrualDoc.findMany({
        where: {
          tenantId,
          status: { in: ['posted', 'draft'] },
          ...(kindFilter === 'both' ? {} : { kind: kindFilter }),
          OR: [
            { docDate: { gte: from, lte: to } },
            { month: { gte: from, lte: to } },
            { lines: { some: { lineDate: { gte: from, lte: to } } } },
          ],
        },
        select: {
          id: true,
          kind: true,
          docDate: true,
          note: true,
          title: true,
          basis: true,
          lines: {
            ...(employeeIds.length ? { where: { employeeId: { in: employeeIds } } } : {}),
            select: {
              employeeId: true,
              typeName: true,
              lineDate: true,
              amount: true,
              note: true,
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  middleName: true,
                  divisionId: true,
                  positionId: true,
                  division: { select: { name: true } },
                  position: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ docDate: 'asc' }],
      });
    } catch {
      docs = [];
    }

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const rows: Array<{
      n: number;
      employee: string;
      division: string;
      position: string;
      date: string;
      dateIso: string;
      type: string;
      operationType: string;
      amount: number;
      note: string;
      kind: string;
    }> = [];

    for (const doc of docs) {
      const opType = doc.kind === 'deduction' ? 'Удержание' : 'Начисление';
      for (const line of doc.lines) {
        const e = line.employee;
        if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) continue;
        if (posNeedles.length) {
          const pname = (e.position?.name || '').toLowerCase();
          if (!posNeedles.some((p) => p === e.positionId || pname === p || pname.includes(p))) continue;
        }
        const day = line.lineDate || doc.docDate;
        const dayDate = new Date(day);
        // keep lines whose effective date is in range
        if (dayDate < from || dayDate > to) continue;
        rows.push({
          n: 0,
          employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
          division: (e.division?.name || '').toUpperCase(),
          position: (e.position?.name || '').toUpperCase(),
          date: fmtRu(dayDate),
          dateIso: isoLocal(dayDate),
          type: (line.typeName || doc.title || doc.basis || '').trim(),
          operationType: opType,
          amount: money(Number(line.amount) || 0),
          note: (line.note || doc.note || '').trim(),
          kind: doc.kind,
        });
      }
    }

    // Fallback: payroll lines of type one_time / bonus / deduction if no docs
    if (!rows.length) {
      try {
        const types =
          kindFilter === 'accrual'
            ? (['bonus', 'one_time', 'other', 'overtime'] as const)
            : kindFilter === 'deduction'
              ? (['deduction', 'penalty'] as const)
              : (['bonus', 'one_time', 'other', 'overtime', 'deduction', 'penalty'] as const);
        const lines = await this.prisma.payrollLine.findMany({
          where: {
            tenantId,
            type: { in: [...types] },
            OR: [
              { postedAt: { gte: from, lte: to } },
              { createdAt: { gte: from, lte: to } },
            ],
            ...(employeeIds.length ? { employeeId: { in: employeeIds } } : {}),
          },
          select: {
            type: true,
            amount: true,
            description: true,
            postedAt: true,
            createdAt: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
                middleName: true,
                divisionId: true,
                positionId: true,
                division: { select: { name: true } },
                position: { select: { name: true } },
              },
            },
          },
          take: 5000,
        });
        for (const l of lines) {
          const e = l.employee;
          if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) continue;
          if (posNeedles.length) {
            const pname = (e.position?.name || '').toLowerCase();
            if (!posNeedles.some((p) => p === e.positionId || pname === p || pname.includes(p))) continue;
          }
          const dayDate = l.postedAt || l.createdAt;
          const isDed = l.type === 'deduction' || l.type === 'penalty';
          rows.push({
            n: 0,
            employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
            division: (e.division?.name || '').toUpperCase(),
            position: (e.position?.name || '').toUpperCase(),
            date: fmtRu(dayDate),
            dateIso: isoLocal(dayDate),
            type: (l.description || l.type || '').trim(),
            operationType: isDed ? 'Удержание' : 'Начисление',
            amount: money(Number(l.amount) || 0),
            note: '',
            kind: isDed ? 'deduction' : 'accrual',
          });
        }
      } catch {
        /* ignore */
      }
    }

    rows.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.employee.localeCompare(b.employee, 'ru'));
    rows.forEach((r, i) => {
      r.n = i + 1;
    });

    const totals = {
      amount: money(rows.reduce((s, r) => s + r.amount, 0)),
      count: rows.length,
    };

    return {
      title: 'Отчет по разовым начислениям',
      from: fromIso,
      to: toIso,
      periodLine,
      typeLine,
      kind: kindFilter,
      generatedAt: new Date().toISOString(),
      rows,
      totals,
      year: from.getFullYear(),
      month: from.getMonth() + 1,
    };
  }

  /**
   * Verifix «Расходы по подразделениям»
   * Views: Развернутый по сотрудникам | Дополнительный по сотрудникам | По подразделениям
   */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const parseDay = (s: string | undefined, fallback: Date) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    let cfg: { showUserPlanFact?: boolean } = { showUserPlanFact: true };
    if (opts.cfg) {
      try {
        cfg = { ...cfg, ...(JSON.parse(opts.cfg) as typeof cfg) };
      } catch {
        /* ignore */
      }
    }

    const now = new Date();
    let from: Date;
    let to: Date;
    if (opts.from || opts.to) {
      from = parseDay(opts.from, new Date(now.getFullYear(), now.getMonth(), 1));
      to = parseDay(opts.to, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    } else {
      const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 0);
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const fromIso = isoLocal(from);
    const toIso = isoLocal(to);
    const fmtRu = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const periodLine = `Период: от ${fmtRu(from)} до ${fmtRu(to)}`;

    // Plan days = calendar days in month excluding Sundays (Verifix-style)
    const planDaysInMonth = (y: number, m0: number) => {
      const dim = new Date(y, m0 + 1, 0).getDate();
      let n = 0;
      for (let d = 1; d <= dim; d += 1) {
        if (new Date(y, m0, d).getDay() !== 0) n += 1;
      }
      return Math.max(n, 1);
    };
    const planDays = planDaysInMonth(from.getFullYear(), from.getMonth());

    const dayList: { iso: string; dd: string; weekday: string; weekend: boolean }[] = [];
    for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
      const iso = isoLocal(t);
      const wd = t.getDay();
      dayList.push({
        iso,
        dd: pad(t.getDate()),
        weekday: weekdays[wd],
        weekend: wd === 0 || wd === 6,
      });
    }

    const selectedDivs = ids(opts.divisionIds);
    const selectedDivGroups = ids(opts.divisionGroupIds);
    const positionIds = ids(opts.positionIds);
    const positionGroupIds = ids(opts.positionGroupIds);
    const employeeIds = ids(opts.employeeIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, name: true, divisionGroupId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }
    if (selectedDivGroups.length) {
      const byGroup = new Set(
        divisions.filter((d) => d.divisionGroupId && selectedDivGroups.includes(d.divisionGroupId)).map((d) => d.id),
      );
      if (!allowedDiv) allowedDiv = byGroup;
      else allowedDiv = new Set([...allowedDiv].filter((id) => byGroup.has(id)));
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        baseSalary: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true, positionGroupId: true } },
        schedule: { select: { startTime: true, endTime: true, settings: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (positionGroupIds.length) {
        if (!e.position?.positionGroupId || !positionGroupIds.includes(e.position.positionGroupId)) return false;
      }
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.some((p) => p === e.positionId || name === p || name.includes(p))) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);

    const attDays =
      empIds.length > 0
        ? await this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte: from, lte: to } },
            select: {
              employeeId: true,
              workDate: true,
              workedHours: true,
              plannedHours: true,
              overtimeHours: true,
            },
          })
        : [];

    const dayMap = new Map<string, { worked: number; plan: number; ot: number }>();
    for (const d of attDays) {
      const iso = isoUtc(d.workDate) || isoLocal(d.workDate);
      const key = `${d.employeeId}|${iso}`;
      const worked = d.workedHours != null ? Number(d.workedHours) : 0;
      const plan = d.plannedHours != null ? Number(d.plannedHours) : 0;
      const ot = d.overtimeHours != null ? Number(d.overtimeHours) : 0;
      dayMap.set(key, { worked, plan, ot });
    }

    let travelByEmp = new Map<string, number>();
    try {
      const travels = await this.prisma.travelExpenseReport.findMany({
        where: {
          tenantId,
          employeeId: { in: empIds },
          OR: [
            { docDate: { gte: from, lte: to } },
            { spentAt: { gte: from, lte: to } },
          ],
        },
        select: { employeeId: true, amount: true },
      });
      for (const tr of travels) {
        if (!tr.employeeId) continue;
        travelByEmp.set(tr.employeeId, (travelByEmp.get(tr.employeeId) || 0) + (Number(tr.amount) || 0));
      }
    } catch {
      travelByEmp = new Map();
    }

    const dayNormHours = (e: (typeof filtered)[number]) => {
      const st = e.schedule?.startTime || '09:00';
      const en = e.schedule?.endTime || '18:00';
      const toMin = (s: string) => {
        const [h, m] = String(s).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      let d = toMin(en) - toMin(st);
      if (d < 0) d += 24 * 60;
      if (d >= 8 * 60) d -= 60;
      return Math.max(d / 60, 8);
    };

    type EmpRow = {
      n: number;
      employeeId: string;
      division: string;
      employee: string;
      position: string;
      salary: number;
      hours: number[];
      totalHours: number;
      accrued: number;
      extraHours: number[];
      extraTotalHours: number;
      extraAccrued: number;
      travel: number;
      oneTimeTotal: number;
    };

    const detailed: EmpRow[] = filtered.map((e, idx) => {
      const salary = e.baseSalary != null ? Number(e.baseSalary) : 0;
      const norm = dayNormHours(e);
      const hours: number[] = [];
      const extraHours: number[] = [];
      let totalHours = 0;
      let extraTotalHours = 0;
      let workedDays = 0;
      for (const day of dayList) {
        const rec = dayMap.get(`${e.id}|${day.iso}`);
        let h = 0;
        if (rec) {
          if (cfg.showUserPlanFact !== false && rec.plan > 0 && rec.worked <= 0) {
            // keep fact; user-plan toggle mainly affects display preference in Verifix
            h = rec.worked;
          } else {
            h = rec.worked;
          }
          // If no workedHours but plan exists and setting on — still use worked (0)
          if (cfg.showUserPlanFact && rec.worked > 0 && rec.plan > 0) {
            // already fact hours
          }
        }
        const ot = rec?.ot || 0;
        hours.push(r2(h));
        extraHours.push(r2(ot));
        totalHours += h;
        extraTotalHours += ot;
        if (h > 0) workedDays += 1;
      }
      totalHours = r2(totalHours);
      extraTotalHours = r2(extraTotalHours);
      const accrued = money(planDays > 0 ? (salary * workedDays) / planDays : 0);
      const extraAccrued = money(
        planDays > 0 && norm > 0 ? (salary * (extraTotalHours / norm)) / planDays : 0,
      );
      const travel = money(travelByEmp.get(e.id) || 0);
      return {
        n: idx + 1,
        employeeId: e.id,
        division: (e.division?.name || '').toUpperCase(),
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        salary: money(salary),
        hours,
        totalHours,
        accrued,
        extraHours,
        extraTotalHours,
        extraAccrued,
        travel,
        oneTimeTotal: travel,
      };
    });

    // Дополнительный: same employees, empty worked-division detail (no transfer data)
    const additional = detailed.map((r) => ({
      n: r.n,
      workedDivision: '',
      employee: r.employee,
      position: r.position,
      salary: r.salary,
      homeDivision: r.division,
      hours: dayList.map(() => 0),
      totalHours: 0,
      travel: r.travel,
      accrued: 0,
    }));

    // По подразделениям
    const divAgg = new Map<
      string,
      {
        division: string;
        primaryHours: number;
        primaryAccrued: number;
        tripHours: number;
        tripAccrued: number;
        travel: number;
      }
    >();
    for (const r of detailed) {
      const key = r.division || '—';
      if (!divAgg.has(key)) {
        divAgg.set(key, {
          division: key,
          primaryHours: 0,
          primaryAccrued: 0,
          tripHours: 0,
          tripAccrued: 0,
          travel: 0,
        });
      }
      const a = divAgg.get(key)!;
      a.primaryHours = r2(a.primaryHours + r.totalHours);
      a.primaryAccrued = money(a.primaryAccrued + r.accrued);
      a.tripHours = r2(a.tripHours + r.extraTotalHours);
      a.tripAccrued = money(a.tripAccrued + r.extraAccrued);
      a.travel = money(a.travel + r.travel);
    }
    const byDivision = [...divAgg.values()]
      .sort((a, b) => a.division.localeCompare(b.division, 'ru'))
      .map((a, i) => {
        const hoursAccrued = money(a.primaryAccrued + a.tripAccrued);
        const oneTime = a.travel;
        return {
          n: i + 1,
          division: a.division,
          primaryHours: a.primaryHours,
          primaryAccrued: a.primaryAccrued,
          tripHours: a.tripHours,
          tripAccrued: a.tripAccrued,
          hoursAccrued,
          travel: oneTime,
          oneTimeTotal: oneTime,
          total: money(hoursAccrued + oneTime),
        };
      });

    // renumber detailed after filter (already sequential)
    detailed.forEach((r, i) => {
      r.n = i + 1;
    });

    return {
      title: 'Расходы по подразделениям',
      from: fromIso,
      to: toIso,
      periodLine,
      generatedAt: new Date().toISOString(),
      planDays,
      settings: { showUserPlanFact: cfg.showUserPlanFact !== false },
      days: dayList,
      detailed,
      additional,
      byDivision,
      // legacy
      year: from.getFullYear(),
      month: from.getMonth() + 1,
      rows: byDivision,
    };
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
    const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    const periodLine = `Книга начисления заработной платы за ${pad(1)}.${pad(m)}.${y} - ${pad(to.getDate())}.${pad(m)}.${y}`;

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        baseSalary: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        grade: { select: { name: true } },
        person: { select: { pinfl: true, inn: true, inps: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      return true;
    });

    const empIds = filtered.map((e) => e.id);
    const days =
      empIds.length === 0
        ? []
        : await this.prisma.attendanceDay.findMany({
            where: {
              tenantId,
              employeeId: { in: empIds },
              workDate: { gte: from, lte: to },
            },
            select: {
              employeeId: true,
              status: true,
              workedHours: true,
              firstInAt: true,
              lastOutAt: true,
            },
          });
    const workBy = new Map<string, { days: number; hours: number }>();
    for (const d of days) {
      const worked =
        d.status === DayStatus.on_time ||
        d.status === DayStatus.late ||
        !!(d.firstInAt || d.lastOutAt);
      if (!worked) continue;
      const cur = workBy.get(d.employeeId) || { days: 0, hours: 0 };
      cur.days += 1;
      const h =
        d.workedHours != null
          ? Number(d.workedHours)
          : d.firstInAt && d.lastOutAt && d.lastOutAt.getTime() > d.firstInAt.getTime()
            ? (d.lastOutAt.getTime() - d.firstInAt.getTime()) / 3_600_000
            : 0;
      cur.hours += h > 0 ? h : 0;
      workBy.set(d.employeeId, cur);
    }

    const period = await this.prisma.payrollPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year: y, month: m } },
    });
    const lines = period
      ? await this.prisma.payrollLine.findMany({
          where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
          select: { employeeId: true, type: true, amount: true, description: true },
        })
      : [];
    const advances = period
      ? await this.prisma.payrollAdvance.findMany({
          where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
          select: { employeeId: true, amount: true },
        })
      : [];
    type Acc = {
      base: number;
      otherAcc: number;
      tax: number;
      inps: number;
      otherDed: number;
      fineLate: number;
      fineEarly: number;
      fineAbsent: number;
      fineSkip: number;
      loan: number;
      advance: number;
      otherPay: number;
    };
    const accBy = new Map<string, Acc>();
    const emptyAcc = (): Acc => ({
      base: 0,
      otherAcc: 0,
      tax: 0,
      inps: 0,
      otherDed: 0,
      fineLate: 0,
      fineEarly: 0,
      fineAbsent: 0,
      fineSkip: 0,
      loan: 0,
      advance: 0,
      otherPay: 0,
    });
    for (const l of lines) {
      const a = Number(l.amount) || 0;
      const cur = accBy.get(l.employeeId) || emptyAcc();
      const desc = (l.description || '').toLowerCase();
      if (l.type === PayrollLineType.base) cur.base += a;
      else if (l.type === PayrollLineType.bonus || l.type === PayrollLineType.overtime || l.type === PayrollLineType.one_time)
        cur.otherAcc += a;
      else if (l.type === PayrollLineType.advance) cur.advance += a;
      else if (l.type === PayrollLineType.penalty) {
        if (desc.includes('опозда') || desc.includes('late')) cur.fineLate += Math.abs(a);
        else if (desc.includes('ранн') || desc.includes('early')) cur.fineEarly += Math.abs(a);
        else if (desc.includes('отсут') || desc.includes('absent')) cur.fineAbsent += Math.abs(a);
        else if (desc.includes('пропуск') || desc.includes('skip')) cur.fineSkip += Math.abs(a);
        else cur.otherDed += Math.abs(a);
      } else if (l.type === PayrollLineType.deduction) {
        if (desc.includes('налог') || desc.includes('ндфл') || desc.includes('income tax')) cur.tax += Math.abs(a);
        else if (desc.includes('инпс') || desc.includes('inps')) cur.inps += Math.abs(a);
        else if (desc.includes('заем') || desc.includes('займ') || desc.includes('loan')) cur.loan += Math.abs(a);
        else cur.otherDed += Math.abs(a);
      } else cur.otherAcc += a;
      accBy.set(l.employeeId, cur);
    }
    for (const adv of advances) {
      const cur = accBy.get(adv.employeeId) || emptyAcc();
      cur.advance += Number(adv.amount) || 0;
      accBy.set(adv.employeeId, cur);
    }

    const rows = filtered.map((e, i) => {
      const salary = e.baseSalary != null ? Number(e.baseSalary) : 0;
      const work = workBy.get(e.id) || { days: 0, hours: 0 };
      const acc = accBy.get(e.id) || emptyAcc();
      const accruedBase = money(acc.base);
      const accruedOther = money(acc.otherAcc);
      const accruedTotal = money(accruedBase + accruedOther);
      const deductionTotal = money(
        acc.tax + acc.inps + acc.otherDed + acc.fineLate + acc.fineEarly + acc.fineAbsent + acc.fineSkip + acc.loan,
      );
      const paidTotal = money(acc.advance + acc.otherPay);
      const opening = 0;
      const closing = money(opening + accruedTotal - deductionTotal - paidTotal);
      return {
        n: i + 1,
        employeeId: e.id,
        tabNumber: e.tabNumber || '',
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        pinfl: e.person?.pinfl || '',
        inn: e.person?.inn || '',
        inps: e.person?.inps || '',
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        grade: e.grade?.name || '',
        salary: money(salary),
        plannedSalary: money(salary),
        workedDays: work.days,
        workedHours: r2(work.hours),
        openingBalance: money(opening),
        accruedBase,
        accruedOther,
        accruedTotal,
        taxIncome: money(acc.tax),
        taxInps: money(acc.inps),
        deductionOther: money(acc.otherDed),
        fineLate: money(acc.fineLate),
        fineEarly: money(acc.fineEarly),
        fineAbsent: money(acc.fineAbsent),
        fineSkipDay: money(acc.fineSkip),
        loan: money(acc.loan),
        deductionTotal,
        advance: money(acc.advance),
        paymentOther: money(acc.otherPay),
        paidTotal,
        closingBalance: closing,
        socialTax: 0,
        ytdIncome: 0,
        ytdIncomeTax: 0,
        ytdSocialTax: 0,
      };
    });

    return {
      title: 'Книга начисления заработной платы',
      year: y,
      month: m,
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(to.getDate())}`,
      periodLine,
      generatedAt: new Date().toISOString(),
      rows,
    };
  }

  /**
   * Verifix «Оборотно-сальдовая ведомость по счету»
   * Builds OSV-style rows from payroll lines in the period (HR approximation of GL).
   */
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
    const account = String(opts.account || '').trim();
    if (!account) {
      throw new BadRequestException('Укажите счет');
    }
    const from = parseDateParam(
      opts.from,
      startOfCurrentMonth(),
      'from',
    );
    const to = parseDateParam(opts.to, new Date(), 'to');
    const showQty = Boolean(opts.showQty);
    const showAmount = opts.showAmount !== false;
    const currency = String(opts.currency || '').trim();
    const subcontoFilter = String(opts.subconto || '')
      .trim()
      .toLowerCase();

    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const extras =
      settings?.extras &&
      typeof settings.extras === 'object' &&
      !Array.isArray(settings.extras)
        ? (settings.extras as Record<string, unknown>)
        : {};
    const abr =
      extras.accountBalanceReport &&
      typeof extras.accountBalanceReport === 'object'
        ? (extras.accountBalanceReport as Record<string, unknown>)
        : {};
    const empty =
      abr.defaultCellValue != null ? String(abr.defaultCellValue) : '';

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId },
      select: { id: true, year: true, month: true },
    });
    const periodIds = periods
      .filter((p) => {
        const start = new Date(p.year, p.month - 1, 1);
        const end = new Date(p.year, p.month, 0, 23, 59, 59);
        return end >= from && start <= to;
      })
      .map((p) => p.id);

    const lines = periodIds.length
      ? await this.prisma.payrollLine.findMany({
          where: { tenantId, periodId: { in: periodIds } },
          include: {
            employee: {
              select: {
                id: true,
                tabNumber: true,
                firstName: true,
                lastName: true,
                middleName: true,
                division: { select: { name: true } },
              },
            },
          },
        })
      : [];

    type Agg = {
      subconto: string;
      qty: number;
      debit: number;
      credit: number;
    };
    const map = new Map<string, Agg>();

    for (const l of lines) {
      const e = l.employee;
      const name = [e.lastName, e.firstName, e.middleName]
        .filter(Boolean)
        .join(' ');
      const label = e.tabNumber
        ? `${e.tabNumber} — ${name}`
        : name || e.id;
      if (
        subcontoFilter &&
        !label.toLowerCase().includes(subcontoFilter) &&
        !(e.division?.name || '').toLowerCase().includes(subcontoFilter)
      ) {
        continue;
      }
      if (!map.has(e.id)) {
        map.set(e.id, { subconto: label, qty: 0, debit: 0, credit: 0 });
      }
      const row = map.get(e.id)!;
      row.qty += 1;
      const amt = Number(l.amount) || 0;
      if (l.type === 'deduction' || amt < 0) {
        row.credit += Math.abs(amt);
      } else {
        row.debit += Math.abs(amt);
      }
    }

    const fmt = (n: number) => {
      if (!showAmount) return empty;
      if (!n && empty !== '') return empty;
      return Math.round(n * 100) / 100;
    };
    const fmtQty = (n: number) => {
      if (!showQty) return undefined;
      if (!n && empty !== '') return empty;
      return n;
    };

    const rows = [...map.values()]
      .sort((a, b) => a.subconto.localeCompare(b.subconto, 'ru'))
      .map((r) => {
        const closingDebit =
          r.debit > r.credit ? r.debit - r.credit : 0;
        const closingCredit =
          r.credit > r.debit ? r.credit - r.debit : 0;
        return {
          subconto: r.subconto,
          openingDebit: fmt(0),
          openingCredit: fmt(0),
          turnoverDebit: fmt(r.debit),
          turnoverCredit: fmt(r.credit),
          closingDebit: fmt(closingDebit),
          closingCredit: fmt(closingCredit),
          ...(showQty ? { qty: fmtQty(r.qty) } : {}),
        };
      });

    // totals
    const totDebit = [...map.values()].reduce((s, x) => s + x.debit, 0);
    const totCredit = [...map.values()].reduce((s, x) => s + x.credit, 0);
    const totQty = [...map.values()].reduce((s, x) => s + x.qty, 0);

    return {
      title: 'Оборотно-сальдовая ведомость по счету',
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      account,
      currency: currency || null,
      subconto: opts.subconto || null,
      showQty,
      showAmount,
      emptyValue: empty,
      totals: {
        turnoverDebit: fmt(totDebit),
        turnoverCredit: fmt(totCredit),
        ...(showQty ? { qty: fmtQty(totQty) } : {}),
      },
      rows,
    };
  }

  /**
   * Verifix «Оборотно-сальдовая ведомость» (общая, без выбора счёта).
   */
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
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const to = parseDateParam(opts.to, new Date(), 'to');
    const showQty = Boolean(opts.showQty);
    const showAmount = opts.showAmount !== false;
    const excludeExtra = Boolean(opts.excludeExtra);
    const currency = String(opts.currency || '').trim();
    const subcontoFilter = String(opts.subconto || '')
      .trim()
      .toLowerCase();

    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const extras =
      settings?.extras &&
      typeof settings.extras === 'object' &&
      !Array.isArray(settings.extras)
        ? (settings.extras as Record<string, unknown>)
        : {};
    const accMap =
      extras.accountSettings && typeof extras.accountSettings === 'object'
        ? (extras.accountSettings as Record<string, string>)
        : {};
    const accrualAcc =
      accMap.payrollSettlements ||
      '6710. Расчеты с персоналом по оплате труда';
    const deductAcc =
      accMap.deductions || '6710. Расчеты с персоналом по оплате труда';

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId },
      select: { id: true, year: true, month: true },
    });
    const periodIds = periods
      .filter((p) => {
        const start = new Date(p.year, p.month - 1, 1);
        const end = new Date(p.year, p.month, 0, 23, 59, 59);
        return end >= from && start <= to;
      })
      .map((p) => p.id);

    const lines = periodIds.length
      ? await this.prisma.payrollLine.findMany({
          where: { tenantId, periodId: { in: periodIds } },
          include: {
            employee: {
              select: {
                id: true,
                tabNumber: true,
                firstName: true,
                lastName: true,
                middleName: true,
                division: { select: { name: true } },
              },
            },
          },
        })
      : [];

    type Agg = {
      account: string;
      subconto: string;
      qty: number;
      debit: number;
      credit: number;
    };
    const map = new Map<string, Agg>();

    for (const l of lines) {
      if (
        excludeExtra &&
        ['bonus', 'other', 'overtime'].includes(String(l.type))
      ) {
        continue;
      }
      const e = l.employee;
      const name = [e.lastName, e.firstName, e.middleName]
        .filter(Boolean)
        .join(' ');
      const sub = e.tabNumber ? `${e.tabNumber} — ${name}` : name || e.id;
      if (
        subcontoFilter &&
        !sub.toLowerCase().includes(subcontoFilter) &&
        !(e.division?.name || '').toLowerCase().includes(subcontoFilter)
      ) {
        continue;
      }
      const amt = Number(l.amount) || 0;
      const isDed = l.type === 'deduction' || amt < 0;
      const account = isDed ? deductAcc : accrualAcc;
      const key = `${account}||${sub}`;
      if (!map.has(key)) {
        map.set(key, { account, subconto: sub, qty: 0, debit: 0, credit: 0 });
      }
      const row = map.get(key)!;
      row.qty += 1;
      if (isDed) row.credit += Math.abs(amt);
      else row.debit += Math.abs(amt);
    }

    const fmt = (n: number) => {
      if (!showAmount) return '';
      return Math.round(n * 100) / 100;
    };

    const rows = [...map.values()]
      .sort(
        (a, b) =>
          a.account.localeCompare(b.account, 'ru') ||
          a.subconto.localeCompare(b.subconto, 'ru'),
      )
      .map((r) => ({
        account: r.account,
        subconto: r.subconto,
        openingDebit: fmt(0),
        openingCredit: fmt(0),
        turnoverDebit: fmt(r.debit),
        turnoverCredit: fmt(r.credit),
        closingDebit: fmt(r.debit > r.credit ? r.debit - r.credit : 0),
        closingCredit: fmt(r.credit > r.debit ? r.credit - r.debit : 0),
        ...(showQty ? { qty: r.qty } : {}),
      }));

    return {
      title: 'Оборотно-сальдовая ведомость',
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency: currency || null,
      subconto: opts.subconto || null,
      showQty,
      showAmount,
      excludeExtra,
      rows,
    };
  }

  /**
   * Verifix «Отчет по предварительному окладу»
   * Columns: № | Сотрудник | Подразделение | Должность | График работы |
   *          Начисление | Удержание | ИТОГО | Выплачено | Осталось
   */
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
    const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const monthsLong = [
      'Январь',
      'Февраль',
      'Март',
      'Апрель',
      'Май',
      'Июнь',
      'Июль',
      'Август',
      'Сентябрь',
      'Октябрь',
      'Ноябрь',
      'Декабрь',
    ];
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    const periodLine = `Месяц: ${monthsLong[m - 1]} ${y}`;

    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const scheduleLabel = (sch: {
      name?: string | null;
      code?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null) => {
      if (!sch) return '';
      const parsed = parseScheduleSettings(sch.settings);
      const pat = parsed.weekPattern || '6/1';
      const start = (sch.startTime || '09:00').slice(0, 5);
      const end = (sch.endTime || '18:00').slice(0, 5);
      const name = (sch.name || sch.code || '').trim();
      const core = `${start}-${end} (${pat})`;
      return name ? `${core} (${name})` : core;
    };
    const planDaysFor = (sch: { settings?: unknown } | null) => {
      const parsed = parseScheduleSettings(sch?.settings);
      const pat = parsed.weekPattern || '6/1';
      const dim = to.getDate();
      let days = 0;
      for (let d = 1; d <= dim; d++) {
        if (isDayOffByPattern(new Date(y, m - 1, d), pat)) continue;
        days += 1;
      }
      return days;
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        baseSalary: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        schedule: { select: { name: true, code: true, startTime: true, endTime: true, settings: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const pname = (e.position?.name || '').toLowerCase();
        if (!posNeedles.some((p) => p === e.positionId || pname === p || pname.includes(p))) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);

    const workBy = new Map<string, number>();
    if (empIds.length) {
      try {
        const days = await this.prisma.attendanceDay.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            workDate: { gte: from, lte: to },
          },
          select: {
            employeeId: true,
            status: true,
            workedHours: true,
            firstInAt: true,
            lastOutAt: true,
          },
        });
        for (const d of days) {
          const worked =
            d.status === DayStatus.on_time ||
            d.status === DayStatus.late ||
            !!(d.firstInAt || d.lastOutAt) ||
            (d.workedHours != null && Number(d.workedHours) > 0);
          if (!worked) continue;
          workBy.set(d.employeeId, (workBy.get(d.employeeId) || 0) + 1);
        }
      } catch {
        /* ignore missing attendance */
      }
    }

    const accruedBy = new Map<string, number>();
    const deductBy = new Map<string, number>();
    if (empIds.length) {
      try {
        const period = await this.prisma.payrollPeriod.findUnique({
          where: { tenantId_year_month: { tenantId, year: y, month: m } },
        });
        if (period) {
          const lines = await this.prisma.payrollLine.findMany({
            where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
            select: { employeeId: true, type: true, amount: true },
          });
          for (const l of lines) {
            const a = Number(l.amount) || 0;
            if (
              l.type === PayrollLineType.base ||
              l.type === PayrollLineType.bonus ||
              l.type === PayrollLineType.overtime ||
              l.type === PayrollLineType.one_time ||
              l.type === PayrollLineType.other
            ) {
              accruedBy.set(l.employeeId, (accruedBy.get(l.employeeId) || 0) + a);
            } else if (
              l.type === PayrollLineType.penalty ||
              l.type === PayrollLineType.deduction ||
              l.type === PayrollLineType.advance
            ) {
              deductBy.set(l.employeeId, (deductBy.get(l.employeeId) || 0) + Math.abs(a));
            }
          }
          const advances = await this.prisma.payrollAdvance.findMany({
            where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
            select: { employeeId: true, amount: true },
          });
          for (const adv of advances) {
            deductBy.set(adv.employeeId, (deductBy.get(adv.employeeId) || 0) + (Number(adv.amount) || 0));
          }
        }
      } catch {
        /* ignore */
      }
    }

    const paidBy = new Map<string, number>();
    for (const id of empIds) paidBy.set(id, 0);
    const addPaid = (employeeId: string | null | undefined, amount: unknown) => {
      if (!employeeId || !paidBy.has(employeeId)) return;
      const a = Number(amount) || 0;
      if (!a) return;
      paidBy.set(employeeId, (paidBy.get(employeeId) || 0) + a);
    };
    const isSchemaGap = (e: unknown) => {
      if (!e || typeof e !== 'object' || !('code' in e)) return false;
      const code = (e as { code?: string }).code;
      return code === 'P2021' || code === 'P2010' || code === 'P2022';
    };
    if (empIds.length) {
      try {
        const sheets = await this.prisma.payrollSheet.findMany({
          where: {
            tenantId,
            status: 'completed',
            OR: [
              { issueDate: { gte: from, lte: to } },
              { month: { gte: from, lte: to } },
            ],
          },
          select: {
            lines: {
              where: { employeeId: { in: empIds } },
              select: { employeeId: true, amount: true },
            },
          },
        });
        for (const sh of sheets) for (const line of sh.lines) addPaid(line.employeeId, line.amount);
      } catch (e) {
        if (!isSchemaGap(e)) throw e;
      }
      try {
        const orders = await this.prisma.paymentOrder.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            status: { notIn: ['cancelled', 'draft', 'void'] },
            OR: [{ dueDate: { gte: from, lte: to } }, { createdAt: { gte: from, lte: to } }],
          },
          select: { employeeId: true, amount: true },
        });
        for (const o of orders) addPaid(o.employeeId, o.amount);
      } catch (e) {
        if (!isSchemaGap(e)) throw e;
      }
    }

    const rows = filtered.map((e, i) => {
      const salary = e.baseSalary != null ? Number(e.baseSalary) : 0;
      const planDays = planDaysFor(e.schedule);
      const workedDays = workBy.get(e.id) || 0;
      let accrued = money(accruedBy.get(e.id) || 0);
      if (!accrued && salary > 0 && planDays > 0) {
        accrued = money((salary * workedDays) / planDays);
      }
      const deduction = money(deductBy.get(e.id) || 0);
      const total = money(Math.max(0, accrued - deduction));
      const paid = money(paidBy.get(e.id) || 0);
      const remaining = money(Math.max(0, total - paid));
      return {
        n: i + 1,
        employeeId: e.id,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        schedule: scheduleLabel(e.schedule),
        accrued,
        deduction,
        total,
        paid,
        remaining,
        planDays,
        workedDays,
        salary: money(salary),
      };
    });

    const totals = {
      accrued: money(rows.reduce((s, r) => s + r.accrued, 0)),
      deduction: money(rows.reduce((s, r) => s + r.deduction, 0)),
      total: money(rows.reduce((s, r) => s + r.total, 0)),
      paid: money(rows.reduce((s, r) => s + r.paid, 0)),
      remaining: money(rows.reduce((s, r) => s + r.remaining, 0)),
      count: rows.length,
    };

    return {
      title: 'Отчет по предварительному окладу',
      year: y,
      month: m,
      periodLine,
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(to.getDate())}`,
      generatedAt: new Date().toISOString(),
      rows,
      totals,
    };
  }

  /**
   * Verifix «ФОТ отчет»
   * Views: По сотрудникам | По локациям сотрудника | По локациям
   */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const fmtRu = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const parseDay = (s: string | undefined, fallback: Date) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    let cfg = { withNight: true, showExtraAttendance: true, showOvertime: true };
    if (opts.cfg) {
      try {
        const parsed = JSON.parse(opts.cfg) as Partial<typeof cfg> & { withNightTime?: boolean };
        cfg = {
          withNight: parsed.withNight ?? parsed.withNightTime ?? cfg.withNight,
          showExtraAttendance: parsed.showExtraAttendance ?? cfg.showExtraAttendance,
          showOvertime: parsed.showOvertime ?? cfg.showOvertime,
        };
      } catch {
        /* ignore */
      }
    }

    const now = new Date();
    const from = parseDay(opts.from, new Date(now.getFullYear(), now.getMonth(), 1));
    const to = parseDay(opts.to, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const fromIso = isoLocal(from);
    const toIso = isoLocal(to);
    const periodLine = `Период: от ${fmtRu(from)} до ${fmtRu(to)}`;

    const planDaysInMonth = (y: number, m0: number) => {
      const dim = new Date(y, m0 + 1, 0).getDate();
      let n = 0;
      for (let d = 1; d <= dim; d += 1) {
        if (new Date(y, m0, d).getDay() !== 0) n += 1;
      }
      return Math.max(n, 1);
    };
    const planDays = planDaysInMonth(from.getFullYear(), from.getMonth());

    const selectedDivs = ids(opts.divisionIds);
    const locationIds = ids(opts.locationIds);
    const positionIds = ids(opts.positionIds);
    const gradeIds = ids(opts.gradeIds);
    const employeeIds = ids(opts.employeeIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, name: true, locationId: true, location: { select: { name: true } } },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }
    if (locationIds.length) {
      const byLoc = new Set(
        divisions.filter((d) => d.locationId && locationIds.includes(d.locationId)).map((d) => d.id),
      );
      if (!allowedDiv) allowedDiv = byLoc;
      else allowedDiv = new Set([...allowedDiv].filter((id) => byLoc.has(id)));
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
        ...(gradeIds.length ? { gradeId: { in: gradeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        baseSalary: true,
        hiredAt: true,
        divisionId: true,
        positionId: true,
        gradeId: true,
        division: {
          select: {
            name: true,
            locationId: true,
            location: { select: { id: true, name: true } },
          },
        },
        position: { select: { name: true } },
        grade: { select: { name: true, code: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.some((p) => p === e.positionId || name === p || name.includes(p))) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);

    const attDays =
      empIds.length > 0
        ? await this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte: from, lte: to } },
            select: {
              employeeId: true,
              workDate: true,
              workedHours: true,
              overtimeHours: true,
              beforeHours: true,
              afterHours: true,
              outsideHours: true,
            },
          })
        : [];

    type DayAgg = { hours: number; worked: boolean };
    const byEmp = new Map<string, DayAgg>();
    for (const id of empIds) byEmp.set(id, { hours: 0, worked: false });

    const daySeen = new Map<string, Set<string>>();
    for (const d of attDays) {
      const iso = isoUtc(d.workDate) || isoLocal(d.workDate);
      let h = d.workedHours != null ? Number(d.workedHours) : 0;
      if (cfg.showOvertime && d.overtimeHours != null) h += Number(d.overtimeHours);
      if (cfg.withNight) {
        if (d.beforeHours != null) h += Number(d.beforeHours);
        if (d.afterHours != null) h += Number(d.afterHours);
      }
      if (cfg.showExtraAttendance && d.outsideHours != null) h += Number(d.outsideHours);
      const cur = byEmp.get(d.employeeId) || { hours: 0, worked: false };
      cur.hours += h;
      if (h > 0) {
        const set = daySeen.get(d.employeeId) || new Set<string>();
        set.add(iso);
        daySeen.set(d.employeeId, set);
        cur.worked = true;
      }
      byEmp.set(d.employeeId, cur);
    }

    const byEmployee = filtered.map((e, idx) => {
      const agg = byEmp.get(e.id) || { hours: 0, worked: false };
      const workedDays = daySeen.get(e.id)?.size || 0;
      const salary = e.baseSalary != null ? Number(e.baseSalary) : 0;
      const totalHours = r2(agg.hours);
      const accrued = money(planDays > 0 ? (salary * workedDays) / planDays : 0);
      const loc = e.division?.location?.name || '';
      const hired = e.hiredAt ? fmtRu(new Date(e.hiredAt)) : '';
      return {
        n: idx + 1,
        employeeId: e.id,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        grade: (e.grade?.name || e.grade?.code || '').toUpperCase(),
        salary: money(salary),
        totalHours,
        accrued,
        location: loc,
        locationId: e.division?.locationId || e.division?.location?.id || '',
        hiredAt: hired,
      };
    });

    const byEmpLocation = byEmployee.map((r, i) => ({
      n: i + 1,
      location: r.location,
      employee: r.employee,
      division: r.division,
      hiredAt: r.hiredAt,
      position: r.position,
      grade: r.grade,
      salary: r.salary,
      totalHours: r.totalHours,
      accrued: r.accrued,
    }));

    const locAgg = new Map<string, { location: string; hours: number; accrued: number }>();
    for (const r of byEmployee) {
      const key = r.location || '—';
      if (!locAgg.has(key)) locAgg.set(key, { location: key, hours: 0, accrued: 0 });
      const a = locAgg.get(key)!;
      a.hours = r2(a.hours + r.totalHours);
      a.accrued = money(a.accrued + r.accrued);
    }
    const byLocation = [...locAgg.values()]
      .sort((a, b) => a.location.localeCompare(b.location, 'ru'))
      .map((a, i) => ({
        n: i + 1,
        location: a.location,
        totalHours: a.hours,
        accrued: a.accrued,
      }));

    return {
      title: 'ФОТ отчет',
      from: fromIso,
      to: toIso,
      periodLine,
      generatedAt: new Date().toISOString(),
      planDays,
      settings: cfg,
      byEmployee,
      byEmpLocation,
      byLocation,
    };
  }

  /**
   * Verifix «Отчет по оплатам»
   * Columns: Сотрудник | Должность | Подразделение | Наличные | Безналичные | Итого
   */
  async paymentsReport(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      divisionIds?: string;
      employeeIds?: string;
    } = {},
  ) {
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivs = ids(opts.divisionIds);
    const employeeIds = ids(opts.employeeIds);
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const parseDay = (s: string | undefined, fallback: Date) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const now = new Date();
    const from = parseDay(opts.from, new Date(now.getFullYear(), now.getMonth(), 1));
    const to = parseDay(opts.to, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    to.setHours(23, 59, 59, 999);
    const fromIso = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
    const toIso = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`;
    const fmtRu = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walk = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walk(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walk(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      return true;
    });
    const empIds = filtered.map((e) => e.id);
    const byEmp = new Map<string, { cash: number; bank: number }>();
    for (const id of empIds) byEmp.set(id, { cash: 0, bank: 0 });
    const isBankHint = (...parts: Array<string | null | undefined>) => {
      const tip = parts.filter(Boolean).join(' ').toLowerCase();
      return /безнал|банк|card|карт|перевод|transfer|bank/.test(tip);
    };
    const addPay = (employeeId: string | null | undefined, amount: unknown, bank: boolean) => {
      if (!employeeId) return;
      const cur = byEmp.get(employeeId);
      if (!cur) return;
      const a = Number(amount) || 0;
      if (!a) return;
      if (bank) cur.bank += a;
      else cur.cash += a;
    };
    const isSchemaGap = (e: unknown) => {
      if (!e || typeof e !== 'object' || !('code' in e)) return false;
      const code = (e as { code?: string }).code;
      // P2021/P2010 missing table; P2022 missing column — DB behind Prisma schema
      return code === 'P2021' || code === 'P2010' || code === 'P2022';
    };

    if (empIds.length) {
      // Ведомости (таблица может отсутствовать до миграции)
      try {
        const sheets = await this.prisma.payrollSheet.findMany({
          where: {
            tenantId,
            status: 'completed',
            OR: [
              { issueDate: { gte: from, lte: to } },
              { month: { gte: from, lte: to } },
            ],
          },
          select: {
            payType: true,
            lines: {
              where: { employeeId: { in: empIds } },
              select: { employeeId: true, amount: true },
            },
          },
        });
        for (const sh of sheets) {
          const bank = sh.payType === 'bank';
          for (const line of sh.lines) addPay(line.employeeId, line.amount, bank);
        }
      } catch (e) {
        if (!isSchemaGap(e)) throw e;
      }

      // Авансы / выплаты
      try {
        const advances = await this.prisma.payrollAdvance.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            status: 'paid',
            OR: [
              { paidAt: { gte: from, lte: to } },
              { AND: [{ paidAt: null }, { createdAt: { gte: from, lte: to } }] },
            ],
          },
          select: { employeeId: true, amount: true, note: true },
        });
        for (const a of advances) addPay(a.employeeId, a.amount, isBankHint(a.note));
      } catch (e) {
        if (!isSchemaGap(e)) throw e;
      }

      // Платёжные поручения (схема БД может отставать от Prisma)
      try {
        const orders = await this.prisma.paymentOrder.findMany({
          where: {
            tenantId,
            employeeId: { in: empIds },
            status: { notIn: ['cancelled', 'canceled', 'draft', 'void'] },
            OR: [
              { dueDate: { gte: from, lte: to } },
              { AND: [{ dueDate: null }, { createdAt: { gte: from, lte: to } }] },
            ],
          },
          select: { employeeId: true, amount: true, title: true, note: true },
        });
        for (const o of orders) addPay(o.employeeId, o.amount, isBankHint(o.title, o.note));
      } catch (e) {
        if (!isSchemaGap(e)) throw e;
      }
    }

    const rows = filtered
      .map((e) => {
        const pay = byEmp.get(e.id) || { cash: 0, bank: 0 };
        const cash = money(pay.cash);
        const bank = money(pay.bank);
        return {
          employeeId: e.id,
          tabNumber: e.tabNumber || '',
          employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
          position: (e.position?.name || '').toUpperCase(),
          division: (e.division?.name || '').toUpperCase(),
          cash,
          bank,
          total: money(cash + bank),
        };
      })
      .filter((r) => r.total !== 0 || employeeIds.length > 0 || selectedDivs.length > 0);

    // If nothing paid and no filters — still return empty list (Verifix style). With filters show zeros.
    const showRows =
      rows.length === 0 && (employeeIds.length > 0 || selectedDivs.length > 0)
        ? filtered.map((e) => ({
            employeeId: e.id,
            tabNumber: e.tabNumber || '',
            employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
            position: (e.position?.name || '').toUpperCase(),
            division: (e.division?.name || '').toUpperCase(),
            cash: 0,
            bank: 0,
            total: 0,
          }))
        : rows.filter((r) => r.total !== 0).length
          ? rows.filter((r) => r.total !== 0)
          : rows;

    const totals = showRows.reduce(
      (a, r) => {
        a.cash += r.cash;
        a.bank += r.bank;
        a.total += r.total;
        return a;
      },
      { cash: 0, bank: 0, total: 0 },
    );

    return {
      title: 'Отчет по оплатам',
      from: fromIso,
      to: toIso,
      startDateLabel: `Дата начала: ${fmtRu(from)}`,
      endDateLabel: `Дата окончания: ${fmtRu(to)}`,
      periodLine: `${fmtRu(from)} — ${fmtRu(to)}`,
      generatedAt: new Date().toISOString(),
      rows: showRows,
      totals: {
        cash: money(totals.cash),
        bank: money(totals.bank),
        total: money(totals.total),
      },
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    let startTime = (opts.startTime || '09:00').trim() || '09:00';
    let endTime = (opts.endTime || '18:00').trim() || '18:00';
    if (opts.cfg) {
      try {
        const parsed = JSON.parse(opts.cfg) as { startTime?: string; endTime?: string };
        if (parsed.startTime) startTime = parsed.startTime;
        if (parsed.endTime) endTime = parsed.endTime;
      } catch {
        /* ignore */
      }
    }
    const normHm = (s: string, fallback: string) => {
      const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
      return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : fallback;
    };
    startTime = normHm(startTime, '09:00');
    endTime = normHm(endTime, '18:00');

    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const employeeIds = ids(opts.employeeIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const atHm = (day: Date, hm: string) => {
      const [h, m] = hm.split(':').map(Number);
      const x = new Date(day);
      x.setHours(h || 0, m || 0, 0, 0);
      return x;
    };
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const overlapH = (a0: number, a1: number, w0: number, w1: number) => {
      const s = Math.max(a0, w0);
      const e = Math.min(a1, w1);
      return e > s ? (e - s) / 3_600_000 : 0;
    };
    const planHoursOf = (start: string, end: string, lunch = true) => {
      let d = toMin(end) - toMin(start);
      if (d < 0) d += 24 * 60;
      if (lunch && d >= 8 * 60) d -= 60;
      return r2(d / 60);
    };
    const empKind = (t?: string | null) => (t === 'gph' ? 'ГПХ' : 'Основное место работы');

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, name: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        employmentType: true,
        position: { select: { name: true } },
        staffPosition: { select: { title: true } },
        schedule: { select: { startTime: true, endTime: true, settings: true } },
        division: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      return true;
    });

    const dayList: {
      iso: string;
      dd: string;
      weekday: string;
      weekend: boolean;
      dateLabel: string;
    }[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      const ymd = isoLocal(cur);
      const dow = cur.getDay();
      dayList.push({
        iso: ymd,
        dd: pad(cur.getDate()),
        weekday: weekdays[dow],
        weekend: dow === 0 || dow === 6,
        dateLabel: `${pad(cur.getDate())}.${pad(cur.getMonth() + 1)}.${cur.getFullYear()}`,
      });
      if (dayList.length > 366) break;
    }

    const empIds = filtered.map((e) => e.id);
    const windowStart = atHm(gte, startTime);
    const windowEndDay = new Date(lte);
    const endMins = toMin(endTime);
    const startMins = toMin(startTime);
    windowEndDay.setHours(Math.floor(endMins / 60), endMins % 60, 59, 999);
    if (endMins <= startMins) windowEndDay.setDate(windowEndDay.getDate() + 1);

    const [days, marks] = await Promise.all([
      empIds.length
        ? this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              status: true,
              firstInAt: true,
              lastOutAt: true,
              plannedHours: true,
              workedHours: true,
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.attendanceMark.findMany({
            where: {
              tenantId,
              employeeId: { in: empIds },
              occurredAt: { gte: new Date(windowStart.getTime() - 12 * 3600000), lte: windowEndDay },
            },
            select: { employeeId: true, occurredAt: true, direction: true },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const recByEmpDay = new Map<string, (typeof days)[number]>();
    for (const d of days) {
      recByEmpDay.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recByEmpDay.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }
    const marksByEmp = new Map<string, typeof marks>();
    for (const m of marks) {
      if (!m.employeeId) continue;
      const list = marksByEmp.get(m.employeeId) || [];
      list.push(m);
      marksByEmp.set(m.employeeId, list);
    }

    const hoursInWindow = (
      rec: { firstInAt: Date | null; lastOutAt: Date | null } | undefined,
      empMarks: typeof marks,
      day: Date,
    ) => {
      const w0 = atHm(day, startTime).getTime();
      let w1 = atHm(day, endTime).getTime();
      if (w1 <= w0) w1 += 24 * 3600000;
      const intervals: [number, number][] = [];
      if (rec?.firstInAt && rec.lastOutAt) {
        let a0 = rec.firstInAt.getTime();
        let a1 = rec.lastOutAt.getTime();
        if (a1 < a0) a1 += 24 * 3600000;
        intervals.push([a0, a1]);
      } else if (empMarks.length) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);
        const local = empMarks.filter((m) => m.occurredAt >= dayStart && m.occurredAt <= dayEnd);
        let open: number | null = null;
        for (const m of local) {
          const t = m.occurredAt.getTime();
          if (m.direction === 'OUT' && open != null) {
            intervals.push([open, t]);
            open = null;
          } else if (m.direction !== 'OUT') {
            if (open == null) open = t;
          }
        }
        if (!intervals.length && local.length >= 2) {
          intervals.push([local[0].occurredAt.getTime(), local[local.length - 1].occurredAt.getTime()]);
        }
      }
      let sum = 0;
      for (const [a0, a1] of intervals) sum += overlapH(a0, a1, w0, w1);
      const hours = r2(sum);
      return hours > 0 ? hours : null;
    };

    const rows = filtered.map((e, i) => {
      const sch = e.schedule;
      const parsed = parseScheduleSettings(sch?.settings);
      const planIn = sch?.startTime || startTime;
      const planOut = sch?.endTime || endTime;
      const empMarks = marksByEmp.get(e.id) || [];
      const hours: (number | null)[] = [];
      const detail: {
        iso: string;
        dateLabel: string;
        weekday: string;
        weekend: boolean;
        dayOff: boolean;
        planIn: string;
        planOut: string;
        planHours: number | null;
        fact: number | null;
      }[] = [];
      let total = 0;
      let hasFact = false;
      let planSum = 0;
      for (const d of dayList) {
        const rec = recByEmpDay.get(`${e.id}|${d.iso}`);
        const off =
          isDayOffByPattern(parseYmd(d.iso), parsed.weekPattern || '6/1') || rec?.status === DayStatus.day_off;
        const fact = hoursInWindow(rec, empMarks, parseYmd(d.iso));
        hours.push(fact);
        if (fact != null) {
          total += fact;
          hasFact = true;
        }
        const planH = off
          ? null
          : rec?.plannedHours != null
            ? Number(rec.plannedHours)
            : parsed.dayNormHours ?? planHoursOf(planIn, planOut);
        if (planH != null) planSum += Number(planH);
        detail.push({
          iso: d.iso,
          dateLabel: d.dateLabel,
          weekday: d.weekday,
          weekend: d.weekend,
          dayOff: off,
          planIn: off ? '' : planIn,
          planOut: off ? '' : planOut,
          planHours: off ? null : planH == null ? null : r2(Number(planH)),
          fact,
        });
      }
      return {
        n: i + 1,
        employeeId: e.id,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        tabNumber: e.tabNumber || '',
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        staffPosition: (e.staffPosition?.title || '').toUpperCase(),
        employment: empKind(e.employmentType),
        hours,
        total: hasFact ? r2(total) : null,
        planTotal: r2(planSum),
        days: detail,
      };
    });

    const periodLine = `Период: ${pad(parseYmd(fromIso).getDate())} ${months[parseYmd(fromIso).getMonth()]} ${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())} ${months[parseYmd(toIso).getMonth()]} ${parseYmd(toIso).getFullYear()}`;

    return {
      title: 'Почасовой отчет по посещениям',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      startTime,
      endTime,
      periodLine,
      timeLine: `Время периода: ${startTime} - ${endTime}`,
      days: dayList,
      rows,
    };
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
    if (opts.layout === 'calendar') {
      return this.divisionModeCalendarReport(tenantId, opts);
    }
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selected = ids(opts.divisionIds);
    const selectedGroups = ids(opts.groupIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: {
        id: true,
        parentId: true,
        name: true,
        divisionGroupId: true,
        divisionGroup: { select: { id: true, name: true } },
        schedule: { select: { name: true, startTime: true, endTime: true, settings: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (opts.useGroups && selectedGroups.length) {
      allowed = new Set(
        divisions.filter((d) => d.divisionGroupId && selectedGroups.includes(d.divisionGroupId)).map((d) => d.id),
      );
    } else if (selected.length) {
      allowed = new Set();
      for (const id of selected) walkIds(id, allowed);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(allowed ? { divisionId: { in: [...allowed] } } : {}),
      },
      select: {
        id: true,
        divisionId: true,
        schedule: { select: { name: true, startTime: true, endTime: true, settings: true } },
      },
    });

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoUtc = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const isoLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const ruDay = (ymd: string) => {
      const d = parseYmd(ymd);
      return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };
    const hoursOf = (v: unknown) => {
      if (v == null) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const schedMeta = (sch?: { name: string; startTime: string; endTime: string; settings: unknown } | null) => {
      const parsed = parseScheduleSettings(sch?.settings);
      const pat = parsed.weekPattern || '6/1';
      const norm = parsed.dayNormHours ?? 8;
      const range = `${sch?.startTime || '09:00'}-${sch?.endTime || '18:00'}`;
      const label =
        sch?.name && /\d{1,2}:\d{2}/.test(sch.name) ? sch.name : `${range} (${pat})`;
      return { label, pat, norm };
    };

    const dayList: { iso: string; label: string; sunday: boolean }[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      const ymd = isoLocal(cur);
      dayList.push({
        iso: ymd,
        label: `${pad(cur.getDate())}.${pad(cur.getMonth() + 1)}.${cur.getFullYear()}`,
        sunday: cur.getDay() === 0,
      });
      if (dayList.length > 366) break;
    }

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte, lte },
        ...(employees.length ? { employeeId: { in: employees.map((e) => e.id) } } : { employeeId: { in: [] } }),
      },
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        plannedHours: true,
        workedHours: true,
      },
    });
    const recByEmpDay = new Map<string, { status: string; plannedHours: unknown; workedHours: unknown }>();
    for (const d of days) {
      recByEmpDay.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recByEmpDay.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }

    type Bucket = {
      id: string;
      name: string;
      schedule: string;
      pat: string;
      norm: number;
      empIds: string[];
    };
    const buckets = new Map<string, Bucket>();
    const empsByDiv = new Map<string, string[]>();
    for (const e of employees) {
      if (!e.divisionId) continue;
      const list = empsByDiv.get(e.divisionId) || [];
      list.push(e.id);
      empsByDiv.set(e.divisionId, list);
    }

    const sourceDivs = divisions.filter((d) => !allowed || allowed.has(d.id));
    for (const d of sourceDivs) {
      const meta = schedMeta(d.schedule);
      const key = opts.useGroups ? d.divisionGroup?.id || d.id : d.id;
      const name = opts.useGroups ? d.divisionGroup?.name || d.name : d.name;
      let b = buckets.get(key);
      if (!b) {
        b = { id: key, name, schedule: meta.label, pat: meta.pat, norm: meta.norm, empIds: [] };
        buckets.set(key, b);
      }
      b.empIds.push(...(empsByDiv.get(d.id) || []));
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const rows = [...buckets.values()].map((b) => {
      const cells = dayList.map((day) => {
        const dt = parseYmd(day.iso);
        const off = isDayOffByPattern(dt, (b.pat as '6/1' | '5/2' | '5/1') || '6/1');
        const planned = off ? 0 : b.norm;
        let workedSum = 0;
        let counted = 0;
        if (!off) {
          for (const empId of b.empIds) {
            const rec = recByEmpDay.get(`${empId}|${day.iso}`);
            if (!rec || rec.status === 'day_off') continue;
            workedSum += hoursOf(rec.workedHours);
            counted += 1;
          }
        }
        const worked = counted ? workedSum / counted : 0;
        return {
          iso: day.iso,
          planned: round2(planned),
          worked: round2(worked),
          diff: off ? 0 : round2(worked - planned),
          off,
        };
      });
      const totals = cells.reduce(
        (acc, c) => {
          if (c.off) return acc;
          acc.planned += c.planned;
          acc.worked += c.worked;
          acc.diff += c.diff;
          return acc;
        },
        { planned: 0, worked: 0, diff: 0 },
      );
      return {
        id: b.id,
        division: b.name.toUpperCase(),
        schedule: b.schedule,
        cells,
        totals: {
          planned: round2(totals.planned),
          worked: round2(totals.worked),
          diff: round2(totals.diff),
        },
      };
    });
    rows.sort((a, b) => a.division.localeCompare(b.division, 'ru'));

    return {
      title: 'Отчет по режиму работы подразделения (период)',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      periodLine: `Период: ${ruDay(fromIso)} - ${ruDay(toIso)}`,
      days: dayList,
      rows: rows.map((r, i) => ({ n: i + 1, ...r })),
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selected = ids(opts.divisionIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: {
        id: true,
        parentId: true,
        name: true,
        divisionGroupId: true,
        divisionGroup: { select: { id: true, name: true } },
        schedule: { select: { name: true, startTime: true, endTime: true, settings: true } },
        manager: { select: { lastName: true, firstName: true, middleName: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowed: Set<string> | null = null;
    if (selected.length) {
      allowed = new Set();
      for (const id of selected) walkIds(id, allowed);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(allowed ? { divisionId: { in: [...allowed] } } : {}),
      },
      select: { id: true, divisionId: true },
    });

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoUtc = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const isoLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const ruDay = (ymd: string) => {
      const d = parseYmd(ymd);
      return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };
    const hoursOf = (v: unknown) => {
      if (v == null) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const personName = (p?: { lastName?: string | null; firstName?: string | null; middleName?: string | null } | null) =>
      [p?.lastName, p?.firstName, p?.middleName].filter(Boolean).join(' ').toUpperCase();
    const schedMeta = (sch?: { name: string; startTime: string; endTime: string; settings: unknown } | null) => {
      const parsed = parseScheduleSettings(sch?.settings);
      const pat = parsed.weekPattern || '6/1';
      const range = `${sch?.startTime || '09:00'}-${sch?.endTime || '18:00'}`;
      const label =
        sch?.name && /\d{1,2}:\d{2}/.test(sch.name) ? sch.name : `${range} (${pat})`;
      return { label, pat, norm: parsed.dayNormHours ?? 8 };
    };

    const dayList: { iso: string; day: string; weekday: string; sunday: boolean }[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      const ymd = isoLocal(cur);
      dayList.push({
        iso: ymd,
        day: pad(cur.getDate()),
        weekday: weekdays[cur.getDay()],
        sunday: cur.getDay() === 0,
      });
      if (dayList.length > 366) break;
    }

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte, lte },
        ...(employees.length ? { employeeId: { in: employees.map((e) => e.id) } } : { employeeId: { in: [] } }),
      },
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        workedHours: true,
        lateMinutes: true,
        firstInAt: true,
      },
    });
    const recByEmpDay = new Map<
      string,
      { status: string; workedHours: unknown; lateMinutes: number | null; firstInAt: Date | null }
    >();
    for (const d of days) {
      recByEmpDay.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recByEmpDay.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }

    const empsByDiv = new Map<string, string[]>();
    for (const e of employees) {
      if (!e.divisionId) continue;
      const list = empsByDiv.get(e.divisionId) || [];
      list.push(e.id);
      empsByDiv.set(e.divisionId, list);
    }

    const groupManager = opts.managerGroupId
      ? personName(divisions.find((d) => d.divisionGroupId === opts.managerGroupId && d.manager)?.manager)
      : '';

    const sourceDivs = divisions.filter((d) => {
      if (allowed && !allowed.has(d.id)) return false;
      return (empsByDiv.get(d.id) || []).length > 0;
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const rows = sourceDivs.map((d) => {
      const meta = schedMeta(d.schedule);
      const empIds = empsByDiv.get(d.id) || [];
      let absentDays = 0;
      const cells = dayList.map((day) => {
        const dt = parseYmd(day.iso);
        const scheduleOff = isDayOffByPattern(dt, (meta.pat as '6/1' | '5/2' | '5/1') || '6/1');
        let worked = 0;
        let late = 0;
        let hoursSum = 0;
        for (const empId of empIds) {
          const rec = recByEmpDay.get(`${empId}|${day.iso}`);
          if (scheduleOff || rec?.status === 'day_off') continue;
          if (
            rec &&
            (rec.status === 'on_time' || rec.status === 'late' || rec.firstInAt || hoursOf(rec.workedHours) > 0)
          ) {
            worked += 1;
            hoursSum += hoursOf(rec.workedHours);
            if (rec.status === 'late' || (rec.lateMinutes || 0) > 0) late += 1;
          }
        }
        if (scheduleOff) {
          return { iso: day.iso, text: 'В', kind: 'off' as const, hours: 0, absent: 0 };
        }
        if (!worked) {
          absentDays += 1;
          return { iso: day.iso, text: 'X', kind: 'absent' as const, hours: 0, absent: 1 };
        }
        return {
          iso: day.iso,
          text: '',
          kind: late ? ('late' as const) : ('work' as const),
          hours: round2(hoursSum / worked),
          absent: 0,
        };
      });
      return {
        id: d.id,
        division: d.name.toUpperCase(),
        schedule: meta.label,
        group: d.divisionGroup?.name || '',
        manager: groupManager || personName(d.manager),
        cells,
        absentTotal: absentDays,
      };
    });
    rows.sort((a, b) => a.division.localeCompare(b.division, 'ru'));

    const totalsCells = dayList.map((day, i) => {
      const abs = rows.reduce((n, r) => n + (r.cells[i]?.absent || 0), 0);
      return { iso: day.iso, text: abs ? String(abs) : '', kind: 'total' as const, hours: 0, absent: abs };
    });

    return {
      title: 'Отчет по режиму работы подразделений',
      layout: 'calendar',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      periodLine: `Период: ${ruDay(fromIso)} - ${ruDay(toIso)}`,
      days: dayList,
      rows: rows.map((r, i) => ({ n: i + 1, ...r })),
      totals: {
        cells: totalsCells,
        absentTotal: rows.reduce((n, r) => n + r.absentTotal, 0),
      },
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const endDefault = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59, 999);
    })();
    const lte = parseDateParam(opts.to, endDefault, 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowedDiv = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowedDiv);
    }

    const emps = await this.prisma.employee.findMany({
      where: {
        tenantId,
        ...(employeeIds.length ? { id: { in: employeeIds } } : { status: 'active' }),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        grade: { select: { name: true } },
      },
      orderBy: { tabNumber: 'asc' },
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = emps.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const pid = (e.positionId || '').toLowerCase();
        const pname = (e.position?.name || '').toLowerCase();
        const hit = posNeedles.some(
          (p) => p === pid || p === pname || (!!pname && (pname.includes(p) || p.includes(pname))),
        );
        if (!hit) return false;
      }
      return true;
    });
    const empIds = filtered.map((e) => e.id);
    const days = empIds.length
      ? await this.prisma.attendanceDay.findMany({
          where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
          select: {
            employeeId: true,
            status: true,
            lateMinutes: true,
            earlyLeaveMinutes: true,
          },
        })
      : [];

    type Agg = {
      lateCount: number;
      lateSum: number;
      lateMax: number;
      absentCount: number;
      onTimeCount: number;
      earlyCount: number;
      earlySum: number;
      earlyMax: number;
      dayOffCount: number;
    };
    const byEmp = new Map<string, Agg>();
    const ensure = (id: string): Agg => {
      let a = byEmp.get(id);
      if (!a) {
        a = {
          lateCount: 0,
          lateSum: 0,
          lateMax: 0,
          absentCount: 0,
          onTimeCount: 0,
          earlyCount: 0,
          earlySum: 0,
          earlyMax: 0,
          dayOffCount: 0,
        };
        byEmp.set(id, a);
      }
      return a;
    };

    for (const d of days) {
      const a = ensure(d.employeeId);
      const late = d.lateMinutes > 0 || d.status === DayStatus.late;
      if (late) {
        a.lateCount += 1;
        a.lateSum += d.lateMinutes;
        if (d.lateMinutes > a.lateMax) a.lateMax = d.lateMinutes;
      }
      if (d.status === DayStatus.absent) a.absentCount += 1;
      if (d.status === DayStatus.on_time) a.onTimeCount += 1;
      if (d.earlyLeaveMinutes > 0) {
        a.earlyCount += 1;
        a.earlySum += d.earlyLeaveMinutes;
        if (d.earlyLeaveMinutes > a.earlyMax) a.earlyMax = d.earlyLeaveMinutes;
      }
      if (d.status === DayStatus.day_off) a.dayOffCount += 1;
    }

    const avg = (sum: number, count: number) =>
      count > 0 ? Math.round(sum / count) : 0;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ruDay = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;

    const rows = filtered
      .filter((e) => byEmp.has(e.id))
      .map((e) => {
        const a = byEmp.get(e.id)!;
        const fullName = [e.lastName, e.firstName, e.middleName]
          .filter(Boolean)
          .join(' ')
          .toUpperCase();
        return {
          employeeId: e.id,
          tabNumber: e.tabNumber,
          fullName,
          division: (e.division?.name ?? '').toUpperCase(),
          position: (e.position?.name ?? '').toUpperCase(),
          grade: e.grade?.name ?? '',
          lateCount: a.lateCount,
          lateAvgMinutes: avg(a.lateSum, a.lateCount),
          lateMaxMinutes: a.lateMax,
          absentCount: a.absentCount,
          onTimeCount: a.onTimeCount,
          earlyCount: a.earlyCount,
          earlyAvgMinutes: avg(a.earlySum, a.earlyCount),
          earlyMaxMinutes: a.earlyMax,
          dayOffCount: a.dayOffCount,
        };
      });

    const fromIso = iso(gte);
    const toIso = iso(lte);
    return {
      title: 'Отчет по дисциплине посещений',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      periodLine: `Период: ${ruDay(gte)} - ${ruDay(lte)}`,
      rows,
    };
  }

  async disciplineEmployeeDetail(
    tenantId: string,
    employeeId: string,
    from?: string,
    to?: string,
  ) {
    const gte = parseDateParam(from, startOfCurrentMonth(), 'from');
    const endDefault = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59, 999);
    })();
    const lte = parseDateParam(to, endDefault, 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        grade: { select: { name: true } },
      },
    });
    if (!emp) throw new NotFoundException('Сотрудник не найден');

    const days = await this.prisma.attendanceDay.findMany({
      where: { tenantId, employeeId, workDate: { gte, lte } },
      select: {
        workDate: true,
        status: true,
        firstInAt: true,
        lastOutAt: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        plannedHours: true,
        onTimeHours: true,
        workedHours: true,
      },
    });
    const byIso = new Map(
      days.map((d) => [
        `${d.workDate.getFullYear()}-${String(d.workDate.getMonth() + 1).padStart(2, '0')}-${String(d.workDate.getDate()).padStart(2, '0')}`,
        d,
      ]),
    );

    const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ruDay = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const hm = (d?: Date | null) => {
      if (!d) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const hoursOf = (v: unknown) => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    };
    const hoursBetween = (a?: Date | null, b?: Date | null) => {
      if (!a || !b) return null;
      const ms = b.getTime() - a.getTime();
      if (ms <= 0) return 0;
      return Math.round((ms / 3_600_000) * 100) / 100;
    };

    const rows: Array<{
      iso: string;
      date: string;
      weekday: string;
      sunday: boolean;
      dayOff: boolean;
      planIn: string;
      planOut: string;
      planNorm: number | null;
      factIn: string;
      factOut: string;
      worked: number | null;
      absenceReason: string;
      onTime: number | null;
      absenceByReason: number | null;
      absenceNoReason: number | null;
      total: number | null;
      late: boolean;
      missingOut: boolean;
    }> = [];

    const start = new Date(gte.getFullYear(), gte.getMonth(), gte.getDate());
    const end = new Date(lte.getFullYear(), lte.getMonth(), lte.getDate());
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const key = iso(cur);
      const rec = byIso.get(key);
      const sunday = cur.getDay() === 0;
      const dayOff = sunday || rec?.status === DayStatus.day_off;
      const late = !!rec && (rec.lateMinutes > 0 || rec.status === DayStatus.late);
      const leave = rec?.status === DayStatus.leave;
      const planned = hoursOf(rec?.plannedHours) ?? (dayOff ? null : 8);
      const factIn = hm(rec?.firstInAt);
      const missingOut = !!(rec?.firstInAt && !rec.lastOutAt);
      const factOut = rec?.lastOutAt ? hm(rec.lastOutAt) : missingOut ? 'xxxx' : '';
      const worked =
        hoursOf(rec?.workedHours) ??
        hoursBetween(rec?.firstInAt, rec?.lastOutAt) ??
        (dayOff || !rec ? null : 0);
      const onTime =
        hoursOf(rec?.onTimeHours) ??
        (rec?.status === DayStatus.on_time ? worked : dayOff ? null : 0);
      const absenceByReason = leave ? planned : null;
      const absenceNoReason =
        dayOff || leave
          ? null
          : planned != null
            ? Math.round(Math.max(0, planned - (worked || 0)) * 100) / 100
            : null;
      rows.push({
        iso: key,
        date: `${String(cur.getDate()).padStart(2, '0')}.${String(cur.getMonth() + 1).padStart(2, '0')}.${cur.getFullYear()}`,
        weekday: WEEKDAYS[cur.getDay()],
        sunday,
        dayOff,
        planIn: dayOff ? '' : '09:00',
        planOut: dayOff ? '' : '18:00',
        planNorm: dayOff ? null : planned,
        factIn: dayOff ? '' : factIn,
        factOut: dayOff ? '' : factOut,
        worked: dayOff ? null : worked,
        absenceReason: leave ? 'Отпуск' : '',
        onTime: dayOff ? null : onTime,
        absenceByReason: dayOff ? null : absenceByReason,
        absenceNoReason: dayOff ? null : absenceNoReason,
        total: dayOff ? null : worked,
        late: !dayOff && late,
        missingOut: !dayOff && missingOut,
      });
    }

    const sum = (pick: (r: (typeof rows)[number]) => number | null) =>
      Math.round(rows.reduce((s, r) => s + (pick(r) || 0), 0) * 100) / 100;
    const fullName = [emp.lastName, emp.firstName, emp.middleName]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    return {
      title: 'Отчет по дисциплине посещений',
      generatedAt: new Date().toISOString(),
      from: iso(gte),
      to: iso(lte),
      periodLine: `Период: ${ruDay(gte)} - ${ruDay(lte)}`,
      employee: {
        id: emp.id,
        tabNumber: emp.tabNumber,
        fullName,
        division: (emp.division?.name ?? '').toUpperCase(),
        position: (emp.position?.name ?? '').toUpperCase(),
        grade: emp.grade?.name ?? '',
      },
      days: rows,
      totals: {
        planNorm: sum((r) => r.planNorm),
        worked: sum((r) => r.worked),
        onTime: sum((r) => r.onTime),
        absenceByReason: sum((r) => r.absenceByReason),
        absenceNoReason: sum((r) => r.absenceNoReason),
        total: sum((r) => r.total),
      },
    };
  }

  async timesheetAdjustmentReport(
    tenantId: string,
    opts: { from?: string; to?: string; divisionIds?: string } = {},
  ) {
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const toRaw = parseDateParam(opts.to, new Date(), 'to');
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate());
    if (end < start) {
      throw new BadRequestException('Invalid period: "to" is before "from"');
    }
    const days: string[] = [];
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      days.push(iso(cur));
      if (days.length > 366) {
        throw new BadRequestException('Period is too long (max 366 days)');
      }
    }
    const toEnd = new Date(end);
    toEnd.setHours(23, 59, 59, 999);

    const selected = (opts.divisionIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [divisions, adjustments] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, name: true, code: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.timesheetAdjustment.findMany({
        where: { tenantId, workDate: { gte: start, lte: toEnd } },
        select: {
          workDate: true,
          employeeId: true,
          employee: { select: { divisionId: true } },
        },
      }),
    ]);

    const allowed = selected.length ? new Set(selected) : null;

    const buckets = new Map<string, Set<string>>();
    for (const a of adjustments) {
      const divId = a.employee?.divisionId || '';
      if (allowed && !allowed.has(divId)) continue;
      const key = `${divId}|${iso(a.workDate)}`;
      const set = buckets.get(key) || new Set<string>();
      set.add(a.employeeId);
      buckets.set(key, set);
    }

    const visible = allowed
      ? divisions.filter((d) => allowed!.has(d.id))
      : divisions;

    const rows = visible.map((d) => {
      const counts = days.map((day) => buckets.get(`${d.id}|${day}`)?.size || 0);
      return {
        id: d.id,
        name: d.name,
        code: d.code || '',
        counts,
        total: counts.reduce((s, n) => s + n, 0),
      };
    });
    const unknownCounts = days.map((day) => buckets.get(`|${day}`)?.size || 0);
    const unknownTotal = unknownCounts.reduce((s, n) => s + n, 0);
    if (unknownTotal && !allowed) {
      rows.push({
        id: 'none',
        name: '—',
        code: '',
        counts: unknownCounts,
        total: unknownTotal,
      });
    }

    const colTotals = days.map((_, i) => rows.reduce((s, r) => s + r.counts[i], 0));
    const grandTotal = colTotals.reduce((s, n) => s + n, 0);

    return {
      title: 'Отчет по корректировке табеля',
      printTitle: 'Кол-во сотрудников, которые изменили факты c корректировкой табеля по каждому подразделениям',
      from: iso(start),
      to: iso(end),
      generatedAt: new Date().toISOString(),
      days,
      rows,
      colTotals,
      grandTotal,
    };
  }

  async dismissalsByDivision(
    tenantId: string,
    opts: { from?: string; to?: string } = {},
  ) {
    const from = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const toRaw = parseDateParam(opts.to, new Date(), 'to');
    const to = new Date(toRaw);
    to.setHours(23, 59, 59, 999);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const [positions, divisions, employees] = await Promise.all([
      this.prisma.position.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { tenantId, dismissedAt: { gte: from, lte: to } },
        select: { positionId: true, divisionId: true },
      }),
    ]);

    const counts = new Map<string, number>();
    let unknownPos = 0;
    let unknownDiv = 0;
    for (const e of employees) {
      if (!e.positionId) unknownPos += 1;
      if (!e.divisionId) unknownDiv += 1;
      const key = `${e.positionId || ''}|${e.divisionId || ''}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const posList = positions.map((p) => ({ id: p.id, name: p.name }));
    if (unknownPos) posList.push({ id: '', name: '—' });
    const divList = divisions.map((d) => ({ id: d.id, name: d.name }));
    if (unknownDiv) divList.push({ id: '', name: '—' });

    const rows = posList.map((p) => {
      const cells = divList.map((d) => counts.get(`${p.id}|${d.id}`) || 0);
      return {
        id: p.id || 'none',
        position: p.name,
        counts: cells,
        total: cells.reduce((s, n) => s + n, 0),
      };
    });
    const colTotals = divList.map((_, i) => rows.reduce((s, r) => s + r.counts[i], 0));

    return {
      title: 'Отчет увольнений по подразделениям',
      printTitle: 'Увольнение по подразделению',
      from: iso(from),
      to: iso(toRaw),
      generatedAt: new Date().toISOString(),
      divisions: divList.map((d) => ({ id: d.id, name: d.name })),
      rows,
      colTotals,
      grandTotal: colTotals.reduce((s, n) => s + n, 0),
    };
  }

  /**
   * Verifix «Причины увольнений» dashboard — one query + in-memory aggregates.
   */
  async dismissalDashboard(tenantId: string, from?: string, to?: string) {
    const gte = from ? parseDateParam(from, new Date(0), 'from') : undefined;
    const lte = to ? parseDateParam(to, new Date(), 'to') : undefined;
    if (lte) lte.setHours(23, 59, 59, 999);

    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: 'dismissed',
    };
    if (gte || lte) {
      where.dismissedAt = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    }

    const rows = await this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        hiredAt: true,
        dismissedAt: true,
        baseSalary: true,
        employmentSource: true,
        dismissalDestination: true,
        isKeyEmployee: true,
        salaryMarketLevel: true,
        division: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
        dismissalReason: { select: { id: true, name: true, code: true } },
        person: { select: { birthDate: true } },
      },
    });

    const now = new Date();
    const tenureYears: number[] = [];
    const ages: number[] = [];
    let salarySum = 0;
    let salaryN = 0;

    const byDivision = new Map<string, { id: string | null; label: string; count: number }>();
    const byPosition = new Map<string, { id: string | null; label: string; count: number }>();
    const bySource = new Map<string, number>();
    const byReason = new Map<string, number>();
    const byDestination = new Map<string, number>();
    const flows = new Map<string, number>(); // reason||dest
    let keyYes = 0;
    let keyNo = 0;
    const salaryLevel = {
      below_market: 0,
      at_market: 0,
      above_market: 0,
      unknown: 0,
    };
    const tenureBuckets = {
      '<1': 0,
      '1-2': 0,
      '2-3': 0,
      '3-4': 0,
      '4-5': 0,
      '5+': 0,
    };

    const yearMs = 365.25 * 24 * 60 * 60 * 1000;

    for (const r of rows) {
      const divKey = r.division?.id || '_none';
      const divLabel = r.division?.name || 'Без подразделения';
      const dPrev = byDivision.get(divKey);
      if (dPrev) dPrev.count += 1;
      else byDivision.set(divKey, { id: r.division?.id ?? null, label: divLabel, count: 1 });

      const posKey = r.position?.id || '_none';
      const posLabel = r.position?.name || 'Без должности';
      const pPrev = byPosition.get(posKey);
      if (pPrev) pPrev.count += 1;
      else byPosition.set(posKey, { id: r.position?.id ?? null, label: posLabel, count: 1 });

      const source = (r.employmentSource || '').trim() || 'Нет информации';
      bySource.set(source, (bySource.get(source) || 0) + 1);

      const reason = r.dismissalReason?.name || 'Нет информации';
      byReason.set(reason, (byReason.get(reason) || 0) + 1);

      const dest = (r.dismissalDestination || '').trim() || 'Нет информации';
      byDestination.set(dest, (byDestination.get(dest) || 0) + 1);

      const flowKey = `${reason}\t${dest}`;
      flows.set(flowKey, (flows.get(flowKey) || 0) + 1);

      if (r.isKeyEmployee) keyYes += 1;
      else keyNo += 1;

      if (r.salaryMarketLevel === 'below_market') salaryLevel.below_market += 1;
      else if (r.salaryMarketLevel === 'at_market') salaryLevel.at_market += 1;
      else if (r.salaryMarketLevel === 'above_market') salaryLevel.above_market += 1;
      else salaryLevel.unknown += 1;

      const end = r.dismissedAt || now;
      if (r.hiredAt) {
        const years = Math.max(0, (end.getTime() - r.hiredAt.getTime()) / yearMs);
        tenureYears.push(years);
        if (years < 1) tenureBuckets['<1'] += 1;
        else if (years < 2) tenureBuckets['1-2'] += 1;
        else if (years < 3) tenureBuckets['2-3'] += 1;
        else if (years < 4) tenureBuckets['3-4'] += 1;
        else if (years < 5) tenureBuckets['4-5'] += 1;
        else tenureBuckets['5+'] += 1;
      }

      if (r.person?.birthDate) {
        const age =
          (end.getTime() - r.person.birthDate.getTime()) / yearMs;
        if (age > 0 && age < 100) ages.push(age);
      }

      if (r.baseSalary != null) {
        const sal = Number(r.baseSalary);
        if (!Number.isNaN(sal) && sal > 0) {
          salarySum += sal;
          salaryN += 1;
        }
      }
    }

    const sortDesc = <T extends { count: number }>(arr: T[]) =>
      arr.sort((a, b) => b.count - a.count);

    const avg = (xs: number[]) =>
      xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;

    return {
      title: 'Причины увольнений',
      kpis: {
        dismissals: rows.length,
        avgTenureYears: avg(tenureYears),
        avgAge: avg(ages),
        avgSalary: salaryN
          ? Math.round((salarySum / salaryN) * 100) / 100
          : 0,
      },
      byDivision: sortDesc([...byDivision.values()]),
      byPosition: sortDesc([...byPosition.values()]),
      bySource: sortDesc(
        [...bySource.entries()].map(([label, count]) => ({ label, count })),
      ),
      byReason: sortDesc(
        [...byReason.entries()].map(([label, count]) => ({ label, count })),
      ),
      byDestination: sortDesc(
        [...byDestination.entries()].map(([label, count]) => ({ label, count })),
      ),
      flows: [...flows.entries()]
        .map(([key, count]) => {
          const [reason, destination] = key.split('\t');
          return { reason, destination, count };
        })
        .sort((a, b) => b.count - a.count),
      value: [
        { label: 'Ключевой', count: keyYes },
        { label: 'Не ключевой', count: keyNo },
      ],
      salaryLevel: [
        { key: 'below_market', label: 'Ниже рынка', count: salaryLevel.below_market },
        { key: 'at_market', label: 'На уровне рынка', count: salaryLevel.at_market },
        { key: 'above_market', label: 'Выше рынка', count: salaryLevel.above_market },
      ],
      tenure: [
        { label: '<1', count: tenureBuckets['<1'] },
        { label: '1-2', count: tenureBuckets['1-2'] },
        { label: '2-3', count: tenureBuckets['2-3'] },
        { label: '3-4', count: tenureBuckets['3-4'] },
        { label: '4-5', count: tenureBuckets['4-5'] },
        { label: '5+', count: tenureBuckets['5+'] },
      ],
    };
  }

  /**
   * Verifix «Кадровые изменения» — one employee load + in-memory series.
   */
  async personnelChangesDashboard(
    tenantId: string,
    opts: { year?: number; groupBy?: 'division' | 'position' } = {},
  ) {
    const year = opts.year ?? new Date().getFullYear();
    const groupBy = opts.groupBy === 'position' ? 'position' : 'division';
    const years = [year - 3, year - 2, year - 1, year];
    const yearMs = 365.25 * 24 * 60 * 60 * 1000;

    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        hiredAt: true,
        dismissedAt: true,
        divisionId: true,
        positionId: true,
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
        dismissalReason: { select: { id: true, name: true } },
      },
    });

    const inYear = (d: Date | null | undefined, y: number) => {
      if (!d) return false;
      return d.getFullYear() === y;
    };

    /** Was on staff at moment `at` (start of day). */
    const activeAt = (
      e: (typeof employees)[0],
      at: Date,
    ) => {
      if (e.hiredAt && e.hiredAt > at) return false;
      if (e.dismissedAt && e.dismissedAt < at) return false;
      // If never hired and currently dismissed with dismissedAt before at — skip
      if (!e.hiredAt && e.status === 'dismissed' && e.dismissedAt && e.dismissedAt < at) {
        return false;
      }
      if (!e.hiredAt && e.status !== 'active') return false;
      return true;
    };

    const metricsForYear = (y: number) => {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31, 23, 59, 59);
      let hired = 0;
      let dismissed = 0;
      let headStart = 0;
      let headEnd = 0;
      for (const e of employees) {
        if (inYear(e.hiredAt, y)) hired += 1;
        if (inYear(e.dismissedAt, y)) dismissed += 1;
        if (activeAt(e, start)) headStart += 1;
        if (activeAt(e, end)) headEnd += 1;
      }
      const ssch = (headStart + headEnd) / 2;
      const turnover = ssch > 0 ? (dismissed / ssch) * 100 : 0;
      return {
        year: y,
        hired,
        dismissed,
        headStart,
        headEnd,
        total: headEnd,
        ssch: Math.round(ssch * 100) / 100,
        turnover: Math.round(turnover * 100) / 100,
      };
    };

    const byPeriod = years.map(metricsForYear);
    const cur = byPeriod[byPeriod.length - 1];
    const prev = byPeriod[byPeriod.length - 2] || cur;

    const pctChange = (now: number, was: number) => {
      if (!was) return now ? 100 : 0;
      return Math.round(((now - was) / was) * 10000) / 100;
    };

    const currentHeadcount = employees.filter((e) => e.status === 'active').length;

    const kpis = {
      currentHeadcount,
      headStart: cur.headStart,
      headStartChange: pctChange(cur.headStart, prev.headStart),
      headEnd: cur.headEnd,
      headEndChange: pctChange(cur.headEnd, prev.headEnd),
      hired: cur.hired,
      hiredChange: pctChange(cur.hired, prev.hired),
      dismissed: cur.dismissed,
      dismissedChange: pctChange(cur.dismissed, prev.dismissed),
      turnover: cur.turnover,
      turnoverChange: pctChange(cur.turnover, prev.turnover),
      ssch: cur.ssch,
      sschChange: pctChange(cur.ssch, prev.ssch),
    };

    // By division/position for selected year
    type Agg = {
      id: string | null;
      label: string;
      hired: number;
      dismissed: number;
      headEnd: number;
      turnover: number;
    };
    const groupMap = new Map<string, Agg>();
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);
    for (const e of employees) {
      const id =
        groupBy === 'position' ? e.positionId : e.divisionId;
      const label =
        groupBy === 'position'
          ? e.position?.name || 'Без должности'
          : e.division?.name || 'Без подразделения';
      const key = id || '_none';
      let g = groupMap.get(key);
      if (!g) {
        g = { id, label, hired: 0, dismissed: 0, headEnd: 0, turnover: 0 };
        groupMap.set(key, g);
      }
      if (inYear(e.hiredAt, year)) g.hired += 1;
      if (inYear(e.dismissedAt, year)) g.dismissed += 1;
      if (activeAt(e, endOfYear)) g.headEnd += 1;
    }
    const byGroup = [...groupMap.values()]
      .map((g) => {
        const avg = Math.max(1, g.headEnd);
        return {
          ...g,
          turnover: Math.round((g.dismissed / avg) * 1000) / 10,
        };
      })
      .sort((a, b) => b.hired + b.dismissed - (a.hired + a.dismissed))
      .slice(0, 40);

    // Dismissal reasons: current year vs previous
    const reasonYears = [year - 1, year];
    const reasonMap = new Map<string, { label: string; counts: Record<number, number> }>();
    for (const e of employees) {
      if (!e.dismissedAt) continue;
      const y = e.dismissedAt.getFullYear();
      if (!reasonYears.includes(y)) continue;
      const label = e.dismissalReason?.name || 'Нет информации';
      let row = reasonMap.get(label);
      if (!row) {
        row = { label, counts: { [year - 1]: 0, [year]: 0 } };
        reasonMap.set(label, row);
      }
      row.counts[y] = (row.counts[y] || 0) + 1;
    }
    const dismissalReasons = [...reasonMap.values()]
      .map((r) => ({
        label: r.label,
        prev: r.counts[year - 1] || 0,
        curr: r.counts[year] || 0,
      }))
      .sort((a, b) => b.curr + b.prev - (a.curr + a.prev))
      .slice(0, 12);

    // Tenure at year-end for year and year-1 among those active then (or dismissed that year)
    const tenureBucketsFor = (y: number) => {
      const buckets = { '<1': 0, '1-3': 0, '3-5': 0, '>5': 0 };
      const at = new Date(y, 11, 31);
      for (const e of employees) {
        if (!e.hiredAt) continue;
        // Include if active at year end OR dismissed during year
        const active = activeAt(e, at);
        const dismissedY = inYear(e.dismissedAt, y);
        if (!active && !dismissedY) continue;
        const end = dismissedY && e.dismissedAt ? e.dismissedAt : at;
        const yearsTen = Math.max(0, (end.getTime() - e.hiredAt.getTime()) / yearMs);
        if (yearsTen < 1) buckets['<1'] += 1;
        else if (yearsTen < 3) buckets['1-3'] += 1;
        else if (yearsTen < 5) buckets['3-5'] += 1;
        else buckets['>5'] += 1;
      }
      return buckets;
    };
    const tenPrev = tenureBucketsFor(year - 1);
    const tenCurr = tenureBucketsFor(year);
    const tenure = (['<1', '1-3', '3-5', '>5'] as const).map((label) => ({
      label,
      prev: tenPrev[label],
      curr: tenCurr[label],
    }));

    return {
      title: 'Кадровые изменения',
      year,
      prevYear: year - 1,
      groupBy,
      kpis,
      byPeriod,
      byGroup,
      dismissalReasons,
      tenure,
    };
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

  /** Tree for Verifix-style org chart by staff positions */
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

  /** Отчет по посещениям сотрудников */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const day = parseDateParam(opts.date, new Date(), 'date');
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const locationIds = ids(opts.locationIds);

    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = (d?: Date | null) => {
      if (!d) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const hoursOf = (v: unknown) => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    };
    const hoursBetween = (a?: Date | null, b?: Date | null) => {
      if (!a || !b) return null;
      const ms = b.getTime() - a.getTime();
      if (ms <= 0) return 0;
      return Math.round((ms / 3_600_000) * 100) / 100;
    };
    const planHours = (start: string, end: string, lunch = true) => {
      const toMin = (s: string) => {
        const [h, m] = String(s || '0:0').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      let d = toMin(end) - toMin(start);
      if (d < 0) d += 24 * 60;
      if (lunch && d >= 8 * 60) d -= 60;
      return Math.round((d / 60) * 100) / 100;
    };

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, locationId: true, name: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowedDiv = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        position: { select: { name: true } },
        schedule: { select: { startTime: true, endTime: true, settings: true } },
        division: {
          select: {
            id: true,
            name: true,
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) {
          return false;
        }
      }
      if (locationIds.length) {
        const loc = e.division?.locationId;
        if (!loc || !locationIds.includes(loc)) return false;
      }
      return true;
    });

    const empIds = filtered.map((e) => e.id);
    const [days, marks] = await Promise.all([
      empIds.length
        ? this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte: day, lte: dayEnd } },
            select: {
              employeeId: true,
              status: true,
              firstInAt: true,
              lastOutAt: true,
              plannedHours: true,
              workedHours: true,
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.attendanceMark.findMany({
            where: { tenantId, employeeId: { in: empIds }, occurredAt: { gte: day, lte: dayEnd } },
            select: {
              employeeId: true,
              occurredAt: true,
              direction: true,
              source: true,
              employee: { select: { lastName: true, firstName: true, middleName: true } },
              device: { select: { name: true, location: { select: { name: true } } } },
            },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    const dayByEmp = new Map(days.map((d) => [d.employeeId, d]));
    const marksByEmp = new Map<string, typeof marks>();
    for (const m of marks) {
      if (!m.employeeId) continue;
      const list = marksByEmp.get(m.employeeId) || [];
      list.push(m);
      marksByEmp.set(m.employeeId, list);
    }

    const rows = filtered.map((e, i) => {
      const rec = dayByEmp.get(e.id);
      const sch = e.schedule;
      const parsed = parseScheduleSettings(sch?.settings);
      const dayOff =
        isDayOffByPattern(day, parsed.weekPattern || '6/1') || rec?.status === DayStatus.day_off;
      const planIn = sch?.startTime || '09:00';
      const planOut = sch?.endTime || '18:00';
      const planNorm = hoursOf(rec?.plannedHours) ?? parsed.dayNormHours ?? planHours(planIn, planOut);
      const empMarks = marksByEmp.get(e.id) || [];
      const firstMark = empMarks[0];
      const lastMark = empMarks.length ? empMarks[empMarks.length - 1] : undefined;
      const factIn = rec?.firstInAt ? hm(rec.firstInAt) : firstMark ? hm(firstMark.occurredAt) : '';
      const missingOut = !!(factIn && !rec?.lastOutAt && empMarks.length < 2);
      const factOut = rec?.lastOutAt
        ? hm(rec.lastOutAt)
        : lastMark && lastMark !== firstMark
          ? hm(lastMark.occurredAt)
          : missingOut
            ? 'xx:xx'
            : '';
      const worked =
        hoursOf(rec?.workedHours) ??
        hoursBetween(rec?.firstInAt, rec?.lastOutAt) ??
        (factIn && factOut && factOut !== 'xx:xx'
          ? hoursBetween(firstMark?.occurredAt, lastMark?.occurredAt)
          : null);
      const markedName = firstMark?.employee
        ? [firstMark.employee.lastName, firstMark.employee.firstName, firstMark.employee.middleName]
            .filter(Boolean)
            .join(' ')
            .toUpperCase()
        : firstMark?.device?.name || '';
      return {
        n: i + 1,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        tabNumber: e.tabNumber || '',
        division: (e.division?.name || '').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        location: e.division?.location?.name || '',
        dayOff,
        planIn: dayOff ? '' : planIn,
        planOut: dayOff ? '' : planOut,
        planNorm: dayOff ? null : planNorm,
        factIn: dayOff ? '' : factIn,
        factOut: dayOff ? '' : factOut,
        worked: dayOff ? null : worked,
        marksPlan: dayOff ? '' : planIn,
        marksFact: dayOff ? '' : factIn,
        markStart: dayOff ? '' : firstMark ? hm(firstMark.occurredAt) : '',
        markEnd: dayOff ? '' : lastMark && lastMark !== firstMark ? hm(lastMark.occurredAt) : missingOut ? 'xx:xx' : '',
        markedBy: dayOff ? '' : markedName,
        markLocation: dayOff ? '' : firstMark?.device?.location?.name || e.division?.location?.name || '',
      };
    });

    const named = selectedDivisionIds
      .map((id) => divisions.find((d) => d.id === id)?.name)
      .filter(Boolean) as string[];
    const shown = named.slice(0, 10);
    const extra = named.length > 10 ? ', и другие' : '';
    const dateLabel = `${day.getDate()} ${months[day.getMonth()]} ${day.getFullYear()}`;

    return {
      title: 'Детальный отчет по отметкам',
      generatedAt: new Date().toISOString(),
      date: iso(day),
      dateLabel,
      periodLine: `Дата: ${dateLabel}`,
      divisionLine: shown.length ? `Подразделения: ${shown.join(', ')}${extra}` : '',
      rows,
    };
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(0, 0, 0, 0);
    const selectedDivisionIds = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const locationIds = ids(opts.locationIds);
    const groupIds = ids(opts.groupIds);
    type Cfg = {
      customWorked?: boolean;
      lunch?: boolean;
      hourlyFacts?: boolean;
      workStart?: string;
      workEnd?: string;
      countEarlyIn?: boolean;
      countLateOut?: boolean;
      weekendTime?: boolean;
      weekendCoeff?: boolean;
      weekendK?: number;
      missedAsAbsent?: boolean;
      roundHours?: boolean;
      roundType?: 'nearest' | 'up' | 'down';
      roundStep?: number;
      timeDisplay?: boolean;
      timeFormat?: 'clock' | 'text' | 'minutes' | 'hhmm';
      showArrival?: boolean;
      arrivalTime?: boolean;
      hideHours?: boolean;
      hideCodes?: boolean;
      absenceWithCoeff?: boolean;
      monthlyPlan?: boolean;
      managerGroupId?: string;
      includeInactive?: boolean;
      splitByDivision?: boolean;
      sortByDivision?: boolean;
      infoByRows?: boolean;
      infoByCols?: boolean;
      absenceByType?: boolean;
      timeTypeIds?: string[];
      internalTrip?: boolean;
      checkMarks?: boolean;
      markDetails?: boolean;
      dayMarkDetails?: boolean;
      markSchedule?: boolean;
      dailyFacts?: boolean;
    };
    let cfg: Cfg = {};
    try {
      cfg = opts.cfg ? (JSON.parse(opts.cfg) as Cfg) : {};
    } catch {
      cfg = {};
    }
    if (cfg.includeInactive) opts.includeInactive = true;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const toMin = (hhmm?: string) => {
      const [h, m] = String(hhmm || '09:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const startMin = toMin(cfg.workStart || '09:00');
    const endMin = toMin(cfg.workEnd || '18:00');
    const roundHours = (n: number) => {
      if (!cfg.roundHours) return round2(n);
      const step = cfg.roundStep && cfg.roundStep > 0 ? cfg.roundStep : 0.5;
      const q = n / step;
      const r =
        cfg.roundType === 'up' ? Math.ceil(q) : cfg.roundType === 'down' ? Math.floor(q) : Math.round(q);
      return round2(r * step);
    };
    const fmtHours = (h: number) => {
      if (cfg.timeFormat === 'text') {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return `${hh} ч ${String(mm).padStart(2, '0')} мин`;
      }
      if (cfg.timeFormat === 'minutes') return String(Math.round(h * 60));
      if (cfg.timeFormat === 'hhmm') {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
      return String(h);
    };

    const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = (d?: Date | null) => {
      if (!d) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const dayList: { iso: string; day: string; weekday: string; sunday: boolean }[] = [];
    for (let t = new Date(gte); t <= lte; t.setDate(t.getDate() + 1)) {
      const cur = new Date(t);
      dayList.push({
        iso: iso(cur),
        day: String(cur.getDate()).padStart(2, '0'),
        weekday: WEEKDAYS[cur.getDay()],
        sunday: cur.getDay() === 0,
      });
    }

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, locationId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivisionIds.length) {
      allowedDiv = new Set();
      for (const id of selectedDivisionIds) walkIds(id, allowedDiv);
    }
    const locByDiv = new Map(divisions.map((d) => [d.id, d.locationId]));

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        ...(employeeIds.length
          ? { id: { in: employeeIds } }
          : opts.includeInactive
            ? {}
            : { status: 'active' }),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        employmentType: true,
        hiredAt: true,
        phone: true,
        email: true,
        person: { select: { pinfl: true, firstName: true, lastName: true, middleName: true } },
        position: { select: { id: true, name: true } },
        staffPosition: { select: { title: true, code: true } },
        grade: { select: { name: true } },
        schedule: { select: { name: true } },
        region: { select: { name: true } },
        nameChanges: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { newLastName: true, newFirstName: true, newMiddleName: true },
        },
        division: {
          select: {
            id: true,
            name: true,
            code: true,
            locationId: true,
            legalEntity: true,
            divisionGroupId: true,
            location: { select: { name: true } },
            divisionGroup: { select: { name: true } },
            parent: { select: { name: true } },
            manager: { select: { lastName: true, firstName: true, middleName: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (groupIds.length && (!e.division?.divisionGroupId || !groupIds.includes(e.division.divisionGroupId))) {
        return false;
      }
      if (posNeedles.length) {
        const pid = (e.positionId || '').toLowerCase();
        const pname = (e.position?.name || '').toLowerCase();
        const hit = posNeedles.some(
          (p) => p === pid || p === pname || (!!pname && (pname.includes(p) || p.includes(pname))),
        );
        if (!hit) return false;
      }
      if (locationIds.length) {
        const loc = e.division?.locationId || (e.divisionId ? locByDiv.get(e.divisionId) : null);
        if (!loc || !locationIds.includes(loc)) return false;
      }
      return true;
    });

    const attDays = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte, lte },
        employeeId: { in: filtered.map((e) => e.id) },
      },
    });
    const byEmpDay = new Map<string, (typeof attDays)[number]>();
    for (const d of attDays) {
      byEmpDay.set(`${d.employeeId}|${iso(d.workDate)}`, d);
    }

    const groupManagerName = cfg.managerGroupId
      ? (() => {
          const gids = String(cfg.managerGroupId)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          const hit = filtered.find(
            (e) => e.division?.divisionGroupId && gids.includes(e.division.divisionGroupId) && e.division?.manager,
          );
          const m = hit?.division?.manager;
          return m ? [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' ').toUpperCase() : '';
        })()
      : '';

    const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const hoursOf = (row: (typeof attDays)[number] | undefined, sunday: boolean) => {
      if (!row) return 0;
      let inAt = row.firstInAt;
      let outAt = row.lastOutAt;
      if (cfg.customWorked && cfg.hourlyFacts && inAt && outAt) {
        const inM = minutesOf(inAt);
        const outM = minutesOf(outAt);
        const clipIn = cfg.countEarlyIn ? inM : Math.max(inM, startMin);
        const clipOut = cfg.countLateOut ? outM : Math.min(outM, endMin);
        const span = Math.max(0, clipOut - clipIn) / 60;
        const lunch = cfg.lunch !== false && span > 6 ? 1 : 0;
        let h = Math.max(0, span - lunch);
        if (h === 0 && row.workedHours != null) h = Number(row.workedHours);
        if (sunday && cfg.weekendCoeff) h *= Number(cfg.weekendK) || 1;
        if (sunday && !cfg.weekendTime && !cfg.weekendCoeff) return 0;
        return roundHours(h);
      }
      if (row.workedHours != null || row.onTimeHours != null) {
        let h = Number(row.workedHours ?? row.onTimeHours ?? 0);
        if (cfg.customWorked && cfg.lunch === false && inAt && outAt) {
          const span = (outAt.getTime() - inAt.getTime()) / 3600000;
          h = Math.max(0, span);
        }
        if (sunday && cfg.weekendCoeff) h *= Number(cfg.weekendK) || 1;
        if (sunday && cfg.customWorked && !cfg.weekendTime && !cfg.weekendCoeff) return 0;
        return roundHours(h);
      }
      if (inAt && outAt) {
        const span = (outAt.getTime() - inAt.getTime()) / 3600000;
        const lunch = (!cfg.customWorked || cfg.lunch !== false) && span > 6 ? 1 : 0;
        let h = Math.max(0, span - lunch);
        if (sunday && cfg.weekendCoeff) h *= Number(cfg.weekendK) || 1;
        return roundHours(h);
      }
      return 0;
    };
    const leaveLetter =
      cfg.absenceByType && Array.isArray(cfg.timeTypeIds) && cfg.timeTypeIds.length
        ? (
            await this.prisma.timeType
              .findFirst({
                where: { tenantId, id: { in: cfg.timeTypeIds } },
                select: { letterCode: true, code: true },
              })
              .catch(() => null)
          )
        : null;
    const leaveCode = leaveLetter?.letterCode || leaveLetter?.code || 'О';

    const tripSet = new Set<string>();
    if (cfg.internalTrip && filtered.length) {
      const trips = await this.prisma.internalTrip
        .findMany({
          where: {
            tenantId,
            employeeId: { in: filtered.map((e) => e.id) },
            startDate: { lte },
            endDate: { gte },
          },
          select: { employeeId: true, startDate: true, endDate: true },
        })
        .catch(() => []);
      for (const t of trips) {
        for (let x = new Date(t.startDate); x <= t.endDate && x <= lte; x.setDate(x.getDate() + 1)) {
          if (x >= gte) tripSet.add(`${t.employeeId}|${iso(x)}`);
        }
      }
    }

    const marksByDay = new Map<string, string[]>();
    if ((cfg.checkMarks || cfg.markDetails || cfg.dayMarkDetails || cfg.markSchedule) && filtered.length) {
      const markTo = new Date(lte);
      markTo.setHours(23, 59, 59, 999);
      const marks = await this.prisma.attendanceMark
        .findMany({
          where: {
            tenantId,
            employeeId: { in: filtered.map((e) => e.id) },
            occurredAt: { gte, lte: markTo },
          },
          select: { employeeId: true, occurredAt: true, direction: true },
          orderBy: { occurredAt: 'asc' },
        })
        .catch(() => []);
      for (const m of marks) {
        if (!m.employeeId) continue;
        const key = `${m.employeeId}|${iso(m.occurredAt)}`;
        const list = marksByDay.get(key) || [];
        list.push(`${m.direction === 'OUT' ? 'у' : 'п'}${hm(m.occurredAt)}`);
        marksByDay.set(key, list);
      }
    }

    const cellText = (kind: string, inAt?: Date | null, outAt?: Date | null, h = 0, extra = '') => {
      let body = '';
      if (kind === 'trip') body = cfg.hideCodes ? '' : 'К';
      else if (kind === 'off' || kind === 'absent' || kind === 'leave') {
        body = cfg.hideCodes ? '' : kind === 'off' ? 'В' : kind === 'leave' ? leaveCode : 'X';
      } else if (cfg.timeDisplay && cfg.timeFormat && cfg.timeFormat !== 'clock') {
        body = fmtHours(h);
      } else if (!cfg.showArrival || !cfg.arrivalTime) {
        body = cfg.hideHours ? '' : fmtHours(h);
      } else if (inAt && outAt) {
        if (cfg.infoByRows) {
          body = cfg.hideHours ? `${hm(inAt)}\n${hm(outAt)}` : `${hm(inAt)}\n${hm(outAt)}\n(${fmtHours(h)})`;
        } else if (cfg.infoByCols) {
          body = cfg.hideHours ? `${hm(inAt)} | ${hm(outAt)}` : `${hm(inAt)} | ${hm(outAt)} (${fmtHours(h)})`;
        } else {
          const core = `${hm(inAt)} - ${hm(outAt)}`;
          body = cfg.hideHours ? core : `${core} (${fmtHours(h)})`;
        }
      } else if (inAt) {
        body = `${hm(inAt)} - xx:xx`;
      } else {
        body = cfg.hideHours ? '' : fmtHours(h);
      }
      if (extra && (cfg.markDetails || cfg.dayMarkDetails || cfg.markSchedule)) {
        body = body ? `${body}\n${extra}` : extra;
      }
      return body;
    };

    const rows = filtered.map((e, i) => {
      const name = [e.lastName, e.firstName, e.middleName]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      const alt = e.nameChanges[0]
        ? [e.nameChanges[0].newLastName, e.nameChanges[0].newFirstName, e.nameChanges[0].newMiddleName]
            .filter(Boolean)
            .join(' ')
            .toUpperCase()
        : e.person
          ? [e.person.lastName, e.person.firstName, e.person.middleName].filter(Boolean).join(' ').toUpperCase()
          : '';
      const mgr = e.division?.manager
        ? [e.division.manager.lastName, e.division.manager.firstName, e.division.manager.middleName]
            .filter(Boolean)
            .join(' ')
            .toUpperCase()
        : groupManagerName;
      let planned = 0;
      let onTime = 0;
      let absentReason = 0;
      let lateMinutes = 0;
      let earlyMinutes = 0;
      let overtime = 0;
      let offSchedule = 0;
      let daysWorked = 0;
      let plannedDays = 0;
      let streak = 0;
      let maxStreak = 0;
      const cells = dayList.map((d) => {
        const rec = byEmpDay.get(`${e.id}|${d.iso}`);
        const dayKey = `${e.id}|${d.iso}`;
        const extraMarks = (marksByDay.get(dayKey) || []).join(' ');
        if (cfg.internalTrip && tripSet.has(dayKey)) {
          streak = 0;
          return { iso: d.iso, text: cellText('trip', null, null, 0, extraMarks), kind: 'leave' as const, hours: 0 };
        }
        if (d.sunday && (!rec || rec.status === 'day_off' || (!rec.firstInAt && rec.status !== 'leave'))) {
          streak = 0;
          return { iso: d.iso, text: cellText('off'), kind: 'off' as const, hours: 0 };
        }
        if (!d.sunday) {
          planned += 8;
          plannedDays += 1;
        }
        if (rec?.status === 'leave') {
          const add = cfg.absenceWithCoeff ? 8 : 8;
          absentReason += add;
          streak = 0;
          return { iso: d.iso, text: cellText('leave', null, null, 0, extraMarks), kind: 'leave' as const, hours: 0 };
        }
        if (rec?.status === 'day_off') {
          streak = 0;
          return { iso: d.iso, text: cellText('off'), kind: 'off' as const, hours: 0 };
        }
        const h = hoursOf(rec, d.sunday);
        const onlyOneMark = cfg.checkMarks && (marksByDay.get(dayKey) || []).length === 1;
        if (rec?.firstInAt && rec.lastOutAt && rec.firstInAt.getTime() !== rec.lastOutAt.getTime() && !onlyOneMark) {
          onTime += h;
          daysWorked += 1;
          lateMinutes += rec.lateMinutes || 0;
          earlyMinutes += rec.earlyLeaveMinutes || 0;
          overtime += Math.max(0, h - 8);
          if (rec.status === 'late' || (rec.lateMinutes || 0) > 0) {
            streak = 0;
            return { iso: d.iso, text: cellText('late', rec.firstInAt, rec.lastOutAt, h, extraMarks), kind: 'late' as const, hours: h };
          }
          streak = 0;
          return { iso: d.iso, text: cellText('work', rec.firstInAt, rec.lastOutAt, h, extraMarks), kind: 'work' as const, hours: h };
        }
        if (rec?.firstInAt || onlyOneMark) {
          streak = 0;
          offSchedule += 1;
          return {
            iso: d.iso,
            text: cellText('partial', rec?.firstInAt, null, 0, extraMarks),
            kind: 'partial' as const,
            hours: 0,
          };
        }
        const treatAbsent = !d.sunday && (cfg.missedAsAbsent !== false || !cfg.customWorked);
        if (treatAbsent) {
          streak += 1;
          maxStreak = Math.max(maxStreak, streak);
          return { iso: d.iso, text: cellText('absent'), kind: 'absent' as const, hours: 0 };
        }
        streak = 0;
        return { iso: d.iso, text: cellText('off'), kind: 'off' as const, hours: 0 };
      });
      const absentNoReason = round2(Math.max(0, planned - onTime - absentReason));
      const workCoeff = planned ? round2(onTime / planned) : 0;
      const daysCoeff = plannedDays ? round2(daysWorked / plannedDays) : 0;
      const hoursPerDay = daysWorked ? round2(onTime / daysWorked) : 0;
      const fineLateH = round2(lateMinutes / 60);
      const fineEarlyH = round2(earlyMinutes / 60);
      const fineAbsentH = absentNoReason;
      const fineTime = round2(fineLateH + fineEarlyH + fineAbsentH);
      return {
        n: i + 1,
        employee: name,
        tabNumber: e.tabNumber,
        position: e.position?.name || '',
        staffPos: e.staffPosition?.title || e.staffPosition?.code || '',
        department: e.division?.parent?.name || '',
        division: e.division?.name || '',
        divisionCode: e.division?.code || '',
        divisionGroup: e.division?.divisionGroup?.name || '',
        location: e.division?.location?.name || '',
        region: e.region?.name || '',
        grade: e.grade?.name || '',
        schedule: e.schedule?.name || '',
        hiredAt: e.hiredAt ? iso(e.hiredAt) : '',
        employmentType: e.employmentType || '',
        phone: e.phone || '',
        email: e.email || '',
        legalEntity: e.division?.legalEntity || '',
        pinfl: e.person?.pinfl || '',
        altName: alt && alt !== name ? alt : '',
        manager: mgr,
        cells,
        planned: cfg.monthlyPlan ? planned : planned,
        onTime: round2(onTime),
        absentReason,
        absentNoReason,
        total: round2(onTime),
        lateMinutes,
        earlyMinutes,
        overtime: round2(overtime),
        offSchedule,
        hoursWorked: round2(onTime),
        workCoeff,
        daysWorked,
        plannedDays,
        customNormDays: plannedDays,
        customNormHours: planned,
        daysCoeff,
        consecutiveAbsent: maxStreak,
        hoursPerDay,
        requestTime: '',
        fineLate: fineLateH,
        fineTime,
        workedWithFines: round2(Math.max(0, onTime - fineTime)),
        fineEarly: fineEarlyH,
        fineAbsent: fineAbsentH,
        origFineLate: fineLateH,
        origFineEarly: fineEarlyH,
        origFineAbsent: fineAbsentH,
        origFine: fineTime,
      };
    });
    if (cfg.sortByDivision || cfg.splitByDivision) {
      rows.sort((a, b) => a.division.localeCompare(b.division, 'ru') || a.employee.localeCompare(b.employee, 'ru'));
      rows.forEach((r, i) => {
        r.n = i + 1;
      });
    }

    const periodLine = `Период: ${String(gte.getDate()).padStart(2, '0')} ${months[gte.getMonth()]} ${gte.getFullYear()} - ${String(lte.getDate()).padStart(2, '0')} ${months[lte.getMonth()]} ${lte.getFullYear()}`;

    return {
      title: 'Отчет по посещениям сотрудников',
      from: iso(gte),
      to: iso(lte),
      periodLine,
      generatedAt: new Date().toISOString(),
      days: dayList,
      rows,
    };
  }

  /** Отчёт по позициям (Verifix: подразделения / должности / только подразделения) */
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
    const asOf = parseDateParam(opts.date, new Date(), 'date');
    const iso = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;
    const selected = (opts.divisionIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const divisionGroupId = opts.divisionGroupId?.trim() || undefined;
    const positionGroupId = opts.positionGroupId?.trim() || undefined;
    const positionId = opts.positionId?.trim() || undefined;

    const [divisions, staff] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, name: true, parentId: true, divisionGroupId: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.staffPosition.findMany({
        where: {
          tenantId,
          isActive: true,
          status: { not: 'closed' },
          AND: [
            { OR: [{ openedAt: null }, { openedAt: { lte: asOf } }] },
            { OR: [{ closedAt: null }, { closedAt: { gte: asOf } }] },
          ],
          ...(positionId ? { positionId } : {}),
        },
        include: {
          position: { select: { id: true, name: true, positionGroupId: true } },
          employees: {
            where: {
              AND: [
                { OR: [{ hiredAt: null }, { hiredAt: { lte: asOf } }] },
                { OR: [{ dismissedAt: null }, { dismissedAt: { gte: asOf } }] },
              ],
            },
            select: { id: true },
          },
        },
      }),
    ]);

    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };

    let allowed: Set<string> | null = null;
    if (divisionGroupId) {
      allowed = new Set();
      for (const d of divisions) {
        if (d.divisionGroupId === divisionGroupId) walkIds(d.id, allowed);
      }
    }
    if (selected.length) {
      const picked = new Set<string>();
      for (const id of selected) walkIds(id, picked);
      allowed = allowed ? new Set([...allowed].filter((id) => picked.has(id))) : picked;
    }

    type Stats = { planned: number; reserved: number; occupied: number };
    const add = (a: Stats, b: Stats): Stats => ({
      planned: a.planned + b.planned,
      reserved: a.reserved + b.reserved,
      occupied: a.occupied + b.occupied,
    });
    const empty = (): Stats => ({ planned: 0, reserved: 0, occupied: 0 });
    const avail = (s: Stats) => Math.max(0, s.planned - s.occupied - s.reserved);

    const own = new Map<string, { stats: Stats; lines: Map<string, Stats> }>();
    const byPos = new Map<string, Stats>();

    for (const sp of staff) {
      if (positionGroupId && sp.position?.positionGroupId !== positionGroupId) continue;
      const divId = sp.divisionId || '';
      if (allowed && (!divId || !allowed.has(divId))) continue;
      const planned = Math.max(0, sp.headcount || 0);
      const reserved = sp.status === 'reserved' ? planned : 0;
      const occupied = sp.employees.length;
      const chunk: Stats = { planned, reserved, occupied };
      const posName = sp.position?.name || sp.title || '—';
      const bucket = own.get(divId) || { stats: empty(), lines: new Map() };
      bucket.stats = add(bucket.stats, chunk);
      bucket.lines.set(posName, add(bucket.lines.get(posName) || empty(), chunk));
      own.set(divId, bucket);
      byPos.set(posName, add(byPos.get(posName) || empty(), chunk));
    }

    const DEPTH_COLORS = ['#c6efce', '#b4c6e7', '#ffe699', '#f8cbad', '#fadbd8', '#e8daef'];
    const byId = new Map(divisions.map((d) => [d.id, d]));
    const roots = divisions.filter((d) => !d.parentId || !byId.has(d.parentId));
    const byDivision: {
      id: string;
      name: string;
      color: string;
      depth: number;
      planned: number;
      reserved: number;
      occupied: number;
      available: number;
      lines: { position: string; planned: number; reserved: number; occupied: number; available: number }[];
    }[] = [];

    const totals = new Map<string, Stats>();
    const compute = (id: string): Stats => {
      let acc = own.get(id)?.stats || empty();
      for (const c of kids.get(id) || []) acc = add(acc, compute(c));
      totals.set(id, acc);
      return acc;
    };
    for (const r of roots) compute(r.id);

    const toLines = (id: string) =>
      [...(own.get(id)?.lines.entries() || [])]
        .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
        .map(([position, st]) => ({
          position,
          planned: st.planned,
          reserved: st.reserved,
          occupied: st.occupied,
          available: avail(st),
        }));

    const emit = (id: string, depth: number) => {
      const acc = totals.get(id) || empty();
      const inFilter = !allowed || allowed.has(id);
      if (inFilter && (acc.planned || acc.occupied || acc.reserved)) {
        const node = byId.get(id);
        byDivision.push({
          id,
          name: node?.name || '—',
          color: DEPTH_COLORS[depth % DEPTH_COLORS.length],
          depth,
          planned: acc.planned,
          reserved: acc.reserved,
          occupied: acc.occupied,
          available: avail(acc),
          lines: toLines(id),
        });
      }
      for (const c of kids.get(id) || []) emit(c, depth + 1);
    };
    for (const r of roots) emit(r.id, 0);

    if (own.has('') && (!allowed || allowed.has(''))) {
      const acc = own.get('')!.stats;
      if (acc.planned || acc.occupied || acc.reserved) {
        byDivision.push({
          id: 'none',
          name: '—',
          color: DEPTH_COLORS[0],
          depth: 0,
          planned: acc.planned,
          reserved: acc.reserved,
          occupied: acc.occupied,
          available: avail(acc),
          lines: toLines(''),
        });
      }
    }

    const byPosition = [...byPos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
      .map(([position, st]) => ({
        position,
        planned: st.planned,
        occupied: st.occupied,
        available: avail({ ...st, reserved: 0 }),
      }));

    const byDivisionOnly = [...own.entries()]
      .filter(([, v]) => v.stats.planned || v.stats.occupied)
      .map(([id, v]) => ({
        id: id || 'none',
        name: byId.get(id)?.name || '—',
        planned: v.stats.planned,
        occupied: v.stats.occupied,
        available: avail({ ...v.stats, reserved: 0 }),
        occupancyPct: v.stats.planned ? Math.round((v.stats.occupied / v.stats.planned) * 100) : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return {
      title: 'Отчёт по позициям',
      date: iso,
      generatedAt: new Date().toISOString(),
      byDivision,
      byPosition,
      byDivisionOnly,
    };
  }

  /** Отчет по расписанию — сотрудники × дни периода */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const scheduleIds = ids(opts.scheduleIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const planHours = (start: string, end: string) => {
      let d = toMin(end) - toMin(start);
      if (d < 0) d += 24 * 60;
      if (d >= 8 * 60) d -= 60;
      return Math.round((d / 60) * 100) / 100;
    };
    const scheduleLabel = (sch: {
      name?: string | null;
      code?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null) => {
      if (!sch) return '';
      const parsed = parseScheduleSettings(sch.settings);
      const pat = parsed.weekPattern || '6/1';
      const start = sch.startTime || '09:00';
      const end = sch.endTime || '18:00';
      const name = (sch.name || sch.code || '').trim();
      const core = `${start}-${end} (${pat})`;
      return name ? `${core} (${name})` : core;
    };

    const days: { iso: string; dd: string; weekday: string }[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      days.push({
        iso: isoLocal(cur),
        dd: pad(cur.getDate()),
        weekday: WEEK[cur.getDay()],
      });
      if (days.length > 93) break;
    }

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
        ...(scheduleIds.length ? { scheduleId: { in: scheduleIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        scheduleId: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
        schedule: {
          select: { id: true, name: true, code: true, startTime: true, endTime: true, settings: true },
        },
        scheduleOverrides: {
          where: { OR: [{ endDate: null }, { endDate: { gte } }] },
          orderBy: { startDate: 'desc' },
          select: {
            startDate: true,
            endDate: true,
            schedule: {
              select: { id: true, name: true, code: true, startTime: true, endTime: true, settings: true },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 3000,
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      return true;
    });

    const empIds = filtered.map((e) => e.id);
    const monthKeys = [...new Set(days.map((d) => `${d.iso.slice(0, 7)}-01`))];
    const monthDates = monthKeys.map((k) => new Date(`${k}T00:00:00.000Z`));
    const indivLines =
      empIds.length && monthDates.length
        ? await this.prisma.individualScheduleLine
            .findMany({
              where: {
                employeeId: { in: empIds },
                document: { tenantId, status: 'posted', month: { in: monthDates } },
              },
              include: { document: { select: { month: true } } },
            })
            .catch(() => [])
        : [];
    const indivMap = new Map<string, Record<string, string>>();
    for (const line of indivLines) {
      const month = isoUtc(line.document.month).slice(0, 7);
      const raw = line.days && typeof line.days === 'object' && !Array.isArray(line.days) ? line.days : {};
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v != null && v !== '') map[k] = String(v);
      }
      indivMap.set(`${line.employeeId}:${month}`, map);
    }

    type Sch = {
      id?: string;
      name?: string | null;
      code?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null;

    const scheduleOn = (e: (typeof filtered)[number], day: string): Sch => {
      const ov = e.scheduleOverrides.find((o) => {
        const a = isoUtc(o.startDate);
        const b = o.endDate ? isoUtc(o.endDate) : '9999-12-31';
        return a <= day && day <= b;
      });
      return ov?.schedule || e.schedule || null;
    };

    const rows = filtered.map((e, i) => {
      const baseSch = e.schedule || e.scheduleOverrides[0]?.schedule || null;
      const dayCells: { text: string; off: boolean }[] = [];
      let workHours = 0;
      for (const d of days) {
        const month = d.iso.slice(0, 7);
        const indiv = indivMap.get(`${e.id}:${month}`);
        const sch = scheduleOn(e, d.iso);
        let text = '';
        let off = false;
        if (indiv) {
          const raw = indiv[String(Number(d.iso.slice(8)))] ?? indiv[d.iso];
          if (raw != null && raw !== '') {
            off = raw === 'В' || raw === 'R' || raw === 'Выходной';
            if (off) text = 'В';
            else if (/^\d+(\.\d+)?$/.test(raw)) {
              text = sch ? `${sch.startTime} - ${sch.endTime}` : '09:00 - 18:00';
            } else if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(raw)) {
              text = raw.replace('-', ' - ');
            } else text = raw;
          }
        }
        if (!text && sch) {
          const parsed = parseScheduleSettings(sch.settings);
          const gridVal = parsed.yearGrid?.[d.iso];
          if (gridVal === 'В' || gridVal === 'R') {
            text = 'В';
            off = true;
          } else {
            const dt = parseYmd(d.iso);
            off = isDayOffByPattern(dt, parsed.weekPattern || '6/1');
            text = off ? 'В' : `${sch.startTime || '09:00'} - ${sch.endTime || '18:00'}`;
          }
        }
        if (!off && text.includes(' - ')) {
          const [a, b] = text.split(' - ');
          workHours += planHours(a.trim(), b.trim());
        }
        dayCells.push({ text, off });
      }
      return {
        n: i + 1,
        employeeId: e.id,
        tabNumber: e.tabNumber || '',
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        position: (e.position?.name || '').toUpperCase(),
        division: (e.division?.name || '').toUpperCase(),
        schedule: scheduleLabel(baseSch).toUpperCase(),
        days: dayCells,
        total: workHours > 0 ? Math.round(workHours * 100) / 100 : null,
      };
    });

    return {
      title: 'Отчет по расписанию',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      periodLine: `Период: ${pad(parseYmd(fromIso).getDate())}.${pad(parseYmd(fromIso).getMonth() + 1)}.${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())}.${pad(parseYmd(toIso).getMonth() + 1)}.${parseYmd(toIso).getFullYear()}`,
      days,
      rows,
    };
  }

  /** Многосменные / по сменам посещения */
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
    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const details = opts.details === false || opts.details === '0' || opts.details === 'false' ? false : true;
    const gte = parseDateParam(opts.from, startOfCurrentMonth(), 'from');
    const lte = parseDateParam(opts.to, new Date(), 'to');
    gte.setHours(0, 0, 0, 0);
    lte.setHours(23, 59, 59, 999);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const scheduleIds = ids(opts.scheduleIds);

    const pad = (n: number) => String(n).padStart(2, '0');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fromIso = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : isoLocal(gte);
    const toIso = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : isoLocal(lte);
    const toMin = (s: string) => {
      const [h, m] = String(s || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const hm = (d?: Date | null) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const planH = (start: string, end: string) => {
      let d = toMin(end) - toMin(start);
      if (d < 0) d += 24 * 60;
      if (d >= 8 * 60) d -= 60;
      return r2(d / 60);
    };

    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const schedules = await this.prisma.workSchedule.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(scheduleIds.length
          ? { id: { in: scheduleIds } }
          : { kind: { in: [WorkScheduleKind.multi_shift, WorkScheduleKind.advanced_multi_shift] } }),
      },
      select: {
        id: true,
        name: true,
        code: true,
        startTime: true,
        endTime: true,
        settings: true,
        shifts: {
          where: { isActive: true },
          select: { id: true, name: true, code: true, startTime: true, endTime: true, weekday: true },
        },
      },
    });
    const schedById = new Map(schedules.map((s) => [s.id, s]));
    const schedIds = schedules.map((s) => s.id);
    const assignedIds = schedIds.length
      ? (
          await this.prisma.scheduleShiftAssignment.findMany({
            where: {
              tenantId,
              workDate: { gte, lte },
              OR: [{ scheduleId: { in: schedIds } }, { shift: { scheduleId: { in: schedIds } } }],
            },
            select: { employeeId: true },
            distinct: ['employeeId'],
          })
        ).map((a) => a.employeeId)
      : [];

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
        ...(schedIds.length
          ? { OR: [{ scheduleId: { in: schedIds } }, { id: { in: assignedIds } }] }
          : { id: { in: [] } }),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        scheduleId: true,
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      return true;
    });

    const dayList: string[] = [];
    for (let cur = parseYmd(fromIso); isoLocal(cur) <= toIso; cur.setDate(cur.getDate() + 1)) {
      dayList.push(isoLocal(cur));
      if (dayList.length > 366) break;
    }

    const empIds = filtered.map((e) => e.id);
    const [days, assignments] = await Promise.all([
      empIds.length
        ? this.prisma.attendanceDay.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              firstInAt: true,
              lastOutAt: true,
              plannedHours: true,
              workedHours: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      empIds.length
        ? this.prisma.scheduleShiftAssignment.findMany({
            where: { tenantId, employeeId: { in: empIds }, workDate: { gte, lte } },
            select: {
              employeeId: true,
              workDate: true,
              shiftLabel: true,
              scheduleId: true,
              shift: { select: { name: true, startTime: true, endTime: true, scheduleId: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const recBy = new Map<string, (typeof days)[number]>();
    for (const d of days) {
      recBy.set(`${d.employeeId}|${isoUtc(d.workDate)}`, d);
      recBy.set(`${d.employeeId}|${isoLocal(d.workDate)}`, d);
    }
    const asgBy = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) {
      asgBy.set(`${a.employeeId}|${isoUtc(a.workDate)}`, a);
      asgBy.set(`${a.employeeId}|${isoLocal(a.workDate)}`, a);
    }

    const detailRows: {
      date: string;
      dateLabel: string;
      employeeId: string;
      tabNumber: string;
      employee: string;
      schedule: string;
      shift: string;
      planIn: string;
      planOut: string;
      planHours: number | null;
      factIn: string;
      factOut: string;
      factHours: number | null;
      night: boolean;
    }[] = [];

    for (const e of filtered) {
      const empSch = e.scheduleId ? schedById.get(e.scheduleId) : undefined;
      for (const ymd of dayList) {
        const day = parseYmd(ymd);
        const rec = recBy.get(`${e.id}|${ymd}`);
        const asg = asgBy.get(`${e.id}|${ymd}`);
        const sch =
          (asg?.scheduleId && schedById.get(asg.scheduleId)) ||
          (asg?.shift?.scheduleId && schedById.get(asg.shift.scheduleId)) ||
          empSch;
        const parsed = parseScheduleSettings(sch?.settings);
        const off = isDayOffByPattern(day, parsed.weekPattern || '6/1') || rec?.status === DayStatus.day_off;
        const has = !!(rec?.firstInAt || rec?.lastOutAt || asg);
        if (off && !has) continue;

        const wd = day.getDay();
        const byWeek = sch?.shifts.find((s) => s.weekday === wd) || sch?.shifts[0];
        const planIn = asg?.shift?.startTime || byWeek?.startTime || sch?.startTime || '09:00';
        const planOut = asg?.shift?.endTime || byWeek?.endTime || sch?.endTime || '18:00';
        const shiftName = asg?.shiftLabel || asg?.shift?.name || byWeek?.name || sch?.name || 'Смена';
        const hours =
          rec?.firstInAt && rec.lastOutAt && rec.lastOutAt.getTime() > rec.firstInAt.getTime()
            ? r2((rec.lastOutAt.getTime() - rec.firstInAt.getTime()) / 3_600_000)
            : rec?.workedHours != null
              ? r2(Number(rec.workedHours))
              : null;
        const overnight = toMin(planOut) <= toMin(planIn);
        const night = !off && (overnight || toMin(planIn) >= 20 * 60 || toMin(planIn) < 6 * 60);

        detailRows.push({
          date: ymd,
          dateLabel: `${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}`,
          employeeId: e.id,
          tabNumber: e.tabNumber || '',
          employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
          schedule: sch?.name || sch?.code || '',
          shift: off ? 'В' : shiftName,
          planIn: off ? 'В' : planIn,
          planOut: off ? 'В' : planOut,
          planHours: off ? null : rec?.plannedHours != null ? r2(Number(rec.plannedHours)) : planH(planIn, planOut),
          factIn: rec?.firstInAt ? hm(rec.firstInAt) : '',
          factOut: rec?.lastOutAt ? hm(rec.lastOutAt) : '',
          factHours: hours,
          night,
        });
      }
    }

    const summaryMap = new Map<
      string,
      { tabNumber: string; employee: string; schedule: string; shifts: number; plan: number; fact: number }
    >();
    for (const r of detailRows) {
      const cur = summaryMap.get(r.employeeId) || {
        tabNumber: r.tabNumber,
        employee: r.employee,
        schedule: r.schedule,
        shifts: 0,
        plan: 0,
        fact: 0,
      };
      cur.shifts += 1;
      cur.plan += r.planHours || 0;
      cur.fact += r.factHours || 0;
      summaryMap.set(r.employeeId, cur);
    }
    const summary = [...summaryMap.entries()].map(([employeeId, v], i) => ({
      n: i + 1,
      employeeId,
      ...v,
      plan: r2(v.plan),
      fact: r2(v.fact),
    }));

    return {
      title: 'Отчет посещений по многосменным графикам',
      generatedAt: new Date().toISOString(),
      from: fromIso,
      to: toIso,
      details,
      periodLine: `Период: ${pad(parseYmd(fromIso).getDate())} ${months[parseYmd(fromIso).getMonth()]} ${parseYmd(fromIso).getFullYear()} - ${pad(parseYmd(toIso).getDate())} ${months[parseYmd(toIso).getMonth()]} ${parseYmd(toIso).getFullYear()}`,
      rows: details ? detailRows : summary,
      detailRows,
      summary,
    };
  }

  /**
   * Verifix «Итоговый отчет по начислениям с группировками»
   * Three views: main employee grid, employees-by-division column order, division aggregates.
   */
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
    const { year: y, month: m } = parseYearMonth(opts.year, opts.month);
    type NamedGroup = { id: string; name: string; itemIds: string[] };
    type TotalSide = { itemIds?: string[]; groupIds?: string[]; checkIds?: string[] };
    type TotalGroup = {
      id: string;
      name: string;
      add?: TotalSide;
      sub?: TotalSide;
      addIds?: string[];
      subIds?: string[];
    };
    const flattenSide = (g: TotalGroup, which: 'add' | 'sub'): string[] => {
      const side = which === 'add' ? g.add : g.sub;
      if (side && typeof side === 'object') {
        return [...(side.itemIds || []), ...(side.groupIds || []), ...(side.checkIds || [])];
      }
      return which === 'add' ? g.addIds || [] : g.subIds || [];
    };
    type Cfg = {
      dataSource?: 'docs' | 'preliminary';
      plannedTime?: boolean;
      planDays?: boolean;
      planHours?: boolean;
      workedTime?: boolean;
      workedDays?: boolean;
      workedHours?: boolean;
      overtime?: boolean;
      overtimeDays?: boolean;
      overtimeHours?: boolean;
      schedulePlan?: boolean;
      scheduleFact?: boolean;
      depositStart?: boolean;
      depositEnd?: boolean;
      showAccruals?: boolean;
      showDeductions?: boolean;
      loan?: boolean;
      advance?: boolean;
      travelAdvance?: boolean;
      ndfl?: boolean;
      inpsAmount?: boolean;
      deductionTotal?: boolean;
      showTotals?: boolean;
      toPay?: boolean;
      sheet?: boolean;
      difference?: boolean;
      plannedSalary?: boolean;
      ungroupedAccrualIds?: string[];
      ungroupedDeductionIds?: string[];
      accrualGroups?: NamedGroup[];
      deductionGroups?: NamedGroup[];
      totalGroups?: TotalGroup[];
      [k: string]: unknown;
    };
    let cfg: Cfg = {};
    try {
      cfg = opts.cfg ? (JSON.parse(opts.cfg) as Cfg) : {};
    } catch {
      cfg = {};
    }
    const dataSource = cfg.dataSource === 'preliminary' ? 'preliminary' : 'docs';
    const accrualGroups = Array.isArray(cfg.accrualGroups) ? cfg.accrualGroups : [];
    const deductionGroups = Array.isArray(cfg.deductionGroups) ? cfg.deductionGroups : [];
    const totalGroups = Array.isArray(cfg.totalGroups) ? cfg.totalGroups : [];
    const ungroupedAccrualIds = Array.isArray(cfg.ungroupedAccrualIds) ? cfg.ungroupedAccrualIds : [];
    const ungroupedDeductionIds = Array.isArray(cfg.ungroupedDeductionIds) ? cfg.ungroupedDeductionIds : [];

    const ids = (s?: string) =>
      (s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const selectedDivs = ids(opts.divisionIds);
    const positionIds = ids(opts.positionIds);
    const employeeIds = ids(opts.employeeIds);
    const posType = (opts.positionType || 'all').toLowerCase();
    const pad = (n: number) => String(n).padStart(2, '0');
    const money = (n: number) => Math.round(n * 100) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    const periodLine = `Итоговый отчет по начислениям с группировками за ${pad(1)}.${pad(m)}.${y}-${pad(to.getDate())}.${pad(m)}.${y}`;
    const periodFrom = `${pad(1)}.${pad(m)}.${y}`;
    const periodTo = `${pad(to.getDate())}.${pad(m)}.${y}`;
    const positionTypeLabel =
      posType === 'primary' || posType === 'основной'
        ? 'Основной'
        : posType === 'secondary' || posType === 'не_основной' || posType === 'non_primary'
          ? 'Не основной'
          : 'Все';

    const [divisions, accrualTypes, deductionTypes] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId },
        select: { id: true, parentId: true, code: true, name: true, divisionGroup: { select: { name: true } } },
      }),
      this.prisma.accrualType
        .findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, code: true } })
        .catch(() => [] as { id: string; name: string; code: string }[]),
      this.prisma.deductionType
        .findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, code: true } })
        .catch(() => [] as { id: string; name: string; code: string }[]),
    ]);
    const kids = new Map<string, string[]>();
    for (const d of divisions) {
      if (!d.parentId) continue;
      const list = kids.get(d.parentId) || [];
      list.push(d.id);
      kids.set(d.parentId, list);
    }
    const walkIds = (id: string, into: Set<string>) => {
      if (into.has(id)) return;
      into.add(id);
      for (const c of kids.get(id) || []) walkIds(c, into);
    };
    let allowedDiv: Set<string> | null = null;
    if (selectedDivs.length) {
      allowedDiv = new Set();
      for (const id of selectedDivs) walkIds(id, allowedDiv);
    }

    const scheduleLabel = (sch: {
      name?: string | null;
      code?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null) => {
      if (!sch) return '';
      const parsed = parseScheduleSettings(sch.settings);
      const pat = parsed.weekPattern || '6/1';
      const start = (sch.startTime || '09:00').slice(0, 5);
      const end = (sch.endTime || '18:00').slice(0, 5);
      const name = (sch.name || sch.code || '').trim();
      const core = `${start}-${end} (${pat})`;
      return name ? `${core} (${name})` : core;
    };
    const planForSchedule = (sch: {
      startTime?: string | null;
      endTime?: string | null;
      settings?: unknown;
    } | null) => {
      const parsed = parseScheduleSettings(sch?.settings);
      const pat = parsed.weekPattern || '6/1';
      const dayH = parsed.dayNormHours ?? 8;
      let days = 0;
      let hours = 0;
      const dim = to.getDate();
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(y, m - 1, d);
        if (isDayOffByPattern(dt, pat)) continue;
        days += 1;
        hours += dayH;
      }
      return { days, hours: r2(hours) };
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        baseSalary: true,
        divisionId: true,
        positionId: true,
        division: {
          select: {
            name: true,
            code: true,
            divisionGroup: { select: { name: true } },
          },
        },
        position: { select: { name: true } },
        grade: { select: { name: true } },
        schedule: { select: { name: true, code: true, startTime: true, endTime: true, settings: true } },
        staffPosition: { select: { isPrimary: true } },
        person: { select: { pinfl: true, inps: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });

    const posNeedles = positionIds.map((x) => x.toLowerCase());
    const filtered = employees.filter((e) => {
      if (allowedDiv && (!e.divisionId || !allowedDiv.has(e.divisionId))) return false;
      if (posNeedles.length) {
        const name = (e.position?.name || '').toLowerCase();
        if (!posNeedles.includes((e.positionId || '').toLowerCase()) && !posNeedles.includes(name)) return false;
      }
      const primary = e.staffPosition?.isPrimary !== false;
      if (positionTypeLabel === 'Основной' && !primary) return false;
      if (positionTypeLabel === 'Не основной' && primary) return false;
      return true;
    });

    const empIds = filtered.map((e) => e.id);
    const days =
      empIds.length === 0
        ? []
        : await this.prisma.attendanceDay.findMany({
            where: {
              tenantId,
              employeeId: { in: empIds },
              workDate: { gte: from, lte: to },
            },
            select: {
              employeeId: true,
              status: true,
              workedHours: true,
              firstInAt: true,
              lastOutAt: true,
            },
          });
    const workBy = new Map<string, { days: number; hours: number }>();
    for (const d of days) {
      const worked =
        d.status === DayStatus.on_time ||
        d.status === DayStatus.late ||
        !!(d.firstInAt || d.lastOutAt);
      if (!worked) continue;
      const cur = workBy.get(d.employeeId) || { days: 0, hours: 0 };
      cur.days += 1;
      const h =
        d.workedHours != null
          ? Number(d.workedHours)
          : d.firstInAt && d.lastOutAt && d.lastOutAt.getTime() > d.firstInAt.getTime()
            ? (d.lastOutAt.getTime() - d.firstInAt.getTime()) / 3_600_000
            : 0;
      cur.hours += h > 0 ? h : 0;
      workBy.set(d.employeeId, cur);
    }

    const period = await this.prisma.payrollPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year: y, month: m } },
    });
    const lines = period
      ? await this.prisma.payrollLine.findMany({
          where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
          select: { employeeId: true, type: true, amount: true, description: true },
        })
      : [];
    const advances = period
      ? await this.prisma.payrollAdvance.findMany({
          where: { tenantId, periodId: period.id, employeeId: { in: empIds } },
          select: { employeeId: true, amount: true },
        })
      : [];
    type Acc = {
      base: number;
      bonus: number;
      overtime: number;
      one_time: number;
      other_acc: number;
      accrued: number;
      loan: number;
      advance: number;
      travel: number;
      ndfl: number;
      inps: number;
      other_ded: number;
      byAccType: Record<string, number>;
      byDedType: Record<string, number>;
    };
    const emptyAcc = (): Acc => ({
      base: 0,
      bonus: 0,
      overtime: 0,
      one_time: 0,
      other_acc: 0,
      accrued: 0,
      loan: 0,
      advance: 0,
      travel: 0,
      ndfl: 0,
      inps: 0,
      other_ded: 0,
      byAccType: {},
      byDedType: {},
    });
    const accBy = new Map<string, Acc>();
    const accNameById = new Map(accrualTypes.map((a) => [a.id, a.name.toLowerCase()]));
    const dedNameById = new Map(deductionTypes.map((d) => [d.id, d.name.toLowerCase()]));
    for (const l of lines) {
      const a = Number(l.amount) || 0;
      const cur = accBy.get(l.employeeId) || emptyAcc();
      const desc = (l.description || '').toLowerCase();
      if (
        l.type === PayrollLineType.base ||
        l.type === PayrollLineType.bonus ||
        l.type === PayrollLineType.overtime ||
        l.type === PayrollLineType.one_time ||
        l.type === PayrollLineType.other
      ) {
        cur.accrued += a;
        if (l.type === PayrollLineType.base) cur.base += a;
        else if (l.type === PayrollLineType.bonus) cur.bonus += a;
        else if (l.type === PayrollLineType.overtime) cur.overtime += a;
        else if (l.type === PayrollLineType.one_time) cur.one_time += a;
        else cur.other_acc += a;
        for (const [tid, name] of accNameById) {
          if (name && desc.includes(name)) cur.byAccType[tid] = (cur.byAccType[tid] || 0) + a;
        }
      } else if (l.type === PayrollLineType.advance) {
        cur.advance += Math.abs(a);
      } else if (l.type === PayrollLineType.penalty || l.type === PayrollLineType.deduction) {
        const abs = Math.abs(a);
        if (desc.includes('заем') || desc.includes('займ') || desc.includes('loan')) cur.loan += abs;
        else if (desc.includes('командир') || desc.includes('travel')) cur.travel += abs;
        else if (desc.includes('ндфл') || desc.includes('налог') || desc.includes('income')) cur.ndfl += abs;
        else if (desc.includes('инпс') || desc.includes('inps')) cur.inps += abs;
        else cur.other_ded += abs;
        for (const [tid, name] of dedNameById) {
          if (name && desc.includes(name)) cur.byDedType[tid] = (cur.byDedType[tid] || 0) + abs;
        }
      }
      accBy.set(l.employeeId, cur);
    }
    for (const adv of advances) {
      const cur = accBy.get(adv.employeeId) || emptyAcc();
      cur.advance += Number(adv.amount) || 0;
      accBy.set(adv.employeeId, cur);
    }

    const amountOf = (acc: Acc, key: string): number => {
      if (key === 'base') return acc.base;
      if (key === 'bonus') return acc.bonus;
      if (key === 'overtime') return acc.overtime;
      if (key === 'one_time') return acc.one_time;
      if (key === 'other_acc') return acc.other_acc;
      if (key === 'accrued') return acc.accrued;
      if (key === 'loan') return acc.loan;
      if (key === 'advance') return acc.advance;
      if (key === 'travelAdvance') return acc.travel;
      if (key === 'ndfl') return acc.ndfl;
      if (key === 'inpsAmount' || key === 'inps') return acc.inps;
      if (key === 'other_ded') return acc.other_ded;
      if (key.startsWith('acc:')) return acc.byAccType[key.slice(4)] || 0;
      if (key.startsWith('ded:')) return acc.byDedType[key.slice(4)] || 0;
      return 0;
    };
    const sumKeys = (acc: Acc, keys: string[]) => keys.reduce((s, k) => s + amountOf(acc, k), 0);

    const dynamicColumns: { key: string; label: string; group: string; money: boolean }[] = [];
    for (const id of ungroupedAccrualIds) {
      const label =
        ({ base: 'По окладу', bonus: 'Премия', overtime: 'Сверхурочные', one_time: 'Разовые', other_acc: 'Прочие начисления' } as Record<string, string>)[id] ||
        accrualTypes.find((a) => `acc:${a.id}` === id)?.name ||
        id;
      dynamicColumns.push({ key: `dyn:${id}`, label, group: 'Начисления', money: true });
    }
    for (const g of accrualGroups) {
      dynamicColumns.push({
        key: `ag:${g.id}`,
        label: g.name || 'Группа начислений',
        group: 'Начисления',
        money: true,
      });
    }
    for (const id of ungroupedDeductionIds) {
      const label =
        (
          {
            loan: 'Заем',
            advance: 'Аванс',
            travelAdvance: 'Командировочный аванс',
            ndfl: 'НДФЛ',
            inpsAmount: 'ИНПС',
            other_ded: 'Прочие удержания',
          } as Record<string, string>
        )[id] ||
        deductionTypes.find((d) => `ded:${d.id}` === id)?.name ||
        id;
      dynamicColumns.push({ key: `dyn:${id}`, label, group: 'Удержания', money: true });
    }
    for (const g of deductionGroups) {
      dynamicColumns.push({
        key: `dg:${g.id}`,
        label: g.name || 'Группа удержаний',
        group: 'Удержания',
        money: true,
      });
    }
    for (const g of totalGroups) {
      dynamicColumns.push({
        key: `tg:${g.id}`,
        label: g.name || 'Группа итогов',
        group: 'Итоги',
        money: true,
      });
    }

    const rows = filtered.map((e, i) => {
      const salary = e.baseSalary != null ? Number(e.baseSalary) : 0;
      const work = workBy.get(e.id) || { days: 0, hours: 0 };
      const plan = planForSchedule(e.schedule);
      const acc = accBy.get(e.id) || emptyAcc();
      if (dataSource === 'preliminary' && acc.accrued === 0 && salary > 0 && plan.days > 0) {
        const coeff = work.days / plan.days;
        acc.base = money(salary * coeff);
        acc.accrued = acc.base;
      }
      const deductionTotal = money(acc.loan + acc.advance + acc.travel + acc.ndfl + acc.inps + acc.other_ded);
      const toPay = money(Math.max(0, acc.accrued - deductionTotal));
      const difference = money(toPay);
      const primary = e.staffPosition?.isPrimary !== false;
      const divName = (e.division?.name || '').toUpperCase();
      const otHours = work.hours > plan.hours ? r2(work.hours - plan.hours) : 0;
      const otDays = otHours > 0 ? Math.max(1, Math.round(otHours / 8)) : 0;

      const extras: Record<string, number> = {};
      for (const id of ungroupedAccrualIds) extras[`dyn:${id}`] = money(amountOf(acc, id));
      for (const g of accrualGroups) extras[`ag:${g.id}`] = money(sumKeys(acc, g.itemIds || []));
      for (const id of ungroupedDeductionIds) extras[`dyn:${id}`] = money(amountOf(acc, id));
      for (const g of deductionGroups) extras[`dg:${g.id}`] = money(sumKeys(acc, g.itemIds || []));

      const resolveTotalKey = (key: string): number => {
        if (key.startsWith('ag:')) return extras[key] || 0;
        if (key.startsWith('dg:')) return extras[key] || 0;
        if (key.startsWith('dyn:')) return extras[key] || amountOf(acc, key.slice(4));
        if (key === 'toPay') return toPay;
        if (key === 'sheet') return 0;
        if (key === 'difference') return difference;
        if (key === 'deductionTotal') return deductionTotal;
        return amountOf(acc, key);
      };
      for (const g of totalGroups) {
        const add = flattenSide(g, 'add').reduce((s, k) => s + resolveTotalKey(k), 0);
        const sub = flattenSide(g, 'sub').reduce((s, k) => s + resolveTotalKey(k), 0);
        extras[`tg:${g.id}`] = money(add - sub);
      }

      return {
        n: i + 1,
        employeeId: e.id,
        employee: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase(),
        divisionGroup: (e.division?.divisionGroup?.name || '').toUpperCase(),
        divisionCode: e.division?.code || '',
        division: divName,
        orgUnit: divName,
        position: (e.position?.name || '').toUpperCase(),
        positionType: primary ? 'Основной' : 'Не основной',
        tabNumber: e.tabNumber || '',
        grade: e.grade?.name || '',
        schedule: scheduleLabel(e.schedule),
        bankAccount: '',
        pinfl: e.person?.pinfl || '',
        inps: e.person?.inps || '',
        salary: money(salary),
        plannedSalary: money(salary),
        planDays: plan.days,
        planHours: plan.hours,
        workedDays: work.days || null,
        workedHours: work.hours ? r2(work.hours) : null,
        overtimeDays: otDays || null,
        overtimeHours: otHours || null,
        schedulePlan: cfg.schedulePlan === false ? null : plan.hours,
        scheduleFact: cfg.scheduleFact === false ? null : work.hours ? r2(work.hours) : null,
        depositStart: cfg.depositStart ? money(0) : null,
        depositEnd: cfg.depositEnd ? money(0) : null,
        loan: money(acc.loan),
        advance: money(acc.advance),
        travelAdvance: money(acc.travel),
        ndfl: money(acc.ndfl),
        inpsAmount: money(acc.inps),
        deductionTotal,
        toPay,
        sheet: money(0),
        difference,
        periodFrom,
        periodTo,
        ...extras,
      };
    });

    type DivAgg = Record<string, number | string> & {
      divisionGroup: string;
      divisionCode: string;
      division: string;
    };
    const divMap = new Map<string, DivAgg>();
    const sumKeysDiv = [
      'salary',
      'plannedSalary',
      'planDays',
      'planHours',
      'workedDays',
      'workedHours',
      'overtimeDays',
      'overtimeHours',
      'schedulePlan',
      'scheduleFact',
      'depositStart',
      'depositEnd',
      'loan',
      'advance',
      'travelAdvance',
      'ndfl',
      'inpsAmount',
      'deductionTotal',
      'toPay',
      'sheet',
      'difference',
      ...dynamicColumns.map((c) => c.key),
    ];
    for (const r of rows) {
      const key = r.division || '—';
      const cur =
        divMap.get(key) ||
        ({
          divisionGroup: r.divisionGroup,
          divisionCode: r.divisionCode,
          division: key,
        } as DivAgg);
      for (const k of sumKeysDiv) {
        const v = (r as Record<string, unknown>)[k];
        cur[k] = (Number(cur[k]) || 0) + (typeof v === 'number' ? v : 0);
      }
      divMap.set(key, cur);
    }
    const divisionRows = [...divMap.values()]
      .sort((a, b) => String(a.division).localeCompare(String(b.division), 'ru'))
      .map((d, i) => {
        const out: Record<string, unknown> = { n: i + 1, ...d };
        for (const k of sumKeysDiv) {
          if (typeof out[k] === 'number') {
            out[k] =
              k.includes('Days') || k.includes('Hours') || k.includes('Plan') || k.includes('Fact')
                ? r2(Number(out[k]))
                : money(Number(out[k]));
          }
        }
        return out;
      });

    return {
      title: 'Итоговый отчет по начислениям с группировками',
      year: y,
      month: m,
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(to.getDate())}`,
      periodLine,
      positionTypeLabel: `Тип позиции: ${positionTypeLabel}`,
      dataSource,
      generatedAt: new Date().toISOString(),
      dynamicColumns,
      rows,
      byDivisionRows: rows,
      divisionRows,
    };
  }

  /** Lookup lists for forms */
  async lookups(tenantId: string) {
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
    const tpl = await this.prisma.clearanceTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    return this.prisma.clearanceTemplateItem.create({
      data: {
        templateId,
        title: body.title,
        department: body.department,
        sortOrder: body.sortOrder ?? 0,
      },
    });
  }

  async updateClearanceItem(
    tenantId: string,
    itemId: string,
    body: { status?: string; note?: string },
  ) {
    const item = await this.prisma.clearanceSheetItem.findUnique({
      where: { id: itemId },
      include: { sheet: true },
    });
    if (!item || item.sheet.tenantId !== tenantId) throw new NotFoundException('Item not found');
    return this.prisma.clearanceSheetItem.update({
      where: { id: itemId },
      data: {
        status: (body.status as any) || undefined,
        note: body.note,
        doneAt: body.status === 'done' ? new Date() : undefined,
      },
    });
  }

  private timesheetCorrectionInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
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
              divisionId: true,
            },
          },
        },
      },
    };
  }

  private parseCorrectionLines(raw: unknown): Array<{
    employeeId: string;
    sortOrder: number;
    plannedHours?: number | null;
    onTimeHours?: number | null;
    outsideHours?: number | null;
    workedHours?: number | null;
    overtimeHours?: number | null;
    beforeHours?: number | null;
    afterHours?: number | null;
    note?: string | null;
  }> {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного сотрудника');
    }
    const lines = raw
      .map((item, idx) => {
        const row = item as Record<string, unknown>;
        const employeeId = String(row.employeeId || '').trim();
        if (!employeeId) return null;
        const num = (v: unknown) => {
          if (v === undefined || v === null || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        return {
          employeeId,
          sortOrder: Number(row.sortOrder ?? idx) || idx,
          plannedHours: num(row.plannedHours),
          onTimeHours: num(row.onTimeHours),
          outsideHours: num(row.outsideHours),
          workedHours: num(row.workedHours),
          overtimeHours: num(row.overtimeHours),
          beforeHours: num(row.beforeHours),
          afterHours: num(row.afterHours),
          note: row.note ? String(row.note) : null,
        };
      })
      .filter(Boolean) as Array<{
      employeeId: string;
      sortOrder: number;
      plannedHours?: number | null;
      onTimeHours?: number | null;
      outsideHours?: number | null;
      workedHours?: number | null;
      overtimeHours?: number | null;
      beforeHours?: number | null;
      afterHours?: number | null;
      note?: string | null;
    }>;
    if (lines.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного сотрудника');
    }
    return lines;
  }

  async createTimesheetCorrection(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const periodFrom = parseDateParam(
      String(body.periodFrom || body.documentDate || documentDate.toISOString().slice(0, 10)),
      documentDate,
      'periodFrom',
    );
    const periodTo = parseDateParam(
      String(body.periodTo || body.periodFrom || documentDate.toISOString().slice(0, 10)),
      periodFrom,
      'periodTo',
    );
    if (periodTo.getTime() < periodFrom.getTime()) {
      throw new BadRequestException('periodTo must be >= periodFrom');
    }
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseCorrectionLines(body.lines)
        : Array.isArray(body.employeeIds) && body.employeeIds.length > 0
          ? this.parseCorrectionLines(
              (body.employeeIds as string[]).map((id) => ({ employeeId: id })),
            )
          : this.parseCorrectionLines([]);
    const resolvedLines = lines;
    for (const line of resolvedLines) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: line.employeeId, tenantId },
        select: { id: true },
      });
      if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
    }
    if (body.divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: String(body.divisionId), tenantId },
        select: { id: true },
      });
      if (!div) throw new NotFoundException('Division not found');
    }

    return this.prisma.timesheetCorrection.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        title: body.title ? String(body.title) : 'Корректировка табеля',
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        periodFrom,
        periodTo,
        meta: (body.meta as Prisma.InputJsonValue) ?? undefined,
        lines: {
          create: resolvedLines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            plannedHours: l.plannedHours,
            onTimeHours: l.onTimeHours,
            outsideHours: l.outsideHours,
            workedHours: l.workedHours,
            overtimeHours: l.overtimeHours,
            beforeHours: l.beforeHours,
            afterHours: l.afterHours,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.timesheetCorrectionInclude(),
    });
  }

  async updateTimesheetCorrection(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft timesheet corrections can be edited');
    }
    const data: Prisma.TimesheetCorrectionUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(String(body.documentDate), row.documentDate, 'documentDate');
    }
    if (body.periodFrom !== undefined) {
      data.periodFrom = parseDateParam(String(body.periodFrom), row.periodFrom, 'periodFrom');
    }
    if (body.periodTo !== undefined) {
      data.periodTo = parseDateParam(String(body.periodTo), row.periodTo, 'periodTo');
    }
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.title !== undefined) data.title = String(body.title || 'Корректировка табеля');
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.meta !== undefined) data.meta = body.meta as Prisma.InputJsonValue;

    if (body.lines !== undefined || body.employeeIds !== undefined) {
      const lines =
        Array.isArray(body.lines) && body.lines.length > 0
          ? this.parseCorrectionLines(body.lines)
          : this.parseCorrectionLines(
              (Array.isArray(body.employeeIds) ? body.employeeIds : []).map((eid) => ({
                employeeId: eid,
              })),
            );
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.timesheetCorrectionLine.deleteMany({ where: { correctionId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          plannedHours: l.plannedHours,
          onTimeHours: l.onTimeHours,
          outsideHours: l.outsideHours,
          workedHours: l.workedHours,
          overtimeHours: l.overtimeHours,
          beforeHours: l.beforeHours,
          afterHours: l.afterHours,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.timesheetCorrection.update({
      where: { id },
      data,
      include: this.timesheetCorrectionInclude(),
    });
  }

  async postTimesheetCorrection(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Timesheet correction already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled timesheet correction cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty timesheet correction');
    }

    const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<
      string,
      unknown
    >;
    const periodFrom = row.periodFrom;
    const periodTo = row.periodTo;

    for (const line of row.lines) {
      const daily = await this.computeEmployeePeriodHours(
        tenantId,
        line.employeeId,
        periodFrom,
        periodTo,
        meta,
      );

      // Scale daily hours to match edited line totals when present
      const target = {
        plannedHours: numDec(line.plannedHours),
        onTimeHours: numDec(line.onTimeHours),
        outsideHours: numDec(line.outsideHours),
        workedHours: numDec(line.workedHours),
        overtimeHours: numDec(line.overtimeHours),
        beforeHours: numDec(line.beforeHours),
        afterHours: numDec(line.afterHours),
      };
      const scaledDays = scaleDailyHoursToTargets(daily.days, target);

      for (const day of scaledDays) {
        const existing = await this.prisma.attendanceDay.findUnique({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate: day.workDate,
            },
          },
        });
        const oldStatus = existing?.status ?? null;
        const newStatus = day.status;

        if (existing) {
          await this.prisma.attendanceDay.update({
            where: { id: existing.id },
            data: {
              status: newStatus,
              plannedHours: day.plannedHours,
              onTimeHours: day.onTimeHours,
              outsideHours: day.outsideHours,
              workedHours: day.workedHours,
              overtimeHours: day.overtimeHours,
              beforeHours: day.beforeHours,
              afterHours: day.afterHours,
              correctionId: id,
            },
          });
        } else {
          await this.prisma.attendanceDay.create({
            data: {
              tenantId,
              employeeId: line.employeeId,
              workDate: day.workDate,
              status: newStatus,
              plannedHours: day.plannedHours,
              onTimeHours: day.onTimeHours,
              outsideHours: day.outsideHours,
              workedHours: day.workedHours,
              overtimeHours: day.overtimeHours,
              beforeHours: day.beforeHours,
              afterHours: day.afterHours,
              correctionId: id,
            },
          });
        }

        await this.prisma.timesheetAdjustment.create({
          data: {
            tenantId,
            employeeId: line.employeeId,
            workDate: day.workDate,
            oldStatus,
            newStatus,
            reason: row.title || row.number || 'Корректировка табеля',
            createdBy: postedBy,
          },
        });
      }

      // Persist computed/edited totals back onto the line if empty
      await this.prisma.timesheetCorrectionLine.update({
        where: { id: line.id },
        data: {
          plannedHours: target.plannedHours ?? daily.totals.plannedHours,
          onTimeHours: target.onTimeHours ?? daily.totals.onTimeHours,
          outsideHours: target.outsideHours ?? daily.totals.outsideHours,
          workedHours: target.workedHours ?? daily.totals.workedHours,
          overtimeHours: target.overtimeHours ?? daily.totals.overtimeHours,
          beforeHours: target.beforeHours ?? daily.totals.beforeHours,
          afterHours: target.afterHours ?? daily.totals.afterHours,
        },
      });
    }

    return this.prisma.timesheetCorrection.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
        meta: {
          ...meta,
          appliedAt: new Date().toISOString(),
          appliedHours: true,
        } as Prisma.InputJsonValue,
      },
      include: this.timesheetCorrectionInclude(),
    });
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
    const periodFrom = parseDateParam(body.periodFrom, new Date(), 'periodFrom');
    const periodTo = parseDateParam(body.periodTo, periodFrom, 'periodTo');
    if (periodTo.getTime() < periodFrom.getTime()) {
      throw new BadRequestException('periodTo must be >= periodFrom');
    }

    let employeeIds = (body.employeeIds || []).filter(Boolean);
    if (employeeIds.length === 0) {
      const emps = await this.prisma.employee.findMany({
        where: {
          tenantId,
          status: 'active',
          ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        },
        select: { id: true },
        take: 500,
      });
      employeeIds = emps.map((e) => e.id);
    }
    if (employeeIds.length === 0) {
      throw new BadRequestException('Нет сотрудников для заполнения');
    }

    const meta = body.meta || {};
    const lines = [];
    for (const employeeId of employeeIds) {
      const computed = await this.computeEmployeePeriodHours(
        tenantId,
        employeeId,
        periodFrom,
        periodTo,
        meta,
      );
      lines.push({
        employeeId,
        ...computed.totals,
      });
    }
    return { lines, periodFrom, periodTo };
  }

  private async computeEmployeePeriodHours(
    tenantId: string,
    employeeId: string,
    periodFrom: Date,
    periodTo: Date,
    meta: Record<string, unknown>,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { schedule: true },
    });
    if (!emp) throw new NotFoundException(`Employee ${employeeId} not found`);

    const planStart = emp.schedule?.startTime ?? '09:00';
    const planEnd = emp.schedule?.endTime ?? '18:00';
    const planNorm = planNormHours(planStart, planEnd);
    const countBefore = Boolean(meta.countBefore);
    const countAfter = Boolean(meta.countAfter);
    const countLunch = meta.countLunch !== false; // default true-ish for on-time calc

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        employeeId,
        workDate: { gte: periodFrom, lte: periodTo },
      },
    });
    const dayByKey = new Map(
      days.map((d) => [d.workDate.toISOString().slice(0, 10), d]),
    );
    const absences = await this.prisma.absence.findMany({
      where: {
        tenantId,
        employeeId,
        status: { in: ['approved', 'pending'] },
        startDate: { lte: periodTo },
        endDate: { gte: periodFrom },
      },
    });

    const totals = {
      plannedHours: 0,
      onTimeHours: 0,
      outsideHours: 0,
      workedHours: 0,
      overtimeHours: 0,
      beforeHours: 0,
      afterHours: 0,
    };
    const dayRows: Array<{
      workDate: Date;
      status: DayStatus;
      plannedHours: number;
      onTimeHours: number;
      outsideHours: number;
      workedHours: number;
      overtimeHours: number;
      beforeHours: number;
      afterHours: number;
    }> = [];

    for (const date of eachUtcDate(periodFrom, periodTo)) {
      const key = date.toISOString().slice(0, 10);
      const d = dayByKey.get(key);
      const dow = date.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const absenceCover = absences.find((a) => {
        const s = a.startDate.toISOString().slice(0, 10);
        const e = a.endDate.toISOString().slice(0, 10);
        return key >= s && key <= e;
      });
      let status: DayStatus =
        d?.status ??
        (weekend ? DayStatus.day_off : absenceCover ? DayStatus.leave : DayStatus.not_started);
      const isDayOff = status === DayStatus.day_off || weekend;
      const isLeave = status === DayStatus.leave || (!!absenceCover && !weekend);

      let planned = 0;
      let onTime = 0;
      let outside = 0;
      let worked = 0;
      let overtime = 0;
      let before = 0;
      let after = 0;

      if (isDayOff) {
        // no hours
      } else if (isLeave) {
        planned = planNorm;
        status = DayStatus.leave;
      } else if (d?.firstInAt && d?.lastOutAt) {
        const inAt = new Date(d.firstInAt);
        const outAt = new Date(d.lastOutAt);
        const samePunch = Math.abs(outAt.getTime() - inAt.getTime()) < 60_000;
        if (!samePunch) {
          planned = planNorm;
          worked = round2(Math.max(0, (outAt.getTime() - inAt.getTime()) / 3600000));
          onTime = round2(
            Math.min(
              planNorm,
              Math.max(0, creditedOnTimeHours(inAt, outAt, planStart, planEnd, countLunch)),
            ),
          );
          overtime = round2(Math.max(0, worked - planNorm));
          outside = round2(Math.max(0, worked - onTime));
          before = countBefore ? round2(hoursBefore(inAt, planStart)) : 0;
          after = countAfter ? round2(hoursAfter(outAt, planEnd)) : 0;
          if (d.status === DayStatus.late) status = DayStatus.late;
          else if (d.status === DayStatus.on_time) status = DayStatus.on_time;
          else status = DayStatus.on_time;
        } else {
          planned = planNorm;
          status = DayStatus.absent;
        }
      } else if (!weekend) {
        planned = planNorm;
        status = d?.status === DayStatus.absent ? DayStatus.absent : DayStatus.not_started;
      }

      totals.plannedHours += planned;
      totals.onTimeHours += onTime;
      totals.outsideHours += outside;
      totals.workedHours += worked;
      totals.overtimeHours += overtime;
      totals.beforeHours += before;
      totals.afterHours += after;

      dayRows.push({
        workDate: date,
        status,
        plannedHours: planned,
        onTimeHours: onTime,
        outsideHours: outside,
        workedHours: worked,
        overtimeHours: overtime,
        beforeHours: before,
        afterHours: after,
      });
    }

    return {
      totals: {
        plannedHours: round2(totals.plannedHours),
        onTimeHours: round2(totals.onTimeHours),
        outsideHours: round2(totals.outsideHours),
        workedHours: round2(totals.workedHours),
        overtimeHours: round2(totals.overtimeHours),
        beforeHours: round2(totals.beforeHours),
        afterHours: round2(totals.afterHours),
      },
      days: dayRows,
    };
  }

  async cancelTimesheetCorrection(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.timesheetCorrection.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Timesheet correction not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Posted timesheet correction cannot be cancelled directly');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Timesheet correction already cancelled');
    }
    return this.prisma.timesheetCorrection.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.timesheetCorrectionInclude(),
    });
  }

  // ─── Individual schedules (Verifix «Индивидуальные графики») ───────────────

  private individualScheduleInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              divisionId: true,
              positionId: true,
              position: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parseScheduleKind(raw: unknown): WorkScheduleKind {
    const k = String(raw || 'ordinary');
    const allowed = new Set(Object.values(WorkScheduleKind));
    if (!allowed.has(k as WorkScheduleKind)) {
      throw new BadRequestException(`Unknown schedule kind: ${k}`);
    }
    return k as WorkScheduleKind;
  }

  private monthStartFrom(body: Record<string, unknown>, fallback = new Date()): Date {
    if (body.month) {
      const s = String(body.month);
      // YYYY-MM or YYYY-MM-DD
      if (/^\d{4}-\d{2}$/.test(s)) {
        const [y, m] = s.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, 1));
      }
      return parseDateParam(s, fallback, 'month');
    }
    if (body.year != null && body.monthNum != null) {
      return new Date(Date.UTC(Number(body.year), Number(body.monthNum) - 1, 1));
    }
    return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1));
  }

  private parseIndividualLines(raw: unknown[]): Array<{
    employeeId: string;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const employeeId = String(row.employeeId || '');
      if (!employeeId) throw new BadRequestException(`lines[${idx}].employeeId is required`);
      const daysRaw = row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  private computeLineTotals(days: Record<string, string>) {
    let daysCount = 0;
    let hoursTotal = 0;
    for (const v of Object.values(days)) {
      if (!v || v === 'В' || v === 'R' || v === 'Вх' || v === 'П') continue;
      // "8" or "09:00-18:00" or shift code with hours later
      if (/^\d+(\.\d+)?$/.test(v)) {
        daysCount += 1;
        hoursTotal += Number(v);
        continue;
      }
      const m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (m) {
        const start = Number(m[1]) * 60 + Number(m[2]);
        let end = Number(m[3]) * 60 + Number(m[4]);
        if (end < start) end += 24 * 60;
        daysCount += 1;
        hoursTotal += (end - start) / 60;
        continue;
      }
      // shift label / non-empty work mark
      daysCount += 1;
    }
    return { daysCount, hoursTotal: round2(hoursTotal) };
  }

  private dayHoursValue(v: string): number | null {
    if (!v || v === 'В' || v === 'R' || v === 'Вх' || v === 'П') return null;
    if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
    const m = v.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (m) {
      const start = Number(m[1]) * 60 + Number(m[2]);
      let end = Number(m[3]) * 60 + Number(m[4]);
      if (end < start) end += 24 * 60;
      return (end - start) / 60;
    }
    return null;
  }

  async createIndividualSchedule(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const kind = this.parseScheduleKind(body.kind);
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseIndividualLines(body.lines)
        : [];

    for (const line of lines) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: line.employeeId, tenantId },
        select: { id: true },
      });
      if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
    }
    if (body.divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: String(body.divisionId), tenantId },
        select: { id: true },
      });
      if (!div) throw new NotFoundException('Division not found');
    }

    return this.prisma.individualSchedule.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        kind,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        settings: (body.settings as Prisma.InputJsonValue) ?? undefined,
        normDays:
          body.normDays != null && body.normDays !== ''
            ? new Prisma.Decimal(Number(body.normDays))
            : undefined,
        normHours:
          body.normHours != null && body.normHours !== ''
            ? new Prisma.Decimal(Number(body.normHours))
            : undefined,
        lines: {
          create: lines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.individualScheduleInclude(),
    });
  }

  async updateIndividualSchedule(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft individual schedules can be edited');
    }

    const data: Prisma.IndividualScheduleUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.kind !== undefined) data.kind = this.parseScheduleKind(body.kind);
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.settings !== undefined) data.settings = body.settings as Prisma.InputJsonValue;
    if (body.normDays !== undefined) {
      data.normDays =
        body.normDays != null && body.normDays !== ''
          ? new Prisma.Decimal(Number(body.normDays))
          : null;
    }
    if (body.normHours !== undefined) {
      data.normHours =
        body.normHours != null && body.normHours !== ''
          ? new Prisma.Decimal(Number(body.normHours))
          : null;
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parseIndividualLines(body.lines) : [];
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.individualScheduleLine.deleteMany({ where: { documentId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.individualSchedule.update({
      where: { id },
      data,
      include: this.individualScheduleInclude(),
    });
  }

  async postIndividualSchedule(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Individual schedule already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled individual schedule cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty individual schedule');
    }

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        const hours = this.dayHoursValue(String(cell));
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));

        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });
      }
    }

    return this.prisma.individualSchedule.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.individualScheduleInclude(),
    });
  }

  async cancelIndividualSchedule(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.individualSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Individual schedule not found');
    if (row.status === 'posted') {
      throw new BadRequestException(
        'Проведённый документ нельзя отменить напрямую — снимите проведение отдельным процессом',
      );
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Individual schedule already cancelled');
    }
    return this.prisma.individualSchedule.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.individualScheduleInclude(),
    });
  }

  /** Fill employee month grid from week pattern + day norm (Заполнить). */
  async fillIndividualSchedule(
    tenantId: string,
    body: {
      month?: string;
      year?: number;
      monthNum?: number;
      employeeIds?: string[];
      divisionId?: string;
      dayNorm?: number;
      weekPattern?: '5/2' | '6/1' | '5/1';
      kind?: string;
      displayMode?: 'hours' | 'time_range';
      startTime?: string;
      endTime?: string;
    },
  ) {
    const month = this.monthStartFrom(
      {
        month: body.month,
        year: body.year,
        monthNum: body.monthNum,
      },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIdx = month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const dayNorm = Number(body.dayNorm ?? 8);
    const pattern = body.weekPattern || '5/2';
    const kind = String(body.kind || 'ordinary');
    const displayMode = body.displayMode || 'hours';
    const startTime = body.startTime || '09:00';
    const endTime = body.endTime || '18:00';

    let employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.employeeIds?.length ? { id: { in: body.employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        divisionId: true,
        positionId: true,
        position: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 500,
    });

    if (body.employeeIds?.length && !body.divisionId) {
      // keep order of request when only employeeIds
      const map = new Map(employees.map((e) => [e.id, e]));
      employees = body.employeeIds.map((id) => map.get(id)).filter(Boolean) as typeof employees;
    }

    const lines = employees.map((emp, idx) => {
      const days: Record<string, string> = {};
      for (let d = 1; d <= dim; d++) {
        const wd = new Date(Date.UTC(year, monthIdx, d)).getUTCDay(); // 0=Sun
        const isWeekend =
          pattern === '6/1' ? wd === 0 : wd === 0 || wd === 6;
        if (isWeekend) {
          days[String(d)] = kind === 'advanced' ? 'R' : 'В';
        } else if (displayMode === 'time_range') {
          days[String(d)] = `${startTime}-${endTime}`;
        } else {
          days[String(d)] = String(dayNorm);
        }
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId: emp.id,
        sortOrder: idx,
        days,
        daysCount: totals.daysCount,
        hoursTotal: totals.hoursTotal,
        employee: emp,
      };
    });

    return {
      month: month.toISOString().slice(0, 10),
      lines,
      normDays: lines[0]?.daysCount ?? 0,
      normHours: lines[0] ? round2((lines[0].daysCount || 0) * dayNorm) : 0,
    };
  }

  // ─── Position schedules (Verifix «Индивидуальные графики для позиций») ─────

  private positionScheduleDocInclude() {
    return {
      division: { select: { id: true, name: true, code: true } },
      lines: {
        include: {
          position: { select: { id: true, name: true, code: true } },
          staffPosition: { select: { id: true, code: true, title: true } },
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              divisionId: true,
              positionId: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parsePositionLines(raw: unknown[]): Array<{
    positionId: string;
    staffPositionId?: string | null;
    employeeId?: string | null;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    normDays: number | null;
    normHours: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const positionId = String(row.positionId || '');
      if (!positionId) throw new BadRequestException(`lines[${idx}].positionId is required`);
      const daysRaw =
        row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        positionId,
        staffPositionId: row.staffPositionId ? String(row.staffPositionId) : null,
        employeeId: row.employeeId ? String(row.employeeId) : null,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        normDays:
          row.normDays != null && row.normDays !== '' ? Number(row.normDays) : null,
        normHours:
          row.normHours != null && row.normHours !== '' ? Number(row.normHours) : null,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  async createPositionScheduleDoc(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const kind = this.parseScheduleKind(body.kind);
    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parsePositionLines(body.lines)
        : [];

    for (const line of lines) {
      const pos = await this.prisma.position.findFirst({
        where: { id: line.positionId, tenantId },
        select: { id: true },
      });
      if (!pos) throw new NotFoundException(`Position ${line.positionId} not found`);
      if (line.employeeId) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
    }
    if (body.divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: String(body.divisionId), tenantId },
        select: { id: true },
      });
      if (!div) throw new NotFoundException('Division not found');
    }

    return this.prisma.positionScheduleDoc.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        kind,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        settings: (body.settings as Prisma.InputJsonValue) ?? undefined,
        normDays:
          body.normDays != null && body.normDays !== ''
            ? new Prisma.Decimal(Number(body.normDays))
            : undefined,
        normHours:
          body.normHours != null && body.normHours !== ''
            ? new Prisma.Decimal(Number(body.normHours))
            : undefined,
        lines: {
          create: lines.map((l) => ({
            positionId: l.positionId,
            staffPositionId: l.staffPositionId ?? undefined,
            employeeId: l.employeeId ?? undefined,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            normDays: l.normDays != null ? new Prisma.Decimal(l.normDays) : undefined,
            normHours: l.normHours != null ? new Prisma.Decimal(l.normHours) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  async updatePositionScheduleDoc(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft documents can be edited');
    }

    const data: Prisma.PositionScheduleDocUpdateInput = {};
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.kind !== undefined) data.kind = this.parseScheduleKind(body.kind);
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.divisionId !== undefined) {
      data.division = body.divisionId
        ? { connect: { id: String(body.divisionId) } }
        : { disconnect: true };
    }
    if (body.settings !== undefined) data.settings = body.settings as Prisma.InputJsonValue;
    if (body.normDays !== undefined) {
      data.normDays =
        body.normDays != null && body.normDays !== ''
          ? new Prisma.Decimal(Number(body.normDays))
          : null;
    }
    if (body.normHours !== undefined) {
      data.normHours =
        body.normHours != null && body.normHours !== ''
          ? new Prisma.Decimal(Number(body.normHours))
          : null;
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parsePositionLines(body.lines) : [];
      for (const line of lines) {
        const pos = await this.prisma.position.findFirst({
          where: { id: line.positionId, tenantId },
          select: { id: true },
        });
        if (!pos) throw new NotFoundException(`Position ${line.positionId} not found`);
      }
      await this.prisma.positionScheduleDocLine.deleteMany({ where: { documentId: id } });
      data.lines = {
        create: lines.map((l) => ({
          positionId: l.positionId,
          staffPositionId: l.staffPositionId ?? undefined,
          employeeId: l.employeeId ?? undefined,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          normDays: l.normDays != null ? new Prisma.Decimal(l.normDays) : undefined,
          normHours: l.normHours != null ? new Prisma.Decimal(l.normHours) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data,
      include: this.positionScheduleDocInclude(),
    });
  }

  async postPositionScheduleDoc(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Document already posted');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled document cannot be posted');
    }
    if (row.lines.length === 0) {
      throw new BadRequestException('Cannot post empty document');
    }

    const settings =
      row.settings && typeof row.settings === 'object'
        ? (row.settings as Record<string, unknown>)
        : {};
    const shiftList = Array.isArray(settings.shifts)
      ? (settings.shifts as VerifixShiftMeta[])
      : [];

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      if (!line.employeeId) continue;
      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        let hours = this.dayHoursValue(String(cell));
        if (hours == null && shiftList.length) {
          hours = shiftCodeHours(String(cell), shiftList);
        }
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));
        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });
      }
    }

    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  async cancelPositionScheduleDoc(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.positionScheduleDoc.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Position schedule document not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Проведённый документ нельзя отменить напрямую');
    }
    if (row.status === 'cancelled') {
      throw new BadRequestException('Already cancelled');
    }
    return this.prisma.positionScheduleDoc.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.positionScheduleDocInclude(),
    });
  }

  /** Fill rows from staff positions / employees. */
  async fillPositionScheduleDoc(
    tenantId: string,
    body: {
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      positionIds?: string[];
      fillOnlyWithEmployees?: boolean;
      dayNorm?: number;
      weekPattern?: '5/2' | '6/1' | '5/1';
      kind?: string;
      displayMode?: 'hours' | 'time_range';
      startTime?: string;
      endTime?: string;
      defaultShiftCode?: string;
    },
  ) {
    const month = this.monthStartFrom(
      { month: body.month, year: body.year, monthNum: body.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIdx = month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const dayNorm = Number(body.dayNorm ?? 8);
    const pattern = body.weekPattern || '5/2';
    const kind = String(body.kind || 'ordinary');
    const displayMode = body.displayMode || 'hours';
    const startTime = body.startTime || '09:00';
    const endTime = body.endTime || '18:00';
    const onlyWithEmp = body.fillOnlyWithEmployees !== false;
    const shiftCode = body.defaultShiftCode || '';

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        positionId: { not: null },
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.positionIds?.length
          ? { positionId: { in: body.positionIds } }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        externalId: true,
        divisionId: true,
        positionId: true,
        staffPositionId: true,
        position: { select: { id: true, name: true, code: true } },
        staffPosition: { select: { id: true, code: true, title: true } },
        division: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 800,
    });

    type LineOut = {
      positionId: string;
      staffPositionId?: string | null;
      employeeId?: string | null;
      sortOrder: number;
      days: Record<string, string>;
      daysCount: number;
      hoursTotal: number;
      employee?: (typeof employees)[0] | null;
      position?: { id: string; name: string; code: string } | null;
      staffPosition?: { id: string; code: string; title: string } | null;
    };

    const lines: LineOut[] = [];

    if (onlyWithEmp || employees.length > 0) {
      for (const emp of employees) {
        if (!emp.positionId) continue;
        const days = this.buildMonthDaysGrid({
          year,
          monthIdx,
          dim,
          pattern,
          kind,
          displayMode,
          dayNorm,
          startTime,
          endTime,
          shiftCode,
        });
        const totals = this.computeLineTotals(days);
        lines.push({
          positionId: emp.positionId,
          staffPositionId: emp.staffPositionId,
          employeeId: emp.id,
          sortOrder: lines.length,
          days,
          daysCount: totals.daysCount,
          hoursTotal: totals.hoursTotal,
          employee: emp,
          position: emp.position,
          staffPosition: emp.staffPosition,
        });
      }
    }

    if (!onlyWithEmp) {
      const positions = await this.prisma.position.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(body.positionIds?.length ? { id: { in: body.positionIds } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
        take: 500,
      });
      const covered = new Set(lines.map((l) => l.positionId));
      for (const pos of positions) {
        if (covered.has(pos.id)) continue;
        // skip if already has employee line for this position when only empty vacancies
        const days = this.buildMonthDaysGrid({
          year,
          monthIdx,
          dim,
          pattern,
          kind,
          displayMode,
          dayNorm,
          startTime,
          endTime,
          shiftCode,
        });
        const totals = this.computeLineTotals(days);
        lines.push({
          positionId: pos.id,
          employeeId: null,
          sortOrder: lines.length,
          days,
          daysCount: totals.daysCount,
          hoursTotal: totals.hoursTotal,
          position: pos,
        });
      }
    }

    return {
      month: month.toISOString().slice(0, 10),
      lines,
      normDays: lines[0]?.daysCount ?? 0,
      normHours: lines[0] ? round2((lines[0].daysCount || 0) * dayNorm) : 0,
    };
  }

  private buildMonthDaysGrid(opts: {
    year: number;
    monthIdx: number;
    dim: number;
    pattern: string;
    kind: string;
    displayMode: string;
    dayNorm: number;
    startTime: string;
    endTime: string;
    shiftCode?: string;
  }) {
    const days: Record<string, string> = {};
    for (let d = 1; d <= opts.dim; d++) {
      const wd = new Date(Date.UTC(opts.year, opts.monthIdx, d)).getUTCDay();
      const isWeekend =
        opts.pattern === '6/1' ? wd === 0 : wd === 0 || wd === 6;
      if (isWeekend) {
        days[String(d)] = opts.kind === 'advanced' ? 'R' : 'В';
      } else if (opts.shiftCode) {
        days[String(d)] = opts.shiftCode;
      } else if (opts.displayMode === 'time_range') {
        days[String(d)] = `${opts.startTime}-${opts.endTime}`;
      } else {
        days[String(d)] = String(opts.dayNorm);
      }
    }
    return days;
  }

  /** Download Verifix xlsx template (optionally prefilled). */
  async downloadScheduleTemplate(
    tenantId: string,
    opts: {
      resource: 'schedule-overrides' | 'position-schedules';
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      documentId?: string;
      fillOnlyWithEmployees?: boolean;
    },
  ) {
    const month = this.monthStartFrom(
      { month: opts.month, year: opts.year, monthNum: opts.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();

    let seedRows: Array<{
      id?: string;
      staff?: string;
      employee?: string;
      division?: string;
      position?: string;
      days: Record<string, string>;
    }> = [];
    let shifts: VerifixShiftMeta[] | undefined;

    if (opts.documentId) {
      if (opts.resource === 'schedule-overrides') {
        const doc = await this.prisma.individualSchedule.findFirst({
          where: { id: opts.documentId, tenantId },
          include: {
            lines: {
              include: {
                employee: {
                  select: {
                    id: true,
                    tabNumber: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    externalId: true,
                    division: { select: { name: true } },
                    position: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (doc) {
          const settings = (doc.settings || {}) as Record<string, unknown>;
          if (Array.isArray(settings.shifts)) shifts = settings.shifts as VerifixShiftMeta[];
          seedRows = doc.lines.map((l) => {
            const e = l.employee;
            const name = e
              ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
              : '';
            return {
              id: e?.externalId || e?.tabNumber || e?.id,
              employee: name,
              division: e?.division?.name || '',
              position: e?.position?.name || '',
              days:
                l.days && typeof l.days === 'object'
                  ? (l.days as Record<string, string>)
                  : {},
            };
          });
        }
      } else {
        const doc = await this.prisma.positionScheduleDoc.findFirst({
          where: { id: opts.documentId, tenantId },
          include: {
            lines: {
              include: {
                position: true,
                staffPosition: true,
                employee: {
                  select: {
                    id: true,
                    tabNumber: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    externalId: true,
                    division: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (doc) {
          const settings = (doc.settings || {}) as Record<string, unknown>;
          if (Array.isArray(settings.shifts)) shifts = settings.shifts as VerifixShiftMeta[];
          seedRows = doc.lines.map((l) => {
            const e = l.employee;
            const name = e
              ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
              : '';
            return {
              id: e?.externalId || e?.tabNumber || e?.id || l.positionId,
              staff: l.staffPosition?.code || '',
              employee: name,
              division: e?.division?.name || '',
              position: l.staffPosition
                ? `${l.staffPosition.title}/${l.position?.name || ''}(${l.staffPosition.code})`
                : l.position?.name || '',
              days:
                l.days && typeof l.days === 'object'
                  ? (l.days as Record<string, string>)
                  : {},
            };
          });
        }
      }
    } else if (opts.resource === 'position-schedules') {
      const filled = await this.fillPositionScheduleDoc(tenantId, {
        month: month.toISOString().slice(0, 10),
        divisionId: opts.divisionId,
        fillOnlyWithEmployees: opts.fillOnlyWithEmployees !== false,
        dayNorm: 8,
        weekPattern: '5/2',
      });
      seedRows = filled.lines.map((l) => {
        const e = l.employee;
        const name = e
          ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ')
          : '';
        return {
          id: e?.externalId || e?.tabNumber || e?.id || l.positionId,
          staff: l.staffPosition?.code || '',
          employee: name,
          division: e?.division?.name || '',
          position: l.position
            ? `${l.position.name}${l.position.code ? ` (${l.position.code})` : ''}`
            : '',
          days: l.days,
        };
      });
    }

    const buffer = await buildIndividualScheduleTemplateBuffer({
      year,
      monthIndex,
      seedRows,
      shifts,
    });
    const label =
      opts.resource === 'position-schedules'
        ? 'individual-schedule-positions'
        : 'individual-schedule';
    return {
      buffer,
      filename: `${label}-${year}-${String(monthIndex + 1).padStart(2, '0')}.xlsx`,
    };
  }

  /** Import Verifix xlsx into line drafts (or attach to existing draft). */
  async importScheduleTemplate(
    tenantId: string,
    opts: {
      resource: 'schedule-overrides' | 'position-schedules';
      file: Buffer;
      documentId?: string;
      month?: string;
      kind?: string;
      merge?: boolean;
    },
  ) {
    const parsed = await parseIndividualScheduleWorkbook(opts.file);
    if (!parsed.rows.length && !parsed.shifts.length) {
      throw new BadRequestException('Файл пуст или не распознан (листы data/metadata)');
    }

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active' },
      select: {
        id: true,
        tabNumber: true,
        externalId: true,
        firstName: true,
        lastName: true,
        middleName: true,
        divisionId: true,
        positionId: true,
        staffPositionId: true,
        position: { select: { id: true, name: true, code: true } },
        staffPosition: { select: { id: true, code: true, title: true } },
      },
      take: 2000,
    });
    const positions = await this.prisma.position.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });
    const staffPositions = await this.prisma.staffPosition.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, title: true, positionId: true },
      take: 2000,
    });

    const empByTab = new Map(employees.map((e) => [e.tabNumber.toLowerCase(), e]));
    const empByExt = new Map(
      employees.filter((e) => e.externalId).map((e) => [String(e.externalId).toLowerCase(), e]),
    );
    const empByName = new Map(
      employees.map((e) => {
        const n = [e.lastName, e.firstName, e.middleName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/\s+/g, ' ');
        return [n, e] as const;
      }),
    );
    const posByCode = new Map(positions.map((p) => [p.code.toLowerCase(), p]));
    const posByName = new Map(positions.map((p) => [p.name.toLowerCase(), p]));
    const staffByCode = new Map(staffPositions.map((s) => [s.code.toLowerCase(), s]));

    const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    if (opts.resource === 'schedule-overrides') {
      const lines: Array<{
        employeeId: string;
        days: Record<string, string>;
        daysCount: number;
        hoursTotal: number;
        matched?: string;
      }> = [];
      const unmatched: string[] = [];

      for (const row of parsed.rows) {
        let emp =
          (row.id && (empByTab.get(row.id.toLowerCase()) || empByExt.get(row.id.toLowerCase()))) ||
          (row.employee && empByName.get(normName(row.employee)));
        if (!emp && row.employee) {
          const loose = [...empByName.entries()].find(([n]) => n.includes(normName(row.employee!)));
          if (loose) emp = loose[1];
        }
        if (!emp) {
          unmatched.push(row.employee || row.id || '?');
          continue;
        }
        const days = { ...row.days };
        // resolve shift hours totals using metadata
        let hoursTotal = 0;
        let daysCount = 0;
        for (const [k, v] of Object.entries(days)) {
          let h = this.dayHoursValue(v);
          if (h == null) h = shiftCodeHours(v, parsed.shifts);
          if (h != null) {
            daysCount += 1;
            hoursTotal += h;
          }
        }
        lines.push({
          employeeId: emp.id,
          days,
          daysCount,
          hoursTotal: round2(hoursTotal),
          matched: [emp.lastName, emp.firstName].join(' '),
        });
      }

      if (opts.documentId) {
        const updated = await this.updateIndividualSchedule(tenantId, opts.documentId, {
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          settings: {
            useTemplate: true,
            shifts: parsed.shifts,
          },
        });
        return { document: updated, imported: lines.length, unmatched, shifts: parsed.shifts };
      }

      return {
        lines,
        shifts: parsed.shifts,
        imported: lines.length,
        unmatched,
        monthDays: parsed.monthDays,
      };
    }

    // position-schedules
    const lines: Array<{
      positionId: string;
      staffPositionId?: string | null;
      employeeId?: string | null;
      days: Record<string, string>;
      daysCount: number;
      hoursTotal: number;
      matched?: string;
    }> = [];
    const unmatched: string[] = [];

    for (const row of parsed.rows) {
      type EmpRow = (typeof employees)[number];
      let emp: EmpRow | undefined;
      if (row.id) {
        emp = empByTab.get(row.id.toLowerCase()) || empByExt.get(row.id.toLowerCase());
      }
      if (!emp && row.employee) {
        emp = empByName.get(normName(row.employee));
      }
      if (!emp && row.employee) {
        const loose = [...empByName.entries()].find(([n]) => n.includes(normName(row.employee!)));
        if (loose) emp = loose[1];
      }

      let staff =
        (row.staff && staffByCode.get(row.staff.toLowerCase())) || undefined;
      if (!staff && row.position) {
        const codeMatch = row.position.match(/\((\d+)\)\s*$/);
        if (codeMatch) staff = staffByCode.get(codeMatch[1]);
      }

      let pos =
        emp?.position ||
        (staff?.positionId ? positions.find((p) => p.id === staff!.positionId) : undefined) ||
        (row.position && posByName.get(normName(row.position.split('/')[0] || row.position))) ||
        (row.position && posByCode.get(row.position.toLowerCase())) ||
        undefined;

      if (!pos && !emp) {
        unmatched.push(row.position || row.employee || row.id || '?');
        continue;
      }
      if (!pos && emp?.positionId) {
        pos = positions.find((p) => p.id === emp!.positionId) || emp.position || undefined;
      }
      if (!pos) {
        unmatched.push(row.position || row.employee || '?');
        continue;
      }

      const days = { ...row.days };
      let hoursTotal = 0;
      let daysCount = 0;
      for (const v of Object.values(days)) {
        let h = this.dayHoursValue(v);
        if (h == null) h = shiftCodeHours(v, parsed.shifts);
        if (h != null) {
          daysCount += 1;
          hoursTotal += h;
        }
      }
      lines.push({
        positionId: pos.id,
        staffPositionId: staff?.id || emp?.staffPositionId || null,
        employeeId: emp?.id || null,
        days,
        daysCount,
        hoursTotal: round2(hoursTotal),
        matched: row.position || pos.name,
      });
    }

    if (opts.documentId) {
      const updated = await this.updatePositionScheduleDoc(tenantId, opts.documentId, {
        lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
        settings: {
          useTemplate: true,
          fillOnlyWithEmployees: true,
          shifts: parsed.shifts,
        },
      });
      return { document: updated, imported: lines.length, unmatched, shifts: parsed.shifts };
    }

    return {
      lines,
      shifts: parsed.shifts,
      imported: lines.length,
      unmatched,
      monthDays: parsed.monthDays,
    };
  }

  // ─── Work rosters (Verifix «Расписание») ───────────────────────────────────

  private workRosterInclude() {
    return {
      schedule: { select: { id: true, name: true, code: true, kind: true } },
      lines: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              positionId: true,
              position: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private parseRosterLines(raw: unknown[]): Array<{
    employeeId: string;
    sortOrder: number;
    days: Record<string, string>;
    daysCount: number | null;
    hoursTotal: number | null;
    note?: string | null;
  }> {
    return raw.map((item, idx) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const employeeId = String(row.employeeId || '');
      if (!employeeId) throw new BadRequestException(`lines[${idx}].employeeId is required`);
      const daysRaw =
        row.days && typeof row.days === 'object' ? (row.days as Record<string, unknown>) : {};
      const days: Record<string, string> = {};
      for (const [k, v] of Object.entries(daysRaw)) {
        if (v == null || v === '') continue;
        days[String(k)] = String(v);
      }
      const totals = this.computeLineTotals(days);
      return {
        employeeId,
        sortOrder: Number(row.sortOrder ?? idx),
        days,
        daysCount:
          row.daysCount != null && row.daysCount !== ''
            ? Number(row.daysCount)
            : totals.daysCount,
        hoursTotal:
          row.hoursTotal != null && row.hoursTotal !== ''
            ? Number(row.hoursTotal)
            : totals.hoursTotal,
        note: row.note != null ? String(row.note) : null,
      };
    });
  }

  async createWorkRoster(tenantId: string, body: Record<string, unknown>) {
    const documentDate = parseDateParam(
      String(body.documentDate || new Date().toISOString().slice(0, 10)),
      new Date(),
      'documentDate',
    );
    const month = this.monthStartFrom(body, documentDate);
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Название is required');
    const scheduleId = String(body.scheduleId || '');
    if (!scheduleId) throw new BadRequestException('График работы is required');
    const sched = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, tenantId },
      select: { id: true },
    });
    if (!sched) throw new NotFoundException('Work schedule not found');

    const lines =
      Array.isArray(body.lines) && body.lines.length > 0
        ? this.parseRosterLines(body.lines)
        : [];
    for (const line of lines) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: line.employeeId, tenantId },
        select: { id: true },
      });
      if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
    }

    return this.prisma.workRoster.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        name,
        documentDate,
        number: body.number ? String(body.number) : undefined,
        month,
        scheduleId,
        note: body.note != null ? String(body.note) : undefined,
        verified: false,
        lines: {
          create: lines.map((l) => ({
            employeeId: l.employeeId,
            sortOrder: l.sortOrder,
            days: l.days as Prisma.InputJsonValue,
            daysCount: l.daysCount ?? undefined,
            hoursTotal:
              l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
            note: l.note ?? undefined,
          })),
        },
      },
      include: this.workRosterInclude(),
    });
  }

  async updateWorkRoster(tenantId: string, id: string, body: Record<string, unknown>) {
    const row = await this.prisma.workRoster.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft rosters can be edited');
    }

    const data: Prisma.WorkRosterUpdateInput = {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw new BadRequestException('Название is required');
      data.name = name;
    }
    if (body.documentDate !== undefined) {
      data.documentDate = parseDateParam(
        String(body.documentDate),
        row.documentDate,
        'documentDate',
      );
    }
    if (body.month !== undefined || body.year != null || body.monthNum != null) {
      data.month = this.monthStartFrom(body, row.month);
    }
    if (body.number !== undefined) data.number = body.number ? String(body.number) : null;
    if (body.note !== undefined) data.note = body.note != null ? String(body.note) : null;
    if (body.scheduleId !== undefined) {
      const scheduleId = String(body.scheduleId || '');
      if (!scheduleId) throw new BadRequestException('График работы is required');
      const sched = await this.prisma.workSchedule.findFirst({
        where: { id: scheduleId, tenantId },
        select: { id: true },
      });
      if (!sched) throw new NotFoundException('Work schedule not found');
      data.schedule = { connect: { id: scheduleId } };
    }

    if (body.lines !== undefined) {
      const lines = Array.isArray(body.lines) ? this.parseRosterLines(body.lines) : [];
      for (const line of lines) {
        const emp = await this.prisma.employee.findFirst({
          where: { id: line.employeeId, tenantId },
          select: { id: true },
        });
        if (!emp) throw new NotFoundException(`Employee ${line.employeeId} not found`);
      }
      await this.prisma.workRosterLine.deleteMany({ where: { rosterId: id } });
      data.lines = {
        create: lines.map((l) => ({
          employeeId: l.employeeId,
          sortOrder: l.sortOrder,
          days: l.days as Prisma.InputJsonValue,
          daysCount: l.daysCount ?? undefined,
          hoursTotal: l.hoursTotal != null ? new Prisma.Decimal(l.hoursTotal) : undefined,
          note: l.note ?? undefined,
        })),
      };
    }

    return this.prisma.workRoster.update({
      where: { id },
      data,
      include: this.workRosterInclude(),
    });
  }

  async postWorkRoster(tenantId: string, id: string, postedBy?: string) {
    const row = await this.prisma.workRoster.findFirst({
      where: { id, tenantId },
      include: { lines: true, schedule: true },
    });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status === 'posted') throw new BadRequestException('Already posted');
    if (row.status === 'cancelled') throw new BadRequestException('Cancelled');
    if (row.lines.length === 0) throw new BadRequestException('Cannot post empty roster');

    const year = row.month.getUTCFullYear();
    const monthIdx = row.month.getUTCMonth();
    const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    for (const line of row.lines) {
      // Assign work schedule to employee on post
      await this.prisma.employee.update({
        where: { id: line.employeeId },
        data: { scheduleId: row.scheduleId },
      });

      const days =
        line.days && typeof line.days === 'object' && !Array.isArray(line.days)
          ? (line.days as Record<string, string>)
          : {};
      for (let d = 1; d <= dim; d++) {
        const cell = days[String(d)];
        if (cell == null || cell === '') continue;
        const hours = this.dayHoursValue(String(cell));
        if (hours == null) continue;
        const workDate = new Date(Date.UTC(year, monthIdx, d));
        await this.prisma.attendanceDay.upsert({
          where: {
            tenantId_employeeId_workDate: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            status: DayStatus.not_started,
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
          update: {
            plannedHours: new Prisma.Decimal(round2(hours)),
          },
        });

        const shiftLabel =
          row.schedule?.name ||
          (String(cell).match(/^\d/) ? `Смена ${cell}` : String(cell));
        const sourceRef = `${row.id}:${line.employeeId}:${d}`;
        await this.prisma.scheduleShiftAssignment.upsert({
          where: {
            tenantId_employeeId_workDate_source_sourceRef: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
              source: 'roster',
              sourceRef,
            },
          },
          create: {
            tenantId,
            employeeId: line.employeeId,
            workDate,
            number: d,
            shiftLabel,
            status: 'planned',
            replaced: false,
            source: 'roster',
            sourceRef,
            scheduleId: row.scheduleId,
            note: row.number ? `№ ${row.number}` : row.name,
          },
          update: {
            number: d,
            shiftLabel,
            status: 'planned',
            scheduleId: row.scheduleId,
            note: row.number ? `№ ${row.number}` : row.name,
          },
        });
      }
    }

    return this.prisma.workRoster.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        verified: true,
        postedAt: new Date(),
        postedBy: postedBy ?? undefined,
      },
      include: this.workRosterInclude(),
    });
  }

  async cancelWorkRoster(tenantId: string, id: string, cancelledBy?: string) {
    const row = await this.prisma.workRoster.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Roster not found');
    if (row.status === 'posted') {
      throw new BadRequestException('Проведённый документ нельзя отменить напрямую');
    }
    if (row.status === 'cancelled') throw new BadRequestException('Already cancelled');
    return this.prisma.workRoster.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedBy: cancelledBy ?? row.postedBy ?? undefined,
      },
      include: this.workRosterInclude(),
    });
  }

  /** Prefill employee month grids from a work schedule template. */
  async fillWorkRoster(
    tenantId: string,
    body: {
      scheduleId: string;
      month?: string;
      year?: number;
      monthNum?: number;
      divisionId?: string;
      employeeIds?: string[];
    },
  ) {
    const scheduleId = String(body.scheduleId || '');
    if (!scheduleId) throw new BadRequestException('scheduleId is required');
    const sched = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, tenantId },
    });
    if (!sched) throw new NotFoundException('Work schedule not found');

    const month = this.monthStartFrom(
      { month: body.month, year: body.year, monthNum: body.monthNum },
      new Date(),
    );
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const settings = parseScheduleSettings(sched.settings) as ScheduleSettings;
    const days = monthDaysFromSchedule({
      year,
      monthIndex,
      settings,
      kind: sched.kind as Skind,
      startTime: sched.startTime,
      endTime: sched.endTime,
    });
    const totals = this.computeLineTotals(days);

    let employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(body.divisionId ? { divisionId: body.divisionId } : {}),
        ...(body.employeeIds?.length ? { id: { in: body.employeeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        positionId: true,
        position: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 500,
    });

    if (body.employeeIds?.length) {
      const map = new Map(employees.map((e) => [e.id, e]));
      employees = body.employeeIds.map((id) => map.get(id)).filter(Boolean) as typeof employees;
    }

    // If no ids and no division: prefer employees already on this schedule
    if (!body.employeeIds?.length && !body.divisionId) {
      const onSched = await this.prisma.employee.findMany({
        where: { tenantId, status: 'active', scheduleId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          positionId: true,
          position: { select: { id: true, name: true } },
        },
        orderBy: { lastName: 'asc' },
        take: 500,
      });
      if (onSched.length) employees = onSched;
    }

    return {
      month: month.toISOString().slice(0, 10),
      schedule: { id: sched.id, name: sched.name, code: sched.code },
      lines: employees.map((emp, idx) => ({
        employeeId: emp.id,
        sortOrder: idx,
        days: { ...days },
        daysCount: totals.daysCount,
        hoursTotal: totals.hoursTotal,
        employee: emp,
      })),
    };
  }

  // ─── Список смен расписания (operational assignments) ─────────────────────

  private shiftAssignmentInclude() {
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
      replacedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      },
      schedule: { select: { id: true, name: true, code: true } },
      shift: {
        select: { id: true, code: true, name: true, startTime: true, endTime: true },
      },
    };
  }

  async listShiftAssignments(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      employeeId?: string;
      status?: string;
      q?: string;
    } = {},
  ) {
    const where: Prisma.ScheduleShiftAssignmentWhereInput = { tenantId };
    const from = opts.from
      ? parseDateParam(String(opts.from), new Date(), 'from')
      : null;
    const to = opts.to ? parseDateParam(String(opts.to), new Date(), 'to') : null;
    if (from || to) {
      where.workDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (opts.employeeId) where.employeeId = opts.employeeId;
    if (opts.status) where.status = opts.status;

    const q = (opts.q || '').trim();
    if (q) {
      where.OR = [
        { shiftLabel: { contains: q, mode: 'insensitive' } },
        { source: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
        {
          employee: {
            OR: [
              { lastName: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { tabNumber: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        {
          schedule: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    return this.prisma.scheduleShiftAssignment.findMany({
      where,
      include: this.shiftAssignmentInclude(),
      orderBy: [{ workDate: 'desc' }, { number: 'asc' }],
      take: 2000,
    });
  }

  /** Rematerialize shift list from posted work rosters for a date window. */
  async rebuildShiftAssignments(
    tenantId: string,
    body: { from?: string; to?: string } = {},
  ) {
    const now = new Date();
    const from =
      body.from != null
        ? parseDateParam(String(body.from), now, 'from')
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to =
      body.to != null
        ? parseDateParam(String(body.to), now, 'to')
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    await this.prisma.scheduleShiftAssignment.deleteMany({
      where: {
        tenantId,
        source: 'roster',
        workDate: { gte: from, lte: to },
      },
    });

    const rosters = await this.prisma.workRoster.findMany({
      where: {
        tenantId,
        status: DocumentLifecycle.posted,
        month: {
          gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)),
          lte: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)),
        },
      },
      include: { lines: true, schedule: true },
    });

    let created = 0;
    for (const row of rosters) {
      const year = row.month.getUTCFullYear();
      const monthIdx = row.month.getUTCMonth();
      const dim = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
      const shiftLabel = row.schedule?.name || 'Смена';
      for (const line of row.lines) {
        const days =
          line.days && typeof line.days === 'object' && !Array.isArray(line.days)
            ? (line.days as Record<string, string>)
            : {};
        for (let d = 1; d <= dim; d++) {
          const cell = days[String(d)];
          if (cell == null || cell === '') continue;
          const hours = this.dayHoursValue(String(cell));
          if (hours == null) continue;
          const workDate = new Date(Date.UTC(year, monthIdx, d));
          if (workDate < from || workDate > to) continue;
          const sourceRef = `${row.id}:${line.employeeId}:${d}`;
          await this.prisma.scheduleShiftAssignment.create({
            data: {
              tenantId,
              employeeId: line.employeeId,
              workDate,
              number: d,
              shiftLabel,
              status: 'planned',
              replaced: false,
              source: 'roster',
              sourceRef,
              scheduleId: row.scheduleId,
              note: row.number ? `№ ${row.number}` : row.name,
            },
          });
          created += 1;
        }
      }
    }

    return { from, to, created, rosters: rosters.length };
  }

  async bulkShiftAssignments(
    tenantId: string,
    body: { ids?: string[]; action?: string },
  ) {
    const ids = Array.isArray(body.ids)
      ? body.ids.map(String).filter(Boolean)
      : [];
    if (!ids.length) throw new BadRequestException('ids required');
    const action = String(body.action || '').toLowerCase();
    if (!['cancel', 'complete', 'delete', 'plan'].includes(action)) {
      throw new BadRequestException('action must be cancel|complete|delete|plan');
    }

    const owned = await this.prisma.scheduleShiftAssignment.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = owned.map((r) => r.id);
    let ok = 0;
    if (action === 'delete') {
      const res = await this.prisma.scheduleShiftAssignment.deleteMany({
        where: { tenantId, id: { in: ownedIds } },
      });
      ok = res.count;
    } else {
      const status =
        action === 'cancel'
          ? 'cancelled'
          : action === 'complete'
            ? 'completed'
            : 'planned';
      const res = await this.prisma.scheduleShiftAssignment.updateMany({
        where: { tenantId, id: { in: ownedIds } },
        data: {
          status,
          ...(status === 'planned' ? { replaced: false, replacedById: null } : {}),
        },
      });
      ok = res.count;
    }
    return { ok, skipped: ids.length - ok, total: ids.length };
  }
}

function round2(h: number) {
  return Math.round(h * 100) / 100;
}

function numDec(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function eachUtcDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function planNormHours(start: string, end: string) {
  const parse = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => Number(x) || 0);
    return h * 60 + m;
  };
  let mins = parse(end) - parse(start);
  if (mins <= 0) mins += 24 * 60;
  if (mins >= 8 * 60) mins -= 60;
  return round2(mins / 60);
}

function creditedOnTimeHours(
  firstIn: Date,
  lastOut: Date,
  planStart: string,
  planEnd: string,
  countLunch: boolean,
) {
  const day = new Date(firstIn);
  day.setHours(0, 0, 0, 0);
  const parse = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => Number(x) || 0);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const planS = parse(planStart);
  const planE = parse(planEnd);
  const winStart = firstIn > planS ? firstIn : planS;
  const winEnd = lastOut < planE ? lastOut : planE;
  if (winEnd.getTime() <= winStart.getTime()) return 0;
  let mins = (winEnd.getTime() - winStart.getTime()) / 60000;
  if (countLunch) {
    const lunchS = parse('13:00');
    const lunchE = parse('14:00');
    const overlapMs = Math.max(
      0,
      Math.min(winEnd.getTime(), lunchE.getTime()) -
        Math.max(winStart.getTime(), lunchS.getTime()),
    );
    mins -= overlapMs / 60000;
  }
  return Math.max(0, mins / 60);
}

function hoursBefore(firstIn: Date, planStart: string) {
  const day = new Date(firstIn);
  day.setHours(0, 0, 0, 0);
  const [h, m] = planStart.split(':').map((x) => Number(x) || 0);
  const planS = new Date(day);
  planS.setHours(h, m, 0, 0);
  if (firstIn.getTime() >= planS.getTime()) return 0;
  return (planS.getTime() - firstIn.getTime()) / 3600000;
}

function hoursAfter(lastOut: Date, planEnd: string) {
  const day = new Date(lastOut);
  day.setHours(0, 0, 0, 0);
  const [h, m] = planEnd.split(':').map((x) => Number(x) || 0);
  const planE = new Date(day);
  planE.setHours(h, m, 0, 0);
  if (lastOut.getTime() <= planE.getTime()) return 0;
  return (lastOut.getTime() - planE.getTime()) / 3600000;
}

type DayHours = {
  workDate: Date;
  status: DayStatus;
  plannedHours: number;
  onTimeHours: number;
  outsideHours: number;
  workedHours: number;
  overtimeHours: number;
  beforeHours: number;
  afterHours: number;
};

type HourTargets = {
  plannedHours: number | null;
  onTimeHours: number | null;
  outsideHours: number | null;
  workedHours: number | null;
  overtimeHours: number | null;
  beforeHours: number | null;
  afterHours: number | null;
};

function scaleDailyHoursToTargets(days: DayHours[], target: HourTargets): DayHours[] {
  const keys = [
    'plannedHours',
    'onTimeHours',
    'outsideHours',
    'workedHours',
    'overtimeHours',
    'beforeHours',
    'afterHours',
  ] as const;

  const sums: Record<(typeof keys)[number], number> = {
    plannedHours: 0,
    onTimeHours: 0,
    outsideHours: 0,
    workedHours: 0,
    overtimeHours: 0,
    beforeHours: 0,
    afterHours: 0,
  };
  for (const d of days) {
    for (const k of keys) sums[k] += d[k];
  }

  return days.map((d) => {
    const next = { ...d };
    for (const k of keys) {
      const t = target[k];
      if (t == null) continue;
      if (sums[k] > 0.0001) {
        next[k] = round2((d[k] / sums[k]) * t);
      } else {
        const workDays = days.filter((x) => x.status !== DayStatus.day_off).length;
        next[k] = workDays > 0 ? round2(t / workDays) : round2(t);
      }
    }
    return next;
  });
}
