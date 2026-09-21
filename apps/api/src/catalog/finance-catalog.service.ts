import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentLifecycle, PayrollLineType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F9: settlements / sales accruals / payment orders extracted from CatalogService.
 */
@Injectable()
export class FinanceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async postSettlement(tenantId: string, id: string) {
    const row = await this.prisma.settlement.findFirst({
      where: { id, tenantId },
    });
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
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
        accountPair: true,
      },
    });
  }

  async closeSettlement(tenantId: string, id: string) {
    const row = await this.prisma.settlement.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Settlement not found');
    if (row.status === 'closed') {
      throw new BadRequestException('Settlement already closed');
    }
    if (row.status === 'open') {
      throw new BadRequestException(
        'Settlement must be matched before closing',
      );
    }
    return this.prisma.settlement.update({
      where: { id },
      data: { status: 'closed', settledAt: new Date() },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            tabNumber: true,
          },
        },
        accountPair: true,
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

    const year = row.periodFrom.getUTCFullYear();
    const month = row.periodFrom.getUTCMonth() + 1;

    let period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId, year, month },
    });
    if (!period) {
      period = await this.prisma.payrollPeriod.create({
        data: {
          tenantId,
          year,
          month,
          note: 'Auto-created from sales accrual',
        },
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

  async sendPaymentOrder(tenantId: string, id: string) {
    const row = await this.prisma.paymentOrder.findFirst({
      where: { id, tenantId },
    });
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

  async payPaymentOrder(tenantId: string, id: string) {
    const row = await this.prisma.paymentOrder.findFirst({
      where: { id, tenantId },
    });
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
