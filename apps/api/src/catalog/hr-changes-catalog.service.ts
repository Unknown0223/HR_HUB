import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * F9: employee name / wage change lifecycle extracted from CatalogService.
 */
@Injectable()
export class HrChangesCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

    return this.prisma.employeeNameChange
      .update({
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
            },
          },
        },
      })
      .then(async (result) => {
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

  async cancelNameChange(
    tenantId: string,
    id: string,
    cancelledBy?: string,
  ) {
    const row = await this.prisma.employeeNameChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Name change not found');
    if (row.status === 'posted') {
      throw new BadRequestException(
        'Posted name change must be reversed via HR document unpost',
      );
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
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
      },
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

  async cancelWageChange(
    tenantId: string,
    id: string,
    cancelledBy?: string,
  ) {
    const row = await this.prisma.wageChange.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Wage change not found');
    if (row.status === 'posted') {
      throw new BadRequestException(
        'Posted wage change must be reversed via HR document unpost',
      );
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
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
      },
    });
  }
}
