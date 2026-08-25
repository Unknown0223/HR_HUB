import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HireDocumentExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  list(tenantId: string, q?: string) {
    const qq = (q || '').trim();
    return this.prisma.hireDocumentException.findMany({
      where: {
        tenantId,
        ...(qq
          ? {
              OR: [
                {
                  division: {
                    name: { contains: qq, mode: 'insensitive' },
                  },
                },
                {
                  position: {
                    name: { contains: qq, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        division: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const row = await this.prisma.hireDocumentException.findFirst({
      where: { id, tenantId },
      include: {
        division: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Exception not found');
    return row;
  }

  async create(
    tenantId: string,
    dto: {
      divisionId: string;
      positionId: string;
      documentTypeIds?: string[];
    },
  ) {
    if (!dto.divisionId || !dto.positionId) {
      throw new BadRequestException('Подразделение и должность обязательны');
    }
    const [div, pos] = await Promise.all([
      this.prisma.division.findFirst({
        where: { id: dto.divisionId, tenantId },
      }),
      this.prisma.position.findFirst({
        where: { id: dto.positionId, tenantId },
      }),
    ]);
    if (!div) throw new BadRequestException('Подразделение не найдено');
    if (!pos) throw new BadRequestException('Должность не найдена');

    return this.prisma.hireDocumentException.create({
      data: {
        tenantId,
        divisionId: dto.divisionId,
        positionId: dto.positionId,
        documentTypeIds: dto.documentTypeIds || [],
      },
      include: {
        division: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: {
      divisionId?: string;
      positionId?: string;
      documentTypeIds?: string[];
    },
  ) {
    await this.findOne(tenantId, id);
    return this.prisma.hireDocumentException.update({
      where: { id },
      data: {
        ...(dto.divisionId ? { divisionId: dto.divisionId } : {}),
        ...(dto.positionId ? { positionId: dto.positionId } : {}),
        ...(dto.documentTypeIds !== undefined
          ? { documentTypeIds: dto.documentTypeIds }
          : {}),
      },
      include: {
        division: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.hireDocumentException.delete({ where: { id } });
    return { ok: true };
  }
}
