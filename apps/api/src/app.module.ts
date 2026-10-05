import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { runWithRequestContext } from './common/data-scope';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { OrganizationModule } from './organization/organization.module';
import { EmployeesModule } from './employees/employees.module';
import { TenantModule } from './tenant/tenant.module';
import { PersonsModule } from './persons/persons.module';
import { AttendanceModule } from './attendance/attendance.module';
import { HrModule } from './hr/hr.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PayrollModule } from './payroll/payroll.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { CatalogModule } from './catalog/catalog.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MeModule } from './me/me.module';
import { StorageModule } from './storage/storage.module';
import { MobileModule } from './mobile/mobile.module';
import { NewsModule } from './news/news.module';
import { HireDocumentExceptionsModule } from './hire-document-exceptions/hire-document-exceptions.module';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramCoreModule } from './telegram/telegram-core.module';
import { MailModule } from './mail/mail.module';
import { TrackingModule } from './tracking/tracking.module';
import { TeamModule } from './team/team.module';
import { AccessModule } from './access/access.module';
import { AdvancesModule } from './advances/advances.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    TelegramCoreModule,
    MailModule,
    HealthModule,
    // AuthModule must be imported before TenantModule: global guards run in
    // registration order, and TenantGuard needs the `req.user` that
    // JwtAuthGuard populates in order to trust the JWT tenant over the header.
    AuthModule,
    TenantModule,
    TenantsModule,
    UsersModule,
    OrganizationModule,
    EmployeesModule,
    PersonsModule,
    AttendanceModule,
    HrModule,
    DashboardModule,
    PayrollModule,
    AdvancesModule,
    ReportsModule,
    SettingsModule,
    CatalogModule,
    NotificationsModule,
    MeModule,
    StorageModule,
    MobileModule,
    NewsModule,
    HireDocumentExceptionsModule,
    TelegramModule,
    TrackingModule,
    TeamModule,
    AccessModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: unknown, _res: unknown, next: () => void) => runWithRequestContext(next))
      .forRoutes('{*splat}');
  }
}
