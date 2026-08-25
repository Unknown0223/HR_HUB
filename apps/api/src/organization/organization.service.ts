import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDivisionDto, CreatePositionDto, UpdateDivisionDto, UpdatePositionDto } from './dto';
import { buildCsvBuffer, buildExcelBuffer } from '../common/excel';
import type { ImportResult } from '../common/import.dto';

/** Verifix import template column headers (order = default column numbers 1..9). */
export const DIVISION_IMPORT_HEADERS = [
  'Название подразделения',
  'Код',
  'Родитель',
  'Группа подразделения',
  'График работы',
  'Руководитель',
  'Дата открытия',
  'Дата закрытия',
  'Проект',
] as const;

/** Excel: Должность | Роль | Группа должностей | Счет затрат | Код */
export const POSITION_IMPORT_HEADERS = [
  'Должность',
  'Роль',
  'Группа должностей',
  'Счет затрат',
  'Код',
] as const;

export type DivisionImportRow = {
  name?: string;
  code?: string;
  parent?: string;
  group?: string;
  schedule?: string;
  manager?: string;
  openedAt?: string;
  closedAt?: string;
  project?: string;
};

export type PositionImportRow = {
  name?: string;
  role?: string;
  group?: string;
  costAccount?: string;
  code?: string;
};

type OrgEmpPreview = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  positionName: string | null;
};

export type OrgTreeNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  isActive: boolean;
  employeeCount: number;
  childDivisionCount: number;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    photoUrl: string | null;
    positionName: string | null;
  } | null;
  employeesPreview: OrgEmpPreview[];
  children: OrgTreeNode[];
};

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private divisionInclude() {
    return {
      parent: { select: { id: true, code: true, name: true } },
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          position: { select: { name: true, code: true } },
          faceProfile: { select: { photoUrl: true, photoKey: true } },
        },
      },
      divisionGroup: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, code: true, name: true } },
      schedule: { select: { id: true, code: true, name: true } },
      _count: {
        select: {
          children: true,
          employees: { where: { status: 'active' as const } },
          staffPositions: true,
        },
      },
    };
  }

  listDivisions(tenantId: string, active?: 'active' | 'inactive' | 'all') {
    const where: { tenantId: string; isActive?: boolean } = { tenantId };
    if (active === 'active') where.isActive = true;
    if (active === 'inactive') where.isActive = false;
    return this.prisma.division.findMany({
      where,
      include: this.divisionInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getDivision(tenantId: string, id: string) {
    const row = await this.prisma.division.findFirst({
      where: { id, tenantId },
      include: {
        ...this.divisionInclude(),
        staffPositions: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          take: 50,
          include: {
            position: { select: { id: true, name: true, code: true } },
          },
        },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, code: true, name: true, isActive: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Division not found');
    return row;
  }

  createDivision(tenantId: string, dto: CreateDivisionDto) {
    return this.prisma.division.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        parentId: dto.parentId || null,
        managerId: dto.managerId || null,
        divisionGroupId: dto.divisionGroupId || null,
        locationId: dto.locationId || null,
        scheduleId: dto.scheduleId || null,
        sortOrder: dto.sortOrder ?? 0,
        openedAt: dto.openedAt ? new Date(dto.openedAt) : new Date(),
        closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        legalEntity: dto.legalEntity || null,
        createdByLabel: dto.createdByLabel || 'Admin',
        isActive: dto.isActive ?? true,
      },
      include: this.divisionInclude(),
    });
  }

  async updateDivision(tenantId: string, id: string, dto: UpdateDivisionDto) {
    await this.getDivision(tenantId, id);
    const data: Record<string, unknown> = {};
    const assign = (key: keyof UpdateDivisionDto, transform?: (v: unknown) => unknown) => {
      if (dto[key] !== undefined) {
        data[key] = transform ? transform(dto[key]) : dto[key];
      }
    };
    assign('code');
    assign('name');
    assign('parentId');
    assign('managerId');
    assign('divisionGroupId');
    assign('locationId');
    assign('scheduleId');
    assign('sortOrder');
    assign('legalEntity');
    assign('updatedByLabel');
    assign('isActive');
    if (dto.openedAt !== undefined) {
      data.openedAt = dto.openedAt ? new Date(dto.openedAt) : null;
    }
    if (dto.closedAt !== undefined) {
      data.closedAt = dto.closedAt ? new Date(dto.closedAt) : null;
    }
    return this.prisma.division.update({
      where: { id },
      data,
      include: this.divisionInclude(),
    });
  }

  async deleteDivision(tenantId: string, id: string) {
    const row = await this.getDivision(tenantId, id);
    if (row._count.children > 0) {
      throw new BadRequestException('Сначала удалите дочерние подразделения');
    }
    if (row._count.employees > 0) {
      throw new BadRequestException('В подразделении есть сотрудники');
    }
    await this.prisma.division.delete({ where: { id } });
    return { ok: true };
  }

  async setDivisionActive(tenantId: string, id: string, isActive: boolean) {
    await this.getDivision(tenantId, id);
    return this.prisma.division.update({
      where: { id },
      data: { isActive },
      include: this.divisionInclude(),
    });
  }

  async tree(tenantId: string): Promise<OrgTreeNode[]> {
    const all = await this.prisma.division.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', divisionId: { not: null } },
      select: {
        id: true,
        divisionId: true,
        firstName: true,
        lastName: true,
        middleName: true,
        position: { select: { name: true, code: true } },
        faceProfile: { select: { photoUrl: true, photoKey: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const empsByDiv = new Map<string, typeof employees>();
    for (const e of employees) {
      if (!e.divisionId) continue;
      const list = empsByDiv.get(e.divisionId) ?? [];
      list.push(e);
      empsByDiv.set(e.divisionId, list);
    }

    const managerIds = [
      ...new Set(all.map((d) => d.managerId).filter(Boolean) as string[]),
    ];
    const managers = managerIds.length
      ? await this.prisma.employee.findMany({
          where: { tenantId, id: { in: managerIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            position: { select: { name: true, code: true } },
            faceProfile: { select: { photoUrl: true, photoKey: true } },
          },
        })
      : [];
    const managerMap = new Map(managers.map((m) => [m.id, m]));

    type Draft = OrgTreeNode & { _rawChildren: Draft[] };
    const map = new Map<string, Draft>();
    for (const d of all) {
      const divEmps = empsByDiv.get(d.id) ?? [];
      const mgr = d.managerId ? managerMap.get(d.managerId) : undefined;
      map.set(d.id, {
        id: d.id,
        code: d.code,
        name: d.name,
        parentId: d.parentId,
        managerId: d.managerId,
        isActive: d.isActive,
        employeeCount: divEmps.length,
        childDivisionCount: 0,
        manager: mgr
          ? {
              id: mgr.id,
              firstName: mgr.firstName,
              lastName: mgr.lastName,
              middleName: mgr.middleName,
              photoUrl: this.storage.mediaUrl(
                mgr.faceProfile?.photoKey,
                mgr.faceProfile?.photoUrl,
              ),
              positionName: mgr.position?.name ?? mgr.position?.code ?? null,
            }
          : null,
        employeesPreview: divEmps.slice(0, 6).map((e) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          middleName: e.middleName,
          photoUrl: this.storage.mediaUrl(
            e.faceProfile?.photoKey,
            e.faceProfile?.photoUrl,
          ),
          positionName: e.position?.name ?? null,
        })),
        children: [],
        _rawChildren: [],
      });
    }

    const roots: Draft[] = [];
    for (const d of all) {
      const node = map.get(d.id)!;
      if (d.parentId && map.has(d.parentId)) {
        map.get(d.parentId)!._rawChildren.push(node);
      } else {
        roots.push(node);
      }
    }

    const finalize = (nodes: Draft[]): OrgTreeNode[] =>
      nodes.map((n) => {
        const children = finalize(n._rawChildren);
        return {
          id: n.id,
          code: n.code,
          name: n.name,
          parentId: n.parentId,
          managerId: n.managerId,
          isActive: n.isActive,
          employeeCount: n.employeeCount,
          childDivisionCount: children.length,
          manager: n.manager,
          employeesPreview: n.employeesPreview,
          children,
        };
      });

    return finalize(roots);
  }

  async exportTree(
    tenantId: string,
    format: 'csv' | 'xlsx' = 'xlsx',
  ) {
    const roots = await this.tree(tenantId);
    const rows: Record<string, unknown>[] = [];
    const walk = (nodes: OrgTreeNode[], parentCode: string) => {
      for (const n of nodes) {
        const mgr = n.manager
          ? [n.manager.lastName, n.manager.firstName, n.manager.middleName]
              .filter(Boolean)
              .join(' ')
          : '';
        rows.push({
          code: n.code,
          name: n.name,
          parentCode,
          manager: mgr,
          managerPosition: n.manager?.positionName ?? '',
          employeeCount: n.employeeCount,
          childDivisionCount: n.childDivisionCount,
          isActive: n.isActive ? 'active' : 'inactive',
        });
        walk(n.children, n.code);
      }
    };
    walk(roots, '');
    const columns = [
      'code',
      'name',
      'parentCode',
      'manager',
      'managerPosition',
      'employeeCount',
      'childDivisionCount',
      'isActive',
    ];
    if (format === 'csv') {
      return {
        buffer: buildCsvBuffer(columns, rows),
        filename: 'org-structure.csv',
      };
    }
    const buffer = await buildExcelBuffer({
      sheetName: 'OrgStructure',
      columns,
      rows,
    });
    return { buffer, filename: 'org-structure.xlsx' };
  }

  private positionInclude() {
    return {
      positionGroup: { select: { id: true, code: true, name: true } },
      _count: { select: { employees: true, staffPositions: true } },
    };
  }

  listPositions(tenantId: string, active?: 'active' | 'inactive' | 'all') {
    const where: { tenantId: string; isActive?: boolean } = { tenantId };
    if (active === 'active') where.isActive = true;
    if (active === 'inactive') where.isActive = false;
    return this.prisma.position.findMany({
      where,
      include: this.positionInclude(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getPosition(tenantId: string, id: string) {
    const row = await this.prisma.position.findFirst({
      where: { id, tenantId },
      include: this.positionInclude(),
    });
    if (!row) throw new NotFoundException('Position not found');
    return row;
  }

  createPosition(tenantId: string, dto: CreatePositionDto) {
    return this.prisma.position.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        positionGroupId: dto.positionGroupId || null,
        sortOrder: dto.sortOrder ?? 0,
        description: dto.description || null,
        role: dto.role || null,
        costAccount: dto.costAccount || null,
        laborClassifier: dto.laborClassifier || null,
        aliases: (dto.aliases as object) ?? undefined,
        createdByLabel: dto.createdByLabel || 'Admin',
        isActive: dto.isActive ?? true,
      },
      include: this.positionInclude(),
    });
  }

  async updatePosition(tenantId: string, id: string, dto: UpdatePositionDto) {
    await this.getPosition(tenantId, id);
    const data: Record<string, unknown> = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.positionGroupId !== undefined) data.positionGroupId = dto.positionGroupId;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.costAccount !== undefined) data.costAccount = dto.costAccount;
    if (dto.laborClassifier !== undefined) data.laborClassifier = dto.laborClassifier;
    if (dto.aliases !== undefined) data.aliases = dto.aliases;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.position.update({
      where: { id },
      data,
      include: this.positionInclude(),
    });
  }

  async deletePosition(tenantId: string, id: string) {
    const row = await this.getPosition(tenantId, id);
    if (row._count.employees > 0 || row._count.staffPositions > 0) {
      throw new BadRequestException('Должность используется сотрудниками или позициями');
    }
    await this.prisma.position.delete({ where: { id } });
    return { ok: true };
  }

  async setPositionActive(tenantId: string, id: string, isActive: boolean) {
    await this.getPosition(tenantId, id);
    return this.prisma.position.update({
      where: { id },
      data: { isActive },
      include: this.positionInclude(),
    });
  }

  async importPositionTemplateXlsx() {
    const columns = [...POSITION_IMPORT_HEADERS];
    const rows: Record<string, unknown>[] = [
      {
        Должность: 'ANALITIK',
        Роль: '',
        'Группа должностей': '',
        'Счет затрат': '',
        Код: 'ANL',
      },
    ];
    const buffer = await buildExcelBuffer({
      sheetName: 'Должности',
      columns,
      rows,
    });
    return { buffer, filename: 'import-positions-template.xlsx' };
  }

  private normalizePositionImportRow(row: Record<string, unknown>): PositionImportRow {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (row[k] != null && String(row[k]).trim()) return this.cellStr(row[k]);
      }
      return '';
    };
    return {
      name: pick('name', 'Должность', 'Название'),
      role: pick('role', 'Роль'),
      group: pick('group', 'Группа должностей', 'positionGroup'),
      costAccount: pick('costAccount', 'Счет затрат'),
      code: pick('code', 'Код'),
    };
  }

  private async resolvePositionGroupRef(
    tenantId: string,
    raw: string,
  ): Promise<string | null> {
    const q = raw.trim();
    if (!q) return null;
    const byCode = await this.prisma.positionGroup.findFirst({
      where: { tenantId, code: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byCode) return byCode.id;
    const byName = await this.prisma.positionGroup.findFirst({
      where: { tenantId, name: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    return byName?.id ?? null;
  }

  async importPositions(
    tenantId: string,
    rawRows: Record<string, unknown>[],
  ): Promise<ImportResult & { preview: PositionImportRow[] }> {
    const result: ImportResult & { preview: PositionImportRow[] } = {
      created: 0,
      skipped: 0,
      errors: [],
      preview: [],
    };

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 1;
      const norm = this.normalizePositionImportRow(rawRows[i] ?? {});
      result.preview.push(norm);

      const name = (norm.name || '').trim();
      if (!name) {
        result.errors.push({ row: rowNum, message: 'Должность (название) обязательна' });
        continue;
      }

      let code = (norm.code || '').trim();
      if (!code) code = this.slugCode(name, `POS-${rowNum}`);

      const existing = await this.prisma.position.findFirst({
        where: { tenantId, code: { equals: code, mode: 'insensitive' } },
      });
      if (existing) {
        result.skipped += 1;
        result.errors.push({
          row: rowNum,
          message: `Код «${code}» уже существует — пропущено`,
        });
        continue;
      }

      let positionGroupId: string | null = null;
      if (norm.group) {
        positionGroupId = await this.resolvePositionGroupRef(tenantId, norm.group);
        if (!positionGroupId) {
          result.errors.push({
            row: rowNum,
            message: `Группа должностей «${norm.group}» не найдена`,
          });
          continue;
        }
      }

      try {
        await this.prisma.position.create({
          data: {
            tenantId,
            code,
            name,
            positionGroupId,
            role: norm.role || null,
            costAccount: norm.costAccount || null,
            createdByLabel: 'Admin',
            isActive: true,
          },
        });
        result.created += 1;
      } catch (e) {
        result.errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'Ошибка сохранения',
        });
      }
    }

    return result;
  }

  async importTemplateXlsx() {
    const columns = [...DIVISION_IMPORT_HEADERS];
    const rows: Record<string, unknown>[] = [
      {
        'Название подразделения': 'ADMIN',
        Код: 'ADMIN',
        Родитель: 'HR',
        'Группа подразделения': '',
        'График работы': '',
        Руководитель: '',
        'Дата открытия': '15.09.2023',
        'Дата закрытия': '',
        Проект: '',
      },
    ];
    const buffer = await buildExcelBuffer({
      sheetName: 'Подразделения',
      columns,
      rows,
    });
    return { buffer, filename: 'import-divisions-template.xlsx' };
  }

  private cellStr(v: unknown): string {
    if (v == null) return '';
    if (v instanceof Date) {
      const dd = String(v.getDate()).padStart(2, '0');
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      const yyyy = v.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    return String(v).trim();
  }

  private parseImportDate(raw: string): Date | null {
    const s = raw.trim();
    if (!s) return null;
    const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const iso = new Date(s);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  private normalizeImportRow(row: Record<string, unknown>): DivisionImportRow {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (row[k] != null && String(row[k]).trim()) return this.cellStr(row[k]);
      }
      return '';
    };
    return {
      name: pick('name', 'Название подразделения', 'Название'),
      code: pick('code', 'Код'),
      parent: pick('parent', 'Родитель', 'parentCode', 'parentName'),
      group: pick(
        'group',
        'Группа подразделения',
        'Группа подразделений',
        'divisionGroup',
      ),
      schedule: pick('schedule', 'График работы', 'Режим работы'),
      manager: pick('manager', 'Руководитель'),
      openedAt: pick('openedAt', 'Дата открытия'),
      closedAt: pick('closedAt', 'Дата закрытия'),
      project: pick('project', 'Проект'),
    };
  }

  private async resolveDivisionRef(
    tenantId: string,
    raw: string,
  ): Promise<string | null> {
    const q = raw.trim();
    if (!q) return null;
    const byCode = await this.prisma.division.findFirst({
      where: { tenantId, code: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byCode) return byCode.id;
    const byName = await this.prisma.division.findFirst({
      where: { tenantId, name: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    return byName?.id ?? null;
  }

  private async resolveGroupRef(
    tenantId: string,
    raw: string,
  ): Promise<string | null> {
    const q = raw.trim();
    if (!q) return null;
    const byCode = await this.prisma.divisionGroup.findFirst({
      where: { tenantId, code: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byCode) return byCode.id;
    const byName = await this.prisma.divisionGroup.findFirst({
      where: { tenantId, name: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    return byName?.id ?? null;
  }

  private async resolveScheduleRef(
    tenantId: string,
    raw: string,
  ): Promise<string | null> {
    const q = raw.trim();
    if (!q) return null;
    const byCode = await this.prisma.workSchedule.findFirst({
      where: { tenantId, code: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byCode) return byCode.id;
    const byName = await this.prisma.workSchedule.findFirst({
      where: { tenantId, name: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    return byName?.id ?? null;
  }

  private async resolveManagerRef(
    tenantId: string,
    raw: string,
  ): Promise<string | null> {
    const q = raw.trim();
    if (!q) return null;
    const tabMatch = /\((\d+)\)\s*$/.exec(q);
    if (tabMatch) {
      const byTab = await this.prisma.employee.findFirst({
        where: { tenantId, tabNumber: tabMatch[1] },
        select: { id: true },
      });
      if (byTab) return byTab.id;
    }
    const byTabExact = await this.prisma.employee.findFirst({
      where: { tenantId, tabNumber: q },
      select: { id: true },
    });
    if (byTabExact) return byTabExact.id;

    const parts = q.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const lastName = parts[0];
      const firstName = parts[1];
      const found = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          lastName: { equals: lastName, mode: 'insensitive' },
          firstName: { equals: firstName, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (found) return found.id;
    }
    return null;
  }

  private slugCode(name: string, fallback: string): string {
    const base = name
      .toUpperCase()
      .replace(/[^A-ZА-ЯЁ0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    return base || fallback;
  }

  async importDivisions(
    tenantId: string,
    rawRows: Record<string, unknown>[],
  ): Promise<ImportResult & { preview: DivisionImportRow[] }> {
    const result: ImportResult & { preview: DivisionImportRow[] } = {
      created: 0,
      skipped: 0,
      errors: [],
      preview: [],
    };

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 1;
      const norm = this.normalizeImportRow(rawRows[i] ?? {});
      result.preview.push(norm);

      const name = (norm.name || '').trim();
      if (!name) {
        result.errors.push({ row: rowNum, message: 'Название подразделения обязательно' });
        continue;
      }

      let code = (norm.code || '').trim();
      if (!code) code = this.slugCode(name, `DIV-${rowNum}`);

      const existing = await this.prisma.division.findFirst({
        where: { tenantId, code: { equals: code, mode: 'insensitive' } },
      });
      if (existing) {
        result.skipped += 1;
        result.errors.push({
          row: rowNum,
          message: `Код «${code}» уже существует — пропущено`,
        });
        continue;
      }

      let parentId: string | null = null;
      if (norm.parent) {
        parentId = await this.resolveDivisionRef(tenantId, norm.parent);
        if (!parentId) {
          result.errors.push({
            row: rowNum,
            message: `Родитель «${norm.parent}» не найден`,
          });
          continue;
        }
      }

      let divisionGroupId: string | null = null;
      if (norm.group) {
        divisionGroupId = await this.resolveGroupRef(tenantId, norm.group);
        if (!divisionGroupId) {
          result.errors.push({
            row: rowNum,
            message: `Группа «${norm.group}» не найдена`,
          });
          continue;
        }
      }

      let scheduleId: string | null = null;
      if (norm.schedule) {
        scheduleId = await this.resolveScheduleRef(tenantId, norm.schedule);
        if (!scheduleId) {
          result.errors.push({
            row: rowNum,
            message: `График «${norm.schedule}» не найден`,
          });
          continue;
        }
      }

      let managerId: string | null = null;
      if (norm.manager) {
        managerId = await this.resolveManagerRef(tenantId, norm.manager);
        if (!managerId) {
          result.errors.push({
            row: rowNum,
            message: `Руководитель «${norm.manager}» не найден`,
          });
          continue;
        }
      }

      const openedAt = norm.openedAt
        ? this.parseImportDate(norm.openedAt)
        : new Date();
      if (norm.openedAt && !openedAt) {
        result.errors.push({
          row: rowNum,
          message: `Некорректная дата открытия «${norm.openedAt}»`,
        });
        continue;
      }
      const closedAt = norm.closedAt ? this.parseImportDate(norm.closedAt) : null;
      if (norm.closedAt && !closedAt) {
        result.errors.push({
          row: rowNum,
          message: `Некорректная дата закрытия «${norm.closedAt}»`,
        });
        continue;
      }

      try {
        await this.prisma.division.create({
          data: {
            tenantId,
            code,
            name,
            parentId,
            managerId,
            divisionGroupId,
            scheduleId,
            openedAt: openedAt ?? new Date(),
            closedAt,
            legalEntity: norm.project || null,
            createdByLabel: 'Admin',
            isActive: true,
          },
        });
        result.created += 1;
      } catch (e) {
        result.errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'Ошибка сохранения',
        });
      }
    }

    return result;
  }
}
