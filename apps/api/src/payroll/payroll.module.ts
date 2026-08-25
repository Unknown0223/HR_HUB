import { Module } from '@nestjs/common';
import { AccrualsController } from './accruals.controller';
import { AccrualsService } from './accruals.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { AccountPairsController, SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

import { VedomostController } from './vedomost.controller';
import { VedomostService } from './vedomost.service';
import { ManualOpsController } from './manual-ops.controller';
import { ManualOpsService } from './manual-ops.service';
import { SalesAccrualsController } from './sales-accruals.controller';
import { SalesAccrualsService } from './sales-accruals.service';
import { OneTimeAccrualsController } from './one-time-accruals.controller';
import { OneTimeAccrualsService } from './one-time-accruals.service';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';
import { TravelExpensesController } from './travel-expenses.controller';
import { TravelExpensesService } from './travel-expenses.service';
import { BonusAccrualsController } from './bonus-accruals.controller';
import { BonusAccrualsService } from './bonus-accruals.service';

@Module({
  controllers: [
    PayrollController,
    AccrualsController,
    SettlementsController,
    AccountPairsController,
    VedomostController,
    ManualOpsController,
    SalesAccrualsController,
    OneTimeAccrualsController,
    LoansController,
    PaymentOrdersController,
    TravelExpensesController,
    BonusAccrualsController,
  ],
  providers: [
    PayrollService,
    AccrualsService,
    SettlementsService,
    VedomostService,
    ManualOpsService,
    SalesAccrualsService,
    OneTimeAccrualsService,
    LoansService,
    PaymentOrdersService,
    TravelExpensesService,
    BonusAccrualsService,
  ],
  exports: [
    PayrollService,
    AccrualsService,
    SettlementsService,
    VedomostService,
    ManualOpsService,
    SalesAccrualsService,
    OneTimeAccrualsService,
    LoansService,
    PaymentOrdersService,
    TravelExpensesService,
    BonusAccrualsService,
  ],
})
export class PayrollModule {}
