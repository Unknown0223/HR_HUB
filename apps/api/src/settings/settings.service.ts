import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, DocumentType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDictionaryDto,
  CreateDictionaryItemDto,
  CreateIntegrationDto,
  CreateUserDto,
  UpdateOrgSettingsDto,
  UpdateSystemSettingsDto,
  UpdateUserDto,
} from './dto';
import { KNOWN_DICTIONARIES, KNOWN_INTEGRATIONS } from './known-dictionaries';
import {
  fioVariants,
  normalizePersonDocsImport,
  normFio,
  parseImportDate,
  parseYesNo,
} from './person-docs-import';
import {
  mergeSystemSettings,
  type SystemSettings,
} from './system-settings.defaults';
import {
  mergePayrollCalc,
  type PayrollCalcSettings,
} from './payroll-calc.defaults';
import {
  ACCOUNT_SETTINGS_FIELDS,
  mergeAccountSettings,
  type AccountSettings,
} from './account-settings.defaults';
import {
  mergeAccountBalanceReportSettings,
  type AccountBalanceReportSettings,
} from './account-balance-report.defaults';

type DictActor = { userId?: string; email?: string };

function actorLabel(actor?: DictActor | null) {
  return actor?.email || 'System';
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

const QUICKSTART_KEYS = [
  'organization',
  'setting',
  'division',
  'job',
  'rank',
  'position',
  'schedule',
  'location',
  'employee',
  'hiring',
] as const;

function asQuickChecked(raw: unknown): Record<string, boolean> {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { checked?: unknown }).checked
      : undefined;
  const obj =
    src && typeof src === 'object' && !Array.isArray(src)
      ? (src as Record<string, unknown>)
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

const USER_PUBLIC = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
} as const;

function authRoleFromMeta(meta: Record<string, unknown>, fallback: Role = Role.employee): Role {
  const names = Array.isArray(meta.catalogRoleNames)
    ? meta.catalogRoleNames.map((n) => String(n).toLowerCase())
    : [];
  if (names.some((n) => n === 'admin' || n.includes('admin'))) return Role.tenant_admin;
  if (names.some((n) => n.includes('hr') || n.includes('кадр') || n.includes('бухгалтер')))
    return Role.hr;
  if (names.some((n) => n.includes('руковод') || n.includes('boshliq') || n.includes('менедж')))
    return Role.manager;
  if (names.some((n) => n.includes('сотрудник'))) return Role.employee;
  return fallback;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  async getOrg(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    let settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    if (!settings) {
      settings = await this.prisma.tenantSetting.create({
        data: {
          tenantId,
          orgName: tenant.name,
          legalName: tenant.name,
        },
      });
    }
    return { tenant, settings };
  }

  async updateOrg(tenantId: string, dto: UpdateOrgSettingsDto) {
    await this.getOrg(tenantId);
    const settings = await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: {
        orgName: dto.orgName,
        legalName: dto.legalName,
        inn: dto.inn,
        address: dto.address,
        phone: dto.phone,
        timezone: dto.timezone,
        currency: dto.currency,
        locale: dto.locale,
      },
    });
    if (dto.orgName) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { name: dto.orgName },
      });
    }
    await this.audit(tenantId, null, 'org.settings.update', 'TenantSetting', settings.id);
    return this.getOrg(tenantId);
  }

  async getQuickstart(tenantId: string) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const checked = asQuickChecked(extras.quickstart);
    const auto = await this.quickstartAuto(tenantId, settings);
    const steps = QUICKSTART_KEYS.map((key) => {
      const override = checked[key];
      const done = override === true || (override !== false && auto[key]);
      return { key, auto: auto[key], done };
    });
    const doneCount = steps.filter((s) => s.done).length;
    return {
      heading: '#qs:ht:verifix',
      doneCount,
      total: QUICKSTART_KEYS.length,
      steps,
      checked,
    };
  }

  async updateQuickstart(
    tenantId: string,
    dto: { checked?: Record<string, boolean> },
    actor?: DictActor,
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const prev = asQuickChecked(extras.quickstart);
    const patch = dto.checked || {};
    const next = { ...prev };
    for (const [k, v] of Object.entries(patch)) {
      if (QUICKSTART_KEYS.includes(k as (typeof QUICKSTART_KEYS)[number])) {
        next[k] = Boolean(v);
      }
    }
    extras.quickstart = { checked: next };
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      actor?.userId || null,
      'quickstart.update',
      'TenantSetting',
      settings.id,
      { userName: actorLabel(actor) },
    );
    return this.getQuickstart(tenantId);
  }

  private async quickstartAuto(
    tenantId: string,
    settings: { orgName?: string | null; legalName?: string | null },
  ): Promise<Record<string, boolean>> {
    const [
      orgs,
      divisions,
      jobs,
      ranks,
      positions,
      schedules,
      locations,
      employees,
      hires,
    ] = await Promise.all([
      this.prisma.dictionaryItem.count({
        where: { dictionary: { tenantId, code: 'orgs' } },
      }),
      this.prisma.division.count({ where: { tenantId } }),
      this.prisma.position.count({ where: { tenantId } }),
      this.prisma.grade.count({ where: { tenantId } }),
      this.prisma.staffPosition.count({ where: { tenantId } }),
      this.prisma.workSchedule.count({ where: { tenantId } }),
      this.prisma.location.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.hrDocument.count({
        where: { tenantId, type: DocumentType.hire },
      }),
    ]);
    return {
      organization: orgs > 0 || Boolean(settings.orgName),
      setting: Boolean(settings.orgName || settings.legalName),
      division: divisions > 0,
      job: jobs > 0,
      rank: ranks > 0,
      position: positions > 0,
      schedule: schedules > 0,
      location: locations > 0,
      employee: employees > 0,
      hiring: hires > 0,
    };
  }

  private extrasOf(settings: { extras: Prisma.JsonValue | null }): Record<string, unknown> {
    const raw = settings.extras;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { ...(raw as Record<string, unknown>) };
    }
    return {};
  }

  async getSystemSettings(tenantId: string): Promise<{ system: SystemSettings }> {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    return { system: mergeSystemSettings(extras.system) };
  }

  async updateSystemSettings(
    tenantId: string,
    dto: UpdateSystemSettingsDto | Record<string, unknown>,
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const patch =
      dto && typeof dto === 'object' && 'system' in dto && dto.system
        ? (dto.system as Record<string, unknown>)
        : (dto as Record<string, unknown>);
    const existing = mergeSystemSettings(extras.system);
    const next = mergeSystemSettings({
      ...existing,
      ...patch,
      hrStaff: {
        ...existing.hrStaff,
        ...((patch.hrStaff && typeof patch.hrStaff === 'object'
          ? patch.hrStaff
          : {}) as object),
      },
      timepad: {
        ...existing.timepad,
        ...((patch.timepad && typeof patch.timepad === 'object'
          ? patch.timepad
          : {}) as object),
      },
      requiredFields: (() => {
        const pr =
          patch.requiredFields && typeof patch.requiredFields === 'object'
            ? (patch.requiredFields as Record<string, unknown>)
            : {};
        const ex = existing.requiredFields;
        const section = <K extends keyof typeof ex>(key: K) => ({
          ...ex[key],
          ...((pr[key] && typeof pr[key] === 'object' ? pr[key] : {}) as object),
        });
        return {
          employee: section('employee'),
          absenceRequest: section('absenceRequest'),
          scheduleChangeRequest: section('scheduleChangeRequest'),
          markRequest: section('markRequest'),
          individualSchedule: section('individualSchedule'),
          hiring: section('hiring'),
          sickLeave: section('sickLeave'),
          dismissal: section('dismissal'),
          dismissalRequest: section('dismissalRequest'),
          overtimeRequest: section('overtimeRequest'),
        };
      })(),
      recruitment: (() => {
        const pr =
          patch.recruitment && typeof patch.recruitment === 'object'
            ? (patch.recruitment as Record<string, unknown>)
            : {};
        const ex = existing.recruitment;
        return {
          ...ex,
          ...pr,
          internshipAccruals: Array.isArray(pr.internshipAccruals)
            ? pr.internshipAccruals
            : ex.internshipAccruals,
          internshipDeductions: Array.isArray(pr.internshipDeductions)
            ? pr.internshipDeductions
            : ex.internshipDeductions,
        };
      })(),
    });
    const cleaned = mergeSystemSettings(next);
    extras.system = cleaned as unknown as Prisma.InputJsonValue;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(tenantId, null, 'system.settings.update', 'TenantSetting', settings.id);
    return { system: cleaned };
  }

  async getPayrollCalc(tenantId: string): Promise<{ payrollCalc: PayrollCalcSettings }> {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    return { payrollCalc: mergePayrollCalc(extras.payrollCalc) };
  }

  async updatePayrollCalc(
    tenantId: string,
    dto: Record<string, unknown> | { payrollCalc?: Record<string, unknown> },
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const patch =
      dto && typeof dto === 'object' && 'payrollCalc' in dto && dto.payrollCalc
        ? (dto.payrollCalc as Record<string, unknown>)
        : (dto as Record<string, unknown>);
    const existing = mergePayrollCalc(extras.payrollCalc);
    const next = mergePayrollCalc({
      personnel: {
        ...existing.personnel,
        ...((patch.personnel && typeof patch.personnel === 'object'
          ? patch.personnel
          : {}) as object),
      },
      ndfl: {
        ...existing.ndfl,
        ...((patch.ndfl && typeof patch.ndfl === 'object' ? patch.ndfl : {}) as object),
      },
      inps: {
        ...existing.inps,
        ...((patch.inps && typeof patch.inps === 'object' ? patch.inps : {}) as object),
      },
      esp: {
        ...existing.esp,
        ...((patch.esp && typeof patch.esp === 'object' ? patch.esp : {}) as object),
      },
    });
    extras.payrollCalc = next as unknown as Prisma.InputJsonValue;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      null,
      'payroll.calc.settings.update',
      'TenantSetting',
      settings.id,
    );
    return { payrollCalc: next };
  }

  async getAccountSettings(tenantId: string): Promise<{
    accountSettings: AccountSettings;
    fields: { key: string; label: string }[];
  }> {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    return {
      accountSettings: mergeAccountSettings(extras.accountSettings),
      fields: ACCOUNT_SETTINGS_FIELDS.map(({ key, label }) => ({ key, label })),
    };
  }

  async updateAccountSettings(
    tenantId: string,
    dto: Record<string, unknown> | { accountSettings?: Record<string, unknown> },
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const patch =
      dto && typeof dto === 'object' && 'accountSettings' in dto && dto.accountSettings
        ? (dto.accountSettings as Record<string, unknown>)
        : (dto as Record<string, unknown>);
    const existing = mergeAccountSettings(extras.accountSettings);
    const next = mergeAccountSettings({ ...existing, ...patch });
    extras.accountSettings = next as unknown as Prisma.InputJsonValue;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      null,
      'account.settings.update',
      'TenantSetting',
      settings.id,
    );
    return { accountSettings: next };
  }

  async getAccountBalanceReportSettings(
    tenantId: string,
  ): Promise<{ accountBalanceReport: AccountBalanceReportSettings }> {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    return {
      accountBalanceReport: mergeAccountBalanceReportSettings(
        extras.accountBalanceReport,
      ),
    };
  }

  async updateAccountBalanceReportSettings(
    tenantId: string,
    dto:
      | Record<string, unknown>
      | { accountBalanceReport?: Record<string, unknown> },
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const patch =
      dto &&
      typeof dto === 'object' &&
      'accountBalanceReport' in dto &&
      dto.accountBalanceReport
        ? (dto.accountBalanceReport as Record<string, unknown>)
        : (dto as Record<string, unknown>);
    const next = mergeAccountBalanceReportSettings({
      ...mergeAccountBalanceReportSettings(extras.accountBalanceReport),
      ...patch,
    });
    extras.accountBalanceReport = next as unknown as Prisma.InputJsonValue;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      null,
      'report.account-balance.settings.update',
      'TenantSetting',
      settings.id,
    );
    return { accountBalanceReport: next };
  }

  listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: USER_PUBLIC,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(tenantId: string, dto: CreateUserDto, actor?: DictActor) {
    if (dto.role === Role.platform_admin) {
      throw new BadRequestException('Cannot create platform_admin in tenant');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const metaIn = asMeta(dto.meta);
    const login = String(metaIn.login || '').trim().toLowerCase();
    const email = (dto.email || (login ? `${login}@${tenant.code}.local` : ''))
      .trim()
      .toLowerCase();
    if (!email) throw new BadRequestException('Укажите email или логин');
    const now = new Date().toISOString();
    const who = actorLabel(actor);
    const meta = {
      ...metaIn,
      login: login || email.split('@')[0],
      createdAt: metaIn.createdAt || now,
      createdBy: metaIn.createdBy || who,
      updatedAt: now,
      updatedBy: who,
    };
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const role =
      dto.role ||
      authRoleFromMeta(meta, Role.employee);
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email,
          fullName: dto.fullName,
          role,
          isActive: dto.isActive !== false,
          passwordHash,
          meta: meta as Prisma.InputJsonValue,
        },
        select: USER_PUBLIC,
      });
      await this.audit(tenantId, actor?.userId || null, 'user.create', 'User', user.id, {
        email: user.email,
        role: user.role,
        userName: who,
      });
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Пользователь с таким email уже существует');
      }
      throw e;
    }
  }

  async updateUser(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    actor?: DictActor,
  ) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    if (dto.role === Role.platform_admin) {
      throw new BadRequestException('Cannot set platform_admin');
    }
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.meta !== undefined) {
      const who = actorLabel(actor);
      const now = new Date().toISOString();
      const nextMeta = {
        ...asMeta(existing.meta),
        ...asMeta(dto.meta),
        createdAt: asMeta(existing.meta).createdAt || now,
        createdBy: asMeta(existing.meta).createdBy || who,
        updatedAt: now,
        updatedBy: who,
      };
      data.meta = nextMeta as Prisma.InputJsonValue;
      if (dto.role === undefined) {
        data.role = authRoleFromMeta(nextMeta, existing.role);
      }
    }
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: USER_PUBLIC,
    });
    await this.audit(tenantId, actor?.userId || null, 'user.update', 'User', id, {
      userName: actorLabel(actor),
    });
    return user;
  }

  async deleteUser(tenantId: string, id: string, actor?: DictActor) {
    if (actor?.userId && actor.userId === id) {
      throw new BadRequestException('Нельзя удалить текущего пользователя');
    }
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.role === Role.tenant_admin) {
      const admins = await this.prisma.user.count({
        where: { tenantId, role: Role.tenant_admin, isActive: true },
      });
      if (admins <= 1 && existing.isActive) {
        throw new BadRequestException('Нельзя удалить последнего администратора');
      }
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit(tenantId, actor?.userId || null, 'user.delete', 'User', id, {
      email: existing.email,
      userName: actorLabel(actor),
    });
    return { ok: true };
  }

  async getRoleAccess(tenantId: string) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const raw = extras.roleAccess;
    const grants =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, Record<string, boolean>>)
        : {};
    return { grants };
  }

  async updateRoleAccess(
    tenantId: string,
    dto: { grants?: Record<string, Record<string, boolean>> },
    actor?: DictActor,
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const prev =
      extras.roleAccess && typeof extras.roleAccess === 'object' && !Array.isArray(extras.roleAccess)
        ? { ...(extras.roleAccess as Record<string, Record<string, boolean>>) }
        : {};
    const patch = dto.grants || {};
    const next = { ...prev };
    for (const [roleId, rows] of Object.entries(patch)) {
      next[roleId] = { ...(prev[roleId] || {}), ...(rows || {}) };
    }
    extras.roleAccess = next;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      actor?.userId || null,
      'role.access.update',
      'TenantSetting',
      settings.id,
      { userName: actorLabel(actor) },
    );
    return { grants: next };
  }

  /** Ensure mega-nav dictionaries exist (idempotent). */
  async ensureKnownDictionaries(tenantId: string) {
    for (const def of KNOWN_DICTIONARIES) {
      const dict = await this.prisma.dictionary.upsert({
        where: { tenantId_code: { tenantId, code: def.code } },
        update: { name: def.name, kind: def.kind },
        create: {
          tenantId,
          code: def.code,
          name: def.name,
          kind: def.kind,
        },
      });
      if (def.items?.length) {
        // Seed per item, not only when the dictionary is empty: otherwise items
        // added to KNOWN_DICTIONARIES later never appear in tenants that were
        // provisioned earlier, and their `meta` (car plate/VIN, CoA flags) stays null.
        const existing = await this.prisma.dictionaryItem.findMany({
          where: { dictionaryId: dict.id },
          select: { id: true, code: true, meta: true },
        });
        const byCode = new Map(existing.map((it) => [it.code, it]));

        const missing = def.items
          .map((it, i) => ({ it, i }))
          .filter(({ it }) => !byCode.has(it.code));
        if (missing.length) {
          await this.prisma.dictionaryItem.createMany({
            data: missing.map(({ it, i }) => ({
              dictionaryId: dict.id,
              code: it.code,
              name: it.name,
              sortOrder: i + 1,
              meta: (it.meta ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
            skipDuplicates: true,
          });
        }

        // Backfill meta only where absent — never clobber values edited in the UI.
        for (const it of def.items) {
          const row = byCode.get(it.code);
          if (it.meta && row && row.meta == null) {
            await this.prisma.dictionaryItem.update({
              where: { id: row.id },
              data: { meta: it.meta as Prisma.InputJsonValue },
            });
          }
        }
      }
    }
  }

  async ensureKnownIntegrations(tenantId: string) {
    for (const def of KNOWN_INTEGRATIONS) {
      const existing = await this.prisma.externalIntegration.findFirst({
        where: {
          tenantId,
          name: def.name,
        },
      });
      if (!existing) {
        await this.prisma.externalIntegration.create({
          data: {
            tenantId,
            type: def.type,
            name: def.name,
            config: {
              sys: def.sys,
              ...(def.stub ? { stub: true, note: def.note } : {}),
            },
            isActive: !def.stub,
          },
        });
      }
    }
  }

  async listDictionaries(tenantId: string, kind?: string) {
    await this.ensureKnownDictionaries(tenantId);
    return this.prisma.dictionary.findMany({
      where: {
        tenantId,
        ...(kind ? { kind } : {}),
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  createDictionary(tenantId: string, dto: CreateDictionaryDto) {
    const kind =
      dto.kind === 'extra' ? 'extra' : dto.kind === 'admin' ? 'admin' : 'core';
    return this.prisma.dictionary.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        kind,
      },
      include: { items: true },
    });
  }

  async addDictionaryItem(
    tenantId: string,
    dictionaryId: string,
    dto: CreateDictionaryItemDto,
    actor?: DictActor,
  ) {
    const dict = await this.prisma.dictionary.findFirst({
      where: { id: dictionaryId, tenantId },
    });
    if (!dict) throw new NotFoundException('Dictionary not found');
    const now = new Date().toISOString();
    const who = actorLabel(actor);
    const meta = {
      ...asMeta(dto.meta),
      createdAt: asMeta(dto.meta).createdAt || now,
      createdBy: asMeta(dto.meta).createdBy || who,
      updatedAt: now,
      updatedBy: who,
    };
    const row = await this.prisma.dictionaryItem.create({
      data: {
        dictionaryId,
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive !== false,
        meta: meta as Prisma.InputJsonValue,
      },
    });
    await this.audit(tenantId, actor?.userId || null, 'dictionary.item.create', 'DictionaryItem', row.id, {
      code: row.code,
      name: row.name,
      userName: who,
    });
    return row;
  }

  async importDictionaryItems(
    tenantId: string,
    dictionaryId: string,
    rawItems: Array<{
      code?: string;
      name?: string;
      isActive?: boolean;
      sortOrder?: number;
      meta?: Record<string, unknown>;
    }>,
    actor?: DictActor,
  ) {
    const dict = await this.prisma.dictionary.findFirst({
      where: { id: dictionaryId, tenantId },
    });
    if (!dict) throw new NotFoundException('Dictionary not found');
    const items = (rawItems || []).slice(0, 5000);
    const existing = await this.prisma.dictionaryItem.findMany({
      where: { dictionaryId },
      select: { id: true, code: true, meta: true, sortOrder: true },
    });
    const byCode = new Map(existing.map((it) => [it.code, it]));
    const now = new Date().toISOString();
    const who = actorLabel(actor);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { code: string; message: string }[] = [];
    for (const [i, it] of items.entries()) {
      const code = String(it.code || '').trim();
      const name = String(it.name || '').trim();
      if (!code || !name) {
        skipped += 1;
        errors.push({ code: code || `#${i + 1}`, message: 'Укажите код и название' });
        continue;
      }
      const prev = byCode.get(code);
      const prevMeta = prev ? asMeta(prev.meta) : {};
      const meta = {
        ...prevMeta,
        ...asMeta(it.meta),
        createdAt: typeof prevMeta.createdAt === 'string' ? prevMeta.createdAt : now,
        createdBy: typeof prevMeta.createdBy === 'string' ? prevMeta.createdBy : who,
        updatedAt: now,
        updatedBy: who,
      } as Prisma.JsonObject;
      try {
        if (prev) {
          await this.prisma.dictionaryItem.update({
            where: { id: prev.id },
            data: {
              name,
              isActive: it.isActive !== false,
              sortOrder: it.sortOrder ?? prev.sortOrder,
              meta: meta as Prisma.InputJsonValue,
            },
          });
          updated += 1;
        } else {
          const row = await this.prisma.dictionaryItem.create({
            data: {
              dictionaryId,
              code,
              name,
              sortOrder: it.sortOrder ?? existing.length + created + 1,
              isActive: it.isActive !== false,
              meta: meta as Prisma.InputJsonValue,
            },
          });
          byCode.set(code, {
            id: row.id,
            code,
            meta: meta as Prisma.JsonValue,
            sortOrder: row.sortOrder,
          });
          created += 1;
        }
      } catch (e) {
        skipped += 1;
        errors.push({
          code,
          message: e instanceof Error ? e.message : 'Ошибка записи',
        });
      }
    }
    await this.audit(
      tenantId,
      actor?.userId || null,
      'dictionary.item.import',
      'Dictionary',
      dictionaryId,
      { created, updated, skipped, userName: who },
    );
    return { created, updated, skipped, errors: errors.slice(0, 50) };
  }

  async updateDictionaryItem(
    tenantId: string,
    dictionaryId: string,
    itemId: string,
    dto: Partial<CreateDictionaryItemDto> & { isActive?: boolean },
    actor?: DictActor,
  ) {
    const dict = await this.prisma.dictionary.findFirst({
      where: { id: dictionaryId, tenantId },
    });
    if (!dict) throw new NotFoundException('Dictionary not found');
    const item = await this.prisma.dictionaryItem.findFirst({
      where: { id: itemId, dictionaryId },
    });
    if (!item) throw new NotFoundException('Item not found');
    const now = new Date().toISOString();
    const who = actorLabel(actor);
    const nextMeta =
      dto.meta !== undefined
        ? {
            ...asMeta(item.meta),
            ...asMeta(dto.meta),
            createdAt: asMeta(item.meta).createdAt || now,
            createdBy: asMeta(item.meta).createdBy || who,
            updatedAt: now,
            updatedBy: who,
          }
        : undefined;
    const row = await this.prisma.dictionaryItem.update({
      where: { id: itemId },
      data: {
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        ...(nextMeta !== undefined
          ? { meta: nextMeta as Prisma.InputJsonValue }
          : {}),
      },
    });
    await this.audit(tenantId, actor?.userId || null, 'dictionary.item.update', 'DictionaryItem', row.id, {
      code: row.code,
      name: row.name,
      userName: who,
    });
    return row;
  }

  async deleteDictionaryItem(
    tenantId: string,
    dictionaryId: string,
    itemId: string,
    actor?: DictActor,
  ) {
    const dict = await this.prisma.dictionary.findFirst({
      where: { id: dictionaryId, tenantId },
    });
    if (!dict) throw new NotFoundException('Dictionary not found');
    const item = await this.prisma.dictionaryItem.findFirst({
      where: { id: itemId, dictionaryId },
    });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.dictionaryItem.delete({ where: { id: itemId } });
    await this.audit(
      tenantId,
      actor?.userId || null,
      'dictionary.item.delete',
      'DictionaryItem',
      itemId,
      {
        code: item.code,
        name: item.name,
        userName: actorLabel(actor),
      },
    );
    return { ok: true };
  }

  async listIntegrations(tenantId: string) {
    await this.ensureKnownIntegrations(tenantId);
    return this.prisma.externalIntegration.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createIntegration(tenantId: string, dto: CreateIntegrationDto) {
    return this.prisma.externalIntegration.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        webhookUrl: dto.webhookUrl,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async toggleIntegration(tenantId: string, id: string, isActive: boolean) {
    return this.updateIntegration(tenantId, id, { isActive });
  }

  async updateIntegration(
    tenantId: string,
    id: string,
    dto: {
      isActive?: boolean;
      webhookUrl?: string | null;
      config?: Record<string, unknown>;
    },
  ) {
    const row = await this.prisma.externalIntegration.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Integration not found');
    const nextConfig =
      dto.config !== undefined
        ? {
            ...asMeta(row.config),
            ...asMeta(dto.config),
          }
        : undefined;
    return this.prisma.externalIntegration.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined
          ? {
              isActive: dto.isActive,
              lastSyncAt: dto.isActive ? new Date() : row.lastSyncAt,
            }
          : {}),
        ...(dto.webhookUrl !== undefined ? { webhookUrl: dto.webhookUrl } : {}),
        ...(nextConfig !== undefined
          ? { config: nextConfig as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async syncIntegration(tenantId: string, id: string) {
    const row = await this.prisma.externalIntegration.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Integration not found');
    const cfg =
      row.config && typeof row.config === 'object'
        ? (row.config as Record<string, unknown>)
        : {};
    if (cfg.stub === true) {
      await this.audit(
        tenantId,
        null,
        'integration.sync.stub',
        'ExternalIntegration',
        row.id,
        { note: cfg.note ?? 'External live API not connected' },
      );
      return {
        ok: false,
        stub: true,
        message:
          typeof cfg.note === 'string'
            ? cfg.note
            : 'Интеграция-заглушка: живой внешний API не подключён',
        lastSyncAt: row.lastSyncAt,
      };
    }
    if (!row.isActive) {
      throw new BadRequestException('Integration is inactive');
    }

    let webhookStatus: 'skipped' | 'ok' | 'failed' = 'skipped';
    let webhookDetail: string | undefined;

    if (row.webhookUrl) {
      try {
        const res = await fetch(row.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'hrhub.integration.sync',
            tenantId,
            integrationId: row.id,
            type: row.type,
            name: row.name,
            at: new Date().toISOString(),
          }),
        });
        webhookStatus = res.ok ? 'ok' : 'failed';
        webhookDetail = `HTTP ${res.status}`;
      } catch (e) {
        webhookStatus = 'failed';
        webhookDetail = e instanceof Error ? e.message : 'fetch failed';
      }
    }

    const updated = await this.prisma.externalIntegration.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
    await this.audit(tenantId, null, 'integration.sync', 'ExternalIntegration', id, {
      webhookStatus,
      webhookDetail,
    });
    return { ok: true, webhookStatus, webhookDetail, lastSyncAt: updated.lastSyncAt };
  }

  /**
   * Настройки маппинга Excel → персональные документы (Verifix 1:1).
   */
  async getPersonDocsImport(tenantId: string) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    return normalizePersonDocsImport(extras.personDocsImport);
  }

  async updatePersonDocsImport(
    tenantId: string,
    dto: { startRow?: number; personKey?: string; fields?: string[] },
    actor?: DictActor,
  ) {
    const { settings } = await this.getOrg(tenantId);
    const extras = this.extrasOf(settings);
    const prev = normalizePersonDocsImport(extras.personDocsImport);
    const next = normalizePersonDocsImport({
      ...prev,
      ...(dto.startRow != null ? { startRow: dto.startRow } : {}),
      ...(dto.personKey != null ? { personKey: dto.personKey } : {}),
      ...(dto.fields ? { fields: dto.fields } : {}),
    });
    extras.personDocsImport = next;
    await this.prisma.tenantSetting.update({
      where: { tenantId },
      data: { extras: extras as Prisma.InputJsonValue },
    });
    await this.audit(
      tenantId,
      actor?.userId || null,
      'person_docs_import.settings',
      'TenantSetting',
      settings.id,
      { userName: actorLabel(actor) },
    );
    return next;
  }

  /**
   * Импорт персональных документов → PersonDocument journal.
   */
  async importPersonDocuments(
    tenantId: string,
    dto: {
      content?: string;
      format?: string;
      items?: Array<Record<string, string>>;
      personKey?: string;
    },
  ) {
    const saved = await this.getPersonDocsImport(tenantId);
    const personKey = dto.personKey === 'code' || dto.personKey === 'fio' ? dto.personKey : saved.personKey;
    const items = dto.items?.length
      ? dto.items
      : this.parsePersonDocsCsv(dto.content || '', dto.format);
    if (!items.length) throw new BadRequestException('Пустой файл импорта');
    if (items.length > 5000) throw new BadRequestException('Максимум 5000 строк');

    const [persons, employees, dict] = await Promise.all([
      this.prisma.person.findMany({
        where: { tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          code: true,
          pinfl: true,
        },
      }),
      this.prisma.employee.findMany({
        where: { tenantId },
        select: {
          id: true,
          personId: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          externalId: true,
        },
      }),
      this.prisma.dictionary.findFirst({
        where: { tenantId, code: 'doc_types' },
        include: { items: { select: { code: true, name: true } } },
      }),
    ]);

    const created: { id: string; docNumber: string }[] = [];
    const updated: { id: string; docNumber: string }[] = [];
    const errors: { line: number; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const line = i + 1;
      const row = items[i] || {};
      const personKeyVal = String(row.person || row.tabNumber || row.empKey || '').trim();
      const docTypeRaw = String(row.docType || row.type || '').trim();
      const docNumber = String(row.number || row.docNumber || '').trim();
      if (!personKeyVal || !docTypeRaw || !docNumber) {
        errors.push({ line, error: 'Нужны физическое лицо, тип и номер документа' });
        continue;
      }

      const hit = this.resolvePersonDocSubject(
        personKeyVal,
        personKey,
        persons,
        employees,
      );
      if (!hit) {
        errors.push({ line, error: `Физлицо не найдено: ${personKeyVal}` });
        continue;
      }

      const docType = this.resolveDocTypeCode(docTypeRaw, dict?.items || []);
      const issuedAt = parseImportDate(String(row.issuedAt || ''));
      const expiresAt = parseImportDate(String(row.expiresAt || ''));
      const startsAt = parseImportDate(String(row.startsAt || ''));
      const isValid = parseYesNo(String(row.isValid || ''));
      const payload: Record<string, unknown> = {
        source: 'import',
        line,
      };
      if (row.series) payload.series = String(row.series).trim();
      if (row.status) payload.status = String(row.status).trim();
      if (startsAt) payload.startsAt = startsAt.toISOString().slice(0, 10);
      if (isValid != null) payload.isValid = isValid;

      const existing = await this.prisma.personDocument.findFirst({
        where: {
          tenantId,
          docType,
          docNumber,
          ...(hit.personId ? { personId: hit.personId } : { employeeId: hit.employeeId }),
        },
      });
      const data = {
        personId: hit.personId,
        employeeId: hit.employeeId,
        docType,
        docNumber,
        issuedAt,
        expiresAt,
        issuer: String(row.issuer || '').trim() || undefined,
        note: String(row.note || '').trim() || undefined,
        payload: payload as Prisma.InputJsonValue,
      };
      const savedRow = existing
        ? await this.prisma.personDocument.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.personDocument.create({
            data: { tenantId, ...data },
          });
      (existing ? updated : created).push({ id: savedRow.id, docNumber: savedRow.docNumber });

      if (
        (docType === 'PASSPORT' || /паспорт|passport/i.test(docTypeRaw)) &&
        hit.personId
      ) {
        await this.prisma.person.update({
          where: { id: hit.personId },
          data: { passport: docNumber },
        });
      }
    }

    await this.audit(tenantId, null, 'person_docs.import', 'PersonDocument', null, {
      created: created.length,
      updated: updated.length,
      errors: errors.length,
    });

    return {
      ok: true,
      created: created.length,
      updated: updated.length,
      errors,
      items: [...created, ...updated],
    };
  }

  private parsePersonDocsCsv(content: string, format?: string): Array<Record<string, string>> {
    if (!content.trim()) return [];
    const sep =
      format === 'tsv' ? '\t' : format === 'csv' ? ',' : content.includes('\t') ? '\t' : ';';
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const headerGuess = lines[0].toLowerCase();
    const start = /tab|таб|код|code|тип|type|номер|number|физ|person|doc/.test(headerGuess) ? 1 : 0;
    const out: Array<Record<string, string>> = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      out.push({
        person: cols[0] || '',
        docType: cols[1] || '',
        number: cols[2] || '',
        issuedAt: cols[3] || '',
        issuer: cols[4] || '',
      });
    }
    return out;
  }

  private resolveDocTypeCode(
    raw: string,
    items: { code: string; name: string }[],
  ): string {
    const n = raw.trim().toLowerCase();
    const hit = items.find(
      (i) =>
        i.code.toLowerCase() === n ||
        i.name.toLowerCase() === n ||
        n.includes(i.name.toLowerCase()) ||
        n.includes(i.code.toLowerCase()),
    );
    if (hit) return hit.code;
    if (n.includes('паспорт') || n.includes('passport')) return 'PASSPORT';
    return raw.trim();
  }

  private resolvePersonDocSubject(
    key: string,
    personKey: 'fio' | 'code',
    persons: {
      id: string;
      firstName: string;
      lastName: string;
      middleName: string | null;
      code: string | null;
      pinfl: string | null;
    }[],
    employees: {
      id: string;
      personId: string | null;
      firstName: string;
      lastName: string;
      middleName: string | null;
      tabNumber: string;
      externalId: string | null;
    }[],
  ): { personId: string | null; employeeId: string | null } | null {
    if (personKey === 'code') {
      const k = key.trim().toLowerCase();
      const person = persons.find(
        (p) =>
          (p.code && p.code.toLowerCase() === k) ||
          (p.pinfl && p.pinfl.toLowerCase() === k),
      );
      if (person) {
        const emp = employees.find((e) => e.personId === person.id);
        return { personId: person.id, employeeId: emp?.id || null };
      }
      const emp = employees.find(
        (e) =>
          e.tabNumber.toLowerCase() === k ||
          (e.externalId && e.externalId.toLowerCase() === k),
      );
      return emp ? { personId: emp.personId, employeeId: emp.id } : null;
    }

    const n = normFio(key);
    const person = persons.find((p) => fioVariants(p.lastName, p.firstName, p.middleName).includes(n));
    if (person) {
      const emp = employees.find((e) => e.personId === person.id);
      return { personId: person.id, employeeId: emp?.id || null };
    }
    const emp = employees.find((e) =>
      fioVariants(e.lastName, e.firstName, e.middleName).includes(n),
    );
    return emp ? { personId: emp.personId, employeeId: emp.id } : null;
  }

  listPersonDocuments(tenantId: string, limit = 100) {
    return this.prisma.personDocument.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        employee: {
          select: { id: true, tabNumber: true, firstName: true, lastName: true },
        },
        person: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  listAudit(
    tenantId: string,
    q?: { entity?: string; entityId?: string; from?: string; to?: string },
  ) {
    const from =
      q?.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)
        ? new Date(`${q.from}T00:00:00.000`)
        : undefined;
    const to =
      q?.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)
        ? new Date(`${q.to}T23:59:59.999`)
        : undefined;
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(q?.entity ? { entity: q.entity } : {}),
        ...(q?.entityId ? { entityId: q.entityId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async fetchCbuRates(date?: string) {
    const day =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().slice(0, 10);
    const urls = [
      `https://cbu.uz/ru/arkhiv-kursov-valyut/json/${day}/`,
      'https://cbu.uz/ru/arkhiv-kursov-valyut/json/',
    ];
    let last = 'ЦБ Узбекистана недоступен';
    for (const url of urls) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8000);
        const res = await fetch(url, { signal: ac.signal });
        clearTimeout(timer);
        if (!res.ok) {
          last = `ЦБ Узбекистана: HTTP ${res.status}`;
          continue;
        }
        const json = (await res.json()) as unknown;
        const list = Array.isArray(json) ? json : [];
        const rates = list
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const o = row as Record<string, unknown>;
            const code = String(o.Code || o.code || '').trim();
            const ccy = String(o.Ccy || o.ccy || '').trim();
            const raw = String(o.Rate || o.rate || '')
              .replace(/\s/g, '')
              .replace(',', '.');
            const rate = Number(raw);
            if (!code && !ccy) return null;
            if (!Number.isFinite(rate)) return null;
            return { code, ccy, rate, name: String(o.CcyNm_RU || o.name || ccy) };
          })
          .filter((x): x is { code: string; ccy: string; rate: number; name: string } => !!x);
        if (rates.length) return { date: day, base: 'UZS', rates };
        last = 'ЦБ Узбекистана: пустой ответ';
      } catch (e) {
        last = e instanceof Error ? e.message : 'ЦБ Узбекистана недоступен';
      }
    }
    throw new BadRequestException(last);
  }

  private audit(
    tenantId: string | null,
    userId: string | null,
    action: string,
    entity?: string,
    entityId?: string | null,
    meta?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: tenantId ?? undefined,
        userId: userId ?? undefined,
        action,
        entity,
        entityId: entityId ?? undefined,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
