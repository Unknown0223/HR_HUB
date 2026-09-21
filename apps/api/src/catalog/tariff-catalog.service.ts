import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F8: tariff group approval lifecycle extracted from CatalogService.
 */
@Injectable()
export class TariffCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTariffGroupApproved(tenantId: string, tariffGroupId: string) {
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

  async approveTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    const row = await this.prisma.tariffGroupApproval.findFirst({
      where: { id, tenantId },
      include: { tariffGroup: true },
    });
    if (!row) throw new NotFoundException('Tariff approval not found');
    if (row.status === ApprovalStatus.approved) {
      throw new BadRequestException('Tariff approval already approved');
    }
    if (row.status === ApprovalStatus.rejected) {
      throw new BadRequestException(
        'Rejected tariff approval cannot be approved',
      );
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
  async postTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    return this.approveTariffApproval(tenantId, id, reviewedBy);
  }

  async bulkPostTariffApprovals(
    tenantId: string,
    ids: string[],
    reviewedBy?: string,
  ) {
    if (!ids?.length) throw new BadRequestException('Выберите утверждения');
    const result = {
      posted: 0,
      skipped: 0,
      errors: [] as { id: string; message: string }[],
    };
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
      where: {
        tenantId,
        id: { in: ids },
        status: ApprovalStatus.approved,
      },
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

  async rejectTariffApproval(
    tenantId: string,
    id: string,
    reviewedBy?: string,
  ) {
    const row = await this.prisma.tariffGroupApproval.findFirst({
      where: { id, tenantId },
      include: { tariffGroup: true },
    });
    if (!row) throw new NotFoundException('Tariff approval not found');
    if (row.status === ApprovalStatus.approved) {
      throw new BadRequestException(
        'Approved tariff approval cannot be rejected',
      );
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
}
