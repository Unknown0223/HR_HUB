import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmploymentStatus, EmploymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildCsvBuffer, buildExcelBuffer } from '../common/excel';
import type { ImportResult } from '../common/import.dto';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateEmployeeContactsDto, UpdateEmployeePersonalDto, CreateEmployeeBankAccountDto, UpdateEmployeeBankAccountDto, CreateEmployeeBankCardDto, UpdateEmployeeBankCardDto, CreateEmployeePersonDocDto, UpdateEmployeePersonDocDto, CreateEmployeeRelativeDto, UpdateEmployeeRelativeDto, UpdateEmployeeMaritalStatusDto, CreateEmployeeCertificateDto, UpdateEmployeeCertificateDto, CreateEmployeeTenureDto, UpdateEmployeeTenureDto, CreateEmployeeWorkplaceDto, UpdateEmployeeWorkplaceDto, CreateEmployeeAwardDto, UpdateEmployeeAwardDto, UpdateEmployeeFileDto, CreateEmployeeInventoryDto, UpdateEmployeeInventoryDto, CreateEmployeeCarDto, UpdateEmployeeCarDto, UpdateEmployeeIdentificationDto, UpdateEmployeeExtraInfoDto, UpdateEmployeeUserSettingsDto, CreateEmployeeMarkBlockDto, UpdateEmployeeMarkBlockDto } from './dto';
import { pageResult, parsePagination, PageResult } from '../common/pagination';
import {
  defaultReportSettings,
  normalizeReportKind,
} from './report-settings';

/** Query strings reach us untyped — reject unknown enum values with 400, not a Prisma 500. */
function assertEnum<T extends Record<string, string>>(
  enumObj: T,
  value: string,
  field: string,
): T[keyof T] {
  const allowed = Object.values(enumObj);
  if (!allowed.includes(value)) {
    throw new BadRequestException(
      `Invalid ${field} "${value}". Expected one of: ${allowed.join(', ')}`,
    );
  }
  return value as T[keyof T];
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  async list(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
      page?: string | number;
      limit?: string | number;
    } = {},
  ): Promise<PageResult<unknown>> {
    const where = this.buildListWhere(tenantId, filters);
    const { page, limit, skip } = parsePagination(filters.page, filters.limit, {
      defaultLimit: 50,
      maxLimit: 500,
    });
    const [total, items] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: {
          division: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true, code: true } },
          person: {
            select: { id: true, pinfl: true, passport: true, birthDate: true, gender: true },
          },
          schedule: { select: { id: true, name: true, startTime: true, endTime: true } },
          faceProfile: true,
          grade: { select: { id: true, name: true, code: true } },
          region: { select: { id: true, name: true, code: true } },
          accessGrants: {
            where: { accessType: 'profile_flag', isActive: true },
            select: { resource: true },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: limit,
      }),
    ]);
    const mapped = items.map((emp) => {
      const flagSet = new Set(emp.accessGrants.map((g) => g.resource));
      const { accessGrants: _grants, ...rest } = emp;
      return {
        ...rest,
        faceProfile: emp.faceProfile
          ? {
              ...emp.faceProfile,
              photoUrl: this.storage.mediaUrl(
                emp.faceProfile.photoKey,
                emp.faceProfile.photoUrl,
              ),
            }
          : emp.faceProfile,
        profileFlags: {
          excludeFromStats: flagSet.has('exclude_from_stats'),
          systemAccessClosed: flagSet.has('system_access_closed'),
          marksBlocked: flagSet.has('marks_blocked'),
        },
      };
    });
    return pageResult(mapped, total, page, limit);
  }

  private buildListWhere(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
    },
  ): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = { tenantId };
    if (filters.status) {
      where.status = assertEnum(EmploymentStatus, filters.status, 'status');
    }
    if (filters.employmentType) {
      where.employmentType = assertEnum(
        EmploymentType,
        filters.employmentType,
        'employmentType',
      );
    }
    if (filters.divisionId) where.divisionId = filters.divisionId;
    if (filters.positionId) where.positionId = filters.positionId;
    if (filters.q) {
      where.OR = [
        { firstName: { contains: filters.q, mode: 'insensitive' } },
        { lastName: { contains: filters.q, mode: 'insensitive' } },
        { tabNumber: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async listForExport(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
    } = {},
  ) {
    return this.prisma.employee.findMany({
      where: this.buildListWhere(tenantId, filters),
      include: {
        division: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10000,
    });
  }

  async exportXlsx(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
    } = {},
  ) {
    const rows = await this.exportRows(tenantId, filters);
    const columns = [
      'tabNumber',
      'lastName',
      'firstName',
      'middleName',
      'email',
      'status',
      'employmentType',
      'divisionCode',
      'divisionName',
      'positionCode',
      'positionName',
      'baseSalary',
      'hiredAt',
    ];
    const buffer = await buildExcelBuffer({ sheetName: 'Employees', columns, rows });
    return { buffer, filename: 'employees.xlsx' };
  }

  async exportCsv(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
    } = {},
  ) {
    const rows = await this.exportRows(tenantId, filters);
    const columns = [
      'tabNumber',
      'lastName',
      'firstName',
      'middleName',
      'email',
      'status',
      'employmentType',
      'divisionCode',
      'divisionName',
      'positionCode',
      'positionName',
      'baseSalary',
      'hiredAt',
    ];
    const buffer = buildCsvBuffer(columns, rows);
    return { buffer, filename: 'employees.csv' };
  }

  private async exportRows(
    tenantId: string,
    filters: {
      status?: EmploymentStatus;
      employmentType?: EmploymentType;
      divisionId?: string;
      positionId?: string;
      q?: string;
    },
  ) {
    const employees = await this.listForExport(tenantId, filters);
    return employees.map((e) => ({
      tabNumber: e.tabNumber,
      lastName: e.lastName,
      firstName: e.firstName,
      middleName: e.middleName ?? '',
      email: e.email ?? '',
      status: e.status,
      employmentType: e.employmentType,
      divisionCode: e.division?.code ?? '',
      divisionName: e.division?.name ?? '',
      positionCode: e.position?.code ?? '',
      positionName: e.position?.name ?? '',
      baseSalary: e.baseSalary != null ? Number(e.baseSalary) : '',
      hiredAt: e.hiredAt ? e.hiredAt.toISOString().slice(0, 10) : '',
    }));
  }

  /**
   * Import employees from parsed rows.
   * Columns: tabNumber, firstName, lastName, middleName?, email?,
   * divisionCode?|divisionId?, positionCode?|positionId?, baseSalary?,
   * employmentType?, hireDate? (maps to hiredAt).
   */
  static readonly IMPORT_COLUMNS = [
    'tabNumber',
    'firstName',
    'lastName',
    'middleName',
    'email',
    'divisionCode',
    'positionCode',
    'baseSalary',
    'employmentType',
    'hireDate',
  ] as const;

  private importTemplateRows() {
    return [
      {
        tabNumber: '0000009999',
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: 'Алиевич',
        email: 'ivan.example@demo.local',
        divisionCode: 'OPS',
        positionCode: 'DLV',
        baseSalary: '5000000',
        employmentType: 'staff',
        hireDate: '2024-03-01',
      },
      {
        tabNumber: '0000009998',
        firstName: 'Нилуфар',
        lastName: 'Каримова',
        middleName: '',
        email: 'nilufar.example@demo.local',
        divisionCode: 'HR',
        positionCode: 'HRM',
        baseSalary: '',
        employmentType: 'gph',
        hireDate: '2025-01-15',
      },
    ];
  }

  async importTemplateCsv() {
    const columns = [...EmployeesService.IMPORT_COLUMNS];
    const rows = this.importTemplateRows();
    const buffer = buildCsvBuffer(columns, rows);
    return { buffer, filename: 'employees-import-template.csv' };
  }

  async importTemplateXlsx() {
    const columns = [...EmployeesService.IMPORT_COLUMNS];
    const rows = this.importTemplateRows();
    const buffer = await buildExcelBuffer({
      sheetName: 'Import',
      columns,
      rows,
    });
    return { buffer, filename: 'employees-import-template.xlsx' };
  }

  async importEmployees(
    tenantId: string,
    rows: Record<string, unknown>[],
  ): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      try {
        const tabNumber = String(row.tabNumber ?? '').trim();
        const firstName = String(row.firstName ?? '').trim();
        const lastName = String(row.lastName ?? '').trim();
        if (!tabNumber || !firstName || !lastName) {
          result.errors.push({
            row: rowNum,
            message: 'tabNumber, firstName, and lastName are required',
          });
          continue;
        }
        const existing = await this.prisma.employee.findFirst({
          where: { tenantId, tabNumber },
        });
        if (existing) {
          result.skipped += 1;
          continue;
        }

        let divisionId = row.divisionId ? String(row.divisionId) : undefined;
        if (!divisionId && row.divisionCode) {
          const div = await this.prisma.division.findFirst({
            where: { tenantId, code: String(row.divisionCode) },
          });
          if (!div) {
            result.errors.push({ row: rowNum, message: `Division not found: ${row.divisionCode}` });
            continue;
          }
          divisionId = div.id;
        }

        let positionId = row.positionId ? String(row.positionId) : undefined;
        if (!positionId && row.positionCode) {
          const pos = await this.prisma.position.findFirst({
            where: { tenantId, code: String(row.positionCode) },
          });
          if (!pos) {
            result.errors.push({ row: rowNum, message: `Position not found: ${row.positionCode}` });
            continue;
          }
          positionId = pos.id;
        }

        const employmentTypeRaw = row.employmentType ? String(row.employmentType) : undefined;
        const employmentType =
          employmentTypeRaw && Object.values(EmploymentType).includes(employmentTypeRaw as EmploymentType)
            ? (employmentTypeRaw as EmploymentType)
            : EmploymentType.staff;

        const hireRaw = row.hireDate ?? row.hiredAt;
        const hiredAt = hireRaw ? new Date(String(hireRaw)) : undefined;
        const baseSalary =
          row.baseSalary != null && row.baseSalary !== ''
            ? new Prisma.Decimal(Number(row.baseSalary))
            : undefined;

        await this.prisma.employee.create({
          data: {
            tenantId,
            tabNumber,
            firstName,
            lastName,
            middleName: row.middleName ? String(row.middleName) : undefined,
            email: row.email ? String(row.email) : undefined,
            divisionId,
            positionId,
            employmentType,
            hiredAt,
            baseSalary,
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

  async findOne(tenantId: string, id: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        division: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
        region: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        person: true,
        schedule: { include: { shifts: { where: { isActive: true } } } },
        faceProfile: true,
        documents: { orderBy: { documentDate: 'desc' }, take: 50 },
        absences: {
          include: { absenceType: true },
          orderBy: [{ createdAt: 'desc' }, { startDate: 'desc' }],
          take: 200,
        },
        internalTrips: {
          include: { location: { select: { id: true, name: true, code: true } } },
          orderBy: { startDate: 'desc' },
          take: 50,
        },
        requests: { orderBy: { createdAt: 'desc' }, take: 40 },
        relatives: { orderBy: { createdAt: 'desc' }, take: 30 },
        certificates: { orderBy: { createdAt: 'desc' }, take: 50 },
        accessGrants: {
          where: { isActive: true },
          orderBy: { grantedAt: 'desc' },
          take: 100,
        },
        days: { orderBy: { workDate: 'desc' }, take: 400 },
        marks: {
          orderBy: { occurredAt: 'desc' },
          take: 300,
          include: {
            device: {
              select: {
                id: true,
                name: true,
                model: true,
                adapterType: true,
                location: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const [locations, manager, subordinates, bankAccountRows, bankCardRows, personDocs, tenureRows, workplaceRows, awardRows, employeeFileRows, inventoryRows, carRows, markBlockRows] =
      await Promise.all([
      this.prisma.location.findMany({
        where: { tenantId, isActive: true },
        include: {
          locationType: { select: { id: true, code: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.employee.findFirst({
        where: {
          tenantId,
          status: EmploymentStatus.active,
          email: 'manager@demo.local',
          NOT: { id: emp.id },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
        },
      }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          status: EmploymentStatus.active,
          NOT: { id: emp.id },
          accessGrants: {
            some: {
              accessType: 'reports_to',
              resource: emp.id,
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          tabNumber: true,
          firstName: true,
          lastName: true,
          middleName: true,
          status: true,
          position: { select: { name: true } },
          division: { select: { name: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 100,
      }),
      this.loadBankAccounts(tenantId, emp.id),
      this.loadBankCards(tenantId, emp.id),
      this.loadPersonDocuments(tenantId, emp.id, emp.personId),
      this.loadTenures(tenantId, emp.id),
      this.loadWorkplaces(tenantId, emp.id),
      this.loadAwards(tenantId, emp.id),
      this.loadEmployeeFiles(tenantId, emp.id),
      this.loadInventory(tenantId, emp.id),
      this.loadCars(tenantId, emp.id),
      this.loadMarkBlocks(tenantId, emp.id),
    ]);
    const bankAccounts = bankAccountRows.map((r) => this.mapBankAccount(r));
    const bankCards = bankCardRows.map((r) => this.mapBankCard(r));
    const personDocuments = personDocs.map((r) => this.mapPersonDocument(r));

    // Location attachments live in EmployeeAccessGrant (accessType=location).
    // resource = location.id; note = auto|manual (Verifix «Тип прикрепления»).
    const locGrants = emp.accessGrants.filter(
      (g) => g.accessType === 'location' && g.isActive,
    );
    const grantByLocId = new Map(
      locGrants.map((g) => [g.resource.trim().toLowerCase(), g]),
    );
    const attachedLocations = locations
      .filter(
        (l) =>
          grantByLocId.has(l.id.toLowerCase()) ||
          grantByLocId.has(l.code.toLowerCase()) ||
          grantByLocId.has(l.name.toLowerCase()),
      )
      .map((l) => {
        const g =
          grantByLocId.get(l.id.toLowerCase()) ||
          grantByLocId.get(l.code.toLowerCase()) ||
          grantByLocId.get(l.name.toLowerCase());
        const note = (g?.note || 'auto').toLowerCase();
        return {
          ...l,
          attachmentType: note === 'manual' ? 'manual' : 'auto',
          regionName: null as string | null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    const attachedIds = new Set(attachedLocations.map((l) => l.id));
    const availableLocations = locations
      .filter((l) => !attachedIds.has(l.id))
      .map((l) => ({
        ...l,
        attachmentType: null as string | null,
        regionName: null as string | null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    const now = new Date();
    const year = now.getUTCFullYear();
    const vacAbsences = emp.absences.filter((a) => {
      const code = (a.absenceType.code || '').toUpperCase();
      const name = (a.absenceType.name || '').toLowerCase();
      return (
        code.includes('VAC') ||
        code.includes('OTP') ||
        name.includes('татил') ||
        name.includes('отпуск') ||
        name.includes("ta'til")
      );
    });
    const usedDays = vacAbsences
      .filter((a) => a.status === 'approved' || a.status === 'pending')
      .reduce((sum, a) => {
        const start = new Date(a.startDate);
        const end = new Date(a.endDate);
        const ms = Math.max(0, end.getTime() - start.getTime());
        return sum + Math.floor(ms / 86400000) + 1;
      }, 0);
    const limitDays = 24;
    const vacationLimits = [
      {
        period: `${year}`,
        vacationType: 'Ежегодный трудовой отпуск',
        limitDays,
        usedDays,
        remainingDays: Math.max(0, limitDays - usedDays),
      },
    ];

    const plannedAccruals = vacationLimits.map((v) => ({
      id: `vac-${v.period}`,
      absenceType: v.vacationType,
      accrualType: 'Плановый',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      accrued: v.limitDays,
      used: v.usedDays,
      remaining: v.remainingDays,
    }));

    const visitStats = this.buildVisitStats(emp.days, 'last12');

    const hireDoc =
      emp.documents.find((d) => d.type === 'hire') ??
      emp.documents[0] ??
      null;

    const flagSet = new Set(
      emp.accessGrants
        .filter((g) => g.accessType === 'profile_flag' && g.isActive)
        .map((g) => g.resource),
    );
    const profileFlags = {
      excludeFromStats: flagSet.has('exclude_from_stats'),
      systemAccessClosed: flagSet.has('system_access_closed'),
      marksBlocked: flagSet.has('marks_blocked'),
    };

    const jobCtx = {
      positionLabel: [emp.position?.code, emp.division?.name]
        .filter(Boolean)
        .join(' / '),
      divisionName: emp.division?.name ?? null,
      positionName: emp.position?.name ?? null,
      gradeName: emp.grade?.name ?? null,
      scheduleLabel: emp.schedule
        ? `${emp.schedule.startTime}-${emp.schedule.endTime}`
        : null,
      baseSalary: emp.baseSalary,
    };

    const documentHistory = this.buildDocumentHistory(emp, jobCtx, vacationLimits);

    const efficiency = this.buildEfficiency(emp.days, emp.position?.name ?? null, emp.division?.name ?? null);
    const baseSalaryNum = emp.baseSalary != null ? Number(emp.baseSalary) : 0;
    const accruedMonth =
      baseSalaryNum > 0 ? Math.round((baseSalaryNum / 30) * 20 * 100) / 100 : 0;
    const payrollSummary = {
      baseSalary: baseSalaryNum,
      accrued: accruedMonth,
      paid: 0,
      remaining: accruedMonth,
      accruals: baseSalaryNum
        ? [{ name: 'Месячная', amount: accruedMonth }]
        : [],
      deductions: [
        { name: 'Штрафы за нарушение дисциплины', amount: 0 },
      ],
      yearSeries: Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const has = month <= new Date().getUTCMonth() + 1;
        const toPay = has && baseSalaryNum ? accruedMonth * (0.85 + (i % 5) * 0.03) : 0;
        return {
          month,
          toPay: Math.round(toPay * 100) / 100,
          paid: 0,
        };
      }),
    };

    const educationDocs = emp.documents.filter((d) => {
      const p =
        d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
          ? (d.payload as Record<string, unknown>)
          : {};
      return p.kind === 'education' || d.title.toLowerCase().includes('образован');
    });
    const languageDocs = emp.documents.filter((d) => {
      const p =
        d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
          ? (d.payload as Record<string, unknown>)
          : {};
      return p.kind === 'language';
    });
    const education = educationDocs.map((d) => {
      const p =
        d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
          ? (d.payload as Record<string, unknown>)
          : {};
      return {
        id: d.id,
        educationType: String(p.educationType ?? d.title ?? '—'),
        institution: String(p.institution ?? '—'),
        specialty: String(p.specialty ?? '—'),
        startDate: (p.startDate as string) ?? null,
        endDate: (p.endDate as string) ?? null,
      };
    });
    const languages = languageDocs.map((d) => {
      const p =
        d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
          ? (d.payload as Record<string, unknown>)
          : {};
      return {
        id: d.id,
        name: String(p.name ?? d.title ?? '—'),
        level: String(p.level ?? '—'),
      };
    });

    const marks = emp.marks.map((m) => {
      const payload =
        m.rawPayload && typeof m.rawPayload === 'object' && !Array.isArray(m.rawPayload)
          ? (m.rawPayload as Record<string, unknown>)
          : {};
      const markTypeRaw = String(payload.markType ?? '').toLowerCase();
      let markType: 'mark' | 'in' | 'out' | 'break_out' | 'break_in' = 'mark';
      let markTypeLabel = 'Отметка';
      if (markTypeRaw === 'break_out') {
        markType = 'break_out';
        markTypeLabel = 'Перерыв уход';
      } else if (markTypeRaw === 'break_in') {
        markType = 'break_in';
        markTypeLabel = 'Перерыв приход';
      } else if (m.direction === 'IN' || markTypeRaw === 'in') {
        markType = 'in';
        markTypeLabel = 'Приход';
      } else if (m.direction === 'OUT' || markTypeRaw === 'out') {
        markType = 'out';
        markTypeLabel = 'Уход';
      }
      return {
        id: m.id,
        direction: m.direction,
        occurredAt: m.occurredAt,
        source: m.source,
        markType,
        markTypeLabel,
        locationName:
          (payload.locationName as string) ||
          m.device?.location?.name ||
          null,
        deviceType:
          (payload.deviceType as string) ||
          m.device?.model ||
          (m.device?.adapterType === 'hikvision' ? 'Hikvision' : null) ||
          (m.source === 'manual' ? 'Ручной' : m.source),
        identificationType:
          (payload.identificationType as string) ||
          (m.source === 'face' || m.source === 'hikvision'
            ? 'Распознавание лица'
            : m.source === 'qr'
              ? 'QR-код'
              : m.source === 'gps'
                ? 'GPS'
                : m.source === 'manual'
                  ? 'Ручной ввод'
                  : m.source),
        note: (payload.note as string) || null,
        isValid: payload.isValid !== false,
        photoUrl: this.storage.mediaUrl(
          typeof payload.photoKey === 'string' ? payload.photoKey : null,
          typeof payload.photoUrl === 'string' ? payload.photoUrl : null,
        ),
      };
    });

    return {
      ...emp,
      faceProfile: emp.faceProfile
        ? {
            ...emp.faceProfile,
            photoUrl: this.storage.mediaUrl(
              emp.faceProfile.photoKey,
              emp.faceProfile.photoUrl,
            ),
          }
        : emp.faceProfile,
      marks,
      manager,
      subordinates,
      locations,
      attachedLocations,
      availableLocations,
      vacationLimits,
      plannedAccruals,
      visitStats,
      documentHistory,
      efficiency,
      payrollSummary,
      education,
      languages,
      bankAccounts,
      bankCards,
      personDocuments,
      certificates: (emp.certificates ?? []).map((c) => this.mapCertificate(c)),
      tenures: tenureRows.map((t) => this.mapTenure(t)),
      workplaces: workplaceRows.map((w) => this.mapWorkplace(w)),
      awards: awardRows.map((a) => this.mapAward(a)),
      employeeFiles: employeeFileRows.map((f) => this.mapEmployeeFile(f)),
      inventoryItems: inventoryRows.map((i) => this.mapInventory(i)),
      cars: carRows.map((c) => this.mapCar(c)),
      markBlocks: markBlockRows.map((b) => this.mapMarkBlock(b)),
      hireDocumentId: hireDoc?.id ?? null,
      profileFlags,
      profileExtras: this.readProfileExtras(emp),
    };
  }

  private readProfileExtras(emp: {
    email?: string | null;
    baseSalary?: unknown;
    region?: { name: string } | null;
    documents: { type: string; number?: string | null; payload?: unknown }[];
  }) {
    const baseSalaryNum =
      emp.baseSalary != null ? Number(emp.baseSalary) : 0;
    const doc = emp.documents.find(
      (d) =>
        d.type === 'other' &&
        (d.number === 'PROFILE_EXTRAS' ||
          (d.payload &&
            typeof d.payload === 'object' &&
            !Array.isArray(d.payload) &&
            (d.payload as Record<string, unknown>).kind === 'profile_extras')),
    );
    const p =
      doc?.payload && typeof doc.payload === 'object' && !Array.isArray(doc.payload)
        ? (doc.payload as Record<string, unknown>)
        : {};
    return {
      nationality: (p.nationality as string) || 'Узбек',
      paymentType: baseSalaryNum > 0 ? 'Месячная' : null,
      paymentNote:
        baseSalaryNum > 0 ? 'Штрафы за нарушение дисциплины' : null,
      registeredAddress:
        (p.registeredAddress as string) || emp.region?.name || null,
      inps: (p.inps as string) || null,
      inn: (p.inn as string) || null,
      note: (p.note as string) || null,
      phoneExtra: (p.phoneExtra as string) || null,
      emailCorp: (p.emailCorp as string) || emp.email || null,
      street: (p.street as string) || null,
      house: (p.house as string) || null,
      apartment: (p.apartment as string) || null,
      address: (p.address as string) || emp.region?.name || null,
      maritalStatus: (p.maritalStatus as string) || null,
      pin: (p.pin as string) || null,
      pinCode: (p.pinCode as string) || null,
      rfidNumber: (p.rfidNumber as string) || null,
      fingerprints: Array.isArray(p.fingerprints)
        ? (p.fingerprints as unknown[])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9)
        : [],
      altFirstName: (p.altFirstName as string) || null,
      altLastName: (p.altLastName as string) || null,
      altMiddleName: (p.altMiddleName as string) || null,
      citizenship: (p.citizenship as string) || null,
      extraCode: (p.extraCode as string) || null,
      notKeyEmployee: !!p.notKeyEmployee,
      userSettings: this.normalizeUserSettings(p.userSettings),
    };
  }

  private defaultUserSettings(): Record<string, unknown> {
    return {
      login: '',
      roles: ['Сотрудник'],
      systemAccess: true,
      accessAllEmployees: false,
      accessAllOrgEmployees: false,
      fullEfficiencyAccess: false,
      marksEnabled: false,
      marks: {
        autoDetectType: false,
        arrival: true,
        departure: true,
        mark: true,
        breakStart: false,
        breakEnd: false,
        stageGps: false,
        stageFace: false,
        emotionEyes: false,
        emotionSmile: false,
      },
      gpsEnabled: false,
      gps: {
        trackLocation: false,
        autoLeaveByGps: false,
        trackByArrivalDeparture: false,
        quality: 'high',
      },
      photoUploadEnabled: false,
      photoUpload: { allowUpload: false },
      absenceReqEnabled: false,
      absenceReq: { allow: false, changeStateOnConfirm: false },
      scheduleChangeEnabled: false,
      scheduleChange: {
        allow: false,
        allowDayExchange: false,
        changeStateOnConfirm: false,
      },
      markReqEnabled: false,
      markReq: { allow: false },
      dismissReqEnabled: false,
      dismissReq: { allow: false },
      locationReqEnabled: false,
      locationReq: { allow: false },
      overtimeReqEnabled: false,
      overtimeReq: { allow: false },
      vacationReqEnabled: false,
      vacationReq: { allow: false },
      scheduleLimitEnabled: false,
      scheduleLimit: { timeLimit: false, monthlyLimit: false },
      salaryShowEnabled: false,
      salaryShow: { show: true },
      markLimitEnabled: false,
      markLimit: { monthlyLimit: false },
    };
  }

  private normalizeUserSettings(raw: unknown): Record<string, unknown> {
    const base = this.defaultUserSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const src = raw as Record<string, unknown>;
    const mergeObj = (key: string) => {
      const cur = base[key];
      const next = src[key];
      if (
        cur &&
        typeof cur === 'object' &&
        !Array.isArray(cur) &&
        next &&
        typeof next === 'object' &&
        !Array.isArray(next)
      ) {
        return { ...(cur as Record<string, unknown>), ...(next as Record<string, unknown>) };
      }
      return next !== undefined ? next : cur;
    };
    return {
      ...base,
      ...src,
      roles: Array.isArray(src.roles)
        ? (src.roles as unknown[]).map(String).filter(Boolean)
        : base.roles,
      marks: mergeObj('marks'),
      gps: mergeObj('gps'),
      photoUpload: mergeObj('photoUpload'),
      absenceReq: mergeObj('absenceReq'),
      scheduleChange: mergeObj('scheduleChange'),
      markReq: mergeObj('markReq'),
      dismissReq: mergeObj('dismissReq'),
      locationReq: mergeObj('locationReq'),
      overtimeReq: mergeObj('overtimeReq'),
      vacationReq: mergeObj('vacationReq'),
      scheduleLimit: mergeObj('scheduleLimit'),
      salaryShow: mergeObj('salaryShow'),
      markLimit: mergeObj('markLimit'),
    };
  }

  private buildEfficiency(
    days: { workDate: Date; status: string }[],
    positionName: string | null,
    divisionName: string | null,
  ) {
    const scoreOf = (status: string) => {
      if (status === 'on_time') return 100;
      if (status === 'late') return 70;
      if (status === 'leave') return 85;
      if (status === 'absent') return 0;
      return null;
    };

    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const d of days) {
      const s = scoreOf(d.status);
      if (s == null) continue;
      const key = d.workDate.toISOString().slice(0, 7);
      const cur = byMonth.get(key) ?? { sum: 0, n: 0 };
      cur.sum += s;
      cur.n += 1;
      byMonth.set(key, cur);
    }

    const rows = [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([ym, v]) => {
        const fact = v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0;
        const [y, m] = ym.split('-').map(Number);
        return {
          month: ym,
          monthLabel: `${String(m).padStart(2, '0')}.${y}`,
          type: 'Основная',
          positionName: positionName ?? '—',
          divisionName: divisionName ?? '—',
          fact,
          amount: null as number | null,
        };
      });

    const avg =
      rows.length === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.fact, 0) / rows.length) * 10) / 10;

    return {
      average: avg,
      periodMonths: 12,
      rows,
      chart: rows
        .slice()
        .reverse()
        .map((r) => ({
          month: r.monthLabel,
          primary: r.fact,
          secondary: 0,
        })),
    };
  }

  private buildDocumentHistory(
    emp: {
      hiredAt: Date | null;
      documents: {
        id: string;
        type: string;
        title: string;
        number: string | null;
        documentDate: Date;
        payload: unknown;
        status: string;
      }[];
      absences: {
        id: string;
        startDate: Date;
        endDate: Date;
        status: string;
        note: string | null;
        meta: unknown;
        absenceType: { code: string; name: string };
      }[];
      internalTrips: {
        id: string;
        title: string;
        startDate: Date;
        endDate: Date;
        status: string;
        note: string | null;
        meta: unknown;
        location: { name: string } | null;
      }[];
      schedule: { startTime: string; endTime: string; name: string } | null;
    },
    job: {
      positionLabel: string;
      divisionName: string | null;
      positionName: string | null;
      gradeName: string | null;
      scheduleLabel: string | null;
      baseSalary: unknown;
    },
    vacationLimits: {
      period: string;
      vacationType: string;
      limitDays: number;
      usedDays: number;
      remainingDays: number;
    }[],
  ) {
    const metaOf = (raw: unknown) =>
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};

    const dayCount = (start: Date, end: Date) =>
      Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

    const isVac = (code: string, name: string) => {
      const c = code.toUpperCase();
      const n = name.toLowerCase();
      return (
        c.includes('VAC') ||
        c.includes('OTP') ||
        n.includes('отпуск') ||
        n.includes('татил') ||
        n.includes("ta'til")
      );
    };
    const isSick = (code: string, name: string) => {
      const c = code.toUpperCase();
      const n = name.toLowerCase();
      return (
        c.includes('SICK') ||
        c.includes('BOL') ||
        n.includes('больн') ||
        n.includes('kassalik') ||
        n.includes('kasallik')
      );
    };

    const hr = emp.documents.map((d) => {
      const p = metaOf(d.payload);
      return {
        id: d.id,
        startDate: d.documentDate,
        endDate: typeof p.endDate === 'string' ? p.endDate : null,
        positionLabel: job.positionLabel || '—',
        divisionName: job.divisionName,
        positionName: job.positionName,
        gradeName: job.gradeName,
        scheduleLabel: job.scheduleLabel,
        vacationDays: p.vacationDays ?? null,
        salary: p.baseSalary ?? job.baseSalary ?? null,
        documentType:
          d.type === 'hire'
            ? 'Прием на работу'
            : d.type === 'transfer'
              ? 'Приказ о переводе'
              : d.type === 'dismiss'
                ? 'Приказ об увольнении'
                : d.title,
        number: d.number,
        status: d.status,
        viewKind: d.type === 'hire' ? 'hire' : d.id,
      };
    });

    // Synthetic hire row if no hire document
    if (!hr.some((h) => h.documentType === 'Прием на работу') && emp.hiredAt) {
      hr.unshift({
        id: `synthetic-hire-${emp.documents[0]?.id ?? 'x'}`,
        startDate: emp.hiredAt,
        endDate: null,
        positionLabel: job.positionLabel || '—',
        divisionName: job.divisionName,
        positionName: job.positionName,
        gradeName: job.gradeName,
        scheduleLabel: job.scheduleLabel,
        vacationDays: null,
        salary: job.baseSalary ?? null,
        documentType: 'Прием на работу',
        number: null,
        status: 'posted',
        viewKind: 'hire',
      });
    }

    const vacations = emp.absences
      .filter((a) => isVac(a.absenceType.code, a.absenceType.name))
      .map((a) => {
        const m = metaOf(a.meta);
        return {
          id: a.id,
          startDate: a.startDate,
          endDate: a.endDate,
          positionLabel: job.positionLabel || '—',
          divisionName: job.divisionName,
          positionName: job.positionName,
          gradeName: job.gradeName,
          vacationType: a.absenceType.name,
          documentType: (m.documentType as string) ?? 'Приказ на отпуск',
          days: dayCount(a.startDate, a.endDate),
          vacationPay: m.vacationPay ?? null,
          status: a.status,
          note: a.note,
        };
      });

    const trips = emp.internalTrips.map((t) => {
      const m = metaOf(t.meta);
      return {
        id: t.id,
        startDate: t.startDate,
        endDate: t.endDate,
        positionLabel: job.positionLabel || '—',
        divisionName: job.divisionName,
        positionName: job.positionName,
        gradeName: job.gradeName,
        organization:
          (m.organization as string) ?? t.location?.name ?? '—',
        reason: (m.reason as string) ?? t.title,
        fundedBy: (m.fundedBy as string) ?? t.note ?? '—',
        status: t.status,
      };
    });

    const sickLeaves = emp.absences
      .filter((a) => isSick(a.absenceType.code, a.absenceType.name))
      .map((a) => {
        const m = metaOf(a.meta);
        return {
          id: a.id,
          startDate: a.startDate,
          endDate: a.endDate,
          positionLabel: job.positionLabel || '—',
          divisionName: job.divisionName,
          positionName: job.positionName,
          gradeName: job.gradeName,
          number: (m.number as string) ?? null,
          reason: (m.reason as string) ?? a.note ?? '—',
          coefficient: m.coefficient ?? 1,
          status: a.status,
        };
      });

    return {
      hr,
      vacations,
      trips,
      sickLeaves,
      vacationLimits,
    };
  }

  /** Attendance rollup for Verifix «Статистика посещений». */
  private buildVisitStats(
    days: {
      workDate: Date;
      status: string;
      lateMinutes: number;
      earlyLeaveMinutes?: number;
      lastOutAt: Date | null;
    }[],
    period: 'last12' | 'current_year' | 'last_year' = 'last12',
  ) {
    const now = new Date();
    const months: {
      key: string;
      label: string;
      onTime: number;
      late: number;
      earlyLeave: number;
      absent: number;
    }[] = [];

    let start: Date;
    let end: Date;
    let periodLabel = 'Последние 12 месяцев';
    if (period === 'current_year') {
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
      periodLabel = 'Текущий год';
    } else if (period === 'last_year') {
      const y = now.getUTCFullYear() - 1;
      start = new Date(Date.UTC(y, 0, 1));
      end = new Date(Date.UTC(y, 11, 31));
      periodLabel = 'Прошлый год';
    } else {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      periodLabel = 'Последние 12 месяцев';
    }

    const cursor = new Date(start);
    while (cursor <= end) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      months.push({
        key,
        label,
        onTime: 0,
        late: 0,
        earlyLeave: 0,
        absent: 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const day of days) {
      const dt = new Date(day.workDate);
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = byKey.get(key);
      if (!bucket) continue;
      if (day.status === 'on_time') bucket.onTime += 1;
      else if (day.status === 'late') bucket.late += 1;
      else if (day.status === 'absent') bucket.absent += 1;
      else if (day.status === 'leave') bucket.absent += 1;
      if ((day.earlyLeaveMinutes ?? 0) > 0) bucket.earlyLeave += 1;
    }
    const totals = months.reduce(
      (acc, m) => {
        acc.onTime += m.onTime;
        acc.late += m.late;
        acc.earlyLeave += m.earlyLeave;
        acc.absent += m.absent;
        return acc;
      },
      { onTime: 0, late: 0, earlyLeave: 0, absent: 0 },
    );
    const fromLabel = start.toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const toLabel = end.toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return {
      months,
      totals,
      period,
      periodLabel,
      rangeLabel: `${fromLabel} - ${toLabel}`,
    };
  }

  async visitStats(
    tenantId: string,
    employeeId: string,
    period: 'last12' | 'current_year' | 'last_year' = 'last12',
  ) {
    const days = await this.prisma.attendanceDay.findMany({
      where: { tenantId, employeeId },
      orderBy: { workDate: 'desc' },
      take: 800,
      select: {
        workDate: true,
        status: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        lastOutAt: true,
      },
    });
    return this.buildVisitStats(days, period);
  }

  private async upsertProfileExtras(
    tenantId: string,
    employeeId: string,
    patch: Record<string, unknown>,
  ) {
    const existing = await this.prisma.hrDocument.findFirst({
      where: {
        tenantId,
        employeeId,
        type: 'other',
        number: 'PROFILE_EXTRAS',
      },
    });
    const prev =
      existing?.payload &&
      typeof existing.payload === 'object' &&
      !Array.isArray(existing.payload)
        ? { ...(existing.payload as Record<string, unknown>) }
        : { kind: 'profile_extras' };
    const next = { ...prev, kind: 'profile_extras', ...patch };
    if (existing) {
      await this.prisma.hrDocument.update({
        where: { id: existing.id },
        data: { payload: next as Prisma.InputJsonValue },
      });
    } else {
      await this.prisma.hrDocument.create({
        data: {
          tenantId,
          employeeId,
          type: 'other',
          status: 'posted',
          number: 'PROFILE_EXTRAS',
          title: 'Профиль (доп. поля)',
          documentDate: new Date(),
          payload: next as Prisma.InputJsonValue,
          postedAt: new Date(),
        },
      });
    }
    return next;
  }

  private async writeFieldChanges(
    tenantId: string,
    employeeId: string,
    userId: string | null,
    action: string,
    changes: { field: string; event: string; value: string }[],
  ) {
    if (!changes.length) return;
    let userName = 'Система';
    if (userId) {
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
        entity: 'Employee',
        entityId: employeeId,
        meta: {
          userName,
          changes,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async updatePersonal(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeePersonalDto,
    userId?: string | null,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { person: true, documents: { take: 50 } },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    const extras = this.readProfileExtras(emp);
    const changes: { field: string; event: string; value: string }[] = [];
    const push = (field: string, oldVal: string | null | undefined, nextVal: string | null | undefined) => {
      const a = (oldVal ?? '').trim();
      const b = (nextVal ?? '').trim();
      if (a === b) return;
      changes.push({
        field,
        event: a ? 'Изменен' : 'Добавлен',
        value: b || '—',
      });
    };

    if (dto.firstName !== undefined) push('Имя', emp.firstName, dto.firstName);
    if (dto.lastName !== undefined) push('Фамилия', emp.lastName, dto.lastName);
    if (dto.middleName !== undefined) push('Отчество', emp.middleName, dto.middleName);
    if (dto.nationality !== undefined)
      push('Национальность', extras.nationality, dto.nationality);
    if (dto.birthDate !== undefined) {
      const old = emp.person?.birthDate
        ? new Date(emp.person.birthDate).toISOString().slice(0, 10)
        : '';
      push('Дата рождения', old, dto.birthDate || '');
    }
    if (dto.gender !== undefined)
      push('Пол', emp.person?.gender, dto.gender);
    if (dto.pinfl !== undefined) push('ПИНФЛ', emp.person?.pinfl, dto.pinfl);
    if (dto.inps !== undefined) push('ИНПС', extras.inps, dto.inps);
    if (dto.inn !== undefined) push('ИНН', extras.inn, dto.inn);
    if (dto.note !== undefined) push('Примечание', extras.note, dto.note);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        middleName: dto.middleName ?? undefined,
      },
    });

    if (emp.personId) {
      await this.prisma.person.update({
        where: { id: emp.personId },
        data: {
          firstName: dto.firstName ?? undefined,
          lastName: dto.lastName ?? undefined,
          middleName: dto.middleName ?? undefined,
          gender: dto.gender ?? undefined,
          pinfl: dto.pinfl ?? undefined,
          birthDate:
            dto.birthDate !== undefined
              ? dto.birthDate
                ? new Date(dto.birthDate)
                : null
              : undefined,
        },
      });
    }

    await this.upsertProfileExtras(tenantId, employeeId, {
      nationality: dto.nationality ?? extras.nationality,
      inps: dto.inps ?? extras.inps,
      inn: dto.inn ?? extras.inn,
      note: dto.note ?? extras.note,
    });

    await this.writeFieldChanges(
      tenantId,
      employeeId,
      userId ?? null,
      'employee.personal.update',
      changes,
    );
    return this.findOne(tenantId, employeeId);
  }

  async updateContacts(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeContactsDto,
    userId?: string | null,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: {
        person: true,
        region: { select: { id: true, name: true } },
        documents: { take: 50 },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    const extras = this.readProfileExtras(emp);
    const changes: { field: string; event: string; value: string }[] = [];
    const push = (field: string, oldVal: string | null | undefined, nextVal: string | null | undefined) => {
      const a = (oldVal ?? '').trim();
      const b = (nextVal ?? '').trim();
      if (a === b) return;
      changes.push({
        field,
        event: a ? 'Изменен' : 'Добавлен',
        value: b || '—',
      });
    };

    if (dto.phone !== undefined) push('Номер телефона', emp.phone, dto.phone);
    if (dto.phoneExtra !== undefined)
      push('Дополнительный номер телефона', extras.phoneExtra, dto.phoneExtra);
    if (dto.email !== undefined) push('E-mail', emp.email, dto.email);
    if (dto.emailCorp !== undefined)
      push('Корпоративный E-mail', extras.emailCorp, dto.emailCorp);
    if (dto.street !== undefined) push('Улица', extras.street, dto.street);
    if (dto.house !== undefined) push('Дом', extras.house, dto.house);
    if (dto.apartment !== undefined)
      push('Квартира', extras.apartment, dto.apartment);
    if (dto.address !== undefined) push('Адрес', extras.address, dto.address);
    if (dto.registeredAddress !== undefined)
      push('Адрес по прописке', extras.registeredAddress, dto.registeredAddress);

    let regionName = emp.region?.name ?? null;
    if (dto.regionId !== undefined) {
      if (dto.regionId) {
        const region = await this.prisma.dictionaryItem.findFirst({
          where: {
            id: dto.regionId,
            dictionary: { tenantId },
          },
        });
        regionName = region?.name ?? null;
      } else {
        regionName = null;
      }
      push('Регион', emp.region?.name, regionName);
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        regionId:
          dto.regionId !== undefined
            ? dto.regionId || null
            : undefined,
      },
    });

    if (emp.personId) {
      await this.prisma.person.update({
        where: { id: emp.personId },
        data: {
          phone: dto.phone ?? undefined,
          email: dto.email ?? undefined,
        },
      });
    }

    await this.upsertProfileExtras(tenantId, employeeId, {
      phoneExtra: dto.phoneExtra ?? extras.phoneExtra,
      emailCorp: dto.emailCorp ?? extras.emailCorp,
      street: dto.street ?? extras.street,
      house: dto.house ?? extras.house,
      apartment: dto.apartment ?? extras.apartment,
      address: dto.address ?? extras.address,
      registeredAddress: dto.registeredAddress ?? extras.registeredAddress,
    });

    await this.writeFieldChanges(
      tenantId,
      employeeId,
      userId ?? null,
      'employee.contacts.update',
      changes,
    );
    return this.findOne(tenantId, employeeId);
  }

  async changeHistory(
    tenantId: string,
    employeeId: string,
    section: 'personal' | 'contacts',
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const action =
      section === 'personal'
        ? 'employee.personal.update'
        : 'employee.contacts.update';
    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entity: 'Employee',
        entityId: employeeId,
        action,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const rows: {
      field: string;
      event: string;
      occurredAt: string;
      value: string;
      userName: string;
    }[] = [];

    for (const log of logs) {
      const meta =
        log.meta && typeof log.meta === 'object' && !Array.isArray(log.meta)
          ? (log.meta as Record<string, unknown>)
          : {};
      const userName = String(meta.userName || '—');
      const changes = Array.isArray(meta.changes) ? meta.changes : [];
      for (const c of changes) {
        if (!c || typeof c !== 'object') continue;
        const item = c as Record<string, unknown>;
        rows.push({
          field: String(item.field || '—'),
          event: String(item.event || 'Изменен'),
          occurredAt: log.createdAt.toISOString(),
          value: String(item.value ?? '—'),
          userName,
        });
      }
    }

    const createdLog = logs[logs.length - 1];
    const changedLog = logs[0];
    const createdMeta =
      createdLog?.meta &&
      typeof createdLog.meta === 'object' &&
      !Array.isArray(createdLog.meta)
        ? (createdLog.meta as Record<string, unknown>)
        : {};
    const changedMeta =
      changedLog?.meta &&
      typeof changedLog.meta === 'object' &&
      !Array.isArray(changedLog.meta)
        ? (changedLog.meta as Record<string, unknown>)
        : {};

    return {
      section,
      title:
        section === 'personal'
          ? 'История изменений персональных данных'
          : 'История изменений контактов и адресов',
      createdBy: String(createdMeta.userName || '—'),
      createdAt: (createdLog?.createdAt || emp.createdAt).toISOString(),
      changedBy: String(changedMeta.userName || createdMeta.userName || '—'),
      changedAt: (changedLog?.createdAt || emp.updatedAt).toISOString(),
      rows,
    };
  }

  /** Verifix «Прием на работу (просмотр)» — real hire doc or synthetic from employee. */
  async hireDocumentView(tenantId: string, employeeId: string) {
    const emp = await this.findOne(tenantId, employeeId);
    const hire =
      emp.documents.find((d) => d.type === 'hire') ?? emp.documents[0] ?? null;
    const fullName = [emp.lastName, emp.firstName, emp.middleName]
      .filter(Boolean)
      .join(' ');
    const payload =
      hire?.payload && typeof hire.payload === 'object' && !Array.isArray(hire.payload)
        ? (hire.payload as Record<string, unknown>)
        : {};
    const contract =
      payload.contract && typeof payload.contract === 'object'
        ? (payload.contract as Record<string, unknown>)
        : {};
    const vacationFromPayload = Array.isArray(payload.vacationLimit)
      ? (payload.vacationLimit as {
          period: string;
          vacationType: string;
          limitDays: number;
          usedDays: number;
          remainingDays: number;
        }[])
      : null;
    const files = Array.isArray(payload.files) ? payload.files : [];
    return {
      id: hire?.id ?? `hire-${emp.id}`,
      synthetic: !hire,
      type: hire?.type ?? 'hire',
      status: hire?.status ?? 'posted',
      number: hire?.number ?? emp.tabNumber.padStart(10, '0'),
      title: hire?.title ?? 'Прием на работу',
      documentDate: hire?.documentDate ?? emp.hiredAt ?? new Date(),
      createdAt: hire?.createdAt ?? emp.hiredAt ?? emp.createdAt,
      updatedAt: hire?.updatedAt ?? emp.updatedAt,
      postedAt: hire?.postedAt ?? hire?.documentDate ?? emp.hiredAt,
      postedBy: hire?.postedBy ?? null,
      note: hire?.note ?? null,
      payload: hire?.payload ?? null,
      employee: {
        id: emp.id,
        tabNumber: emp.tabNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        middleName: emp.middleName,
        fullName,
        email: emp.email,
        phone: emp.phone,
        hiredAt: emp.hiredAt,
        employmentType: emp.employmentType,
        baseSalary: emp.baseSalary,
        division: emp.division,
        position: emp.position,
        grade: emp.grade,
        schedule: emp.schedule,
        region: emp.region,
      },
      tabs: {
        main: {
          hireDate: emp.hiredAt,
          probation:
            payload.probation != null ? String(payload.probation) : null,
          schedule: emp.schedule,
          division: emp.division,
          position: emp.position,
          grade: emp.grade,
          employmentKind: String(
            payload.employmentKind || 'Основное место работы',
          ),
          source:
            payload.source != null
              ? String(payload.source)
              : emp.employmentSource ?? null,
          documentName: hire?.title ?? null,
          staffPositionLabel: [emp.position?.code, emp.division?.name]
            .filter(Boolean)
            .join(' / '),
        },
        payroll: {
          baseSalary:
            payload.baseSalary != null
              ? payload.baseSalary
              : emp.baseSalary,
          paymentType:
            payload.paymentType != null
              ? String(payload.paymentType)
              : emp.profileExtras?.paymentType ?? null,
        },
        vacationLimit:
          vacationFromPayload && vacationFromPayload.length
            ? vacationFromPayload
            : emp.vacationLimits,
        contract: {
          number:
            contract.number != null
              ? String(contract.number)
              : hire?.number ?? null,
          date:
            contract.date != null
              ? String(contract.date)
              : hire?.documentDate ?? emp.hiredAt,
          startDate:
            contract.startDate != null ? String(contract.startDate) : null,
          endDate: contract.endDate != null ? String(contract.endDate) : null,
        },
        files,
      },
    };
  }

  create(tenantId: string, dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        tenantId,
        tabNumber: dto.tabNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        email: dto.email,
        phone: dto.phone,
        divisionId: dto.divisionId,
        positionId: dto.positionId,
        personId: dto.personId,
        employmentType: dto.employmentType ?? EmploymentType.staff,
        hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : undefined,
        externalId: dto.externalId,
        scheduleId: dto.scheduleId,
        regionId: dto.regionId,
        gradeId: dto.gradeId,
      },
      include: {
        division: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
        region: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    await this.findOne(tenantId, id);
    const { dismissedAt, ...rest } = dto;
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        dismissedAt: dismissedAt
          ? new Date(dismissedAt)
          : dto.status === EmploymentStatus.dismissed
            ? new Date()
            : undefined,
      },
      include: {
        division: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
        region: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        person: true,
      },
    });
  }

  private async setProfileFlag(
    tenantId: string,
    employeeId: string,
    resource: string,
    enabled: boolean,
  ) {
    const existing = await this.prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId,
        employeeId,
        accessType: 'profile_flag',
        resource,
      },
    });
    if (existing) {
      await this.prisma.employeeAccessGrant.update({
        where: { id: existing.id },
        data: { isActive: enabled, note: enabled ? 'enabled' : 'disabled' },
      });
    } else if (enabled) {
      await this.prisma.employeeAccessGrant.create({
        data: {
          tenantId,
          employeeId,
          accessType: 'profile_flag',
          resource,
          isActive: true,
          note: 'enabled',
        },
      });
    }
  }

  async updateProfileFlags(
    tenantId: string,
    employeeId: string,
    flags: {
      excludeFromStats?: boolean;
      systemAccessClosed?: boolean;
      marksBlocked?: boolean;
    },
  ) {
    await this.prisma.employee.findFirstOrThrow({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });
    if (flags.excludeFromStats !== undefined) {
      await this.setProfileFlag(
        tenantId,
        employeeId,
        'exclude_from_stats',
        flags.excludeFromStats,
      );
    }
    if (flags.systemAccessClosed !== undefined) {
      await this.setProfileFlag(
        tenantId,
        employeeId,
        'system_access_closed',
        flags.systemAccessClosed,
      );
    }
    if (flags.marksBlocked !== undefined) {
      await this.setProfileFlag(
        tenantId,
        employeeId,
        'marks_blocked',
        flags.marksBlocked,
      );
    }
    return this.findOne(tenantId, employeeId);
  }

  async updateEmployeeLocations(
    tenantId: string,
    employeeId: string,
    dto: {
      attach?: { locationId: string; attachmentType?: 'auto' | 'manual' }[];
      detach?: string[];
    },
  ) {
    await this.prisma.employee.findFirstOrThrow({
      where: { id: employeeId, tenantId },
      select: { id: true },
    });

    for (const id of dto.detach ?? []) {
      await this.prisma.employeeAccessGrant.updateMany({
        where: {
          tenantId,
          employeeId,
          accessType: 'location',
          resource: id,
        },
        data: { isActive: false, note: 'detached' },
      });
    }

    for (const item of dto.attach ?? []) {
      const loc = await this.prisma.location.findFirst({
        where: { id: item.locationId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!loc) continue;
      const attachmentType = item.attachmentType === 'manual' ? 'manual' : 'auto';
      const existing = await this.prisma.employeeAccessGrant.findFirst({
        where: {
          tenantId,
          employeeId,
          accessType: 'location',
          resource: loc.id,
        },
      });
      if (existing) {
        await this.prisma.employeeAccessGrant.update({
          where: { id: existing.id },
          data: { isActive: true, note: attachmentType },
        });
      } else {
        await this.prisma.employeeAccessGrant.create({
          data: {
            tenantId,
            employeeId,
            accessType: 'location',
            resource: loc.id,
            isActive: true,
            note: attachmentType,
          },
        });
      }
    }

    return this.findOne(tenantId, employeeId);
  }

  async getEmployeeReportSettings(tenantId: string, kind: string) {
    const normalized = normalizeReportKind(kind);
    const settings = await this.ensureTenantSetting(tenantId);
    const extras =
      settings.extras && typeof settings.extras === 'object' && !Array.isArray(settings.extras)
        ? (settings.extras as Record<string, unknown>)
        : {};
    const all =
      extras.employeeReportSettings &&
      typeof extras.employeeReportSettings === 'object' &&
      !Array.isArray(extras.employeeReportSettings)
        ? (extras.employeeReportSettings as Record<string, unknown>)
        : {};
    const saved =
      all[normalized] && typeof all[normalized] === 'object' && !Array.isArray(all[normalized])
        ? (all[normalized] as Record<string, unknown>)
        : {};
    return {
      kind: normalized,
      settings: { ...defaultReportSettings(normalized), ...saved },
    };
  }

  async saveEmployeeReportSettings(
    tenantId: string,
    kind: string,
    body: Record<string, unknown>,
  ) {
    const normalized = normalizeReportKind(kind);
    const settings = await this.ensureTenantSetting(tenantId);
    const extras =
      settings.extras && typeof settings.extras === 'object' && !Array.isArray(settings.extras)
        ? { ...(settings.extras as Record<string, unknown>) }
        : {};
    const all =
      extras.employeeReportSettings &&
      typeof extras.employeeReportSettings === 'object' &&
      !Array.isArray(extras.employeeReportSettings)
        ? { ...(extras.employeeReportSettings as Record<string, unknown>) }
        : {};
    if (body.__reset === true) {
      all[normalized] = defaultReportSettings(normalized);
    } else {
      const prev =
        all[normalized] && typeof all[normalized] === 'object' && !Array.isArray(all[normalized])
          ? (all[normalized] as Record<string, unknown>)
          : {};
      const { __reset: _r, ...rest } = body;
      all[normalized] = {
        ...defaultReportSettings(normalized),
        ...prev,
        ...rest,
      };
    }
    extras.employeeReportSettings = all;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    return { kind: normalized, settings: all[normalized] };
  }

  private async ensureTenantSetting(tenantId: string) {
    let settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    if (!settings) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      settings = await this.prisma.tenantSetting.create({
        data: {
          tenantId,
          orgName: tenant?.name ?? 'Org',
          legalName: tenant?.name ?? 'Org',
        },
      });
    }
    return settings;
  }

  async employeeReport(
    tenantId: string,
    employeeId: string,
    kind: string,
    range?: { from?: string; to?: string },
  ) {
    const normalized = normalizeReportKind(kind);
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: {
        division: { select: { name: true, code: true } },
        position: { select: { name: true, code: true } },
        grade: { select: { name: true } },
        region: { select: { name: true } },
        schedule: true,
        days: { orderBy: { workDate: 'desc' }, take: 400 },
        marks: { orderBy: { occurredAt: 'desc' }, take: 300 },
        absences: {
          include: { absenceType: true },
          orderBy: { startDate: 'desc' },
          take: 80,
        },
        payrollLines: {
          include: { period: { select: { year: true, month: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const { settings } = await this.getEmployeeReportSettings(tenantId, normalized);

    const from =
      range?.from
        ? new Date(range.from)
        : new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          );
    const to = range?.to
      ? new Date(range.to)
      : new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0),
        );
    const inRange = (d: Date) => {
      const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
      const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
      return t >= a && t <= b;
    };

    const days = emp.days.filter((d) => inRange(new Date(d.workDate)));
    const marks = emp.marks.filter((m) => inRange(new Date(m.occurredAt)));
    const absences = emp.absences.filter(
      (a) => inRange(new Date(a.startDate)) || inRange(new Date(a.endDate)),
    );

    const manager = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        status: EmploymentStatus.active,
        email: 'manager@demo.local',
        NOT: { id: emp.id },
      },
      select: { firstName: true, lastName: true, middleName: true },
    });

    const fullName = [emp.lastName, emp.firstName, emp.middleName]
      .filter(Boolean)
      .join(' ');
    const managerName = manager
      ? [manager.lastName, manager.firstName, manager.middleName].filter(Boolean).join(' ')
      : null;

    const hoursOf = (d: { firstInAt: Date | null; lastOutAt: Date | null }) => {
      if (!d.firstInAt || !d.lastOutAt) return 0;
      const h = (d.lastOutAt.getTime() - d.firstInAt.getTime()) / 3600000;
      return settings.roundHours ? Math.round(h * 10) / 10 : Math.round(h * 100) / 100;
    };

    const base = {
      kind: normalized,
      generatedAt: new Date().toISOString(),
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      settings,
      employee: {
        id: emp.id,
        tabNumber: emp.tabNumber,
        fullName,
        email: emp.email,
        division: emp.division?.name ?? null,
        divisionCode: emp.division?.code ?? null,
        position: emp.position?.name ?? null,
        grade: emp.grade?.name ?? null,
        region: emp.region?.name ?? null,
        hiredAt: emp.hiredAt,
        schedule: emp.schedule
          ? `${emp.schedule.name} (${emp.schedule.startTime}-${emp.schedule.endTime})`
          : null,
        scheduleStart: emp.schedule?.startTime ?? '09:00',
        scheduleEnd: emp.schedule?.endTime ?? '18:00',
        manager: managerName,
        baseSalary: emp.baseSalary != null ? Number(emp.baseSalary) : null,
        location: null as string | null,
        branch: emp.division?.name ?? null,
      },
      columns: this.reportColumns(normalized, settings),
    };

    if (normalized === 'attendance') {
      const planStart = emp.schedule?.startTime ?? '09:00';
      const planEnd = emp.schedule?.endTime ?? '18:00';
      const planNorm = this.planNormHours(planStart, planEnd, settings.roundHours);
      const weekPattern = this.weekPatternOf(emp.schedule?.settings);
      const dayByKey = new Map(
        days.map((d) => [new Date(d.workDate).toISOString().slice(0, 10), d]),
      );

      const round2 = (h: number) => Math.round(h * 100) / 100;

      const periodDates = this.eachUtcDate(from, to);
      const rows = periodDates.map((date) => {
        const key = date.toISOString().slice(0, 10);
        const d = dayByKey.get(key);
        const dow = date.getUTCDay();
        const weekend = this.isWeekendDow(dow, weekPattern);
        const absenceCover = absences.find((a) => {
          const s = new Date(a.startDate).toISOString().slice(0, 10);
          const e = new Date(a.endDate).toISOString().slice(0, 10);
          return key >= s && key <= e;
        });
        const status =
          d?.status ??
          (weekend ? 'day_off' : absenceCover ? 'leave' : 'not_started');
        const isDayOff = status === 'day_off' || weekend;
        const isLeave = status === 'leave' || (!!absenceCover && !weekend);
        const absenceReasonLabel =
          isLeave && absenceCover ? absenceCover.absenceType.name : null;

        // Verifix Excel template fields
        let factIn: string | Date | null = d?.firstInAt ?? null;
        let factOut: string | Date | null = d?.lastOutAt ?? null;
        let hoursWorked: number | null = null;
        let onTime: number | null = null;
        let absenceWithReasonHrs = 0;
        let absenceWithoutReason = 0;
        let total: number | null = null;
        let isNoShow = false;
        let isIncomplete = false;

        if (isDayOff) {
          // weekend — only «Выходной день» in plan
        } else if (isLeave) {
          absenceWithReasonHrs = planNorm;
          total = planNorm;
        } else if (!d?.firstInAt) {
          isNoShow = true;
          factIn = null;
          factOut = null;
          absenceWithoutReason = planNorm;
        } else {
          const inAt = new Date(d.firstInAt);
          const outAt = d.lastOutAt ? new Date(d.lastOutAt) : null;
          const samePunch =
            outAt != null && Math.abs(outAt.getTime() - inAt.getTime()) < 60_000;

          if (!outAt || samePunch) {
            // Нет ухода / одинаковые приход-уход → xx:xx, без причины = норма
            isIncomplete = true;
            factIn = inAt;
            factOut = null;
            absenceWithoutReason = planNorm;
          } else {
            const rawH = (outAt.getTime() - inAt.getTime()) / 3600000;
            hoursWorked = round2(Math.max(0, rawH));
            const credited = this.creditedOnTimeHours(
              inAt,
              outAt,
              planStart,
              planEnd,
            );
            onTime = round2(Math.min(planNorm, Math.max(0, credited)));
            absenceWithoutReason = round2(Math.max(0, planNorm - onTime));
            total = onTime;
            factIn = inAt;
            factOut = outAt;
          }
        }

        return {
          date: key,
          day: this.dowRu(dow),
          status,
          isWeekend: isDayOff,
          isLeave,
          isNoShow,
          isIncomplete,
          dayOffLabel: isDayOff ? 'Выходной день' : null,
          planIn: isDayOff ? null : planStart,
          planOut: isDayOff ? null : planEnd,
          planNorm: isDayOff ? 0 : planNorm,
          factIn,
          factOut,
          hoursWorked:
            settings.hideWorkedHours || !settings.showHoursWorked
              ? null
              : hoursWorked,
          absenceReason: absenceReasonLabel,
          onTimeHours: onTime,
          absenceWithReason: absenceWithReasonHrs,
          absenceWithoutReason,
          lateMinutes: d?.lateMinutes ?? 0,
          earlyLeaveMinutes: d?.earlyLeaveMinutes ?? 0,
          overtimeHours:
            hoursWorked != null && hoursWorked > planNorm
              ? round2(hoursWorked - planNorm)
              : 0,
          workCoeff:
            onTime != null && planNorm > 0
              ? round2(onTime / planNorm)
              : null,
          fineLateMinutes: settings.fineLate ? d?.lateMinutes ?? 0 : null,
          fineEarlyMinutes: settings.fineEarly
            ? d?.earlyLeaveMinutes ?? 0
            : null,
          fineAbsentHours:
            settings.fineAbsent && (isNoShow || status === 'absent')
              ? planNorm
              : settings.fineAbsent
                ? 0
                : null,
          workedWithPenalties:
            settings.fineWorkedWithPenalties && onTime != null
              ? round2(
                  Math.max(
                    0,
                    onTime -
                      (d?.lateMinutes ?? 0) / 60 -
                      (d?.earlyLeaveMinutes ?? 0) / 60,
                  ),
                )
              : null,
          total,
        };
      });

      const lateDays = days.filter((d) => d.status === 'late' || d.lateMinutes > 0);
      const earlyDays = days.filter((d) => d.earlyLeaveMinutes > 0);
      const workedRows = rows.filter((r) => Number(r.hoursWorked) > 0);
      const sum = (key: string) =>
        rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[key] || 0), 0);

      const totals = {
        planNorm: sum('planNorm'),
        hoursWorked: round2(sum('hoursWorked')),
        onTimeHours: round2(sum('onTimeHours')),
        absenceWithReason: round2(sum('absenceWithReason')),
        absenceWithoutReason: round2(sum('absenceWithoutReason')),
        total: round2(sum('total')),
        lateMinutes: sum('lateMinutes'),
        earlyLeaveMinutes: sum('earlyLeaveMinutes'),
        overtimeHours: round2(sum('overtimeHours')),
        fineLateMinutes: settings.fineLate ? sum('fineLateMinutes') : 0,
        fineEarlyMinutes: settings.fineEarly ? sum('fineEarlyMinutes') : 0,
        fineAbsentHours: settings.fineAbsent ? sum('fineAbsentHours') : 0,
      };

      return {
        ...base,
        title: 'Отчет по посещениям сотрудников',
        summary: {
          onTime: days.filter((d) => d.status === 'on_time').length,
          late: lateDays.length,
          absent: days.filter((d) => d.status === 'absent').length,
          leave: days.filter((d) => d.status === 'leave').length,
          dayOff: rows.filter((r) => r.isWeekend).length,
          earlyLeave: earlyDays.length,
          hoursWorked: totals.hoursWorked,
          daysWorked: workedRows.length,
          lateMinutes: lateDays.reduce((s, d) => s + d.lateMinutes, 0),
          earlyMinutes: earlyDays.reduce((s, d) => s + d.earlyLeaveMinutes, 0),
          plannedDays: rows.filter((r) => !r.isWeekend && !r.isLeave).length,
        },
        totals,
        rows,
        marksSample: settings.showMarkDetails
          ? marks.slice(0, 80).map((m) => ({
              occurredAt: m.occurredAt,
              direction: m.direction,
              source: m.source,
            }))
          : [],
      };
    }

    if (normalized === 'discipline') {
      const lateDays = days.filter((d) => d.status === 'late' || d.lateMinutes > 0);
      const absentDays = days.filter((d) => d.status === 'absent');
      const onTimeDays = days.filter((d) => d.status === 'on_time');
      const earlyDays = days.filter((d) => d.earlyLeaveMinutes > 0);
      const dayOffDays = days.filter((d) => d.status === 'day_off');
      const avg = (list: { lateMinutes?: number; earlyLeaveMinutes?: number }[], key: 'lateMinutes' | 'earlyLeaveMinutes') =>
        list.length
          ? Math.round(list.reduce((s, d) => s + (d[key] ?? 0), 0) / list.length)
          : 0;
      const maxOf = (list: { lateMinutes?: number; earlyLeaveMinutes?: number }[], key: 'lateMinutes' | 'earlyLeaveMinutes') =>
        list.reduce((m, d) => Math.max(m, d[key] ?? 0), 0);

      const disciplineRow = {
        employeeId: emp.id,
        tabNumber: emp.tabNumber,
        fullName,
        division: emp.division?.name ?? '',
        position: emp.position?.name ?? '',
        grade: emp.grade?.name ?? '',
        lateCount: lateDays.length,
        lateAvgMinutes: avg(lateDays, 'lateMinutes'),
        lateMaxMinutes: maxOf(lateDays, 'lateMinutes'),
        absentCount: absentDays.length,
        onTimeCount: onTimeDays.length,
        earlyCount: earlyDays.length,
        earlyAvgMinutes: avg(earlyDays, 'earlyLeaveMinutes'),
        earlyMaxMinutes: maxOf(earlyDays, 'earlyLeaveMinutes'),
        dayOffCount: dayOffDays.length,
      };

      return {
        ...base,
        title: 'Отчет по дисциплине посещений',
        summary: {
          lateDays: lateDays.length,
          totalLateMinutes: lateDays.reduce((s, d) => s + d.lateMinutes, 0),
          earlyDays: earlyDays.length,
          totalEarlyMinutes: earlyDays.reduce((s, d) => s + d.earlyLeaveMinutes, 0),
          absentDays: absentDays.length,
          onTimeDays: onTimeDays.length,
          dayOffDays: dayOffDays.length,
          absences: absences.length,
          fineLateMinutes: settings.fineLate
            ? lateDays.reduce((s, d) => s + d.lateMinutes, 0)
            : 0,
          fineEarlyMinutes: settings.fineEarly
            ? earlyDays.reduce((s, d) => s + d.earlyLeaveMinutes, 0)
            : 0,
          fineAbsentDays: settings.fineAbsent ? absentDays.length : 0,
        },
        rows: [disciplineRow],
        details: {
          late: lateDays.map((d) => ({
            date: d.workDate,
            minutes: d.lateMinutes,
            firstIn: d.firstInAt,
          })),
          early: earlyDays.map((d) => ({
            date: d.workDate,
            minutes: d.earlyLeaveMinutes,
            firstIn: d.firstInAt,
          })),
          absent: absentDays.map((d) => ({
            date: d.workDate,
            status: d.status,
          })),
        },
      };
    }

    if (normalized === 'bonus') {
      const bonusLines = emp.payrollLines.filter(
        (l) =>
          l.type === 'bonus' ||
          l.type === 'one_time' ||
          (l.description || '').toLowerCase().includes('прем'),
      );
      const rows =
        bonusLines.length > 0
          ? bonusLines.map((l) => ({
              period: `${String(l.period.month).padStart(2, '0')}.${l.period.year}`,
              type: l.type,
              description: l.description || 'Премия',
              amount: Number(l.amount),
              status: l.status,
            }))
          : emp.baseSalary != null
            ? [
                {
                  period: new Date().toISOString().slice(0, 7),
                  type: 'bonus',
                  description: 'Месячная (расчетная база)',
                  amount: Math.round(Number(emp.baseSalary) * 0.1 * 100) / 100,
                  status: 'draft',
                },
              ]
            : [];
      return {
        ...base,
        title: 'Отчет по видам премии',
        summary: {
          count: rows.length,
          total: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
        },
        rows,
      };
    }

    if (normalized === 'accrual') {
      const salary = emp.baseSalary != null ? Number(emp.baseSalary) : 0;
      const monthRows = Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - i);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const accrued = salary > 0 ? Math.round((salary / 30) * 20 * 100) / 100 : 0;
        return {
          period: ym,
          accrualType: 'Месячная',
          accrued,
          deducted: 0,
          toPay: accrued,
          paid: 0,
        };
      });
      return {
        ...base,
        title: 'Книга начисления',
        summary: {
          baseSalary: salary,
          rows: monthRows.length,
        },
        rows: [
          ...monthRows,
          ...absences.map((a) => {
            const start = new Date(a.startDate);
            const end = new Date(a.endDate);
            const daysCount =
              Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
            return {
              period: a.startDate,
              accrualType: a.absenceType.name,
              accrued: a.absenceType.paid ? daysCount : 0,
              deducted: a.absenceType.paid ? 0 : daysCount,
              toPay: 0,
              paid: 0,
              status: a.status,
              days: daysCount,
            };
          }),
        ],
      };
    }

    throw new BadRequestException(
      `Unknown report kind "${kind}". Use attendance|discipline|bonus|accrual`,
    );
  }

  private reportColumns(
    kind: string,
    settings: ReturnType<typeof defaultReportSettings>,
  ) {
    if (kind === 'attendance') {
      return [
        'date',
        'day',
        'planIn',
        'planOut',
        'planNorm',
        'factIn',
        'factOut',
        'hoursWorked',
        'absenceReason',
        'onTimeHours',
        'absenceWithReason',
        'absenceWithoutReason',
        'total',
      ];
    }
    if (kind === 'discipline') {
      return [
        'tabNumber',
        'fullName',
        'division',
        'position',
        'grade',
        'lateCount',
        'lateAvgMinutes',
        'lateMaxMinutes',
        'absentCount',
        'onTimeCount',
        'earlyCount',
        'earlyAvgMinutes',
        'earlyMaxMinutes',
        'dayOffCount',
      ];
    }
    if (kind === 'bonus') {
      return ['period', 'type', 'description', 'amount', 'status'];
    }
    return ['period', 'accrualType', 'accrued', 'deducted', 'toPay', 'paid'];
  }

  private eachUtcDate(from: Date, to: Date) {
    const out: Date[] = [];
    const cur = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
    );
    while (cur <= end) {
      out.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }

  private weekPatternOf(settings: unknown): '5/2' | '5/1' | '6/1' {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      const p = (settings as Record<string, unknown>).weekPattern;
      if (p === '5/1' || p === '6/1' || p === '5/2') return p;
    }
    return '6/1';
  }

  private isWeekendDow(dow: number, pattern: '5/2' | '5/1' | '6/1') {
    if (pattern === '6/1') return dow === 0;
    return dow === 0 || dow === 6;
  }

  private dowRu(dow: number) {
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dow] ?? '';
  }

  private planNormHours(start: string, end: string, round: boolean) {
    const parse = (hm: string) => {
      const [h, m] = hm.split(':').map((x) => Number(x) || 0);
      return h * 60 + m;
    };
    let mins = parse(end) - parse(start);
    if (mins <= 0) mins += 24 * 60;
    if (mins >= 8 * 60) mins -= 60;
    const h = mins / 60;
    return round ? Math.round(h * 10) / 10 : Math.round(h * 100) / 100;
  }

  /** Verifix «Вовремя»: окно [max(in,planStart), min(out,planEnd)] минус обед 13–14. */
  private creditedOnTimeHours(
    firstIn: Date,
    lastOut: Date,
    planStart: string,
    planEnd: string,
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
    const lunchS = parse('13:00');
    const lunchE = parse('14:00');
    const overlapMs = Math.max(
      0,
      Math.min(winEnd.getTime(), lunchE.getTime()) -
        Math.max(winStart.getTime(), lunchS.getTime()),
    );
    mins -= overlapMs / 60000;
    return Math.max(0, mins / 60);
  }

  private async requireEmployee(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, personId: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  private async loadBankAccounts(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenant_id: string;
          employee_id: string;
          bank_name: string;
          name: string;
          account_number: string;
          mfo: string;
          card_number: string | null;
          is_primary: boolean;
          is_active: boolean;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT * FROM employee_bank_accounts WHERE tenant_id = $1::uuid AND employee_id = $2::uuid ORDER BY is_primary DESC, created_at DESC LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  private mapBankAccount(r: {
    id: string;
    bank_name: string;
    name: string;
    account_number: string;
    mfo: string;
    card_number: string | null;
    is_primary: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      bankName: r.bank_name,
      name: r.name,
      accountNumber: r.account_number,
      mfo: r.mfo,
      cardNumber: r.card_number,
      isPrimary: r.is_primary,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadBankCards(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          account_id: string | null;
          card_number: string;
          account_number: string;
          bank_code: string;
          expires_at: Date | null;
          state: string;
          status: string;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT * FROM employee_bank_cards WHERE tenant_id = $1::uuid AND employee_id = $2::uuid ORDER BY created_at DESC LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  private mapBankCard(r: {
    id: string;
    account_id: string | null;
    card_number: string;
    account_number: string;
    bank_code: string;
    expires_at: Date | null;
    state: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      accountId: r.account_id,
      cardNumber: r.card_number,
      accountNumber: r.account_number,
      bankCode: r.bank_code,
      expiresAt: r.expires_at,
      state: r.state,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async listBankAccounts(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadBankAccounts(tenantId, employeeId);
    return rows.map((r) => this.mapBankAccount(r));
  }

  async createBankAccount(tenantId: string, employeeId: string, dto: CreateEmployeeBankAccountDto) {
    await this.requireEmployee(tenantId, employeeId);
    const accountNumber = String(dto.accountNumber || '').trim();
    if (!accountNumber) throw new BadRequestException('Укажите расчетный счет');
    const isPrimary = !!dto.isPrimary;
    if (isPrimary) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE employee_bank_accounts SET is_primary = false WHERE tenant_id = $1::uuid AND employee_id = $2::uuid AND is_primary = true`,
        tenantId,
        employeeId,
      );
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO employee_bank_accounts (id, tenant_id, employee_id, bank_name, name, account_number, mfo, card_number, is_primary, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, true, now(), now())
       RETURNING *`,
      tenantId,
      employeeId,
      String(dto.bankName || '').trim(),
      String(dto.name || '').trim(),
      accountNumber,
      String(dto.mfo || '').trim(),
      dto.cardNumber?.trim() || null,
      isPrimary,
    );
    return this.mapBankAccount(rows[0] as any);
  }

  async updateBankAccount(
    tenantId: string,
    employeeId: string,
    accountId: string,
    dto: UpdateEmployeeBankAccountDto,
  ) {
    const existing = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM employee_bank_accounts WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      accountId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Расчетный счет не найден');
    if (dto.isPrimary === true) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE employee_bank_accounts SET is_primary = false WHERE tenant_id = $1::uuid AND employee_id = $2::uuid AND is_primary = true AND id <> $3::uuid`,
        tenantId,
        employeeId,
        accountId,
      );
    }
    const cur = existing[0] as any;
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE employee_bank_accounts SET
         bank_name = $4,
         name = $5,
         account_number = $6,
         mfo = $7,
         card_number = $8,
         is_primary = $9,
         is_active = $10,
         updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING *`,
      accountId,
      tenantId,
      employeeId,
      dto.bankName !== undefined ? String(dto.bankName).trim() : cur.bank_name,
      dto.name !== undefined ? String(dto.name).trim() : cur.name,
      dto.accountNumber !== undefined ? String(dto.accountNumber).trim() : cur.account_number,
      dto.mfo !== undefined ? String(dto.mfo).trim() : cur.mfo,
      dto.cardNumber !== undefined ? dto.cardNumber.trim() || null : cur.card_number,
      dto.isPrimary !== undefined ? dto.isPrimary : cur.is_primary,
      dto.isActive !== undefined ? dto.isActive : cur.is_active,
    );
    return this.mapBankAccount(rows[0] as any);
  }

  async deleteBankAccount(tenantId: string, employeeId: string, accountId: string) {
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_bank_accounts WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      accountId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Расчетный счет не найден');
    return { ok: true };
  }

  async listBankCards(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadBankCards(tenantId, employeeId);
    return rows.map((r) => this.mapBankCard(r));
  }

  async createBankCard(tenantId: string, employeeId: string, dto: CreateEmployeeBankCardDto) {
    await this.requireEmployee(tenantId, employeeId);
    const cardNumber = String(dto.cardNumber || '').trim();
    if (!cardNumber) throw new BadRequestException('Укажите номер карты');
    let accountNumber = String(dto.accountNumber || '').trim();
    let bankCode = String(dto.bankCode || '').trim();
    let accountId: string | null = dto.accountId?.trim() || null;
    if (accountId) {
      const acc = await this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM employee_bank_accounts WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
        accountId,
        tenantId,
        employeeId,
      );
      if (!acc[0]) throw new BadRequestException('Расчетный счет не найден');
      if (!accountNumber) accountNumber = acc[0].account_number;
      if (!bankCode) bankCode = acc[0].mfo;
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO employee_bank_cards (id, tenant_id, employee_id, account_id, card_number, account_number, bank_code, expires_at, state, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::date, $8, $9, now(), now())
       RETURNING *`,
      tenantId,
      employeeId,
      accountId,
      cardNumber,
      accountNumber,
      bankCode,
      dto.expiresAt ? dto.expiresAt.slice(0, 10) : null,
      String(dto.state || 'active').trim() || 'active',
      String(dto.status || 'active').trim() || 'active',
    );
    return this.mapBankCard(rows[0] as any);
  }

  async updateBankCard(
    tenantId: string,
    employeeId: string,
    cardId: string,
    dto: UpdateEmployeeBankCardDto,
  ) {
    const existing = await this.prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM employee_bank_cards WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      cardId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Банковская карта не найдена');
    const cur = existing[0];
    let accountId = dto.accountId !== undefined ? dto.accountId?.trim() || null : cur.account_id;
    let accountNumber = dto.accountNumber !== undefined ? String(dto.accountNumber).trim() : cur.account_number;
    let bankCode = dto.bankCode !== undefined ? String(dto.bankCode).trim() : cur.bank_code;
    if (dto.accountId) {
      const acc = await this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM employee_bank_accounts WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
        accountId,
        tenantId,
        employeeId,
      );
      if (!acc[0]) throw new BadRequestException('Расчетный счет не найден');
      if (!accountNumber) accountNumber = acc[0].account_number;
      if (!bankCode) bankCode = acc[0].mfo;
    }
    const expires =
      dto.expiresAt === undefined
        ? cur.expires_at
          ? String(cur.expires_at).slice(0, 10)
          : null
        : dto.expiresAt
          ? dto.expiresAt.slice(0, 10)
          : null;
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE employee_bank_cards SET
         card_number = $4,
         account_id = $5::uuid,
         account_number = $6,
         bank_code = $7,
         expires_at = $8::date,
         state = $9,
         status = $10,
         updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING *`,
      cardId,
      tenantId,
      employeeId,
      dto.cardNumber !== undefined ? String(dto.cardNumber).trim() : cur.card_number,
      accountId,
      accountNumber,
      bankCode,
      expires,
      dto.state !== undefined ? String(dto.state).trim() : cur.state,
      dto.status !== undefined ? String(dto.status).trim() : cur.status,
    );
    return this.mapBankCard(rows[0] as any);
  }

  async deleteBankCard(tenantId: string, employeeId: string, cardId: string) {
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_bank_cards WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      cardId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Банковская карта не найдена');
    return { ok: true };
  }

  private async loadPersonDocuments(
    tenantId: string,
    employeeId: string,
    personId: string | null | undefined,
  ) {
    return this.prisma.personDocument.findMany({
      where: {
        tenantId,
        OR: [
          { employeeId },
          ...(personId ? [{ personId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private mapPersonDocument(d: {
    id: string;
    docType: string;
    docNumber: string;
    issuedAt: Date | null;
    expiresAt: Date | null;
    issuer: string | null;
    note: string | null;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload =
      d.payload && typeof d.payload === 'object' && !Array.isArray(d.payload)
        ? (d.payload as Record<string, unknown>)
        : {};
    const fileNames = Array.isArray(payload.fileNames)
      ? payload.fileNames.map((x) => String(x)).filter(Boolean)
      : [];
    return {
      id: d.id,
      docType: d.docType,
      series: String(payload.series ?? ''),
      docNumber: d.docNumber,
      issuer: d.issuer ?? '',
      issuedAt: d.issuedAt,
      startsAt: payload.startsAt ? String(payload.startsAt) : null,
      expiresAt: d.expiresAt,
      note: d.note ?? '',
      isValid: payload.isValid !== false,
      fileNames,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private async syncPassportFromDoc(
    personId: string | null | undefined,
    docType: string,
    series: string,
    docNumber: string,
  ) {
    if (!personId) return;
    if (!/^PASSPORT$/i.test(docType) && !/паспорт/i.test(docType)) return;
    const passport = [series, docNumber].filter(Boolean).join(' ').trim() || docNumber;
    await this.prisma.person.update({
      where: { id: personId },
      data: { passport },
    });
  }

  async listPersonDocuments(tenantId: string, employeeId: string) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadPersonDocuments(tenantId, emp.id, emp.personId);
    return rows.map((r) => this.mapPersonDocument(r));
  }

  async createPersonDocument(
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeePersonDocDto,
  ) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const docType = String(dto.docType || '').trim();
    const docNumber = String(dto.docNumber || '').trim();
    if (!docType) throw new BadRequestException('Укажите тип документа');
    if (!docNumber) throw new BadRequestException('Укажите номер документа');
    const series = String(dto.series || '').trim();
    const startsAt = dto.startsAt ? dto.startsAt.slice(0, 10) : undefined;
    const payload: Record<string, unknown> = {
      series,
      isValid: dto.isValid !== false,
    };
    if (startsAt) payload.startsAt = startsAt;
    if (dto.fileNames?.length) payload.fileNames = dto.fileNames.map(String).filter(Boolean);

    const row = await this.prisma.personDocument.create({
      data: {
        tenantId,
        employeeId: emp.id,
        personId: emp.personId,
        docType,
        docNumber,
        issuer: String(dto.issuer || '').trim() || null,
        note: String(dto.note || '').trim() || null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt.slice(0, 10)) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt.slice(0, 10)) : null,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    await this.syncPassportFromDoc(emp.personId, docType, series, docNumber);
    return this.mapPersonDocument(row);
  }

  async updatePersonDocument(
    tenantId: string,
    employeeId: string,
    docId: string,
    dto: UpdateEmployeePersonDocDto,
  ) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.personDocument.findFirst({
      where: {
        id: docId,
        tenantId,
        OR: [{ employeeId: emp.id }, ...(emp.personId ? [{ personId: emp.personId }] : [])],
      },
    });
    if (!existing) throw new NotFoundException('Документ не найден');
    const curPayload =
      existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
        ? { ...(existing.payload as Record<string, unknown>) }
        : {};
    if (dto.series !== undefined) curPayload.series = String(dto.series).trim();
    if (dto.startsAt !== undefined) {
      if (dto.startsAt) curPayload.startsAt = dto.startsAt.slice(0, 10);
      else delete curPayload.startsAt;
    }
    if (dto.isValid !== undefined) curPayload.isValid = dto.isValid;
    if (dto.fileNames !== undefined) {
      curPayload.fileNames = dto.fileNames.map(String).filter(Boolean);
    }
    const docType = dto.docType !== undefined ? String(dto.docType).trim() : existing.docType;
    const docNumber =
      dto.docNumber !== undefined ? String(dto.docNumber).trim() : existing.docNumber;
    if (!docType) throw new BadRequestException('Укажите тип документа');
    if (!docNumber) throw new BadRequestException('Укажите номер документа');

    const row = await this.prisma.personDocument.update({
      where: { id: existing.id },
      data: {
        docType,
        docNumber,
        issuer:
          dto.issuer !== undefined
            ? String(dto.issuer).trim() || null
            : existing.issuer,
        note:
          dto.note !== undefined ? String(dto.note).trim() || null : existing.note,
        issuedAt:
          dto.issuedAt === undefined
            ? existing.issuedAt
            : dto.issuedAt
              ? new Date(dto.issuedAt.slice(0, 10))
              : null,
        expiresAt:
          dto.expiresAt === undefined
            ? existing.expiresAt
            : dto.expiresAt
              ? new Date(dto.expiresAt.slice(0, 10))
              : null,
        payload: curPayload as Prisma.InputJsonValue,
        employeeId: existing.employeeId ?? emp.id,
        personId: existing.personId ?? emp.personId,
      },
    });
    await this.syncPassportFromDoc(
      emp.personId,
      docType,
      String(curPayload.series ?? ''),
      docNumber,
    );
    return this.mapPersonDocument(row);
  }

  async deletePersonDocument(tenantId: string, employeeId: string, docId: string) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.personDocument.findFirst({
      where: {
        id: docId,
        tenantId,
        OR: [{ employeeId: emp.id }, ...(emp.personId ? [{ personId: emp.personId }] : [])],
      },
    });
    if (!existing) throw new NotFoundException('Документ не найден');
    await this.prisma.personDocument.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private mapRelative(r: {
    id: string;
    fullName: string;
    relation: string;
    birthDate: Date | null;
    phone: string | null;
    gender: string | null;
    workplace: string | null;
    dependent: boolean;
    isHidden: boolean;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      fullName: r.fullName,
      relation: r.relation,
      birthDate: r.birthDate,
      phone: r.phone,
      gender: r.gender,
      workplace: r.workplace,
      dependent: r.dependent,
      isHidden: r.isHidden,
      createdAt: r.createdAt,
    };
  }

  async listRelatives(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.prisma.employeeRelative.findMany({
      where: { tenantId, employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapRelative(r));
  }

  async createRelative(tenantId: string, employeeId: string, dto: CreateEmployeeRelativeDto) {
    await this.requireEmployee(tenantId, employeeId);
    const fullName = String(dto.fullName || '').trim();
    const relation = String(dto.relation || '').trim();
    if (!fullName) throw new BadRequestException('Укажите ФИО');
    if (!relation) throw new BadRequestException('Укажите степень родства');
    const row = await this.prisma.employeeRelative.create({
      data: {
        tenantId,
        employeeId,
        fullName,
        relation,
        gender: dto.gender?.trim() || null,
        phone: dto.phone?.trim() || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate.slice(0, 10)) : null,
        workplace: dto.workplace?.trim() || null,
        dependent: !!dto.dependent,
        isHidden: !!dto.isHidden,
      },
    });
    return this.mapRelative(row);
  }

  async updateRelative(
    tenantId: string,
    employeeId: string,
    relativeId: string,
    dto: UpdateEmployeeRelativeDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.employeeRelative.findFirst({
      where: { id: relativeId, tenantId, employeeId },
    });
    if (!existing) throw new NotFoundException('Родственник не найден');
    const row = await this.prisma.employeeRelative.update({
      where: { id: existing.id },
      data: {
        fullName: dto.fullName !== undefined ? String(dto.fullName).trim() : undefined,
        relation: dto.relation !== undefined ? String(dto.relation).trim() : undefined,
        gender: dto.gender !== undefined ? dto.gender.trim() || null : undefined,
        phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
        birthDate:
          dto.birthDate === undefined
            ? undefined
            : dto.birthDate
              ? new Date(dto.birthDate.slice(0, 10))
              : null,
        workplace: dto.workplace !== undefined ? dto.workplace.trim() || null : undefined,
        dependent: dto.dependent !== undefined ? dto.dependent : undefined,
        isHidden: dto.isHidden !== undefined ? dto.isHidden : undefined,
      },
    });
    return this.mapRelative(row);
  }

  async deleteRelative(tenantId: string, employeeId: string, relativeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.employeeRelative.deleteMany({
      where: { id: relativeId, tenantId, employeeId },
    });
    if (!n.count) throw new NotFoundException('Родственник не найден');
    return { ok: true };
  }

  async updateMaritalStatus(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeMaritalStatusDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const maritalStatus =
      dto.maritalStatus === undefined || dto.maritalStatus === null
        ? null
        : String(dto.maritalStatus).trim() || null;
    await this.upsertProfileExtras(tenantId, employeeId, { maritalStatus });
    return { ok: true, maritalStatus };
  }

  private mapCertificate(r: {
    id: string;
    certType: string;
    certNumber: string;
    certDate: Date | null;
    validFrom: Date | null;
    validUntil: Date | null;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      certType: r.certType,
      certNumber: r.certNumber,
      certDate: r.certDate,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async listCertificates(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.prisma.employeeCertificate.findMany({
      where: { tenantId, employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapCertificate(r));
  }

  async createCertificate(
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeCertificateDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const certType = String(dto.certType || '').trim();
    const certNumber = String(dto.certNumber || '').trim();
    const title = String(dto.title || '').trim();
    if (!certType) throw new BadRequestException('Укажите вид справки');
    if (!certNumber) throw new BadRequestException('Укажите номер справки');
    if (!title) throw new BadRequestException('Укажите название');
    const row = await this.prisma.employeeCertificate.create({
      data: {
        tenantId,
        employeeId,
        certType,
        certNumber,
        title,
        certDate: dto.certDate ? new Date(dto.certDate.slice(0, 10)) : null,
        validFrom: dto.validFrom ? new Date(dto.validFrom.slice(0, 10)) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil.slice(0, 10)) : null,
      },
    });
    return this.mapCertificate(row);
  }

  async updateCertificate(
    tenantId: string,
    employeeId: string,
    certificateId: string,
    dto: UpdateEmployeeCertificateDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.employeeCertificate.findFirst({
      where: { id: certificateId, tenantId, employeeId },
    });
    if (!existing) throw new NotFoundException('Справка не найдена');
    const certType =
      dto.certType !== undefined ? String(dto.certType).trim() : existing.certType;
    const certNumber =
      dto.certNumber !== undefined
        ? String(dto.certNumber).trim()
        : existing.certNumber;
    const title =
      dto.title !== undefined ? String(dto.title).trim() : existing.title;
    if (!certType) throw new BadRequestException('Укажите вид справки');
    if (!certNumber) throw new BadRequestException('Укажите номер справки');
    if (!title) throw new BadRequestException('Укажите название');
    const row = await this.prisma.employeeCertificate.update({
      where: { id: existing.id },
      data: {
        certType,
        certNumber,
        title,
        certDate:
          dto.certDate === undefined
            ? existing.certDate
            : dto.certDate
              ? new Date(dto.certDate.slice(0, 10))
              : null,
        validFrom:
          dto.validFrom === undefined
            ? existing.validFrom
            : dto.validFrom
              ? new Date(dto.validFrom.slice(0, 10))
              : null,
        validUntil:
          dto.validUntil === undefined
            ? existing.validUntil
            : dto.validUntil
              ? new Date(dto.validUntil.slice(0, 10))
              : null,
      },
    });
    return this.mapCertificate(row);
  }

  async deleteCertificate(
    tenantId: string,
    employeeId: string,
    certificateId: string,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.employeeCertificate.findFirst({
      where: { id: certificateId, tenantId, employeeId },
    });
    if (!existing) throw new NotFoundException('Справка не найдена');
    await this.prisma.employeeCertificate.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private mapTenure(r: {
    id: string;
    tenure_type: string;
    still_working: boolean;
    counted_from: Date | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      tenureType: r.tenure_type,
      stillWorking: r.still_working,
      countedFrom: r.counted_from,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapWorkplace(r: {
    id: string;
    organization: string;
    position: string;
    org_address: string | null;
    start_date: Date | null;
    end_date: Date | null;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      organization: r.organization,
      position: r.position,
      orgAddress: r.org_address,
      startDate: r.start_date,
      endDate: r.end_date,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapAward(r: {
    id: string;
    award_type: string;
    doc_title: string | null;
    doc_number: string | null;
    award_date: Date | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      awardType: r.award_type,
      docTitle: r.doc_title,
      docNumber: r.doc_number,
      awardDate: r.award_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadTenures(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenure_type: string;
          still_working: boolean;
          counted_from: Date | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, tenure_type, still_working, counted_from, created_at, updated_at
         FROM employee_tenures
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY created_at DESC LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  private async loadWorkplaces(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          organization: string;
          position: string;
          org_address: string | null;
          start_date: Date | null;
          end_date: Date | null;
          description: string | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, organization, position, org_address, start_date, end_date, description, created_at, updated_at
         FROM employee_workplaces
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY start_date DESC NULLS LAST LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  private async loadAwards(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          award_type: string;
          doc_title: string | null;
          doc_number: string | null;
          award_date: Date | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, award_type, doc_title, doc_number, award_date, created_at, updated_at
         FROM employee_awards
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY award_date DESC NULLS LAST LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  async listTenures(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadTenures(tenantId, employeeId);
    return rows.map((r) => this.mapTenure(r));
  }

  async createTenure(tenantId: string, employeeId: string, dto: CreateEmployeeTenureDto) {
    await this.requireEmployee(tenantId, employeeId);
    const tenureType = String(dto.tenureType || '').trim();
    if (!tenureType) throw new BadRequestException('Укажите вид стажа');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenure_type: string;
        still_working: boolean;
        counted_from: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_tenures (id, tenant_id, employee_id, tenure_type, still_working, counted_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::date, now(), now())
       RETURNING id, tenure_type, still_working, counted_from, created_at, updated_at`,
      tenantId,
      employeeId,
      tenureType,
      !!dto.stillWorking,
      dto.countedFrom ? dto.countedFrom.slice(0, 10) : null,
    );
    return this.mapTenure(rows[0]);
  }

  async updateTenure(
    tenantId: string,
    employeeId: string,
    tenureId: string,
    dto: UpdateEmployeeTenureDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; tenure_type: string; still_working: boolean; counted_from: Date | null }>
    >(
      `SELECT id, tenure_type, still_working, counted_from FROM employee_tenures
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      tenureId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Стаж не найден');
    const cur = existing[0];
    const tenureType =
      dto.tenureType !== undefined ? String(dto.tenureType).trim() : cur.tenure_type;
    if (!tenureType) throw new BadRequestException('Укажите вид стажа');
    const stillWorking =
      dto.stillWorking !== undefined ? !!dto.stillWorking : cur.still_working;
    const countedFrom =
      dto.countedFrom === undefined
        ? cur.counted_from
        : dto.countedFrom
          ? dto.countedFrom.slice(0, 10)
          : null;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenure_type: string;
        still_working: boolean;
        counted_from: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_tenures
       SET tenure_type = $4, still_working = $5, counted_from = $6::date, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, tenure_type, still_working, counted_from, created_at, updated_at`,
      tenureId,
      tenantId,
      employeeId,
      tenureType,
      stillWorking,
      countedFrom,
    );
    return this.mapTenure(rows[0]);
  }

  async deleteTenure(tenantId: string, employeeId: string, tenureId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_tenures WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      tenureId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Стаж не найден');
    return { ok: true };
  }

  async listWorkplaces(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadWorkplaces(tenantId, employeeId);
    return rows.map((r) => this.mapWorkplace(r));
  }

  async createWorkplace(
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeWorkplaceDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const organization = String(dto.organization || '').trim();
    const position = String(dto.position || '').trim();
    if (!organization) throw new BadRequestException('Укажите организацию');
    if (!position) throw new BadRequestException('Укажите должность');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        organization: string;
        position: string;
        org_address: string | null;
        start_date: Date | null;
        end_date: Date | null;
        description: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_workplaces (id, tenant_id, employee_id, organization, position, org_address, start_date, end_date, description, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::date, $7::date, $8, now(), now())
       RETURNING id, organization, position, org_address, start_date, end_date, description, created_at, updated_at`,
      tenantId,
      employeeId,
      organization,
      position,
      dto.orgAddress?.trim() || null,
      dto.startDate ? dto.startDate.slice(0, 10) : null,
      dto.endDate ? dto.endDate.slice(0, 10) : null,
      dto.description?.trim() || null,
    );
    return this.mapWorkplace(rows[0]);
  }

  async updateWorkplace(
    tenantId: string,
    employeeId: string,
    workplaceId: string,
    dto: UpdateEmployeeWorkplaceDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        organization: string;
        position: string;
        org_address: string | null;
        start_date: Date | null;
        end_date: Date | null;
        description: string | null;
      }>
    >(
      `SELECT id, organization, position, org_address, start_date, end_date, description
       FROM employee_workplaces
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      workplaceId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Место работы не найдено');
    const cur = existing[0];
    const organization =
      dto.organization !== undefined ? String(dto.organization).trim() : cur.organization;
    const position =
      dto.position !== undefined ? String(dto.position).trim() : cur.position;
    if (!organization) throw new BadRequestException('Укажите организацию');
    if (!position) throw new BadRequestException('Укажите должность');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        organization: string;
        position: string;
        org_address: string | null;
        start_date: Date | null;
        end_date: Date | null;
        description: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_workplaces
       SET organization = $4, position = $5, org_address = $6, start_date = $7::date, end_date = $8::date, description = $9, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, organization, position, org_address, start_date, end_date, description, created_at, updated_at`,
      workplaceId,
      tenantId,
      employeeId,
      organization,
      position,
      dto.orgAddress !== undefined ? String(dto.orgAddress).trim() || null : cur.org_address,
      dto.startDate === undefined
        ? cur.start_date
        : dto.startDate
          ? dto.startDate.slice(0, 10)
          : null,
      dto.endDate === undefined
        ? cur.end_date
        : dto.endDate
          ? dto.endDate.slice(0, 10)
          : null,
      dto.description !== undefined
        ? String(dto.description).trim() || null
        : cur.description,
    );
    return this.mapWorkplace(rows[0]);
  }

  async deleteWorkplace(tenantId: string, employeeId: string, workplaceId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_workplaces WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      workplaceId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Место работы не найдено');
    return { ok: true };
  }

  async listAwards(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadAwards(tenantId, employeeId);
    return rows.map((r) => this.mapAward(r));
  }

  async createAward(tenantId: string, employeeId: string, dto: CreateEmployeeAwardDto) {
    await this.requireEmployee(tenantId, employeeId);
    const awardType = String(dto.awardType || '').trim();
    if (!awardType) throw new BadRequestException('Укажите награду');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        award_type: string;
        doc_title: string | null;
        doc_number: string | null;
        award_date: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_awards (id, tenant_id, employee_id, award_type, doc_title, doc_number, award_date, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::date, now(), now())
       RETURNING id, award_type, doc_title, doc_number, award_date, created_at, updated_at`,
      tenantId,
      employeeId,
      awardType,
      dto.docTitle?.trim() || null,
      dto.docNumber?.trim() || null,
      dto.awardDate ? dto.awardDate.slice(0, 10) : null,
    );
    return this.mapAward(rows[0]);
  }

  async updateAward(
    tenantId: string,
    employeeId: string,
    awardId: string,
    dto: UpdateEmployeeAwardDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        award_type: string;
        doc_title: string | null;
        doc_number: string | null;
        award_date: Date | null;
      }>
    >(
      `SELECT id, award_type, doc_title, doc_number, award_date FROM employee_awards
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      awardId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Награда не найдена');
    const cur = existing[0];
    const awardType =
      dto.awardType !== undefined ? String(dto.awardType).trim() : cur.award_type;
    if (!awardType) throw new BadRequestException('Укажите награду');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        award_type: string;
        doc_title: string | null;
        doc_number: string | null;
        award_date: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_awards
       SET award_type = $4, doc_title = $5, doc_number = $6, award_date = $7::date, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, award_type, doc_title, doc_number, award_date, created_at, updated_at`,
      awardId,
      tenantId,
      employeeId,
      awardType,
      dto.docTitle !== undefined ? String(dto.docTitle).trim() || null : cur.doc_title,
      dto.docNumber !== undefined ? String(dto.docNumber).trim() || null : cur.doc_number,
      dto.awardDate === undefined
        ? cur.award_date
        : dto.awardDate
          ? dto.awardDate.slice(0, 10)
          : null,
    );
    return this.mapAward(rows[0]);
  }

  async deleteAward(tenantId: string, employeeId: string, awardId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_awards WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      awardId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Награда не найдена');
    return { ok: true };
  }

  private async refreshEmployeeFileUrl(row: {
    file_key: string | null;
    file_url: string | null;
  }) {
    if (!row.file_key || row.file_key.startsWith('data:')) {
      return row.file_url;
    }
    const url = await this.storage.getSignedGetUrl(row.file_key);
    return url || row.file_url;
  }

  private mapEmployeeFile(r: {
    id: string;
    name: string;
    note: string | null;
    file_name: string;
    file_key: string | null;
    file_url: string | null;
    content_type: string | null;
    file_size: number | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      note: r.note,
      fileName: r.file_name,
      fileKey: r.file_key,
      fileUrl: r.file_url,
      contentType: r.content_type,
      fileSize: r.file_size,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadEmployeeFiles(tenantId: string, employeeId: string) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          note: string | null;
          file_name: string;
          file_key: string | null;
          file_url: string | null;
          content_type: string | null;
          file_size: number | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, name, note, file_name, file_key, file_url, content_type, file_size, created_at, updated_at
         FROM employee_files
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY created_at DESC LIMIT 50`,
        tenantId,
        employeeId,
      );
      const out = [];
      for (const row of rows) {
        const fileUrl = await this.refreshEmployeeFileUrl(row);
        out.push({ ...row, file_url: fileUrl });
      }
      return out;
    } catch {
      return [];
    }
  }

  async listEmployeeFiles(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadEmployeeFiles(tenantId, employeeId);
    return rows.map((r) => this.mapEmployeeFile(r));
  }

  async createEmployeeFile(
    tenantId: string,
    employeeId: string,
    file: Express.Multer.File,
    body: { name?: string; note?: string },
  ) {
    await this.requireEmployee(tenantId, employeeId);
    if (!file?.buffer?.length) throw new BadRequestException('Выберите файл');
    const name = String(body.name || '').trim() || file.originalname || 'Файл';
    const note = String(body.note || '').trim() || null;
    const fileId = randomUUID();
    const safeName = (file.originalname || 'file')
      .replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_')
      .slice(0, 120);
    const key = `employee-files/${tenantId}/${employeeId}/${fileId}-${safeName}`;
    const stored = await this.storage.putObject(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        note: string | null;
        file_name: string;
        file_key: string | null;
        file_url: string | null;
        content_type: string | null;
        file_size: number | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_files (id, tenant_id, employee_id, name, note, file_name, file_key, file_url, content_type, file_size, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, now(), now())
       RETURNING id, name, note, file_name, file_key, file_url, content_type, file_size, created_at, updated_at`,
      fileId,
      tenantId,
      employeeId,
      name,
      note,
      file.originalname || safeName,
      stored.key,
      stored.url,
      file.mimetype || 'application/octet-stream',
      file.size,
    );
    return this.mapEmployeeFile(rows[0]);
  }

  async updateEmployeeFile(
    tenantId: string,
    employeeId: string,
    fileId: string,
    dto: UpdateEmployeeFileDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        note: string | null;
        file_name: string;
        file_key: string | null;
        file_url: string | null;
        content_type: string | null;
        file_size: number | null;
      }>
    >(
      `SELECT id, name, note, file_name, file_key, file_url, content_type, file_size
       FROM employee_files WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      fileId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Файл не найден');
    const cur = existing[0];
    const name = dto.name !== undefined ? String(dto.name).trim() : cur.name;
    if (!name) throw new BadRequestException('Укажите название');
    const note =
      dto.note === undefined ? cur.note : dto.note ? String(dto.note).trim() : null;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        note: string | null;
        file_name: string;
        file_key: string | null;
        file_url: string | null;
        content_type: string | null;
        file_size: number | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_files SET name = $4, note = $5, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, name, note, file_name, file_key, file_url, content_type, file_size, created_at, updated_at`,
      fileId,
      tenantId,
      employeeId,
      name,
      note,
    );
    const row = rows[0];
    const fileUrl = await this.refreshEmployeeFileUrl(row);
    return this.mapEmployeeFile({ ...row, file_url: fileUrl });
  }

  async deleteEmployeeFile(tenantId: string, employeeId: string, fileId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; file_key: string | null }>
    >(
      `SELECT id, file_key FROM employee_files
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      fileId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Файл не найден');
    if (existing[0].file_key && !existing[0].file_key.startsWith('data:')) {
      await this.storage.deleteObject(existing[0].file_key);
    }
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_files WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      fileId,
      tenantId,
      employeeId,
    );
    return { ok: true };
  }

  private mapInventory(r: {
    id: string;
    inventory_type: string;
    inventory_number: string;
    model: string;
    manufacturer: string;
    operation_at: Date | null;
    purchase_date: Date | null;
    location_name: string | null;
    user_name: string | null;
    responsible_name: string | null;
    status: string;
    note: string | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      inventoryType: r.inventory_type,
      inventoryNumber: r.inventory_number,
      model: r.model,
      manufacturer: r.manufacturer,
      operationAt: r.operation_at,
      purchaseDate: r.purchase_date,
      locationName: r.location_name,
      userName: r.user_name,
      responsibleName: r.responsible_name,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadInventory(
    tenantId: string,
    employeeId: string,
    filter?: {
      q?: string;
      userName?: string;
      responsibleName?: string;
      purchaseFrom?: string;
      purchaseTo?: string;
      status?: string;
    },
  ) {
    try {
      const where: string[] = [
        'tenant_id = $1::uuid',
        'employee_id = $2::uuid',
      ];
      const params: unknown[] = [tenantId, employeeId];
      let i = 3;
      if (filter?.q?.trim()) {
        where.push(
          `(inventory_type ILIKE $${i} OR inventory_number ILIKE $${i} OR model ILIKE $${i} OR manufacturer ILIKE $${i} OR location_name ILIKE $${i} OR user_name ILIKE $${i} OR responsible_name ILIKE $${i})`,
        );
        params.push(`%${filter.q.trim()}%`);
        i += 1;
      }
      if (filter?.userName?.trim()) {
        where.push(`user_name ILIKE $${i}`);
        params.push(`%${filter.userName.trim()}%`);
        i += 1;
      }
      if (filter?.responsibleName?.trim()) {
        where.push(`responsible_name ILIKE $${i}`);
        params.push(`%${filter.responsibleName.trim()}%`);
        i += 1;
      }
      if (filter?.purchaseFrom) {
        where.push(`purchase_date >= $${i}::date`);
        params.push(filter.purchaseFrom.slice(0, 10));
        i += 1;
      }
      if (filter?.purchaseTo) {
        where.push(`purchase_date <= $${i}::date`);
        params.push(filter.purchaseTo.slice(0, 10));
        i += 1;
      }
      if (filter?.status?.trim()) {
        where.push(`status ILIKE $${i}`);
        params.push(filter.status.trim());
        i += 1;
      }
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          inventory_type: string;
          inventory_number: string;
          model: string;
          manufacturer: string;
          operation_at: Date | null;
          purchase_date: Date | null;
          location_name: string | null;
          user_name: string | null;
          responsible_name: string | null;
          status: string;
          note: string | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, inventory_type, inventory_number, model, manufacturer, operation_at, purchase_date,
                location_name, user_name, responsible_name, status, note, created_at, updated_at
         FROM employee_inventory
         WHERE ${where.join(' AND ')}
         ORDER BY purchase_date DESC NULLS LAST, created_at DESC
         LIMIT 100`,
        ...params,
      );
    } catch {
      return [];
    }
  }

  async listInventory(
    tenantId: string,
    employeeId: string,
    filter?: {
      q?: string;
      userName?: string;
      responsibleName?: string;
      purchaseFrom?: string;
      purchaseTo?: string;
      status?: string;
    },
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadInventory(tenantId, employeeId, filter);
    return rows.map((r) => this.mapInventory(r));
  }

  async createInventory(
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeInventoryDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { firstName: true, lastName: true, middleName: true },
    });
    const inventoryType = String(dto.inventoryType || '').trim();
    if (!inventoryType) throw new BadRequestException('Укажите тип инвентаря');
    const status = String(dto.status || 'Получен').trim() || 'Получен';
    const fullName = [emp?.lastName, emp?.firstName, emp?.middleName]
      .filter(Boolean)
      .join(' ');
    const inventoryNumber =
      String(dto.inventoryNumber || '').trim() ||
      `INV-${Date.now().toString().slice(-8)}`;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        inventory_type: string;
        inventory_number: string;
        model: string;
        manufacturer: string;
        operation_at: Date | null;
        purchase_date: Date | null;
        location_name: string | null;
        user_name: string | null;
        responsible_name: string | null;
        status: string;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_inventory (
         id, tenant_id, employee_id, inventory_type, inventory_number, model, manufacturer,
         operation_at, purchase_date, location_name, user_name, responsible_name, status, note,
         created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6,
         $7::timestamptz, $8::date, $9, $10, $11, $12, $13, now(), now()
       )
       RETURNING id, inventory_type, inventory_number, model, manufacturer, operation_at, purchase_date,
                 location_name, user_name, responsible_name, status, note, created_at, updated_at`,
      tenantId,
      employeeId,
      inventoryType,
      inventoryNumber,
      String(dto.model || '').trim(),
      String(dto.manufacturer || '').trim(),
      dto.operationAt ? new Date(dto.operationAt) : new Date(),
      dto.purchaseDate ? dto.purchaseDate.slice(0, 10) : null,
      dto.locationName?.trim() || null,
      dto.userName?.trim() || fullName || null,
      dto.responsibleName?.trim() || null,
      status,
      dto.note?.trim() || null,
    );
    return this.mapInventory(rows[0]);
  }

  async updateInventory(
    tenantId: string,
    employeeId: string,
    itemId: string,
    dto: UpdateEmployeeInventoryDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        inventory_type: string;
        inventory_number: string;
        model: string;
        manufacturer: string;
        operation_at: Date | null;
        purchase_date: Date | null;
        location_name: string | null;
        user_name: string | null;
        responsible_name: string | null;
        status: string;
        note: string | null;
      }>
    >(
      `SELECT id, inventory_type, inventory_number, model, manufacturer, operation_at, purchase_date,
              location_name, user_name, responsible_name, status, note
       FROM employee_inventory
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      itemId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Инвентарь не найден');
    const cur = existing[0];
    const inventoryType =
      dto.inventoryType !== undefined
        ? String(dto.inventoryType).trim()
        : cur.inventory_type;
    if (!inventoryType) throw new BadRequestException('Укажите тип инвентаря');
    const status =
      dto.status !== undefined
        ? String(dto.status).trim() || 'Получен'
        : cur.status;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        inventory_type: string;
        inventory_number: string;
        model: string;
        manufacturer: string;
        operation_at: Date | null;
        purchase_date: Date | null;
        location_name: string | null;
        user_name: string | null;
        responsible_name: string | null;
        status: string;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_inventory SET
         inventory_type = $4,
         inventory_number = $5,
         model = $6,
         manufacturer = $7,
         operation_at = $8::timestamptz,
         purchase_date = $9::date,
         location_name = $10,
         user_name = $11,
         responsible_name = $12,
         status = $13,
         note = $14,
         updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, inventory_type, inventory_number, model, manufacturer, operation_at, purchase_date,
                 location_name, user_name, responsible_name, status, note, created_at, updated_at`,
      itemId,
      tenantId,
      employeeId,
      inventoryType,
      dto.inventoryNumber !== undefined
        ? String(dto.inventoryNumber).trim()
        : cur.inventory_number,
      dto.model !== undefined ? String(dto.model).trim() : cur.model,
      dto.manufacturer !== undefined
        ? String(dto.manufacturer).trim()
        : cur.manufacturer,
      dto.operationAt === undefined
        ? cur.operation_at
        : dto.operationAt
          ? new Date(dto.operationAt)
          : null,
      dto.purchaseDate === undefined
        ? cur.purchase_date
        : dto.purchaseDate
          ? dto.purchaseDate.slice(0, 10)
          : null,
      dto.locationName !== undefined
        ? String(dto.locationName).trim() || null
        : cur.location_name,
      dto.userName !== undefined
        ? String(dto.userName).trim() || null
        : cur.user_name,
      dto.responsibleName !== undefined
        ? String(dto.responsibleName).trim() || null
        : cur.responsible_name,
      status,
      dto.note !== undefined ? String(dto.note).trim() || null : cur.note,
    );
    return this.mapInventory(rows[0]);
  }

  async deleteInventory(tenantId: string, employeeId: string, itemId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_inventory WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      itemId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Инвентарь не найден');
    return { ok: true };
  }

  private mapCar(r: {
    id: string;
    name: string;
    plate_number: string;
    code: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      plateNumber: r.plate_number,
      code: r.code,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadCars(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          plate_number: string;
          code: string;
          is_active: boolean;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, name, plate_number, code, is_active, created_at, updated_at
         FROM employee_cars
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY created_at DESC LIMIT 50`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  async listCars(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadCars(tenantId, employeeId);
    return rows.map((r) => this.mapCar(r));
  }

  async createCar(tenantId: string, employeeId: string, dto: CreateEmployeeCarDto) {
    await this.requireEmployee(tenantId, employeeId);
    const name = String(dto.name || '').trim();
    const plateNumber = String(dto.plateNumber || '').trim();
    if (!name) throw new BadRequestException('Укажите название');
    if (!plateNumber) throw new BadRequestException('Укажите номер автомобиля');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        plate_number: string;
        code: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_cars (id, tenant_id, employee_id, name, plate_number, code, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, now(), now())
       RETURNING id, name, plate_number, code, is_active, created_at, updated_at`,
      tenantId,
      employeeId,
      name,
      plateNumber,
      String(dto.code || '').trim(),
      dto.isActive !== false,
    );
    return this.mapCar(rows[0]);
  }

  async updateCar(
    tenantId: string,
    employeeId: string,
    carId: string,
    dto: UpdateEmployeeCarDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        plate_number: string;
        code: string;
        is_active: boolean;
      }>
    >(
      `SELECT id, name, plate_number, code, is_active FROM employee_cars
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      carId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Автомобиль не найден');
    const cur = existing[0];
    const name = dto.name !== undefined ? String(dto.name).trim() : cur.name;
    const plateNumber =
      dto.plateNumber !== undefined
        ? String(dto.plateNumber).trim()
        : cur.plate_number;
    if (!name) throw new BadRequestException('Укажите название');
    if (!plateNumber) throw new BadRequestException('Укажите номер автомобиля');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        plate_number: string;
        code: string;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_cars
       SET name = $4, plate_number = $5, code = $6, is_active = $7, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, name, plate_number, code, is_active, created_at, updated_at`,
      carId,
      tenantId,
      employeeId,
      name,
      plateNumber,
      dto.code !== undefined ? String(dto.code).trim() : cur.code,
      dto.isActive !== undefined ? !!dto.isActive : cur.is_active,
    );
    return this.mapCar(rows[0]);
  }

  async deleteCar(tenantId: string, employeeId: string, carId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_cars WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      carId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Автомобиль не найден');
    return { ok: true };
  }

  async updateIdentification(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeIdentificationDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const patch: Record<string, unknown> = {};
    if (dto.pin !== undefined) {
      patch.pin = dto.pin === null ? null : String(dto.pin).trim() || null;
    }
    if (dto.pinCode !== undefined) {
      patch.pinCode =
        dto.pinCode === null ? null : String(dto.pinCode).trim() || null;
    }
    if (dto.rfidNumber !== undefined) {
      patch.rfidNumber =
        dto.rfidNumber === null ? null : String(dto.rfidNumber).trim() || null;
    }
    if (dto.fingerprints !== undefined) {
      const uniq = Array.from(
        new Set(
          (dto.fingerprints || [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9),
        ),
      ).sort((a, b) => a - b);
      patch.fingerprints = uniq;
    }
    await this.upsertProfileExtras(tenantId, employeeId, patch);
    return {
      ok: true,
      ...patch,
    };
  }

  async updateExtraInfo(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeExtraInfoDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const patch: Record<string, unknown> = {};
    if (dto.altFirstName !== undefined) {
      patch.altFirstName =
        dto.altFirstName === null ? null : String(dto.altFirstName).trim() || null;
    }
    if (dto.altLastName !== undefined) {
      patch.altLastName =
        dto.altLastName === null ? null : String(dto.altLastName).trim() || null;
    }
    if (dto.altMiddleName !== undefined) {
      patch.altMiddleName =
        dto.altMiddleName === null
          ? null
          : String(dto.altMiddleName).trim() || null;
    }
    if (dto.citizenship !== undefined) {
      patch.citizenship =
        dto.citizenship === null ? null : String(dto.citizenship).trim() || null;
    }
    if (dto.extraCode !== undefined) {
      patch.extraCode =
        dto.extraCode === null ? null : String(dto.extraCode).trim() || null;
    }
    if (dto.notKeyEmployee !== undefined) {
      patch.notKeyEmployee = !!dto.notKeyEmployee;
    }
    await this.upsertProfileExtras(tenantId, employeeId, patch);
    return { ok: true, ...patch };
  }

  async updateUserSettings(
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeUserSettingsDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const settings = this.normalizeUserSettings(dto.settings ?? {});
    // Password is accepted for UI parity; not persisted in PROFILE_EXTRAS.
    void dto.password;
    await this.upsertProfileExtras(tenantId, employeeId, { userSettings: settings });
    return { ok: true, settings };
  }

  private mapMarkBlock(r: {
    id: string;
    start_date: Date;
    end_date: Date | null;
    note: string | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async loadMarkBlocks(tenantId: string, employeeId: string) {
    try {
      return await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          start_date: Date;
          end_date: Date | null;
          note: string | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        `SELECT id, start_date, end_date, note, created_at, updated_at
         FROM employee_mark_blocks
         WHERE tenant_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY start_date ASC LIMIT 100`,
        tenantId,
        employeeId,
      );
    } catch {
      return [];
    }
  }

  async listMarkBlocks(tenantId: string, employeeId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const rows = await this.loadMarkBlocks(tenantId, employeeId);
    return rows.map((r) => this.mapMarkBlock(r));
  }

  async createMarkBlock(
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeMarkBlockDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    if (!dto.startDate) throw new BadRequestException('Укажите дату начала');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        start_date: Date;
        end_date: Date | null;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `INSERT INTO employee_mark_blocks (id, tenant_id, employee_id, start_date, end_date, note, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::date, $4::date, $5, now(), now())
       RETURNING id, start_date, end_date, note, created_at, updated_at`,
      tenantId,
      employeeId,
      dto.startDate.slice(0, 10),
      dto.endDate ? dto.endDate.slice(0, 10) : null,
      dto.note?.trim() || null,
    );
    return this.mapMarkBlock(rows[0]);
  }

  async updateMarkBlock(
    tenantId: string,
    employeeId: string,
    blockId: string,
    dto: UpdateEmployeeMarkBlockDto,
  ) {
    await this.requireEmployee(tenantId, employeeId);
    const existing = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        start_date: Date;
        end_date: Date | null;
        note: string | null;
      }>
    >(
      `SELECT id, start_date, end_date, note FROM employee_mark_blocks
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid LIMIT 1`,
      blockId,
      tenantId,
      employeeId,
    );
    if (!existing[0]) throw new NotFoundException('Период не найден');
    const cur = existing[0];
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        start_date: Date;
        end_date: Date | null;
        note: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `UPDATE employee_mark_blocks
       SET start_date = $4::date, end_date = $5::date, note = $6, updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid
       RETURNING id, start_date, end_date, note, created_at, updated_at`,
      blockId,
      tenantId,
      employeeId,
      dto.startDate !== undefined
        ? dto.startDate.slice(0, 10)
        : cur.start_date,
      dto.endDate === undefined
        ? cur.end_date
        : dto.endDate
          ? dto.endDate.slice(0, 10)
          : null,
      dto.note !== undefined ? String(dto.note).trim() || null : cur.note,
    );
    return this.mapMarkBlock(rows[0]);
  }

  async deleteMarkBlock(tenantId: string, employeeId: string, blockId: string) {
    await this.requireEmployee(tenantId, employeeId);
    const n = await this.prisma.$executeRawUnsafe(
      `DELETE FROM employee_mark_blocks WHERE id = $1::uuid AND tenant_id = $2::uuid AND employee_id = $3::uuid`,
      blockId,
      tenantId,
      employeeId,
    );
    if (!n) throw new NotFoundException('Период не найден');
    return { ok: true };
  }
}
