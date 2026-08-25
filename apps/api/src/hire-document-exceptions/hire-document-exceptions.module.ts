import { Module } from '@nestjs/common';
import { HireDocumentExceptionsController } from './hire-document-exceptions.controller';
import { HireDocumentExceptionsService } from './hire-document-exceptions.service';

@Module({
  controllers: [HireDocumentExceptionsController],
  providers: [HireDocumentExceptionsService],
  exports: [HireDocumentExceptionsService],
})
export class HireDocumentExceptionsModule {}
