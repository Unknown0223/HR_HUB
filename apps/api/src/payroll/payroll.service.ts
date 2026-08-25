import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DayStatus,
  DocumentLifecycle,
  PayrollLineType,
  PayrollPeriodStatus,
  AdvanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildExcelBuffer } from '../common/excel';
import type { ImportResult } from '../common/import.dto';
import {
  CalculatePeriodDto,
  CreateAdvanceDto,
  CreateAllowancePolicyDto,
  CreateFinePolicyDto,
  CreateManualLineDto,
  CreatePeriodDto,
  CreatePolicyDto,
  CreateTimesheetSheetDto,
  FillTimesheetDto,
  FinePolicyRuleDto,
  FinePolicyRulesDto,
  AllowancePolicyRuleDto,
  TimesheetSettingsDto,
  TimesheetSheetLineDto,
  UpdateAllowancePolicyDto,
  UpdateFinePolicyDto,
  UpdateTimesheetSheetDto,
} from './dto';

const FINE_SCOPES = new Set(['company', 'division', 'position', 'employee']);
const ALLOWANCE_SCOPES = new Set(['company', 'division', 'schedule']);
const TIME_HM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const FINE_RULE_TYPES = new Set([
  'coefficient',
  'amount',
  'time',
  'annulment',
  'percent',
]);
const FINE_RULE_KEYS = [
  'late',
  'early',
  'absence',
  'missed_day',
  'missed_mark',
] as const;

type FineRuleKey = (typeof FINE_RULE_KEYS)[number];

function emptyFineRules(): Record<FineRuleKey, FinePolicyRuleDto[]> {
  return {
    late: [],
    early: [],
    absence: [],
    missed_day: [],
    missed_mark: [],
  };
}

function asStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function firstOfMonth(input: string): Date {
  const m = String(input || '').trim();
  const ym = m.match(/^(\d{4})-(\d{2})/);
  if (!ym) throw new BadRequestException('Месяц обязателен');
  const year = Number(ym[1]);
  const month = Number(ym[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    throw new BadRequestException('Некорректный месяц');
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

function parseIsoDate(input: string, field: string): Date {
  const m = String(input || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new BadRequestException(`${field} обязательна`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asFinite(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const TIME_KIND_KEYS = ['presence', 'early', 'free', 'absence', 'late'] as const;
type TimeKindKey = (typeof TIME_KIND_KEYS)[number];

type TimesheetDaysMap = Record<TimeKindKey, Record<string, number>>;

function emptyTimesheetDays(): TimesheetDaysMap {
  return { presence: {}, early: {}, free: {}, absence: {}, late: {} };
}

function normalizeTimesheetDays(raw: unknown): TimesheetDaysMap {
  const out = emptyTimesheetDays();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const key of TIME_KIND_KEYS) {
    const bucket = src[key];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const [day, val] of Object.entries(bucket as Record<string, unknown>)) {
      const n = asFinite(val);
      if (n == null || n === 0) continue;
      out[key][day] = round2(n);
    }
  }
  return out;
}

type TimesheetUiSettings = {
  allTimeTypes: boolean;
  timeTypeIds: string[];
  showPlannedDays: boolean;
  showPlannedHours: boolean;
  showWorkedHours: boolean;
  showWorkedDays: boolean;
};

function defaultTimesheetSettings(): TimesheetUiSettings {
  return {
    allTimeTypes: true,
    timeTypeIds: [],
    showPlannedDays: true,
    showPlannedHours: true,
    showWorkedHours: true,
    showWorkedDays: true,
  };
}

function mergeTimesheetSettings(raw: unknown): TimesheetUiSettings {
  const d = defaultTimesheetSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    allTimeTypes: o.allTimeTypes !== false,
    timeTypeIds: asStringIds(o.timeTypeIds),
    showPlannedDays: o.showPlannedDays !== false,
    showPlannedHours: o.showPlannedHours !== false,
    showWorkedHours: o.showWorkedHours !== false,
    showWorkedDays: o.showWorkedDays !== false,
  };
}

function extrasRecord(raw: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function normalizeFineRule(raw: FinePolicyRuleDto, index: number): FinePolicyRuleDto {
  const type = String(raw.type || '').trim();
  if (!FINE_RULE_TYPES.has(type)) {
    throw new BadRequestException(`Некорректный тип правила (#${index + 1})`);
  }
  const id =
    raw.id && String(raw.id).trim()
      ? String(raw.id).trim()
      : `r_${Date.now().toString(36)}_${index}`;
  const out: FinePolicyRuleDto = { id, type };
  if (raw.timeFrom != null) out.timeFrom = Number(raw.timeFrom);
  if (raw.timeTo != null) out.timeTo = Number(raw.timeTo);
  if (raw.repeatFrom != null) out.repeatFrom = Number(raw.repeatFrom);
  if (raw.repeatTo != null) out.repeatTo = Number(raw.repeatTo);
  if (raw.value != null) out.value = Number(raw.value);
  if (raw.periodicityMin != null) out.periodicityMin = Number(raw.periodicityMin);
  if (raw.onlyInsidePeriod != null) out.onlyInsidePeriod = Boolean(raw.onlyInsidePeriod);
  if (type !== 'annulment' && (out.value == null || Number.isNaN(out.value))) {
    throw new BadRequestException(`Значение обязательно (#${index + 1})`);
  }
  return out;
}

function normalizeFineRules(raw?: FinePolicyRulesDto | null): Record<FineRuleKey, FinePolicyRuleDto[]> {
  const base = emptyFineRules();
  if (!raw || typeof raw !== 'object') return base;
  for (const key of FINE_RULE_KEYS) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    base[key] = list.map((r, i) => normalizeFineRule(r, i));
  }
  return base;
}

function normTime(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) throw new BadRequestException('Некорректное время (ЧЧ:ММ)');
  const hh = String(Number(m[1])).padStart(2, '0');
  const mm = m[2];
  const packed = `${hh}:${mm}`;
  if (!TIME_HM.test(packed)) throw new BadRequestException('Некорректное время (ЧЧ:ММ)');
  return packed;
}

function normalizeAllowanceRules(raw?: AllowancePolicyRuleDto[] | null): AllowancePolicyRuleDto[] {
  if (!Array.isArray(raw)) return [];
  const out: AllowancePolicyRuleDto[] = [];
  raw.forEach((r, i) => {
    const startTime = r.startTime ? normTime(r.startTime) : '';
    const endTime = r.endTime ? normTime(r.endTime) : '';
    const coefficient =
      r.coefficient == null || Number.isNaN(Number(r.coefficient))
        ? undefined
        : Number(r.coefficient);
    if (!startTime && !endTime && coefficient == null) return;
    if (!startTime || !endTime) {
      throw new BadRequestException(`Укажите время начала и конца (#${i + 1})`);
    }
    if (coefficient == null) {
      throw new BadRequestException(`Укажите коэффициент доплаты (#${i + 1})`);
    }
    out.push({
      id:
        r.id && String(r.id).trim()
          ? String(r.id).trim()
          : `ar_${Date.now().toString(36)}_${i}`,
      startTime,
      endTime,
      coefficient,
    });
  });
  return out;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  listPolicies(tenantId: string) {
    return this.prisma.payrollPolicy.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  createPolicy(tenantId: string, dto: CreatePolicyDto) {
    return this.prisma.payrollPolicy.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        latePenaltyPerMin: dto.latePenaltyPerMin ?? 500,
        absencePenalty: dto.absencePenalty ?? 100000,
        overtimeBonusPerHour: dto.overtimeBonusPerHour ?? 25000,
        baseSalaryDefault: dto.baseSalaryDefault ?? 5000000,
      },
    });
  }

  listPeriods(tenantId: string) {
    return this.prisma.payrollPeriod.findMany({
      where: { tenantId },
      include: {
        _count: { select: { lines: true, advances: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async createPeriod(tenantId: string, dto: CreatePeriodDto) {
    return this.prisma.payrollPeriod.create({
      data: {
        tenantId,
        year: dto.year,
        month: dto.month,
        note: dto.note,
      },
    });
  }

  async getPeriod(tenantId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                tabNumber: true,
                division: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        advances: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, tabNumber: true },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Period not found');
    return period;
  }

  async calculatePeriod(
    tenantId: string,
    periodId: string,
    dto: CalculatePeriodDto = {},
  ) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.status === PayrollPeriodStatus.closed) {
      throw new BadRequestException('Period is closed');
    }

    let policy = dto.policyId
      ? await this.prisma.payrollPolicy.findFirst({
          where: { id: dto.policyId, tenantId },
        })
      : await this.prisma.payrollPolicy.findFirst({
          where: { tenantId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!policy) {
      policy = await this.prisma.payrollPolicy.create({
        data: {
          tenantId,
          code: 'DEFAULT',
          name: 'Standart siyosat',
        },
      });
    }

    const from = new Date(period.year, period.month - 1, 1);
    const to = new Date(period.year, period.month, 0, 23, 59, 59);

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', employmentType: 'staff' },
    });

    await this.prisma.payrollLine.deleteMany({
      where: {
        tenantId,
        periodId,
        type: {
          in: [
            PayrollLineType.base,
            PayrollLineType.penalty,
            PayrollLineType.advance,
          ],
        },
      },
    });

    const created: string[] = [];
    const defaultSalary = Number(policy.baseSalaryDefault);
    const latePerMin = Number(policy.latePenaltyPerMin);
    const absencePenalty = Number(policy.absencePenalty);

    for (const emp of employees) {
      const days = await this.prisma.attendanceDay.findMany({
        where: {
          tenantId,
          employeeId: emp.id,
          workDate: { gte: from, lte: to },
        },
      });

      const workDays = days.filter(
        (d) =>
          d.status === DayStatus.on_time ||
          d.status === DayStatus.late ||
          d.status === DayStatus.leave,
      ).length;
      const lateMinutes = days.reduce((s, d) => s + (d.lateMinutes || 0), 0);
      const absenceDays = days.filter((d) => d.status === DayStatus.absent).length;

      const base = emp.baseSalary ? Number(emp.baseSalary) : defaultSalary;
      const baseLine = await this.prisma.payrollLine.create({
        data: {
          tenantId,
          periodId,
          employeeId: emp.id,
          type: PayrollLineType.base,
          status: DocumentLifecycle.posted,
          postedAt: new Date(),
          description: `Asosiy oylik (${period.year}-${String(period.month).padStart(2, '0')})`,
          amount: new Prisma.Decimal(base),
          workDays,
          lateMinutes,
          absenceDays,
        },
      });
      created.push(baseLine.id);

      const penaltyAmt = lateMinutes * latePerMin + absenceDays * absencePenalty;
      if (penaltyAmt > 0) {
        const pen = await this.prisma.payrollLine.create({
          data: {
            tenantId,
            periodId,
            employeeId: emp.id,
            type: PayrollLineType.penalty,
            status: DocumentLifecycle.posted,
            postedAt: new Date(),
            description: `Jarima: kechikish ${lateMinutes} min, yo‘qlik ${absenceDays} kun`,
            amount: new Prisma.Decimal(-penaltyAmt),
            workDays,
            lateMinutes,
            absenceDays,
          },
        });
        created.push(pen.id);
      }
    }

    // Materialize paid advances as negative deduction lines (idempotent via deleteMany above)
    const advances = await this.prisma.payrollAdvance.findMany({
      where: {
        tenantId,
        periodId,
        status: AdvanceStatus.paid,
      },
    });
    for (const adv of advances) {
      const line = await this.prisma.payrollLine.create({
        data: {
          tenantId,
          periodId,
          employeeId: adv.employeeId,
          type: PayrollLineType.advance,
          status: DocumentLifecycle.posted,
          postedAt: new Date(),
          description: adv.note || `Avans (${period.year}-${String(period.month).padStart(2, '0')})`,
          amount: new Prisma.Decimal(-Math.abs(Number(adv.amount))),
        },
      });
      created.push(line.id);
    }

    await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: PayrollPeriodStatus.calculated },
    });

    return this.getPeriod(tenantId, periodId);
  }

  async closePeriod(tenantId: string, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId },
      include: { lines: true, advances: true },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.status === PayrollPeriodStatus.closed) {
      throw new BadRequestException('Period already closed');
    }
    if (period.status === PayrollPeriodStatus.open) {
      throw new BadRequestException(
        'Period must be calculated (Рассчитать) before closing ведомость',
      );
    }
    const posted = period.lines.filter((l) => l.status === DocumentLifecycle.posted);
    if (posted.length === 0) {
      throw new BadRequestException('Cannot close period with no posted payroll lines');
    }
    const fot = posted.reduce((s, l) => s + Number(l.amount), 0);
    return this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.closed,
        closedAt: new Date(),
        note: [period.note, `ФОТ=${fot.toFixed(2)}`].filter(Boolean).join(' | '),
      },
    });
  }

  async reopenPeriod(tenantId: string, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.status !== PayrollPeriodStatus.closed) {
      throw new BadRequestException('Only closed periods can be reopened');
    }
    return this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: PayrollPeriodStatus.open, closedAt: null },
    });
  }

  async createManualLine(tenantId: string, dto: CreateManualLineDto) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: dto.periodId, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.status === PayrollPeriodStatus.closed) {
      throw new BadRequestException('Period is closed');
    }
    return this.prisma.payrollLine.create({
      data: {
        tenantId,
        periodId: dto.periodId,
        employeeId: dto.employeeId,
        type: dto.type,
        status: DocumentLifecycle.draft,
        amount: dto.amount,
        description: dto.description,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
      },
    });
  }

  async postPayrollLine(tenantId: string, id: string) {
    const line = await this.prisma.payrollLine.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        period: true,
      },
    });
    if (!line) throw new NotFoundException('Payroll line not found');
    if (line.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Payroll line already posted');
    }
    if (line.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Cancelled payroll line cannot be posted');
    }
    if (line.period.status === PayrollPeriodStatus.closed) {
      throw new BadRequestException('Period is closed');
    }
    return this.prisma.payrollLine.update({
      where: { id },
      data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        period: true,
      },
    });
  }

  async cancelPayrollLine(tenantId: string, id: string) {
    const line = await this.prisma.payrollLine.findFirst({
      where: { id, tenantId },
      include: { period: true },
    });
    if (!line) throw new NotFoundException('Payroll line not found');
    if (line.period.status === PayrollPeriodStatus.closed) {
      throw new BadRequestException('Period is closed');
    }
    if (line.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Payroll line already cancelled');
    }
    return this.prisma.payrollLine.update({
      where: { id },
      data: { status: DocumentLifecycle.cancelled, postedAt: null },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        period: true,
      },
    });
  }

  listLines(tenantId: string, periodId: string) {
    return this.prisma.payrollLine.findMany({
      where: { tenantId, periodId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  listAdvances(tenantId: string) {
    return this.prisma.payrollAdvance.findMany({
      where: { tenantId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        period: { select: { id: true, year: true, month: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });
  }

  createAdvance(tenantId: string, dto: CreateAdvanceDto) {
    const status = dto.status ?? AdvanceStatus.paid;
    return this.prisma.payrollAdvance.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        periodId: dto.periodId,
        amount: dto.amount,
        note: dto.note,
        status,
        paidAt:
          status === AdvanceStatus.paid
            ? dto.paidAt
              ? new Date(dto.paidAt)
              : new Date()
            : dto.paidAt
              ? new Date(dto.paidAt)
              : null,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
      },
    });
  }

  async payAdvance(tenantId: string, id: string) {
    const adv = await this.prisma.payrollAdvance.findFirst({
      where: { id, tenantId },
    });
    if (!adv) throw new NotFoundException('Advance not found');
    if (adv.status === AdvanceStatus.paid) {
      throw new BadRequestException('Advance already paid');
    }
    if (adv.status === AdvanceStatus.cancelled) {
      throw new BadRequestException('Cancelled advance cannot be paid');
    }
    return this.prisma.payrollAdvance.update({
      where: { id },
      data: { status: AdvanceStatus.paid, paidAt: new Date() },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
      },
    });
  }

  async vedomost(tenantId: string, periodId: string) {
    const period = await this.getPeriod(tenantId, periodId);
    const byEmp = new Map<
      string,
      {
        employee: {
          id: string;
          firstName: string;
          lastName: string;
          tabNumber: string;
          division?: { name: string } | null;
        };
        base: number;
        bonus: number;
        penalty: number;
        deduction: number;
        overtime: number;
        other: number;
        advance: number;
        net: number;
      }
    >();

    for (const line of period.lines) {
      if (line.status !== DocumentLifecycle.posted) continue;
      const key = line.employeeId;
      if (!byEmp.has(key)) {
        byEmp.set(key, {
          employee: line.employee,
          base: 0,
          bonus: 0,
          penalty: 0,
          deduction: 0,
          overtime: 0,
          other: 0,
          advance: 0,
          net: 0,
        });
      }
      const row = byEmp.get(key)!;
      const amt = Number(line.amount);
      switch (line.type) {
        case PayrollLineType.base:
          row.base += amt;
          break;
        case PayrollLineType.bonus:
          row.bonus += amt;
          break;
        case PayrollLineType.penalty:
          row.penalty += amt;
          break;
        case PayrollLineType.deduction:
          row.deduction += amt;
          break;
        case PayrollLineType.advance:
          row.advance += Math.abs(amt);
          break;
        case PayrollLineType.overtime:
          row.overtime += amt;
          break;
        default:
          row.other += amt;
      }
      row.net += amt;
    }

    // If calculate already materialized advance lines, do not subtract advances again.
    const hasAdvanceLines = period.lines.some(
      (l) => l.type === PayrollLineType.advance,
    );
    if (!hasAdvanceLines) {
      for (const adv of period.advances) {
        if ((adv as { status?: string }).status === 'cancelled') continue;
        if ((adv as { status?: string }).status === 'draft') continue;
        const key = adv.employeeId;
        if (!byEmp.has(key)) {
          byEmp.set(key, {
            employee: adv.employee as {
              id: string;
              firstName: string;
              lastName: string;
              tabNumber: string;
              division?: { name: string } | null;
            },
            base: 0,
            bonus: 0,
            penalty: 0,
            deduction: 0,
            overtime: 0,
            other: 0,
            advance: 0,
            net: 0,
          });
        }
        const row = byEmp.get(key)!;
        const amt = Number(adv.amount);
        row.advance += amt;
        row.net -= amt;
      }
    }

    const rows = [...byEmp.values()];
    const totals = rows.reduce(
      (acc, r) => ({
        base: acc.base + r.base,
        bonus: acc.bonus + r.bonus,
        penalty: acc.penalty + r.penalty,
        deduction: acc.deduction + r.deduction,
        overtime: acc.overtime + r.overtime,
        other: acc.other + r.other,
        advance: acc.advance + r.advance,
        net: acc.net + r.net,
      }),
      {
        base: 0,
        bonus: 0,
        penalty: 0,
        deduction: 0,
        overtime: 0,
        other: 0,
        advance: 0,
        net: 0,
      },
    );

    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        status: period.status,
      },
      rows,
      totals,
    };
  }

  async timesheet(tenantId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', employmentType: 'staff' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        tabNumber: true,
        division: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte: from, lte: to },
      },
    });

    return employees.map((emp) => {
      const empDays = days.filter((d) => d.employeeId === emp.id);
      return {
        employee: emp,
        onTime: empDays.filter((d) => d.status === DayStatus.on_time).length,
        late: empDays.filter((d) => d.status === DayStatus.late).length,
        absent: empDays.filter((d) => d.status === DayStatus.absent).length,
        leave: empDays.filter((d) => d.status === DayStatus.leave).length,
        lateMinutes: empDays.reduce((s, d) => s + d.lateMinutes, 0),
        plannedHours: empDays.reduce((s, d) => s + Number(d.plannedHours || 0), 0),
        workedHours: empDays.reduce((s, d) => s + Number(d.workedHours || 0), 0),
        overtimeHours: empDays.reduce((s, d) => s + Number(d.overtimeHours || 0), 0),
        onTimeHours: empDays.reduce((s, d) => s + Number(d.onTimeHours || 0), 0),
        days: empDays.map((d) => ({
          date: d.workDate,
          status: d.status,
          lateMinutes: d.lateMinutes,
          firstInAt: d.firstInAt,
          lastOutAt: d.lastOutAt,
          plannedHours: d.plannedHours,
          workedHours: d.workedHours,
          overtimeHours: d.overtimeHours,
          onTimeHours: d.onTimeHours,
          outsideHours: d.outsideHours,
          beforeHours: d.beforeHours,
          afterHours: d.afterHours,
          correctionId: d.correctionId,
        })),
      };
    });
  }

  async exportLinesXlsx(tenantId: string, periodId: string) {
    if (!periodId) throw new BadRequestException('periodId is required');
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId },
    });
    if (!period) throw new NotFoundException('Period not found');
    const lines = await this.listLines(tenantId, periodId);
    const columns = [
      'tabNumber',
      'employee',
      'type',
      'amount',
      'description',
      'workDays',
      'lateMinutes',
      'absenceDays',
    ];
    const rows = lines.map((l) => ({
      tabNumber: l.employee.tabNumber,
      employee: `${l.employee.lastName} ${l.employee.firstName}`,
      type: l.type,
      amount: Number(l.amount),
      description: l.description ?? '',
      workDays: l.workDays ?? '',
      lateMinutes: l.lateMinutes ?? '',
      absenceDays: l.absenceDays ?? '',
    }));
    const buffer = await buildExcelBuffer({
      sheetName: `Lines ${period.year}-${period.month}`,
      columns,
      rows,
    });
    return {
      buffer,
      filename: `payroll-lines-${period.year}-${String(period.month).padStart(2, '0')}.xlsx`,
    };
  }

  async exportAdvancesXlsx(tenantId: string) {
    const advances = await this.listAdvances(tenantId);
    const columns = ['tabNumber', 'employee', 'amount', 'status', 'period', 'note', 'paidAt'];
    const rows = advances.map((a) => ({
      tabNumber: a.employee.tabNumber,
      employee: `${a.employee.lastName} ${a.employee.firstName}`,
      amount: Number(a.amount),
      status: a.status,
      period: a.period ? `${a.period.year}-${String(a.period.month).padStart(2, '0')}` : '',
      note: a.note ?? '',
      paidAt: a.paidAt ? a.paidAt.toISOString().slice(0, 10) : '',
    }));
    const buffer = await buildExcelBuffer({ sheetName: 'Advances', columns, rows });
    return { buffer, filename: 'payroll-advances.xlsx' };
  }

  /**
   * Import one-time payroll lines.
   * Columns: periodId OR year+month, employeeTabNumber OR employeeId,
   * type? (default other), amount, description?
   */
  async importLines(tenantId: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      try {
        const periodId = await this.resolvePeriodId(tenantId, row);
        if (!periodId) {
          result.errors.push({ row: rowNum, message: 'periodId or year+month is required' });
          continue;
        }
        const period = await this.prisma.payrollPeriod.findFirst({
          where: { id: periodId, tenantId },
        });
        if (!period) {
          result.errors.push({ row: rowNum, message: 'Payroll period not found' });
          continue;
        }
        if (period.status === PayrollPeriodStatus.closed) {
          result.errors.push({ row: rowNum, message: 'Period is closed' });
          continue;
        }

        const employeeId = await this.resolveEmployeeId(tenantId, row);
        if (!employeeId) {
          result.errors.push({
            row: rowNum,
            message: 'employeeTabNumber or employeeId is required',
          });
          continue;
        }

        const amountRaw = row.amount;
        if (amountRaw == null || amountRaw === '') {
          result.errors.push({ row: rowNum, message: 'amount is required' });
          continue;
        }
        const amount = Number(amountRaw);
        if (!Number.isFinite(amount)) {
          result.errors.push({ row: rowNum, message: 'amount must be a number' });
          continue;
        }

        const typeRaw = row.type ? String(row.type) : PayrollLineType.other;
        const type = Object.values(PayrollLineType).includes(typeRaw as PayrollLineType)
          ? (typeRaw as PayrollLineType)
          : PayrollLineType.other;

        await this.prisma.payrollLine.create({
          data: {
            tenantId,
            periodId,
            employeeId,
            type,
            amount: new Prisma.Decimal(amount),
            description: row.description ? String(row.description) : undefined,
          },
        });
        result.created += 1;
      } catch (err) {
        result.errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
    return result;
  }

  /**
   * Import payroll advances.
   * Columns: employeeTabNumber OR employeeId, amount, periodId?, note?, status? (default draft).
   */
  async importAdvances(tenantId: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      try {
        const employeeId = await this.resolveEmployeeId(tenantId, row);
        if (!employeeId) {
          result.errors.push({
            row: rowNum,
            message: 'employeeTabNumber or employeeId is required',
          });
          continue;
        }

        const amountRaw = row.amount;
        if (amountRaw == null || amountRaw === '') {
          result.errors.push({ row: rowNum, message: 'amount is required' });
          continue;
        }
        const amount = Number(amountRaw);
        if (!Number.isFinite(amount)) {
          result.errors.push({ row: rowNum, message: 'amount must be a number' });
          continue;
        }

        const statusRaw = row.status ? String(row.status) : AdvanceStatus.draft;
        const status = Object.values(AdvanceStatus).includes(statusRaw as AdvanceStatus)
          ? (statusRaw as AdvanceStatus)
          : AdvanceStatus.draft;

        let periodId: string | undefined = row.periodId ? String(row.periodId) : undefined;
        if (!periodId && (row.year != null || row.month != null)) {
          const resolved = await this.resolvePeriodId(tenantId, row);
          periodId = resolved ?? undefined;
        }

        await this.prisma.payrollAdvance.create({
          data: {
            tenantId,
            employeeId,
            periodId,
            amount: new Prisma.Decimal(amount),
            note: row.note ? String(row.note) : undefined,
            status,
            paidAt: status === AdvanceStatus.paid ? new Date() : null,
          },
        });
        result.created += 1;
      } catch (err) {
        result.errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
    return result;
  }

  listFinePolicies(tenantId: string, scope?: string) {
    const where: Prisma.FinePolicyWhereInput = { tenantId };
    if (scope && FINE_SCOPES.has(scope)) where.scope = scope;
    return this.prisma.finePolicy
      .findMany({
        where,
        include: {
          division: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      })
      .then((rows) => this.hydrateFinePolicies(tenantId, rows));
  }

  async getFinePolicy(tenantId: string, id: string) {
    const row = await this.prisma.finePolicy.findFirst({
      where: { id, tenantId },
      include: {
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Политика не найдена');
    const [hydrated] = await this.hydrateFinePolicies(tenantId, [row]);
    return hydrated;
  }

  async createFinePolicy(tenantId: string, dto: CreateFinePolicyDto) {
    const data = await this.buildFinePolicyData(tenantId, dto);
    const created = await this.prisma.finePolicy.create({
      data,
      include: {
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    });
    const [hydrated] = await this.hydrateFinePolicies(tenantId, [created]);
    return hydrated;
  }

  async updateFinePolicy(tenantId: string, id: string, dto: UpdateFinePolicyDto) {
    const existing = await this.prisma.finePolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Политика не найдена');
    const data: Prisma.FinePolicyUpdateInput = {};
    if (dto.month != null) data.month = firstOfMonth(dto.month);
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.isActive != null) data.isActive = dto.isActive;
    if (dto.divisionId !== undefined) {
      data.division = dto.divisionId
        ? { connect: { id: dto.divisionId } }
        : { disconnect: true };
    }
    if (dto.positionId !== undefined) {
      data.position = dto.positionId
        ? { connect: { id: dto.positionId } }
        : { disconnect: true };
    }
    if (dto.employeeIds !== undefined) {
      data.employeeIds = dto.employeeIds as unknown as Prisma.InputJsonValue;
    }
    if (dto.rules !== undefined) {
      data.rules = normalizeFineRules(dto.rules) as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.finePolicy.update({
      where: { id },
      data,
      include: {
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    });
    const [hydrated] = await this.hydrateFinePolicies(tenantId, [updated]);
    return hydrated;
  }

  async deleteFinePolicy(tenantId: string, id: string) {
    const existing = await this.prisma.finePolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Политика не найдена');
    await this.prisma.finePolicy.delete({ where: { id } });
    return { ok: true };
  }

  async bulkDeleteFinePolicies(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return { deleted: 0 };
    const result = await this.prisma.finePolicy.deleteMany({
      where: { tenantId, id: { in: unique } },
    });
    return { deleted: result.count };
  }

  async copyFinePolicy(tenantId: string, id: string) {
    const src = await this.getFinePolicy(tenantId, id);
    return this.createFinePolicy(tenantId, {
      scope: src.scope,
      month: src.month.slice(0, 10),
      name: src.name ? `${src.name} (копия)` : '',
      isActive: src.isActive,
      divisionId: src.divisionId ?? undefined,
      positionId: src.positionId ?? undefined,
      employeeIds: src.employeeIds,
      rules: src.rules,
    });
  }

  private async buildFinePolicyData(
    tenantId: string,
    dto: CreateFinePolicyDto,
  ): Promise<Prisma.FinePolicyCreateInput> {
    const scope = String(dto.scope || '').trim();
    if (!FINE_SCOPES.has(scope)) {
      throw new BadRequestException('Некорректная область политики');
    }
    const month = firstOfMonth(dto.month);
    const divisionId = dto.divisionId?.trim() || null;
    const positionId = dto.positionId?.trim() || null;
    const employeeIds = asStringIds(dto.employeeIds);
    if (scope === 'division' && !divisionId) {
      throw new BadRequestException('Подразделение обязательно');
    }
    if (scope === 'position' && !positionId) {
      throw new BadRequestException('Должность обязательна');
    }
    if (scope === 'employee' && employeeIds.length === 0) {
      throw new BadRequestException('Сотрудники обязательны');
    }
    if (divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: divisionId, tenantId },
      });
      if (!div) throw new BadRequestException('Подразделение не найдено');
    }
    if (positionId) {
      const pos = await this.prisma.position.findFirst({
        where: { id: positionId, tenantId },
      });
      if (!pos) throw new BadRequestException('Должность не найдена');
    }
    return {
      tenant: { connect: { id: tenantId } },
      scope,
      month,
      name: (dto.name || '').trim(),
      isActive: dto.isActive !== false,
      division: divisionId ? { connect: { id: divisionId } } : undefined,
      position: positionId ? { connect: { id: positionId } } : undefined,
      employeeIds: employeeIds as unknown as Prisma.InputJsonValue,
      rules: normalizeFineRules(dto.rules) as unknown as Prisma.InputJsonValue,
    };
  }

  private async hydrateFinePolicies(
    tenantId: string,
    rows: Array<{
      id: string;
      tenantId: string;
      scope: string;
      month: Date;
      name: string;
      isActive: boolean;
      divisionId: string | null;
      positionId: string | null;
      employeeIds: Prisma.JsonValue | null;
      rules: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
      division?: { id: string; name: string } | null;
      position?: { id: string; name: string } | null;
    }>,
  ) {
    const empIds = new Set<string>();
    for (const row of rows) {
      for (const id of asStringIds(row.employeeIds)) empIds.add(id);
    }
    const employees =
      empIds.size === 0
        ? []
        : await this.prisma.employee.findMany({
            where: { tenantId, id: { in: [...empIds] } },
            select: {
              id: true,
              tabNumber: true,
              firstName: true,
              lastName: true,
            },
          });
    const empMap = new Map(
      employees.map((e) => [
        e.id,
        `${e.tabNumber} — ${e.lastName} ${e.firstName}`.trim(),
      ]),
    );
    return rows.map((row) => {
      const ids = asStringIds(row.employeeIds);
      const rulesRaw =
        row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
          ? (row.rules as FinePolicyRulesDto)
          : undefined;
      return {
        id: row.id,
        scope: row.scope,
        month: row.month.toISOString().slice(0, 10),
        name: row.name,
        isActive: row.isActive,
        divisionId: row.divisionId,
        positionId: row.positionId,
        division: row.division ?? null,
        position: row.position ?? null,
        employeeIds: ids,
        employees: ids.map((id) => ({
          id,
          label: empMap.get(id) || id,
        })),
        rules: normalizeFineRules(rulesRaw),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  listAllowancePolicies(tenantId: string, scope?: string) {
    const where: Prisma.AllowancePolicyWhereInput = { tenantId };
    if (scope && ALLOWANCE_SCOPES.has(scope)) where.scope = scope;
    return this.prisma.allowancePolicy
      .findMany({
        where,
        include: {
          division: { select: { id: true, name: true } },
          schedule: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      })
      .then((rows) => this.hydrateAllowancePolicies(rows));
  }

  async getAllowancePolicy(tenantId: string, id: string) {
    const row = await this.prisma.allowancePolicy.findFirst({
      where: { id, tenantId },
      include: {
        division: { select: { id: true, name: true } },
        schedule: { select: { id: true, name: true, code: true } },
      },
    });
    if (!row) throw new NotFoundException('Политика не найдена');
    const [hydrated] = this.hydrateAllowancePolicies([row]);
    return hydrated;
  }

  async createAllowancePolicy(tenantId: string, dto: CreateAllowancePolicyDto) {
    const data = await this.buildAllowancePolicyData(tenantId, dto);
    const created = await this.prisma.allowancePolicy.create({
      data,
      include: {
        division: { select: { id: true, name: true } },
        schedule: { select: { id: true, name: true, code: true } },
      },
    });
    const [hydrated] = this.hydrateAllowancePolicies([created]);
    return hydrated;
  }

  async updateAllowancePolicy(
    tenantId: string,
    id: string,
    dto: UpdateAllowancePolicyDto,
  ) {
    const existing = await this.prisma.allowancePolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Политика не найдена');
    const data: Prisma.AllowancePolicyUpdateInput = {};
    if (dto.month != null) data.month = firstOfMonth(dto.month);
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.isActive != null) data.isActive = dto.isActive;
    if (dto.divisionId !== undefined) {
      data.division = dto.divisionId
        ? { connect: { id: dto.divisionId } }
        : { disconnect: true };
    }
    if (dto.scheduleId !== undefined) {
      data.schedule = dto.scheduleId
        ? { connect: { id: dto.scheduleId } }
        : { disconnect: true };
    }
    if (dto.rules !== undefined) {
      data.rules = normalizeAllowanceRules(dto.rules) as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.allowancePolicy.update({
      where: { id },
      data,
      include: {
        division: { select: { id: true, name: true } },
        schedule: { select: { id: true, name: true, code: true } },
      },
    });
    const [hydrated] = this.hydrateAllowancePolicies([updated]);
    return hydrated;
  }

  async deleteAllowancePolicy(tenantId: string, id: string) {
    const existing = await this.prisma.allowancePolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Политика не найдена');
    await this.prisma.allowancePolicy.delete({ where: { id } });
    return { ok: true };
  }

  async bulkDeleteAllowancePolicies(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return { deleted: 0 };
    const result = await this.prisma.allowancePolicy.deleteMany({
      where: { tenantId, id: { in: unique } },
    });
    return { deleted: result.count };
  }

  async copyAllowancePolicy(tenantId: string, id: string) {
    const src = await this.getAllowancePolicy(tenantId, id);
    return this.createAllowancePolicy(tenantId, {
      scope: src.scope,
      month: src.month.slice(0, 10),
      name: src.name ? `${src.name} (копия)` : '',
      isActive: src.isActive,
      divisionId: src.divisionId ?? undefined,
      scheduleId: src.scheduleId ?? undefined,
      rules: src.rules,
    });
  }

  private async buildAllowancePolicyData(
    tenantId: string,
    dto: CreateAllowancePolicyDto,
  ): Promise<Prisma.AllowancePolicyCreateInput> {
    const scope = String(dto.scope || '').trim();
    if (!ALLOWANCE_SCOPES.has(scope)) {
      throw new BadRequestException('Некорректная область политики');
    }
    const month = firstOfMonth(dto.month);
    const divisionId = dto.divisionId?.trim() || null;
    const scheduleId = dto.scheduleId?.trim() || null;
    if (scope === 'division' && !divisionId) {
      throw new BadRequestException('Подразделение обязательно');
    }
    if (scope === 'schedule' && !scheduleId) {
      throw new BadRequestException('График работы обязателен');
    }
    if (divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: divisionId, tenantId },
      });
      if (!div) throw new BadRequestException('Подразделение не найдено');
    }
    if (scheduleId) {
      const sch = await this.prisma.workSchedule.findFirst({
        where: { id: scheduleId, tenantId },
      });
      if (!sch) throw new BadRequestException('График работы не найден');
    }
    return {
      tenant: { connect: { id: tenantId } },
      scope,
      month,
      name: (dto.name || '').trim(),
      isActive: dto.isActive !== false,
      division: divisionId ? { connect: { id: divisionId } } : undefined,
      schedule: scheduleId ? { connect: { id: scheduleId } } : undefined,
      rules: normalizeAllowanceRules(dto.rules) as unknown as Prisma.InputJsonValue,
    };
  }

  private hydrateAllowancePolicies(
    rows: Array<{
      id: string;
      scope: string;
      month: Date;
      name: string;
      isActive: boolean;
      divisionId: string | null;
      scheduleId: string | null;
      rules: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
      division?: { id: string; name: string } | null;
      schedule?: { id: string; name: string; code: string } | null;
    }>,
  ) {
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      month: row.month.toISOString().slice(0, 10),
      name: row.name,
      isActive: row.isActive,
      divisionId: row.divisionId,
      scheduleId: row.scheduleId,
      division: row.division ?? null,
      schedule: row.schedule ?? null,
      rules: normalizeAllowanceRules(
        Array.isArray(row.rules) ? (row.rules as AllowancePolicyRuleDto[]) : [],
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private timesheetSheetInclude() {
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
    };
  }

  private padDocNumber(n: number): string {
    return String(n).padStart(10, '0');
  }

  private async nextTimesheetNumber(tenantId: string): Promise<string> {
    const rows = await this.prisma.timesheetSheet.findMany({
      where: { tenantId },
      select: { number: true },
    });
    let max = 0;
    for (const r of rows) {
      const digits = String(r.number || '').replace(/\D/g, '');
      const n = parseInt(digits, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return this.padDocNumber(max + 1);
  }

  private hydrateTimesheetSheets(
    rows: Array<{
      id: string;
      tenantId: string;
      status: DocumentLifecycle;
      docDate: Date;
      number: string | null;
      month: Date;
      divisionId: string | null;
      periodType: string;
      note: string | null;
      postedAt: Date | null;
      postedBy: string | null;
      createdAt: Date;
      updatedAt: Date;
      division?: { id: string; name: string; code: string } | null;
      lines?: Array<{
        id: string;
        employeeId: string;
        sortOrder: number;
        tabNumber: string | null;
        fullName: string | null;
        positionName: string | null;
        divisionName: string | null;
        orgUnitName: string | null;
        scheduleName: string | null;
        plannedDays: Prisma.Decimal | null;
        plannedHours: Prisma.Decimal | null;
        workedDays: Prisma.Decimal | null;
        workedHours: Prisma.Decimal | null;
        days: Prisma.JsonValue | null;
        employee?: {
          id: string;
          tabNumber: string;
          firstName: string;
          lastName: string;
          middleName: string | null;
        } | null;
      }>;
      _count?: { lines: number };
    }>,
  ) {
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      docDate: row.docDate.toISOString().slice(0, 10),
      number: row.number,
      month: row.month.toISOString().slice(0, 10),
      divisionId: row.divisionId,
      periodType: row.periodType,
      note: row.note,
      postedAt: row.postedAt,
      postedBy: row.postedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      posted: row.status === DocumentLifecycle.posted,
      division: row.division ?? null,
      lineCount: row._count?.lines ?? row.lines?.length ?? 0,
      lines: (row.lines || []).map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        sortOrder: l.sortOrder,
        tabNumber: l.tabNumber,
        fullName: l.fullName,
        positionName: l.positionName,
        divisionName: l.divisionName,
        orgUnitName: l.orgUnitName,
        scheduleName: l.scheduleName,
        plannedDays: l.plannedDays != null ? Number(l.plannedDays) : null,
        plannedHours: l.plannedHours != null ? Number(l.plannedHours) : null,
        workedDays: l.workedDays != null ? Number(l.workedDays) : null,
        workedHours: l.workedHours != null ? Number(l.workedHours) : null,
        days: normalizeTimesheetDays(l.days),
        employee: l.employee ?? null,
      })),
    }));
  }

  listTimesheetSheets(tenantId: string) {
    return this.prisma.timesheetSheet
      .findMany({
        where: { tenantId },
        include: {
          division: { select: { id: true, name: true, code: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
      })
      .then((rows) => this.hydrateTimesheetSheets(rows));
  }

  async getTimesheetSheet(tenantId: string, id: string) {
    const row = await this.prisma.timesheetSheet.findFirst({
      where: { id, tenantId },
      include: this.timesheetSheetInclude(),
    });
    if (!row) throw new NotFoundException('Табель не найден');
    const [hydrated] = this.hydrateTimesheetSheets([row]);
    return hydrated;
  }

  private async snapshotEmployees(
    tenantId: string,
    employeeIds: string[],
  ): Promise<
    Map<
      string,
      {
        tabNumber: string;
        fullName: string;
        positionName: string;
        divisionName: string;
        orgUnitName: string;
        scheduleName: string;
      }
    >
  > {
    const unique = [...new Set(employeeIds.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: unique }, tenantId },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        position: { select: { name: true } },
        division: { select: { name: true } },
        schedule: { select: { name: true } },
      },
    });
    const map = new Map<
      string,
      {
        tabNumber: string;
        fullName: string;
        positionName: string;
        divisionName: string;
        orgUnitName: string;
        scheduleName: string;
      }
    >();
    for (const emp of emps) {
      const fullName = [emp.lastName, emp.firstName, emp.middleName]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      const divisionName = emp.division?.name || '';
      map.set(emp.id, {
        tabNumber: emp.tabNumber,
        fullName,
        positionName: emp.position?.name || '',
        divisionName,
        orgUnitName: divisionName,
        scheduleName: emp.schedule?.name || '',
      });
    }
    return map;
  }

  private async buildTimesheetLineCreates(
    tenantId: string,
    lines: TimesheetSheetLineDto[] | undefined,
  ): Promise<Prisma.TimesheetSheetLineCreateWithoutSheetInput[]> {
    const list = Array.isArray(lines) ? lines : [];
    const snaps = await this.snapshotEmployees(
      tenantId,
      list.map((l) => l.employeeId),
    );
    const out: Prisma.TimesheetSheetLineCreateWithoutSheetInput[] = [];
    for (let i = 0; i < list.length; i++) {
      const line = list[i];
      const snap = snaps.get(line.employeeId);
      if (!snap) throw new NotFoundException(`Сотрудник ${line.employeeId} не найден`);
      out.push({
        employee: { connect: { id: line.employeeId } },
        sortOrder: i,
        tabNumber: snap.tabNumber,
        fullName: snap.fullName,
        positionName: snap.positionName,
        divisionName: snap.divisionName,
        orgUnitName: snap.orgUnitName,
        scheduleName: snap.scheduleName,
        plannedDays: asFinite(line.plannedDays),
        plannedHours: asFinite(line.plannedHours),
        workedDays: asFinite(line.workedDays),
        workedHours: asFinite(line.workedHours),
        days: normalizeTimesheetDays(line.days) as unknown as Prisma.InputJsonValue,
      });
    }
    return out;
  }

  async createTimesheetSheet(tenantId: string, dto: CreateTimesheetSheetDto) {
    const docDate = parseIsoDate(dto.docDate, 'Дата');
    const month = firstOfMonth(dto.month);
    const divisionId = dto.divisionId?.trim() || null;
    if (divisionId) {
      const div = await this.prisma.division.findFirst({
        where: { id: divisionId, tenantId },
      });
      if (!div) throw new BadRequestException('Подразделение не найдено');
    }
    const number = dto.number?.trim() || (await this.nextTimesheetNumber(tenantId));
    const lines = await this.buildTimesheetLineCreates(tenantId, dto.lines);
    const row = await this.prisma.timesheetSheet.create({
      data: {
        tenantId,
        status: DocumentLifecycle.draft,
        docDate,
        number,
        month,
        divisionId,
        periodType: dto.periodType?.trim() || 'full_month',
        note: dto.note?.trim() || null,
        lines: { create: lines },
      },
      include: this.timesheetSheetInclude(),
    });
    const [hydrated] = this.hydrateTimesheetSheets([row]);
    return hydrated;
  }

  async updateTimesheetSheet(
    tenantId: string,
    id: string,
    dto: UpdateTimesheetSheetDto,
  ) {
    const existing = await this.prisma.timesheetSheet.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Табель не найден');
    if (existing.status !== DocumentLifecycle.draft) {
      throw new BadRequestException('Изменять можно только черновик');
    }
    const data: Prisma.TimesheetSheetUpdateInput = {};
    if (dto.docDate) data.docDate = parseIsoDate(dto.docDate, 'Дата');
    if (dto.number !== undefined) data.number = dto.number.trim() || null;
    if (dto.month) data.month = firstOfMonth(dto.month);
    if (dto.periodType !== undefined) {
      data.periodType = dto.periodType.trim() || 'full_month';
    }
    if (dto.note !== undefined) data.note = dto.note.trim() || null;
    if (dto.divisionId !== undefined) {
      const divisionId = dto.divisionId.trim() || null;
      if (divisionId) {
        const div = await this.prisma.division.findFirst({
          where: { id: divisionId, tenantId },
        });
        if (!div) throw new BadRequestException('Подразделение не найдено');
        data.division = { connect: { id: divisionId } };
      } else {
        data.division = { disconnect: true };
      }
    }
    if (dto.lines) {
      const lines = await this.buildTimesheetLineCreates(tenantId, dto.lines);
      data.lines = { deleteMany: {}, create: lines };
    }
    const row = await this.prisma.timesheetSheet.update({
      where: { id },
      data,
      include: this.timesheetSheetInclude(),
    });
    const [hydrated] = this.hydrateTimesheetSheets([row]);
    return hydrated;
  }

  async deleteTimesheetSheet(tenantId: string, id: string) {
    const existing = await this.prisma.timesheetSheet.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Табель не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Нельзя удалить проведённый табель');
    }
    await this.prisma.timesheetSheet.delete({ where: { id } });
    return { ok: true };
  }

  async postTimesheetSheet(tenantId: string, id: string, postedBy?: string) {
    const existing = await this.prisma.timesheetSheet.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Табель не найден');
    if (existing.status === DocumentLifecycle.posted) {
      throw new BadRequestException('Документ уже проведён');
    }
    if (existing.status === DocumentLifecycle.cancelled) {
      throw new BadRequestException('Нельзя провести отменённый документ');
    }
    const row = await this.prisma.timesheetSheet.update({
      where: { id },
      data: {
        status: DocumentLifecycle.posted,
        postedAt: new Date(),
        postedBy: postedBy || null,
      },
      include: this.timesheetSheetInclude(),
    });
    const [hydrated] = this.hydrateTimesheetSheets([row]);
    return hydrated;
  }

  async cancelTimesheetSheet(tenantId: string, id: string) {
    const existing = await this.prisma.timesheetSheet.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Табель не найден');
    if (existing.status !== DocumentLifecycle.posted) {
      throw new BadRequestException('Отменить можно только проведённый документ');
    }
    const row = await this.prisma.timesheetSheet.update({
      where: { id },
      data: {
        status: DocumentLifecycle.cancelled,
        postedAt: null,
        postedBy: null,
      },
      include: this.timesheetSheetInclude(),
    });
    const [hydrated] = this.hydrateTimesheetSheets([row]);
    return hydrated;
  }

  async bulkPostTimesheetSheets(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    let posted = 0;
    for (const id of unique) {
      const row = await this.prisma.timesheetSheet.findFirst({
        where: { id, tenantId },
      });
      if (!row || row.status !== DocumentLifecycle.draft) continue;
      await this.prisma.timesheetSheet.update({
        where: { id },
        data: { status: DocumentLifecycle.posted, postedAt: new Date() },
      });
      posted += 1;
    }
    return { ok: true, posted };
  }

  async bulkCancelTimesheetSheets(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    let cancelled = 0;
    for (const id of unique) {
      const row = await this.prisma.timesheetSheet.findFirst({
        where: { id, tenantId },
      });
      if (!row || row.status !== DocumentLifecycle.posted) continue;
      await this.prisma.timesheetSheet.update({
        where: { id },
        data: {
          status: DocumentLifecycle.cancelled,
          postedAt: null,
          postedBy: null,
        },
      });
      cancelled += 1;
    }
    return { ok: true, cancelled };
  }

  async bulkDeleteTimesheetSheets(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const result = await this.prisma.timesheetSheet.deleteMany({
      where: {
        tenantId,
        id: { in: unique },
        status: { not: DocumentLifecycle.posted },
      },
    });
    return { ok: true, deleted: result.count };
  }

  async fillTimesheetLines(tenantId: string, dto: FillTimesheetDto) {
    const month = firstOfMonth(dto.month);
    const year = month.getUTCFullYear();
    const mon = month.getUTCMonth() + 1;
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 0, 23, 59, 59));
    const employeeIds = asStringIds(dto.employeeIds);
    const divisionId = dto.divisionId?.trim() || undefined;
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        employmentType: 'staff',
        ...(divisionId ? { divisionId } : {}),
        ...(employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        position: { select: { name: true } },
        division: { select: { name: true } },
        schedule: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId,
        workDate: { gte: from, lte: to },
        ...(employees.length
          ? { employeeId: { in: employees.map((e) => e.id) } }
          : { employeeId: { in: [] } }),
      },
    });
    const byEmp = new Map<string, typeof days>();
    for (const d of days) {
      const list = byEmp.get(d.employeeId) || [];
      list.push(d);
      byEmp.set(d.employeeId, list);
    }
    return {
      lines: employees.map((emp, idx) => {
        const empDays = byEmp.get(emp.id) || [];
        const dayMap = emptyTimesheetDays();
        let plannedDays = 0;
        let plannedHours = 0;
        let workedDays = 0;
        let workedHours = 0;
        for (const d of empDays) {
          const num = new Date(d.workDate).getUTCDate();
          const planned = Number(d.plannedHours || 0);
          const worked = Number(d.workedHours || 0);
          const onTime = Number(d.onTimeHours || 0);
          if (planned > 0) {
            plannedDays += 1;
            plannedHours += planned;
          }
          if (
            d.status === DayStatus.on_time ||
            d.status === DayStatus.late ||
            worked > 0
          ) {
            workedDays += 1;
            workedHours += worked || onTime;
          }
          const presence =
            onTime ||
            (d.status === DayStatus.on_time || d.status === DayStatus.late
              ? worked || 8
              : 0);
          if (presence > 0) dayMap.presence[String(num)] = round2(presence);
          if (d.lateMinutes > 0) {
            dayMap.late[String(num)] = round2(d.lateMinutes / 60);
          }
          if (d.status === DayStatus.absent) {
            dayMap.absence[String(num)] = round2(planned || 8);
          }
          if (d.status === DayStatus.leave) {
            dayMap.free[String(num)] = round2(planned || worked || 8);
          }
          const early = planned > 0 && presence > 0 ? round2(planned - presence) : 0;
          if (early > 0.009) dayMap.early[String(num)] = early;
        }
        const fullName = [emp.lastName, emp.firstName, emp.middleName]
          .filter(Boolean)
          .join(' ')
          .toUpperCase();
        const divisionName = emp.division?.name || '';
        return {
          employeeId: emp.id,
          sortOrder: idx,
          tabNumber: emp.tabNumber,
          fullName,
          positionName: emp.position?.name || '',
          divisionName,
          orgUnitName: divisionName,
          scheduleName: emp.schedule?.name || '',
          plannedDays: round2(plannedDays),
          plannedHours: round2(plannedHours),
          workedDays: round2(workedDays),
          workedHours: round2(workedHours),
          days: dayMap,
        };
      }),
    };
  }

  async getTimesheetSettings(tenantId: string): Promise<TimesheetUiSettings> {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const extras = extrasRecord(settings?.extras ?? null);
    return mergeTimesheetSettings(extras.timesheet);
  }

  async patchTimesheetSettings(tenantId: string, dto: TimesheetSettingsDto) {
    const current = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const extras = extrasRecord(current?.extras ?? null);
    const merged = {
      ...mergeTimesheetSettings(extras.timesheet),
      ...(dto.allTimeTypes != null ? { allTimeTypes: dto.allTimeTypes } : {}),
      ...(dto.timeTypeIds ? { timeTypeIds: asStringIds(dto.timeTypeIds) } : {}),
      ...(dto.showPlannedDays != null
        ? { showPlannedDays: dto.showPlannedDays }
        : {}),
      ...(dto.showPlannedHours != null
        ? { showPlannedHours: dto.showPlannedHours }
        : {}),
      ...(dto.showWorkedHours != null
        ? { showWorkedHours: dto.showWorkedHours }
        : {}),
      ...(dto.showWorkedDays != null ? { showWorkedDays: dto.showWorkedDays } : {}),
    };
    extras.timesheet = merged;
    if (current) {
      await this.prisma.tenantSetting.update({
        where: { tenantId },
        data: { extras: extras as Prisma.InputJsonValue },
      });
    } else {
      await this.prisma.tenantSetting.create({
        data: {
          tenantId,
          extras: extras as Prisma.InputJsonValue,
        },
      });
    }
    return merged;
  }

  private async resolveEmployeeId(
    tenantId: string,
    row: Record<string, unknown>,
  ): Promise<string | null> {
    if (row.employeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: { id: String(row.employeeId), tenantId },
      });
      return emp?.id ?? null;
    }
    const tab = row.employeeTabNumber ?? row.tabNumber;
    if (tab) {
      const emp = await this.prisma.employee.findFirst({
        where: { tenantId, tabNumber: String(tab) },
      });
      return emp?.id ?? null;
    }
    return null;
  }

  private async resolvePeriodId(
    tenantId: string,
    row: Record<string, unknown>,
  ): Promise<string | null> {
    if (row.periodId) {
      return String(row.periodId);
    }
    const year = Number(row.year);
    const month = Number(row.month);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      const period = await this.prisma.payrollPeriod.findUnique({
        where: { tenantId_year_month: { tenantId, year, month } },
      });
      return period?.id ?? null;
    }
    return null;
  }
}
