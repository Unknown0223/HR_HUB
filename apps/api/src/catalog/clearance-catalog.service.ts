import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClearanceItemStatus, ClearanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F7/F9: clearance sheets + templates extracted from CatalogService.
 */
@Injectable()
export class ClearanceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

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
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
        items: { orderBy: { sortOrder: 'asc' } },
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
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async createClearanceFromTemplate(
    tenantId: string,
    data: Record<string, unknown>,
  ) {
    const template = await this.prisma.clearanceTemplate.findFirst({
      where: { id: String(data.templateId), tenantId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        employees: {
          orderBy: { sortOrder: 'asc' },
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                middleName: true,
                tabNumber: true,
              },
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
      const name = [e.lastName, e.firstName, e.middleName]
        .filter(Boolean)
        .join(' ');
      itemCreates.push({
        title: name || e.tabNumber,
        department: null,
        sortOrder: sort++,
      });
    }
    if (template.requireManagerSign) {
      itemCreates.push({
        title: 'Руководитель',
        department: null,
        sortOrder: sort++,
      });
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
        status: (data.status as ClearanceStatus) || ClearanceStatus.open,
        note: data.note ? String(data.note) : undefined,
        items: { create: itemCreates },
      },
      include: this.clearanceSheetInclude(),
    });
  }

  async createClearanceTemplate(
    tenantId: string,
    body: Record<string, unknown>,
  ) {
    const divisionId = body.divisionId ? String(body.divisionId) : null;
    const positionId = body.positionId ? String(body.positionId) : null;
    const requireManagerSign = Boolean(body.requireManagerSign);
    const requireHigherManagerSign = Boolean(body.requireHigherManagerSign);
    const isActive =
      body.isActive === undefined ? true : Boolean(body.isActive);

    let name = body.name ? String(body.name).trim() : '';
    if (!name) {
      const [div, pos] = await Promise.all([
        divisionId
          ? this.prisma.division.findFirst({
              where: { id: divisionId, tenantId },
            })
          : null,
        positionId
          ? this.prisma.position.findFirst({
              where: { id: positionId, tenantId },
            })
          : null,
      ]);
      name =
        [div?.name, pos?.name].filter(Boolean).join(' / ') ||
        'Шаблон обходного листа';
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

  async updateClearanceTemplate(
    tenantId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
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
        await tx.clearanceTemplateEmployee.deleteMany({
          where: { templateId: id },
        });
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
    if (!item || item.sheet.tenantId !== tenantId) {
      throw new NotFoundException('Item not found');
    }
    return this.prisma.clearanceSheetItem.update({
      where: { id: itemId },
      data: {
        status: body.status
          ? (body.status as ClearanceItemStatus)
          : undefined,
        note: body.note,
        doneAt: body.status === 'done' ? new Date() : undefined,
      },
    });
  }
}
