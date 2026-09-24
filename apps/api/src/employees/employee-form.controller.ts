import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SkipTenant } from '../tenant/decorators';
import { EmployeesService } from './employees.service';
import { EmployeeFormIngestDto } from './employee-form.dto';
import { EmployeeFormIngestGuard } from './employee-form-ingest.guard';

/**
 * Public ingest for Google Form (Apps Script onSubmit).
 * Auth: X-Employee-Form-Key = EMPLOYEE_FORM_INGEST_KEY
 */
@ApiTags('employees-form')
@Controller('employee-form')
export class EmployeeFormController {
  constructor(private readonly employees: EmployeesService) {}

  /** Field map for building / verifying the Google Form. */
  @Public()
  @SkipTenant()
  @Get('schema')
  schema() {
    return this.employees.googleFormSchema();
  }

  @Public()
  @SkipTenant()
  @UseGuards(EmployeeFormIngestGuard)
  @ApiSecurity('employee-form-key')
  @ApiHeader({
    name: 'X-Employee-Form-Key',
    required: true,
    description: 'EMPLOYEE_FORM_INGEST_KEY',
  })
  @ApiBody({ type: EmployeeFormIngestDto })
  @Post('ingest')
  ingest(@Body() dto: EmployeeFormIngestDto) {
    return this.employees.ingestFromGoogleForm(dto);
  }

  /** Attach face/passport photos to an existing employee (DriveApp / re-sync). */
  @Public()
  @SkipTenant()
  @UseGuards(EmployeeFormIngestGuard)
  @ApiSecurity('employee-form-key')
  @ApiHeader({
    name: 'X-Employee-Form-Key',
    required: true,
    description: 'EMPLOYEE_FORM_INGEST_KEY',
  })
  @ApiBody({ type: EmployeeFormIngestDto })
  @Post('attach-photos')
  attachPhotos(@Body() dto: EmployeeFormIngestDto) {
    return this.employees.attachFormPhotos(dto);
  }
}
