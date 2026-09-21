import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F8: GPH contract lifecycle extracted from CatalogService.
 */
@Injectable()
export class GphCatalogService {
  constructor(private readonly prisma: PrismaService) {}

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
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
          division: { select: { id: true, name: true, code: true } },
        },
      },
      division: { select: { id: true, name: true, code: true } },
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
        },
      },
      services: true,
    };
  }

  async activateGphContract(tenantId: string, id: string) {
    const row = await this.prisma.gphContract.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('GPH contract not found');
    if (row.isActive) {
      throw new BadRequestException('GPH contract already active');
    }
    return this.prisma.gphContract.update({
      where: { id },
      data: {
        isActive: true,
        status: row.status === 'cancelled' ? 'draft' : row.status,
      },
      include: this.gphInclude(),
    });
  }

  async closeGphContract(tenantId: string, id: string) {
    const row = await this.prisma.gphContract.findFirst({
      where: { id, tenantId },
    });
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
    const row = await this.prisma.gphContract.findFirst({
      where: { id, tenantId },
    });
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
    const row = await this.prisma.gphContract.findFirst({
      where: { id, tenantId },
    });
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
}
