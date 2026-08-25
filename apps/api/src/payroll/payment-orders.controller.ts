import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CreatePaymentOrderDto, UpdatePaymentOrderDto } from './payment-orders.dto';
import { PaymentOrdersService } from './payment-orders.service';
import { BulkIdsDto, bulkRun } from './bulk-ids.dto';

@ApiTags('payroll-payment-orders')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('payroll/payment-orders')
export class PaymentOrdersController {
  constructor(private readonly orders: PaymentOrdersService) {}

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get()
  list(@CurrentTenant() tenantId: string | null) {
    return this.orders.list(this.orders.requireTenant(tenantId));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-send')
  bulkSend(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.orders.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.orders.send(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-pay')
  bulkPay(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.orders.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.orders.pay(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string | null, @Body() dto: BulkIdsDto) {
    const tid = this.orders.requireTenant(tenantId);
    return bulkRun(dto.ids, (id) => this.orders.remove(tid, id));
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post()
  create(@CurrentTenant() tenantId: string | null, @Body() dto: CreatePaymentOrderDto) {
    return this.orders.create(this.orders.requireTenant(tenantId), dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr, Role.manager)
  @Get(':id')
  get(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.orders.get(this.orders.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentOrderDto,
  ) {
    return this.orders.update(this.orders.requireTenant(tenantId), id, dto);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.orders.remove(this.orders.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/send')
  send(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.orders.send(this.orders.requireTenant(tenantId), id);
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post(':id/pay')
  pay(@CurrentTenant() tenantId: string | null, @Param('id') id: string) {
    return this.orders.pay(this.orders.requireTenant(tenantId), id);
  }
}
