import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [MeModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
