import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { MeModule } from '../me/me.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [MeModule, AttendanceModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
