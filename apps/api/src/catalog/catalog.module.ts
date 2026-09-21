import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { IncidentsCatalogService } from './incidents-catalog.service';
import { ClearanceCatalogService } from './clearance-catalog.service';
import { GphCatalogService } from './gph-catalog.service';
import { TariffCatalogService } from './tariff-catalog.service';
import { HrChangesCatalogService } from './hr-changes-catalog.service';
import { FinanceCatalogService } from './finance-catalog.service';
import { TimesheetCatalogService } from './timesheet-catalog.service';
import { SchedulesCatalogService } from './schedules-catalog.service';
import { ReportsCatalogService } from './reports-catalog.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    IncidentsCatalogService,
    ClearanceCatalogService,
    GphCatalogService,
    TariffCatalogService,
    HrChangesCatalogService,
    FinanceCatalogService,
    TimesheetCatalogService,
    SchedulesCatalogService,
    ReportsCatalogService,
  ],
  exports: [
    CatalogService,
    IncidentsCatalogService,
    ClearanceCatalogService,
    GphCatalogService,
    TariffCatalogService,
    HrChangesCatalogService,
    FinanceCatalogService,
    TimesheetCatalogService,
    SchedulesCatalogService,
    ReportsCatalogService,
  ],
})
export class CatalogModule {}
